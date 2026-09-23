/* Shared, allowlisted diagnostics. Never serialize arbitrary objects or errors. */
(function (root) {
  "use strict";
  const events = new Set(["helper.start", "config.invalid", "service.stop", "poll.start", "poll.complete", "poll.next", "account.updated", "account.failed", "request.start", "request.response", "request.failed", "login.start", "login.cookies", "session.reuse", "session.renew", "page.received", "request.coalesced", "browser.start", "browser.data", "browser.error", "cover.failed"]);
  const fields = new Set(["account", "accounts", "loans", "page", "status", "durationMs", "intervalMs", "cookies", "failed", "pending"]);
  const codes = new Set(["AUTH", "RATE_LIMIT", "HTTP", "TIMEOUT", "NETWORK", "RESPONSE", "PAGINATION"]);
  function createDebug(enabled, sink = line => console.log(line)) {
    return (event, details = {}) => {
      if (enabled !== true || !events.has(event)) return;
      const safe = {};
      for (const key of fields) if (Number.isFinite(details[key])) safe[key] = details[key];
      if (codes.has(details.code)) safe.code = details.code;
      if (["login", "loans"].includes(details.operation)) safe.operation = details.operation;
      try { sink(`[MMM-CARL] ${new Date().toISOString()} ${event} ${JSON.stringify(safe)}`); } catch { /* Logging must not interrupt polling. */ }
    };
  }
  const api = { createDebug };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CarlDebug = api;
})(typeof window !== "undefined" ? window : globalThis);
