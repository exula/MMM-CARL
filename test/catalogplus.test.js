"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { CatalogClient, publicError } = require("../lib/client");
const { loadAccounts } = require("../lib/accounts");
const { LoanService } = require("../lib/service");
const display = require("../lib/display");
const account = { id: "TEST", name: "Test account", username: "synthetic-card", lastName: "synthetic-secret" };
const loan = (id = 1) => ({ itemId: id, resource: { shortTitle: `Book ${id}`, shortAuthor: "An Author", format: "Book" }, dueDate: 1900000000000 });
function response(data, { status = 200, cookies = [], type = "application/json" } = {}) {
  return new Response(JSON.stringify(data), { status, headers: [["content-type", type], ...cookies.map(cookie => ["set-cookie", cookie])] });
}
function loggedIn() {
  return response({ success: true }, { cookies: ["TLC_PAT_KEY=test-token; Path=/; Secure; HttpOnly", "JSESSIONID=test-session; Path=/; Secure; HttpOnly"] });
}

test("login fields, cookie reuse/rotation and projection of allowed loan fields", async () => {
  let logins = 0;
  let reads = 0;
  const client = new CatalogClient(account, { fetchImpl: async (url, options) => {
    assert.equal(options.redirect, "manual");
    if (url.includes("/login?")) {
      logins++;
      assert.deepEqual(JSON.parse(options.body), { username: account.username, lastName: account.lastName, rememberMe: true, password: account.lastName });
      assert.equal(options.headers["Ls2pac-config-type"], "pac");
      return loggedIn();
    }
    reads++;
    assert.match(options.headers.Cookie, /JSESSIONID=test-session/);
    assert.match(options.headers.Cookie, reads === 1 ? /TLC_PAT_KEY=test-token/ : /TLC_PAT_KEY=rotated/);
    return response({ loans: [{ ...loan(), privateField: "never expose" }] }, { cookies: ["TLC_PAT_KEY=rotated; Path=/; HttpOnly; Secure"] });
  } });
  assert.equal((await client.getLoans())[0].title, "Book 1");
  assert.equal((await client.getLoans())[0].privateField, undefined);
  assert.equal(logins, 1);
});

test("expired session renews once and never loops on rejected credentials", async () => {
  let logins = 0;
  let reads = 0;
  const client = new CatalogClient(account, { fetchImpl: async url => {
    if (url.includes("/login?")) { logins++; return loggedIn(); }
    reads++;
    return reads === 1 ? response({}, { status: 401 }) : response({ loans: [] });
  } });
  assert.deepEqual(await client.getLoans(), []);
  assert.equal(logins, 2);
  const rejected = new CatalogClient(account, { fetchImpl: async url => url.includes("/login?") ? loggedIn() : response({ success: false }) });
  await assert.rejects(rejected.getLoans(), { code: "AUTH" });
  assert.equal(rejected.authenticated, false);
});

test("HTML login response and redirects trigger bounded renewal", async () => {
  for (const mode of ["html", "redirect"]) {
    let calls = 0;
    const client = new CatalogClient(account, { fetchImpl: async url => {
      calls++;
      if (url.includes("/login?")) return loggedIn();
      return response({}, mode === "html" ? { type: "text/html" } : { status: 302 });
    } });
    await assert.rejects(client.getLoans(), { code: "AUTH" });
    assert.equal(calls, 4);
  }
});

test("pagination retrieves more than twenty and detects ignored offsets", async () => {
  const paths = [];
  const client = new CatalogClient(account, { fetchImpl: async url => {
    if (url.includes("/login?")) return loggedIn();
    paths.push(new URL(url).pathname);
    return response({ loans: url.includes("/loans/0/") ? Array.from({ length: 20 }, (_, i) => loan(i)) : [loan(20)] });
  } });
  assert.equal((await client.getLoans()).length, 21);
  assert.deepEqual(paths, ["/loans/0/20/Status", "/loans/20/20/Status"]);
  const repeated = new CatalogClient(account, { fetchImpl: async url => url.includes("/login?") ? loggedIn() : response({ loans: Array.from({ length: 20 }, (_, i) => loan(i)) }) });
  await assert.rejects(repeated.getLoans(), { code: "PAGINATION" });
});

test("separate household accounts never share cookies", async () => {
  const fetchImpl = async (url, options) => {
    if (url.includes("/login?")) {
      const id = JSON.parse(options.body).username;
      assert.equal(options.headers.Cookie, undefined);
      return response({}, { cookies: [`TLC_PAT_KEY=${id}; Path=/; Secure`] });
    }
    return response({ loans: [loan(options.headers.Cookie)] });
  };
  const first = new CatalogClient({ ...account, username: "fake-one" }, { fetchImpl });
  const second = new CatalogClient({ ...account, username: "fake-two" }, { fetchImpl });
  const results = await Promise.all([first.getLoans(), second.getLoans()]);
  assert.match(results[0][0].itemId, /fake-one/);
  assert.doesNotMatch(results[0][0].itemId, /fake-two/);
  assert.match(results[1][0].itemId, /fake-two/);
});

test("network errors are sanitized, timeouts bounded, and requests coalesced", async () => {
  const broken = new CatalogClient(account, { fetchImpl: async () => { throw new Error(account.lastName); } });
  await assert.rejects(broken.getLoans(), error => !JSON.stringify(error).includes(account.lastName) && !publicError(error).includes(account.lastName));
  const slow = new CatalogClient(account, { timeoutMs: 5, fetchImpl: (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) });
  const pending = slow.getLoans();
  assert.equal(slow.getLoans(), pending);
  await assert.rejects(pending, { code: "TIMEOUT" });
});

test("rate limits and server errors do not trigger a login retry", async () => {
  for (const status of [429, 503]) {
    let calls = 0;
    const client = new CatalogClient(account, { fetchImpl: async url => {
      calls++;
      return url.includes("/login?") ? loggedIn() : response({}, { status });
    } });
    await assert.rejects(client.getLoans());
    assert.equal(calls, 2);
  }
});

test("partial account failures retain explicitly stale data without credentials", async () => {
  let fail = false;
  const service = new LoanService([account, { ...account, id: "OTHER" }], {
    clientFactory: a => ({ getLoans: async () => { if (fail && a.id === "TEST") throw new Error("secret"); return [loan()]; } })
  });
  await service.poll();
  clearTimeout(service.timer);
  fail = true;
  await service.poll();
  service.stop();
  const snapshot = service.snapshot();
  assert.equal(snapshot.accounts[0].loans.length, 1);
  assert.ok(snapshot.accounts[0].error);
  assert.equal(snapshot.accounts[1].error, null);
  assert.ok(snapshot.accounts[0].updatedAt);
  assert.doesNotMatch(JSON.stringify(snapshot), /synthetic-card|synthetic-secret|test-token/);
});

test("config parsing rejects missing accounts and preserves card strings", () => {
  assert.throws(() => loadAccounts({}));
  assert.throws(() => loadAccounts({ accounts: [] }));
  assert.throws(() => loadAccounts({ accounts: [{ card: 123, lastName: "Example" }] }));
  const accounts = loadAccounts({ accounts: [{ card: "000123", lastName: "Example", name: "Home" }] });
  assert.equal(accounts[0].username, "000123");
  assert.equal(accounts[0].lastName, "Example");
  assert.equal(accounts[0].name, "Home");
});

test("calendar days across DST, state boundaries, and global sorting", () => {
  assert.equal(display.daysRemaining(Date.parse("2026-03-09T00:00:00-04:00"), Date.parse("2026-03-08T00:00:00-05:00")), 1);
  assert.equal(display.daysRemaining(Date.parse("2026-11-02T00:00:00-05:00"), Date.parse("2026-11-01T00:00:00-04:00")), 1);
  assert.deepEqual([-1, 0, 1, 3, 4, 7, 8, null].map(d => display.state(d)), ["overdue", "due-today", "warning", "warning", "soon", "soon", "normal", "normal"]);
  assert.deepEqual(display.sortLoans([{ title: "Unknown", dueDate: null }, { title: "Later", dueDate: 2 }, { title: "Soon", dueDate: 1 }]).map(l => l.title), ["Soon", "Later", "Unknown"]);
});


test("login accepts valid JSON without a Content-Type header", async () => {
  const client = new CatalogClient(account, { fetchImpl: async url => {
    if (url.includes("/login?")) {
      const result = loggedIn();
      result.headers.delete("content-type");
      return result;
    }
    return response({ loans: [loan()] });
  } });
  assert.equal((await client.getLoans()).length, 1);
});

test("live-shaped standardNumbers and metadata normalize without private fields", () => {
  const { normalizeLoan } = require("../lib/client");
  const result = normalizeLoan({
    itemId: "example-item", title: "Fallback title", author: "Fallback author", callnumber: "EXAMPLE 123",
    outDate: 1700000000000, dueDate: 1800000000000, status: "Checked out", message: "Example notice",
    fee: 123, privateAccount: "must not cross boundary",
    resource: { id: 123, publicationDate: { publicationDate: "2024" }, extent: "200 pages", mainSeries: "Example series", standardNumbers: [
      { type: "Upc", data: "043396425101" }, { type: "Isbn", data: "978-1-4028-9462-6" },
      { type: "Isbn", data: "0-8044-2957-X" }, { type: "Isbn", data: "9781402894626" }, { type: "Isbn", data: "invalid" }
    ] }
  });
  assert.equal(result.title, "Fallback title");
  assert.equal(result.author, "Fallback author");
  assert.equal(result.callNumber, "EXAMPLE 123");
  assert.equal(result.publicationDate, "2024");
  assert.equal(result.extent, "200 pages");
  assert.equal(result.series, "Example series");
  assert.equal(result.upc, "043396425101");
  assert.deepEqual(result.isbns, ["9781402894626", "080442957X"]);
  assert.equal(result.outDate, 1700000000000);
  assert.equal(result.privateAccount, undefined);
  assert.equal(result.fee, undefined);
});

test("host-system failure is not treated as a successful empty loan result", async () => {
  const client = new CatalogClient(account, { fetchImpl: async url => url.includes("/login?") ? loggedIn() : response({ loans: [], hostSystemDiag: { hostSystemFailure: true } }) });
  await assert.rejects(client.getLoans(), { code: "HTTP" });
});
