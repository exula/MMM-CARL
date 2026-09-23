"use strict";
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
    try {
      // Account settings come from the module config; cookies stay in the helper.
      const accounts = loadAccounts(config);
      const seconds = Number(config.pollSeconds ?? 3600);
      if (!Number.isFinite(seconds) || seconds < 300 || seconds > 86400) throw new Error("CONFIG");
      this.service = new LoanService(accounts, {
        interval: seconds * 1000,
        publish: data => this.sendSocketNotification("CATALOGPLUS_DATA", data)
      });
      this.service.poll();
    } catch {
      this.sendSocketNotification("CATALOGPLUS_ERROR", "CatalogPlus configuration is missing or invalid. Check accounts and pollSeconds.");
    }
  },
  stop() { this.service?.stop(); }
});
