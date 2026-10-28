// Leaderboard persisted as a JSON file (data/scores.json by default).
// Writes go to a temporary file first and are renamed into place, one at a time.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_ENTRIES = 1000;

export class ScoreBoard {
  constructor(file) {
    this.file = file;
    this.entries = [];
    this.writing = Promise.resolve();
    this.ready = this.#load();
  }

  async #load() {
    try {
      this.entries = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  // Adds an entry and returns its rank (1 = best).
  async add(entry) {
    await this.ready;
    this.entries.push(entry);
    this.entries.sort((a, b) => b.score - a.score || a.savedAt.localeCompare(b.savedAt));
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
    const rank = this.entries.indexOf(entry) + 1 || null;
    await this.#save();
    return rank;
  }

  async top(n = 50) {
    await this.ready;
    return this.entries.slice(0, n);
  }

  #save() {
    const data = JSON.stringify(this.entries, null, 1);
    this.writing = this.writing.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, data);
      await rename(tmp, this.file);
    });
    return this.writing;
  }
}

// What we keep about a finished game: the score, how it ended and the decisions taken.
export function scoreEntry(session, name) {
  const s = session.state;
  const sc = s.score;
  const n = Math.max(1, sc.months);
  const round1 = (v) => Math.round(v * 10) / 10;
  return {
    id: session.id,
    name,
    score: Math.round(sc.total),
    months: sc.months,
    status: s.status,
    endDate: `${s.date.year}-${String(s.date.month + 1).padStart(2, '0')}`,
    savedAt: new Date().toISOString(),
    averages: Object.fromEntries(Object.entries(sc.sums).map(([k, v]) => [k, round1(v / n)])),
    laws: { ...s.laws },
    decisions: s.lawLog.map((d) => ({ ...d })),
  };
}

export function cleanName(raw) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 1 || name.length > 40) throw new RangeError('O nome deve ter entre 1 e 40 caracteres.');
  return name;
}
