// In-memory game sessions and their clocks.
//
// The simulation is advanced lazily: whenever a client asks for the state we
// step as many game days as the real time elapsed since the last request
// (scaled by the chosen speed). If the browser stops polling — tab closed or
// hidden — the gap is capped, so the game effectively pauses.

import { createGame, stepDay, setLaw, view, daysInMonth } from './sim/engine.js';
import { MONTH_MS } from './sim/config.js';

export const SPEEDS = [0, 1, 2, 4, 8];
const MAX_GAP_MS = 5_000;
const IDLE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_GAMES = 500;

export class Session {
  constructor(id = globalThis.crypto.randomUUID()) {
    this.id = id;
    this.state = createGame();
    this.speed = 0; // starts paused until the player presses play
    this.lastTick = Date.now();
    this.carryMs = 0;
    this.lastSeen = Date.now();
  }

  advance(now = Date.now()) {
    const elapsed = Math.min(Math.max(0, now - this.lastTick), MAX_GAP_MS);
    this.lastTick = now;
    this.lastSeen = now;
    if (this.speed === 0 || this.state.status !== 'running') {
      this.carryMs = 0;
      return;
    }
    this.carryMs += elapsed * this.speed;
    let dayMs = MONTH_MS / daysInMonth(this.state.date);
    while (this.carryMs + 1e-6 >= dayMs && this.state.status === 'running') {
      stepDay(this.state);
      this.carryMs = Math.max(0, this.carryMs - dayMs);
      dayMs = MONTH_MS / daysInMonth(this.state.date);
    }
    if (this.state.status !== 'running') this.speed = 0;
  }

  // Plain data for storage (used by the Cloudflare Worker's Durable Objects)
  toJSON() {
    const { id, state, speed, lastTick, carryMs, lastSeen, scoreSaved } = this;
    return { id, state, speed, lastTick, carryMs, lastSeen, scoreSaved: !!scoreSaved };
  }

  static fromJSON(data) {
    return Object.assign(Object.create(Session.prototype), data);
  }

  snapshot() {
    const dayMs = MONTH_MS / daysInMonth(this.state.date);
    return {
      id: this.id,
      scoreSaved: !!this.scoreSaved,
      clock: { speed: this.speed, speeds: SPEEDS, dayProgress: Math.min(1, this.carryMs / dayMs), monthMs: MONTH_MS },
      ...view(this.state),
    };
  }
}

export class GameStore {
  #games = new Map();

  constructor() {
    const sweep = setInterval(() => this.#sweep(), 10 * 60 * 1000);
    sweep.unref();
  }

  create() {
    if (this.#games.size >= MAX_GAMES) this.#evictOldest();
    const session = new Session();
    this.#games.set(session.id, session);
    return session;
  }

  get(id) {
    const session = this.#games.get(id);
    session?.advance();
    return session;
  }

  setSpeed(session, speed) {
    if (!SPEEDS.includes(speed)) throw new RangeError(`A velocidade tem de ser uma de: ${SPEEDS.join(', ')}`);
    session.advance();
    session.speed = session.state.status === 'running' ? speed : 0;
  }

  setLaw(session, law, level) {
    session.advance();
    return setLaw(session.state, law, level);
  }

  #sweep(now = Date.now()) {
    for (const [id, s] of this.#games) if (now - s.lastSeen > IDLE_TTL_MS) this.#games.delete(id);
  }

  #evictOldest() {
    let oldest;
    for (const s of this.#games.values()) if (!oldest || s.lastSeen < oldest.lastSeen) oldest = s;
    if (oldest) this.#games.delete(oldest.id);
  }
}
