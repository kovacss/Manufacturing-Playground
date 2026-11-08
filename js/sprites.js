// ─── Deepforge: procedural sprites ──────────────────────────────────────────
// Everything is painted at start-up onto small canvases, so the game ships
// with no image files.

const SPR = { floor: [], wallTop: [], wallFace: [], bedrock: null, lava: [], ore: {}, items: {}, itemUrl: {}, deco: {} };

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// 16×16 "pixel" grid painted at 2× for a chunky look
function pixelTile(paint, seed) {
  const c = mkCanvas(TILE, TILE);
  const g = c.getContext('2d');
  const rng = mulberry32(seed);
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x * 2, y * 2, 2, 2); };
  paint(g, px, rng);
  return c;
}

function buildTerrainSprites() {
  for (let v = 0; v < 4; v++) {
    SPR.floor.push(pixelTile((g, px, rng) => {
      g.fillStyle = '#2b231e'; g.fillRect(0, 0, TILE, TILE);
      for (let i = 0; i < 70; i++) {
        const r = rng();
        px((rng() * 16) | 0, (rng() * 16) | 0, r < 0.5 ? '#332a24' : r < 0.85 ? '#251e1a' : '#3d332c');
      }
      // faint flagstone seams
      if (v % 2 === 0) for (let x = 0; x < 16; x++) px(x, 15, '#221b17');
      if (v < 2) for (let y = 0; y < 16; y++) px(15, y, '#221b17');
    }, 100 + v));

    SPR.wallTop.push(pixelTile((g, px, rng) => {
      g.fillStyle = '#1d1713'; g.fillRect(0, 0, TILE, TILE);
      for (let i = 0; i < 60; i++) px((rng() * 16) | 0, (rng() * 16) | 0, rng() < 0.6 ? '#272019' : '#15100d');
      for (let i = 0; i < 4; i++) { const x = (rng() * 14) | 0, y = (rng() * 14) | 0; px(x, y, '#30271f'); px(x + 1, y, '#30271f'); }
    }, 200 + v));

    SPR.wallFace.push(pixelTile((g, px, rng) => {
      g.fillStyle = '#4a3d33'; g.fillRect(0, 0, TILE, TILE);
      // strata bands
      const bands = ['#54463a', '#45382f', '#3c3029', '#4f4136'];
      for (let y = 0; y < 16; y++) {
        const col = bands[(y + v * 2 + ((rng() * 2) | 0)) % 4];
        for (let x = 0; x < 16; x++) if (rng() < 0.85) px(x, y, col);
      }
      for (let i = 0; i < 8; i++) px((rng() * 16) | 0, (rng() * 14) | 0, '#2d241e');
      for (let x = 0; x < 16; x++) { px(x, 0, '#6a5a4b'); px(x, 15, '#241c17'); }
    }, 300 + v));
  }

  SPR.bedrock = pixelTile((g, px, rng) => {
    g.fillStyle = '#0c0a09'; g.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 30; i++) px((rng() * 16) | 0, (rng() * 16) | 0, '#141110');
  }, 400);

  for (let f = 0; f < 4; f++) {
    SPR.lava.push(pixelTile((g, px, rng) => {
      g.fillStyle = '#b8320f'; g.fillRect(0, 0, TILE, TILE);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const w = Math.sin((x + f * 1.5) * 0.7 + Math.cos((y - f) * 0.6) * 1.6);
          if (w > 0.55) px(x, y, '#ffb43a');
          else if (w > 0.1) px(x, y, '#f0661c');
          else if (w < -0.75) px(x, y, '#6e1608');
        }
    }, 500 + f));
  }

  // ore deposits: clusters of chunks over the floor
  for (let code = 1; code < ORE_ITEMS.length; code++) {
    const it = ITEMS[ORE_ITEMS[code]];
    SPR.ore[code] = [];
    for (let v = 0; v < 3; v++) {
      SPR.ore[code].push(pixelTile((g, px, rng) => {
        const n = 4 + ((rng() * 3) | 0);
        for (let k = 0; k < n; k++) {
          const cx = 2 + ((rng() * 11) | 0), cy = 2 + ((rng() * 11) | 0);
          const r = 1 + ((rng() * 2) | 0);
          for (let y = -r; y <= r; y++)
            for (let x = -r; x <= r; x++) {
              if (x * x + y * y > r * r + 1) continue;
              const col = y < 0 && x <= 0 ? it.hi : y > 0 ? shade(it.color, -0.35) : it.color;
              px(cx + x, cy + y, col);
            }
          if (code !== 1 && code !== 2) px(cx - 1, cy - 1, '#ffffffaa');
        }
      }, 600 + code * 10 + v));
    }
  }

  SPR.deco.mushroom = pixelTile((g, px) => {
    const cap = '#3fd6c4', stem = '#cfc6b0';
    [[6, 10], [10, 12]].forEach(([x, y], i) => {
      px(x, y + 1, stem); px(x, y + 2, stem);
      px(x - 1, y, cap); px(x, y, cap); px(x + 1, y, cap); px(x, y - 1, i ? '#9ff5ea' : cap);
    });
  }, 700);
  SPR.deco.pebbles = pixelTile((g, px) => {
    px(4, 11, '#4a3f37'); px(5, 11, '#5a4e44'); px(11, 6, '#4a3f37'); px(12, 13, '#3e352e'); px(13, 13, '#4a3f37');
  }, 701);
  SPR.deco.bones = pixelTile((g, px) => {
    for (let i = 0; i < 5; i++) px(5 + i, 9 + (i % 2), '#b9ad94');
    px(4, 8, '#d8ccb2'); px(4, 10, '#d8ccb2'); px(10, 9, '#d8ccb2'); px(10, 11, '#d8ccb2');
  }, 702);
}

// ── Item icons (vector, drawn into 32px canvases) ───────────────────────────

function drawItemShape(g, id, s) {
  const it = ITEMS[id];
  const c = it.color, hi = it.hi || shade(c, 0.4), lo = shade(c, -0.45);
  g.save();
  g.scale(s / 32, s / 32);
  g.lineJoin = 'round';
  g.lineWidth = 2;
  g.strokeStyle = '#120d0a';
  switch (it.kind) {
    case 'chunk': {
      g.beginPath();
      g.moveTo(7, 18); g.lineTo(11, 9); g.lineTo(20, 7); g.lineTo(26, 13); g.lineTo(25, 23); g.lineTo(16, 26); g.lineTo(9, 24);
      g.closePath(); g.fillStyle = c; g.fill(); g.stroke();
      g.fillStyle = lo; g.beginPath(); g.moveTo(16, 26); g.lineTo(25, 23); g.lineTo(26, 13); g.lineTo(18, 17); g.closePath(); g.fill();
      g.fillStyle = hi;
      g.fillRect(11, 12, 3, 3); g.fillRect(17, 10, 2, 2); g.fillRect(14, 18, 3, 2); g.fillRect(20, 15, 2, 3);
      break;
    }
    case 'ingot': {
      g.beginPath(); g.moveTo(5, 21); g.lineTo(10, 11); g.lineTo(27, 11); g.lineTo(27, 18); g.lineTo(22, 25); g.lineTo(5, 25); g.closePath();
      g.fillStyle = lo; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(5, 21); g.lineTo(10, 11); g.lineTo(27, 11); g.lineTo(22, 21); g.closePath();
      g.fillStyle = c; g.fill(); g.stroke();
      g.fillStyle = hi; g.fillRect(11, 13, 12, 2);
      break;
    }
    case 'brick': {
      g.fillStyle = c; g.fillRect(5, 9, 22, 15); g.strokeRect(5, 9, 22, 15);
      g.strokeStyle = lo; g.beginPath();
      g.moveTo(5, 16.5); g.lineTo(27, 16.5); g.moveTo(16, 9); g.lineTo(16, 16.5); g.moveTo(11, 16.5); g.lineTo(11, 24); g.moveTo(21, 16.5); g.lineTo(21, 24);
      g.stroke();
      g.fillStyle = hi; g.fillRect(7, 11, 7, 2);
      break;
    }
    case 'gear': case 'clock': {
      g.translate(16, 16);
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, r = i % 2 ? 9 : 12;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath(); g.fillStyle = c; g.fill(); g.stroke();
      g.beginPath(); g.arc(0, 0, 4.5, 0, Math.PI * 2);
      if (it.kind === 'clock') { g.fillStyle = it.hi; g.fill(); g.stroke(); g.fillStyle = '#fff'; g.fillRect(-1.5, -2.5, 2, 2); }
      else { g.fillStyle = '#120d0a'; g.fill(); }
      g.fillStyle = hi; g.fillRect(-7, -9, 4, 2);
      break;
    }
    case 'wire': {
      g.strokeStyle = lo; g.lineWidth = 4;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(16, 11 + i * 5, 10, 4, 0, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = c; g.lineWidth = 2.2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(16, 11 + i * 5, 10, 4, 0, Math.PI, Math.PI * 2); g.stroke(); }
      g.strokeStyle = hi; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(26, 21); g.lineTo(29, 26); g.stroke();
      break;
    }
    case 'rune': {
      g.beginPath(); g.roundRect(7, 5, 18, 23, 5); g.fillStyle = c; g.fill(); g.stroke();
      g.fillStyle = shade(c, 0.25); g.fillRect(9, 7, 5, 2);
      g.strokeStyle = it.hi; g.lineWidth = 2.2; g.shadowColor = it.hi; g.shadowBlur = 6;
      g.beginPath(); g.moveTo(16, 9); g.lineTo(16, 24); g.moveTo(16, 12); g.lineTo(21, 16); g.moveTo(16, 18); g.lineTo(11, 14);
      g.stroke();
      break;
    }
    case 'relic': {
      // a crown on a cushion
      g.fillStyle = '#7a1f2a'; g.beginPath(); g.roundRect(4, 21, 24, 7, 3); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(6, 21); g.lineTo(6, 9); g.lineTo(11, 15); g.lineTo(16, 6); g.lineTo(21, 15); g.lineTo(26, 9); g.lineTo(26, 21); g.closePath();
      g.fillStyle = c; g.fill(); g.stroke();
      g.fillStyle = it.hi; g.beginPath(); g.arc(16, 16, 2.6, 0, 7); g.fill();
      g.fillStyle = '#6fe0ff'; g.beginPath(); g.arc(9.5, 18, 1.6, 0, 7); g.arc(22.5, 18, 1.6, 0, 7); g.fill();
      g.fillStyle = '#fff6c0'; g.fillRect(8, 12, 2, 4);
      break;
    }
  }
  g.restore();
}

function buildItemSprites() {
  for (const id in ITEMS) {
    const c = mkCanvas(32, 32);
    drawItemShape(c.getContext('2d'), id, 32);
    SPR.items[id] = c;
    SPR.itemUrl[id] = c.toDataURL();
  }
}

function buildSprites() {
  buildTerrainSprites();
  buildItemSprites();
}
