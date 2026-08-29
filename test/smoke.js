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
  invAdd, invCount, invRemove, travel, startMinigame,
};`;

// ---- fake canvas 2d context ----
const ctxProxy = new Proxy({}, {
  get(_, p) {
    if (p === 'createLinearGradient') return () => ({ addColorStop() {} });
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
    querySelectorAll: () => [],
    getContext: () => ctxProxy,
    addEventListener() {},
    appendChild() {},
  };
  return el;
}
const elCache = {};
const getEl = id => (elCache[id] ||= makeEl(id));

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
  },
  window: { addEventListener: on, devicePixelRatio: 2, innerWidth: 1200, innerHeight: 700 },
  addEventListener: on,
  navigator: { userAgent: 'node' },
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
