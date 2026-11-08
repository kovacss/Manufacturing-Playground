// ─── Deepforge: cavern generation ───────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeValueNoise(rng) {
  const N = 256;
  const perm = new Uint16Array(N * 2);
  const vals = new Float32Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; vals[i] = rng(); }
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < N; i++) perm[N + i] = perm[i];
  const at = (x, y) => vals[perm[(perm[x & 255] + y) & 511] & 255];
  const smooth = t => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y, oct = 4) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  };
}

// Returns { seed, terrain, ore, deco, hallX, hallY }
function generateWorld(seed) {
  const rng = mulberry32(seed);
  const fbm = makeValueNoise(rng);
  const fbm2 = makeValueNoise(rng);
  const terrain = new Uint8Array(MAP_W * MAP_H);
  const ore = new Uint8Array(MAP_W * MAP_H);
  const deco = new Uint8Array(MAP_W * MAP_H);
  const cx = Math.floor(MAP_W / 2), cy = Math.floor(MAP_H / 2);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      const d = Math.hypot(x - cx, (y - cy) * 1.2);
      const n = fbm(x / 13, y / 13, 4);
      // walls get more common the further from the hall, but caverns stay connected-ish
      const thresh = 0.6 - Math.min(0.08, d / 900);
      let t = n > thresh ? T_WALL : T_FLOOR;
      if (d < 10) t = T_FLOOR;
      if (t === T_FLOOR && d > 16 && fbm2(x / 9, y / 9, 3) > 0.7) t = T_LAVA;
      if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) t = T_BEDROCK;
      terrain[i] = t;
      deco[i] = Math.floor(rng() * 256);
    }
  }

  const inBounds = (x, y) => x >= 3 && y >= 3 && x < MAP_W - 3 && y < MAP_H - 3;
  const clearOfHall = (x, y) => Math.abs(x - cx) > 3 || Math.abs(y - cy) > 3;

  function stampPatch(px, py, oreCode, radius) {
    const R = Math.ceil(radius) + 1;
    for (let y = py - R; y <= py + R; y++) {
      for (let x = px - R; x <= px + R; x++) {
        if (!inBounds(x, y) || !clearOfHall(x, y)) continue;
        const d = Math.hypot(x - px, y - py) + (fbm2(x / 3 + oreCode * 17, y / 3) - 0.5) * 2.4;
        if (d > radius) continue;
        const i = y * MAP_W + x;
        terrain[i] = T_FLOOR; // ore seams are exposed
        ore[i] = oreCode;
      }
    }
  }

  function findSpot(minD, maxD) {
    for (let tries = 0; tries < 400; tries++) {
      const a = rng() * Math.PI * 2;
      const r = minD + rng() * (maxD - minD);
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r * 0.8);
      if (!inBounds(x, y)) continue;
      if (terrain[y * MAP_W + x] === T_LAVA) continue;
      let clash = false;
      for (let yy = y - 4; yy <= y + 4 && !clash; yy++)
        for (let xx = x - 4; xx <= x + 4; xx++)
          if (inBounds(xx, yy) && ore[yy * MAP_W + xx]) { clash = true; break; }
      if (!clash) return [x, y];
    }
    return null;
  }

  // Guaranteed starter seams near the hall, then scattered seams further out.
  const plan = [
    // [oreCode, count, minD, maxD, rMin, rMax]
    [1, 1, 7, 11, 2.5, 3.2],
    [2, 1, 8, 13, 2.5, 3.2],
    [3, 1, 8, 13, 2.8, 3.5],
    [4, 1, 11, 17, 2.5, 3.2],
    [1, 6, 14, 60, 2.5, 4.5],
    [2, 7, 14, 60, 2.5, 4.5],
    [3, 7, 14, 60, 2.5, 4.5],
    [4, 6, 18, 60, 2.5, 4.0],
    [5, 2, 24, 34, 2.2, 3.0],
    [5, 4, 34, 62, 2.5, 4.0],
  ];
  for (const [code, count, minD, maxD, rMin, rMax] of plan) {
    for (let k = 0; k < count; k++) {
      const spot = findSpot(minD, maxD);
      if (spot) stampPatch(spot[0], spot[1], code, rMin + rng() * (rMax - rMin));
    }
  }

  return { seed, terrain, ore, deco, hallX: cx - 1, hallY: cy - 1 };
}
