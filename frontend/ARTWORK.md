# Guardian artwork

## Current asset — Midnight edition

The landing page now uses `dist/assets/guardian-midnight.png` (1024 × 1536, RGBA), edited with the built-in ImageGen tool. The original bronze version remains at `dist/assets/guardian.png`. The generated original remains in the generator output directory; the selected copy is saved with the project.

Final edit prompt:

```text
Use case: style-transfer. Asset type: transparent hero sculpture for TriNetra, a premium AI SaaS landing page. Input image 1 is the edit target. Preserve the exact seated guardian pose, faceless helmet, vertical third eye, held trident, robe geometry, whole body, camera angle and low circular base. Change the materials and lighting: refined smooth graphite ceramic and brushed titanium, cool silver edges, restrained cobalt-blue light from the left and soft violet rim light from the right. Replace every gold/bronze/copper detail with platinum/graphite. Third eye a tiny ice-blue light. Remove the circular gold halo behind the head completely. Simplify the base to clean dark graphite with one very fine silver edge; no rubble outside the original silhouette. Premium studio product-render quality, subtle texture, soft readable highlights on dark materials, strong clean silhouette. Actual transparent alpha background, no colored fog, no background rectangle, no typography, no new objects, no ornamental glowing rings. Keep the trident clearly recognizable, complete, elegant and metallic. Portrait composition with whole sculpture and base visible and small safe padding. This is one coherent statue, calm, precise, expensive.
```

The edit preserves the guardian and trident composition, replaces bronze with graphite and titanium, adds cool blue/violet rim light, and removes the halo. Alpha transparency and dimensions were checked after copying. The autonomous third-eye, trident current, material sheen, and background lighting are implemented separately in SVG, CSS, and JavaScript. The sculpture has no pointer or scroll movement. No additional image generation was used for the agent refinement; those visuals are native HTML and SVG.

The prompts below document the preceding warm artwork.


## Transparent-background edit prompt

```text
Use case: background-extraction. Edit the supplied TriNetra guardian sculpture image. Remove the ivory studio background and surrounding ground surface, leaving the exact full guardian sculpture, its entire bronze trident, the thin circular halo, and the complete sculptural plinth as a clean cutout on a genuinely transparent background. Preserve the existing sculpture's design, shape, materials, pose, lighting, color, hand details, trident details, and all other foreground details exactly. Keep the full trident crown and full plinth within the frame. Do not add or redesign anything. Output must have a real alpha channel; no simulated checkerboard and no colored background.
```

Generated with the built-in ImageGen tool for this landing-page review.

The site uses `dist/assets/guardian.png`, a transparent-background version of the sculpture. The first studio-background generation is retained locally in `review/guardian-original.png`. Both original generated files also remain in the generator's output directory.

## Final generation prompt

```text
Use case: stylized-concept
Asset type: original luxury SaaS website hero artwork, portrait composition.
Primary request: an extraordinary sculptural guardian for TriNetra, an AI defensive security product. A single elegant genderless humanoid guardian with a calm featureless face, a tiny vertical glowing ember third eye on the forehead, holding one tall unmistakable three-pronged trident.
Scene/backdrop: seamless warm ivory studio background, approximately #F6F3ED, with a restrained warm spotlight and soft contact shadow.
Subject: one monumental full-body seated guardian in a poised watchful posture, sculpted in satin charcoal-black obsidian and black ceramic. One hand naturally grips the vertical staff of a brushed aged-bronze trident at its side. The trident crown is above shoulder height, all three beautiful slim upward points visible, with a little warm orange edge light. Subtle draped sculptural folds and smooth futuristic armor surfaces. A single thin warm bronze circular halo behind the head. Simple sculptural plinth below. Original abstract character, tasteful and artistic.
Style/medium: highly polished photorealistic 3D museum sculpture, premium industrial design editorial photograph, rich tactile materials, masterful soft studio lighting, visually arresting silhouette, restrained luxury.
Composition/framing: vertical portrait, guardian fully visible including trident crown and plinth, three-quarter frontal view, figure slightly right of center, generous negative space around silhouette. Sculpture fills approximately 78 percent of image height. Ivory background edge-to-edge for seamless website composition.
Lighting/mood: gentle large softbox from upper left, subtle warm rim light, subtle shadows, serene and powerful.
Color palette: warm ivory, obsidian black, desaturated bronze, one tiny ember orange accent.
Constraints: no typography, no text, no letters, no watermark, no logo, no UI, no extra people, no neon cyberpunk, no clutter, no skin, no violent pose. Exactly one trident with three upward tips, coherent hands.
```
# Optical light studies

Saved project assets:

- `dist/assets/optical-eye.png` — 2172 × 724; original image generated with the built-in imagegen tool. Used below the gateway story to introduce the three agent roles. No reference-site asset was supplied to generation or copied into the delivered site.
- `dist/assets/containment-field.svg` — original procedural, isometric rounded-volume linework.
- `dist/assets/light-terrain.svg` — original procedural optical-fibre landscape.

The vectors are editable native SVG; their source generator is `tools/generate-light-art.py`. CSS/SVG lighting is layered over these three assets. The existing guardian image and its restored nine-second lighting are unchanged.

Final imagegen prompt:

```text
Use case: stylized-concept.
Asset type: original cinematic optical sculpture for the TriNetra defensive AI SaaS landing page.
Primary request: a breathtaking, exquisitely crafted three-dimensional eye-shaped sculpture made entirely from hundreds of microscopic polished titanium and luminous fibre-optic strands, three flowing bundles merging to form a single watchful almond eye with a dark circular pupil. This is an abstract optical instrument, not a biological eyeball. A small icy white light in the pupil. Rich intricate filaments, believable material depth, elegant precision, premium contemporary art direction.
Composition: ultra-wide landscape 3:1, single centered sculptural object occupies central 72% width and 65% height, streaming fibres taper into darkness on both sides; plenty of pure black around all edges for seamless integration into black website, no floor, no border.
Lighting: concentrated electric cobalt blue light on left strands, cool silver-white at iris, restrained amethyst violet on right strands. Tiny razor-sharp highlights with delicate luminous halos. Deep cinematic black shadows, restrained bloom, extreme detail in filaments, physically believable 3D macro product render, high contrast.
Constraints: no text, no labels, no interface, no watermarks, no hands, no flowers, no organic tissue, no rainbow, no smoky nebula, no overexposed blob, no stock sci-fi tunnel. Entire background and every outer edge pure black. Original artwork, no copied reference assets.
```
