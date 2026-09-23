"use strict";
const { createDebug } = require("./lib/debug");
const { loadSettings, ConfigError } = require("./lib/settings");
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
      const settings = loadSettings(config);
      this.service = new LoanService(accounts, {
        interval: settings.interval, debug, clientOptions: settings,
        publish: data => this.sendSocketNotification("CATALOGPLUS_DATA", data)
      });
      debug("helper.start", { accounts: accounts.length, intervalMs: settings.interval });
      this.service.poll();
    } catch (error) {
      debug("config.invalid");
      this.sendSocketNotification("CATALOGPLUS_ERROR", error instanceof ConfigError ? error.message : "MMM-CARL could not start. Check the server installation and configuration.");
    }
  },
  stop() { this.service?.stop(); }
});
