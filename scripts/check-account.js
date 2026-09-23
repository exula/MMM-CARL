#!/usr/bin/env node
"use strict";

const { createDebug } = require("../lib/debug");
const path = require("node:path");
const { loadAccounts } = require("../lib/accounts");
const { CatalogClient, publicError } = require("../lib/client");

async function main() {
  let accounts;
  let debug;
  try {
    const args = process.argv.slice(2).filter(arg => arg !== "--debug");
    if (args.length > 1) throw new Error("Invalid arguments");
    const configPath = args[0] ? path.resolve(args[0]) : path.resolve(__dirname, "../../../config/config.js");
    const config = require(configPath);
    const settings = Array.isArray(config.modules)
      ? config.modules.find(entry => entry.module === "MMM-CARL" && !entry.disabled)?.config
      : config;
    accounts = loadAccounts(settings);
    debug = createDebug(settings.debug === true || process.argv.includes("--debug"));
  }
  catch { console.error("Account config could not be loaded. Run npm run check -- /path/to/config.js; see README.md."); process.exitCode = 1; return; }
  for (let index = 0; index < accounts.length; index++) {
    try {
      const client = new CatalogClient(accounts[index], { debug: (event, details) => debug(event, { ...details, account: index + 1 }) });
      const loans = await client.getLoans();
      console.log(`Account ${index + 1}: login and retrieval OK; ${loans.length} loan(s).`);
      const again = await client.getLoans();
      console.log(`Account ${index + 1}: session reuse OK; ${again.length} loan(s).`);
    } catch (error) {
      console.error(`Account ${index + 1}: ${publicError(error)}`);
      process.exitCode = 1;
    }
  }
}
main().catch(() => { console.error("CatalogPlus check failed."); process.exitCode = 1; });
