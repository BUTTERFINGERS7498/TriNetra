import { createSampleData, samplePatch } from "./sample-data.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const stages = ["detected", "fixing", "reviewing", "deployed", "rejected"];
const views = {
  overview: {
    title: "Overview",
    heading: "Security overview",
    description:
      "Your application defense, from first signal to reviewed patch.",
    icon: "overview",
  },
  findings: {
    title: "Findings",
    heading: "Findings",
    description:
      "Investigate shadow evidence and follow each finding through the pipeline.",
    icon: "findings",
  },
  reviews: {
    title: "Patch reviews",
    heading: "Patch reviews",
    description:
      "Inspect the evidence, the proposed change, and the reviewer’s decision.",
    icon: "review",
  },
  deployments: {
    title: "Deployments",
    heading: "Deployments",
    description:
      "Track applied patches, rebuild handoffs, and recovery requests.",
    icon: "deploy",
  },
  sessions: {
    title: "Shadow sessions",
    heading: "Shadow sessions",
    description:
      "Sessions the gateway has routed to the isolated shadow environment.",
    icon: "sessions",
  },
  activity: {
    title: "Activity log",
    heading: "Activity log",
    description:
      "A chronological record of gateway signals and agent decisions.",
    icon: "activity",
  },
  configuration: {
    title: "Configuration",
    heading: "Workspace configuration",
    description:
      "Connection details, operating boundaries, and your console preferences.",
    icon: "settings",
  },
};
function readPreference(key, fallback) {
  try {
    return localStorage.getItem(`trinetra.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePreference(key, value) {
  try {
    localStorage.setItem(`trinetra.${key}`, value);
  } catch {
    /* Private browsing can disable storage. */
  }
}
const state = {
  view: "overview",
  mode:
    new URLSearchParams(location.search).get("preview") === "1"
      ? "sample"
      : "live",
  data: { items: [], events: [], sessions: [], queues: {}, stages },
  connected: false,
  loading: true,
  stale: false,
  stream: null,
  query: "",
  stage: "all",
  severity: "all",
  sort: "priority",
  page: 1,
  pageSize: 10,
  reviewTab: "pending",
  kind: "all",
  period: "24",
  settingsTab: "connection",
  inspectorTab: "evidence",
  selected: null,
  session: null,
  patches: new Map(),
  actionBusy: false,
  theme: readPreference("theme", "light"),
  density: readPreference("density", "comfortable"),
  autoRefresh: readPreference("autoRefresh", "true") === "true",
};
const main = $("#main");
let refreshPromise,
  refreshTimeout,
  toastTimeout,
  lastFocused,
  commandIndex = 0,
  commandItems = [],
  patchController,
  syncTime;
function applyPreferences() {
  document.documentElement.dataset.theme = state.theme;
  document.body.classList.toggle(
    "density-compact",
    state.density === "compact",
  );
  $("#theme-icon").innerHTML =
    `<use href="#i-${state.theme === "light" ? "moon" : "sun"}"/>`;
  $('[data-action="theme"]').setAttribute(
    "aria-label",
    `Switch to ${state.theme === "light" ? "dark" : "light"} theme`,
  );
}
applyPreferences();
if (!/Mac|iPhone|iPad/.test(navigator.platform))
  $("#search-shortcut").textContent = "Ctrl K";
const titleCase = (str) =>
  String(str ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const number = (value) => Number(value || 0).toLocaleString();
const pending = (it) =>
  it.stage === "reviewing" && it.pending_deploy && !it.human_approved;
const open = (it) => !["deployed", "rejected"].includes(it.stage);
const stamp = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
};
const relative = (value) => {
  const date = stamp(value);
  if (!date) return "Not recorded";
  const sec = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (sec < 60) return "Just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
};
const dateTime = (value) =>
  stamp(value)?.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) || "Not recorded";
const timeTag = (value) =>
  `<time datetime="${stamp(value)?.toISOString() || ""}" title="${escape(dateTime(value))}">${escape(relative(value))}</time>`;
function statusLabel(it) {
  if (it.human_approved && it.pending_deploy) return "Approval queued";
  if (pending(it)) return "Awaiting approval";
  if (it.stage === "deployed" && /rebuild with:/.test(it.deploy_note || ""))
    return "Rebuild required";
  return (
    {
      detected: "Detected",
      fixing: "In progress",
      reviewing: "In review",
      deployed: "Applied",
      rejected: "Rejected",
    }[it.stage] || "Unknown"
  );
}
function badge(value, label) {
  const cls = [
    ...stages,
    "critical",
    "high",
    "medium",
    "low",
    "pending",
    "neutral",
  ].includes(value)
    ? value
    : "neutral";
  return `<span class="badge ${cls}">${escape(label || titleCase(value || "Unknown"))}</span>`;
}
function itemBadge(it) {
  return badge(
    it.stage === "deployed" && /rebuild with:/.test(it.deploy_note || "")
      ? "pending"
      : it.stage,
    statusLabel(it),
  );
}
const empty = (name, title, description, action = "") =>
  `<div class="empty"><span class="empty-icon">${icon(name)}</span><h3>${escape(title)}</h3><p>${escape(description)}</p>${action}</div>`;
function toast(message, error = false) {
  clearTimeout(toastTimeout);
  $("#toasts").innerHTML =
    `<div class="toast ${error ? "error" : ""}">${icon(error ? "findings" : "check")}<span>${escape(message)}</span></div>`;
  toastTimeout = setTimeout(() => $("#toasts").replaceChildren(), 5500);
}
async function request(url, options = {}) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 9000);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: "application/json", ...options.headers },
    });
    const contentType =
      response.headers?.get("content-type") || "application/json";
    if (!contentType.includes("application/json")) {
      throw new Error(
        "The dashboard API is unavailable. Start the TriNetra dashboard to connect live.",
      );
    }
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "The request could not be completed.",
      );
    return data;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
function updateConnection() {
  const sample = state.mode === "sample",
    online = state.connected && !state.stale;
  $$(
    '#inspector [data-action="confirm-approve"], #inspector [data-action="confirm-recovery"], #inspector [data-action^="execute-"]',
  ).forEach((button) => {
    button.disabled = state.stale || state.actionBusy;
  });
  const cls = sample ? "sample" : online ? "connected" : "offline";
  for (const id of ["sidebar-dot", "footer-dot"])
    $(`#${id}`).className = `status-dot ${cls}`;
  $("#sidebar-status").textContent = sample
    ? "Sample workspace"
    : online
      ? "State store connected"
      : state.stale
        ? "Connection interrupted"
        : "State store disconnected";
  $("#footer-status").textContent = sample
    ? "Sample data · no live actions"
    : online
      ? "Connected to application state"
      : state.stale
        ? "Showing last received state"
        : "No application data available";
  $("#sync-status").textContent = syncTime
    ? `Updated ${relative(syncTime)}`
    : "TriNetra operator workspace";
  $("#finding-count").textContent = state.connected
    ? number(state.data.items.filter(open).length)
    : "—";
  const n = state.data.items.filter(pending).length;
  $("#review-count").textContent = number(n);
  $("#review-count").hidden = !n;
  const banner = $("#mode-banner");
  banner.hidden = !sample && !state.stale;
  banner.innerHTML = sample
    ? `<span>${icon("code")}<strong>Sample workspace</strong> Illustrative data for exploring the console. Changes stay in this browser session.</span><button data-action="live">Connect live workspace ${icon("arrow", "tiny")}</button>`
    : state.stale
      ? `<span>${icon("findings")}Connection interrupted. This view shows the last successfully received state.</span><button data-action="refresh">Retry connection</button>`
      : "";
}
async function refresh({ silent = false } = {}) {
  if (refreshPromise) return refreshPromise;
  const previousItem = state.selected
    ? JSON.stringify(
        state.data.items.find((it) => String(it.id) === state.selected),
      )
    : null;
  refreshPromise = (async () => {
    if (state.mode === "sample") {
      if (!state.connected || !state.data.items.length)
        state.data = createSampleData();
      state.connected = true;
      state.stale = false;
    } else {
      try {
        state.data = await request("/api/workspace");
        state.connected = true;
        state.stale = false;
        connectStream();
      } catch (error) {
        state.stale = state.connected;
        state.connected = state.connected && state.data.items !== undefined;
        if (!silent) toast(error.message, true);
      }
    }
    if (state.connected && !state.stale) syncTime = Date.now() / 1000;
    state.loading = false;
    updateConnection();
    if (!silent || !hasActiveInput()) render();
    if (
      state.selected &&
      $("#inspector").open &&
      !state.actionBusy &&
      previousItem !==
        JSON.stringify(
          state.data.items.find((it) => String(it.id) === state.selected),
        )
    )
      renderInspector(state.selected, true);
  })().finally(() => (refreshPromise = null));
  return refreshPromise;
}
function hasActiveInput() {
  return (
    main.contains(document.activeElement) &&
    ["INPUT", "SELECT"].includes(document.activeElement.tagName)
  );
}
function connectStream() {
  if (state.stream || state.mode !== "live" || !state.autoRefresh) return;
  const stream = new EventSource("/api/stream");
  state.stream = stream;
  stream.onmessage = (e) => {
    let event;
    try {
      event = JSON.parse(e.data);
    } catch {
      return;
    }
    const key = (ev) =>
      ev.id ||
      [ev.ts, ev.kind, ev.item_id || "", ev.session || "", ev.msg || ""].join(
        "|",
      );
    // Initial history replay and reconnects must not duplicate log records.
    const duplicate = state.data.events.some(
      (ev) =>
        key(ev) === key(event) ||
        [ev.ts, ev.kind, ev.item_id || "", ev.session || "", ev.msg || ""].join(
          "|",
        ) ===
          [
            event.ts,
            event.kind,
            event.item_id || "",
            event.session || "",
            event.msg || "",
          ].join("|"),
    );
    if (!duplicate) {
      state.data.events.push(event);
      state.data.events = state.data.events.slice(-200);
    }
    clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => refresh({ silent: true }), 600);
  };
  stream.addEventListener("unavailable", () => {
    state.stale = true;
    updateConnection();
  });
  stream.onerror = () => {
    state.stale = true;
    updateConnection();
  };
}
function stopStream() {
  state.stream?.close();
  state.stream = null;
  clearTimeout(refreshTimeout);
}
function heading(extra = "") {
  const view = views[state.view];
  return `<div class="page-heading"><div><h1>${view.heading}</h1><p>${view.description}</p></div><div class="page-actions">${extra}<button class="button label-hide" data-action="refresh" aria-label="Refresh workspace">${icon("refresh")}<span>Refresh</span></button><button class="button" data-action="export">${icon("download")}<span class="export-label">Export</span></button></div></div>`;
}
function render() {
  const view = views[state.view];
  document.title = `${view.title} · TriNetra`;
  $("#breadcrumb").textContent = view.title;
  $$(".nav-item[data-view]").forEach((el) => {
    const active = el.dataset.view === state.view;
    el.classList.toggle("active", active);
    active
      ? el.setAttribute("aria-current", "page")
      : el.removeAttribute("aria-current");
  });
  if (state.loading) {
    return;
  }
  if (!state.connected && state.view !== "configuration") {
    main.innerHTML = `${heading()}<section class="panel">${empty("sessions", "Connect your application workspace", "The console is ready. Start the TriNetra stack to load findings, sessions, and agent activity.", `<button class="button primary" data-action="sample">Explore sample workspace ${icon("arrow")}</button><button class="text-link" data-action="connection">View connection instructions</button>`)}</section>`;
    return;
  }
  main.innerHTML = {
    overview: renderOverview,
    findings: renderFindings,
    reviews: renderReviews,
    deployments: renderDeployments,
    sessions: renderSessions,
    activity: renderActivity,
    configuration: renderConfiguration,
  }[state.view]();
}
function renderOverview() {
  const items = state.data.items,
    active = items.filter(open),
    held = items.filter(pending),
    deployed = items.filter((it) => it.stage === "deployed");
  const critical = active.filter((it) =>
    ["high", "critical"].includes(it.severity),
  ).length;
  const metrics = [
    [
      "Open findings",
      active.length,
      `${critical} high or critical priority`,
      "findings",
    ],
    [
      "Awaiting approval",
      held.length,
      held.length ? "Ready for your review" : "No approvals waiting",
      "review",
    ],
    [
      "Shadow sessions",
      state.data.sessions.length,
      "Currently retained routing records",
      "sessions",
    ],
    [
      "Deployment records",
      deployed.length,
      "Includes operator rebuild handoffs",
      "deploy",
    ],
  ];
  const prioritized = [...active].sort(priority).slice(0, 5);
  const attention = [
    ...held.map((it) => ({
      item: it,
      title: it.title,
      note: "Patch ready for your approval",
      symbol: "review",
    })),
    ...items
      .filter((it) => it.stage === "rejected")
      .map((it) => ({
        item: it,
        title: it.title,
        note: "Review rejected · inspect feedback",
        symbol: "findings",
      })),
    ...items
      .filter(
        (it) =>
          it.stage === "deployed" && /rebuild with:/.test(it.deploy_note || ""),
      )
      .map((it) => ({
        item: it,
        title: it.title,
        note: "Fork updated · operator rebuild required",
        symbol: "deploy",
      })),
  ].slice(0, 3);
  const scale = [...state.data.events]
    .reverse()
    .find((ev) => ev.kind === "scale");
  return `${heading()}<section class="panel metrics" aria-label="Workspace metrics">${metrics.map(([label, count, note, name]) => `<div class="metric"><div class="metric-label">${label}${icon(name)}</div><div class="metric-value">${number(count)}</div><div class="metric-note">${escape(note)}</div></div>`).join("")}</section>
  <div class="overview-grid"><section class="panel activity-chart"><div class="panel-header"><div><h2>Signal activity</h2><p>Gateway observations over the last 24 hours</p></div><div class="chart-key"><span><i></i>Scoring signals</span><span><i class="diversion"></i>Shadow diversions</span></div></div>${renderChart()}</section>
  <section class="panel attention-panel"><div class="panel-header"><h2>Needs attention</h2><span class="count-pill">${attention.length}</span></div>${attention.length ? `<div class="attention-list">${attention.map((a) => `<button class="attention-row" data-action="open-item" data-id="${escape(a.item.id)}"><span class="attention-symbol">${icon(a.symbol)}</span><div><strong>${escape(a.title)}</strong><small>${a.note}</small></div>${icon("chevron")}</button>`).join("")}</div>` : empty("check", "Nothing waiting on you", "New review decisions and rebuild handoffs will appear here.")}</section></div>
  <section class="panel"><div class="panel-header"><div><h2>Priority findings</h2><p>Open findings ordered by severity and review readiness</p></div><a class="text-link" href="#findings">View all findings ${icon("arrow")}</a></div>${prioritized.length ? findingTable(prioritized, { overview: true }) : empty("shield", "No open findings", "Findings appear when the detector identifies an issue in shadow request evidence.")}</section>
  <div class="overview-bottom"><section class="panel"><div class="panel-header"><h2>Remediation pipeline</h2><span class="eyebrow">${number(items.length)} findings</span></div><div class="pipeline-summary">${stages
    .map((stage) => {
      const n = items.filter((it) => it.stage === stage).length;
      return `<a class="pipeline-node ${stage}" href="#findings" data-stage-link="${stage}"><div class="pipeline-rail"><span style="width:${items.length ? (n / items.length) * 100 : 0}%"></span></div><div class="stage-label">${titleCase(stage)}</div><div class="stage-number">${n}</div></a>`;
    })
    .join(
      "",
    )}</div><div class="pipeline-note">Detection → focused patch → review → deployment handoff.</div><div class="worker-row"><span>Queue depth <strong>${number(state.data.queues.fix)} fix · ${number(state.data.queues.review)} review</strong></span><span>${scale ? `Last observed: <strong>${escape(scale.fix_workers)} fixers · ${escape(scale.review_workers)} reviewers</strong> · ${relative(scale.ts)}` : "Waiting for worker observations"}</span></div></section>
  <section class="panel"><div class="panel-header"><h2>Recent activity</h2><a class="text-link" href="#activity">View log ${icon("arrow")}</a></div>${eventList(
    state.data.events
      .filter((ev) => !["score", "scale"].includes(ev.kind))
      .slice(-4)
      .reverse(),
  )}</section></div>`;
}
function renderChart() {
  const now = Date.now() / 1000,
    start = Math.floor(now / 3600) * 3600 - 23 * 3600;
  const buckets = Array.from({ length: 24 }, (_, i) => ({
    at: start + i * 3600,
    signals: 0,
    diversions: 0,
  }));
  for (const ev of state.data.events) {
    const index = Math.floor((Number(ev.ts) - start) / 3600);
    if (index >= 0 && index < 24) {
      if (["score", "honeypot"].includes(ev.kind)) buckets[index].signals++;
      if (ev.kind === "shadow_route") buckets[index].diversions++;
    }
  }
  const maximum = Math.max(
      4,
      ...buckets.map((b) => Math.max(b.signals, b.diversions)),
    ),
    top = Math.ceil(maximum / 4) * 4;
  const total = buckets.reduce((n, b) => n + b.signals + b.diversions, 0);
  const lines = [0, 1, 2, 3, 4]
    .map(
      (i) =>
        `<line x1="27" y1="${20 + i * 27}" x2="617" y2="${20 + i * 27}"/><text x="15" y="${23 + i * 27}" text-anchor="end">${top - (i * top) / 4}</text>`,
    )
    .join("");
  const bars = buckets
    .map((b, i) => {
      const x = 34 + i * 24.1,
        s = (b.signals / top) * 108,
        d = (b.diversions / top) * 108;
      const time = new Date(b.at * 1000).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `<g><title>${escape(time)}: ${b.signals} scoring signals, ${b.diversions} diversions</title><rect class="signal-bar" x="${x}" y="${128 - s}" width="7" height="${s}" rx="1.5"/><rect class="diversion-bar" x="${x + 9}" y="${128 - d}" width="7" height="${d}" rx="1.5"/></g>`;
    })
    .join("");
  const labels = [0, 6, 12, 18, 23]
    .map(
      (i) =>
        `<text x="${42 + i * 24.1}" y="150" text-anchor="middle">${new Date(buckets[i].at * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}</text>`,
    )
    .join("");
  return `<div class="chart"><svg viewBox="0 0 640 162" role="img" aria-label="${total} retained scoring and diversion events in the last 24 hours. ${state.mode === "sample" ? "Sample data." : "Limited to the most recent 200 events."}">${lines}${bars}${labels}</svg></div><div class="chart-caption"><span>${total} observations · most recent ${state.data.event_limit || 200} retained events</span><span>Local time · event counts</span></div>`;
}
function priority(a, b) {
  const ranking = { critical: 4, high: 3, medium: 2, low: 1 };
  return (
    (ranking[b.severity] || 0) - (ranking[a.severity] || 0) ||
    Number(pending(b)) - Number(pending(a)) ||
    Number(b.created) - Number(a.created)
  );
}
function filteredItems() {
  let items = state.data.items.filter(
    (it) =>
      (state.stage === "all" ||
        (state.stage === "open" ? open(it) : it.stage === state.stage)) &&
      (state.severity === "all" || it.severity === state.severity) &&
      [it.title, it.id, it.endpoint, it.vuln_class]
        .join(" ")
        .toLowerCase()
        .includes(state.query.toLowerCase()),
  );
  return items.sort(
    state.sort === "newest"
      ? (a, b) => Number(b.created) - Number(a.created)
      : state.sort === "oldest"
        ? (a, b) => Number(a.created) - Number(b.created)
        : priority,
  );
}
function findingTable(items, { overview = false } = {}) {
  return `<div class="table-scroll"><table aria-label="${overview ? "Priority findings" : "Findings"}"><thead><tr><th scope="col">Finding</th><th scope="col">Severity</th><th scope="col">Status</th><th scope="col">Endpoint</th><th scope="col">${overview ? "Detected" : "Updated"}</th><th scope="col"><span class="sr-only">Inspect</span></th></tr></thead><tbody>${items.map((it) => `<tr data-item="${escape(it.id)}"><td><div class="finding-name"><span class="severity-mark ${["critical", "high", "medium", "low"].includes(it.severity) ? it.severity : "low"}"></span><div><button class="finding-open" data-action="open-item" data-id="${escape(it.id)}">${escape(it.title || "Untitled finding")}</button><div class="finding-secondary"><span class="mono">TN-${escape(it.id)}</span><span>·</span><span>${escape(it.vuln_class || "Unclassified")}</span></div></div></div></td><td>${badge(it.severity)}</td><td>${itemBadge(it)}</td><td><code>${escape(it.endpoint || "—")}</code></td><td class="activity-time">${timeTag(overview ? it.created : it.updated || it.created)}</td><td><button class="icon-button" data-action="open-item" data-id="${escape(it.id)}" aria-label="Inspect finding TN-${escape(it.id)}">${icon("chevron", "row-chevron")}</button></td></tr>`).join("")}</tbody></table></div>`;
}
function select(name, label, values, current) {
  return `<select name="${name}" data-filter="${name}" aria-label="${label}">${values.map(([value, text]) => `<option value="${value}" ${value === current ? "selected" : ""}>${text}</option>`).join("")}</select>`;
}
function searchInput(placeholder) {
  return `<label class="filter-input">${icon("search")}<input type="search" id="view-search" placeholder="${placeholder}" aria-label="${placeholder}" value="${escape(state.query)}" autocomplete="off"></label>`;
}
function pagination(count) {
  const pages = Math.max(1, Math.ceil(count / state.pageSize));
  state.page = Math.min(state.page, pages);
  return `<div class="table-footer"><span>${count ? `${(state.page - 1) * state.pageSize + 1}–${Math.min(state.page * state.pageSize, count)} of ${number(count)}` : "0"} records</span><div class="pagination"><span>Page ${state.page} of ${pages}</span><button class="icon-button" data-action="previous" ${state.page === 1 ? "disabled" : ""} aria-label="Previous page"><svg class="icon tiny" style="transform:rotate(180deg)"><use href="#i-chevron"/></svg></button><button class="icon-button" data-action="next" ${state.page === pages ? "disabled" : ""} aria-label="Next page">${icon("chevron", "tiny")}</button></div></div>`;
}
function pageOf(items) {
  state.page = Math.min(
    state.page,
    Math.max(1, Math.ceil(items.length / state.pageSize)),
  );
  return items.slice(
    (state.page - 1) * state.pageSize,
    state.page * state.pageSize,
  );
}
function renderFindings() {
  const items = filteredItems(),
    tabs = [
      ["all", "All findings"],
      ["open", "Open"],
      ...stages.map((stage) => [stage, titleCase(stage)]),
    ];
  return `${heading()}<section class="panel"><div class="tabs" aria-label="Filter findings by stage">${tabs.map(([value, label]) => `<button class="tab ${state.stage === value ? "active" : ""}" data-action="stage" data-value="${value}" aria-pressed="${state.stage === value}">${label}<span class="count-pill">${state.data.items.filter((it) => value === "all" || (value === "open" ? open(it) : it.stage === value)).length}</span></button>`).join("")}</div><div class="filter-bar">${searchInput("Search findings…")}${select(
    "severity",
    "Filter by severity",
    [
      ["all", "All severities"],
      ["critical", "Critical"],
      ["high", "High"],
      ["medium", "Medium"],
      ["low", "Low"],
    ],
    state.severity,
  )}${select(
    "sort",
    "Sort findings",
    [
      ["priority", "Priority first"],
      ["newest", "Newest first"],
      ["oldest", "Oldest first"],
    ],
    state.sort,
  )}<span class="result-count">${number(items.length)} findings</span></div>${items.length ? findingTable(pageOf(items)) : empty("search", "No findings match", "Try another search or clear the current filters.", `<button class="button small" data-action="clear-filters">Clear filters</button>`)}${pagination(items.length)}</section>`;
}
function renderReviews() {
  const all = state.data.items.filter((it) => it.stage === "reviewing"),
    items = all.filter(
      (it) =>
        state.reviewTab === "all" ||
        (state.reviewTab === "pending" ? pending(it) : it.human_approved),
    );
  return `${heading()}<div class="review-summary"><div class="notice">${icon("shield")}<span>Operator approval queues the reviewer for a final static safety check. The deployment behavior follows the configured application mode.</span></div></div><div class="reviews-layout"><section class="panel"><div class="tabs"><button class="tab ${state.reviewTab === "pending" ? "active" : ""}" data-action="review-tab" data-value="pending" aria-pressed="${state.reviewTab === "pending"}">Awaiting approval <span class="count-pill">${all.filter(pending).length}</span></button><button class="tab ${state.reviewTab === "queued" ? "active" : ""}" data-action="review-tab" data-value="queued" aria-pressed="${state.reviewTab === "queued"}">Approval queued <span class="count-pill">${all.filter((it) => it.human_approved).length}</span></button><button class="tab ${state.reviewTab === "all" ? "active" : ""}" data-action="review-tab" data-value="all" aria-pressed="${state.reviewTab === "all"}">All in review <span class="count-pill">${all.length}</span></button></div>${
    items.length
      ? items
          .sort(priority)
          .map(
            (it) =>
              `<article class="review-item"><div class="review-item-top"><span class="mono" style="color:var(--muted)">TN-${escape(it.id)}</span>${badge(it.severity)}${itemBadge(it)}</div><h3><button class="finding-open" data-action="open-item" data-id="${escape(it.id)}" style="font-size:14px">${escape(it.title)}</button></h3><p>${escape(it.explanation || "The reviewer is assessing the proposed patch. Review reasoning will appear when available.")}</p><div class="review-item-footer"><span class="review-file">${icon("code")}${escape(it.changed_paths?.length ? `${it.changed_paths.length} file${it.changed_paths.length > 1 ? "s" : ""} changed` : "Patch details pending")}<span>· ${relative(it.updated || it.created)}</span></span><button class="button ${pending(it) ? "primary" : ""}" data-action="open-patch" data-id="${escape(it.id)}">Inspect patch ${icon("arrow")}</button></div></article>`,
          )
          .join("")
      : empty(
          "review",
          state.reviewTab === "queued"
            ? "No approvals queued"
            : "Review queue is clear",
          "Patches appear here after the fixer prepares a change and the reviewer evaluates it.",
        )
  }</section><aside class="panel review-policy"><div class="panel-header"><h2>Review process</h2></div><div class="policy-step"><strong>${icon("findings")}01 · Evidence</strong><p>Start with the detector finding and the shadow request evidence.</p></div><div class="policy-step"><strong>${icon("code")}02 · Proposed change</strong><p>Inspect the actual file diff. Keep changes focused on the reported weakness.</p></div><div class="policy-step"><strong>${icon("shield")}03 · Reviewer verdict</strong><p>Read the model’s reasoning. Static signatures and path guards remain in force.</p></div><div class="policy-step"><strong>${icon("deploy")}04 · Deployment</strong><p>Demo files support hot reload. Compiled services require an operator rebuild.</p></div></aside></div>`;
}
function filteredDeployments() {
  return state.data.items
    .filter(
      (it) =>
        it.stage === "deployed" &&
        [it.title, it.id, ...(it.changed_paths || [])]
          .join(" ")
          .toLowerCase()
          .includes(state.query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.deployed_at || b.created) - Number(a.deployed_at || a.created),
    );
}
function renderDeployments() {
  const items = filteredDeployments();
  return `${heading()}<div class="review-summary"><div class="notice">${icon("deploy")}<span>A deployment record reflects the reviewer’s handoff. “Rebuild required” means the source was updated; an operator must still rebuild the service.</span></div></div><section class="panel"><div class="filter-bar">${searchInput("Search deployments…")}<span class="result-count">${items.length} deployment records</span></div>${
    items.length
      ? `<div class="table-scroll"><table aria-label="Deployment records"><thead><tr><th>Patch</th><th>Delivery status</th><th>Files</th><th>Recorded</th><th><span class="sr-only">Inspect</span></th></tr></thead><tbody>${pageOf(
          items,
        )
          .map(
            (it) =>
              `<tr data-item="${escape(it.id)}"><td><button class="finding-open deploy-title" data-action="open-item" data-id="${escape(it.id)}">${escape(it.title)}</button><div class="finding-secondary"><span class="mono">TN-${escape(it.id)}</span>${it.rollback_requested ? "<span>· Recovery requested</span>" : ""}</div></td><td>${itemBadge(it)}<p class="deployment-note">${/rebuild with:/.test(it.deploy_note || "") ? "Source written to fork; service rebuild pending." : "Files copied for application hot reload."}</p></td><td><span class="mono">${it.changed_paths?.length ?? "—"} files</span></td><td class="activity-time">${timeTag(it.deployed_at || it.updated)}</td><td><button class="icon-button" data-action="open-item" data-id="${escape(it.id)}" aria-label="Inspect deployment TN-${escape(it.id)}">${icon("chevron")}</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : empty(
          "deploy",
          "No deployment records",
          "Approved changes will appear here with their delivery notes and recovery command.",
        )
  }${pagination(items.length)}</section>`;
}
function filteredSessions() {
  return state.data.sessions
    .filter((s) =>
      [s.session, s.last_reason]
        .join(" ")
        .toLowerCase()
        .includes(state.query.toLowerCase()),
    )
    .sort((a, b) => Number(b.score) - Number(a.score));
}
function renderSessions() {
  const sessions = filteredSessions();
  return `${heading()}<section class="panel"><div class="filter-bar">${searchInput("Search sessions or signals…")}<span class="result-count">${sessions.length} retained sessions</span></div>${
    sessions.length
      ? `<div class="table-scroll"><table class="session-table" aria-label="Shadow session routing"><thead><tr><th>Session identifier</th><th>Routing</th><th>Threat score</th><th>Last recorded signal</th><th><span class="sr-only">Inspect</span></th></tr></thead><tbody>${pageOf(
          sessions,
        )
          .map(
            (s) =>
              `<tr data-session="${escape(s.session)}"><td><button class="finding-open mono" data-action="session" data-id="${escape(s.session)}">${escape(s.session)}</button><div class="finding-secondary">${s.updated ? relative(s.updated) : "Signal time not recorded"}</div></td><td>${badge("reviewing", "Shadow")}</td><td>${renderScore(s)}</td><td style="color:var(--secondary)">${escape(s.last_reason || (s.score_expired ? "Score record expired" : "Not recorded"))}</td><td><button class="icon-button" data-action="session" data-id="${escape(s.session)}" aria-label="Inspect session ${escape(s.session)}">${icon("chevron")}</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : empty(
          "sessions",
          "No matching shadow sessions",
          "Sessions appear after the gateway records a diversion decision.",
        )
  }${pagination(sessions.length)}</section><p class="sessions-note">Routing membership is retained independently of expiring threat scores. A zero score does not mean the session has returned to production.</p>`;
}
function renderScore(s) {
  return `<span class="score"><span class="mono">${s.score_expired ? "—" : escape(s.score)}</span><span class="score-track ${Number(s.score) >= 25 ? "high" : ""}"><span style="width:${(Math.min(Math.max(Number(s.score) || 0, 0), 50) / 50) * 100}%"></span></span></span>`;
}
const eventIcon = (kind) =>
  ({
    detected: "findings",
    fixing: "code",
    reviewing: "review",
    deployed: "deploy",
    rejected: "close",
    rollback: "refresh",
    shadow_route: "sessions",
    score: "activity",
    honeypot: "shield",
    error: "findings",
    scale: "deploy",
    worker: "settings",
  })[kind] || "activity";
function eventList(events) {
  return events.length
    ? `<div class="event-list">${events.map((ev) => `<div class="event-entry"><span class="event-node">${icon(eventIcon(ev.kind))}</span><div><strong title="${escape(ev.msg || ev.reason || titleCase(ev.kind))}">${escape(ev.msg || ev.reason || titleCase(ev.kind))}</strong><small>${escape(titleCase(ev.kind))}${ev.item_id ? ` · TN-${escape(ev.item_id)}` : ""}</small></div>${timeTag(ev.ts)}</div>`).join("")}</div>`
    : empty(
        "activity",
        "Waiting for activity",
        "Gateway and agent events will appear as the application runs.",
      );
}
function filteredEvents() {
  const cutoff =
    state.period === "all"
      ? 0
      : Date.now() / 1000 - Number(state.period) * 3600;
  return state.data.events
    .filter(
      (ev) =>
        (state.kind === "all" || ev.kind === state.kind) &&
        Number(ev.ts) >= cutoff &&
        [ev.msg, ev.reason, ev.kind, ev.item_id, ev.session, ev.component]
          .join(" ")
          .toLowerCase()
          .includes(state.query.toLowerCase()),
    )
    .sort((a, b) => Number(b.ts) - Number(a.ts));
}
function renderActivity() {
  const events = filteredEvents(),
    kinds = [...new Set(state.data.events.map((ev) => ev.kind))].sort();
  return `${heading()}<section class="panel"><div class="filter-bar">${searchInput("Search activity…")}${select("kind", "Filter by event kind", [["all", "All event types"], ...kinds.map((kind) => [kind, titleCase(kind)])], state.kind)}${select(
    "period",
    "Filter by event time",
    [
      ["1", "Last hour"],
      ["24", "Last 24 hours"],
      ["all", "All retained events"],
    ],
    state.period,
  )}<span class="result-count">${events.length} events</span></div>${
    events.length
      ? `<div class="table-scroll"><table aria-label="Application activity log"><thead><tr><th>Time</th><th>Event</th><th>Message</th><th>Related record</th></tr></thead><tbody>${pageOf(
          events,
        )
          .map(
            (ev) =>
              `<tr><td class="activity-time" title="${escape(dateTime(ev.ts))}">${escape(stamp(ev.ts)?.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) || "—")}<div class="finding-secondary">${stamp(ev.ts)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) || ""}</div></td><td><span class="activity-kind">${icon(eventIcon(ev.kind))}${escape(titleCase(ev.kind))}</span></td><td class="event-message">${escape(ev.msg || ev.reason || "No message recorded")}</td><td>${ev.item_id ? `<button class="text-link mono" data-action="open-item" data-id="${escape(ev.item_id)}">TN-${escape(ev.item_id)} ${icon("chevron")}</button>` : ev.session ? `<button class="text-link mono" data-action="session" data-id="${escape(ev.session)}">${escape(String(ev.session).slice(0, 10))}…</button>` : '<span style="color:var(--muted)">—</span>'}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : empty(
          "activity",
          "No matching events",
          "Try a different event type, time range, or search.",
        )
  }${pagination(events.length)}</section><p class="sessions-note">The console loads the most recent 200 events. This view is a working event log, not a complete audit archive.</p>`;
}
function settingRow(title, description, value) {
  return `<div class="settings-row"><div><h3>${title}</h3><p>${description}</p></div><div class="settings-value">${value}</div></div>`;
}
function renderConfiguration() {
  const nav = [
    ["connection", "Connection"],
    ["workflow", "Workflow & boundaries"],
    ["preferences", "Appearance & behavior"],
  ];
  let content;
  if (state.settingsTab === "preferences")
    content = `<section class="panel"><div class="panel-header"><div><h2>Console preferences</h2><p>Saved in this browser</p></div></div>${settingRow("Color theme", "Choose the surface that is most comfortable for your work.", `<select data-preference="theme" aria-label="Color theme"><option value="light" ${state.theme === "light" ? "selected" : ""}>Light</option><option value="dark" ${state.theme === "dark" ? "selected" : ""}>Dark</option></select>`)}${settingRow("Table density", "Adjust row spacing for scanning longer lists.", `<select data-preference="density" aria-label="Table density"><option value="comfortable" ${state.density === "comfortable" ? "selected" : ""}>Comfortable</option><option value="compact" ${state.density === "compact" ? "selected" : ""}>Compact</option></select>`)}${settingRow("Live updates", "Listen to application events and refresh observed state. Manual refresh is always available.", `<input type="checkbox" data-preference="autoRefresh" aria-label="Enable live updates" ${state.autoRefresh ? "checked" : ""}>`)}</section>`;
  else if (state.settingsTab === "workflow")
    content = `<section class="panel"><div class="panel-header"><h2>Application workflow</h2><span class="badge neutral">Read only</span></div>${settingRow("Detection", "The detector analyzes sanitized metadata from the shadow request log.", "Shadow evidence")}${settingRow("Patch preparation", "The fixer modifies existing source files inside the configured fork.", "Sandboxed fork")}${settingRow("Review", "A separate review stage checks correctness, scope, and safety. Model assignments are managed in config/llm.yaml.", "Model + static gate")}${settingRow("Operator approval", "When REQUIRE_HUMAN_APPROVAL is enabled on the orchestrator, approved patches wait in the review queue.", "Deployment setting")}${settingRow("Delivery", "Demo mode copies files for hot reload. Compiled-service mode records a rebuild command for the operator.", "Mode dependent")}${settingRow("Recovery", "A recovery request records intent and the associated command. It does not restore files or run commands.", "Operator action")}</section><div class="notice">${icon("settings")}<span>Runtime settings live in the service environment and repository configuration. This console does not modify infrastructure, model credentials, or deployment policy.</span></div>`;
  else
    content = `<section class="panel"><div class="panel-header"><h2>Workspace connection</h2>${badge(state.mode === "sample" ? "reviewing" : !state.connected || state.stale ? "pending" : "deployed", state.mode === "sample" ? "Sample data" : !state.connected ? "Disconnected" : state.stale ? "Interrupted" : "Connected")}</div><div class="connection-diagram"><div class="connection-node">${icon("overview")}Operator console</div>${icon("arrow")}<div class="connection-node">${icon("code")}Dashboard API</div>${icon("arrow")}<div class="connection-node">${icon("sessions")}Redis state</div></div>${settingRow("Data source", "The dashboard reads the same Redis state as the gateway and orchestrator.", state.mode === "sample" ? "Browser sample" : escape(location.origin))}${settingRow("Live event stream", "Gateway and agent events arrive through the dashboard event stream.", state.mode === "sample" ? "Disabled in sample" : !state.connected ? "Waiting for connection" : state.autoRefresh ? "Enabled" : "Paused by preference")}${settingRow("Patch artifacts", "Proposed file changes and source baselines are read through read-only mounts.", "Read-only inspection")}${settingRow("Access boundary", "Use your deployment’s authenticated access proxy for this operator console. The repository does not yet provide user accounts.", "Deployment managed")}</section><section class="panel"><div class="panel-header"><h2>Review data</h2></div>${settingRow("Sample workspace", "Explore an isolated example without writing to the application state.", `<button class="button small" data-action="${state.mode === "sample" ? "live" : "sample"}">${state.mode === "sample" ? "Connect live" : "Open sample"}</button>`)}</section>`;
  return `${heading()}<div class="settings-layout"><nav class="settings-nav" aria-label="Configuration sections">${nav.map(([value, label]) => `<button class="${state.settingsTab === value ? "active" : ""}" data-action="settings-tab" data-value="${value}" aria-pressed="${state.settingsTab === value}">${label}</button>`).join("")}</nav><div class="settings-panels">${content}</div></div>`;
}

function inspectorTop(label, id) {
  return `<div class="inspector-header"><div class="inspector-id">${icon(state.session ? "sessions" : "findings")}<span>${escape(label)}</span></div><div style="display:flex;gap:6px">${!state.session ? `<button class="icon-button" data-action="copy-link" aria-label="Copy finding link">${icon("link")}</button>` : ""}<button class="icon-button" data-action="close-inspector" aria-label="Close inspector">${icon("close")}</button></div></div>`;
}
function renderInspector(id, keep = false) {
  const item = state.data.items.find((it) => String(it.id) === String(id));
  if (!item) {
    if (!keep) toast("This finding is no longer available.", true);
    return;
  }
  state.selected = String(id);
  state.session = null;
  const dialog = $("#inspector"),
    scroll = dialog.scrollTop;
  const tabs = [
    ["evidence", "Finding"],
    ["patch", "Proposed patch"],
    ["timeline", "Timeline"],
  ];
  let body = "";
  if (state.inspectorTab === "evidence")
    body = `<dl class="detail-properties"><dt>Status</dt><dd>${itemBadge(item)}</dd><dt>Endpoint</dt><dd><code>${escape(item.endpoint || "Not recorded")}</code></dd><dt>Class</dt><dd>${escape(item.vuln_class || "Unclassified")}</dd><dt>Detected</dt><dd>${escape(dateTime(item.created))}</dd><dt>Changed files</dt><dd>${item.changed_paths?.length ? item.changed_paths.map((path) => `<code>${escape(path)}</code>`).join("<br>") : "No patch prepared yet"}</dd></dl><section class="detail-section"><h3>Observed evidence</h3><p>${escape(item.evidence || "No request evidence was recorded for this finding.")}</p></section><section class="detail-section"><h3>Recommended approach</h3><p>${escape(item.recommendation || "No recommendation was recorded.")}</p></section>${item.explanation ? `<section class="detail-section"><h3>Patch explanation</h3><p>${escape(item.explanation)}</p></section>` : ""}${item.review_reasoning ? `<section class="detail-section"><h3>Reviewer reasoning</h3><p>${escape(item.review_reasoning)}</p></section>` : ""}${item.review_feedback ? `<section class="detail-section"><h3>Revision feedback</h3><p>${escape(item.review_feedback)}</p>${item.fix_attempts ? `<div class="notice">${icon("refresh")}<span>${escape(item.fix_attempts)} revision attempt${item.fix_attempts === 1 ? "" : "s"} recorded.</span></div>` : ""}</section>` : ""}${item.error ? `<section class="detail-section"><h3>Processing issue</h3><div class="notice warn">${icon("findings")}<span>${escape(item.error)}</span></div></section>` : ""}${item.stage === "deployed" ? deploymentDetail(item) : ""}`;
  if (state.inspectorTab === "patch")
    body = `<div id="patch-content" class="patch-loading"><div class="inline-loading"><span class="spinner"></span>Loading the stored patch artifact…</div></div>`;
  if (state.inspectorTab === "timeline") {
    const events = state.data.events
      .filter((ev) => String(ev.item_id) === String(id))
      .sort((a, b) => Number(b.ts) - Number(a.ts));
    body = `<p style="font-size:11px;color:var(--muted);margin-bottom:15px">Timeline within the most recent ${state.data.event_limit || 200} retained events.</p>${eventList(events)}<div class="detail-section"><h3>Record created</h3><p>${escape(dateTime(item.created))}</p></div>`;
  }
  $("#inspector-content").innerHTML =
    `${inspectorTop("TN-" + item.id, item.id)}<div class="inspector-body" style="padding-bottom:0"><div class="inspector-heading">${badge(item.severity)}<span class="mono" style="color:var(--muted)">TN-${escape(item.id)}</span>${state.mode === "sample" ? '<span class="badge neutral">Sample finding</span>' : ""}</div><h2 id="inspector-title">${escape(item.title || "Untitled finding")}</h2></div><div class="inspector-tabs">${tabs.map(([value, label]) => `<button class="tab ${state.inspectorTab === value ? "active" : ""}" data-action="inspector-tab" data-value="${value}" aria-pressed="${state.inspectorTab === value}">${label}${value === "patch" && item.changed_paths?.length ? ` <span class="count-pill">${item.changed_paths.length}</span>` : ""}</button>`).join("")}</div><div class="inspector-body">${body}</div><div id="action-confirm"></div>${inspectorAction(item)}`;
  if (!dialog.open) {
    lastFocused = document.activeElement;
    dialog.showModal();
    dialog.scrollTop = 0;
  } else if (keep) dialog.scrollTop = scroll;
  if (state.inspectorTab === "patch") loadPatch(item);
}
function deploymentDetail(item) {
  return `<section class="detail-section"><h3>Delivery record</h3><p>${escape(item.deploy_note || "No delivery note was recorded.")}</p>${item.deployed_at ? `<p style="margin-top:6px;color:var(--muted)">${escape(dateTime(item.deployed_at))}</p>` : ""}<div class="notice">${icon("deploy")}<span>${/rebuild with:/.test(item.deploy_note || "") ? "The fork contains the change. Run the recorded rebuild command in the appropriate environment to deliver it to the service." : "The reviewer recorded a hot-reload handoff. This record does not independently verify the application’s runtime health."}</span></div></section><section class="detail-section"><h3>Recorded recovery command</h3><div class="diff-file"><div class="diff-file-header"><span>${icon("code")}Operator command</span>${item.rollback_cmd && item.rollback_cmd !== "n/a" ? '<button class="icon-button" data-action="copy-recovery" aria-label="Copy recovery command">' + icon("copy") + "</button>" : ""}</div><pre class="diff-code" style="padding:12px;white-space:pre-wrap">${escape(item.rollback_cmd || "No recovery command was recorded.")}</pre></div><p style="margin-top:10px;font-size:10px">Review the command and the available backups before using it. The workspace does not execute this command.</p>${item.rollback_requested ? `<div class="notice warn">${icon("clock")}<span>Recovery requested ${escape(relative(item.rollback_requested_at))}. File restoration requires an operator.</span></div>` : ""}</section>`;
}
function inspectorAction(item) {
  if (pending(item))
    return `<div class="inspector-action"><div><strong>Ready for an operator decision</strong><p>The reviewer’s static gate runs again before delivery.</p></div><button class="button primary" data-action="confirm-approve" ${state.stale ? "disabled" : ""}>${icon("check")}Approve patch</button></div>`;
  if (item.stage === "deployed")
    return `<div class="inspector-action"><div><strong>${item.rollback_requested ? "Recovery request recorded" : "Deployment handoff recorded"}</strong><p>${item.rollback_requested ? "An operator must complete restoration." : "Inspect delivery notes and the recorded recovery command."}</p></div>${item.rollback_requested ? "" : `<button class="button" data-action="confirm-recovery" ${state.stale ? "disabled" : ""}>${icon("refresh")}Request recovery</button>`}</div>`;
  return `<div class="inspector-action"><div><strong>${item.human_approved ? "Approval queued" : item.stage === "rejected" ? "Patch rejected" : "Pipeline in progress"}</strong><p>${item.human_approved ? "The reviewer will check the patch before the deployment handoff." : item.stage === "rejected" ? "Read the reviewer’s feedback before taking further action." : "New evidence and agent decisions will appear as they are recorded."}</p></div><button class="button" data-action="close-inspector">Close</button></div>`;
}
async function loadPatch(item) {
  const key = [item.id, item.updated || item.created, state.mode].join(":");
  let artifact = state.patches.get(key);
  if (!artifact) {
    patchController?.abort();
    patchController = new AbortController();
    try {
      artifact =
        state.mode === "sample"
          ? samplePatch(item)
          : await request(
              `/api/findings/${encodeURIComponent(item.id)}/patch`,
              { signal: patchController.signal },
            );
      state.patches.set(key, artifact);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (state.selected === String(item.id) && $("#patch-content"))
        $("#patch-content").innerHTML =
          `<div class="notice warn">${icon("findings")}<span>${escape(error.message)}</span></div><button class="button small" data-action="retry-patch" style="margin-top:12px">Retry inspection</button>`;
      return;
    }
  }
  if (state.selected !== String(item.id) || !$("#patch-content")) return;
  if (!artifact.available || !artifact.files.length) {
    $("#patch-content").innerHTML = empty(
      "code",
      "Patch artifact unavailable",
      "The fixer may still be preparing the change. Existing deployments may not have a mounted artifact.",
    );
    return;
  }
  $("#patch-content").innerHTML =
    `${state.mode === "sample" ? `<div class="notice">${icon("code")}<span>This is an illustrative patch for exploring review. It is not a finding against the current project source.</span></div>` : ""}${artifact.files
      .map(
        (file, i) =>
          `<div class="diff-file"><div class="diff-file-header"><span>${icon("code")}<code>${escape(file.path)}</code></span><button class="icon-button" data-action="copy-patch" data-file="${i}" aria-label="Copy proposed contents of ${escape(file.path)}">${icon("copy")}</button></div>${
            file.baseline
              ? `<pre class="diff-code" aria-label="Unified diff for ${escape(file.path)}">${(
                  file.diff || "No differences from the recorded baseline."
                )
                  .split("\n")
                  .map(
                    (line) =>
                      `<span class="diff-line ${line.startsWith("+++") || line.startsWith("---") ? "file" : line.startsWith("+") ? "add" : line.startsWith("-") ? "remove" : line.startsWith("@@") ? "hunk" : ""}">${escape(line) || " "}</span>`,
                  )
                  .join("")}</pre>`
              : `<div class="notice" style="border:0;border-radius:0">${icon("help")}<span>No pre-change baseline is available. Showing proposed file contents.</span></div><pre class="diff-code" style="padding:12px">${escape(file.new_contents)}</pre>`
          }</div>`,
      )
      .join(
        "",
      )}<p style="font-size:10px;color:var(--muted);margin-top:14px">Read-only artifact inspection. ${artifact.files.some((f) => f.baseline === "current fork") ? "The baseline is the current fork and may have changed since proposal." : "Recorded baselines are captured before the proposed change is applied."}</p>`;
}
function showSession(id) {
  const recorded = state.data.sessions.find((s) => s.session === id);
  const session = recorded || { session: id, score: 0, score_expired: true };
  state.session = id;
  state.selected = null;
  const events = state.data.events
    .filter((ev) => ev.session === id)
    .sort((a, b) => Number(b.ts) - Number(a.ts));
  $("#inspector-content").innerHTML =
    `${inspectorTop("Shadow session", id)}<div class="inspector-body session-details">${badge(recorded ? "reviewing" : "neutral", recorded ? "Shadow route" : "Event record")}<h2 id="inspector-title" class="mono" style="margin-top:14px;font-size:18px;overflow-wrap:anywhere">${escape(id)}</h2><dl class="detail-properties"><dt>Routing</dt><dd>${recorded ? "Retained shadow membership" : "No retained shadow membership"}</dd><dt>Threat score</dt><dd>${renderScore(session)}</dd><dt>Last reason</dt><dd>${escape(session.last_reason || "Not recorded")}</dd><dt>Updated</dt><dd>${escape(dateTime(session.updated))}</dd></dl><div class="notice">${icon("shield")}<span>${recorded ? "Routing stays in shadow independently of the expiring score. The console does not release sessions to production." : "This session appears in retained events. Its current routing decision is not available in the workspace snapshot."}</span></div><section class="detail-section"><h3>Session activity</h3>${eventList(events)}</section></div>`;
  const dialog = $("#inspector");
  if (!dialog.open) {
    lastFocused = document.activeElement;
    dialog.showModal();
  }
  dialog.scrollTop = 0;
}
function closeInspector() {
  patchController?.abort();
  state.selected = null;
  state.session = null;
  $("#inspector").close();
  if (location.hash.split("/").length > 1)
    history.replaceState(null, "", `#${state.view}`);
  if (lastFocused?.isConnected) lastFocused.focus();
}
function confirmAction(action) {
  const item = state.data.items.find((it) => String(it.id) === state.selected);
  if (!item || state.actionBusy) return;
  const approve = action === "approve";
  $("#action-confirm").innerHTML =
    `<section class="action-confirm" aria-label="Confirm ${approve ? "patch approval" : "recovery request"}"><h3>${approve ? "Approve this proposed patch?" : "Record a recovery request?"}</h3><p>${state.mode === "sample" ? "<strong>Sample workspace:</strong> this changes only the browser’s example record. " : ""}${approve ? "The patch will be queued for the reviewer’s static safety gate and the configured deployment handoff. Review the evidence, file changes, and target environment first." : "This records your request and the associated command. An operator must inspect the backups and restore the files; this action does not perform restoration."}</p><div><button class="button" data-action="cancel-confirm">Cancel</button><button class="button ${approve ? "primary" : "danger"}" data-action="execute-${action}">${approve ? "Confirm approval" : "Record request"}</button></div></section>`;
  $("#action-confirm").scrollIntoView({
    block: "nearest",
    behavior: "instant",
  });
  $('[data-action="cancel-confirm"]')?.focus();
}
async function executeAction(action) {
  if (state.actionBusy || state.stale) return;
  state.actionBusy = true;
  const item = state.data.items.find((it) => String(it.id) === state.selected);
  if (!item) {
    state.actionBusy = false;
    return;
  }
  const button = $(`[data-action="execute-${action}"]`);
  if (button) {
    button.disabled = true;
    button.textContent = "Saving…";
  }
  try {
    if (state.mode === "sample") {
      const ts = String(Date.now() / 1000);
      if (action === "approve")
        Object.assign(item, {
          human_approved: true,
          awaiting_human: false,
          approved_at: ts,
          updated: ts,
        });
      else
        Object.assign(item, {
          rollback_requested: true,
          rollback_requested_at: ts,
          updated: ts,
        });
      state.data.events.push({
        id: `sample-action-${ts}`,
        kind: action === "approve" ? "reviewing" : "rollback",
        ts,
        item_id: item.id,
        msg:
          action === "approve"
            ? "Sample operator approval queued"
            : "Sample recovery request recorded; manual action required",
      });
      if (action === "approve") state.data.queues.review++;
      render();
      updateConnection();
    } else {
      const result = await request(
        `/api/${action === "approve" ? "approve" : "rollback"}/${encodeURIComponent(item.id)}`,
        { method: "POST" },
      );
      Object.assign(item, result.item);
      await refresh();
    }
    toast(
      state.mode === "sample"
        ? "Sample record updated. No live action was taken."
        : action === "approve"
          ? "Approval queued for the reviewer."
          : "Recovery request recorded. Manual restoration is still required.",
    );
    renderInspector(item.id, true);
  } catch (error) {
    toast(error.message, true);
    if (button) {
      button.disabled = false;
      button.textContent =
        action === "approve" ? "Confirm approval" : "Record request";
    }
  } finally {
    state.actionBusy = false;
  }
}
function showUtility(type) {
  let title, body;
  if (type === "connection") {
    title = "Connect your application";
    body = `<p>The workspace is served by the existing TriNetra dashboard. It reads findings, routing decisions, and agent events from the application’s Redis store.</p><div class="diff-file"><div class="diff-file-header"><span>${icon("code")}From the repository root</span></div><pre class="diff-code" style="padding:14px">docker compose up -d --build

# Workspace
http://localhost:3000/workspace/</pre></div><div class="notice">${icon("help")}<span>Use the repository’s setup guide to prepare the fork and service credentials before starting the full stack. For a standalone dashboard, set REDIS_URL to the application state store.</span></div><div style="display:flex;gap:9px;margin-top:20px"><button class="button primary" data-action="retry-connection">Retry connection</button><button class="button" data-action="sample">Open sample workspace</button></div>`;
  } else {
    title = "A workspace for application defense";
    const steps = [
      [
        "Investigate a finding",
        "Open a finding to read the detector’s evidence, endpoint, and recommendation. Severity indicates the detector’s classification.",
      ],
      [
        "Inspect the proposed patch",
        "Use Proposed patch to inspect the stored file diff and the reviewer’s reasoning. Changes are read through a sandboxed, read-only artifact endpoint.",
      ],
      [
        "Make an operator decision",
        "Patches held for human approval can be queued for a final reviewer check. Demo hot reload and compiled-service rebuilds follow the existing runtime configuration.",
      ],
      [
        "Follow delivery and activity",
        "Deployment notes show what the reviewer handed off. Recovery requests record intent; restoring files remains an operator action.",
      ],
    ];
    body = `<p>Follow the same evidence → patch → review → delivery workflow as the TriNetra runtime.</p>${steps.map(([title, text], i) => `<div class="guide-item"><span class="guide-number">0${i + 1}</span><div><h3>${title}</h3><p>${text}</p></div></div>`).join("")}<div class="notice">${icon("search")}<span><kbd>${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl"} K</kbd> searches findings, sessions, and pages. <kbd>Esc</kbd> closes panels. Appearance and live-update preferences are saved in this browser.</span></div>`;
  }
  $("#utility-content").innerHTML =
    `<div class="utility-header"><h2 id="utility-title">${title}</h2><button class="icon-button" data-action="close-utility" aria-label="Close dialog">${icon("close")}</button></div><div class="utility-body">${body}</div>`;
  $("#utility-dialog").showModal();
}
function openCommand() {
  commandIndex = 0;
  $("#command-input").value = "";
  renderCommand();
  $("#command-dialog").showModal();
  $("#command-input").focus();
}
function renderCommand() {
  const query = $("#command-input").value.trim().toLowerCase();
  commandItems = [
    ...Object.entries(views).map(([view, data]) => ({
      label: data.title,
      detail: "Workspace page",
      symbol: data.icon,
      action: "navigate",
      value: view,
    })),
    ...state.data.items.map((it) => ({
      label: it.title,
      detail: `TN-${it.id} · ${statusLabel(it)}`,
      symbol: "findings",
      action: "item",
      value: String(it.id),
    })),
    ...state.data.sessions.map((s) => ({
      label: s.session,
      detail: "Shadow session",
      symbol: "sessions",
      action: "session",
      value: s.session,
    })),
  ]
    .filter((item) =>
      `${item.label} ${item.detail}`.toLowerCase().includes(query),
    )
    .slice(0, 20);
  commandIndex = Math.min(commandIndex, Math.max(0, commandItems.length - 1));
  $("#command-results").innerHTML = commandItems.length
    ? `<div class="command-group">${query ? "Search results" : "Jump to a page or record"}</div>${commandItems.map((item, i) => `<button class="command-result ${i === commandIndex ? "active" : ""}" data-command="${i}">${icon(item.symbol)}<span>${escape(item.label)}<small>${escape(item.detail)}</small></span><span class="command-hint">↵</span></button>`).join("")}`
    : `<div class="empty" style="min-height:140px"><h3>No matches found</h3><p>Try a finding title, identifier, session, or page name.</p></div>`;
}
function runCommand(index) {
  const item = commandItems[index];
  if (!item) return;
  $("#command-dialog").close();
  if (item.action === "navigate") location.hash = item.value;
  else if (item.action === "item") openItem(item.value);
  else showSession(item.value);
}
function openItem(id, tab = "evidence") {
  state.inspectorTab = tab;
  const hash = `#${state.view}/${encodeURIComponent(id)}`;
  if (location.hash === hash) renderInspector(id);
  else location.hash = hash;
}
function route() {
  const [view, id] = location.hash.slice(1).split("/");
  if (view === "main") {
    main.focus();
    return;
  }
  const next = views[view] ? view : "overview";
  if (next !== state.view) {
    state.view = next;
    state.query = "";
    state.page = 1;
    state.stage = "all";
    state.severity = "all";
  }
  closeMenu();
  render();
  if (id && state.connected) {
    try {
      renderInspector(decodeURIComponent(id));
    } catch {
      toast("Invalid finding link.", true);
    }
  } else if ($("#inspector").open) closeInspector();
}
function syncNavigation() {
  const mobile = window.innerWidth <= 760;
  $("#sidebar").toggleAttribute(
    "inert",
    mobile && !$("#sidebar").classList.contains("open"),
  );
}
function closeMenu() {
  $("#sidebar").classList.remove("open");
  $("#sidebar-scrim").hidden = true;
  $('[data-action="menu"]').setAttribute("aria-expanded", "false");
  syncNavigation();
}
async function changeMode(mode) {
  if (refreshPromise) await refreshPromise;
  stopStream();
  patchController?.abort();
  closeInspector();
  $("#utility-dialog").close();
  state.mode = mode;
  state.connected = false;
  state.stale = false;
  state.data = { items: [], events: [], sessions: [], queues: {} };
  state.patches.clear();
  const url = new URL(location.href);
  mode === "sample"
    ? url.searchParams.set("preview", "1")
    : url.searchParams.delete("preview");
  history.replaceState(null, "", url);
  state.loading = true;
  main.innerHTML =
    '<div class="loading-state"><span class="spinner"></span><p>Loading workspace…</p></div>';
  await refresh();
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard.");
  } catch {
    toast("Clipboard unavailable. Select and copy the displayed text.", true);
  }
}
function exportView() {
  let records =
    state.view === "findings"
      ? filteredItems()
      : state.view === "deployments"
        ? filteredDeployments()
        : state.view === "reviews"
          ? state.data.items.filter((it) => it.stage === "reviewing")
          : state.view === "sessions"
            ? filteredSessions()
            : state.view === "activity"
              ? filteredEvents()
              : state.data;
  const payload = {
    workspace: "TriNetra",
    mode: state.mode,
    view: state.view,
    exported_at: new Date().toISOString(),
    observed_at: state.data.observed_at,
    event_limit: state.data.event_limit || 200,
    records,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `trinetra-${state.mode === "sample" ? "sample-" : ""}${state.view}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Workspace export downloaded.");
}

// Event delegation keeps table and inspector updates independent of handlers.
document.addEventListener("click", async (event) => {
  const command = event.target.closest("[data-command]");
  if (command) {
    runCommand(Number(command.dataset.command));
    return;
  }
  const stageLink = event.target.closest("[data-stage-link]");
  if (stageLink) {
    event.preventDefault();
    if (state.view !== "findings") {
      state.view = "findings";
      history.pushState(null, "", "#findings");
    }
    state.stage = stageLink.dataset.stage;
    state.page = 1;
    render();
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action, id, value } = target.dataset;
  switch (action) {
    case "open-item":
      openItem(id);
      break;
    case "open-patch":
      openItem(id, "patch");
      break;
    case "session":
      showSession(id);
      break;
    case "close-inspector":
      closeInspector();
      break;
    case "inspector-tab":
      state.inspectorTab = value;
      renderInspector(state.selected, true);
      break;
    case "retry-patch": {
      const item = state.data.items.find(
        (it) => String(it.id) === state.selected,
      );
      if (item) loadPatch(item);
      break;
    }
    case "confirm-approve":
      confirmAction("approve");
      break;
    case "confirm-recovery":
      confirmAction("recovery");
      break;
    case "cancel-confirm":
      $("#action-confirm").replaceChildren();
      break;
    case "execute-approve":
      await executeAction("approve");
      break;
    case "execute-recovery":
      await executeAction("recovery");
      break;
    case "copy-link":
      await copyText(location.href);
      break;
    case "copy-recovery":
      await copyText(
        state.data.items.find((it) => String(it.id) === state.selected)
          ?.rollback_cmd || "",
      );
      break;
    case "copy-patch": {
      const item = state.data.items.find(
        (it) => String(it.id) === state.selected,
      );
      const key = [item?.id, item?.updated || item?.created, state.mode].join(
        ":",
      );
      const file = state.patches.get(key)?.files[Number(target.dataset.file)];
      if (file) await copyText(file.new_contents);
      break;
    }
    case "refresh":
      target.disabled = true;
      await refresh();
      if (target.isConnected) target.disabled = false;
      break;
    case "sample":
      await changeMode("sample");
      break;
    case "live":
      await changeMode("live");
      break;
    case "theme":
      state.theme = state.theme === "light" ? "dark" : "light";
      savePreference("theme", state.theme);
      applyPreferences();
      if (state.view === "configuration") render();
      break;
    case "search":
      openCommand();
      break;
    case "close-command":
      $("#command-dialog").close();
      break;
    case "guide":
      showUtility("guide");
      break;
    case "connection":
      showUtility("connection");
      break;
    case "close-utility":
      $("#utility-dialog").close();
      break;
    case "retry-connection":
      $("#utility-dialog").close();
      await refresh();
      break;
    case "menu": {
      const isOpen = $("#sidebar").classList.toggle("open");
      $("#sidebar-scrim").hidden = !isOpen;
      target.setAttribute("aria-expanded", String(isOpen));
      syncNavigation();
      if (isOpen) $("#sidebar a").focus();
      break;
    }
    case "stage":
      state.stage = value;
      state.page = 1;
      render();
      break;
    case "review-tab":
      state.reviewTab = value;
      state.page = 1;
      render();
      break;
    case "settings-tab":
      state.settingsTab = value;
      render();
      break;
    case "clear-filters":
      state.query = "";
      state.stage = "all";
      state.severity = "all";
      state.page = 1;
      render();
      break;
    case "previous":
      state.page = Math.max(1, state.page - 1);
      render();
      break;
    case "next":
      state.page++;
      render();
      break;
    case "export":
      exportView();
      break;
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "command-input") {
    commandIndex = 0;
    renderCommand();
  }
  if (event.target.id === "view-search") {
    const cursor = event.target.selectionStart;
    state.query = event.target.value;
    state.page = 1;
    render();
    const input = $("#view-search");
    input?.focus();
    try {
      input?.setSelectionRange(cursor, cursor);
    } catch {
      /* Search inputs do not support selection ranges in all browsers. */
    }
  }
});
document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.dataset.filter) {
    state[target.dataset.filter] = target.value;
    state.page = 1;
    render();
  }
  if (target.dataset.preference) {
    const preference = target.dataset.preference;
    state[preference] =
      target.type === "checkbox" ? target.checked : target.value;
    savePreference(preference, String(state[preference]));
    applyPreferences();
    if (preference === "autoRefresh") {
      stopStream();
      if (state.autoRefresh && state.connected && state.mode === "live")
        connectStream();
    }
    render();
  }
});
document.addEventListener("keydown", (event) => {
  const typing =
    ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) ||
    event.target.isContentEditable;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("#command-dialog").open ? $("#command-dialog").close() : openCommand();
    return;
  }
  if (
    $("#command-dialog").open &&
    ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
  ) {
    event.preventDefault();
    if (event.key === "Enter") runCommand(commandIndex);
    else {
      commandIndex =
        (commandIndex +
          (event.key === "ArrowDown" ? 1 : -1) +
          Math.max(1, commandItems.length)) %
        Math.max(1, commandItems.length);
      renderCommand();
      $(`[data-command="${commandIndex}"]`)?.scrollIntoView({
        block: "nearest",
      });
    }
    return;
  }
  if (!typing && event.key === "?" && !$$("dialog[open]").length) {
    event.preventDefault();
    showUtility("guide");
  }
  if (event.key === "Escape") {
    closeMenu();
  }
});
$("#sidebar-scrim").addEventListener("click", closeMenu);
$("#inspector").addEventListener("cancel", (event) => {
  event.preventDefault();
  if (!state.actionBusy) closeInspector();
});
for (const id of ["command-dialog", "utility-dialog"])
  $(`#${id}`).addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      const box = event.currentTarget.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        event.currentTarget.close();
    }
  });
window.addEventListener("hashchange", route);
window.addEventListener("resize", syncNavigation);
window.addEventListener("offline", () => {
  state.stale = state.mode === "live";
  updateConnection();
});
window.addEventListener("online", () => {
  if (state.mode === "live") refresh({ silent: true });
});
window.addEventListener("pagehide", stopStream);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopStream();
  else if (state.autoRefresh && state.mode === "live")
    refresh({ silent: true });
});
setInterval(() => {
  if (
    state.autoRefresh &&
    !document.hidden &&
    state.mode === "live" &&
    !state.loading
  )
    refresh({ silent: true });
  updateConnection();
}, 15000);
route();
refresh().then(route);
