// ─── Deepforge: static game data ────────────────────────────────────────────
// Items, recipes, buildings and the Great Hall's tiers of progression.

const TILE = 32;
const MAP_W = 128;
const MAP_H = 96;

// Directions: 0 = north, 1 = east, 2 = south, 3 = west
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIR_NAMES = ['north', 'east', 'south', 'west'];

// Terrain codes
const T_FLOOR = 0, T_WALL = 1, T_LAVA = 2, T_BEDROCK = 3;

// Ore deposit codes (index into ORE_ITEMS)
const ORE_ITEMS = [null, 'stone', 'coal', 'iron_ore', 'copper_ore', 'gold_ore'];

const ITEMS = {
  stone:        { name: 'Stone',           kind: 'chunk', color: '#8d877f', hi: '#b9b2a6' },
  coal:         { name: 'Coal',            kind: 'chunk', color: '#26211e', hi: '#5c544d' },
  iron_ore:     { name: 'Iron Ore',        kind: 'chunk', color: '#7a4a3a', hi: '#c48a6c' },
  copper_ore:   { name: 'Copper Ore',      kind: 'chunk', color: '#3d7d6b', hi: '#e08e4e' },
  gold_ore:     { name: 'Gold Ore',        kind: 'chunk', color: '#6e6450', hi: '#ffd75a' },
  iron_ingot:   { name: 'Iron Ingot',      kind: 'ingot', color: '#9aa5b1', hi: '#d6dee6' },
  copper_ingot: { name: 'Copper Ingot',    kind: 'ingot', color: '#c8692f', hi: '#f2a56a' },
  gold_ingot:   { name: 'Gold Ingot',      kind: 'ingot', color: '#e3b232', hi: '#fff0a0' },
  stone_brick:  { name: 'Stone Brick',     kind: 'brick', color: '#a39785', hi: '#cfc4b2' },
  iron_gear:    { name: 'Iron Cog',        kind: 'gear',  color: '#8a95a2', hi: '#c8d1da' },
  copper_wire:  { name: 'Copper Wire',     kind: 'wire',  color: '#d87a3a', hi: '#ffb47a' },
  rune_stone:   { name: 'Rune Stone',      kind: 'rune',  color: '#5d6672', hi: '#6fe0ff' },
  clockwork:    { name: 'Clockwork Heart', kind: 'clock', color: '#c9a24a', hi: '#6fe0ff' },
  relic:        { name: 'Ancestor Relic',  kind: 'relic', color: '#f0c03c', hi: '#ff5a6a' },
};

// Forge: picks its recipe from the ore it is fed. Every smelt burns fuel.
const FORGE_RECIPES = {
  iron_ore:   { need: 1, out: 'iron_ingot',   n: 1, time: 2.0 },
  copper_ore: { need: 1, out: 'copper_ingot', n: 1, time: 2.0 },
  gold_ore:   { need: 1, out: 'gold_ingot',   n: 1, time: 3.0 },
  stone:      { need: 2, out: 'stone_brick',  n: 1, time: 2.0 },
};
const COAL_SMELTS = 3;     // smelts per lump of coal
const FORGE_CAP = 12;      // max ore / coal / output held

// Runesmith Anvil recipes. `tier` = number of Great Hall tiers completed to unlock.
const SMITHY_RECIPES = {
  iron_gear:   { in: { iron_ingot: 2 },                                out: 'iron_gear',   n: 1, time: 1.5, tier: 1 },
  copper_wire: { in: { copper_ingot: 1 },                              out: 'copper_wire', n: 2, time: 1.0, tier: 1 },
  rune_stone:  { in: { stone_brick: 1, copper_wire: 3 },               out: 'rune_stone',  n: 1, time: 3.0, tier: 2 },
  clockwork:   { in: { iron_gear: 2, rune_stone: 1, gold_ingot: 1 },   out: 'clockwork',   n: 1, time: 4.0, tier: 3 },
  relic:       { in: { clockwork: 3, gold_ingot: 4 },                  out: 'relic',       n: 1, time: 8.0, tier: 4 },
};

const BUILDINGS = {
  belt: {
    name: 'Conveyor', size: 1, tier: 0, cost: { iron_ingot: 1 },
    desc: 'Iron-rollered track. Carries goods one way. Drag to lay a line; goods join from the side.',
  },
  drill: {
    name: 'Delving Drill', size: 2, tier: 0, cost: { stone: 10, iron_ingot: 8 }, rate: 1.6,
    desc: 'Bites into the deposits beneath it and pushes ore out of its front face.',
  },
  forge: {
    name: 'Smelting Forge', size: 2, tier: 0, cost: { stone: 15 },
    desc: 'Feed it ore and coal. Smelts iron, copper and gold ingots, and fires stone into bricks.',
  },
  vault: {
    name: 'Vault', size: 1, tier: 0, cost: { stone: 10, iron_ingot: 4 },
    desc: 'Iron-banded strongbox. Holds up to 400 goods until you take them to your stockpile.',
  },
  smithy: {
    name: 'Runesmith Anvil', size: 2, tier: 1, cost: { iron_ingot: 15, stone: 10 },
    desc: 'Choose a recipe and feed it ingredients. Hammers out cogs, wire, runes and more.',
  },
  splitter: {
    name: 'Splitter', size: 1, tier: 1, cost: { iron_ingot: 4, copper_ingot: 2 },
    desc: 'Deals goods in turn to its front, left and right.',
  },
  tunnel: {
    name: 'Tunnel', size: 1, tier: 2, cost: { stone_brick: 4, iron_gear: 2 },
    desc: 'Place an entrance, then an exit up to 5 tiles ahead facing the same way. Goods pass beneath anything.',
  },
  deepdrill: {
    name: 'Deep Drill', size: 2, tier: 3, cost: { iron_gear: 10, rune_stone: 4, stone_brick: 10 }, rate: 0.6,
    desc: 'Rune-driven drill. Mines nearly three times as fast as a Delving Drill.',
  },
  hall: {
    name: 'Great Hall', size: 3, tier: 99, cost: {},
    desc: 'Seat of the clan. Goods delivered here fill the current tier, the rest goes to your stockpile.',
  },
};

// Order shown in the build bar (hotkeys 1..n)
const BUILD_ORDER = ['belt', 'drill', 'forge', 'vault', 'smithy', 'splitter', 'tunnel', 'deepdrill'];

const TIERS = [
  {
    name: 'The First Hoard',
    lore: 'Prove the hold can feed its fires. Bring iron and copper to the Great Hall.',
    req: { iron_ingot: 40, copper_ingot: 20 },
    unlocks: 'Runesmith Anvil, Splitter, Iron Cog, Copper Wire',
  },
  {
    name: 'Stone and Rune',
    lore: 'The elders want cogs for the lifts and wire for the speaking-stones.',
    req: { iron_gear: 40, copper_wire: 60, stone_brick: 30 },
    unlocks: 'Tunnel, Rune Stone',
  },
  {
    name: 'Gold of the Deep',
    lore: 'Runes to ward the halls, and gold from the far seams to pay the masons.',
    req: { rune_stone: 25, gold_ingot: 20 },
    unlocks: 'Deep Drill, Clockwork Heart',
  },
  {
    name: 'The Ticking Heart',
    lore: 'Clockwork hearts will wake the ancient golem-doors of the lower deeps.',
    req: { clockwork: 30 },
    unlocks: 'Ancestor Relic',
  },
  {
    name: 'Legacy of the Hold',
    lore: 'Forge relics worthy of the ancestors, and the hold will be remembered for an age.',
    req: { relic: 10 },
    unlocks: 'Victory',
  },
];

const BELT_SPEED = 2.0;   // tiles per second
const BELT_GAP = 0.34;    // min spacing between goods on one belt (≈3 per tile)
const TUNNEL_RANGE = 5;   // max tiles between tunnel entrance and exit
const VAULT_CAP = 400;

function itemName(id) { return ITEMS[id] ? ITEMS[id].name : id; }
