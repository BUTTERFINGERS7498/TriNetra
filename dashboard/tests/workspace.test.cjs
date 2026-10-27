const { test, afterEach } = require("node:test");
const openWindows = new Set();
afterEach(() => {
  for (const window of openWindows) window.close();
  openWindows.clear();
});
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { JSDOM, VirtualConsole } = require("jsdom");
const cssTree = require("css-tree");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "static/index.html"), "utf8");
const source = fs
  .readFileSync(path.join(root, "static/workspace.js"), "utf8")
  .replace(/^import .*\n/, "");
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

async function setup({ live = false, fetchImpl, transform } = {}) {
  const sample = await import(
    pathToFileURL(path.join(root, "static/sample-data.js"))
  );
  const errors = [],
    calls = [];
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: `http://localhost:3000/workspace/${live ? "" : "?preview=1"}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  const w = dom.window;
  openWindows.add(w);
  w.createSampleData = () => {
    const data = sample.createSampleData();
    return transform ? transform(data) : data;
  };
  w.samplePatch = sample.samplePatch;
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.URL.createObjectURL = () => "blob:workspace-test";
  w.URL.revokeObjectURL = () => {};
  w.EventSource = class {
    constructor(url) {
      this.url = url;
    }
    addEventListener() {}
    close() {
      this.closed = true;
    }
  };
  w.fetch = async (url, options) => {
    calls.push({ url, options });
    if (fetchImpl) return fetchImpl(url, options);
    throw Error("Sample mode must not call a live API");
  };
  w.addEventListener("error", (event) => errors.push(event.message));
  w.eval(source + "\nwindow.__workspace={state,refresh,render};");
  await tick();
  const $ = (selector) => w.document.querySelector(selector);
  const $$ = (selector) => [...w.document.querySelectorAll(selector)];
  const click = async (selector) => {
    assert.ok($(selector), `Missing control: ${selector}`);
    $(selector).click();
    await tick();
  };
  const navigate = async (view) => {
    w.location.hash = view;
    await tick();
  };
  const finish = () => {
    assert.deepEqual(errors, []);
    dom.window.close();
  };
  return { w, $, $$, click, navigate, finish, calls, errors };
}

test("all working views render without runtime errors", async () => {
  const app = await setup();
  for (const [view, title] of Object.entries({
    overview: "Security overview",
    findings: "Findings",
    reviews: "Patch reviews",
    deployments: "Deployments",
    sessions: "Shadow sessions",
    activity: "Activity log",
    configuration: "Workspace configuration",
  })) {
    await app.navigate(view);
    assert.equal(app.$("h1").textContent, title);
    assert.equal(app.$('.nav-item[aria-current="page"]').dataset.view, view);
  }
  assert.equal(app.calls.length, 0);
  app.finish();
});

test("finding search and severity/stage filters compose and can be cleared", async () => {
  const app = await setup();
  await app.navigate("findings");
  const input = app.$("#view-search");
  input.value = "product";
  input.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  assert.equal(app.$$("tbody tr").length, 3);
  const severity = app.$('[data-filter="severity"]');
  severity.value = "low";
  severity.dispatchEvent(new app.w.Event("change", { bubbles: true }));
  assert.equal(app.$$("tbody tr").length, 1);
  assert.match(app.$("tbody").textContent, /malformed product identifiers/);
  await app.click('[data-action="stage"][data-value="detected"]');
  assert.match(app.$("main").textContent, /No findings match/);
  await app.click('[data-action="clear-filters"]');
  assert.equal(app.$$("tbody tr").length, 8);
  app.finish();
});

test("operator can inspect a diff and queue an isolated sample approval", async () => {
  const app = await setup();
  await app.navigate("reviews");
  await app.click('[data-action="open-patch"][data-id="128"]');
  assert.equal(app.$("#inspector").open, true);
  assert.ok(app.$(".diff-line.add"));
  assert.match(app.$("#patch-content").textContent, /product.owner_id/);
  await app.click('[data-action="confirm-approve"]');
  assert.match(app.$("#action-confirm").textContent, /Sample workspace/);
  await app.click('[data-action="execute-approve"]');
  assert.equal(
    app.w.__workspace.state.data.items.find((it) => it.id === "128")
      .human_approved,
    true,
  );
  assert.match(app.$("#inspector-content").textContent, /Approval queued/);
  assert.equal(app.$("#review-count").textContent, "1");
  assert.equal(app.calls.length, 0);
  app.finish();
});

test("recovery records intent and never removes a deployment", async () => {
  const app = await setup();
  await app.navigate("deployments");
  await app.click('[data-action="open-item"][data-id="124"]');
  await app.click('[data-action="confirm-recovery"]');
  await app.click('[data-action="execute-recovery"]');
  const item = app.w.__workspace.state.data.items.find((it) => it.id === "124");
  assert.equal(item.stage, "deployed");
  assert.equal(item.rollback_requested, true);
  assert.match(
    app.$("#inspector-content").textContent,
    /Recovery request recorded/,
  );
  assert.equal(app.calls.length, 0);
  app.finish();
});

test("global command search supports keyboard selection and deep links", async () => {
  const app = await setup();
  await app.click('[data-action="search"]');
  const input = app.$("#command-input");
  input.value = "TN-128";
  input.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  assert.equal(app.$$("[data-command]").length, 1);
  input.dispatchEvent(
    new app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await tick();
  assert.equal(app.$("#command-dialog").open, false);
  assert.equal(app.$("#inspector").open, true);
  assert.match(app.w.location.hash, /128/);
  await app.click('[data-action="close-inspector"]');
  assert.equal(app.$("#inspector").open, false);
  app.finish();
});

test("sessions inspect retained signals including expired scores", async () => {
  const app = await setup();
  await app.navigate("sessions");
  assert.equal(app.$$("tbody tr").length, 5);
  assert.match(app.$("tbody").textContent, /Score record expired/);
  await app.click('[data-action="session"]');
  assert.match(app.$("#inspector-content").textContent, /Session activity/);
  app.finish();
});

test("activity pagination and event filtering work together", async () => {
  const app = await setup();
  await app.navigate("activity");
  const first = app.$("tbody").textContent;
  await app.click('[data-action="next"]');
  assert.notEqual(app.$("tbody").textContent, first);
  const kind = app.$('[data-filter="kind"]');
  kind.value = "reviewing";
  kind.dispatchEvent(new app.w.Event("change", { bubbles: true }));
  assert.equal(app.$$("tbody tr").length, 2);
  assert.match(app.$(".pagination").textContent, /Page 1 of 1/);
  app.finish();
});

test("appearance, density and live update preferences are persisted", async () => {
  const app = await setup();
  await app.navigate("configuration");
  await app.click('[data-action="settings-tab"][data-value="preferences"]');
  for (const [key, value] of [
    ["theme", "dark"],
    ["density", "compact"],
  ]) {
    const field = app.$(`[data-preference="${key}"]`);
    field.value = value;
    field.dispatchEvent(new app.w.Event("change", { bubbles: true }));
    assert.equal(app.w.localStorage.getItem(`trinetra.${key}`), value);
  }
  assert.equal(app.w.document.documentElement.dataset.theme, "dark");
  assert.ok(app.w.document.body.classList.contains("density-compact"));
  const live = app.$('[data-preference="autoRefresh"]');
  live.checked = false;
  live.dispatchEvent(new app.w.Event("change", { bubbles: true }));
  assert.equal(app.w.__workspace.state.autoRefresh, false);
  app.finish();
});

test("untrusted finding and event strings render as text", async () => {
  const payload = '<img src=x onerror="window.compromised=true">';
  const app = await setup({
    transform: (data) => {
      data.items[0].title = payload;
      data.items[0].evidence = payload;
      data.events.push({
        kind: payload,
        msg: payload,
        ts: String(Date.now() / 1000),
      });
      return data;
    },
  });
  assert.equal(app.$("main img"), null);
  await app.navigate("findings");
  await app.click('[data-action="open-item"][data-id="128"]');
  assert.equal(app.$("#inspector img"), null);
  assert.match(app.$("#inspector-title").textContent, /<img/);
  await app.click('[data-action="close-inspector"]');
  await app.navigate("activity");
  assert.equal(app.$("main img"), null);
  assert.equal(app.w.compromised, undefined);
  app.finish();
});

test("disconnected live workspace shows a connection path with no invented telemetry", async () => {
  const app = await setup({
    live: true,
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ detail: "Redis is unavailable" }),
    }),
  });
  assert.match(app.$("main").textContent, /Connect your application workspace/);
  assert.equal(app.$(".metrics"), null);
  assert.equal(
    app.$("#sidebar-status").textContent,
    "State store disconnected",
  );
  await app.click('[data-action="sample"]');
  assert.match(app.$("#mode-banner").textContent, /Sample workspace/);
  app.finish();
});

test("live snapshot and approval use the actual API contract", async () => {
  const sample = await import(
    pathToFileURL(path.join(root, "static/sample-data.js"))
  );
  const data = sample.createSampleData();
  const app = await setup({
    live: true,
    fetchImpl: async (url, options) => {
      if (url === "/api/workspace")
        return { ok: true, json: async () => structuredClone(data) };
      if (url === "/api/approve/128") {
        assert.equal(options.method, "POST");
        data.items[0].human_approved = true;
        data.items[0].awaiting_human = false;
        return {
          ok: true,
          json: async () => ({ ok: true, item: data.items[0] }),
        };
      }
      throw Error("Unexpected URL " + url);
    },
  });
  assert.equal(app.$("#mode-banner").hidden, true);
  await app.click('[data-action="open-item"][data-id="128"]');
  await app.click('[data-action="confirm-approve"]');
  await app.click('[data-action="execute-approve"]');
  assert.ok(app.calls.some((call) => call.url === "/api/approve/128"));
  assert.match(app.$("#inspector-content").textContent, /Approval queued/);
  app.finish();
});

test("CSS parses and local shell assets exist", () => {
  const errors = [];
  cssTree.parse(
    fs.readFileSync(path.join(root, "static/workspace.css"), "utf8"),
    { onParseError: (error) => errors.push(error.message) },
  );
  assert.deepEqual(errors, []);
  const dom = new JSDOM(html);
  const ids = [...dom.window.document.querySelectorAll("[id]")].map(
    (el) => el.id,
  );
  assert.equal(new Set(ids).size, ids.length);
  for (const node of dom.window.document.querySelectorAll(
    '[src^="./"],[href^="./"]',
  )) {
    const resource = node.getAttribute("src") || node.getAttribute("href");
    assert.ok(fs.existsSync(path.join(root, "static", resource)), resource);
  }
  dom.window.close();
});

test("stale live data remains visible and prevents operator mutations", async () => {
  const sample = await import(
    pathToFileURL(path.join(root, "static/sample-data.js"))
  );
  const data = sample.createSampleData();
  let fail = false;
  const app = await setup({
    live: true,
    fetchImpl: async () => ({
      ok: !fail,
      json: async () =>
        fail ? { detail: "Connection interrupted" } : structuredClone(data),
    }),
  });
  await app.click('[data-action="open-item"][data-id="128"]');
  fail = true;
  await app.w.__workspace.refresh();
  await tick();
  // A refresh must update an already-open inspector's action availability.
  assert.equal(app.w.__workspace.state.stale, true);
  assert.match(app.$("#mode-banner").textContent, /Connection interrupted/);
  assert.equal(app.$('[data-action="confirm-approve"]').disabled, true);
  app.w.__workspace.render();
  assert.equal(app.w.__workspace.state.data.items.length, 8);
  app.finish();
});

test("configuration remains reachable when Redis is disconnected", async () => {
  const app = await setup({
    live: true,
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ detail: "Unavailable" }),
    }),
  });
  await app.navigate("configuration");
  assert.equal(app.$("h1").textContent, "Workspace configuration");
  assert.match(app.$(".settings-panels").textContent, /Disconnected/);
  await app.click('[data-action="settings-tab"][data-value="preferences"]');
  assert.ok(app.$('[data-preference="theme"]'));
  app.finish();
});

test("closed mobile navigation is removed from keyboard access", async () => {
  const app = await setup();
  app.w.innerWidth = 375;
  app.w.dispatchEvent(new app.w.Event("resize"));
  assert.ok(app.$("#sidebar").hasAttribute("inert"));
  await app.click('[data-action="menu"]');
  assert.equal(app.$("#sidebar").hasAttribute("inert"), false);
  app.$("#sidebar-scrim").click();
  assert.ok(app.$("#sidebar").hasAttribute("inert"));
  app.finish();
});

test("a pending finding never receives an invented sample patch", async () => {
  const app = await setup();
  await app.navigate("findings");
  await app.click('[data-action="open-item"][data-id="125"]');
  await app.click('[data-action="inspector-tab"][data-value="patch"]');
  assert.match(
    app.$("#patch-content").textContent,
    /Patch artifact unavailable/,
  );
  assert.equal(app.$(".diff-file"), null);
  app.finish();
});
