/* ---------------------------------------------------------------------------
   Nothing here tests behaviour. It tests the text the player reads.

   The refactor that split the single-file build into src/ renamed every piece
   of world state to live on the `G` object, mechanically, with a script. The
   script stashed comments and quoted strings before renaming — but not
   perfectly, and "G." leaked into six pieces of on-screen prose:

       <span>Avg wait G.today</span>
       They were waiting too long, every G.day.
       12 G.people gave up waiting G.today.
       A good G.day. For ★3 you still need ...

   None of it threw. The tests were green, the game ran, and the only symptom
   was a panel full of nonsense that nobody was looking at closely. The seventh
   leak in the same family DID throw — `today.gave` instead of `G.today.gave`,
   which killed the end-of-day panel — and that is covered in bundle.test.js.

   So: no string the player can see may contain a bare `G.something`. It is a
   cheap check and it catches an entire class of mechanical-rewrite damage.
--------------------------------------------------------------------------- */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Every string and template literal in a file, with `${...}` holes removed. */
function literals(code) {
  /* A `${...}` hole is code, not text — and it can appear inside a quoted HTML
     attribute as well as directly in a template, so strip it everywhere. */
  const strip = s => s.replace(/\$\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '');
  const out = [];

  /* Template literals may span lines, so they are matched against the whole
     file. Quoted strings are matched line by line, because an unbalanced
     apostrophe in a comment would otherwise swallow half the file. */
  let m;
  const tpl = /`([^`\\]*)`/g;
  while ((m = tpl.exec(code))) {
    out.push({ line: code.slice(0, m.index).split('\n').length, text: strip(m[1]) });
  }
  code.split('\n').forEach((line, i) => {
    for (const re of [/"([^"\\]*)"/g, /'([^'\\]*)'/g]) {
      let q;
      while ((q = re.exec(line))) out.push({ line: i + 1, text: strip(q[1]) });
    }
  });
  return out;
}

test('no state name leaked into text the player reads', () => {
  const bad = [];
  for (const file of readdirSync(SRC).filter(f => f.endsWith('.js'))) {
    for (const { line, text } of literals(readFileSync(join(SRC, file), 'utf8'))) {
      if (/\bG\.[a-z]/.test(text)) bad.push(`${file}:${line}  "${text.trim().slice(0, 90)}"`);
    }
  }
  assert.deepEqual(bad, [],
    `the refactor's rename leaked into display text:\n  ${bad.join('\n  ')}`);
});

test('the end-of-day copy is written for a person, not a debugger', () => {
  /* A weaker net over the same area: the strings showEOD picks between are the
     ones a player reads every single evening, so they get looked at directly. */
  const ui = readFileSync(join(SRC, 'ui.js'), 'utf8');
  const eod = ui.slice(ui.indexOf('export function showEOD'));
  const notes = [...eod.matchAll(/note\s*=\s*`([^`]*)`/g)].map(m => m[1]);

  assert.ok(notes.length >= 5, `showEOD offers several closing notes (${notes.length})`);
  for (const n of notes) {
    assert.ok(!/\b[A-Za-z]+\.[a-z]+\b/.test(n.replace(/\$\{[^}]*\}/g, '')),
      `no dotted identifier in "${n.slice(0, 70)}"`);
    assert.ok(n.replace(/\$\{[^}]*\}/g, '').trim().length > 12,
      `each note actually says something: "${n.slice(0, 70)}"`);
  }
});
