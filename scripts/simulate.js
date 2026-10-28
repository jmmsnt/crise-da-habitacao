// Run the simulation without the UI and print a yearly summary.
//
//   npm run simulate -- --years 10 --law publicHousing=3 --law rentRules=2
//
// Useful to check that a change in docs/RULES.md / server/sim/config.js
// behaves as intended before playing it.

import { parseArgs } from 'node:util';
import { createGame, stepMonths, setLaw, view } from '../server/sim/engine.js';

const { values } = parseArgs({
  options: {
    years: { type: 'string', default: '10' },
    law: { type: 'string', multiple: true, default: [] },
    every: { type: 'string', default: '12' },
  },
});

const s = createGame();
for (const spec of values.law) {
  const [id, level] = spec.split('=');
  setLaw(s, id, Number(level));
}

const fmt = (v, d = 0) => v.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
const rows = [];
const snap = () => {
  const v = view(s);
  const c = v.regions.city;
  const k = v.regions.countryside;
  rows.push({
    date: `${v.date.year}-${String(v.date.month + 1).padStart(2, '0')}`,
    'money M€': fmt(v.government.money),
    'bal/mo': v.government.lastMonth ? fmt(v.government.lastMonth.balance, 1) : '',
    services: fmt(v.indicators.publicServices, 1),
    'income €': fmt(v.economy.grossIncome),
    'toLive €': fmt(v.indicators.moneyToLive),
    'homeless %': fmt(v.indicators.homelessRate * 100, 2),
    'hl city': fmt(c.people.homeless),
    'hl interior': fmt(k.people.homeless),
    'rent L': fmt(c.market.rent),
    'rent I': fmt(k.market.rent),
    'price L k': fmt(c.market.price / 1000),
    funds: fmt(v.national.funds, 1),
    'fund homes': fmt(c.people.fundHomes + k.people.fundHomes),
    builders: fmt(v.national.builders),
    labour: fmt(v.national.labour, 2),
    building: fmt(c.pipeline.underConstruction + k.pipeline.underConstruction),
    vacant: fmt(c.houses.vacant + k.houses.vacant),
    degraded: fmt(c.houses.degraded + k.houses.degraded),
    public: fmt(c.houses.publicRented + k.houses.publicRented),
    tech: fmt(v.economy.tech, 2),
    gini: fmt(v.indicators.inequality, 2),
    score: fmt(v.score.total),
  });
};

snap();
const every = Number(values.every);
for (let m = 0; m < Number(values.years) * 12 && s.status === 'running'; m += every) {
  stepMonths(s, every);
  snap();
}
console.table(rows);
if (s.status !== 'running') console.log(`Game over: ${s.status}`);
console.log(s.news.slice(0, 8).map((n) => `${n.date}  ${n.text}`).join('\n'));
