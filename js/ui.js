// ─── Deepforge: HTML interface ──────────────────────────────────────────────

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const icon = (id, cls = 'ico') => `<img class="${cls}" src="${SPR.itemUrl[id]}" alt="">`;
const costHtml = cost => Object.keys(cost).map(k => {
  const ok = (S.stock[k] || 0) >= cost[k];
  return `<span class="cost ${ok ? '' : 'short'}">${icon(k)}${cost[k]}</span>`;
}).join('');

const UI = {
  selected: null,       // selected entity id for the inspector
  inspSig: '',
  buildBtns: {},
  lastStockSig: '',
  lastQuestSig: '',
};

function initUI(handlers) {
  UI.h = handlers;

  // build bar
  const bar = $('#buildbar');
  BUILD_ORDER.forEach((type, i) => {
    const b = el('button', 'bb');
    b.id = 'build-' + type;
    b.type = 'button';
    const ic = buildingIcon(type, 56);
    ic.className = 'bb-icon';
    b.append(ic);
    b.append(el('span', 'bb-key', String(i + 1)));
    b.append(el('span', 'bb-name', BUILDINGS[type].name));
    b.append(el('span', 'bb-lock', '&#x1F512;&#xFE0E;'));
    b.addEventListener('click', () => handlers.selectTool(type));
    b.addEventListener('mouseenter', () => showBuildTip(type, b));
    b.addEventListener('mouseleave', hideTip);
    bar.append(b);
    UI.buildBtns[type] = b;
  });
  const demo = el('button', 'bb bb-demolish');
  demo.id = 'build-demolish';
  demo.type = 'button';
  demo.innerHTML = '<span class="bb-glyph">&#x2692;&#xFE0E;</span><span class="bb-key">X</span><span class="bb-name">Demolish</span>';
  demo.addEventListener('click', () => handlers.selectTool('demolish'));
  demo.addEventListener('mouseenter', () => showTip('<b>Demolish</b><p>Tear down a building. You get its full cost and contents back. Right-click does the same.</p>', demo));
  demo.addEventListener('mouseleave', hideTip);
  bar.append(demo);
  UI.buildBtns.demolish = demo;

  $('#contribute').addEventListener('click', () => {
    const n = contributeFromStock();
    toast(n ? `Brought ${n} goods from the stockpile to the Great Hall.` : 'Your stockpile holds nothing this tier needs.', n ? 'info' : 'warn');
    refreshUI(true);
  });
  $('#help-btn').addEventListener('click', () => toggleHelp());
  $('#help-close').addEventListener('click', () => toggleHelp(false));
  $('#new-btn').addEventListener('click', () => { $('#confirm-new').hidden = false; });
  $('#confirm-no').addEventListener('click', () => { $('#confirm-new').hidden = true; });
  $('#confirm-yes').addEventListener('click', () => { $('#confirm-new').hidden = true; handlers.newRealm(); });
  $('#zoom-in').addEventListener('click', () => handlers.zoomBy(1.25));
  $('#zoom-out').addEventListener('click', () => handlers.zoomBy(0.8));
  $('#rotate-btn').addEventListener('click', () => handlers.rotate());
  $('#insp-close').addEventListener('click', () => selectEnt(null));
  $('#victory-close').addEventListener('click', () => { $('#victory').hidden = true; });

  // don't rebuild the inspector while a press is in progress inside it
  $('#inspector').addEventListener('pointerdown', () => { UI.holding = true; });
  window.addEventListener('pointerup', () => { UI.holding = false; });

  // inspector buttons via delegation (structure is rebuilt only on change)
  $('#inspector').addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const e = S.ents.get(UI.selected);
    if (!e) return;
    const act = btn.dataset.act;
    if (act === 'rotate') rotateEnt(e, 1);
    else if (act === 'demolish') { demolish(e); selectEnt(null); }
    else if (act === 'recipe') setSmithyRecipe(e, btn.dataset.key);
    else if (act === 'take') {
      for (const k in e.store) addStock(k, e.store[k]);
      toast(`Moved ${e.total} goods to the stockpile.`);
      e.store = {}; e.total = 0;
    }
    UI.inspSig = '';
    refreshUI(true);
  });
}

function toggleHelp(force) {
  const h = $('#help');
  h.hidden = force === undefined ? !h.hidden : !force;
}

// ── tooltips ────────────────────────────────────────────────────────────────

function showTip(html, anchor) {
  const tip = $('#tip');
  tip.innerHTML = html;
  tip.hidden = false;
  const r = anchor.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
  tip.style.left = x + 'px';
  tip.style.top = Math.max(8, r.top - th - 10) + 'px';
}
function hideTip() { $('#tip').hidden = true; }

function showBuildTip(type, anchor) {
  const def = BUILDINGS[type];
  const locked = !isUnlocked(type);
  showTip(`<b>${def.name}</b>${def.size > 1 ? ` <span class="dim">${def.size}×${def.size}</span>` : ''}
    <p>${def.desc}</p>
    <div class="tip-cost">${costHtml(def.cost)}</div>
    ${locked ? `<p class="lockline">Unlocks with tier ${def.tier}: ${TIERS[def.tier - 1].name}</p>` : ''}`, anchor);
}

// ── toasts ──────────────────────────────────────────────────────────────────

let lastToast = '', lastToastAt = 0;
function toast(text, kind = 'info') {
  const now = performance.now();
  if (text === lastToast && now - lastToastAt < 1200) return;
  lastToast = text; lastToastAt = now;
  const box = $('#toasts');
  const t = el('div', 'toast toast-' + kind, text);
  box.prepend(t);
  while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => t.classList.add('out'), kind === 'unlock' || kind === 'victory' ? 6000 : 2600);
  setTimeout(() => t.remove(), kind === 'unlock' || kind === 'victory' ? 6600 : 3200);
}

// ── panels ──────────────────────────────────────────────────────────────────

function refreshUI(force) {
  // stockpile
  const keys = Object.keys(ITEMS).filter(k => (S.stock[k] || 0) > 0);
  const sig = keys.map(k => k + S.stock[k]).join('|');
  if (force || sig !== UI.lastStockSig) {
    UI.lastStockSig = sig;
    $('#stock').innerHTML = keys.length
      ? keys.map(k => `<div class="chip" title="${itemName(k)}">${icon(k)}<span>${S.stock[k]}</span></div>`).join('')
      : '<div class="dim">Empty. Hold the mouse on ore or rock to dig by hand.</div>';
  }

  // quest
  const T = TIERS[S.tier];
  const qsig = S.tier + '|' + JSON.stringify(S.progress) + '|' + sig;
  if (force || qsig !== UI.lastQuestSig) {
    UI.lastQuestSig = qsig;
    if (T) {
      $('#quest-tier').textContent = `Tier ${S.tier + 1} of ${TIERS.length}`;
      $('#quest-name').textContent = T.name;
      $('#quest-lore').textContent = T.lore;
      $('#quest-reqs').innerHTML = Object.keys(T.req).map(k => {
        const have = S.progress[k] || 0, need = T.req[k];
        return `<div class="req">${icon(k)}<div class="req-body"><div class="req-top"><span>${itemName(k)}</span><span class="num">${have} / ${need}</span></div>
          <div class="bar"><i style="width:${Math.min(100, (have / need) * 100)}%"></i></div></div></div>`;
      }).join('');
      $('#quest-unlocks').innerHTML = `Unlocks: <b>${T.unlocks}</b>`;
      const canGive = Object.keys(T.req).some(k => (S.stock[k] || 0) > 0 && (S.progress[k] || 0) < T.req[k]);
      $('#contribute').disabled = !canGive;
      $('#contribute').hidden = false;
    } else {
      $('#quest-tier').textContent = 'All tiers complete';
      $('#quest-name').textContent = 'The Hold Endures';
      $('#quest-lore').textContent = 'Your clan\'s name is carved into the mountain. Keep building as you please.';
      $('#quest-reqs').innerHTML = '';
      $('#quest-unlocks').innerHTML = '';
      $('#contribute').hidden = true;
    }
  }

  // build bar state
  for (const type of BUILD_ORDER) {
    const b = UI.buildBtns[type];
    const locked = !isUnlocked(type);
    b.classList.toggle('locked', locked);
    b.classList.toggle('poor', !locked && !canAfford(BUILDINGS[type].cost));
    b.classList.toggle('active', UI.h.currentTool() === type);
  }
  UI.buildBtns.demolish.classList.toggle('active', UI.h.currentTool() === 'demolish');

  refreshInspector();
}

function selectEnt(id) {
  UI.selected = id;
  UI.inspSig = '';
  refreshInspector();
}

function bar(frac, cls = '') {
  return `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(1, frac)) * 100}%"></i></div>`;
}

function slot(item, n, cap, label) {
  return `<div class="slot"><div class="slot-ico">${item ? icon(item, 'ico-lg') : '<span class="empty"></span>'}</div>
    <div class="slot-txt"><span class="dim">${label}</span><span class="num">${item ? itemName(item) + ' ' : ''}${n}${cap ? ' / ' + cap : ''}</span></div></div>`;
}

function refreshInspector() {
  const box = $('#inspector');
  const e = UI.selected && S.ents.get(UI.selected);
  if (!e) { box.hidden = true; return; }
  box.hidden = false;
  const def = BUILDINGS[e.type];
  let body = '';
  switch (e.type) {
    case 'drill': case 'deepdrill': {
      const counts = {};
      for (const o of e.ores) counts[ORE_ITEMS[o]] = (counts[ORE_ITEMS[o]] || 0) + 1;
      body += `<p class="status">${e.status || ''}</p>`;
      body += `<div class="kv"><span class="dim">Deposits beneath</span><span>${Object.keys(counts).map(k => icon(k) + '×' + counts[k]).join(' ') || 'none'}</span></div>`;
      body += `<div class="kv"><span class="dim">Rate</span><span class="num">${(60 / def.rate).toFixed(0)} ore / min</span></div>`;
      body += bar(e.timer / def.rate);
      break;
    }
    case 'forge': {
      const r = e.crafting && FORGE_RECIPES[e.crafting];
      body += `<p class="status">${e.status || ''}</p>`;
      body += slot(e.inItem, e.inN, FORGE_CAP, 'Ore');
      body += slot('coal', e.fuel, FORGE_CAP, `Coal (each smelts ${COAL_SMELTS})`);
      body += slot(e.outItem, e.outN, FORGE_CAP, 'Output');
      body += `<div class="kv"><span class="dim">Smelting</span><span>${r ? icon(r.out) + itemName(r.out) : '—'}</span></div>`;
      body += bar(r ? e.prog / r.time : 0, 'ember');
      body += `<details class="recipes"><summary>Forge recipes</summary>${Object.keys(FORGE_RECIPES).map(k => {
        const fr = FORGE_RECIPES[k];
        return `<div class="rcp">${fr.need}${icon(k)} + coal → ${fr.n}${icon(fr.out)} <span class="dim">${fr.time}s</span></div>`;
      }).join('')}</details>`;
      break;
    }
    case 'smithy': {
      body += `<p class="status">${e.status || ''}</p><div class="recipe-pick">`;
      for (const k in SMITHY_RECIPES) {
        const r = SMITHY_RECIPES[k];
        const locked = r.tier > S.tier;
        body += `<button type="button" class="rp ${e.recipe === k ? 'on' : ''}" data-act="recipe" data-key="${k}" ${locked ? 'disabled' : ''}
          title="${locked ? 'Unlocks at tier ' + r.tier : itemName(r.out)}">${icon(r.out, 'ico-lg')}${locked ? '<span class="rp-lock">&#x1F512;&#xFE0E;</span>' : ''}</button>`;
      }
      body += '</div>';
      if (e.recipe) {
        const r = SMITHY_RECIPES[e.recipe];
        body += `<div class="rcp big">${Object.keys(r.in).map(k => r.in[k] + icon(k)).join(' + ')} → ${r.n}${icon(r.out)} <span class="dim">${r.time}s</span></div>`;
        for (const k in r.in) body += slot(k, e.buf[k] || 0, Math.max(r.in[k] * 3, 6), 'Input');
        body += slot(e.outItem, e.outN, FORGE_CAP, 'Output');
        body += bar(e.crafting ? e.prog / r.time : 0, 'rune');
      }
      break;
    }
    case 'vault': {
      const ks = Object.keys(e.store).filter(k => e.store[k] > 0);
      body += `<div class="kv"><span class="dim">Stored</span><span class="num">${e.total} / ${VAULT_CAP}</span></div>`;
      body += bar(e.total / VAULT_CAP);
      body += `<div class="chips">${ks.map(k => `<div class="chip">${icon(k)}<span>${e.store[k]}</span></div>`).join('') || '<span class="dim">Empty</span>'}</div>`;
      body += `<button type="button" class="btn" data-act="take" ${e.total ? '' : 'disabled'}>Move all to stockpile</button>`;
      break;
    }
    case 'splitter':
      body += `<p class="status">Holding: ${e.held ? icon(e.held) + itemName(e.held) : 'nothing'}</p>`;
      break;
    case 'tunnel':
      body += `<p class="status">${e.mode === 'in' ? 'Entrance' : 'Exit'} · ${e.partner ? 'linked' : 'not linked: place a matching tunnel within ' + TUNNEL_RANGE + ' tiles, facing the same way'}</p>`;
      if (e.mode === 'in') body += `<div class="kv"><span class="dim">Goods underground</span><span class="num">${e.queue.length}</span></div>`;
      break;
    case 'belt':
      body += `<div class="kv"><span class="dim">Heading</span><span>${DIR_NAMES[e.dir]}</span></div>`;
      body += `<div class="kv"><span class="dim">Carrying</span><span>${e.items.map(it => icon(it.t)).join('') || 'nothing'}</span></div>`;
      break;
    case 'hall': {
      body += '<p class="status">Delivered goods so far:</p>';
      const ks = Object.keys(S.produced);
      body += `<div class="chips">${ks.map(k => `<div class="chip">${icon(k)}<span>${S.produced[k]}</span></div>`).join('') || '<span class="dim">Nothing yet. Run a conveyor into any side of the hall.</span>'}</div>`;
      break;
    }
  }
  const actions = e.type === 'hall' ? '' : `<div class="insp-actions">
    <button type="button" class="btn" data-act="rotate">Rotate <kbd>R</kbd></button>
    <button type="button" class="btn danger" data-act="demolish">Demolish</button></div>`;

  // Only rebuild the DOM when the content changed, so clicks land reliably.
  const sig = e.id + body + actions;
  if (sig === UI.inspSig || (UI.holding && UI.inspSig)) return;
  UI.inspSig = sig;
  $('#insp-title').textContent = def.name;
  $('#insp-desc').textContent = def.desc;
  $('#insp-body').innerHTML = body + actions;
}
