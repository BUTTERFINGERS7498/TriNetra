// Explicitly selected, browser-only review data. Never written to Redis.
export function createSampleData() {
  const now = Date.now() / 1000;
  const ago = (minutes) => String(Math.round(now - minutes * 60));
  const items = [
    {
      id: "128",
      title: "Enforce ownership checks on product requests",
      vuln_class: "Broken access control",
      endpoint: "/products/{id}",
      severity: "high",
      stage: "reviewing",
      created: ago(42),
      updated: ago(9),
      pending_deploy: true,
      awaiting_human: true,
      changed_paths: ["app/api/products.py"],
      evidence:
        "The shadow request log contains repeated product lookups across sequential identifiers. The detector flagged missing ownership validation for review.",
      recommendation:
        "Verify the authenticated owner before returning a product record.",
      explanation:
        "Add an ownership check before serializing a product. Preserve the existing response for an authorized request and return the established not-found response otherwise.",
      review_reasoning:
        "The proposal confines the change to the product lookup and adds an explicit owner comparison. Inspect the proposed change and the deployment environment before approving.",
    },
    {
      id: "127",
      title: "Validate redirect destinations after sign-in",
      vuln_class: "Open redirect",
      endpoint: "/login",
      severity: "medium",
      stage: "reviewing",
      created: ago(86),
      updated: ago(18),
      pending_deploy: true,
      awaiting_human: true,
      changed_paths: ["app/auth/routes.py"],
      evidence:
        "Shadow activity included sign-in requests with external return destinations.",
      recommendation: "Allow only local return paths.",
      explanation:
        "Normalize the destination and accept local application paths only. Use the workspace home for every other destination.",
      review_reasoning:
        "The change narrows accepted redirect values and preserves the successful sign-in path. The operator should confirm the intended return-path policy.",
    },
    {
      id: "126",
      title: "Constrain search input before query execution",
      vuln_class: "Input validation",
      endpoint: "/products",
      severity: "high",
      stage: "fixing",
      created: ago(117),
      updated: ago(21),
      evidence:
        "The detector identified abnormal query shapes in shadow product-search requests.",
      recommendation: "Validate supported search fields and bind query values.",
      fix_attempts: 1,
      review_feedback:
        "Keep the change limited to search validation; preserve pagination behavior.",
    },
    {
      id: "125",
      title: "Add a limit to repeated authentication attempts",
      vuln_class: "Authentication controls",
      endpoint: "/login",
      severity: "high",
      stage: "detected",
      created: ago(144),
      evidence:
        "Several unsuccessful sign-in attempts were observed from a session already routed to shadow.",
      recommendation:
        "Apply a bounded authentication-attempt policy without revealing account existence.",
    },
    {
      id: "124",
      title: "Reject malformed product identifiers",
      vuln_class: "Input validation",
      endpoint: "/products/{id}",
      severity: "low",
      stage: "deployed",
      created: ago(203),
      deployed_at: ago(162),
      changed_paths: ["app/api/products.py"],
      rollback_cmd: "git checkout -- app/api/products.py",
      deploy_note: "hot-reloaded into the running app",
      explanation:
        "Validate identifier shape before querying the product store.",
      review_reasoning:
        "The validation is limited to the identifier boundary and preserves valid product lookups.",
    },
    {
      id: "123",
      title: "Limit unexpected fields in account updates",
      vuln_class: "Mass assignment",
      endpoint: "/profile",
      severity: "medium",
      stage: "deployed",
      created: ago(328),
      deployed_at: ago(265),
      changed_paths: ["app/api/profile.py"],
      rollback_cmd: "git checkout -- app/api/profile.py",
      deploy_note:
        "written to fork; rebuild with: docker compose up -d --build",
      explanation: "Use an explicit allowlist of editable profile fields.",
      review_reasoning:
        "The patch restricts updates to documented profile fields.",
    },
    {
      id: "122",
      title: "Scope the account lookup change",
      vuln_class: "Broken access control",
      endpoint: "/profile",
      severity: "medium",
      stage: "rejected",
      created: ago(412),
      updated: ago(380),
      fix_attempts: 3,
      review_reasoning:
        "The proposed change affects an unrelated account route. The reviewer rejected it after the retry limit.",
      review_feedback:
        "Keep authorization changes within the finding endpoint.",
      changed_paths: ["app/api/profile.py"],
    },
    {
      id: "121",
      title: "Review unusual object enumeration",
      vuln_class: "Object enumeration",
      endpoint: "/orders",
      severity: "medium",
      stage: "detected",
      created: ago(462),
      evidence:
        "A shadow session requested a sequence of object identifiers. Additional context is required before proposing a change.",
      recommendation: "Inspect object-level authorization on order reads.",
    },
  ];
  const sessions = [
    {
      session: "8c4e91f0a2b176d3",
      score: 38,
      last_reason: "object enumeration",
      updated: ago(3),
    },
    {
      session: "7b1a83c9d4f062e5",
      score: 26,
      last_reason: "scanner user-agent",
      updated: ago(8),
    },
    {
      session: "a9f03e726c1d84b0",
      score: 24,
      last_reason: "injection pattern",
      updated: ago(12),
    },
    {
      session: "3e8b62a1f709dc45",
      score: 18,
      last_reason: "repeated failed logins",
      updated: ago(20),
    },
    {
      session: "6d240a93be71f8c2",
      score: 0,
      last_reason: "",
      score_expired: true,
    },
  ];
  const events = [];
  const pattern = [
    0, 1, 0, 2, 1, 0, 1, 1, 2, 1, 3, 2, 1, 2, 4, 3, 2, 5, 3, 4, 6, 3, 4, 2,
  ];
  const start = Math.floor(now / 3600) * 3600 - 23 * 3600;
  pattern.forEach((count, hour) => {
    for (let i = 0; i < count; i++) {
      const sid = sessions[(hour + i) % sessions.length].session;
      events.push({
        kind: "score",
        ts: String(Math.min(now - 60, start + hour * 3600 + 300 + i * 340)),
        session: sid,
        reason: i % 2 ? "scanner user-agent" : "object enumeration",
        points: "5",
        total: String(15 + i * 5),
        msg: "Gateway recorded a session scoring signal",
      });
    }
    if (count > 2)
      events.push({
        kind: "shadow_route",
        ts: String(Math.min(now - 60, start + hour * 3600 + 420)),
        session: sessions[hour % sessions.length].session,
        msg: "Session diverted to the shadow environment",
      });
  });
  events.push(
    {
      kind: "deployed",
      ts: ago(265),
      item_id: "123",
      msg: "Approved patch written to fork; operator rebuild required",
    },
    {
      kind: "deployed",
      ts: ago(162),
      item_id: "124",
      msg: "Identifier validation patch copied for hot reload",
    },
    {
      kind: "detected",
      ts: ago(144),
      item_id: "125",
      msg: "Authentication control finding created from shadow evidence",
    },
    {
      kind: "fixing",
      ts: ago(21),
      item_id: "126",
      msg: "Fixer preparing a focused search validation patch",
    },
    {
      kind: "reviewing",
      ts: ago(18),
      item_id: "127",
      msg: "Redirect validation patch awaiting operator approval",
    },
    {
      kind: "reviewing",
      ts: ago(9),
      item_id: "128",
      msg: "Ownership check approved by reviewer; awaiting operator",
    },
    {
      kind: "scale",
      ts: ago(0.2),
      fix_workers: "2",
      review_workers: "1",
      fix_queue: "1",
      review_queue: "0",
      msg: "Worker pool observation: 2 fixers, 1 reviewer",
    },
  );
  events.sort((a, b) => Number(a.ts) - Number(b.ts));
  events.forEach((event, i) => (event.id = `sample-${i}`));
  return {
    connected: true,
    observed_at: now,
    stages: ["detected", "fixing", "reviewing", "deployed", "rejected"],
    items,
    sessions,
    events,
    queues: { fix: 1, review: 0 },
    event_limit: 200,
  };
}
export function samplePatch(item) {
  if (!item.changed_paths?.length) return { available: false, files: [] };
  const path = item.changed_paths[0];
  const examples = {
    127: {
      before: 'def return_destination(value):\n    return value or "/"\n',
      after:
        'def return_destination(value):\n    if not value or not value.startswith("/") or value.startswith("//"):\n        return "/"\n    return value\n',
    },
    124: {
      before:
        "def find_product(product_id):\n    return products.find(product_id)\n",
      after:
        "def find_product(product_id):\n    if not isinstance(product_id, int) or product_id < 1:\n        raise NotFound()\n    return products.find(product_id)\n",
    },
    123: {
      before: "def profile_changes(payload):\n    return dict(payload)\n",
      after:
        'def profile_changes(payload):\n    editable = {"display_name", "timezone"}\n    return {key: value for key, value in payload.items() if key in editable}\n',
    },
  };
  const example = examples[item.id] || {
    before:
      "def get_product(product_id, current_user):\n    product = products.find(product_id)\n    return serialize(product)\n",
    after:
      "def get_product(product_id, current_user):\n    product = products.find(product_id)\n    if product is None or product.owner_id != current_user.id:\n        raise NotFound()\n    return serialize(product)\n",
  };
  const oldLines = example.before.trimEnd().split("\n"),
    newLines = example.after.trimEnd().split("\n");
  const diff = `--- a/${path}\n+++ b/${path}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n${oldLines.map((line) => "-" + line).join("\n")}\n${newLines.map((line) => "+" + line).join("\n")}\n`;
  return {
    available: true,
    explanation: item.explanation,
    files: [
      { path, baseline: "sample baseline", new_contents: example.after, diff },
    ],
  };
}
