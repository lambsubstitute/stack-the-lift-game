/* The opening five steps. Driven through the test seam, no DOM required. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tower, runDay, G } from './helpers.mjs';
import { __tutorial } from '../src/tutorial.js';
import { newFloor } from '../src/state.js';
import { spawnFloor, scheduleAll } from '../src/people.js';

test('it teaches the four basics, then stairs, in order', () => {
  const ids = __tutorial.steps.map(s => s.id);
  assert.deepEqual(ids, ['lease', 'watch', 'build', 'extend', 'stairs']);
});

test('every step explains itself and only the last one blocks', () => {
  for (const s of __tutorial.steps) {
    assert.ok(s.title.length > 4, `${s.id} has a title`);
    assert.ok(s.body.length > 40, `${s.id} explains what to do`);
    assert.equal(typeof s.done, 'function', `${s.id} knows when it is finished`);
  }
  assert.ok(__tutorial.steps.at(-1).final, 'the last card is dismissed by the player');
});

test('it advances as the player actually does each thing', () => {
  tower({ floors: 6, lifts: 1, use: null, seed: 4242 });
  __tutorial.reset();
  assert.equal(__tutorial.current().id, 'lease');

  // 1. let a floor
  G.floors[1].type = 'office'; G.floors[1].sat = 78; G.floors[1].age = 0;
  spawnFloor(1); scheduleAll();
  __tutorial.tick();
  assert.equal(__tutorial.current().id, 'watch', 'letting a floor advances to watching');

  // 2. watch a few trips happen
  runDay();
  __tutorial.tick();
  assert.equal(__tutorial.current().id, 'build', 'trips advance to building');

  // 3. add a floor
  __tutorial.setCtx({ startHeight: G.floors.length });
  G.floors.push(newFloor());
  __tutorial.tick();
  assert.equal(__tutorial.current().id, 'extend', 'a new floor advances to extending');

  // 4. extend the lift to the top
  for (const s of G.shafts) s.top = G.floors.length - 1;
  __tutorial.tick();
  assert.equal(__tutorial.current().id, 'stairs', 'extending advances to the stairs note');
});

test('the stairs card explains the trade-off, not a button', () => {
  const stairs = __tutorial.steps.find(s => s.id === 'stairs');
  assert.match(stairs.body, /every floor it passes/i, 'names the cost of a shaft');
  assert.match(stairs.body, /escalator/i, 'mentions escalators');
  assert.match(stairs.body, /climb/i, 'warns that long climbs are resented');
});

test('the extend step is not satisfied while a floor is unreachable', () => {
  tower({ floors: 8, lifts: 1, seed: 4242 });
  G.shafts[0].top = 4;                      // lift stops short of the top
  __tutorial.reset();
  const extend = __tutorial.steps.find(s => s.id === 'extend');
  assert.equal(extend.done(), false, 'not done while the lift stops short');
  G.shafts[0].top = G.floors.length - 1;
  assert.equal(extend.done(), true, 'done once it reaches the top');
});
