"use strict";

function loadAccounts(config = {}) {
  if (!Array.isArray(config.accounts) || !config.accounts.length || config.accounts.length > 20) {
    throw new Error("Configure between 1 and 20 CatalogPlus accounts.");
  }
  return config.accounts.map((account, index) => {
    if (!account || typeof account.card !== "string" || !account.card.trim() ||
        typeof account.lastName !== "string" || !account.lastName.trim()) {
      throw new Error("Each CatalogPlus account needs a card and lastName string.");
    }
    return {
      id: `account-${index + 1}`,
      name: typeof account.name === "string" && account.name.trim() ? account.name : `Account ${index + 1}`,
      username: account.card.trim(), lastName: account.lastName.trim()
    };
  });
}

module.exports = { loadAccounts };
