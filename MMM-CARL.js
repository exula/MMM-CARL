/* global Module, CatalogPlusDisplay, CarlDebug */
Module.register("MMM-CARL", {
  defaults: {
    accounts: [], pollSeconds: 3600, debug: false,
    showAccount: true, groupByAccount: false, showAuthor: true, showFormat: true,
    maxItems: 10, soonDays: 7, warningDays: 3, timeZone: "America/New_York",
    locale: "en-US", animationSpeed: 300,
    width: "360px", maxHeight: "none", density: "compact", fontScale: 1,
    rowGap: null, rowPadding: null, layout: "list", titleLines: 0,
    showCovers: false, coverUrls: {}, customerID: "009787", contentServerAddress: "https://ls2content.tlcdelivers.com", coverCustomerId: null, coverWidth: 42, coverHeight: 62,
    coverFit: "contain", coverSize: "medium", coverPlaceholder: true,
    showBranch: false, showCallNumber: false, showPublicationDate: false,
    showExtent: false, showSeries: false, showCheckoutDate: false, showLoanStatus: false, showDueDate: true, showDaysRemaining: true,
    dateFormat: { month: "short", day: "numeric" }, countdownStyle: "short",
    showSummary: false, showLastUpdated: false, showErrors: true,
    showMoreCount: true, hideWhenEmpty: false, emptyMessage: "No items checked out",
    sortBy: "dueDate", filter: "all", accountNames: [],
    colorMode: "color", showStatusBorder: true
  },
  getStyles() { return ["MMM-CARL.css"]; },
  getScripts() { return [this.file("lib/display.js"), this.file("lib/debug.js")]; },
  debugLog(event, details) { CarlDebug.createDebug(this.config.debug)(event, details); },
  start() {
    this.debugLog("browser.start");
    this.loanData = null;
    this.error = null;
    this.subscribe();
    this.startClock();
  },
  subscribe() {
    this.sendSocketNotification("CATALOGPLUS_SUBSCRIBE", { accounts: this.config.accounts, pollSeconds: this.config.pollSeconds, debug: this.config.debug });
  },
  startClock() {
    clearInterval(this.clock);
    this.clock = setInterval(() => {
      this.updateDom(0);
      // Re-subscribe also recovers after a helper/server restart without forcing a poll.
      this.subscribe();
    }, 60000);
  },
  suspend() { clearInterval(this.clock); },
  resume() { this.startClock(); this.subscribe(); this.updateDom(0); },
  socketNotificationReceived(notification, payload) {
    if (notification === "CATALOGPLUS_DATA") { this.debugLog("browser.data", { accounts: payload.accounts.length, loans: payload.accounts.reduce((sum, a) => sum + a.loans.length, 0), failed: payload.accounts.filter(a => a.error).length, pending: payload.accounts.filter(a => !a.updatedAt && !a.error).length }); this.loanData = payload; this.error = null; }
    else if (notification === "CATALOGPLUS_ERROR") { this.debugLog("browser.error"); this.error = payload; }
    else return;
    this.updateDom(this.config.animationSpeed);
  },
  getDom() {
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      node.className = className;
      if (text != null) node.textContent = text;
      return node;
    };
    const c = this.config;
    const density = ["compact", "comfortable", "spacious"].includes(c.density) ? c.density : "compact";
    const wrapper = el("div", `catalogplus catalogplus-density-${density}${c.layout === "cards" ? " catalogplus-cards" : ""}${c.colorMode === "monochrome" ? " catalogplus-monochrome" : ""}${!c.showStatusBorder ? " catalogplus-no-border" : ""}`);
    const length = (value, fallback) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? `${value}px` : typeof value === "string" && /^(?:\d+(?:\.\d+)?(?:px|rem|em|vw|vh|%)|auto|none)$/.test(value) ? value : fallback;
    wrapper.style.setProperty("--cp-width", length(c.width, "360px"));
    wrapper.style.setProperty("--cp-height", length(c.maxHeight, "none"));
    wrapper.style.setProperty("--cp-scale", String(Math.min(2, Math.max(0.5, Number(c.fontScale) || 1))));
    if (c.rowGap != null) wrapper.style.setProperty("--cp-gap", length(c.rowGap, "5px"));
    if (c.rowPadding != null) wrapper.style.setProperty("--cp-padding", length(c.rowPadding, "6px"));
    wrapper.style.setProperty("--cp-cover-width", `${Math.min(200, Math.max(20, Number(c.coverWidth) || 42))}px`);
    wrapper.style.setProperty("--cp-cover-height", `${Math.min(300, Math.max(20, Number(c.coverHeight) || 62))}px`);
    wrapper.style.setProperty("--cp-cover-fit", c.coverFit === "cover" ? "cover" : "contain");
    if (this.error && c.showErrors) wrapper.appendChild(el("div", "catalogplus-error small", this.error));
    if (!this.loanData) {
      if (!this.error) wrapper.appendChild(el("div", "dimmed small", "Loading library loans…"));
      return wrapper;
    }
    let dateFormat;
    try { dateFormat = new Intl.DateTimeFormat(this.config.locale, { ...c.dateFormat, timeZone: c.timeZone }); }
    catch { wrapper.appendChild(el("div", "catalogplus-error small", "Invalid date format, locale or time zone.")); return wrapper; }
    const accounts = this.loanData.accounts.filter(account => !Array.isArray(c.accountNames) || !c.accountNames.length || c.accountNames.includes(account.name));
    for (const account of accounts) {
      if (account.error && c.showErrors) {
        const stale = account.updatedAt ? ` Showing saved loans from ${dateFormat.format(account.updatedAt)}.` : "";
        wrapper.appendChild(el("div", "catalogplus-error xsmall", `${this.config.showAccount ? account.name + ": " : ""}${account.error}${stale}`));
      }
    }
    const allLoans = accounts.flatMap(account => account.loans.map(loan => ({ ...loan, accountId: account.id, accountName: account.name, stale: Boolean(account.error) })));
    const filtered = allLoans.filter(loan => {
      const days = CatalogPlusDisplay.daysRemaining(loan.dueDate, Date.now(), c.timeZone);
      return c.filter === "overdue" ? days != null && days < 0 : c.filter === "dueSoon" ? days != null && days <= c.soonDays : true;
    });
    const loans = CatalogPlusDisplay.sortLoans(filtered);
    if (["title", "author", "account"].includes(c.sortBy)) {
      const key = c.sortBy === "account" ? "accountName" : c.sortBy;
      loans.sort((a, b) => (a[key] || "").localeCompare(b[key] || "", c.locale));
    }
    if (c.showSummary) {
      const overdue = allLoans.filter(loan => CatalogPlusDisplay.daysRemaining(loan.dueDate, Date.now(), c.timeZone) < 0).length;
      wrapper.appendChild(el("div", "catalogplus-summary xsmall", `${allLoans.length} checked out · ${overdue} overdue${accounts.some(a => a.error) ? " · saved/incomplete data" : ""}`));
    }
    if (c.showLastUpdated) {
      const dates = accounts.map(a => a.updatedAt).filter(Boolean);
      wrapper.appendChild(el("div", "catalogplus-updated xsmall dimmed", dates.length ? `Oldest account update: ${new Intl.DateTimeFormat(c.locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: c.timeZone }).format(Math.min(...dates))}${dates.length < accounts.length ? " · some accounts unavailable" : ""}` : "Not updated yet"));
    }
    if (!loans.length) {
      const incomplete = accounts.some(a => a.error || !a.updatedAt);
      if (c.hideWhenEmpty && !incomplete && !this.error) { wrapper.hidden = true; return wrapper; }
      wrapper.appendChild(el("div", "dimmed small", accounts.some(a => a.error) ? "Loan information is incomplete." : accounts.some(a => !a.updatedAt) ? "Loading library loans…" : allLoans.length ? "No items match this filter" : c.emptyMessage));
      return wrapper;
    }
    const limit = Math.max(0, Math.floor(Number(this.config.maxItems) || 0));
    const visible = limit ? loans.slice(0, limit) : loans;
    const groups = this.config.groupByAccount
      ? [...new Set(visible.map(loan => loan.accountId))].map(id => visible.filter(loan => loan.accountId === id))
      : [visible];
    for (const group of groups) {
      if (this.config.groupByAccount && this.config.showAccount) wrapper.appendChild(el("div", "catalogplus-account small", group[0].accountName));
      for (const loan of group) {
        const days = CatalogPlusDisplay.daysRemaining(loan.dueDate, Date.now(), this.config.timeZone);
        const state = CatalogPlusDisplay.state(days, this.config.soonDays, this.config.warningDays);
        const row = el("div", `catalogplus-loan catalogplus-${state}${loan.stale ? " catalogplus-stale" : ""}`);
        if (c.showCovers) {
          const url = CatalogPlusDisplay.coverUrl(loan, c);
          if (url || c.coverPlaceholder) {
            const cover = el("div", "catalogplus-cover");
            const placeholder = el("span", "catalogplus-cover-placeholder", "▤");
            placeholder.setAttribute("aria-hidden", "true");
            placeholder.hidden = Boolean(url) || !c.coverPlaceholder;
            cover.appendChild(placeholder);
            if (url) {
              const img = el("img", "catalogplus-cover-image");
              img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
              img.onerror = () => { this.debugLog("cover.failed"); img.hidden = true; placeholder.hidden = !c.coverPlaceholder; if (!c.coverPlaceholder) cover.hidden = true; };
              img.src = url;
              cover.appendChild(img);
            }
            row.appendChild(cover);
          }
        }
        const detail = el("div", "catalogplus-detail");
        const title = el("div", "catalogplus-title small", loan.title);
        title.title = loan.title;
        if (Number(c.titleLines) > 0) { title.className += " catalogplus-clamp"; title.style.setProperty("--cp-title-lines", String(Math.max(1, Math.floor(c.titleLines)))); }
        detail.appendChild(title);
        const meta = [this.config.showAuthor && loan.author, this.config.showFormat && loan.format, c.showBranch && loan.transactionBranch,
          c.showCallNumber && loan.callNumber && `Call no. ${loan.callNumber}`,
          c.showPublicationDate && loan.publicationDate,
          c.showExtent && loan.extent,
          c.showSeries && loan.series,
          c.showCheckoutDate && (loan.outDate != null || loan.outDateString) && `Checked out ${loan.outDate != null ? dateFormat.format(loan.outDate) : loan.outDateString}`,
          c.showLoanStatus && loan.status, c.showLoanStatus && loan.message, this.config.showAccount && !this.config.groupByAccount && loan.accountName].filter(Boolean);
        if (meta.length) detail.appendChild(el("div", "catalogplus-meta xsmall dimmed", meta.join(" · ")));
        row.appendChild(detail);
        const due = el("div", "catalogplus-due");
        if (c.showDueDate) due.appendChild(el("div", "small", loan.dueDate == null ? loan.dueDateString || "Date unknown" : dateFormat.format(loan.dueDate)));
        const label = days == null ? "Due date unavailable" : days < 0 ? `${-days}d overdue` : days === 0 ? "Due today" : `${days}d left`;
        const longLabel = days == null || days === 0 ? label : days < 0 ? `${-days} ${days === -1 ? "day" : "days"} overdue` : `Due in ${days} ${days === 1 ? "day" : "days"}`;
        if (c.showDaysRemaining) due.appendChild(el("div", "catalogplus-days xsmall", c.countdownStyle === "long" ? longLabel : label));
        if (c.showDueDate || c.showDaysRemaining) row.appendChild(due);
        wrapper.appendChild(row);
      }
    }
    if (c.showMoreCount && visible.length < loans.length) wrapper.appendChild(el("div", "dimmed xsmall", `+${loans.length - visible.length} more items`));
    return wrapper;
  }
});
