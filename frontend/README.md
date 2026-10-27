# TriNetra landing page

Midnight review version of the TriNetra SaaS landing page. Blue and violet light fades into near-black surfaces. A graphite and titanium guardian, consistent product panels, an illustrative traffic-diversion story, and an interactive workspace preview carry the page.

The detailed page plan, copy, accessibility criteria, and source-grounded product constraints are in [DESIGN.md](DESIGN.md).

## Run locally

From the repository root:

```sh
python3 frontend/tools/build-workspace.py
python3 -m http.server 4173 --bind 127.0.0.1 --directory frontend/dist
```

Open <http://localhost:4173>. No package installation, bundler, Docker, API credentials, or backend service is needed for this landing page. Stop the server with `Ctrl+C`.

This first review stays local, as requested. No frontend source or artwork was uploaded to a hosting service.

## Files and static deployment

`dist/` is the standalone static site, containing its HTML, CSS, JavaScript, and local assets. Serve or publish the entire contents of that directory with any static host. The landing page needs no bundler. After changing the workspace source, run `python3 frontend/tools/build-workspace.py` to refresh the included workspace; `--check` verifies that it is current. Preserve relative asset paths when copying the site.

`styles.css` defines the page design system and responsive layouts. `agents.css` owns the agent illustrations and artifact inspector. `experience.css` and `experience.js` add an autonomous nine-second guardian light sequence, a sparse canvas field, scroll reveals, and a keyboard-accessible agent explorer. The sculpture stays fixed: its third eye wakes, light travels along the trident, and a subtle sheen crosses the materials. The guardian remains a raster artwork with SVG and CSS lighting rather than a rigged 3D model. Use the visible motion control to pause ambient effects. System reduced-motion preferences disable the ambient motion by default. The closing section uses one illuminated horizon and a continuous black footer.

The workspace buttons in the desktop/mobile navigation, hero, closing section, and footer open `/workspace/`. The standalone static site includes the operator interface at that path. Without the backend, it shows its connection state and offers an explicit sample mode.

The application service under `dashboard/` serves this landing page at `/` and the live operator workspace at `/workspace/` on port 3000. The Docker image includes the landing assets; API routes and read-only patch mounts keep their existing behavior.

## Demo limitations

- Traffic, findings, patches, pipeline activity, and status indicators are illustrative sample data, not live security telemetry.
- Workspace actions open the operator console. Its live data and operator actions require the running FastAPI/Redis stack. A static-only host supports the disconnected interface and explicit browser-local sample mode.
- The landing page does not score requests, route traffic, invoke models, create GitLab work items, deploy patches, approve changes, restore files, or generate attacks.
- Any documentation or onboarding view in this prototype explains the project; it does not provision an account or configure infrastructure.
- Deployment and review copy reflects the current source: three separate agent roles currently share the configured model, compiled-service deployment requires an operator's rebuild command, and the existing dashboard's rollback control records intent rather than restoring files.

## Suggested review

Review the hero at desktop and mobile widths, replay the traffic illustration, inspect each available sample pipeline stage, open the FAQ items, and follow the page actions. Check keyboard focus and reduced-motion behavior. Feedback on the guardian, typography, color balance, page rhythm, and preview clarity should guide the next design iteration alongside the separate operator workspace.

## First-version validation

- JavaScript syntax and CSS parsing passed, including every grid column declaration.
- DOM checks passed for page anchors, unique IDs, local resources, and SVG references.
- Interaction checks passed for navigation, the documentation dialog, route selection, replay completion/cancellation, all five pipeline states, and switching between pipeline and patch views.
- Reduced-motion replay completes without animation timers.
- The desktop hero was viewed in Chrome. A complete visual pass at mobile sizes remains for the next review.
- Both existing Docker Compose configurations still validate.

## Second-edition validation

- Both scripts pass JavaScript syntax checks; both stylesheets parse and their grid declarations validate.
- The original navigation, routing, and pipeline interaction checks still pass.
- Added checks pass for ambient pause/resume, agent trace selection, keyboard arrow/Home/End navigation, ARIA relationships, and color states tied to route/pipeline choices.
- The canvas animation loop stops when its scene is offscreen or the document is hidden. Reduced-motion startup and live preference changes disable the scene and reset pointer transforms.
- The scene remains usable without IntersectionObserver or ResizeObserver.
- Chrome's console showed no runtime errors during the second-edition review.

## Midnight-edition validation

- Both JavaScript files pass syntax checks; both stylesheets parse and all grid column values validate.
- Navigation, docs, routing/replay, every pipeline state, patch navigation, agent keyboard controls, ambient pause/resume, reduced-motion changes, and offscreen/background animation suspension pass the existing DOM interaction checks.
- Local preview responds with HTTP 200. The new artwork has a real alpha channel and is included locally.
- The refreshed ending was inspected in Chrome. The native browser controller subsequently returned an unavailable-window error and incomplete render captures, so full desktop and mobile visual verification remains incomplete.

## Sentinel and agent refinement

The sculpture no longer tilts, translates, or follows the pointer. The timed eye, trident current, and material-light sequence runs autonomously, with pause and reduced-motion support. SVG paths align to the existing artwork; the original image is unchanged. Animation pauses when the hero is offscreen or the document is hidden.

The three agent illustrations now use graphite and silver surfaces with readable request evidence, a line-numbered patch, and a review checklist. The trace becomes a role rail and artifact inspector, with brighter type and selective blue/violet accents. Tablet layouts pair each visual with its explanation; phone layouts stack the visuals and use horizontal role tabs.

Validation: JavaScript syntax, all three stylesheet parsers and grid values, static resource checks, routing/replay/pipeline flows, autonomous ambient rendering, fixed sculpture behavior, pause/reduced-motion/offscreen behavior, artifact updates, and vertical/horizontal keyboard navigation pass. Eight representative text/background pairs in the redesigned components exceed 4.5:1 contrast. Desktop components were viewed during implementation; final full-width and mobile visual verification remains incomplete because native browser capture switched away from the review window.

## Optical light studies

Three original elements extend the Midnight palette down the page: a fibre-optic eye above the agent story, an isometric containment field around the source fork, and a landscape of fine light fibres beneath the closing trident. `light.css` and `light.js` own this layer. They leave the restored guardian markup, artwork, and light sequence intact.

Illumination changes gently with scroll position, while short light pulses follow selected contours. Only intersecting scenes animate. Background tabs, the existing Pause motion control, and system reduced-motion settings suspend the effects. There is no continuous JavaScript animation loop for these elements; one frame is requested per scroll update. Without observers, the artwork remains static and visible. The artwork loads lazily below the fold and has intrinsic dimensions to reserve layout space.

The eye is an original generated image, with provenance and its complete prompt in `ARTWORK.md`. The two vector studies are original procedural geometry; regenerate them with `python3 frontend/tools/generate-light-art.py` from the repo root. No reference-site artwork is shipped in this project.

Validation: all existing landing interactions still pass. Additional checks cover scroll illumination, frame coalescing, pause/resume, reduced-motion startup and changes, offscreen/background suspension, static fallback, and CSS parsing. The eye, containment composition, and ending were visually reviewed in Chrome; the eye's blend and light alignment were refined after that review. Full mobile visual verification remains outstanding.
## Visual refinement

The latest local version concentrates the hero lighting around the guardian, strengthens the headline, and removes repeated supporting copy. Rounded actions, more deliberate section spacing, and a smaller optical-eye composition give the major visuals more room. The gateway, workspace, setup, FAQ, documentation dialog, and footer now share graphite surfaces and cooler, more readable text. Blue and violet emphasize evidence, selection, and light.

The agent illustration corresponding to the selected role now has a subtle lit border. The containment artwork has a quieter outer frame, and the ending's light landscape is softer. The existing sculpture and artwork assets remain intact; its nine-second lighting, motion controls, and reduced-motion behavior are preserved.

At tablet widths the sample pipeline keeps readable text and scrolls horizontally inside its panel. Phones retain the stacked pipeline. The compact navigation action and smaller minimum headline size also give narrow screens more space. Changes were made in the existing stylesheets; no dependencies or new animation loops were added.

Verification: the local server responds successfully; static resources, CSS/grid syntax, navigation/dialog flows, routing/replay, all pipeline stages, agent keyboard navigation, and ambient motion controls pass. The refined desktop hero was visually reviewed in Chrome, and the product preview was inspected at the narrower viewport created by docked developer tools. Console contained no runtime messages. Phone emulation did not produce a reliable review surface, so complete phone-size visual verification remains outstanding.
