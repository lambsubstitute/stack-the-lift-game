/* ---------------------------------------------------------------------------
   Adapter for the ORIGINAL single-file build (legacy/stack.legacy.html).

   It boots the page script inside a vm with a stubbed DOM and canvas, then
   exposes the same surface as the module adapter. This exists only to record
   the golden-master snapshot; once the refactor is proven, the legacy file can
   be deleted and this adapter with it.
--------------------------------------------------------------------------- */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const LEGACY = join(here, '..', '..', 'legacy', 'stack.legacy.html');

const noopCtx = () =>
  new Proxy(
    {},
    {
      get: (_t, k) => {
        if (k === 'measureText') return () => ({ width: 40 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient')
          return () => ({ addColorStop() {} });
        if (k === 'canvas') return { width: 0, height: 0 };
        if (typeof k === 'string' && /^(fillStyle|strokeStyle|font|textAlign|textBaseline|lineWidth|globalAlpha)$/.test(k))
          return '';
        return () => {};
      },
      set: () => true
    }
  );

function element(tag = 'div') {
  return {
    tagName: tag.toUpperCase(),
    style: {},
    children: [],
    options: [],
    checked: false,
    value: '0',
    textContent: '',
    innerHTML: '',
    disabled: false,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    addEventListener() {},
    appendChild(c) { this.children.push(c); },
    setAttribute() {},
    getAttribute: () => '',
    querySelector: () => element(),
    getContext: noopCtx,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    width: 0,
    height: 0,
    clientWidth: 1440,
    clientHeight: 900
  };
}

export function createLegacyAdapter() {
  const html = readFileSync(LEGACY, 'utf8');
  const src = html.split('<script>')[1].split('</script>')[0];

  const nodes = {};
  const sandbox = {
    document: {
      getElementById: id => nodes[id] || (nodes[id] = element()),
      createElement: t => element(t),
      querySelectorAll: () => [],
      addEventListener() {}
    },
    console,
    Math, Array, Set, Map, Object, JSON, String, Number,
    Infinity, parseInt, isFinite, Date,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    setTimeout: (f, ms) => { if (!ms || ms < 50) f(); return 1; },
    clearTimeout: () => {},
    globalThis: {}
  };
  sandbox.window = { devicePixelRatio: 1, addEventListener() {} };
  const ctx = vm.createContext(sandbox);

  vm.runInContext(
    src +
      `globalThis.__api={
        set seed(v){rs=v}, set cash(v){cash=v}, set star(v){star=v}, get star(){return star},
        get simT(){return simT}, get floors(){return floors}, get shafts(){return shafts},
        get people(){return people}, get today(){return today},
        get links(){return links}, set links(v){links=v},
        step,startDay,endOfDay,buildShaft,upgradeShaft,spawnFloor,newFloor,scheduleAll,
        coreBays,avgSat,totalPop,letCount,UPG_KEYS,DAY_END,MAX_FLOOR
      };`,
    ctx
  );
  const g = ctx.globalThis.__api;

  return {
    name: 'legacy',
    reset(seed) {
      g.floors.length = 0;
      g.floors.push(g.newFloor());
      g.shafts.length = 0;
      g.people.length = 0;
      g.links = new Array(g.MAX_FLOOR).fill(null);
      g.cash = 9e6;
      g.star = 5;
      g.seed = seed;
    },
    setStar(s) { g.star = s; },
    setFloors(n) { while (g.floors.length < n) g.floors.push(g.newFloor()); },
    buildShaft(bottom, top, express) { g.buildShaft(bottom, top, !!express); },
    upgrade(i, track) { g.upgradeShaft(g.shafts[i], track); },
    setLink(f, kind) { g.links[f] = { kind }; },
    lease(f, kind) {
      g.floors[f].type = kind;
      g.floors[f].sat = 78;
      g.floors[f].age = 0;
      g.spawnFloor(f);
    },
    beginDay() { g.scheduleAll(); g.startDay(); },
    runDay() {
      while (g.simT < g.DAY_END) g.step(1.25);
      return { ...g.today };
    },
    endDay() {
      g.endOfDay();
      return {
        rent: g.today.rent,
        maint: g.today.maint,
        star: g.star,
        avgSat: g.avgSat(),
        tenants: g.letCount()
      };
    },
    population() { return g.totalPop(); },
    coreBays() { return g.coreBays(); }
  };
}
