// Headless smoke test for cokco/index.html — stubs the DOM + canvas, boots the
// game script, then drives it through play / panels / travel / minigame and
// asserts nothing throws and state advances.
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(require('path').join(__dirname, '..', 'site', 'index.html'), 'utf8');
// `let`/`const` top-level bindings aren't visible on the vm sandbox, so append a
// live accessor that closes over them for the test to introspect.
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1] + `
;globalThis.__game = {
  get mode(){return mode}, get world(){return world}, get P(){return P},
  get G(){return G}, get MG(){return MG}, get trans(){return trans},
  get panelKind(){return panelKind}, get doorChoices(){return doorChoices},
  invAdd, invCount, invRemove, travel, startMinigame, craftRecipe, dayFactor,
};`;

// ---- fake canvas 2d context ----
const ctxProxy = new Proxy({}, {
  get(_, p) {
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (p === 'measureText') return () => ({ width: 12 });
    if (p === 'canvas') return canvas;
    return () => {};
  },
  set() { return true; },
});
const canvas = { width: 0, height: 0, getContext: () => ctxProxy, style: {} };

// ---- fake elements ----
function makeEl(id) {
  const el = {
    id,
    _class: new Set(),
    _ev: {},
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    disabled: false,
    onclick: null,
    classList: {
      add: c => el._class.add(c),
      remove: c => el._class.delete(c),
      toggle: (c, on) => { if (on === undefined) on = !el._class.has(c); on ? el._class.add(c) : el._class.delete(c); return on; },
      contains: c => el._class.has(c),
    },
    querySelector: sel => makeEl(id + ' ' + sel),
    querySelectorAll: () => el._buttons || [],
    getContext: () => ctxProxy,
    addEventListener(type, fn) { (el._ev[type] ||= []).push(fn); },
    setPointerCapture() {},
    _fire(type, ev = {}) { (el._ev[type] || []).forEach(fn => fn({ preventDefault() {}, ...ev })); },
    appendChild() {},
  };
  return el;
}
function makeButton(spec) {
  const b = makeEl('btn:' + (spec.hold || spec.tap));
  b.dataset = spec;
  return b;
}
const elCache = {};
const getEl = id => {
  if (!elCache[id]) {
    const el = makeEl(id);
    if (id === 'touch') {
      // mirror the real #touch button set so the touch-control wiring runs
      el._buttons = [
        makeButton({ hold: 'ArrowLeft' }), makeButton({ hold: 'ArrowRight' }),
        makeButton({ hold: 'ArrowUp' }), makeButton({ tap: 'KeyE' }),
        makeButton({ tap: 'KeyI' }), makeButton({ tap: 'KeyJ' }), makeButton({ tap: 'Escape' }),
      ];
    }
    elCache[id] = el;
  }
  return elCache[id];
};
const touchBtn = code => getEl('touch')._buttons.find(b => (b.dataset.hold || b.dataset.tap) === code);

const listeners = {};
function on(type, fn) { (listeners[type] ||= []).push(fn); }
function fire(type, ev) { (listeners[type] || []).forEach(fn => fn(ev)); }

const store = {};
const sandbox = {
  console,
  document: {
    getElementById: id => (id === 'c' ? canvas : getEl(id)),
    querySelector: sel => getEl(sel),
    querySelectorAll: () => [],
    addEventListener: on,
    documentElement: makeEl('html'),
    hidden: false,
  },
  window: { addEventListener: on, devicePixelRatio: 2, innerWidth: 1200, innerHeight: 700 },
  addEventListener: on,
  matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }),
  navigator: { userAgent: 'node', maxTouchPoints: 5 },
  performance: { now: () => T },
  requestAnimationFrame: fn => { rafCb = fn; },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  confirm: () => true,
};
sandbox.window.innerWidth = 1200;
sandbox.window.innerHeight = 700;
sandbox.globalThis = sandbox;

let T = 0;
let rafCb = null;

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'cokco.js' });

function step(ms = 32) { T += ms; rafCb(T); }
function press(code) { fire('keydown', { code, repeat: false, preventDefault() {} }); }
function release(code) { fire('keyup', { code }); }

let failed = false;
const g = () => sandbox.__game;
function check(label, cond) {
  console.log((cond ? 'ok   ' : 'FAIL ') + label);
  if (!cond) failed = true;
}

try {
  // boot: a few idle frames on the title screen
  for (let i = 0; i < 3; i++) step();

  // start a new game
  store.length; // noop
  getEl('newBtn').onclick();
  step();
  check('entered play mode', g().mode === 'play');
  check('world loaded = home', g().world && g().world.key === 'home');
  const x0 = g().P.x;

  // walk right for ~1s
  press('ArrowRight');
  for (let i = 0; i < 30; i++) step();
  release('ArrowRight');
  check('Cokco moved right', g().P.x > x0 + 20);
  check('Cokco is on the ground', g().P.grounded === true);

  // jump
  press('ArrowUp');
  step();
  release('ArrowUp');
  for (let i = 0; i < 6; i++) step();
  check('Cokco left the ground after a jump', g().P.airTime > 0 || g().P.vy !== 0);
  for (let i = 0; i < 40; i++) step();
  check('Cokco landed again', g().P.grounded === true);

  // --- on-screen touch controls feed the same input path ---
  check('touch mode marker follows game mode', getEl('touch').dataset.mode === 'play');
  const tx0 = g().P.x;
  touchBtn('ArrowRight')._fire('pointerdown', { pointerId: 1 });
  for (let i = 0; i < 25; i++) step();
  check('holding the on-screen ▶ moves Cokco right', g().P.x > tx0 + 20);
  touchBtn('ArrowRight')._fire('pointerup', { pointerId: 1 });
  for (let i = 0; i < 20; i++) step();
  check('releasing the ▶ button stops Cokco', Math.abs(g().P.vx) < 5);
  touchBtn('ArrowUp')._fire('pointerdown', { pointerId: 1 });
  step();
  touchBtn('ArrowUp')._fire('pointerup', { pointerId: 1 });
  for (let i = 0; i < 6; i++) step();
  check('tapping the on-screen ▲ makes Cokco jump', g().P.grounded === false);
  for (let i = 0; i < 45; i++) step();
  touchBtn('KeyI')._fire('pointerdown', { pointerId: 1 });
  step();
  check('on-screen bag button opens the bag', g().mode === 'panel');
  touchBtn('Escape')._fire('pointerdown', { pointerId: 1 });
  step();
  check('on-screen menu button closes the panel', g().mode === 'play');

  // elevator runs on its own; after ~6s it should have touched the top
  for (let i = 0; i < 140; i++) step(50);
  check('green stairs appeared after elevator reached top', g().G.flags.greenStairs === true);
  // stand on the high reward ledge and collect the shell
  const ledge = g().world.solids.find(s => s.x === 1322 && s.kind === 'ledge');
  const shellBefore = g().invCount('shell');
  g().P.x = 1420; g().P.y = ledge.y - g().P.h - 1; g().P.vx = 0; g().P.vy = 0;
  for (let i = 0; i < 20; i++) step();
  check('reward shell collected from the high ledge', g().invCount('shell') === shellBefore + 1);
  g().P.x = 120; g().P.y = 690; // back near spawn

  // --- day / night ---
  const df = g().dayFactor();
  check('dayFactor() is a 0..1 number', typeof df === 'number' && df >= 0 && df <= 1);

  // --- crafting a Sea Urchin Block from collected urchins ---
  g().invAdd('urchin', 5);
  const ub = g().invCount('urchin');
  const okc = g().craftRecipe('urchin-block');
  check('craftRecipe(urchin-block) succeeds', okc === true);
  check('got a Sea Urchin Block', g().invCount('urchin-block') === 1);
  check('5 urchins consumed by the recipe', g().invCount('urchin') === ub - 5);

  // --- crafting table opens the craft panel ---
  const tbl = g().world.tables[0];
  g().P.x = tbl.x - g().P.w / 2; g().P.y = tbl.y - g().P.h;
  step();
  press('KeyE'); step();
  check('crafting table opens the craft panel', g().mode === 'panel' && g().panelKind === 'craft');
  press('Escape'); step();

  // --- doors: choose one by number key, hop to it ---
  const d0 = g().world.doors[0];
  g().P.x = d0.x - g().P.w / 2; g().P.y = d0.y - g().P.h;
  step();
  press('KeyE'); step();
  check('door opens the "which door?" panel', g().mode === 'panel' && g().panelKind === 'door');
  const dest = g().world.doors[2];               // door number "3" in-world
  press('Digit3'); step();
  check('picking door 3 warps Cokco there', g().mode === 'play' && Math.abs(g().P.x - (dest.x - g().P.w / 2)) < 4);

  // --- chests give coins (or, rarely, a gem) ---
  const ch = g().world.chests[0];
  const wealth0 = g().G.coins + g().G.gems;
  g().P.x = ch.x - g().P.w / 2; g().P.y = ch.y - g().P.h;
  step();
  press('KeyE'); step();
  check('opening a chest adds coins or a gem', g().G.coins + g().G.gems > wealth0);
  check('chest marked opened in save', g().G.chests['home:c0'] === true);
  g().P.x = 120; g().P.y = 690;

  // bag panel
  press('KeyI'); step();
  check('bag panel open', g().mode === 'panel');
  press('Escape'); step();
  check('bag panel closed', g().mode === 'play');

  // problems panel
  press('KeyJ'); step();
  check('problems panel open', g().mode === 'panel');
  press('KeyJ'); step();
  check('problems panel closed', g().mode === 'play');

  // menu panel + Esc must actually close it (regression: used to re-open)
  press('Escape'); step();
  check('menu panel open', g().mode === 'panel');
  press('Escape'); step();
  check('menu panel closed with Esc', g().mode === 'play');

  // travel to ocean
  g().travel('ocean', 'fromHome');
  for (let i = 0; i < 40; i++) step();
  check('arrived in ocean', g().world.key === 'ocean');
  check('back in play mode after transition', g().mode === 'play');
  for (let i = 0; i < 60; i++) step(); // let Cokco fall onto the sand
  check('Cokco grounded in ocean', g().P.grounded === true);

  // open a box by teleporting under a floating one and jumping
  const box = g().world.boxes[0];
  g().P.x = box.x + box.w / 2 - g().P.w / 2;
  g().P.y = box.y + box.h + 6;
  g().P.vy = -200;
  for (let i = 0; i < 20; i++) step();
  check('box popped -> loose urchins spawned or collected', g().G.boxes['ocean:0'] === true);

  // dialogue with a plain NPC (Bubbo has 3 lines)
  const bubbo = g().world.npcs.find(n => n.name === 'Bubbo');
  g().P.x = bubbo.x - g().P.w / 2;
  g().P.y = bubbo.y - g().P.h;
  step();
  press('KeyE'); step();
  check('dialogue opened', g().mode === 'dialogue');
  for (let i = 0; i < 3; i++) { press('KeyE'); step(); }
  check('dialogue closed after advancing all lines', g().mode === 'play');
  g().P.x = 0; // step away so it doesn't immediately re-trigger

  // minigame
  g().startMinigame();
  step();
  check('minigame started', g().mode === 'minigame');
  press('ArrowLeft');
  for (let i = 0; i < 400; i++) step(50); // ~20s
  release('ArrowLeft');
  press('ArrowRight');
  for (let i = 0; i < 600; i++) step(50); // run out the clock
  release('ArrowRight');
  check('minigame ended, back to play', g().mode === 'play');

  // quest flow: force-give urchins and turn in craft quest with Crafto
  g().travel('home', 'spawn');
  for (let i = 0; i < 40; i++) step();
  g().G.quests.craft = 'active';
  g().invAdd('urchin', 3);
  const urchBefore = g().invCount('urchin');
  const crafto = g().world.npcs.find(n => n.name === 'Crafto');
  g().P.x = crafto.x - g().P.w / 2;
  g().P.y = crafto.y - g().P.h;
  step();
  press('KeyE'); step();
  check('Crafto turn-in dialogue opened', g().mode === 'dialogue');
  for (let i = 0; i < 3; i++) { press('KeyE'); step(); } // 3 turn-in lines
  g().P.x = 0;
  check('craft quest solved', g().G.quests.craft === 'done');
  check('Grabber crafted', g().invCount('grabber') === 1);
  check('exactly 3 urchins consumed', g().invCount('urchin') === urchBefore - 3);

  // save round-trips
  check('save written', !!store['cokco-save-v2']);

  console.log('\nframes simulated, final mode:', g().mode, '| world:', g().world.key);
} catch (e) {
  failed = true;
  console.error('\nTHREW:', e && e.stack || e);
}

process.exit(failed ? 1 : 0);
