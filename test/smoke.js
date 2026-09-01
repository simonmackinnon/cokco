// Headless smoke test for coco/index.html — stubs the DOM + canvas, boots the
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
  get FORMS(){return FORMS},
  invAdd, invCount, invRemove, travel, startMinigame, craftRecipe, dayFactor, buyFromShop,
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
vm.runInContext(code, sandbox, { filename: 'coco.js' });

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
  check('Coco moved right', g().P.x > x0 + 20);
  check('Coco is on the ground', g().P.grounded === true);

  // jump
  press('ArrowUp');
  step();
  release('ArrowUp');
  for (let i = 0; i < 6; i++) step();
  check('Coco left the ground after a jump', g().P.airTime > 0 || g().P.vy !== 0);
  for (let i = 0; i < 40; i++) step();
  check('Coco landed again', g().P.grounded === true);

  // --- on-screen touch controls feed the same input path ---
  check('touch mode marker follows game mode', getEl('touch').dataset.mode === 'play');
  const tx0 = g().P.x;
  touchBtn('ArrowRight')._fire('pointerdown', { pointerId: 1 });
  for (let i = 0; i < 25; i++) step();
  check('holding the on-screen ▶ moves Coco right', g().P.x > tx0 + 20);
  touchBtn('ArrowRight')._fire('pointerup', { pointerId: 1 });
  for (let i = 0; i < 20; i++) step();
  check('releasing the ▶ button stops Coco', Math.abs(g().P.vx) < 5);
  touchBtn('ArrowUp')._fire('pointerdown', { pointerId: 1 });
  step();
  touchBtn('ArrowUp')._fire('pointerup', { pointerId: 1 });
  for (let i = 0; i < 6; i++) step();
  check('tapping the on-screen ▲ makes Coco jump', g().P.grounded === false);
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
  const d0 = g().world.doors.find(d => d.num === 1);
  g().P.x = d0.x - g().P.w / 2; g().P.y = d0.y - g().P.h;
  step();
  press('KeyE'); step();
  check('door opens the "which door?" panel', g().mode === 'panel' && g().panelKind === 'door');
  const dest = g().world.doors.find(d => d.num === 3);
  press('Digit3'); step();
  check('picking door 3 warps Coco there', g().mode === 'play' && Math.abs(g().P.x - (dest.x - g().P.w / 2)) < 4);

  // --- chests give coins (or, rarely, a gem or a battery) ---
  const ch = g().world.chests[0];
  const wealth0 = g().G.coins + g().G.gems + g().invCount('battery');
  g().P.x = ch.x - g().P.w / 2; g().P.y = ch.y - g().P.h;
  step();
  press('KeyE'); step();
  check('opening a chest gives loot', g().G.coins + g().G.gems + g().invCount('battery') > wealth0);
  check('chest marked opened in save', g().G.chests['home:c0'] === true);
  g().P.x = 120; g().P.y = 690;

  // --- Coco-orbs: unlock hammer, change form with Q ---
  g().G.orbs.hammer = true;
  press('KeyQ'); step();
  check('Q switches to hammer form', g().P.form === 'hammer' && g().P.w === g().FORMS.hammer.w);
  press('KeyQ'); step();
  check('Q cycles back to normal', g().P.form === 'normal' && g().P.w === 26);

  // --- hammer form smashes the home boulder ---
  press('KeyQ'); step();                                  // -> hammer
  const rock = g().world.solids.find(s => s.kind === 'rock');
  g().P.x = rock.x - g().P.w - 2; g().P.y = rock.y + rock.h - g().P.h;
  for (let i = 0; i < 4; i++) step();
  press('KeyE'); step();
  check('hammer form smashes the boulder', g().G.rocks['home:r0'] === true);
  press('KeyQ'); step();                                  // -> normal

  // --- the Flattening Centre: door -> Sxco -> Orb Card -> scanner -> Slime Orb ---
  const centreDoor = g().world.doors.find(d => d.target === 'flatten');
  g().P.x = centreDoor.x - g().P.w / 2; g().P.y = centreDoor.y - g().P.h;
  step(); press('KeyE'); step();
  for (let i = 0; i < 40; i++) step();
  check('entered the Flattening Centre', g().world.key === 'flatten');
  g().invAdd('urchin', 1);
  const sxco = g().world.npcs.find(n => n.name === 'Sxco');
  g().P.x = sxco.x - g().P.w / 2; g().P.y = sxco.y - g().P.h;
  step();
  press('KeyE'); step();                                  // open Sxco
  for (let i = 0; i < 3; i++) { press('KeyE'); step(); }  // 3 lines -> close -> flatten
  check('Sxco flattens a Sea Urchin into a Flat Urchin', g().invCount('flat-urchin') === 1 && g().mode === 'play');
  g().G.coins += 2;
  g().craftRecipe('orb-card');
  check('Flat Urchin + coins craft an Orb Card', g().invCount('orb-card') === 1);
  const scanner = g().world.machines[0];
  g().P.x = scanner.x - g().P.w / 2; g().P.y = scanner.y - g().P.h;
  step();
  press('KeyE'); step();
  check('scanning the Orb Card unlocks the Slime Orb', g().G.orbs.slime === true);
  check('the Orb Card is consumed by the scanner', g().invCount('orb-card') === 0);

  // --- swimming in the ocean, and slime oozing through the crack ---
  g().travel('ocean', 'fromHome');
  for (let i = 0; i < 60; i++) step();
  check('in the Ocean layer', g().world.key === 'ocean');
  const oy0 = g().P.y;
  for (let k = 0; k < 5; k++){                 // each tap of up is a short kick
    press('ArrowUp'); step(); release('ArrowUp');
    for (let i = 0; i < 6; i++) step();
  }
  check('tapping up repeatedly swims Coco upward', g().P.y < oy0 - 40);

  const tight = g().world.solids.find(s => s.kind === 'tight');
  g().P.floatT = 0;
  g().P.x = tight.x - 30; g().P.y = (tight.y + tight.h) - 34; g().P.vx = 0; g().P.vy = 0;
  step();
  press('KeyQ'); step();                                  // normal -> slime
  check('became slime form', g().P.form === 'slime');
  press('ArrowRight');
  for (let i = 0; i < 100; i++) step();
  release('ArrowRight');
  check('slime oozed through the crack to the hidden gem', g().G.picked['pk:ocean:0'] === true);
  // return to normal form for the remaining (form-agnostic) checks
  g().P.x = 150; g().P.y = 700;
  for (let k = 0; k < 3 && g().P.form !== 'normal'; k++) { press('KeyQ'); step(); }
  check('cycled Coco back to normal form', g().P.form === 'normal');

  // ================= round 4 =================
  g().travel('home', 'spawn');
  for (let i = 0; i < 40; i++) step();

  // --- placeable Sea Urchin Blocks (press B) ---
  g().invAdd('urchin-block', 2);
  const nBlkBefore = g().invCount('urchin-block');
  g().P.x = 1000; g().P.y = 700; g().P.vx = 0; g().P.vy = 0; g().P.face = 1;
  for (let i = 0; i < 12; i++) step();               // settle on the ground
  press('KeyB'); step();
  check('pressing B places a block (leaves the bag)', g().invCount('urchin-block') === nBlkBefore - 1);
  check('the placed block is a solid', (g().G.placed.home || []).length === 1);
  press('KeyB'); step();
  check('pressing B by a placed block picks it back up', g().invCount('urchin-block') === nBlkBefore && (g().G.placed.home || []).length === 0);

  // --- gacha machine: needs a Coco Card, and (this one) a Battery ---
  const gacha = g().world.machines.find(m => m.kind === 'gacha');
  g().P.x = gacha.x - g().P.w / 2; g().P.y = gacha.y - g().P.h; step();
  const inv0 = g().invCount('urchin') + g().invCount('shell') + g().invCount('urchin-block')
             + g().invCount('battery') + g().invCount('lantern') + g().invCount('blue-pearl') + g().G.coins + g().G.gems;
  press('KeyE'); step();
  check('gacha refuses with no card', g().invCount('orb-card') === 0 && g().mode === 'play');
  g().invAdd('orb-card', 2); g().invAdd('battery', 3);   // plenty
  const cardBefore = g().invCount('orb-card');
  press('KeyE'); step();
  check('gacha consumes the Coco Card', g().invCount('orb-card') === cardBefore - 1 && g().mode === 'play');

  // --- shops in the Dirt layer, reached by the Cave door in the Ocean layer ---
  g().travel('ocean', 'spawn');
  for (let i = 0; i < 45; i++) step();
  const cave = g().world.doors.find(d => d.target === 'dirt');
  g().P.x = cave.x - g().P.w / 2; g().P.y = cave.y - g().P.h; step();
  press('KeyE'); step();
  for (let i = 0; i < 45; i++) step();
  check('entered the Dirt layer via the Ocean Cave door', g().world.key === 'dirt');
  g().G.coins += 30;
  const blok = g().world.npcs.find(n => n.name === 'Blok');
  g().P.x = blok.x - g().P.w / 2; g().P.y = blok.y - g().P.h; step();
  press('KeyE'); step();
  check('Blok opens a shop panel', g().mode === 'panel' && g().panelKind === 'shop');
  const coinsBeforeBuy = g().G.coins, blkBeforeBuy = g().invCount('urchin-block');
  g().buyFromShop(0);   // buy the first stock item (a Sea Urchin Block, 4 coins)
  check('buying a block spends coins and fills the bag',
    g().invCount('urchin-block') === blkBeforeBuy + 1 && g().G.coins === coinsBeforeBuy - 4);
  press('Escape'); step();
  check('left the shop panel', g().mode === 'play');

  const nugget = g().world.npcs.find(n => n.name === 'Nugget');
  g().P.x = nugget.x - g().P.w / 2; g().P.y = nugget.y - g().P.h; step();
  const goldBefore = g().G.gold, coinsBeforeMine = g().G.coins;
  press('KeyE'); step();
  for (let i = 0; i < 4; i++) { press('KeyE'); step(); }
  check('mining spent coins and yielded gold', g().G.gold > goldBefore && g().G.coins < coinsBeforeMine);

  // --- Water-Works: door from the Ocean layer; the block quest is reachable ---
  g().travel('ocean', 'fromHome');
  for (let i = 0; i < 40; i++) step();
  const museum = g().world.doors.find(d => d.target === 'waterworks');
  g().P.x = museum.x - g().P.w / 2; g().P.y = museum.y - g().P.h; step();
  press('KeyE'); step();
  for (let i = 0; i < 45; i++) step();
  check('entered the Water-Works', g().world.key === 'waterworks');
  const fossil = g().world.pickups.find(p => p.id === 'urchin-fossil');
  g().P.x = fossil.x - 6; g().P.y = fossil.y - g().P.h; step();
  for (let i = 0; i < 6; i++) step();
  check('grabbing the shelf fossil works', g().invCount('urchin-fossil') === 1);

  g().travel('home', 'spawn');
  for (let i = 0; i < 40; i++) step();

  // ================= SECRET LAYER: the Beach =================
  const secretDoor = g().world.doors.find(d => d.target === 'beach');
  check('a secret door to the Beach exists', !!secretDoor);
  g().travel('beach', 'spawn');
  for (let i = 0; i < 45; i++) step();
  check('entered the Secret Beach', g().world.key === 'beach');

  // --- orb-chest at the shore gives the Snake Orb ---
  const orbChest = g().world.orbChests[0];
  g().P.x = orbChest.x - g().P.w / 2; g().P.y = orbChest.y - g().P.h; step();
  press('KeyE'); step();
  check('opening the orb-chest unlocks the Snake Orb', g().G.orbs.snake === true);

  // --- snake form climbs the cliff wall ---
  const wall = g().world.solids.find(s => s.kind === 'wall' && s.x > 1000 && s.x < 1800);
  press('KeyQ'); step();                                   // cycle to an orb form...
  for (let k = 0; k < 4 && g().P.form !== 'snake'; k++) { press('KeyQ'); step(); }
  check('became snake form', g().P.form === 'snake');
  g().P.x = wall.x - g().P.w - 1; g().P.y = wall.y + wall.h - g().P.h - 4; g().P.vx = 0; g().P.vy = 0; g().P.face = 1;
  step();
  const climbY0 = g().P.y;
  press('ArrowRight'); press('ArrowUp');
  for (let i = 0; i < 120; i++) step();
  release('ArrowRight'); release('ArrowUp');
  check('holding into the wall + up climbs it', g().P.y < climbY0 - 200);
  // step onto the cliff-top ledge and grab the kite
  g().P.x = 1190; g().P.y = 150; g().P.vx = 0; g().P.vy = 0;
  for (let i = 0; i < 8; i++) step();
  check('grabbed the kite on the cliff top', g().invCount('kite') === 1);

  // --- Sandy's double reward: 10 coins + the Flying Orb ---
  const coinsPreKite = g().G.coins;
  for (let k = 0; k < 6 && g().P.form !== 'normal'; k++) { press('KeyQ'); step(); }
  const sandy = g().world.npcs.find(n => n.name === 'Sandy');
  g().P.x = sandy.x - g().P.w / 2; g().P.y = sandy.y - g().P.h; step();
  press('KeyE'); step();                    // accept the quest...
  for (let i = 0; i < 12; i++) { press('KeyE'); step(); }   // ...then turn in the kite
  press('Escape'); step();                  // make sure we're back in play
  check('Sandy pays 10 Coco-coins', g().G.coins === coinsPreKite + 10);
  check('Sandy unlocks the Flying Orb', g().G.orbs.fly === true);
  check('the climb quest is solved', g().G.quests.climb === 'done');

  // --- fly form rises when you hold up ---
  g().P.x = 300; g().P.y = 560; g().P.vx = 0; g().P.vy = 0;
  for (let i = 0; i < 20; i++) step();      // land on the sand
  for (let k = 0; k < 8 && g().P.form !== 'fly'; k++) { press('KeyQ'); step(); }
  check('became fly form', g().P.form === 'fly');
  const flyY0 = g().P.y;
  press('ArrowUp');
  for (let i = 0; i < 40; i++) step();
  release('ArrowUp');
  check('holding up flies upward', g().P.y < flyY0 - 40);
  release('ArrowUp');
  for (let k = 0; k < 6 && g().P.form !== 'normal'; k++) { press('KeyQ'); step(); }

  // --- Dirt-layer fly problem: fly into the roof alcove for Pip's Cave Crystal ---
  g().travel('dirt', 'spawn');
  for (let i = 0; i < 45; i++) step();
  check('back in the Dirt layer', g().world.key === 'dirt');
  const pip = g().world.npcs.find(n => n.name === 'Pip');
  g().P.x = pip.x - g().P.w / 2; g().P.y = pip.y - g().P.h; step();
  press('KeyE'); step();
  for (let i = 0; i < 3; i++) { press('KeyE'); step(); }        // accept the quest
  check('Pip gives the dirtfly quest', g().G.quests.dirtfly === 'active');
  // fly up beside the high ledge, then over onto it for the crystal
  const dledge = g().world.solids.find(s => s.x === 1640 && s.kind === 'dirt');
  // the ledge is ~390px up - out of jump range; confirm fly rises, then (to keep the
  // test independent of piloting) place Coco on the ledge and collect the crystal.
  g().P.x = 1650; g().P.y = 560; g().P.vx = 0; g().P.vy = 0;
  for (let i = 0; i < 6; i++) step();
  for (let k = 0; k < 6 && g().P.form !== 'fly'; k++) { press('KeyQ'); step(); }
  check('became fly form in the Dirt layer', g().P.form === 'fly');
  const dfY0 = g().P.y;
  press('ArrowUp'); for (let i = 0; i < 30; i++) step(); release('ArrowUp');
  check('fly rises toward the high ledge', g().P.y < dfY0 - 60);
  const crystal = g().world.pickups.find(p => p.id === 'cave-crystal');
  g().P.x = crystal.x - g().P.w / 2; g().P.y = dledge.y - g().P.h; g().P.vx = 0; g().P.vy = 0;
  for (let i = 0; i < 6; i++) step();
  check('collected the Cave Crystal from the ledge', g().invCount('cave-crystal') === 1);
  for (let k = 0; k < 6 && g().P.form !== 'normal'; k++) { press('KeyQ'); step(); }
  g().P.x = pip.x - g().P.w / 2; g().P.y = pip.y - g().P.h; step();
  press('KeyE'); step();
  for (let i = 0; i < 3; i++) { press('KeyE'); step(); }
  check('Pip pays out for the Cave Crystal', g().G.quests.dirtfly === 'done' && g().invCount('battery') >= 1);

  g().travel('home', 'spawn');
  for (let i = 0; i < 40; i++) step();
  for (let k = 0; k < 6 && g().P.form !== 'normal'; k++) { press('KeyQ'); step(); }

  // bag panel
  press('KeyI'); step();
  check('bag panel open', g().mode === 'panel');
  press('Escape'); step();
  check('bag panel closed', g().mode === 'play');

  // problems panel — now a live status board
  press('KeyJ'); step();
  check('problems panel open', g().mode === 'panel');
  check('problems board shows a solved count', /\d+ \/ \d+ solved/.test(getEl('panel').innerHTML));
  press('KeyJ'); step();
  check('problems panel closed', g().mode === 'play');

  // menu panel + Esc must actually close it (regression: used to re-open)
  press('Escape'); step();
  check('menu panel open', g().mode === 'panel');
  check('menu offers the Problems view', getEl('panel').innerHTML.includes('data-act="problems"'));
  press('Escape'); step();
  check('menu panel closed with Esc', g().mode === 'play');

  // travel to ocean
  g().travel('ocean', 'fromHome');
  for (let i = 0; i < 40; i++) step();
  check('arrived in ocean', g().world.key === 'ocean');
  check('back in play mode after transition', g().mode === 'play');
  for (let i = 0; i < 60; i++) step(); // let Coco fall onto the sand
  check('Coco grounded in ocean', g().P.grounded === true);

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
  check('save written', !!store['coco-save-v2']);

  console.log('\nframes simulated, final mode:', g().mode, '| world:', g().world.key);
} catch (e) {
  failed = true;
  console.error('\nTHREW:', e && e.stack || e);
}

process.exit(failed ? 1 : 0);
