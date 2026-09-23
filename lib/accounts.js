"use strict";
const { ConfigError } = require("./settings");

function loadAccounts(config = {}) {
  if (!Array.isArray(config.accounts) || !config.accounts.length || config.accounts.length > 20) {
    throw new ConfigError("MMM-CARL: add between 1 and 20 entries to config.accounts.");
  }
  return config.accounts.map((account, index) => {
    if (!account || typeof account.card !== "string" || !account.card.trim()) {
      throw new ConfigError(`MMM-CARL: account ${index + 1} needs a card number in quotes.`);
    }
    if (account.lastName != null && (typeof account.lastName !== "string" || !account.lastName.trim())) {
      throw new ConfigError(`MMM-CARL: account ${index + 1} lastName must be a nonempty string or omitted.`);
    }
    if (account.password != null && (typeof account.password !== "string" || !account.password.length)) {
      throw new ConfigError(`MMM-CARL: account ${index + 1} password must be a nonempty string or omitted.`);
    }
    const password = account.password ?? account.lastName?.trim();
    if (!password) throw new ConfigError(`MMM-CARL: account ${index + 1} needs password (or lastName for surname login).`);
    return {
      id: `account-${index + 1}`,
      name: typeof account.name === "string" && account.name.trim() ? account.name : `Account ${index + 1}`,
      username: account.card.trim(), password, ...(account.lastName ? { lastName: account.lastName.trim() } : {})
    };
  });
}

module.exports = { loadAccounts };
