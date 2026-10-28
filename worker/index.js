// Cloudflare Worker version of the back-end (same API as server/index.js).
//
//   /api/*      → this Worker
//   everything  → static assets in dist/ (built by scripts/build-worker.mjs)
//
// Each game is a GameSession Durable Object holding the simulation and its clock;
// the leaderboard is a single ScoreBoard Durable Object backed by SQLite.

import { DurableObject } from 'cloudflare:workers';
import { Session, SPEEDS } from '../server/games.js';
import { setLaw } from '../server/sim/engine.js';
import { LAWS, MONTH_MS, REGION_KEYS, initialRegions } from '../server/sim/config.js';
import { scoreEntry, cleanName } from '../server/scoring.js';

const IDLE_TTL_MS = 6 * 60 * 60 * 1000; // games are deleted after 6 hours without activity
const SAVE_EVERY_MS = 10_000; // while the clock runs, persist at most every 10 s
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------
// One Durable Object per game
// ---------------------------------------------------------------------------

export class GameSession extends DurableObject {
  async #load() {
    if (!this.session) {
      const data = await this.ctx.storage.get('session');
      if (data) this.session = Session.fromJSON(data);
    }
    return this.session;
  }

  async #save() {
    await this.ctx.storage.put('session', this.session.toJSON());
    await this.ctx.storage.setAlarm(Date.now() + IDLE_TTL_MS);
    this.savedAt = Date.now();
  }

  async create(id) {
    this.session = new Session(id);
    await this.#save();
    return this.session.snapshot();
  }

  async get() {
    const s = await this.#load();
    if (!s) return null;
    s.advance();
    if (!this.savedAt || Date.now() - this.savedAt > SAVE_EVERY_MS) await this.#save();
    return s.snapshot();
  }

  async setSpeed(speed) {
    const s = await this.#load();
    if (!s) return null;
    if (!SPEEDS.includes(speed)) return { error: `A velocidade tem de ser uma de: ${SPEEDS.join(', ')}` };
    s.advance();
    s.speed = s.state.status === 'running' ? speed : 0;
    await this.#save();
    return { state: s.snapshot() };
  }

  async setLaw(law, level) {
    const s = await this.#load();
    if (!s) return null;
    s.advance();
    let result;
    try {
      result = setLaw(s.state, law, level);
    } catch (err) {
      return { error: err.message };
    }
    await this.#save();
    return { result, state: s.snapshot() };
  }

  // Marks the score as saved and returns the leaderboard entry (once per finished game).
  async claimScore(rawName) {
    const s = await this.#load();
    if (!s) return null;
    s.advance();
    if (s.state.status === 'running') return { error: 'O jogo ainda não terminou.', status: 409 };
    if (s.scoreSaved) return { error: 'A pontuação deste jogo já foi guardada.', status: 409 };
    let name;
    try {
      name = cleanName(rawName);
    } catch (err) {
      return { error: err.message, status: 400 };
    }
    s.scoreSaved = true;
    await this.#save();
    return { entry: scoreEntry(s, name) };
  }

  async alarm() {
    const s = await this.#load();
    if (s && Date.now() - s.lastSeen < IDLE_TTL_MS) {
      await this.ctx.storage.setAlarm(s.lastSeen + IDLE_TTL_MS);
      return;
    }
    await this.ctx.storage.deleteAll();
    this.session = null;
  }
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export class ScoreBoard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS scores (
          id TEXT PRIMARY KEY,
          score INTEGER NOT NULL,
          saved_at TEXT NOT NULL,
          data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, saved_at ASC);
      `);
    });
  }

  // Adds an entry and returns its rank (1 = best).
  add(entry) {
    const sql = this.ctx.storage.sql;
    sql.exec(
      'INSERT OR REPLACE INTO scores (id, score, saved_at, data) VALUES (?, ?, ?, ?)',
      entry.id,
      entry.score,
      entry.savedAt,
      JSON.stringify(entry),
    );
    return (
      sql
        .exec(
          'SELECT COUNT(*) AS better FROM scores WHERE score > ? OR (score = ? AND saved_at < ?)',
          entry.score,
          entry.score,
          entry.savedAt,
        )
        .one().better + 1
    );
  }

  top(n = 50) {
    return this.ctx.storage.sql
      .exec('SELECT data FROM scores ORDER BY score DESC, saved_at ASC LIMIT ?', n)
      .toArray()
      .map((row) => JSON.parse(row.data));
  }
}

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------

const json = (body, status = 200) => Response.json(body, { status });
const notFound = () => json({ error: 'Jogo não encontrado' }, 404);

async function readBody(request) {
  const text = await request.text();
  if (text.length > 10_000) throw new RangeError('Pedido demasiado grande.');
  return text ? JSON.parse(text) : {};
}

async function handleApi(request, env, url) {
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method;

  if (method === 'GET' && parts.length === 1 && parts[0] === 'meta') {
    const regions = initialRegions();
    return json({
      laws: LAWS,
      regions: Object.fromEntries(REGION_KEYS.map((k) => [k, { name: regions[k].name }])),
      monthMs: MONTH_MS,
    });
  }

  if (method === 'GET' && parts.length === 1 && parts[0] === 'scores') {
    return json(await env.SCORES.getByName('global').top(50));
  }

  if (parts[0] !== 'games') return json({ error: 'Não encontrado' }, 404);

  if (method === 'POST' && parts.length === 1) {
    const id = crypto.randomUUID();
    return json(await env.GAMES.getByName(id).create(id), 201);
  }

  const id = parts[1];
  if (!ID.test(id ?? '')) return notFound();
  const game = env.GAMES.getByName(id);

  if (method === 'GET' && parts.length === 2) {
    const snapshot = await game.get();
    return snapshot ? json(snapshot) : notFound();
  }

  if (method !== 'POST' || parts.length !== 3) return json({ error: 'Não encontrado' }, 404);
  let body;
  try {
    body = await readBody(request);
  } catch (err) {
    return json({ error: err instanceof RangeError ? err.message : 'JSON inválido' }, 400);
  }

  if (parts[2] === 'speed') {
    const out = await game.setSpeed(Number(body.speed));
    if (!out) return notFound();
    return out.error ? json({ error: out.error }, 400) : json(out.state);
  }

  if (parts[2] === 'laws') {
    const out = await game.setLaw(String(body.law), Number(body.level));
    if (!out) return notFound();
    return out.error ? json({ error: out.error }, 400) : json(out);
  }

  if (parts[2] === 'score') {
    const out = await game.claimScore(body.name);
    if (!out) return notFound();
    if (out.error) return json({ error: out.error }, out.status);
    const rank = await env.SCORES.getByName('global').add(out.entry);
    return json({ rank, entry: out.entry }, 201);
  }

  return json({ error: 'Não encontrado' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error('API error', url.pathname, err);
        return json({ error: 'Erro interno' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
