// ─── Deepforge: simulation ──────────────────────────────────────────────────
// Buildings occupy grid cells. Goods move between buildings with accept():
// the source offers an item from a neighbouring tile, the target takes it or not.

let S = null;           // the whole game state
const simEvents = [];   // messages for the UI: { text, kind }

function emit(text, kind = 'info') { simEvents.push({ text, kind }); }

const tIdx = (x, y) => y * MAP_W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function entAt(x, y) {
  if (!inMap(x, y)) return null;
  const id = S.grid[tIdx(x, y)];
  return id ? S.ents.get(id) : null;
}

function newGame(seed) {
  const world = generateWorld(seed);
  S = {
    seed, world,
    grid: new Int32Array(MAP_W * MAP_H),
    ents: new Map(),
    nextId: 1,
    stock: { stone: 40, iron_ingot: 40 },
    tier: 0,
    progress: {},
    dug: [],
    won: false,
    time: 0,
    produced: {},  // totals delivered to the hall, for stats
  };
  spawn('hall', world.hallX, world.hallY, 2);
  return S;
}

// ── Construction ────────────────────────────────────────────────────────────

function makeEnt(type, x, y, dir) {
  const def = BUILDINGS[type];
  const e = { id: S.nextId++, type, x, y, dir, size: def.size, rr: 0 };
  switch (type) {
    case 'belt': e.items = []; break;
    case 'drill': case 'deepdrill': e.timer = 0; e.out = null; e.oreIdx = 0; break;
    case 'forge': e.inItem = null; e.inN = 0; e.fuel = 0; e.fuelLeft = 0; e.prog = 0; e.crafting = null; e.outItem = null; e.outN = 0; break;
    case 'smithy': e.recipe = null; e.buf = {}; e.prog = 0; e.crafting = false; e.outItem = null; e.outN = 0; break;
    case 'vault': e.store = {}; e.total = 0; break;
    case 'splitter': e.held = null; break;
    case 'tunnel': e.mode = 'in'; e.partner = 0; e.queue = []; break;
  }
  return e;
}

function registerEnt(e) {
  S.ents.set(e.id, e);
  for (let dy = 0; dy < e.size; dy++)
    for (let dx = 0; dx < e.size; dx++)
      S.grid[tIdx(e.x + dx, e.y + dy)] = e.id;
  refreshDerived(e);
}

// Cached geometry: output ports and ores under drills.
function refreshDerived(e) {
  e.ports = frontPorts(e);
  if (e.type === 'drill' || e.type === 'deepdrill') {
    e.ores = [];
    for (let dy = 0; dy < e.size; dy++)
      for (let dx = 0; dx < e.size; dx++) {
        const o = S.world.ore[tIdx(e.x + dx, e.y + dy)];
        if (o) e.ores.push(o);
      }
  }
}

function spawn(type, x, y, dir) {
  const e = makeEnt(type, x, y, dir);
  registerEnt(e);
  return e;
}

// For each cell on the front edge: [sourceX, sourceY, targetX, targetY]
function frontPorts(e) {
  const s = e.size, ports = [];
  for (let i = 0; i < s; i++) {
    let sx, sy;
    switch (e.dir) {
      case 0: sx = e.x + i; sy = e.y; break;
      case 1: sx = e.x + s - 1; sy = e.y + i; break;
      case 2: sx = e.x + s - 1 - i; sy = e.y + s - 1; break;
      default: sx = e.x; sy = e.y + s - 1 - i; break;
    }
    ports.push([sx, sy, sx + DIRS[e.dir][0], sy + DIRS[e.dir][1]]);
  }
  return ports;
}

function isUnlocked(type) { return BUILDINGS[type].tier <= S.tier; }

function canAfford(cost) {
  for (const k in cost) if ((S.stock[k] || 0) < cost[k]) return false;
  return true;
}

function missingFor(cost) {
  const out = [];
  for (const k in cost) {
    const lack = cost[k] - (S.stock[k] || 0);
    if (lack > 0) out.push(`${lack} ${itemName(k)}`);
  }
  return out.join(', ');
}

function addStock(item, n) { S.stock[item] = (S.stock[item] || 0) + n; }

// Returns '' if placement is fine, else a reason.
function placementProblem(type, x, y) {
  const def = BUILDINGS[type];
  if (!isUnlocked(type)) return 'Not yet unlocked';
  for (let dy = 0; dy < def.size; dy++)
    for (let dx = 0; dx < def.size; dx++) {
      const cx = x + dx, cy = y + dy;
      if (!inMap(cx, cy)) return 'Out of bounds';
      const t = S.world.terrain[tIdx(cx, cy)];
      if (t === T_WALL) return 'Solid rock: dig it out first';
      if (t === T_LAVA) return 'Cannot build on lava';
      if (t === T_BEDROCK) return 'Bedrock';
      if (S.grid[tIdx(cx, cy)]) return 'Occupied';
    }
  if (!canAfford(def.cost)) return 'Need ' + missingFor(def.cost);
  return '';
}

function tryPlace(type, x, y, dir) {
  // Re-laying a conveyor over a conveyor just turns it.
  if (type === 'belt') {
    const ex = entAt(x, y);
    if (ex && ex.type === 'belt') {
      if (ex.dir !== dir) ex.dir = dir;
      ex.ports = frontPorts(ex);
      return { ok: true, ent: ex };
    }
  }
  const why = placementProblem(type, x, y);
  if (why) return { ok: false, why };
  const cost = BUILDINGS[type].cost;
  for (const k in cost) S.stock[k] -= cost[k];
  const e = spawn(type, x, y, dir);
  if (type === 'tunnel') linkTunnel(e);
  return { ok: true, ent: e };
}

function linkTunnel(e) {
  const [dx, dy] = DIRS[e.dir];
  // An unpaired entrance behind us? Then we are its exit.
  for (let k = 1; k <= TUNNEL_RANGE; k++) {
    const t = entAt(e.x - dx * k, e.y - dy * k);
    if (t && t.type === 'tunnel' && t.dir === e.dir) {
      if (t.mode === 'in' && !t.partner) {
        e.mode = 'out'; e.partner = t.id; t.partner = e.id;
        return;
      }
      break;
    }
  }
  // An unpaired exit ahead? Then we are its entrance.
  for (let k = 1; k <= TUNNEL_RANGE; k++) {
    const t = entAt(e.x + dx * k, e.y + dy * k);
    if (t && t.type === 'tunnel' && t.dir === e.dir) {
      if (t.mode === 'out' && !t.partner) {
        e.mode = 'in'; e.partner = t.id; t.partner = e.id;
      }
      break;
    }
  }
}

function contentsOf(e) {
  const out = {};
  const add = (k, n) => { if (k && n > 0) out[k] = (out[k] || 0) + n; };
  switch (e.type) {
    case 'belt': for (const it of e.items) add(it.t, 1); break;
    case 'drill': case 'deepdrill': add(e.out, 1); break;
    case 'forge':
      add(e.inItem, e.inN); add('coal', e.fuel); add(e.outItem, e.outN);
      if (e.crafting) add(e.crafting, FORGE_RECIPES[e.crafting].need);
      break;
    case 'smithy':
      for (const k in e.buf) add(k, e.buf[k]);
      add(e.outItem, e.outN);
      if (e.crafting && e.recipe) for (const k in SMITHY_RECIPES[e.recipe].in) add(k, SMITHY_RECIPES[e.recipe].in[k]);
      break;
    case 'vault': for (const k in e.store) add(k, e.store[k]); break;
    case 'splitter': add(e.held, 1); break;
    case 'tunnel': for (const q of e.queue) add(q.t, 1); break;
  }
  return out;
}

function demolish(e) {
  if (!e || e.type === 'hall') return false;
  const cost = BUILDINGS[e.type].cost;
  for (const k in cost) addStock(k, cost[k]);
  const c = contentsOf(e);
  for (const k in c) addStock(k, c[k]);
  if (e.type === 'tunnel' && e.partner) {
    const p = S.ents.get(e.partner);
    if (p) p.partner = 0;
  }
  for (let dy = 0; dy < e.size; dy++)
    for (let dx = 0; dx < e.size; dx++)
      S.grid[tIdx(e.x + dx, e.y + dy)] = 0;
  S.ents.delete(e.id);
  return true;
}

function rotateEnt(e, by = 1) {
  if (!e || e.type === 'hall') return;
  if (e.type === 'tunnel') {
    if (e.partner) { const p = S.ents.get(e.partner); if (p) p.partner = 0; e.partner = 0; }
    e.dir = (e.dir + 4 + by) % 4;
    e.mode = 'in';
    linkTunnel(e);
  } else {
    e.dir = (e.dir + 4 + by) % 4;
  }
  e.ports = frontPorts(e);
}

// ── Hand work ───────────────────────────────────────────────────────────────

// What a click-and-hold on this tile yields. null if nothing.
function handMineInfo(x, y) {
  if (!inMap(x, y) || S.grid[tIdx(x, y)]) return null;
  const i = tIdx(x, y);
  const t = S.world.terrain[i];
  if (t === T_WALL) return { time: 1.1, kind: 'wall' };
  if (t === T_FLOOR && S.world.ore[i]) return { time: 0.55, kind: 'ore', item: ORE_ITEMS[S.world.ore[i]] };
  return null;
}

function handMineFinish(x, y) {
  const info = handMineInfo(x, y);
  if (!info) return null;
  if (info.kind === 'wall') {
    const i = tIdx(x, y);
    S.world.terrain[i] = T_FLOOR;
    S.dug.push(i);
    addStock('stone', 2);
    return { item: 'stone', n: 2 };
  }
  addStock(info.item, 1);
  return { item: info.item, n: 1 };
}

// ── The Great Hall ──────────────────────────────────────────────────────────

function deliverToHall(item) {
  const T = TIERS[S.tier];
  S.produced[item] = (S.produced[item] || 0) + 1;
  if (T && T.req[item] && (S.progress[item] || 0) < T.req[item]) {
    S.progress[item] = (S.progress[item] || 0) + 1;
    checkTier();
  } else {
    addStock(item, 1);
  }
}

function contributeFromStock() {
  const T = TIERS[S.tier];
  if (!T) return 0;
  let moved = 0;
  for (const k in T.req) {
    const need = T.req[k] - (S.progress[k] || 0);
    const n = Math.min(need, S.stock[k] || 0);
    if (n > 0) {
      S.stock[k] -= n;
      S.progress[k] = (S.progress[k] || 0) + n;
      moved += n;
    }
  }
  checkTier();
  return moved;
}

function tierComplete() {
  const T = TIERS[S.tier];
  if (!T) return false;
  for (const k in T.req) if ((S.progress[k] || 0) < T.req[k]) return false;
  return true;
}

function checkTier() {
  if (!tierComplete()) return;
  const T = TIERS[S.tier];
  S.tier++;
  S.progress = {};
  if (S.tier >= TIERS.length) {
    S.won = true;
    emit('The Legacy of the Hold is secured. The ancestors sing your name!', 'victory');
  } else {
    emit(`Tier complete: ${T.name}. Unlocked ${T.unlocks}.`, 'unlock');
  }
}

// ── Goods transfer ──────────────────────────────────────────────────────────

function dirIndex(dx, dy) {
  if (dy < 0) return 0;
  if (dx > 0) return 1;
  if (dy > 0) return 2;
  return 3;
}

// Direction of travel for an item moving from tile (fx,fy) into entity e.
function travelDir(e, fx, fy) {
  const cx = clamp(fx, e.x, e.x + e.size - 1);
  const cy = clamp(fy, e.y, e.y + e.size - 1);
  return dirIndex(cx - fx, cy - fy);
}

function accept(e, item, fx, fy) {
  switch (e.type) {
    case 'belt': {
      const d = travelDir(e, fx, fy);
      if (d === (e.dir + 2) % 4) return false;
      const items = e.items;
      if (d === e.dir) {
        if (items.length && items[0].p < BELT_GAP) return false;
        items.unshift({ t: item, p: 0 });
        return true;
      }
      // side-load into the middle of the belt
      let at = 0;
      for (let i = 0; i < items.length; i++) {
        if (Math.abs(items[i].p - 0.5) < BELT_GAP) return false;
        if (items[i].p < 0.5) at = i + 1;
      }
      items.splice(at, 0, { t: item, p: 0.5 });
      return true;
    }
    case 'forge': {
      if (item === 'coal') {
        if (e.fuel >= FORGE_CAP) return false;
        e.fuel++;
        return true;
      }
      if (!FORGE_RECIPES[item]) return false;
      if (e.inItem && e.inItem !== item && e.inN > 0) return false;
      if (e.inN >= FORGE_CAP) return false;
      e.inItem = item; e.inN++;
      return true;
    }
    case 'smithy': {
      if (!e.recipe) return false;
      const need = SMITHY_RECIPES[e.recipe].in[item];
      if (!need) return false;
      if ((e.buf[item] || 0) >= Math.max(need * 3, 6)) return false;
      e.buf[item] = (e.buf[item] || 0) + 1;
      return true;
    }
    case 'vault':
      if (e.total >= VAULT_CAP) return false;
      e.store[item] = (e.store[item] || 0) + 1; e.total++;
      return true;
    case 'hall':
      deliverToHall(item);
      return true;
    case 'splitter': {
      if (e.held) return false;
      if (fx === e.x + DIRS[e.dir][0] && fy === e.y + DIRS[e.dir][1]) return false;
      e.held = item;
      return true;
    }
    case 'tunnel': {
      if (e.mode !== 'in' || travelDir(e, fx, fy) !== e.dir) return false;
      const q = e.queue;
      if (q.length >= 3 * (TUNNEL_RANGE + 1)) return false;
      if (q.length && q[q.length - 1].e < BELT_GAP / BELT_SPEED) return false;
      q.push({ t: item, e: 0 });
      return true;
    }
  }
  return false;
}

// Offer an item to the tiles in front of a building, rotating between ports.
function pushOut(e, item) {
  const ports = e.ports, n = ports.length;
  for (let k = 0; k < n; k++) {
    const j = (e.rr + k) % n;
    const [sx, sy, tx, ty] = ports[j];
    const t = entAt(tx, ty);
    if (t && t !== e && accept(t, item, sx, sy)) {
      e.rr = (j + 1) % n;
      return true;
    }
  }
  return false;
}

// ── Per-tick updates ────────────────────────────────────────────────────────

function updateBelt(b, dt) {
  const items = b.items;
  if (!items.length) return;
  const step = BELT_SPEED * dt;
  const last = items.length - 1;
  for (let i = last; i >= 0; i--) {
    const it = items[i];
    const limit = i === last ? 1 : items[i + 1].p - BELT_GAP;
    if (limit > it.p) it.p = Math.min(it.p + step, limit);
  }
  const head = items[last];
  if (head.p >= 1) {
    const t = entAt(b.x + DIRS[b.dir][0], b.y + DIRS[b.dir][1]);
    if (t && accept(t, head.t, b.x, b.y)) items.splice(items.indexOf(head), 1);
  }
}

function updateDrill(d, dt) {
  const rate = BUILDINGS[d.type].rate;
  d.active = false;
  if (!d.ores.length) { d.status = 'No ore beneath'; return; }
  if (d.out) {
    if (pushOut(d, d.out)) d.out = null;
    else { d.status = 'Output blocked'; return; }
  }
  d.active = true;
  d.status = 'Mining';
  d.timer += dt;
  if (d.timer >= rate) {
    d.timer -= rate;
    d.out = ORE_ITEMS[d.ores[d.oreIdx++ % d.ores.length]];
    if (pushOut(d, d.out)) d.out = null;
  }
}

function updateForge(f, dt) {
  if (f.outN > 0 && pushOut(f, f.outItem)) { f.outN--; if (!f.outN) f.outItem = null; }
  if (f.crafting) {
    const r = FORGE_RECIPES[f.crafting];
    f.prog = Math.min(r.time, f.prog + dt);
    if (f.prog >= r.time) {
      if (f.outN === 0 || (f.outItem === r.out && f.outN + r.n <= FORGE_CAP)) {
        f.outItem = r.out; f.outN += r.n;
        f.crafting = null; f.prog = 0;
      } else { f.status = 'Output full'; return; }
    } else { f.status = 'Smelting'; return; }
  }
  if (!f.inItem) { f.status = f.fuel || f.fuelLeft ? 'Waiting for ore' : 'Idle: needs ore and coal'; return; }
  const r = FORGE_RECIPES[f.inItem];
  if (f.inN < r.need) { f.status = 'Waiting for more ' + itemName(f.inItem); return; }
  if (f.fuelLeft <= 0 && f.fuel <= 0) { f.status = 'Out of coal'; return; }
  if (f.outN > 0 && (f.outItem !== r.out || f.outN + r.n > FORGE_CAP)) { f.status = 'Output full'; return; }
  if (f.fuelLeft <= 0) { f.fuel--; f.fuelLeft = COAL_SMELTS; }
  f.fuelLeft--;
  f.inN -= r.need;
  f.crafting = f.inItem;
  if (!f.inN) f.inItem = null;
  f.prog = 0;
  f.status = 'Smelting';
}

function updateSmithy(s, dt) {
  if (s.outN > 0 && pushOut(s, s.outItem)) { s.outN--; if (!s.outN) s.outItem = null; }
  if (!s.recipe) { s.status = 'Choose a recipe'; return; }
  const r = SMITHY_RECIPES[s.recipe];
  if (s.crafting) {
    s.prog = Math.min(r.time, s.prog + dt);
    if (s.prog < r.time) { s.status = 'Hammering'; return; }
    if (s.outN === 0 || (s.outItem === r.out && s.outN + r.n <= FORGE_CAP)) {
      s.outItem = r.out; s.outN += r.n; s.crafting = false; s.prog = 0;
    } else { s.status = 'Output full'; return; }
  }
  for (const k in r.in) if ((s.buf[k] || 0) < r.in[k]) { s.status = 'Waiting for ' + itemName(k); return; }
  if (s.outN > 0 && (s.outItem !== r.out || s.outN + r.n > FORGE_CAP)) { s.status = 'Output full'; return; }
  for (const k in r.in) s.buf[k] -= r.in[k];
  s.crafting = true; s.prog = 0; s.status = 'Hammering';
}

function setSmithyRecipe(s, key) {
  if (s.recipe === key) return;
  // return loose ingredients and finished goods to the stockpile
  const c = contentsOf(s);
  for (const k in c) addStock(k, c[k]);
  s.buf = {}; s.crafting = false; s.prog = 0; s.outItem = null; s.outN = 0;
  s.recipe = key;
}

function updateSplitter(s) {
  if (!s.held) return;
  const order = [s.dir, (s.dir + 3) % 4, (s.dir + 1) % 4]; // front, left, right
  for (let k = 0; k < 3; k++) {
    const j = (s.rr + k) % 3;
    const d = order[j];
    const t = entAt(s.x + DIRS[d][0], s.y + DIRS[d][1]);
    if (t && accept(t, s.held, s.x, s.y)) { s.held = null; s.rr = (j + 1) % 3; return; }
  }
}

function updateTunnel(t, dt) {
  if (t.mode !== 'in') return;
  for (const q of t.queue) q.e += dt;
  const out = t.partner && S.ents.get(t.partner);
  if (!out || !t.queue.length) return;
  const dist = Math.abs(out.x - t.x) + Math.abs(out.y - t.y);
  if (t.queue[0].e < dist / BELT_SPEED) return;
  const tgt = entAt(out.x + DIRS[out.dir][0], out.y + DIRS[out.dir][1]);
  if (tgt && accept(tgt, t.queue[0].t, out.x, out.y)) t.queue.shift();
}

function stepSim(dt) {
  S.time += dt;
  for (const e of S.ents.values()) {
    switch (e.type) {
      case 'belt': updateBelt(e, dt); break;
      case 'drill': case 'deepdrill': updateDrill(e, dt); break;
      case 'forge': updateForge(e, dt); break;
      case 'smithy': updateSmithy(e, dt); break;
      case 'splitter': updateSplitter(e); break;
      case 'tunnel': updateTunnel(e, dt); break;
    }
  }
}

// ── Save / load ─────────────────────────────────────────────────────────────

const SAVE_KEY = 'deepforge-save-v1';

function serialize() {
  const ents = [];
  for (const e of S.ents.values()) {
    const o = {};
    for (const k in e) if (k !== 'ports' && k !== 'ores' && k !== 'status' && k !== 'active') o[k] = e[k];
    ents.push(o);
  }
  return JSON.stringify({
    v: 1, seed: S.seed, stock: S.stock, tier: S.tier, progress: S.progress,
    dug: S.dug, won: S.won, time: S.time, produced: S.produced, nextId: S.nextId, ents,
  });
}

function deserialize(json) {
  const d = JSON.parse(json);
  if (d.v !== 1) throw new Error('Unknown save version');
  newGame(d.seed);
  // clear the default hall; the save has its own
  S.grid.fill(0); S.ents.clear();
  for (const i of d.dug) S.world.terrain[i] = T_FLOOR;
  Object.assign(S, {
    stock: d.stock, tier: d.tier, progress: d.progress, dug: d.dug,
    won: d.won, time: d.time, produced: d.produced || {}, nextId: d.nextId,
  });
  for (const o of d.ents) registerEnt(Object.assign({}, o));
  return S;
}
