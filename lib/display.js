/* Shared browser/Node date logic. Calendar days, not 24-hour durations (DST safe). */
(function (root) {
  "use strict";
  function ordinal(value, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(value));
    const get = type => Number(parts.find(part => part.type === type).value);
    return Date.UTC(get("year"), get("month") - 1, get("day")) / 86400000;
  }
  function daysRemaining(due, now = Date.now(), timeZone = "America/New_York") {
    return due == null ? null : ordinal(due, timeZone) - ordinal(now, timeZone);
  }
  function state(days, soon = 7, warning = 3) {
    if (days == null) return "normal";
    if (days < 0) return "overdue";
    if (days === 0) return "due-today";
    if (days <= warning) return "warning";
    if (days <= soon) return "soon";
    return "normal";
  }
  function sortLoans(loans) {
    return [...loans].sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity) || a.title.localeCompare(b.title));
  }
  function coverUrl(loan, config) {
    const override = config.coverUrls?.[loan.itemId] || loan.coverUrl;
    if (override) {
      try {
        const url = new URL(override);
        if (url.protocol === "https:" && !url.username && !url.password) return url.href;
      } catch { /* Try the UPC instead. */ }
    }
    const upcs = [...new Set([loan.upc, ...(Array.isArray(loan.upcs) ? loan.upcs : [])].filter(v => typeof v === "string" && /^\d{8,14}$/.test(v)))];
    const isbns = [...new Set([loan.isbn, ...(Array.isArray(loan.isbns) ? loan.isbns : [])].filter(v => typeof v === "string" && /^(?:\d{9}[\dX]|\d{13})$/.test(v)))];
    const type = upcs.length ? "upc" : isbns.length ? "isbn" : null;
    if (!type) return "";
    const url = new URL(type === "isbn" ? "https://ls2content2.tlcdelivers.com/tlccontent" : "https://ls2content3.tlcdelivers.com/tlccontent");
    url.searchParams.set("customerid", String(config.coverCustomerId || "009787"));
    url.searchParams.set("appid", "ls2pac");
    url.searchParams.set("requesttype", config.coverSize === "small" ? "BOOKJACKET-SM" : "BOOKJACKET-MD");
    for (const identifier of type === "isbn" ? isbns : upcs) url.searchParams.append(type, identifier);
    return url.href;
  }
  const api = { daysRemaining, state, sortLoans, coverUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CatalogPlusDisplay = api;
})(typeof window !== "undefined" ? window : globalThis);
