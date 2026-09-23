"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const display = require("../lib/display");

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.className = ""; this.textContent = ""; this.style = { setProperty(key, value) { this[key] = value; } }; }
  setAttribute(key, value) { this[key] = value; }
  appendChild(child) { this.children.push(child); }
}
function flatten(node) { return [node, ...node.children.flatMap(flatten)]; }
function moduleInstance(debugApi = require("../lib/debug"), overrides = {}) {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../MMM-CARL.js"), "utf8"), {
    Module: { register(name, value) { assert.equal(name, "MMM-CARL"); definition = value; } },
    CarlDebug: debugApi, CatalogPlusDisplay: display, document: { createElement: tag => new Element(tag) },
    URL, Intl, Date, setInterval, clearInterval, ...overrides
  });
  return { ...definition, config: { ...definition.defaults }, updateDom() {} };
}
test("browser renders global due order, text safely, states, labels and item limit", () => {
  const module = moduleInstance();
  const now = Date.now();
  module.loanData = { accounts: [
    { id: "A", name: "First", updatedAt: now, loans: [{ title: "Later", dueDate: now + 10 * 86400000 }] },
    { id: "B", name: "Second", updatedAt: now, loans: [{ title: "<script>example</script>", dueDate: now - 2 * 86400000 }, { title: "Today", dueDate: now }] }
  ] };
  module.config.maxItems = 2;
  const nodes = flatten(module.getDom());
  assert.deepEqual(nodes.filter(n => n.className.includes("catalogplus-title")).map(n => n.textContent), ["<script>example</script>", "Today"]);
  assert.ok(nodes.some(n => n.className.includes("catalogplus-overdue")));
  assert.ok(nodes.some(n => n.className.includes("catalogplus-due-today")));
  assert.ok(nodes.some(n => n.textContent === "+1 more items"));
  assert.ok(nodes.every(n => n.innerHTML === undefined));
  module.config.groupByAccount = true;
  module.config.maxItems = 0;
  assert.deepEqual(flatten(module.getDom()).filter(n => n.className === "catalogplus-account small").map(n => n.textContent), ["Second", "First"]);
});
test("browser distinguishes failed, empty, loading and stale accounts", () => {
  const module = moduleInstance();
  assert.match(flatten(module.getDom()).map(n => n.textContent).join(" "), /Loading/);
  module.loanData = { accounts: [{ id: "A", name: "Private label", updatedAt: Date.now(), loans: [], error: null }] };
  assert.match(flatten(module.getDom()).map(n => n.textContent).join(" "), /No items checked out/);
  module.config.showAccount = false;
  module.loanData.accounts[0].error = "Unavailable";
  let text = flatten(module.getDom()).map(n => n.textContent).join(" ");
  assert.match(text, /incomplete/);
  assert.doesNotMatch(text, /Private label/);
  module.loanData.accounts[0].loans.push({ title: "Saved book", dueDate: null, dueDateString: "Unknown" });
  assert.ok(flatten(module.getDom()).some(n => n.className.includes("catalogplus-stale")));
});
test("helper reads configured accounts once and never echoes credentials", () => {
  let definition;
  let instances = 0;
  let polls = 0;
  const config = { accounts: [{ card: "fake-card", lastName: "fake-secret" }] };
  const messages = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../node_helper.js"), "utf8"), {
    require(name) {
      if (name === "./lib/debug") return require("../lib/debug");
      if (name === "node_helper") return { create(value) { definition = value; } };
      if (name === "./lib/accounts") return { loadAccounts(value) { assert.equal(value, config); return [{ id: "HOME" }]; } };
      if (name === "./lib/service") return { LoanService: class {
        constructor(accounts, options) { instances++; assert.equal(options.interval, 3600000); }
        poll() { polls++; }
        snapshot() { return { accounts: [] }; }
        stop() {}
      } };
      throw new Error("Unexpected import");
    }, module: { exports: {} }
  });
  definition.sendSocketNotification = (name, data) => messages.push({ name, data });
  definition.start();
  definition.socketNotificationReceived("CATALOGPLUS_SUBSCRIBE", config);
  definition.socketNotificationReceived("CATALOGPLUS_SUBSCRIBE", config);
  assert.equal(instances, 1);
  assert.equal(polls, 1);
  assert.doesNotMatch(JSON.stringify(messages), /fake-card|fake-secret/);
  definition.stop();
});

test("covers use UPC endpoint, preserve leading zero, and fail gracefully", () => {
  const { normalizeLoan } = require("../lib/client");
  const loan = normalizeLoan({ itemId: "example", resource: { shortTitle: "Example", upc: "043396425101" } });
  const module = moduleInstance();
  module.config.showCovers = true;
  module.loanData = { accounts: [{ name: "Home", updatedAt: Date.now(), loans: [loan] }] };
  const nodes = flatten(module.getDom());
  const img = nodes.find(n => n.tag === "img");
  const url = new URL(img.src);
  assert.equal(url.origin, "https://ls2content.tlcdelivers.com");
  assert.equal(url.searchParams.get("customerid"), "009787");
  assert.equal(url.searchParams.get("requesttype"), "BOOKJACKET-MD");
  assert.equal(url.searchParams.get("upc"), "043396425101");
  img.onerror();
  assert.equal(img.hidden, true);
  assert.equal(nodes.find(n => n.className === "catalogplus-cover-placeholder").hidden, false);
  module.config.coverPlaceholder = false;
  const second = flatten(module.getDom());
  second.find(n => n.tag === "img").onerror();
  assert.equal(second.find(n => n.className === "catalogplus-cover").hidden, true);
  module.config.showCovers = false;
  assert.equal(flatten(module.getDom()).some(n => n.tag === "img"), false);
});

test("cover overrides, missing UPCs and unsafe URLs", () => {
  assert.equal(display.coverUrl({ itemId: "x" }, { coverUrls: { x: "https://example.com/cover.jpg" } }), "https://example.com/cover.jpg");
  assert.equal(display.coverUrl({ coverUrl: "javascript:alert(1)" }, {}), "");
  assert.equal(display.coverUrl({ upc: "invalid" }, {}), "");
  assert.equal(display.coverUrl({}, {}), "");
  const { normalizeLoan } = require("../lib/client");
  assert.equal(normalizeLoan({ resource: { upc: ["bad", "043396425101"] } }).upc, "043396425101");
  assert.equal(normalizeLoan({ upc: "043396425101" }).upc, "043396425101");
});

test("UI size, density, sorting, filters and visibility are independent", () => {
  const module = moduleInstance();
  Object.assign(module.config, { width: 500, density: "spacious", rowGap: 12, fontScale: 1.2, sortBy: "title", showDueDate: false, showDaysRemaining: false, titleLines: 2, showSummary: true, showLastUpdated: true });
  module.loanData = { accounts: [{ name: "Home", updatedAt: Date.now(), loans: [
    { title: "Z overdue", dueDate: Date.now() - 86400000 },
    { title: "A later", dueDate: Date.now() + 864000000 },
    { title: "Unknown", dueDate: null }
  ] }] };
  const root = module.getDom();
  const nodes = flatten(root);
  assert.equal(root.style["--cp-width"], "500px");
  assert.equal(root.style["--cp-gap"], "12px");
  assert.match(root.className, /spacious/);
  assert.deepEqual(nodes.filter(n => n.className.includes("catalogplus-title")).map(n => n.textContent), ["A later", "Unknown", "Z overdue"]);
  assert.equal(nodes.some(n => n.className === "catalogplus-due"), false);
  assert.match(nodes.find(n => n.className.includes("catalogplus-summary")).textContent, /3 checked out · 1 overdue/);
  module.config.filter = "overdue";
  assert.equal(flatten(module.getDom()).filter(n => n.className.includes("catalogplus-title")).length, 1);
  module.config.accountNames = ["Other"];
  module.config.hideWhenEmpty = true;
  assert.equal(module.getDom().hidden, true);
  module.config.accountNames = [];
  module.loanData.accounts[0].loans = [];
  module.loanData.accounts[0].error = "Unavailable";
  assert.notEqual(module.getDom().hidden, true);
});


test("browser diagnostics distinguish empty success, failure and pending fetch", () => {
  const events = [];
  const module = moduleInstance({ createDebug: () => (event, details) => events.push({ event, details }) });
  for (const state of [
    { updatedAt: Date.now(), error: null },
    { updatedAt: null, error: "Unavailable" },
    { updatedAt: null, error: null }
  ]) module.socketNotificationReceived("CATALOGPLUS_DATA", { accounts: [{ ...state, loans: [] }] });
  assert.deepEqual(events.map(e => [e.details.loans, e.details.failed, e.details.pending]), [[0, 0, 0], [0, 1, 0], [0, 0, 1]]);
});

test("ISBN covers preserve every unique ISBN as a repeated query parameter", () => {
  const url = new URL(display.coverUrl({ isbn: "9781402894626", isbns: ["9781402894626", "080442957X", "invalid"] }, { coverSize: "small" }));
  assert.equal(url.origin, "https://ls2content.tlcdelivers.com");
  assert.equal(url.searchParams.get("requesttype"), "BOOKJACKET-SM");
  assert.deepEqual(url.searchParams.getAll("isbn"), ["9781402894626", "080442957X"]);
  assert.equal(url.searchParams.has("upc"), false);
});

test("optional loan metadata renders as text and stays hidden by default", () => {
  const module = moduleInstance();
  const loan = { title: "Example", dueDate: Date.now(), callNumber: "EXAMPLE-123", extent: "200 pages", publicationDate: "2024", series: "Example series", outDateString: "Example checkout date", status: "Example status", message: "<script>notice</script>" };
  module.loanData = { accounts: [{ name: "Home", updatedAt: Date.now(), loans: [loan] }] };
  assert.doesNotMatch(flatten(module.getDom()).map(n => n.textContent).join(" "), /EXAMPLE-123|200 pages/);
  Object.assign(module.config, { showCallNumber: true, showPublicationDate: true, showExtent: true, showSeries: true, showCheckoutDate: true, showLoanStatus: true });
  const text = flatten(module.getDom()).map(n => n.textContent).join(" ");
  for (const value of ["EXAMPLE-123", "200 pages", "2024", "Example series", "Example checkout date", "Example status", "<script>notice</script>"]) assert.ok(text.includes(value));
});


test("custom content server and customer ID support base and endpoint URLs", () => {
  for (const address of ["https://covers.example.org", "https://covers.example.org/", "https://covers.example.org/tlccontent"]) {
    const url = new URL(display.coverUrl({ isbn: "9781402894626" }, { customerID: "001234", contentServerAddress: address }));
    assert.equal(url.origin, "https://covers.example.org");
    assert.equal(url.pathname, "/tlccontent");
    assert.equal(url.searchParams.get("customerid"), "001234");
    assert.equal(url.searchParams.get("isbn"), "9781402894626");
  }
  assert.equal(display.coverUrl({ upc: "043396425101" }, { contentServerAddress: "javascript:alert(1)" }), "");
  assert.equal(new URL(display.coverUrl({ upc: "043396425101" }, { coverCustomerId: "009999" })).searchParams.get("customerid"), "009999");
});


test("startup and loan notifications preserve MagicMirror module metadata", () => {
  const module = moduleInstance();
  const metadata = { name: "MMM-CARL", identifier: "module_2_MMM-CARL", path: "modules/MMM-CARL", header: "Library loans", position: "top_right" };
  module.data = metadata;
  module.file = file => `${module.data.path}/${file}`;
  const messages = [];
  module.sendSocketNotification = (name, payload) => messages.push({ name, payload });
  try {
    module.start();
    assert.equal(module.data, metadata);
    assert.equal(module.loanData, null);
    assert.ok(flatten(module.getDom()).some(n => /Loading/.test(n.textContent)));
    assert.ok(module.getScripts().every(file => file.startsWith("modules/MMM-CARL/")));
    module.socketNotificationReceived("CATALOGPLUS_DATA", { accounts: [{ name: "Home", loans: [], updatedAt: Date.now() }] });
    assert.equal(module.data, metadata);
    assert.equal(module.data.header, "Library loans");
    assert.ok(flatten(module.getDom()).some(n => /No items checked out/.test(n.textContent)));
    assert.equal(messages[0].name, "CATALOGPLUS_SUBSCRIBE");
  } finally { module.suspend(); }
});


test("Meals and CARL alternate in the same slot every 30 seconds without unlocking other modules", () => {
  const events = [];
  const parent = { insertBefore(a, b) { events.push(["position", a.id, b.id]); } };
  const nodes = { carl: { id: "carl", parentNode: parent }, meals: { id: "meals", parentNode: parent } };
  const peer = { name: "MMM-MealViewer", identifier: "meals", data: { position: "top_left" }, hide: action("meals", "hide"), show: action("meals", "show") };
  function action(name, method) { return (speed, callback, options) => { events.push([name, method, speed, options.lockString, options.force]); callback(); }; }
  let tick, interval, timers = 0;
  const module = moduleInstance(undefined, {
    MM: { getModules: () => ({ enumerate: fn => fn(peer) }) },
    document: { getElementById: id => nodes[id] },
    setInterval(fn, ms) { tick = fn; interval = ms; timers++; return 1; }
  });
  module.identifier = "carl"; module.data = { position: "top_left" };
  module.config.rotateWith = "MMM-MealViewer";
  module.hide = action("carl", "hide"); module.show = action("carl", "show");
  module.notificationReceived("DOM_OBJECTS_CREATED");
  assert.equal(interval, 30000);
  assert.deepEqual(events[0], ["position", "carl", "meals"]);
  assert.equal(events[1][1], "hide");
  tick(); tick();
  assert.deepEqual(events.slice(2).map(e => e.slice(0, 2)), [["meals", "hide"], ["carl", "show"], ["carl", "hide"], ["meals", "show"]]);
  assert.ok(events.slice(1).every(e => e[3] === "carl-rotation" && e[4] === undefined));
  module.notificationReceived("DOM_OBJECTS_CREATED");
  assert.equal(timers, 1);
});
