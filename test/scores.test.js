import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ScoreBoard, scoreEntry, cleanName } from '../server/scores.js';
import { Session } from '../server/games.js';
import { stepMonths, setLaw } from '../server/sim/engine.js';

test('the game ends after 20 years with a score (R21)', () => {
  const session = new Session();
  setLaw(session.state, 'publicHousing', 3);
  stepMonths(session.state, 250);
  assert.equal(session.state.status, 'finished');
  assert.equal(session.state.score.months, 240);
  assert.ok(session.state.score.total > 0 && session.state.score.total <= 24000);
  const entry = scoreEntry(session, 'Ana');
  assert.equal(entry.decisions.length, 1);
  assert.equal(entry.decisions[0].law, 'publicHousing');
});

test('the scoreboard keeps entries sorted and on disk', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'scores-'));
  const file = path.join(dir, 'scores.json');
  const board = new ScoreBoard(file);
  const entry = (name, score) => ({ name, score, savedAt: new Date().toISOString() });
  assert.equal(await board.add(entry('a', 100)), 1);
  assert.equal(await board.add(entry('b', 300)), 1);
  assert.equal(await board.add(entry('c', 200)), 2);
  assert.deepEqual((await board.top(3)).map((e) => e.name), ['b', 'c', 'a']);
  const reloaded = new ScoreBoard(file);
  assert.equal((await reloaded.top()).length, 3);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).length, 3);
});

test('player names are cleaned and validated', () => {
  assert.equal(cleanName('  Maria   da  Silva '), 'Maria da Silva');
  assert.throws(() => cleanName('   '), RangeError);
  assert.throws(() => cleanName('x'.repeat(41)), RangeError);
});
