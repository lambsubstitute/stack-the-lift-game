/* ---------------------------------------------------------------------------
   The unit tests never touch render.js, ui.js or main.js, because those need a
   DOM. This suite boots the BUILT bundle against a stub DOM and canvas and
   drives real animation frames, which is the only thing that catches a broken
   selector, a missing element, or an exception inside the draw loop.

   It is also the regression test for the night-time performance cliff: the
   skyline used to be redrawn from scratch every frame after dark.
--------------------------------------------------------------------------- */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const DIST = join(root, 'dist', 'stack.html');

function ensureBuilt() {
  execFileSync(process.execPath, [join(root, 'tools', 'build.mjs')], { stdio: 'pipe' });
  assert.ok(existsSync(DIST), 'build produced dist/stack.html');
}

function boot() {
  const html = readFileSync(DIST, 'utf8');
  const js = html.split('<script>')[1].split('</script>')[0];

  const counts = { fillRect: 0, arc: 0, gradients: 0 };
  const ctx2d = () =>
    new Proxy({}, {
      get: (_t, k) => {
        if (k === 'fillRect') return () => { counts.fillRect++; };
        if (k === 'arc') return () => { counts.arc++; };
        if (k === 'measureText') return () => ({ width: 40 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient')
          return () => { counts.gradients++; return { addColorStop() {} }; };
        if (k === 'canvas') return { width: 0, height: 0 };
        if (typeof k === 'string' &&
            /^(fillStyle|strokeStyle|font|textAlign|textBaseline|lineWidth|globalAlpha)$/.test(k)) return '';
        return () => {};
      },
      set: () => true
    });

  const made = [];
  function el(tag = 'div') {
    const e = {
      tagName: tag.toUpperCase(), style: {}, children: [], options: [], _attr: {},
      checked: false, value: '0', textContent: '', innerHTML: '', disabled: false,
      classList: {
        _s: new Set(),
        add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); },
        contains(c) { return this._s.has(c); }
      },
      addEventListener(t, f) { (this._ev ??= {})[t] = f; },
      appendChild(c) { this.children.push(c); },
      setAttribute(k, v) { this._attr[k] = v; },
      getAttribute(k) { return this._attr[k]; },
      querySelector: () => el(),
      getContext: ctx2d,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      width: 0, height: 0, clientWidth: 1440, clientHeight: 900
    };
    made.push(e);
    return e;
  }

  const nodes = {};
  let raf = null, frameNo = 0;
  const errors = [];
  const sandbox = {
    document: {
      getElementById: id => nodes[id] || (nodes[id] = el()),
      createElement: t => el(t),
      querySelectorAll: () => made.filter(e => e._attr['data-k']),
      addEventListener() {}
    },
    console: { ...console, error: (...a) => errors.push(a.join(' ')) },
    Math, Array, Set, Map, Object, JSON, String, Number, Boolean,
    Infinity, parseInt, isFinite, Date, RegExp, Error,
    performance: { now: () => frameNo * 16.7 },
    requestAnimationFrame: cb => { raf = cb; return 1; },
    setTimeout: (f, ms) => { if (!ms || ms < 50) f(); return 1; },
    clearTimeout: () => {},
    globalThis: {}
  };
  sandbox.window = {
    devicePixelRatio: 2,
    addEventListener() {},
    localStorage: { getItem: () => null, setItem() {} }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(js, context);

  return {
    nodes, counts, errors,
    frames(n) { for (let i = 0; i < n; i++) { frameNo++; const cb = raf; raf = null; if (cb) cb(frameNo * 16.7); } },
    text: id => (nodes[id]?.textContent ?? '')
  };
}

test('the built bundle boots without throwing', () => {
  ensureBuilt();
  const g = boot();
  g.frames(5);
  assert.equal(g.errors.length, 0, `console errors: ${g.errors.join(' | ')}`);
});

test('a few hundred frames advance the clock and draw the tower', () => {
  const g = boot();
  g.frames(400);
  assert.equal(g.errors.length, 0, `console errors: ${g.errors.join(' | ')}`);
  assert.match(g.text('daylbl'), /^Day \d+ · \d\d:\d\d$/, 'clock label renders');
  assert.ok(g.counts.fillRect > 20000, `drew something (${g.counts.fillRect} rects)`);
  assert.match(g.text('money'), /^\$/, 'money renders');
  assert.match(g.text('sArea'), /\d+ \/ \d+/, 'rentable-area readout renders');
});

test('night costs no more to draw than midday', () => {
  /* The skyline's lit windows were once recomputed every frame — three nested
     loops, ~2,400 iterations, gated behind "is it dark". The game ran fine all
     morning and seized up at dusk. They are baked into an offscreen layer now,
     and this is the test that stops that regressing. */
  const g = boot();
  g.frames(30);                       // settle, warm the backdrop cache
  const at = () => g.counts.fillRect;

  const before = at();
  g.frames(60);
  const midday = at() - before;

  // jump the clock into the evening via the speed controls the player has
  for (let i = 0; i < 4000 && !/2[0-2]:/.test(g.text('daylbl')); i++) g.frames(1);

  const mark = at();
  g.frames(60);
  const night = at() - mark;

  assert.ok(night < midday * 1.6,
    `night frame cost must stay close to midday (midday ${midday}, night ${night})`);
});
