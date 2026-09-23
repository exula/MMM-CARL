"use strict";
const { createDebug } = require("./lib/debug");
const NodeHelper = require("node_helper");
const { loadAccounts } = require("./lib/accounts");
const { LoanService } = require("./lib/service");

module.exports = NodeHelper.create({
  start() { this.service = null; },
  socketNotificationReceived(notification, config = {}) {
    if (notification !== "CATALOGPLUS_SUBSCRIBE") return;
    if (this.service) {
      this.sendSocketNotification("CATALOGPLUS_DATA", this.service.snapshot());
      return;
    }
    const debug = createDebug(config.debug);
    try {
      // Account settings come from the module config; cookies stay in the helper.
      const accounts = loadAccounts(config);
      const seconds = Number(config.pollSeconds ?? 3600);
      if (!Number.isFinite(seconds) || seconds < 300 || seconds > 86400) throw new Error("CONFIG");
      this.service = new LoanService(accounts, {
        interval: seconds * 1000, debug,
        publish: data => this.sendSocketNotification("CATALOGPLUS_DATA", data)
      });
      debug("helper.start", { accounts: accounts.length, intervalMs: seconds * 1000 });
      this.service.poll();
    } catch {
      debug("config.invalid");
      this.sendSocketNotification("CATALOGPLUS_ERROR", "CatalogPlus configuration is missing or invalid. Check accounts and pollSeconds.");
    }
  },
  stop() { this.service?.stop(); }
});
