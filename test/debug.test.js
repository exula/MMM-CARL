"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDebug } = require("../lib/debug");
const { CatalogClient } = require("../lib/client");
const { LoanService } = require("../lib/service");

test("debug is opt-in and accepts only allowlisted diagnostics", () => {
  const lines = [];
  for (const enabled of [false, undefined, "true", 1]) createDebug(enabled, line => lines.push(line))("poll.start", { accounts: 1 });
  assert.equal(lines.length, 0);
  const debug = createDebug(true, line => lines.push(line));
  debug("request.response", { status: 200, account: 1, cookies: "private-cookie", username: "private-card", lastName: "private-name", body: "private-body", code: "private-code", operation: "login" });
  debug("private-event");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[MMM-CARL\].*request.response/);
  assert.match(lines[0], /"status":200/);
  assert.doesNotMatch(lines.join(""), /private-/);
  assert.doesNotThrow(() => createDebug(true, () => { throw Error("unavailable output"); })("poll.start"));
});

test("client logs session recovery without responses, headers or credentials", async () => {
  const lines = [];
  let reads = 0;
  const client = new CatalogClient({ username: "private-card", lastName: "private-name" }, {
    debug: createDebug(true, line => lines.push(line)),
    fetchImpl: async url => {
      if (url.includes("login")) return new Response(JSON.stringify({ private: "private-body" }), { headers: { "content-type": "application/json", "set-cookie": "TLC_PAT_KEY=private-cookie; Path=/; Secure" } });
      reads++;
      return new Response(JSON.stringify(reads === 1 ? { private: "private-body" } : { loans: [] }), { status: reads === 1 ? 401 : 200, headers: { "content-type": "application/json" } });
    }
  });
  await client.getLoans();
  await client.getLoans();
  const output = lines.join("\n");
  for (const event of ["login.start", "request.response", "request.failed", "session.renew", "session.reuse", "page.received"]) assert.ok(output.includes(event));
  assert.doesNotMatch(output, /private-|TLC_PAT_KEY|https:/);
});

test("poll diagnostics include account index and sanitized failure", async () => {
  const lines = [];
  const service = new LoanService([{ id: "private-id", name: "private-name" }], {
    debug: createDebug(true, line => lines.push(line)),
    clientFactory: () => ({ getLoans: async () => { throw Object.assign(new Error("private-message"), { code: "private-code" }); } })
  });
  await service.poll();
  service.stop();
  const output = lines.join("\n");
  assert.match(output, /account.failed.*"account":1/);
  assert.match(output, /poll.complete.*"failed":1/);
  assert.match(output, /poll.next/);
  assert.doesNotMatch(output, /private-/);
});
