# TriNetra landing page — first review version

## Purpose and scope

Create a distinctive SaaS landing page for TriNetra, the project's defensive web-application system. The first version should explain the gateway → shadow → detection → patch → review loop, establish a visual identity, and let the user review the direction in a browser.

This version is a standalone landing-page prototype. The full workspace is a later phase. Product scenes on this page use clearly labeled sample data; they do not connect to the Python dashboard, Redis, an LLM, or a running gateway.

## Creative direction

**The silent guardian.** Use a sculptural, semi-abstract obsidian guardian holding a bronze trident as the central brand image. Give it an ember third eye, a composed pose, tactile material, directional lighting, and a grounded shadow. The silhouette must remain strong at a glance and at mobile scale. The guardian should feel like an original TriNetra sculpture rather than a named mythological or religious figure.

The trident's three tips echo the three agent roles: Detector, Fixer, Reviewer. Repeat that idea through fine paths, section numbering, and the small navigation mark; do not force the motif into every surface.

The user named Apple, Codex, and Claude as visual references. The intended qualities are spacious product presentation, visible software, readable editorial type, and an approachable tone. This is an original composition; do not copy a reference page's layout, artwork, trademarks, or text.

### Palette

| Token | Value | Purpose |
| --- | --- | --- |
| Warm ivory | `#F6F3ED` | Main page surface |
| Obsidian | `#191B19` | Main text and dark story section |
| Ember | `#C44B2D` | Primary action and selected focal details |
| Bronze | `#A77946` | Trident/material accent and decorative lines |
| Pale stone | `#E5DFD5` | Surface changes and subtle rules |
| Sage | `#719A7B` | Decorative healthy-state accents |

Ivory and obsidian dominate. Ember directs attention. Bronze is primarily material and decoration. Verify foreground contrast separately: bronze and sage should not be used for small text on ivory without a darker accessible text token.

### Type, spacing, and surfaces

- Large, tightly composed editorial headings with deliberate line breaks. The hero headline should be the strongest text on the page.
- Comfortable body copy, approximately 17–19 px on desktop and at least 16 px on mobile, with limited line length.
- Use small uppercase/monospace labels only for section navigation, request metadata, or product details. Avoid long passages of tiny uppercase text.
- Preserve generous margins and breathing room. Use ruled editorial sections, a broad cinematic scene, and one detailed software preview instead of repeating a grid of identical cards.
- Restrained corner radii, thin borders, soft shadows, and solid surfaces. The artwork supplies richness; do not add generic decorative blur blobs behind every component.

## Page story and first-pass copy

### 1. Navigation and hero

Navigation: TriNetra mark/wordmark; Product, How it works, Safeguards, FAQ; a primary workspace-preview action. Use working section links. The navigation should remain legible over every background it crosses.

Eyebrow: **A third eye for your application.**

Headline: **See the threat. / Change its course.**

Description: **TriNetra diverts suspicious traffic into a shadow environment and turns the evidence into reviewed fixes.**

Primary action: **Explore the workspace** (opens or scrolls to the labeled product demo in this version).

Secondary action: **Watch it work** (scrolls to the traffic-diversion scene).

Composition: a strong text column beside a large guardian/trident image; warm directional light, fine traffic trails, and generous negative space. Show the headline and actions promptly, with no blocking intro animation or loading ritual.

### 2. Traffic diversion — the signature scene

Headline: **A different path for suspicious traffic.**

Copy: **A gateway scores activity and routes flagged sessions to a shadow copy of the application. The shadow logs give the detector evidence to examine.**

The ivory page transitions into a broad obsidian scene. Requests reach a central gateway; a production path continues forward while an ember path bends toward the shadow environment. Labels must explain both paths without depending on color. Keep the path geometry and text readable without animation.

Interaction: play/replay an illustrative sequence; let a visitor select Production or Shadow to update a short explanation. All requests and activity counts are sample data. This must be a visual simulation, not traffic generation. A decorative status indicator must not imply connection to a live backend.

### 3. The three agent roles

Headline: **Three agents. A reviewed path to a fix.**

1. **Detector — Read the evidence.** Classifies shadow request logs into findings with an endpoint, severity, and evidence.
2. **Fixer — Propose a focused change.** Reads application source in the configured fork and proposes updates to existing files.
3. **Reviewer — Check the patch.** Evaluates correctness, scope, and safety; can approve or return feedback for another attempt.

Use a connected composition, three distinct evidence/patch/verdict views, or selectable chapters. Do not describe the current configuration as three independent models: the roles are separate, but all currently name the same model.

### 4. Workspace preview

Headline: **Follow the finding to the fix.**

Copy: **Keep the evidence, proposed change, and review decision in one visible workflow.**

Show a focused product preview, not a complete workspace build. One sample finding should move through Detected → Fixing → Reviewing → Deployed; rejected feedback may be represented as an alternative state. Use the actual pipeline stage names. Provide an obvious **Interactive demo · sample data** label.

Allow stage selection or a sample-finding detail view so the preview feels useful. Do not include pretend functional deploy, approve, rollback, account, or billing actions. An action that is not connected must explicitly describe its demo result instead of appearing to perform a real operation.

### 5. Safeguards

Headline: **Control behind every patch.**

Explain four source-backed controls with brief concrete copy:

- **Bounded source changes.** The fixer is constrained to the configured fork and, by default, existing files.
- **Static patch checks.** Proposed contents are scanned for selected risky patterns before application.
- **A separate review stage.** The reviewer checks correctness, scope, and safety; rejected patches can return with feedback.
- **Deployment boundaries.** The Python demo supports hot reload. Compiled-service mode records a rebuild command for an operator.

Present a short readable example patch beside these controls. The example is illustrative and should not assert that a vulnerability exists in the project's current demo source. Use a success state only inside the labeled sample preview.

### 6. Setup and project ecosystem

Headline: **Built to fit around your application.**

Explain the deployment topology with a compact composition: gateway, production upstream, shadow upstream, and agent workflow. Show Docker Compose, OpenResty, Redis, and GitLab as technologies used by this repository, not as customer logos or third-party endorsements.

Source-grounded copy: **The repository includes a Docker Compose demo, a crAPI target configuration, and GitLab Duo flow and CI definitions.**

Avoid saying that every application can be integrated instantly, that onboarding is one click, or that every GitLab step is already proven end to end.

### 7. FAQ

Use native accessible disclosure elements or fully keyboard-operable accordion buttons.

**What is the shadow environment?**

A separate copy of the application that receives sessions flagged by the gateway. Its request logs feed the detector's analysis.

**Does TriNetra attack my application?**

No. TriNetra is a defensive project that recognizes, logs, diverts, and analyzes suspicious activity, then proposes patches.

**What happens after a patch is approved?**

In the Python demo, approved files are copied to the deployed application for hot reload. In rebuild mode, the patch is written to the fork and an operator receives a rebuild command.

**Can a person review a patch before it is applied?**

The runtime has an optional human-approval setting. The repository's default/demo flow is hands-off; enabling that setting holds an approved patch for an operator.

**Is this preview connected to a live system?**

No. The landing-page demo uses sample data to show the intended experience. The full workspace and backend connection are a later phase.

**Is TriNetra ready to act as my only production security control?**

The repository presents it as a starting point that needs review and environment-specific validation. Agent-proposed patches should be assessed before use in a real environment.

### 8. Closing invitation and footer

Headline: **Give your application a third eye.**

Short description: **See how traffic evidence becomes a finding, a focused change, and a review decision.**

Repeat the workspace-preview action beside a cropped trident or guardian detail. Footer links must have real destinations: page sections, the local documentation dialog, or the project source when a verified public URL is available. Do not add fictional Terms, Privacy, sales, social, customer, or pricing destinations.

## Responsive, motion, and accessibility criteria

- Desktop: strong two-column hero, broad diversion scene, and detailed preview within a bounded page width.
- Tablet: reduce oversized gaps and artwork overlap before copy becomes crowded.
- Mobile: headline and actions first, deliberate guardian crop second; vertical traffic flow; stacked agent chapters; preview details remain readable without page-level horizontal overflow.
- Support 320 px width and browser zoom. Make any horizontally scrollable code/diagram region explicit and contained.
- Use semantic landmarks, one `h1`, ordered section headings, a skip link, and visible keyboard focus. Navigation, demos, dialogs, and disclosures must work without a pointer.
- Aim for WCAG AA text contrast and comfortable touch targets. Never encode state by color alone. Decorative artwork needs empty alt text; a meaningful guardian image needs a concise description.
- Respect `prefers-reduced-motion`: stop ambient movement, remove large travel/parallax, and display the complete traffic story in its static state. A replay control must remain understandable.
- Avoid scroll hijacking, autoplay sound, flashing, cursor replacements, and lengthy animation delays. Reveal effects must not make essential content disappear when JavaScript fails.
- Use local optimized assets, explicit image dimensions/aspect ratios, and lazy loading below the fold. Avoid external runtime dependencies for this review prototype.

## Product wording boundaries verified from source

| Claim boundary | Source and consequence |
| --- | --- |
| Reviewer model independence | `config/llm.yaml` currently assigns `grok-4.7` to all three roles. README and `AGENT.md` describe an intended different-model design. Say “separate review stage,” not “independent model.” |
| Deployment behavior | `orchestrator/agents/reviewer.py` copies demo files for hot reload; rebuild mode emits a command and does not execute host Docker. Do not promise automatic compiled-service deployment. |
| Rollback | `dashboard/server.py` changes stored state, emits an event, and returns a recorded command. It does not restore files. Do not advertise one-click functional rollback. |
| Diversion timing | `nginx/lua/defender.lua` checks honeypots before proxying; ordinary scoring occurs after a response and affects later routing. Do not promise every initial suspicious request is isolated before reaching production. |
| Detector visibility | The active gateway logs metadata; the detector retains method/path/query/status/user-agent/session/IP fields. Do not claim complete request-body inspection. |
| Review certainty | Static signatures and model review are checks, not guarantees. Avoid “backdoor-proof,” “zero false positives,” or guaranteed vulnerability removal. |
| GitLab scope | `.gitlab/duo/flows/defender.yaml`, `.gitlab-ci.yml`, and `mcp/defender_server.py` provide integration artifacts. Do not imply the local detector already creates issues or that a permanent deployment has been verified. |
| Metrics and social proof | No verified customers, uptime, response-time improvement, accuracy rate, prevented-loss figure, or benchmark is supplied. Use none. |
| Defensive boundary | `AGENT.md` requires defensive behavior. Any traffic scene is an inert illustration, with no probes, exploit generation, or requests to a target. |

## Review checklist

1. At first glance, are the guardian, trident, and headline visually memorable?
2. Within one screen, can a visitor understand what TriNetra does and where to go next?
3. Does the dark section explain the production/shadow split clearly?
4. Is the agent workflow understandable through a single concrete sample?
5. Are all preview interactions labeled honestly, with no dead buttons?
6. Do desktop and mobile both feel composed, with readable text and usable controls?
7. Do reduced-motion and keyboard interactions preserve the full story?
8. Are all product claims bounded by the current code rather than aspirational documentation?

## Second edition — an immersive AI defense experience

The second edition retains the original composition and introduces movement through meaningful layers, while keeping review local.

### Reference direction

- [Lusion](https://lusion.co/): spatial storytelling, responsive scenes, and an invitation to explore. The guardian scene uses a lighter local implementation with layered artwork, CSS, and a small canvas field.
- [Linear](https://linear.app/): visible product workflows and clear agent-oriented presentation. The agent trace and pipeline use inspectable UI with labeled sample data.

These references informed the interaction direction. Their assets, code, product claims, and layouts were not copied.

### The guardian

The existing transparent artwork is separated into a scene: subtle pointer tilt, spring-smoothed translation, slow vertical movement, a breathing third-eye glow, a trident highlight, halo orbits, and a sparse signal field. A copper/sage light follows the pointer. The image is still a raster asset, not a rigged 3D mesh; the experience is layered 2.5D motion.

A visible pause/resume control stops ambient animation. Reduced-motion settings disable the scene by default and make the control explain the preference. Pointer effects apply only to fine pointers, so touch scrolling stays native. The canvas is resolution-capped and its loop pauses offscreen and in background tabs.

### Page-wide interaction

A thin reading-progress line and current-section navigation mark help visitors follow the narrative. Buttons respond with a small magnetic displacement and local light; agent artwork and source-boundary surfaces receive directional highlights. Section reveals preserve normal document scrolling and remain visible if observers are unavailable.

### Agent explorer

The three-role explorer presents one concrete trace at a time: observation, proposal, and review. Selecting a role updates a brief explanation, three sample output rows, the next-step label, the selected card, and the accent color. The controls use a roving keyboard focus pattern with Left/Right, Home, and End. All trace content is illustrative and no model calls are made.

### Color and ending

Warm ivory remains the reading surface. Copper introduces observation and proposed changes; sage accompanies review and healthy states. The workspace gains a restrained warm-to-sage background. The closing section deepens into forest charcoal, with a floating trident, a raised elliptical pedestal, concentric floor rings, a light column, and a continuous dark footer. A large subdued wordmark gives the ending a visual foundation.

### Review priorities

Move the pointer across the hero, pause/resume the ambient scene, explore all three agent roles with both pointer and keyboard, inspect the pipeline, and scroll through the closing pedestal into the footer. Review touch layouts, reduced motion, contrast, and whether the motion supports the product story.

## Current direction — Midnight edition

This direction supersedes the warm ivory, bronze, sage, floating orbits, and pedestal styling described above. The user's feedback called for blue and violet light, black transitions, and more consistent, premium elements.

The visual reference is the atmosphere and purple product framing of the [Codex landing page](https://chatgpt.com/codex/). TriNetra retains its own guardian, content, layouts, and implementation.

- The hero combines cobalt light on the left and violet light on the right, fading continuously into near-black. The rest of the page uses quiet graphite surfaces, narrow borders, and a restrained cool accent range.
- One sans-serif type system replaces the mixed serif/sans headings. White headings, muted lavender supporting copy, and generous spacing establish hierarchy.
- The guardian is a new transparent ImageGen edit: graphite ceramic, titanium, blue/violet rim light, and a silver trident. The gold halo and extra orbit overlays are removed. The image remains layered artwork, not a rigged 3D model.
- Subtle spring-smoothed pointer depth, third-eye breathing, surface light, and a sparse ambient field remain. Vertical floating, spinning rings, trident sparks, and cross-shaped particles are removed.
- All agent illustrations share the same dark panel material, unrotated composition, border treatment, and scale. Routing, the agent trace, and the workspace use the same visual language.
- The ending uses one broad, illuminated horizon that fades into the black footer. The stacked rings, floor grid, decorative stars, and floating pedestal are removed.
- Small-screen layouts stack the guardian after the copy, turn the pipeline into selectable rows, and keep native touch scrolling. Keyboard navigation, visible focus, motion controls, and reduced-motion behavior remain.

Review stays local. All product illustrations remain labeled sample data. No backend behavior or product capability claims change.


## Current refinement — autonomous sentinel and precise agent artifacts

This refinement preserves the Midnight page direction and replaces the hero pointer tilt plus the two agent areas identified in the user's screenshots.

The guardian is stationary. A nine-second ambient choreography wakes its third eye, sends a fine blue current along the trident's shaft and crown, and passes a restrained sheen across the material. The image itself is unchanged. No hover or scroll transform affects the sculpture. The sequence is decorative, with no implication of live backend activity. It supports pause, system reduced motion, and offscreen/background suspension.

The agent visuals are native HTML/SVG components. Neutral graphite, cool silver text, clean chrome, and narrow borders replace the purple tint and nested miniature cards. Detector displays a request stream with one selected signal; fixer displays a source diff with line numbers; reviewer displays three concrete review dimensions. All content remains illustrative.

The trace is an artifact inspector with a separate role rail, a concrete finding/patch/review header, three clear output rows, and a next-step line. Role selection updates the explanation, artifact, icon, and output fields. Up/Down, Left/Right, Home, and End work with roving focus. The rail becomes horizontal tabs on phones, and the panel is keyboard-focusable. The component styles are isolated in agents.css; old agent rules were removed from the general stylesheets.
# Optical light studies — local review

The restored guardian remains the hero. Three original luminous elements carry its blue/silver/violet lighting through the remaining page: a fibre-optic third eye introduces the three agent perspectives, a fine isometric containment volume surrounds the configured source fork, and a continuous optical-fibre landscape grounds the closing trident.

Inspiration from the supplied COMPUTE reference is limited to sharp emissive detail, generous black negative space, and objects revealed through the page. The artwork, geometry, palette, composition, and motion are original to TriNetra. The studies do not imply live telemetry or additional product capabilities.

Scroll changes the light's emphasis without moving the objects or changing native scrolling. Fine contour pulses run only near the viewport and obey the existing motion control, system reduced motion, and document visibility. Product UI remains legible on neutral graphite surfaces. All review remains local.

## Refinement — hierarchy and restraint

Give each chapter one clear focus. The hero keeps its sculptural guardian and a stronger headline, with less repeated copy. Concentrate cool light around the object and let the page recede into black. Product surfaces share neutral graphite, silver borders, readable secondary text, and selective blue/violet states. The optical eye introduces the agent chapter at a smaller scale; the containment field and ending retain their own quiet space.

Increase visual consistency across the real product illustration and supporting content rather than adding more decorative sections. Keep native scrolling, existing keyboard controls, motion preferences, and clearly labeled sample data. At tablet widths, preserve the pipeline's readable type with internal horizontal scrolling; use the existing stacked stages on phones.
