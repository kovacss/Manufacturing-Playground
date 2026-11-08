// ─── Deepforge: input, main loop, saving ────────────────────────────────────

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let vw = 0, vh = 0, dpr = 1;

  const input = {
    tool: null, dir: 1,
    mouse: [-1000, -1000], inside: false,
    keys: new Set(),
    drag: null,
    pointers: new Map(),
  };
  const floaters = [];

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = canvas.clientWidth; vh = canvas.clientHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  }

  const tileAtScreen = (sx, sy) => {
    const [wx, wy] = screenToWorld(sx, sy, vw, vh);
    return [Math.floor(wx / TILE), Math.floor(wy / TILE)];
  };
  // anchor so the cursor sits on the building's middle
  const anchorFor = (type, tx, ty) => {
    const off = Math.floor((BUILDINGS[type].size - 1) / 2);
    return [tx - off, ty - off];
  };

  function setTool(t) {
    if (t && t !== 'demolish' && !isUnlocked(t)) {
      const def = BUILDINGS[t];
      toast(`${def.name} unlocks with tier ${def.tier}: ${TIERS[def.tier - 1].name}.`, 'warn');
      return;
    }
    input.tool = input.tool === t ? null : t;
    if (input.tool) selectEnt(null);
    refreshUI(true);
  }

  function zoomBy(f, sx = vw / 2, sy = vh / 2) {
    const [wx, wy] = screenToWorld(sx, sy, vw, vh);
    cam.zoom = clamp(cam.zoom * f, 0.45, 3);
    const [nx, ny] = screenToWorld(sx, sy, vw, vh);
    cam.x += wx - nx; cam.y += wy - ny;
  }

  function rotate(by = 1) {
    if (input.tool && input.tool !== 'demolish') { input.dir = (input.dir + 4 + by) % 4; return; }
    const [tx, ty] = tileAtScreen(...input.mouse);
    const e = (UI.selected && S.ents.get(UI.selected)) || entAt(tx, ty);
    if (e) { rotateEnt(e, by); UI.inspSig = ''; }
  }

  function placeAt(tx, ty, loud) {
    const type = input.tool;
    const [ax, ay] = anchorFor(type, tx, ty);
    const res = tryPlace(type, ax, ay, input.dir);
    if (!res.ok && loud) toast(res.why, 'warn');
    return res;
  }

  function demolishAt(tx, ty) {
    const e = entAt(tx, ty);
    if (e && e.type !== 'hall') {
      if (UI.selected === e.id) selectEnt(null);
      demolish(e);
    }
  }

  // ── pointer handling ──
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('pointerdown', ev => {
    canvas.setPointerCapture(ev.pointerId);
    input.pointers.set(ev.pointerId, [ev.offsetX, ev.offsetY]);
    input.mouse = [ev.offsetX, ev.offsetY];
    hideTip();
    if (input.pointers.size === 2) {
      const [a, b] = [...input.pointers.values()];
      input.drag = { mode: 'pinch', dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      return;
    }
    const [tx, ty] = tileAtScreen(ev.offsetX, ev.offsetY);
    const start = { sx: ev.offsetX, sy: ev.offsetY, lx: ev.offsetX, ly: ev.offsetY };

    if (ev.button === 1) { input.drag = { mode: 'pan', ...start }; return; }
    if (ev.button === 2) {
      if (input.tool) { input.tool = null; refreshUI(true); return; }
      input.drag = { mode: 'demolish', ...start };
      demolishAt(tx, ty);
      return;
    }
    if (input.tool === 'demolish') {
      input.drag = { mode: 'demolish', ...start };
      demolishAt(tx, ty);
    } else if (input.tool) {
      const res = placeAt(tx, ty, true);
      input.drag = { mode: 'place', last: [tx, ty], prev: res.ok && input.tool === 'belt' ? res.ent : null, ...start };
    } else {
      const e = entAt(tx, ty);
      if (e) { selectEnt(e.id); input.drag = { mode: 'pan', ...start }; }
      else if (handMineInfo(tx, ty)) { selectEnt(null); input.drag = { mode: 'mine', tx, ty, t: 0, ...start }; }
      else { selectEnt(null); input.drag = { mode: 'pan', ...start }; }
    }
  });

  canvas.addEventListener('pointermove', ev => {
    input.mouse = [ev.offsetX, ev.offsetY];
    input.inside = true;
    if (input.pointers.has(ev.pointerId)) input.pointers.set(ev.pointerId, [ev.offsetX, ev.offsetY]);
    const d = input.drag;
    if (!d) return;
    if (d.mode === 'pinch') {
      if (input.pointers.size < 2) return;
      const [a, b] = [...input.pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      zoomBy(dist / d.dist, mid[0], mid[1]);
      cam.x -= (mid[0] - d.mid[0]) / cam.zoom; cam.y -= (mid[1] - d.mid[1]) / cam.zoom;
      d.dist = dist; d.mid = mid;
      return;
    }
    const [tx, ty] = tileAtScreen(ev.offsetX, ev.offsetY);
    if (d.mode === 'pan') {
      cam.x -= (ev.offsetX - d.lx) / cam.zoom; cam.y -= (ev.offsetY - d.ly) / cam.zoom;
      d.lx = ev.offsetX; d.ly = ev.offsetY;
    } else if (d.mode === 'demolish') {
      demolishAt(tx, ty);
    } else if (d.mode === 'mine') {
      if (tx !== d.tx || ty !== d.ty) {
        if (handMineInfo(tx, ty)) { d.tx = tx; d.ty = ty; d.t = 0; }
      }
    } else if (d.mode === 'place') {
      if (tx === d.last[0] && ty === d.last[1]) return;
      if (input.tool === 'belt') {
        // walk one tile at a time so lines have no gaps, bending at corners
        let [cx, cy] = d.last;
        let guard = 0;
        while ((cx !== tx || cy !== ty) && guard++ < 200) {
          const dx = tx - cx, dy = ty - cy;
          const step = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
          const sd = dirIndex(step[0], step[1]);
          if (d.prev && d.prev.type === 'belt' && S.ents.has(d.prev.id)) { d.prev.dir = sd; d.prev.ports = frontPorts(d.prev); }
          input.dir = sd;
          cx += step[0]; cy += step[1];
          const res = placeAt(cx, cy, false);
          d.prev = res.ok ? res.ent : null;
        }
      } else {
        placeAt(tx, ty, false);
      }
      d.last = [tx, ty];
    }
  });

  const endPointer = ev => {
    input.pointers.delete(ev.pointerId);
    if (input.drag && input.drag.mode === 'pinch') { if (input.pointers.size === 0) input.drag = null; return; }
    input.drag = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { input.inside = false; });

  canvas.addEventListener('wheel', ev => {
    ev.preventDefault();
    zoomBy(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.offsetX, ev.offsetY);
  }, { passive: false });

  // ── keyboard ──
  window.addEventListener('keydown', ev => {
    if (ev.target.closest && ev.target.closest('input,textarea,select')) return;
    const k = ev.key.toLowerCase();
    input.keys.add(k);
    if (k >= '1' && k <= '9') { const t = BUILD_ORDER[+k - 1]; if (t) setTool(t); }
    else if (k === 'r') rotate(ev.shiftKey ? -1 : 1);
    else if (k === 'x') setTool('demolish');
    else if (k === 'escape') { input.tool = null; selectEnt(null); toggleHelp(false); refreshUI(true); }
    else if (k === 'q') {
      if (input.tool) { input.tool = null; }
      else {
        const e = entAt(...tileAtScreen(...input.mouse));
        if (e && e.type !== 'hall') { input.tool = e.type; input.dir = e.dir; selectEnt(null); }
      }
      refreshUI(true);
    }
    else if (k === 'delete' || k === 'backspace') demolishAt(...tileAtScreen(...input.mouse));
    else if (k === 'h' || k === 'f1') { ev.preventDefault(); toggleHelp(); }
    else if (k === '+' || k === '=') zoomBy(1.2);
    else if (k === '-') zoomBy(1 / 1.2);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) ev.preventDefault();
  });
  window.addEventListener('keyup', ev => input.keys.delete(ev.key.toLowerCase()));
  window.addEventListener('blur', () => input.keys.clear());

  // ── overlay: ghost, selection, mining progress ──
  function overlay(g, t) {
    const [tx, ty] = tileAtScreen(...input.mouse);
    const tool = input.tool;

    // tunnel links
    for (const e of S.ents.values()) {
      if (e.type === 'tunnel' && e.mode === 'in' && e.partner) {
        const p = S.ents.get(e.partner);
        if (!p) continue;
        g.strokeStyle = 'rgba(111,224,255,0.25)'; g.setLineDash([4, 6]); g.lineWidth = 2;
        g.beginPath(); g.moveTo(e.x * TILE + 16, e.y * TILE + 16); g.lineTo(p.x * TILE + 16, p.y * TILE + 16); g.stroke();
        g.setLineDash([]);
      }
    }

    if (input.inside && tool && tool !== 'demolish') {
      const def = BUILDINGS[tool];
      const [ax, ay] = anchorFor(tool, tx, ty);
      const ghost = Object.assign(makeIconEnt(tool), { x: ax, y: ay, dir: input.dir, partner: 1 });
      const ex = entAt(ax, ay);
      const ok = !placementProblem(tool, ax, ay) || (tool === 'belt' && ex && ex.type === 'belt');
      g.save(); g.globalAlpha = 0.6;
      drawBuilding(g, ghost, t);
      g.restore();
      let bare = false;
      if (ok && (tool === 'drill' || tool === 'deepdrill')) {
        bare = true;
        for (let dy = 0; dy < def.size; dy++) for (let dx = 0; dx < def.size; dx++) if (inMap(ax + dx, ay + dy) && S.world.ore[tIdx(ax + dx, ay + dy)]) bare = false;
      }
      g.fillStyle = !ok ? 'rgba(255,70,50,0.3)' : bare ? 'rgba(255,190,60,0.25)' : 'rgba(120,230,140,0.18)';
      g.fillRect(ax * TILE, ay * TILE, def.size * TILE, def.size * TILE);
      // output arrows
      g.fillStyle = ok ? '#e8d9a8' : '#ff8a7a';
      for (const [, , ox, oy] of frontPorts(ghost)) {
        g.save(); g.translate(ox * TILE + 16, oy * TILE + 16); g.rotate(input.dir * Math.PI / 2);
        g.globalAlpha = 0.45 + Math.sin(t * 6) * 0.2;
        g.beginPath(); g.moveTo(-6, 4); g.lineTo(0, -5); g.lineTo(6, 4); g.closePath(); g.fill();
        g.restore();
      }
      if (tool === 'tunnel') {
        const [dx, dy] = DIRS[input.dir];
        g.strokeStyle = 'rgba(111,224,255,0.35)'; g.lineWidth = 1.5; g.setLineDash([3, 4]);
        g.strokeRect((ax + Math.min(0, dx * TUNNEL_RANGE)) * TILE + 2, (ay + Math.min(0, dy * TUNNEL_RANGE)) * TILE + 2,
          (Math.abs(dx) * TUNNEL_RANGE + 1) * TILE - 4, (Math.abs(dy) * TUNNEL_RANGE + 1) * TILE - 4);
        g.setLineDash([]);
      }
    } else if (input.inside && tool === 'demolish') {
      const e = entAt(tx, ty);
      g.strokeStyle = '#ff5a4a'; g.lineWidth = 2;
      if (e && e.type !== 'hall') { g.fillStyle = 'rgba(255,70,50,0.25)'; g.fillRect(e.x * TILE, e.y * TILE, e.size * TILE, e.size * TILE); g.strokeRect(e.x * TILE + 1, e.y * TILE + 1, e.size * TILE - 2, e.size * TILE - 2); }
      else g.strokeRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
    } else if (input.inside && inMap(tx, ty)) {
      const e = entAt(tx, ty);
      g.strokeStyle = handMineInfo(tx, ty) ? 'rgba(255,215,90,0.7)' : 'rgba(233,220,192,0.25)';
      g.lineWidth = 1.5;
      if (e) g.strokeRect(e.x * TILE + 1, e.y * TILE + 1, e.size * TILE - 2, e.size * TILE - 2);
      else g.strokeRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
    }

    // selection
    const sel = UI.selected && S.ents.get(UI.selected);
    if (sel) {
      g.strokeStyle = '#e3b232'; g.lineWidth = 2; g.setLineDash([6, 4]); g.lineDashOffset = -t * 20;
      g.strokeRect(sel.x * TILE - 2, sel.y * TILE - 2, sel.size * TILE + 4, sel.size * TILE + 4);
      g.setLineDash([]);
      if (sel.ports && sel.type !== 'hall' && sel.type !== 'vault') {
        g.fillStyle = '#e3b232';
        for (const [, , ox, oy] of sel.ports) {
          g.save(); g.translate(ox * TILE + 16, oy * TILE + 16); g.rotate(sel.dir * Math.PI / 2);
          g.beginPath(); g.moveTo(-5, 3); g.lineTo(0, -5); g.lineTo(5, 3); g.closePath(); g.fill();
          g.restore();
        }
      }
    }

    // hand mining
    const d = input.drag;
    if (d && d.mode === 'mine') {
      const info = handMineInfo(d.tx, d.ty);
      if (info) {
        const cx = d.tx * TILE + 16, cy = d.ty * TILE + 16;
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 5;
        g.beginPath(); g.arc(cx, cy, 11, 0, 7); g.stroke();
        g.strokeStyle = '#ffd75a'; g.lineWidth = 3;
        g.beginPath(); g.arc(cx, cy, 11, -Math.PI / 2, -Math.PI / 2 + (d.t / info.time) * Math.PI * 2); g.stroke();
        // a little pick
        g.save(); g.translate(cx + 10, cy - 10); g.rotate(-0.6 + Math.sin(t * 18) * 0.5);
        g.fillStyle = '#7a5a3a'; g.fillRect(-1, -2, 2, 12);
        g.fillStyle = '#c8d1da'; g.beginPath(); g.moveTo(-7, -1); g.quadraticCurveTo(0, -6, 7, -1); g.lineTo(0, -3); g.closePath(); g.fill();
        g.restore();
      }
    }

    // floating pickup text
    g.font = 'bold 10px "Alegreya Sans", sans-serif';
    g.textAlign = 'center';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      const k = f.life / 1.1;
      if (k >= 1) { floaters.splice(i, 1); continue; }
      g.globalAlpha = 1 - k;
      g.fillStyle = '#120d0a'; g.fillText(f.text, f.x + 1, f.y - k * 18 + 1);
      g.fillStyle = '#ffe6a0'; g.fillText(f.text, f.x, f.y - k * 18);
      g.globalAlpha = 1;
    }
  }

  // ── saving ──
  function save() {
    try { localStorage.setItem(SAVE_KEY, serialize()); } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { deserialize(raw); return true; }
    } catch (e) { console.warn('Could not load save', e); }
    return false;
  }
  function centreOnHall() {
    cam.x = (S.world.hallX + 1.5) * TILE; cam.y = (S.world.hallY + 1.5) * TILE;
  }
  function newRealm() {
    newGame((Math.random() * 1e9) | 0);
    input.tool = null; selectEnt(null);
    centreOnHall();
    save();
    refreshUI(true);
    toast('A new hold is founded beneath the mountain.', 'unlock');
  }

  // ── boot ──
  buildSprites();
  resize();
  window.addEventListener('resize', resize);

  const hot = window.claude && window.claude.hot;
  let loaded = false;
  if (hot && hot.data && hot.data.save) { try { deserialize(hot.data.save); loaded = true; } catch (e) { /* fall through */ } }
  if (!loaded) loaded = load();
  if (!loaded) { newGame((Math.random() * 1e9) | 0); $('#help').hidden = false; }
  if (hot && hot.snapshot) hot.snapshot(() => ({ save: serialize() }));
  centreOnHall();

  initUI({ selectTool: setTool, currentTool: () => input.tool, newRealm, zoomBy, rotate: () => rotate(1) });
  refreshUI(true);

  setInterval(save, 15000);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // ── main loop ──
  const STEP = 1 / 60;
  let acc = 0, last = performance.now(), uiTimer = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    // keyboard panning
    const pan = 620 / cam.zoom * dt;
    if (input.keys.has('w') || input.keys.has('arrowup')) cam.y -= pan;
    if (input.keys.has('s') || input.keys.has('arrowdown')) cam.y += pan;
    if (input.keys.has('a') || input.keys.has('arrowleft')) cam.x -= pan;
    if (input.keys.has('d') || input.keys.has('arrowright')) cam.x += pan;
    cam.x = clamp(cam.x, 0, MAP_W * TILE); cam.y = clamp(cam.y, 0, MAP_H * TILE);

    // hand mining
    const d = input.drag;
    if (d && d.mode === 'mine') {
      const info = handMineInfo(d.tx, d.ty);
      if (!info) input.drag = null;
      else {
        d.t += dt;
        if (d.t >= info.time) {
          d.t = 0;
          const got = handMineFinish(d.tx, d.ty);
          if (got) floaters.push({ x: d.tx * TILE + 16, y: d.ty * TILE + 6, text: `+${got.n} ${itemName(got.item)}`, life: 0 });
          if (!handMineInfo(d.tx, d.ty)) input.drag = null;
        }
      }
    }
    for (const f of floaters) f.life += dt;

    acc += dt;
    let n = 0;
    while (acc >= STEP && n++ < 8) { stepSim(STEP); acc -= STEP; }
    if (n >= 8) acc = 0;

    while (simEvents.length) {
      const ev = simEvents.shift();
      toast(ev.text, ev.kind);
      if (ev.kind === 'victory') $('#victory').hidden = false;
      refreshUI(true);
    }

    const cursorLight = input.inside ? screenToWorld(...input.mouse, vw, vh) : null;
    renderFrame(ctx, vw, vh, dpr, now / 1000, dt, { overlay, cursorLight });

    uiTimer += dt;
    if (uiTimer > 0.15) { uiTimer = 0; refreshUI(false); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // expose for debugging / tests
  window.DF = { get S() { return S; }, cam, input, save, newRealm, stepSim };
})();
