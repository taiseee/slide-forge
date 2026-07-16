# Catalog contracts

The catalog is split by responsibility:

- `layouts.json` inventories available CSS layout classes by communication intent.
- `templates.json` maps semantic slide IDs to reusable Markdown fragments.
- `recipes.json` composes templates into complete deck outlines.
- `assets.json`, when present, describes reusable visual assets independently of recipes.

All catalog files use `schema_version: 1`. Paths in `templates.json` and recipe
`copy[].source` values are relative to the skill root (the directory containing
`SKILL.md`). A recipe copy destination is relative to the newly generated deck.

Recipe copy entries use this shape:

```json
{
  "source": "assets/starter/research",
  "destination": "assets/starter/research",
  "optional": true
}
```

Files and directories are both supported. `optional: true` lets recipes declare
future or separately installed asset packs without making deck initialization fail.
Destinations must begin with one of the generated deck's managed directories:
`assets/`, `data/`, `scripts/`, `sources/`, `tooling/`, or `validation/`. Core
files such as `slides.md` and `manifest.json` cannot be overwritten by a recipe.
