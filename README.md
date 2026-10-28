# Crise da Habitação — Housing Crisis

A minimalist 3D simulation game about the housing crisis. You lead the government: approve laws in
parliament and watch what happens to homes and people in the city (Lisboa) and the countryside
(shown as *Interior*). The interface is in Portuguese (pt-PT); code and docs are in English.

- **Front-end:** [three.js](https://threejs.org) (ES modules, no build step), plain HTML/CSS.
- **Back-end:** Node.js + Express. The simulation runs on the server; the browser polls it once per second.
- **Rules:** every rule linking the variables is documented in [`docs/RULES.md`](docs/RULES.md).

## Run it

```sh
npm install
npm start            # http://localhost:3000   (PORT=4000 npm start to change the port)
npm run dev          # same, restarting on server changes
npm test             # simulation tests
npm run simulate -- --years 10 --law publicHousing=3   # play a scenario headless
```

Node 20 or newer is required.

## How to play

| | |
|---|---|
| Top left | Date and speed. **1 real minute = 1 game month** at 1×; pause or play at 2×, 4× or 8× (space bar pauses). |
| Top centre | Views: **Parlamento**, **Lisboa · cidade**, **Interior** (keys 1, 2, 3). Drag to orbit, scroll to zoom. |
| Bottom left | What to steer by: **government budget**, **public services**, share of households **without a house**, and **money to live** after housing costs. |
| In the scenes | Building colour = owner (yellow residents, pink landlords, purple funds, teal State); residents on balconies; people without a house in the main square; a grey, cloudy mood when quality of life is low; trash when government management is poor. |
| Right panel | Parliament: the six laws (5 levels each) and last month's budget. City and countryside: every house, people, market and infrastructure variable, with the colour legend. |
| Bottom centre | News: law votes, milestones, new schools and hospitals, yearly reviews. |

A term lasts **20 years**. Each month earns up to 100 points for quality of life (public services, money to live, access to housing, savings equality); the best quality of life for the longest time wins. The game ends early if debt passes €800M or a quarter of households have no home. At the end you can save your score with your name; the leaderboard (`/scores.html`) shows the top scores and the decisions behind them.

## Project layout

```
server/
  index.js          Express app: API + static files (three.js served from node_modules)
  games.js          In-memory game sessions and the lazily advanced clock
  sim/config.js     Laws, parameters and initial state  ← tune the game here
  sim/engine.js     The rules (R1…R21), budget, score, news and the view sent to the browser
  scores.js         Leaderboard stored in data/scores.json
public/
  index.html        Page shell and import map
  css/style.css
  js/main.js        Renderer, scenes, polling, input
  js/hud.js         Clock, status, region panels, news, dialogs
  js/laws.js        Parliament panel
  js/scenes/        kit.js (shared 3D pieces), parliament.js, city.js, countryside.js, population.js
docs/RULES.md       How the variables affect each other over time
scripts/simulate.js Headless scenario runner
test/               node:test suites
```

## API

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/meta` | | Law definitions and region names |
| POST | `/api/games` | | A new game (starts paused) |
| GET | `/api/games/:id` | | The game state, advanced to now |
| POST | `/api/games/:id/speed` | `{ "speed": 0 \| 1 \| 2 \| 4 \| 8 }` | The game state |
| POST | `/api/games/:id/laws` | `{ "law": "rentRules", "level": 2 }` | `{ result: { vote }, state }` |
| POST | `/api/games/:id/score` | `{ "name": "Ana" }` | `{ rank, entry }`; only once, after the game has ended |
| GET | `/api/scores` | | Top 50 saved scores with their decisions |

Games live in memory. They are lost when the server restarts and removed after 6 hours without
activity. The browser remembers its game id, so a reload resumes the same game.

Saved scores are written to `data/scores.json` (set `SCORES_FILE` to use another path). The leaderboard
is at `/scores.html`.
