# Offline visual assets

`assets.json` is the source of truth for the asset picker. Every entry contains
stable provenance, license, SHA-256, alt text, search tags, recommended layouts,
dimensions, and a normalized focal point (`0,0` is the top-left).

- `icons/`: 63 unmodified Lucide SVG icons. They inherit color through
  `currentColor`; see `licenses/LUCIDE-LICENSE.txt`.
- `photos/`: 12 Pexels photos cropped to 16:9 and compressed as 1600×900 WebP.
- `backgrounds/`: 16 original, low-contrast SVG backgrounds across the four themes.
- `examples/`: one visual spec per supported chart/diagram type.

Keep additions in the same visual families instead of mixing unrelated packs:

- Icons use the Lucide 24×24 outline language, 2px strokes, rounded joins/caps,
  no decorative fills, and a single-color silhouette that remains legible at 44px.
- Backgrounds use a 1600×900 viewBox, theme-token colors, low contrast behind text,
  and a quiet text-safe area. Add theme variants as a family when the geometry is reusable.
- Every addition must update `assets.json` with provenance, license, alt, tags,
  recommended layouts, focal point, dimensions, and a verified SHA-256.
- `visual.schema.json`: the YAML/JSON interface accepted by
  `scripts/render-visual.mjs`.

Visual `motion` accepts `off`, `fade`, `wipe`, `draw`, or `highlight`. In rich
HTML, `highlight` animates the mark selected by the static `highlight` field;
renderers that cannot expose an exact mark use a documented one-shot emphasis
of the whole visual. Reduced-motion and print output always show the final state.

This remains a curated presentation pack rather than a general-purpose stock
library. Its 12 license-verified photos cover distinct, reusable intents:
research, technology, planning, architecture, teamwork, education, conferences,
sustainability, manufacturing, healthcare, fieldwork, and remote work. Each file
is a compact derivative crop, while provenance and context-specific usage notes
remain in the manifest. The eight visual specs are one canonical example for
every supported renderer type (five charts and three diagrams); duplicate
examples would not add interface coverage. Add a new bundled photo only when its
source page, creator, current license, focal point, alt text, presentation intent,
and redistribution constraints can all be recorded.

Copy a selected file into a deck's local `assets/` directory. Do not refer to a
remote CDN from a deck: local files keep HTML, PDF, and PNG export reproducible.
For photos, retain the corresponding manifest record with the deck's source
notes and review the current Pexels license before redistributing an asset pack.
