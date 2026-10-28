import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepMonths, setLaw, view, indicators } from '../server/sim/engine.js';
import { LAWS, MONTH_MS } from '../server/sim/config.js';
import { Session } from '../server/games.js';

function run(laws = {}, months = 24) {
  const s = createGame();
  for (const [law, level] of Object.entries(laws)) setLaw(s, law, level);
  stepMonths(s, months);
  return s;
}

function allNumbers(obj, path = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') out.push([`${path}${k}`, v]);
    else if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...allNumbers(v, `${path}${k}.`));
  }
  return out;
}

test('state stays finite and non-negative under random law changes', () => {
  const s = createGame();
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let year = 0; year < 15 && s.status === 'running'; year++) {
    for (const law of LAWS) setLaw(s, law.id, Math.floor(rand() * law.levels.length));
    stepMonths(s, 12);
    for (const key of ['city', 'countryside']) {
      const r = s.regions[key];
      for (const [name, v] of allNumbers({ houses: r.houses, fund: r.fund, pipeline: r.pipeline, land: r.land, homeless: r.homeless })) {
        assert.ok(Number.isFinite(v), `${key}.${name} is not finite`);
        assert.ok(v > -1e-6, `${key}.${name} is negative: ${v}`);
      }
      assert.ok(r.fund.rented <= r.houses.rented + 1e-6, 'fund rented ≤ rented');
      assert.ok(r.fund.vacant <= r.houses.vacant + 1e-6, 'fund vacant ≤ vacant');
    }
  }
});

test('more immigration brings more builders and more households without a house (R2)', () => {
  const closed = run({ immigration: 1 });
  const open = run({ immigration: 4 });
  assert.ok(open.national.builders > closed.national.builders);
  assert.ok(indicators(open).homeless > indicators(closed).homeless);
});

test('more investment funds buy more homes (R9)', () => {
  const restricted = run({ foreignInvestment: 1 });
  const golden = run({ foreignInvestment: 4 });
  assert.ok(golden.national.funds > restricted.national.funds);
  const bought = (s) => s.lastMonth.flows.city.fundPurchases + s.lastMonth.flows.countryside.fundPurchases;
  assert.ok(bought(golden) > bought(restricted));
});

test('a rent freeze stops rents from rising but degrades rented homes faster (R7, R8, R14)', () => {
  const freeze = run({ rentRules: 0 }, 36);
  const free = run({ rentRules: 4 }, 36);
  const start = createGame().regions.city.market.rent;
  assert.ok(freeze.regions.city.market.rent <= start + 1e-6);
  assert.ok(free.regions.city.market.rent > start);
  assert.ok(freeze.regions.city.houses.degraded > free.regions.city.houses.degraded);
});

test('public housing adds public homes and costs money (R11)', () => {
  const none = run({ publicHousing: 1 });
  const massive = run({ publicHousing: 4 });
  const publicHomes = (s) => s.regions.city.houses.publicRented + s.regions.countryside.houses.publicRented;
  assert.ok(publicHomes(massive) > publicHomes(none) + 1000);
  assert.ok(massive.government.money < none.government.money);
});

test('innovation pays off slowly (R13)', () => {
  const s = createGame();
  setLaw(s, 'innovation', 4);
  stepMonths(s, 6);
  const early = s.economy.tech;
  stepMonths(s, 54);
  assert.ok(early < 1.05, `tech after 6 months: ${early}`);
  assert.ok(s.economy.tech > 1.3, `tech after 5 years: ${s.economy.tech}`);
});

test('the status quo is a worsening crisis', () => {
  const s = run({}, 60);
  assert.ok(indicators(s).homelessRate > indicators(createGame()).homelessRate);
});

test('setLaw rejects unknown laws and levels', () => {
  const s = createGame();
  assert.throws(() => setLaw(s, 'taxes', 1), RangeError);
  assert.throws(() => setLaw(s, 'immigration', 9), RangeError);
});

test('view exposes the three guide indicators', () => {
  const v = view(createGame());
  assert.equal(typeof v.indicators.money, 'number');
  assert.equal(typeof v.indicators.publicServices, 'number');
  assert.equal(typeof v.indicators.homelessRate, 'number');
  assert.equal(v.date.label, '1 de janeiro de 2027');
});

test('one real minute is one game month at 1x', () => {
  const session = new Session();
  session.speed = 1;
  let now = session.lastTick;
  for (let i = 0; i < MONTH_MS / 1000; i++) session.advance((now += 1000));
  assert.equal(session.state.date.month, 1);
  assert.equal(session.state.date.day, 1);
});

test('the clock pauses when the client stops polling', () => {
  const session = new Session();
  session.speed = 1;
  session.advance(session.lastTick + 60 * 60 * 1000);
  assert.equal(session.state.date.month, 0);
  assert.ok(session.state.date.day <= 4);
});

test('tenants save less than owners, landlords and funds save more (R20)', () => {
  const s = run({ rentRules: 4 }, 60);
  const { savings, inequality } = indicators(s);
  assert.ok(savings.tenant < savings.owner);
  assert.ok(savings.landlord > savings.owner);
  assert.ok(savings.fund > savings.landlord);
  assert.ok(inequality > indicators(run({ rentRules: 0 }, 60)).inequality);
});
