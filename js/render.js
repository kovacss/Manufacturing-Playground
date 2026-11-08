// ─── Deepforge: rendering ───────────────────────────────────────────────────

const cam = { x: 0, y: 0, zoom: 1.4 };
const particles = [];
let lightCanvas = null, lightCtx = null;

function worldToScreen(wx, wy, vw, vh) {
  return [(wx - cam.x) * cam.zoom + vw / 2, (wy - cam.y) * cam.zoom + vh / 2];
}
function screenToWorld(sx, sy, vw, vh) {
  return [(sx - vw / 2) / cam.zoom + cam.x, (sy - vh / 2) / cam.zoom + cam.y];
}

function addParticle(p) { if (particles.length < 500) particles.push(p); }

// ── Building art. Drawn in a local frame: origin at centre, front = up (-y). ─

function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

function drawRivets(g, pts, col = '#c9a24a') {
  g.fillStyle = col;
  for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
}

function drawFrontChute(g, half) {
  g.fillStyle = '#2a211b';
  g.fillRect(-12, -half - 1, 24, 8);
  g.fillStyle = '#c9a24a';
  g.beginPath(); g.moveTo(-5, -half + 5); g.lineTo(0, -half); g.lineTo(5, -half + 5); g.closePath(); g.fill();
}

const ART = {
  belt(g, e, t) {
    g.fillStyle = '#211a16'; g.fillRect(-16, -16, 32, 32);
    const off = (t * BELT_SPEED * 32) % 8;
    for (let i = -1; i < 5; i++) {
      const y = -16 + i * 8 - off + 8;
      if (y < -16 || y > 12) continue;
      g.fillStyle = '#4a3e35'; g.fillRect(-11, y, 22, 5);
      g.fillStyle = '#5e5045'; g.fillRect(-11, y, 22, 1.5);
    }
    g.fillStyle = '#6b5442'; g.fillRect(-16, -16, 5, 32); g.fillRect(11, -16, 5, 32);
    g.fillStyle = '#3a2d24'; g.fillRect(-12, -16, 1, 32); g.fillRect(11, -16, 1, 32);
    drawRivets(g, [[-13.5, -9], [-13.5, 7], [13.5, -9], [13.5, 7]], '#9a8a70');
  },

  drill(g, e, t, deep) {
    const half = 32;
    rr(g, -29, -27, 58, 56, 6); g.fillStyle = deep ? '#363b4a' : '#4b3f35'; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#140f0c'; g.stroke();
    // iron bands
    g.fillStyle = deep ? '#596178' : '#6c5c4d';
    g.fillRect(-29, -6, 58, 5); g.fillRect(-29, 12, 58, 5);
    drawRivets(g, [[-24, -22], [24, -22], [-24, 24], [24, 24]]);
    // the bit
    const a = e.active ? t * (deep ? 9 : 5) : 0;
    g.save(); g.translate(0, 2);
    g.beginPath(); g.arc(0, 0, 15, 0, 7); g.fillStyle = '#1b1512'; g.fill();
    g.rotate(a);
    for (let k = 0; k < 3; k++) {
      g.rotate((Math.PI * 2) / 3);
      g.fillStyle = deep ? '#8fe8ff' : '#a9b2bc';
      g.beginPath(); g.moveTo(-3, 0); g.lineTo(0, -14); g.lineTo(3, 0); g.closePath(); g.fill();
    }
    g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fillStyle = '#c9a24a'; g.fill();
    g.restore();
    if (deep) {
      g.strokeStyle = 'rgba(111,224,255,0.8)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 2, 19, 0, 7); g.stroke();
    }
    drawFrontChute(g, half);
  },

  forge(g, e, t) {
    const half = 32;
    rr(g, -29, -26, 58, 56, 8); g.fillStyle = '#5b4e43'; g.fill();
    g.strokeStyle = '#140f0c'; g.lineWidth = 2; g.stroke();
    // brick courses
    g.strokeStyle = '#463b32'; g.lineWidth = 1;
    for (let y = -18; y < 28; y += 8) {
      g.beginPath(); g.moveTo(-28, y); g.lineTo(28, y); g.stroke();
      for (let x = -24 + ((y / 8) % 2 ? 6 : 0); x < 28; x += 12) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); }
    }
    // dome
    g.beginPath(); g.arc(0, 4, 19, 0, 7); g.fillStyle = '#6e6055'; g.fill(); g.strokeStyle = '#2a211b'; g.lineWidth = 2; g.stroke();
    // fire mouth (front)
    const lit = !!e.crafting;
    const fl = lit ? 0.75 + Math.sin(t * 17 + e.id) * 0.12 + Math.sin(t * 7.3) * 0.1 : 0.15;
    g.beginPath(); g.arc(0, -6, 10, Math.PI, 0); g.lineTo(10, 0); g.lineTo(-10, 0); g.closePath();
    g.fillStyle = '#120c09'; g.fill();
    if (lit || e.fuelLeft > 0 || e.fuel > 0) {
      const grd = g.createRadialGradient(0, -2, 1, 0, -4, 11);
      grd.addColorStop(0, `rgba(255,230,140,${fl})`);
      grd.addColorStop(0.5, `rgba(255,120,30,${fl * 0.9})`);
      grd.addColorStop(1, 'rgba(120,20,0,0)');
      g.fillStyle = grd; g.fill();
    }
    // chimney (back corner)
    g.fillStyle = '#3b312a'; g.fillRect(14, 14, 11, 11);
    g.fillStyle = '#0f0b09'; g.fillRect(16, 16, 7, 7);
    drawFrontChute(g, half);
  },

  smithy(g, e, t) {
    const half = 32;
    rr(g, -29, -26, 58, 56, 5); g.fillStyle = '#4a3626'; g.fill();
    g.strokeStyle = '#140f0c'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = '#3b2a1d'; g.lineWidth = 1;
    for (let x = -22; x < 28; x += 9) { g.beginPath(); g.moveTo(x, -26); g.lineTo(x, 30); g.stroke(); }
    // rune circle
    const work = e.crafting;
    g.strokeStyle = work ? `rgba(111,224,255,${0.55 + Math.sin(t * 6) * 0.25})` : 'rgba(111,224,255,0.18)';
    g.lineWidth = 2; g.beginPath(); g.arc(0, 4, 21, 0, 7); g.stroke();
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + t * (work ? 0.6 : 0);
      g.fillStyle = g.strokeStyle;
      g.fillRect(Math.cos(a) * 21 - 1.5, 4 + Math.sin(a) * 21 - 1.5, 3, 3);
    }
    // anvil
    g.fillStyle = '#2b2f36';
    g.beginPath(); g.moveTo(-15, -2); g.lineTo(13, -2); g.lineTo(19, 2); g.lineTo(8, 4); g.lineTo(6, 10); g.lineTo(10, 14); g.lineTo(-10, 14); g.lineTo(-6, 10); g.lineTo(-8, 4); g.lineTo(-15, 3); g.closePath();
    g.fill(); g.strokeStyle = '#0d0f12'; g.stroke();
    g.fillStyle = '#5d6672'; g.fillRect(-13, -2, 24, 2);
    // hammer
    const swing = work ? Math.abs(Math.sin(t * 7)) : 0.6;
    g.save(); g.translate(16, 12); g.rotate(-0.4 - swing * 1.1);
    g.fillStyle = '#7a5a3a'; g.fillRect(-1.5, -22, 3, 22);
    g.fillStyle = '#9aa5b1'; g.fillRect(-6, -26, 12, 7);
    g.restore();
    if (e.recipe && SPR.items[SMITHY_RECIPES[e.recipe].out]) g.drawImage(SPR.items[SMITHY_RECIPES[e.recipe].out], -27, 12, 16, 16);
    drawFrontChute(g, half);
  },

  vault(g, e) {
    rr(g, -14, -12, 28, 26, 3); g.fillStyle = '#6b4a2e'; g.fill();
    g.strokeStyle = '#140f0c'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#4e3520'; g.fillRect(-14, -4, 28, 2);
    g.fillStyle = '#5d6672'; g.fillRect(-9, -12, 4, 26); g.fillRect(5, -12, 4, 26);
    g.fillStyle = '#e3b232'; g.fillRect(-3, -6, 6, 7);
    g.fillStyle = '#140f0c'; g.fillRect(-1, -4, 2, 3);
    const fill = e.total ? e.total / VAULT_CAP : 0;
    if (fill > 0) { g.fillStyle = '#e3b232'; g.fillRect(-12, 11, 24 * fill, 2); }
  },

  splitter(g, e) {
    g.beginPath();
    for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); }
    g.closePath(); g.fillStyle = '#4f4740'; g.fill(); g.strokeStyle = '#140f0c'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#c9a24a';
    for (const a of [0, -Math.PI / 2, Math.PI / 2]) {
      g.save(); g.rotate(a);
      g.beginPath(); g.moveTo(-4, -6); g.lineTo(0, -12); g.lineTo(4, -6); g.closePath(); g.fill();
      g.restore();
    }
    g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fillStyle = e.held ? '#ffb43a' : '#2a211b'; g.fill();
  },

  tunnel(g, e) {
    const out = e.mode === 'out';
    g.fillStyle = '#5b4e43'; rr(g, -15, -15, 30, 30, 4); g.fill();
    g.strokeStyle = '#140f0c'; g.lineWidth = 2; g.stroke();
    // arch opening faces the side goods pass through
    g.save(); if (!out) g.rotate(Math.PI);
    g.beginPath(); g.moveTo(-9, -15); g.lineTo(-9, -2); g.arc(0, -2, 9, Math.PI, 0, true); g.lineTo(9, -15); g.closePath();
    g.fillStyle = '#0b0807'; g.fill();
    g.restore();
    g.fillStyle = out ? '#ffb43a' : '#6fe0ff';
    g.beginPath(); g.moveTo(-5, out ? -6 : 4); g.lineTo(0, out ? -11 : -1); g.lineTo(5, out ? -6 : 4); g.closePath(); g.fill();
    if (!e.partner) { g.fillStyle = '#ff5a4a'; g.fillRect(9, 9, 4, 4); }
  },

  hall(g, e, t) {
    // drawn unrotated, a carved gatehouse seen from slightly above
    g.fillStyle = '#2a231e'; rr(g, -47, -46, 94, 94, 6); g.fill();
    g.fillStyle = '#4a4038'; rr(g, -44, -44, 88, 72, 4); g.fill();
    g.strokeStyle = '#140f0c'; g.lineWidth = 2; g.stroke();
    // stone courses
    g.strokeStyle = '#3a312a'; g.lineWidth = 1;
    for (let y = -36; y < 28; y += 9) { g.beginPath(); g.moveTo(-44, y); g.lineTo(44, y); g.stroke(); }
    // gable
    g.fillStyle = '#5a4e44';
    g.beginPath(); g.moveTo(-40, -22); g.lineTo(0, -46); g.lineTo(40, -22); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#c9a24a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-32, -24); g.lineTo(0, -41); g.lineTo(32, -24); g.stroke();
    // great door
    g.fillStyle = '#16100c';
    g.beginPath(); g.moveTo(-16, 28); g.lineTo(-16, -6); g.arc(0, -6, 16, Math.PI, 0); g.lineTo(16, 28); g.closePath(); g.fill();
    g.strokeStyle = '#c9a24a'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#3a2a1c'; g.fillRect(-12, -4, 11, 32); g.fillRect(1, -4, 11, 32);
    g.fillStyle = '#c9a24a'; g.fillRect(-2, 6, 4, 4);
    // rune above the door
    g.strokeStyle = `rgba(111,224,255,${0.6 + Math.sin(t * 2) * 0.25})`; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -36); g.lineTo(0, -26); g.moveTo(-5, -33); g.lineTo(0, -29); g.lineTo(5, -33); g.stroke();
    // pillars
    for (const x of [-34, 26]) {
      g.fillStyle = '#6a5d50'; g.fillRect(x, -20, 8, 48);
      g.fillStyle = '#807265'; g.fillRect(x, -20, 3, 48);
      g.fillStyle = '#c9a24a'; g.fillRect(x - 1, -22, 10, 3); g.fillRect(x - 1, 26, 10, 3);
    }
    // steps
    g.fillStyle = '#5a4e44'; g.fillRect(-22, 28, 44, 6);
    g.fillStyle = '#4a4038'; g.fillRect(-26, 34, 52, 6);
    g.fillStyle = '#3a312a'; g.fillRect(-30, 40, 60, 6);
    // braziers
    for (const x of [-40, 40]) {
      g.fillStyle = '#2b2f36'; g.beginPath(); g.moveTo(x - 6, 34); g.lineTo(x + 6, 34); g.lineTo(x + 3, 42); g.lineTo(x - 3, 42); g.closePath(); g.fill();
      const f = 0.8 + Math.sin(t * 13 + x) * 0.2;
      g.fillStyle = `rgba(255,140,40,${f})`;
      g.beginPath(); g.moveTo(x - 5, 34); g.quadraticCurveTo(x, 22 - f * 4, x + 5, 34); g.fill();
      g.fillStyle = `rgba(255,230,140,${f})`;
      g.beginPath(); g.moveTo(x - 2, 34); g.quadraticCurveTo(x, 28 - f * 2, x + 2, 34); g.fill();
    }
  },
};

function drawBuilding(g, e, t) {
  const half = (e.size * TILE) / 2;
  g.save();
  g.translate(e.x * TILE + half, e.y * TILE + half);
  if (e.type !== 'hall') g.rotate(e.dir * Math.PI / 2);
  switch (e.type) {
    case 'drill': ART.drill(g, e, t, false); break;
    case 'deepdrill': ART.drill(g, e, t, true); break;
    default: ART[e.type](g, e, t);
  }
  g.restore();
}

// Icon for the build bar
function buildingIcon(type, px = 64) {
  const c = mkCanvas(px, px);
  const g = c.getContext('2d');
  const def = BUILDINGS[type];
  const fake = makeIconEnt(type);
  const scale = px / (def.size * TILE + 8);
  g.scale(scale, scale);
  g.translate(4, 4);
  drawBuilding(g, fake, 0.4);
  return c;
}

function makeIconEnt(type) {
  return { id: 0, type, x: 0, y: 0, dir: 0, size: BUILDINGS[type].size, items: [], active: false, crafting: null, fuel: 0, fuelLeft: 0, total: 0, mode: type === 'tunnel' ? 'in' : '', partner: 1, held: null, recipe: null };
}

// ── Frame rendering ─────────────────────────────────────────────────────────

function renderFrame(ctx, vw, vh, dpr, t, dt, view) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0807';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const z = cam.zoom;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * z), dpr * (vh / 2 - cam.y * z));
  ctx.imageSmoothingEnabled = false;

  const [wx0, wy0] = screenToWorld(0, 0, vw, vh);
  const [wx1, wy1] = screenToWorld(vw, vh, vw, vh);
  const tx0 = Math.max(0, Math.floor(wx0 / TILE) - 1), ty0 = Math.max(0, Math.floor(wy0 / TILE) - 1);
  const tx1 = Math.min(MAP_W - 1, Math.floor(wx1 / TILE) + 1), ty1 = Math.min(MAP_H - 1, Math.floor(wy1 / TILE) + 1);

  const W = S.world, lights = [];
  const lavaFrame = Math.floor(t * 3) % 4;

  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) {
      const i = y * MAP_W + x;
      const tt = W.terrain[i], d = W.deco[i];
      const px = x * TILE, py = y * TILE;
      if (tt === T_FLOOR) {
        ctx.drawImage(SPR.floor[d & 3], px, py);
        const o = W.ore[i];
        if (o) ctx.drawImage(SPR.ore[o][d % 3], px, py);
        else if (!S.grid[i]) {
          if (d % 41 === 0) { ctx.drawImage(SPR.deco.mushroom, px, py); lights.push([px + 16, py + 20, 1.2, '#3fd6c4']); }
          else if (d % 17 === 0) ctx.drawImage(SPR.deco.pebbles, px, py);
          else if (d === 77) ctx.drawImage(SPR.deco.bones, px, py);
        }
      } else if (tt === T_WALL) {
        const below = y + 1 < MAP_H ? W.terrain[i + MAP_W] : T_WALL;
        ctx.drawImage(below === T_WALL || below === T_BEDROCK ? SPR.wallTop[d & 3] : SPR.wallFace[d & 3], px, py);
      } else if (tt === T_LAVA) {
        ctx.drawImage(SPR.lava[(lavaFrame + d) & 3], px, py);
        if ((x + y) % 2 === 0) lights.push([px + 16, py + 16, 2.4, '#ff6a1a']);
        if (Math.random() < dt * 0.15) addParticle({ x: px + Math.random() * 32, y: py + Math.random() * 32, vx: 0, vy: -12, life: 0, max: 1.2, kind: 'ember' });
      } else {
        ctx.drawImage(SPR.bedrock, px, py);
      }
    }
  }

  // soft shadow along wall bases
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = ty0; y <= ty1; y++)
    for (let x = tx0; x <= tx1; x++) {
      const i = y * MAP_W + x;
      if (W.terrain[i] === T_FLOOR && y > 0 && W.terrain[i - MAP_W] === T_WALL) ctx.fillRect(x * TILE, y * TILE, TILE, 6);
    }

  // buildings
  const visible = [];
  for (const e of S.ents.values()) {
    if (e.x + e.size < tx0 || e.x > tx1 || e.y + e.size < ty0 || e.y > ty1) continue;
    visible.push(e);
  }
  for (const e of visible) if (e.type === 'belt') drawBuilding(ctx, e, t);
  // goods on belts
  ctx.imageSmoothingEnabled = true;
  for (const e of visible) {
    if (e.type !== 'belt') continue;
    const [dx, dy] = DIRS[e.dir];
    for (const it of e.items) {
      const cx = e.x * TILE + 16 + dx * (it.p - 0.5) * TILE;
      const cy = e.y * TILE + 16 + dy * (it.p - 0.5) * TILE;
      ctx.drawImage(SPR.items[it.t], cx - 9, cy - 9, 18, 18);
    }
  }
  for (const e of visible) {
    if (e.type === 'belt') continue;
    drawBuilding(ctx, e, t);
    const cx = e.x * TILE + e.size * 16, cy = e.y * TILE + e.size * 16;
    switch (e.type) {
      case 'hall': lights.push([cx, cy, 8, '#ff9a3a']); break;
      case 'forge':
        lights.push([cx, cy, e.crafting ? 4 : 1.8, '#ff7a2a']);
        if (e.crafting && Math.random() < dt * 4) {
          const [sx, sy] = rotLocal(e, 19, 19);
          addParticle({ x: sx, y: sy, vx: (Math.random() - 0.5) * 6, vy: -14, life: 0, max: 2.4, kind: 'smoke' });
        }
        break;
      case 'smithy':
        lights.push([cx, cy, e.crafting ? 3 : 1.6, '#6fe0ff']);
        if (e.crafting && Math.random() < dt * 6) addParticle({ x: cx + (Math.random() - 0.5) * 10, y: cy, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 30, life: 0, max: 0.45, kind: 'spark' });
        break;
      case 'drill': case 'deepdrill': lights.push([cx, cy, 2, e.type === 'deepdrill' ? '#6fe0ff' : '#ffc070']); break;
      case 'vault': case 'splitter': case 'tunnel': lights.push([cx, cy, 1.2, '#ffc070']); break;
    }
  }

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt; if (p.life >= p.max) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const k = 1 - p.life / p.max;
    if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(70,62,58,${0.45 * k})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 + (1 - k) * 7, 0, 7); ctx.fill();
    } else if (p.kind === 'spark') {
      p.vy += 160 * dt;
      ctx.fillStyle = `rgba(255,220,140,${k})`; ctx.fillRect(p.x, p.y, 2, 2);
    } else {
      ctx.fillStyle = `rgba(255,170,60,${k})`; ctx.fillRect(p.x, p.y, 2, 2);
    }
  }

  if (view.overlay) view.overlay(ctx, t, lights);

  // ── lighting: darken the cavern, cut holes for light sources ──
  const lw = Math.ceil(vw / 2), lh = Math.ceil(vh / 2);
  if (!lightCanvas || lightCanvas.width !== lw || lightCanvas.height !== lh) {
    lightCanvas = mkCanvas(lw, lh); lightCtx = lightCanvas.getContext('2d');
  }
  const L = lightCtx;
  L.globalCompositeOperation = 'source-over';
  L.clearRect(0, 0, lw, lh);
  L.fillStyle = 'rgba(8,5,12,0.5)';
  L.fillRect(0, 0, lw, lh);
  L.globalCompositeOperation = 'destination-out';
  const toL = (wx, wy) => { const [sx, sy] = worldToScreen(wx, wy, vw, vh); return [sx / 2, sy / 2]; };
  const all = lights.concat(view.cursorLight ? [[view.cursorLight[0], view.cursorLight[1], 4.5, null]] : []);
  for (const [x, y, r] of all) {
    const [sx, sy] = toL(x, y);
    const rad = (r * TILE * z) / 2;
    if (sx < -rad || sy < -rad || sx > lw + rad || sy > lh + rad) continue;
    const grd = L.createRadialGradient(sx, sy, 0, sx, sy, rad);
    grd.addColorStop(0, 'rgba(0,0,0,1)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    L.fillStyle = grd;
    L.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCanvas, 0, 0, vw, vh);

  // warm additive glow
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r, col] of lights) {
    if (!col) continue;
    const [sx, sy] = worldToScreen(x, y, vw, vh);
    const rad = r * TILE * z * 0.6;
    if (sx < -rad || sy < -rad || sx > vw + rad || sy > vh + rad) continue;
    const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
    grd.addColorStop(0, col + '30');
    grd.addColorStop(1, col + '00');
    ctx.fillStyle = grd;
    ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// world position of a local offset (from centre, front = up) on a building
function rotLocal(e, lx, ly) {
  const half = (e.size * TILE) / 2;
  const a = e.dir * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
  return [e.x * TILE + half + lx * c - ly * s, e.y * TILE + half + lx * s + ly * c];
}
