"use strict";
const { CatalogClient, publicError } = require("./client");

class LoanService {
  constructor(accounts, { clientFactory = account => new CatalogClient(account), interval = 3600000, publish = () => {} } = {}) {
    this.entries = accounts.map(account => ({ id: account.id, name: account.name, client: clientFactory(account), loans: [], updatedAt: null, error: null }));
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
    this.pending = Promise.all(this.entries.map(async entry => {
      try {
        entry.loans = await entry.client.getLoans();
        entry.updatedAt = Date.now();
        entry.error = null;
      } catch (error) { entry.error = publicError(error); }
    })).then(() => {
      if (!this.stopped) this.publish(this.snapshot());
    }).finally(() => {
      this.pending = null;
      if (!this.stopped) this.timer = setTimeout(() => this.poll(), this.interval);
    });
    return this.pending;
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }
}
module.exports = { LoanService };
