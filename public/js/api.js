// Thin client for the Express API. The current game id is remembered in
// localStorage so a page reload resumes the same game.

const KEY = 'housing-crisis:game';

const storage = {
  get() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(id) {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // Private mode or blocked storage: the game simply won't resume after reload.
    }
  },
};

export class NotFound extends Error {}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) throw new NotFound(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export const meta = () => request('GET', '/api/meta');

export async function createGame() {
  const state = await request('POST', '/api/games');
  storage.set(state.id);
  return state;
}

// Resume the stored game if the server still has it, otherwise start a new one.
export async function resumeOrCreate() {
  const id = storage.get();
  if (id) {
    try {
      return { state: await request('GET', `/api/games/${id}`), resumed: true };
    } catch (err) {
      if (!(err instanceof NotFound)) throw err;
    }
  }
  return { state: await createGame(), resumed: false };
}

export const getGame = (id) => request('GET', `/api/games/${id}`);
export const setSpeed = (id, speed) => request('POST', `/api/games/${id}/speed`, { speed });
export const vote = (id, law, level) => request('POST', `/api/games/${id}/laws`, { law, level });
export const saveScore = (id, name) => request('POST', `/api/games/${id}/score`, { name });
export const scores = () => request('GET', '/api/scores');
