"use strict";
const { CatalogClient, publicError } = require("./client");

class LoanService {
  constructor(accounts, { clientFactory, interval = 3600000, publish = () => {}, debug = () => {}, clientOptions = {} } = {}) {
    this.debug = debug;
    this.entries = accounts.map((account, index) => ({ id: account.id, name: account.name, number: index + 1,
      client: clientFactory ? clientFactory(account) : new CatalogClient(account, { ...clientOptions, debug: (event, details) => debug(event, { ...details, account: index + 1 }) }),
      loans: [], updatedAt: null, error: null }));
    this.interval = interval;
    this.publish = publish;
    this.timer = null;
    this.pending = null;
    this.stopped = false;
  }
  snapshot() {
    return { accounts: this.entries.map(({ id, name, loans, updatedAt, error }) => ({ id, name, loans, updatedAt, error })) };
  }
  poll() {
    if (this.pending) return this.pending;
    const started = Date.now();
    this.debug("poll.start", { accounts: this.entries.length });
    this.pending = Promise.all(this.entries.map(async entry => {
      try {
        entry.loans = await entry.client.getLoans();
        entry.updatedAt = Date.now();
        entry.error = null;
        this.debug("account.updated", { account: entry.number, loans: entry.loans.length });
      } catch (error) { entry.error = publicError(error); this.debug("account.failed", { account: entry.number, code: error?.code }); }
    })).then(() => {
      this.debug("poll.complete", { durationMs: Date.now() - started, failed: this.entries.filter(entry => entry.error).length });
      if (!this.stopped) this.publish(this.snapshot());
    }).finally(() => {
      this.pending = null;
      if (!this.stopped) { this.debug("poll.next", { intervalMs: this.interval }); this.timer = setTimeout(() => this.poll(), this.interval); }
    });
    return this.pending;
  }
  stop() { this.debug("service.stop"); this.stopped = true; clearTimeout(this.timer); }
}
module.exports = { LoanService };
