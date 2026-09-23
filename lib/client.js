"use strict";

const { CookieJar } = require("tough-cookie");
const BASE = "https://catalogplus.libraryweb.org";
const HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  "X-Requested-With": "XMLHttpRequest",
  "Ls2pac-config-name": "default",
  "Ls2pac-config-type": "pac"
};
class CatalogError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const text = value => typeof value === "string" ? value.slice(0, 1000) : "";
function normalizeLoan(loan) {
  if (!loan || typeof loan !== "object") throw new CatalogError("RESPONSE");
  const date = loan.dueDate == null || loan.dueDate === "" ? NaN : Number(loan.dueDate);
  return {
    itemId: text(String(loan.itemId ?? "")),
    title: text(loan.resource?.shortTitle) || "Untitled item",
    author: text(loan.resource?.shortAuthor),
    coverUrl: text(loan.resource?.coverUrl),
    // Keep identifiers as strings so a leading zero survives.
    upc: [loan.resource?.upc, loan.upc].flat().find(value => typeof value === "string" && /^\d{8,14}$/.test(value)) || "",
    format: text(loan.resource?.format),
    transactionBranch: text(loan.transactionBranch),
    dueDate: Number.isFinite(date) && !Number.isNaN(new Date(date).getTime()) ? date : null,
    dueDateString: text(loan.dueDateString)
  };
}

class CatalogClient {
  constructor(account, { fetchImpl = globalThis.fetch, timeoutMs = 20000, maxPages = 100, debug = () => {} } = {}) {
    this.account = account;
    this.debug = debug;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxPages = maxPages;
    this.jar = new CookieJar();
    this.authenticated = false;
    this.pending = null;
  }

  async request(path, body) {
    const url = BASE + path;
    const started = Date.now();
    const operation = body ? "login" : "loans";
    this.debug("request.start", { operation });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const cookie = await this.jar.getCookieString(url);
      const response = await this.fetch(url, {
        method: body ? "POST" : "GET", redirect: "manual", signal: controller.signal,
        headers: { ...HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      this.debug("request.response", { operation, status: response.status, durationMs: Date.now() - started });
      for (const value of response.headers.getSetCookie()) {
        await this.jar.setCookie(value, url, { ignoreError: true });
      }
      if ([401, 403].includes(response.status) || (response.status >= 300 && response.status < 400)) {
        throw new CatalogError("AUTH");
      }
      if (!response.ok) throw new CatalogError(response.status === 429 ? "RATE_LIMIT" : "HTTP");
      if (!(response.headers.get("content-type") || "").includes("json")) throw new CatalogError("AUTH");
      // Never include response bodies, URLs, cookies, or underlying exception messages in errors.
      try { return await response.json(); } catch { throw new CatalogError("RESPONSE"); }
    } catch (error) {
      const safeError = error instanceof CatalogError ? error : new CatalogError(controller.signal.aborted ? "TIMEOUT" : "NETWORK");
      this.debug("request.failed", { operation, code: safeError.code, durationMs: Date.now() - started });
      throw safeError;
    } finally { clearTimeout(timeout); }
  }

  async login() {
    this.debug("login.start");
    this.authenticated = false;
    await this.jar.removeAllCookies();
    const { username, lastName } = this.account;
    const result = await this.request("/login?rememberMe=true", {
      username, lastName, rememberMe: true, password: lastName
    });
    const cookies = await this.jar.getCookies(BASE + "/loans/0/20/Status");
    if (result?.success === false || !cookies.some(c => c.key === "TLC_PAT_KEY" || c.key === "JSESSIONID")) {
      throw new CatalogError("AUTH");
    }
    this.debug("login.cookies", { cookies: cookies.length });
    // A successful loans response is the final authentication check.
    this.authenticated = true;
  }

  async readPages() {
    const loans = [];
    const seen = new Set();
    for (let page = 0; page < this.maxPages; page++) {
      const data = await this.request(`/loans/${page * 20}/20/Status`);
      if (!Array.isArray(data?.loans)) throw new CatalogError("AUTH");
      this.debug("page.received", { page: page + 1, loans: data.loans.length });
      const normalized = data.loans.map(normalizeLoan);
      for (const loan of normalized) {
        const key = JSON.stringify(loan);
        if (seen.has(key)) throw new CatalogError("PAGINATION");
        seen.add(key);
        loans.push(loan);
      }
      if (data.loans.length < 20) return loans;
    }
    throw new CatalogError("PAGINATION");
  }

  getLoans() {
    if (this.pending) this.debug("request.coalesced");
    if (!this.pending) this.pending = this.retrieve().finally(() => { this.pending = null; });
    return this.pending;
  }

  async retrieve() {
    if (!this.authenticated) await this.login();
    else this.debug("session.reuse");
    try { return await this.readPages(); }
    catch (error) {
      if (error.code !== "AUTH") throw error;
      this.authenticated = false;
      this.debug("session.renew");
      await this.login();
      try { return await this.readPages(); }
      catch (retryError) { this.authenticated = false; throw retryError; }
    }
  }
}

const MESSAGES = {
  AUTH: "Authentication failed or the session could not be renewed.",
  RATE_LIMIT: "The library is limiting requests. Waiting for the next poll.",
  HTTP: "The library service is unavailable.",
  TIMEOUT: "The library request timed out.",
  NETWORK: "The library could not be reached.",
  RESPONSE: "The library returned an unreadable response.",
  PAGINATION: "Loan pagination could not be completed safely."
};
function publicError(error) { return MESSAGES[error?.code] || "CatalogPlus could not be updated."; }
module.exports = { CatalogClient, CatalogError, normalizeLoan, publicError };
