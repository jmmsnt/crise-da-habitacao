import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameStore } from './games.js';
import { ScoreBoard, scoreEntry, cleanName } from './scores.js';
import { LAWS, MONTH_MS, REGION_KEYS, initialRegions } from './sim/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const games = new GameStore();
const scores = new ScoreBoard(process.env.SCORES_FILE || path.join(root, 'data/scores.json'));
const app = express();

app.use(express.json({ limit: '10kb' }));

// --- API -------------------------------------------------------------------
const api = express.Router();

api.get('/meta', (req, res) => {
  const regions = initialRegions();
  res.json({
    laws: LAWS,
    regions: Object.fromEntries(REGION_KEYS.map((k) => [k, { name: regions[k].name }])),
    monthMs: MONTH_MS,
  });
});

api.post('/games', (req, res) => {
  res.status(201).json(games.create().snapshot());
});

api.param('id', (req, res, next, id) => {
  const session = games.get(id);
  if (!session) return res.status(404).json({ error: 'Jogo não encontrado' });
  req.session = session;
  next();
});

api.get('/games/:id', (req, res) => {
  res.json(req.session.snapshot());
});

api.post('/games/:id/speed', (req, res) => {
  try {
    games.setSpeed(req.session, Number(req.body?.speed));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.json(req.session.snapshot());
});

api.post('/games/:id/laws', (req, res) => {
  let result;
  try {
    result = games.setLaw(req.session, String(req.body?.law), Number(req.body?.level));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.json({ result, state: req.session.snapshot() });
});

// Save the score of a finished game (once per game). The server computes the score itself.
api.post('/games/:id/score', async (req, res) => {
  const session = req.session;
  if (session.state.status === 'running') return res.status(409).json({ error: 'O jogo ainda não terminou.' });
  if (session.scoreSaved) return res.status(409).json({ error: 'A pontuação deste jogo já foi guardada.' });
  let name;
  try {
    name = cleanName(req.body?.name);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  session.scoreSaved = true;
  const entry = scoreEntry(session, name);
  const rank = await scores.add(entry);
  res.status(201).json({ rank, entry });
});

api.get('/scores', async (req, res) => {
  res.json(await scores.top(50));
});

app.use('/api', api);

// --- Static files ----------------------------------------------------------
// three.js is served straight from node_modules (see the import map in index.html).
app.use('/vendor/three/build', express.static(path.join(root, 'node_modules/three/build')));
app.use('/vendor/three/addons', express.static(path.join(root, 'node_modules/three/examples/jsm')));
app.use(express.static(path.join(root, 'public')));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Crise da Habitação a correr em http://localhost:${port}`);
});
