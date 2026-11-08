# Deepforge

A small 2D factory-automation game set under a dwarven mountain. It runs in the browser, needs no build step, and has no image assets: every tile, building and item is painted procedurally on a canvas.

Your clan has claimed a cavern. Dig out rock, drill ore seams, run conveyors to forges and runesmith anvils, and deliver goods to the **Great Hall** to climb five tiers of progression, ending with the Ancestor Relics.

## Play

Open `index.html` directly in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

To get a single self-contained HTML file: `node tools/build-single.mjs` (writes `dist/deepforge.html`).

### Controls

| Input | Action |
| --- | --- |
| Left click / drag | Place the selected building (drag lays a conveyor line), pan the view, or select a building |
| Hold on ore or rock | Dig by hand (rock turns into floor and gives stone) |
| Right click | Demolish (full refund) / cancel the current tool |
| `1`–`8` | Pick a building · `X` demolish tool · `Esc` clear |
| `R` / `Shift+R` | Rotate |
| `Q` | Copy the building under the cursor |
| `WASD` / arrows, mouse wheel | Pan, zoom |
| `H` | How to play |

Touch works too: tap to place, drag to pan, pinch to zoom.

## How it works

**Logistics.** Buildings output goods from their front face (gold arrow) into whatever is in front: a conveyor, or another building directly. Conveyors carry up to three goods per tile, push into any building they point at, and accept goods merging in from the side. A **Splitter** deals goods in turn to its front, left and right. A **Tunnel** entrance and exit (up to 5 tiles apart, facing the same way) pass goods under anything.

**Recipes**

| Building | Input | Output |
| --- | --- | --- |
| Delving / Deep Drill | ore seam beneath | Stone, Coal, Iron / Copper / Gold Ore |
| Smelting Forge (+1 coal per 3 smelts) | 1 Iron Ore | 1 Iron Ingot |
| | 1 Copper Ore | 1 Copper Ingot |
| | 1 Gold Ore | 1 Gold Ingot |
| | 2 Stone | 1 Stone Brick |
| Runesmith Anvil | 2 Iron Ingot | 1 Iron Cog |
| | 1 Copper Ingot | 2 Copper Wire |
| | 1 Stone Brick + 3 Copper Wire | 1 Rune Stone |
| | 2 Iron Cog + 1 Rune Stone + 1 Gold Ingot | 1 Clockwork Heart |
| | 3 Clockwork Heart + 4 Gold Ingot | 1 Ancestor Relic |

**Progression.** Goods delivered to the Great Hall fill the current tier first, and the surplus goes into your stockpile, which pays for construction. You can also hand stockpiled goods to the Hall with *Bring from stockpile*.

| Tier | Requires | Unlocks |
| --- | --- | --- |
| 1. The First Hoard | 40 Iron Ingot, 20 Copper Ingot | Runesmith Anvil, Splitter, Cog, Wire |
| 2. Stone and Rune | 40 Cog, 60 Wire, 30 Brick | Tunnel, Rune Stone |
| 3. Gold of the Deep | 25 Rune Stone, 20 Gold Ingot | Deep Drill, Clockwork Heart |
| 4. The Ticking Heart | 30 Clockwork Heart | Ancestor Relic |
| 5. Legacy of the Hold | 10 Ancestor Relic | Victory |

The game autosaves to `localStorage`. The ✦ button founds a new hold on a freshly generated map.

## Code layout

| File | Purpose |
| --- | --- |
| `js/data.js` | Items, recipes, buildings, tiers, tuning constants |
| `js/world.js` | Seeded noise and cavern / ore-seam generation |
| `js/sim.js` | Simulation: placement, item transfer (`accept` / `pushOut`), per-tick updates, save/load |
| `js/sprites.js` | Procedural terrain tiles and item icons |
| `js/render.js` | Canvas rendering, building art, particles, lighting |
| `js/ui.js` | HUD: stockpile, tier panel, build bar, inspector, toasts |
| `js/main.js` | Input, camera, main loop (fixed 60 Hz simulation), autosave |

To add a recipe or building, start in `data.js`; new building behaviour goes in `accept()` and `stepSim()` in `sim.js`, and its art in `ART` in `render.js`.
