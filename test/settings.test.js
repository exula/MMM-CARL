"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadAccounts } = require("../lib/accounts");
const { loadSettings, ConfigError } = require("../lib/settings");
const { CatalogClient } = require("../lib/client");

test("explicit passwords preserve spaces and override surname fallback", () => {
  const [account] = loadAccounts({ accounts: [{ card: "001234", password: "  example password  ", lastName: "Example" }] });
  assert.equal(account.password, "  example password  ");
  assert.equal(account.username, "001234");
  assert.equal(loadAccounts({ accounts: [{ card: "001234", lastName: "Example" }] })[0].password, "Example");
  assert.equal(loadAccounts({ accounts: [{ card: "001234", password: "0042" }] })[0].lastName, undefined);
  assert.throws(() => loadAccounts({ accounts: [{ card: "001234", password: 1234 }] }), ConfigError);
  assert.throws(() => loadAccounts({ accounts: [{ card: "001234", password: "" }] }), ConfigError);
});

test("config errors are actionable without reflecting secrets", () => {
  for (const config of [{ accounts: [] }, { accounts: [{ card: 12345, password: "private-secret" }] }, { accounts: [{ card: "private-card" }] }]) {
    assert.throws(() => loadAccounts(config), error => error instanceof ConfigError && !/private-|12345/.test(error.message));
  }
  assert.throws(() => loadSettings({ catalogUrl: "https://user:private-secret@example.org" }), error => !error.message.includes("private-secret"));
  assert.throws(() => loadSettings({ catalogUrl: "http://example.org" }), ConfigError);
  assert.throws(() => loadSettings({ pollSeconds: 2 }), ConfigError);
  assert.throws(() => loadSettings({ configName: "bad\r\nheader" }), ConfigError);
});

test("custom catalog base path and password-only authentication", async () => {
  const settings = loadSettings({ catalogUrl: "https://catalog.example.org/ls2pac/", configName: "branch" });
  assert.equal(settings.baseUrl, "https://catalog.example.org/ls2pac");
  const [account] = loadAccounts({ accounts: [{ card: "000123", password: "0042" }] });
  const client = new CatalogClient(account, { ...settings, fetchImpl: async (url, options) => {
    assert.ok(url.startsWith("https://catalog.example.org/ls2pac/"));
    assert.equal(options.headers["Ls2pac-config-name"], "branch");
    if (url.includes("/login?")) {
      assert.deepEqual(JSON.parse(options.body), { username: "000123", password: "0042", rememberMe: true });
      return new Response(JSON.stringify({ success: true }), { headers: { "content-type": "application/json", "set-cookie": "TLC_PAT_KEY=test-token; Path=/ls2pac; Secure" } });
    }
    assert.match(options.headers.Cookie, /TLC_PAT_KEY=test-token/);
    return new Response(JSON.stringify({ loans: [] }), { headers: { "content-type": "application/json" } });
  } });
  assert.deepEqual(await client.getLoans(), []);
});
