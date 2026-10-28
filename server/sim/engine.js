// The housing-crisis simulation. Pure functions over a plain JSON state, so it
// can be stepped by the server clock, by tests and by scripts/simulate.js.
// Rule IDs (R1…R19) refer to docs/RULES.md.

import {
  PARAMS as P,
  REGION_KEYS,
  START_DATE,
  DEFAULT_LAWS,
  LAWS,
  INITIAL,
  initialRegions,
} from './config.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pctPt = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;

export function daysInMonth({ year, month }) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------
// Creation and public API
// ---------------------------------------------------------------------------

export function createGame(laws = DEFAULT_LAWS) {
  const s = {
    status: 'running',
    date: { ...START_DATE },
    day: 0,
    laws: { ...DEFAULT_LAWS, ...laws },
    government: { money: INITIAL.money },
    economy: {
      grossIncome: INITIAL.grossIncome,
      incomeGrowth: 0,
      priceIndex: 1,
      publicServices: INITIAL.publicServices,
      researchSpent: 0,
      researchEffective: 0,
      tech: 1,
    },
    national: { funds: INITIAL.funds, builders: INITIAL.builders, labour: 1, labourDemand: 0 },
    regions: initialRegions(),
    month: emptyMonth(),
    lastMonth: null,
    history: [],
    news: [],
    lawLog: [],
    score: { total: 0, months: 0, sums: { services: 0, money: 0, housing: 0, equality: 0 }, last: null },
    milestones: { homelessLevel: thresholdIndex(0.026), inDebt: false, shortage: false, techLevel: 0, servicesLow: false },
  };
  s.history.push(historyPoint(s));
  pushNews(s, 'Boas-vindas ao governo. Lisboa e o interior precisam de casas — e o relógio não para.', 'info');
  return s;
}

export function stepDay(s) {
  if (s.status !== 'running') return;
  const dt = 1 / daysInMonth(s.date);
  const ctx = context(s);
  s.national.labour = ctx.labour;
  s.national.labourDemand = ctx.labourDemand;

  for (const key of REGION_KEYS) stepRegion(s, key, dt, ctx);
  publicProgramme(s, dt, ctx);
  stepPeople(s, dt);
  stepFunds(s, dt);
  stepBuilders(s, dt, ctx);
  stepEconomy(s, dt);
  stepBudget(s, dt);
  checkGameOver(s);
  advanceDate(s);
}

export function stepMonths(s, months) {
  const target = s.date.year * 12 + s.date.month + months;
  while (s.status === 'running' && s.date.year * 12 + s.date.month < target) stepDay(s);
}

// R0 — the player approves a law in parliament. It takes effect immediately.
export function setLaw(s, lawId, level) {
  const def = LAWS.find((l) => l.id === lawId);
  if (!def) throw new RangeError(`Lei desconhecida: ${lawId}`);
  if (!Number.isInteger(level) || level < 0 || level >= def.levels.length) {
    throw new RangeError(`Nível inválido para ${lawId}: ${level}`);
  }
  const previous = s.laws[lawId];
  s.laws[lawId] = level;
  if (previous !== level) s.lawLog.push({ date: isoDate(s.date), law: lawId, from: previous, to: level });
  const vote = simulateVote();
  pushNews(
    s,
    `O Parlamento aprova «${def.levels[level].label}» (${def.name}): ${vote.yes} a favor, ${vote.against} contra.`,
    'law',
  );
  return { law: lawId, previous, level, vote };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function householdsOf(r) {
  const H = r.houses;
  return H.ownerOccupied + H.rented + H.publicRented + r.homeless;
}

function landlordsOf(r) {
  const privateHomes = r.houses.rented - r.fund.rented + r.houses.vacant - r.fund.vacant;
  return Math.max(0, privateHomes) / P.landlords.homesPerLandlord;
}

function affordability(rent, income) {
  const R = P.rental;
  return clamp((R.affordabilityMax - rent / income) / R.affordabilitySpan, R.affordabilityFloor, 1);
}

export function indicators(s) {
  let households = 0;
  let homeless = 0;
  for (const key of REGION_KEYS) {
    const r = s.regions[key];
    households += householdsOf(r);
    homeless += r.homeless;
  }
  const sv = savings(s);
  return {
    households,
    homeless,
    homelessRate: homeless / households,
    moneyToLive: moneyToLive(s),
    publicServices: s.economy.publicServices,
    money: s.government.money,
    savings: sv.perMonth,
    inequality: sv.inequality,
  };
}

// R20 — monthly savings per group (in start-year euros) and their inequality (Gini, 0–1).
// Landlords are owners who also collect rent; funds are counted as one saver each.
export function savings(s) {
  const SV = P.savings;
  const I = P.income;
  const income = s.economy.grossIncome;
  const living = income * SV.livingShare;
  let owners = 0;
  let ownerSaved = 0;
  let tenants = 0;
  let tenantSaved = 0;
  let publicTenants = 0;
  let homeless = 0;
  let landlords = 0;
  let rentToLandlords = 0;
  let rentToFunds = 0;
  for (const key of REGION_KEYS) {
    const r = s.regions[key];
    const H = r.houses;
    const m = r.market;
    const ownerCost = I.ownerCostBase + I.ownerCostPriceFactor * m.price;
    owners += H.ownerOccupied;
    ownerSaved += H.ownerOccupied * Math.max(0, income - ownerCost - living);
    tenants += H.rented;
    tenantSaved += H.rented * Math.max(0, income - m.tenantRent - living);
    publicTenants += H.publicRented;
    homeless += r.homeless;
    landlords += landlordsOf(r);
    rentToLandlords += (H.rented - r.fund.rented) * m.tenantRent * SV.landlordNetShare;
    rentToFunds += r.fund.rented * m.tenantRent * SV.fundNetShare;
  }
  const idx = s.economy.priceIndex;
  const owner = ownerSaved / Math.max(1, owners);
  const perMonth = {
    owner: owner / idx,
    tenant: tenantSaved / Math.max(1, tenants) / idx,
    publicTenant: Math.max(0, income - P.publicHousing.rent - living) / idx,
    landlord: (owner + rentToLandlords / Math.max(1, landlords)) / idx,
    fund: s.national.funds > 0 ? rentToFunds / s.national.funds / idx : 0,
    homeless: 0,
  };
  const groups = [
    [homeless, 0],
    [tenants, perMonth.tenant],
    [publicTenants, perMonth.publicTenant],
    [Math.max(0, owners - landlords), perMonth.owner],
    [landlords, perMonth.landlord],
    [s.national.funds, perMonth.fund],
  ].sort((a, b) => a[1] - b[1]);
  const people = groups.reduce((a, [n]) => a + n, 0);
  const saved = groups.reduce((a, [n, v]) => a + n * v, 0);
  let gini = 1;
  let cumulative = 0;
  for (const [n, v] of groups) {
    const share = (n * v) / saved;
    gini -= (n / people) * (2 * cumulative + share);
    cumulative += share;
  }
  return { perMonth, inequality: saved > 0 ? clamp(gini, 0, 1) : 0 };
}

// R15 — average money a household has left after paying for housing, in constant (start-year) euros.
function moneyToLive(s) {
  const I = P.income;
  const income = s.economy.grossIncome;
  let total = 0;
  let n = 0;
  for (const key of REGION_KEYS) {
    const r = s.regions[key];
    const H = r.houses;
    const ownerCost = I.ownerCostBase + I.ownerCostPriceFactor * r.market.price;
    total +=
      H.ownerOccupied * (income - ownerCost) +
      H.rented * (income - r.market.tenantRent) +
      H.publicRented * (income - P.publicHousing.rent) +
      r.homeless * income * I.homelessIncomeShare;
    n += householdsOf(r);
  }
  return total / n / s.economy.priceIndex;
}

// 0 while the budget is positive, rising to 1 as debt reaches services.austerityDebt.
export function austerity(s) {
  return clamp(-s.government.money / P.services.austerityDebt, 0, 1);
}

function coverage(r) {
  const n = householdsOf(r);
  const IF = P.infrastructure;
  return {
    schools: Math.min(1.1, (r.infra.schools * IF.schoolCapacity) / n),
    hospitals: Math.min(1.1, (r.infra.hospitals * IF.hospitalCapacity) / n),
    transport: r.infra.transport / 100,
  };
}

function revenue(s, key, v) {
  if (!v) return;
  s.month.revenue[key] = (s.month.revenue[key] || 0) + v;
  s.government.money += v;
}

function expense(s, key, v) {
  if (!v) return;
  s.month.expenses[key] = (s.month.expenses[key] || 0) + v;
  s.government.money -= v;
}

function flow(s, scope, key, v) {
  const f = s.month.flows[scope];
  f[key] = (f[key] || 0) + v;
}

function emptyMonth() {
  return { revenue: {}, expenses: {}, flows: { city: {}, countryside: {}, national: {} } };
}

// Move `amount` from one pipeline stock to another, carrying the fund-owned share along.
function moveStock(pl, from, to, amount) {
  amount = Math.min(amount, pl[from]);
  if (!(amount > 0)) return 0;
  const fundShare = pl[from] > 0 ? pl[`${from}Fund`] / pl[from] : 0;
  pl[from] -= amount;
  pl[to] += amount;
  pl[`${from}Fund`] -= amount * fundShare;
  pl[`${to}Fund`] += amount * fundShare;
  return amount;
}

function completeStock(pl, stock, amount) {
  amount = Math.min(amount, pl[stock]);
  if (!(amount > 0)) return { total: 0, fund: 0 };
  const fund = pl[stock] > 0 ? (amount * pl[`${stock}Fund`]) / pl[stock] : 0;
  pl[stock] -= amount;
  pl[`${stock}Fund`] -= fund;
  return { total: amount, fund };
}

// R12 — labour needed by every building site vs. builders available.
function context(s) {
  const C = P.construction;
  const tech = s.economy.tech;
  const ctx = {
    tech,
    workNew: C.workNew / tech,
    workReno: C.workRenovation / tech,
    durNew: C.durationNew / Math.sqrt(tech),
    durReno: C.durationRenovation / Math.sqrt(tech),
    demand: {},
  };
  let total = 0;
  for (const key of REGION_KEYS) {
    const pl = s.regions[key].pipeline;
    const d =
      ((pl.newBuilding + pl.publicBuilding) / ctx.durNew) * ctx.workNew +
      ((pl.renoBuilding + pl.publicRenovating) / ctx.durReno) * ctx.workReno;
    ctx.demand[key] = d;
    total += d;
  }
  ctx.labourDemand = total;
  ctx.labour = total > 0 ? Math.min(1, s.national.builders / total) : 1;
  return ctx;
}

// ---------------------------------------------------------------------------
// Regional rules
// ---------------------------------------------------------------------------

function stepRegion(s, key, dt, ctx) {
  const r = s.regions[key];
  const H = r.houses;
  const F = r.fund;
  const pl = r.pipeline;
  const m = r.market;
  const L = s.laws;
  const RR = P.rentRules;
  const income = s.economy.grossIncome;

  // R22 — how far a rent cap holds rents below the shadow market rent
  const RC = P.rentControl;
  m.shadowRent ??= m.rent;
  const controlGap = clamp(1 - m.rent / m.shadowRent, 0, RC.maxGap);

  // R5 — vacant homes are offered for rent and taken by households without a house
  const baseOfferRate = P.rental.offerRate * RR.offer[L.rentRules];
  const offerRate = baseOfferRate * (1 - controlGap) ** RC.offerExponent;
  const offeredPrivate = Math.max(0, H.vacant - F.vacant) * offerRate;
  const offeredFund = F.vacant * offerRate * P.rental.fundOfferFactor;
  const offered = offeredPrivate + offeredFund;
  // What landlords would offer if rents were at the market level (used for the market trend)
  const offeredAtMarket = (Math.max(0, H.vacant - F.vacant) + F.vacant * P.rental.fundOfferFactor) * baseOfferRate;
  // Under a binding cap, new tenants also pay key money under the table (R22)
  const affordable = affordability(m.rent + RC.keyMoneyShare * (m.shadowRent - m.rent), income);
  const seekers = r.homeless * P.rental.searchRate * affordable;
  const housed = Math.min(offered, seekers) * dt;
  if (housed > 0) {
    const viaFund = (housed * offeredFund) / offered;
    H.vacant -= housed;
    H.rented += housed;
    // New tenants pay the new-contract rent, plus key money under a binding cap (R22)
    const newContract = m.rent + RC.keyMoneyShare * (m.shadowRent - m.rent);
    m.tenantRent += ((newContract - m.tenantRent) * housed) / H.rented;
    F.vacant -= viaFund;
    F.rented += viaFund;
    r.homeless -= housed;
    flow(s, key, 'housed', housed);
  }

  // R6 — tenants buy a home (their old rental becomes vacant)
  const priceToIncome = m.price / (12 * income);
  const buyRate = P.purchase.rate * clamp((P.purchase.maxPriceToIncome - priceToIncome) / P.purchase.span, 0, 1);
  const buys = Math.min((H.rented - F.rented) * buyRate * dt, Math.max(0, H.vacant - F.vacant));
  if (buys > 0) {
    H.rented -= buys;
    H.ownerOccupied += buys;
    revenue(s, 'transactionTax', (buys * m.price * P.tax.transactionHome) / 1e6);
    flow(s, key, 'tenantPurchases', buys);
  }

  // R1 — owner households dissolve; the home is inherited and left vacant
  const dissolved = H.ownerOccupied * P.households.dissolutionRate * dt;
  H.ownerOccupied -= dissolved;
  H.vacant += dissolved;

  // R7 — evictions, fund conversions and tenants who can no longer pay
  const evictFactor = RR.evict[L.rentRules];
  const evicted = (H.rented - F.rented) * P.eviction.landlordRate * evictFactor * dt;
  const fundEvicted = F.rented * P.eviction.fundRate * evictFactor * dt;
  const burden = m.tenantRent / income;
  const unpaid =
    H.rented * P.eviction.burdenRate * Math.max(0, (burden - P.eviction.burdenThreshold) / P.eviction.burdenSpan) * dt;
  const unpaidFund = H.rented > 0 ? (unpaid * F.rented) / H.rented : 0;
  // R22 — with rents far below the market, landlords stop renewing contracts and withdraw homes
  const notRenewed = (H.rented - F.rented) * RC.nonRenewalRate * controlGap * dt;
  const leaving = evicted + fundEvicted + unpaid + notRenewed;
  H.rented -= leaving;
  H.vacant += leaving;
  F.rented -= fundEvicted + unpaidFund;
  F.vacant += fundEvicted + unpaidFund;
  r.homeless += leaving;
  flow(s, key, 'evictions', leaving);

  // R8 — degradation
  const vacantDecay = Math.max(0, H.vacant - F.vacant) * P.degradation.vacant[key] * dt;
  H.vacant -= vacantDecay;
  H.degraded += vacantDecay;
  const rentedDecay =
    (H.rented - F.rented) * P.degradation.rented * RR.maintenance[L.rentRules] * (1 + RC.maintenanceGap * controlGap) * dt;
  H.rented -= rentedDecay;
  H.degraded += rentedDecay;
  const publicRate = L.publicHousing >= 1 ? P.degradation.publicMaintained : P.degradation.publicUnmaintained;
  const publicDecay = H.publicRented * publicRate * dt;
  H.publicRented -= publicDecay;
  H.publicDegraded += publicDecay;
  r.homeless += rentedDecay + publicDecay;
  flow(s, key, 'degraded', vacantDecay + rentedDecay + publicDecay);

  // R9 — investment funds buy homes: more funds → more purchases
  const purchases = s.national.funds * P.funds.purchasesPerFund * P.funds.regionShare[key] * dt;
  const src = P.funds.sources[key];
  // Under a binding cap funds avoid tenanted homes and buy empty ones for short-term rental (R22)
  const fromVacant = Math.min(purchases * (src.vacant + src.rented * controlGap), Math.max(0, H.vacant - F.vacant));
  const fromRented = Math.min(purchases * src.rented * (1 - controlGap), Math.max(0, H.rented - F.rented));
  const fromDegraded = Math.min(purchases * src.degraded, H.degraded);
  F.vacant += fromVacant;
  F.rented += fromRented;
  H.degraded -= fromDegraded;
  pl.renoLicensing += fromDegraded;
  pl.renoLicensingFund += fromDegraded;
  const bought = fromVacant + fromRented + fromDegraded;
  revenue(s, 'transactionTax', (bought * m.price * P.tax.transactionInvestor) / 1e6);
  flow(s, key, 'fundPurchases', bought);

  // R10 — private construction starts, renovation starts, licensing and completions
  const C = P.construction;
  const PH = P.privateHousing;
  const pv = L.privateHousing;
  const buildCost = C.cost[key] / Math.sqrt(ctx.tech);
  const margin = clamp((m.price * C.salesNet) / buildCost - 1, 0, 1);
  const fundShare = s.national.funds / (s.national.funds + P.funds.constructionHalf);
  const capital = C.capitalBase + C.capitalFunds * fundShare;
  const starts = Math.min(r.land, r.land * C.startRate[key] * margin * PH.startFactor[pv] * capital * dt);
  r.land -= starts;
  pl.newLicensing += starts;
  pl.newLicensingFund += starts * fundShare;

  const renoStarts =
    H.degraded *
    C.renovationRate *
    RR.renovation[L.rentRules] *
    (1 - controlGap) *
    Math.sqrt(PH.startFactor[pv]) *
    clamp(0.5 + margin, 0.2, 1.5) *
    dt;
  H.degraded -= renoStarts;
  pl.renoLicensing += renoStarts;

  r.land += (H.ownerOccupied + H.rented + H.vacant + H.publicRented) * PH.rezoning[key][pv] * dt;

  const licence = PH.licenceMonths[pv];
  if (Number.isFinite(licence)) {
    moveStock(pl, 'newLicensing', 'newBuilding', (pl.newLicensing / licence) * dt);
    moveStock(pl, 'renoLicensing', 'renoBuilding', (pl.renoLicensing / (licence * C.renovationLicenceFactor)) * dt);
  }
  const publicLicensed = (pl.publicLicensing / P.publicHousing.licenceMonths) * dt;
  pl.publicLicensing -= publicLicensed;
  pl.publicBuilding += publicLicensed;

  const newDone = completeStock(pl, 'newBuilding', (pl.newBuilding / ctx.durNew) * ctx.labour * dt);
  const renoDone = completeStock(pl, 'renoBuilding', (pl.renoBuilding / ctx.durReno) * ctx.labour * dt);
  H.vacant += newDone.total + renoDone.total;
  F.vacant += newDone.fund + renoDone.fund;
  const publicNew = (pl.publicBuilding / ctx.durNew) * ctx.labour * dt;
  const publicReno = (pl.publicRenovating / ctx.durReno) * ctx.labour * dt;
  pl.publicBuilding -= publicNew;
  pl.publicRenovating -= publicReno;
  assignPublicHomes(s, key, publicNew + publicReno);
  flow(s, key, 'completedPrivate', newDone.total + renoDone.total);
  flow(s, key, 'completedPublic', publicNew + publicReno);

  // R16 — new neighbourhoods come with roads (developers pay double when deregulated)
  const IF = P.infrastructure;
  const newHomes = newDone.total + publicNew;
  r.infra.transport = Math.min(
    IF.transportMax,
    r.infra.transport + newHomes * IF.transportPerNewHome[key] * (pv === 4 ? 2 : 1),
  );

  // R14 — rents follow demand vs. supply (capped by rent rules); prices follow rents, funds and supply
  const MK = P.market;
  // Households that cannot afford the current rent still push rents up, but less (priceTakerDemandShare).
  // Short-term rental / foreign demand grows with the number of investment funds.
  const external =
    MK.externalDemand[key] *
    MK.externalDemandByInvestment[L.foreignInvestment] *
    (0.5 + (0.5 * s.national.funds) / MK.externalDemandFundsReference);
  const demand =
    r.homeless * P.rental.searchRate * (MK.priceTakerDemandShare + (1 - MK.priceTakerDemandShare) * affordable) +
    external;
  const pressure = Math.log(Math.max(1, demand) / Math.max(1, offeredAtMarket));
  const sensitivity = pressure > 0 ? MK.rentSensitivity : MK.rentSensitivityDown;
  // Momentum: the market trend moves gradually toward what demand and supply justify; rent rules cap it at once
  const trendTarget = clamp(MK.rentDrift + sensitivity * pressure, MK.rentMaxFall, MK.rentMaxRise);
  m.rentTrend += (trendTarget - m.rentTrend) * (dt / MK.rentMomentumMonths);
  // R22 — the shadow market rent follows the uncapped trend; when a cap is lifted rents catch up with it
  m.shadowRent *= 1 + Math.max(MK.rentMaxFall, m.rentTrend) * dt;
  const catchUp = RC.catchUp * Math.log(m.shadowRent / m.rent);
  const rentGrowth = clamp(m.rentTrend + catchUp, MK.rentMaxFall, RR.cap[L.rentRules]);
  m.rent *= 1 + rentGrowth * dt;
  m.shadowRent = clamp(m.shadowRent, m.rent, m.rent / (1 - RC.maxGap));
  const gap = m.rent - m.tenantRent;
  m.tenantRent += gap * (gap > 0 ? RR.renewal[L.rentRules] : MK.tenantRentDown) * dt;

  const stock = H.ownerOccupied + H.rented + H.vacant;
  const fundRate = bought / dt / stock;
  const supplyRate = (newDone.total + renoDone.total + publicNew + publicReno) / dt / stock;
  const priceTarget =
    MK.priceDrift +
    MK.priceRentLink * rentGrowth +
    MK.priceByInvestment[L.foreignInvestment] +
    MK.priceFundPressure * fundRate -
    MK.priceSupplyRelief * supplyRate;
  m.priceTrend += (priceTarget - m.priceTrend) * (dt / MK.priceMomentumMonths);
  const priceGrowth = clamp(m.priceTrend, MK.priceMin, MK.priceMax);
  m.price *= 1 + priceGrowth * dt;
  m.rentGrowth = rentGrowth;
  m.priceGrowth = priceGrowth;
}

// R11 — finished public homes go to households without a house first, then to
// private tenants (freeing their rental); any remainder is taken by newly formed households.
function assignPublicHomes(s, key, units) {
  if (!(units > 0)) return;
  const r = s.regions[key];
  const H = r.houses;
  const fromHomeless = Math.min(units, r.homeless);
  r.homeless -= fromHomeless;
  const fromTenants = Math.min(units - fromHomeless, Math.max(0, H.rented - r.fund.rented));
  H.rented -= fromTenants;
  H.vacant += fromTenants;
  H.publicRented += units;
  flow(s, key, 'publicAssigned', units);
}

// R11 — public housing programme: renovate, build on free land, or buy vacant homes.
function publicProgramme(s, dt, ctx) {
  const PHB = P.publicHousing;
  const budget = PHB.budget[s.laws.publicHousing] * dt * 1e6;
  if (budget <= 0) return;
  const { city, countryside } = s.regions;
  const homeless = city.homeless + countryside.homeless;
  const cityShare = clamp(homeless > 0 ? city.homeless / homeless : 0.5, PHB.minRegionShare, 1 - PHB.minRegionShare);
  const sq = Math.sqrt(ctx.tech);

  for (const key of REGION_KEYS) {
    const r = s.regions[key];
    const H = r.houses;
    const pl = r.pipeline;
    let money = budget * (key === 'city' ? cityShare : 1 - cityShare);
    let spent = 0;

    const renoCost = PHB.renovationCost[key] / sq;
    const renovated = Math.min(H.publicDegraded, (money * PHB.renovationBudgetShare) / renoCost);
    H.publicDegraded -= renovated;
    pl.publicRenovating += renovated;
    spent += renovated * renoCost;
    money -= renovated * renoCost;

    const newCost = (P.construction.cost[key] * PHB.newCostFactor) / sq;
    const built = Math.min(r.land, money / newCost);
    r.land -= built;
    pl.publicLicensing += built;
    spent += built * newCost;
    money -= built * newCost;

    if (money > 1) {
      const acquired = Math.min(Math.max(0, H.vacant - r.fund.vacant), money / r.market.price);
      H.vacant -= acquired;
      assignPublicHomes(s, key, acquired);
      spent += acquired * r.market.price;
      flow(s, key, 'publicAcquired', acquired);
    }
    expense(s, 'publicHousing', spent / 1e6);
  }
}

// ---------------------------------------------------------------------------
// National rules
// ---------------------------------------------------------------------------

function stepPeople(s, dt) {
  const { city, countryside } = s.regions;
  const L = s.laws;

  // R1 — young people form new households, still without a house; half the rural youth move to the city
  const formedCity = householdsOf(city) * P.households.formationRate * dt;
  const formedCountry = householdsOf(countryside) * P.households.formationRate * dt;
  const toCity = formedCountry * P.households.countrysideYouthToCity;
  city.homeless += formedCity + toCity;
  countryside.homeless += formedCountry - toCity;

  // R2 — immigration: more arrivals → more builders, but also more households without a house
  const IM = P.immigration;
  const ind = indicators(s);
  const attraction =
    clamp(ind.moneyToLive / IM.attractionReference, 0.4, 1.4) * Math.sqrt(Math.max(0, s.economy.publicServices) / 66);
  const arrivals = IM.rate[L.immigration] * ind.households * attraction * dt;
  city.homeless += arrivals * IM.cityShare;
  countryside.homeless += arrivals * (1 - IM.cityShare);
  s.national.builders += arrivals * IM.builderShare;
  expense(s, 'integration', (arrivals * IM.integrationCost) / 1e6);
  flow(s, 'national', 'arrivals', arrivals);

  // R3 — some households without a house give up and emigrate
  for (const key of REGION_KEYS) {
    const r = s.regions[key];
    const leaving = r.homeless * P.emigration.homelessRate * dt;
    r.homeless -= leaving;
    flow(s, 'national', 'emigrants', leaving);
  }

  // R4 — when the city is much more expensive, people without a house move to the countryside (if transport allows)
  const gap = (city.market.rent - countryside.market.rent) / s.economy.grossIncome;
  const moving =
    city.homeless *
    P.internalMigration.rate *
    clamp(gap / P.internalMigration.burdenSpan, 0, 1) *
    (countryside.infra.transport / 100) *
    dt;
  city.homeless -= moving;
  countryside.homeless += moving;
  flow(s, 'national', 'movedToCountryside', moving);
}

// R9 — the number of funds follows the foreign investment law and rental yields.
function stepFunds(s, dt) {
  const N = s.national;
  const city = s.regions.city;
  const growth = P.foreignInvestment.fundGrowth[s.laws.foreignInvestment];
  const yieldCity = (city.market.rent * 12) / city.market.price;
  const profit = clamp(yieldCity / P.funds.yieldReference, 0.4, 1.6);
  // Growth slows down as funds already own a large share of the rental stock.
  let fundHomes = 0;
  let rentalStock = 0;
  for (const key of REGION_KEYS) {
    const r = s.regions[key];
    fundHomes += r.fund.rented + r.fund.vacant;
    rentalStock += r.houses.rented + r.houses.vacant;
  }
  const room = Math.max(0, 1 - fundHomes / rentalStock / P.funds.saturationShare);
  let delta = N.funds * growth * (growth > 0 ? profit * room : 1) * dt;
  if (growth > 0) delta += P.funds.minEntry * dt;
  if (delta < 0 && N.funds > 0) {
    // Leaving funds sell their homes and projects to local landlords and developers.
    const share = Math.min(1, -delta / N.funds);
    for (const key of REGION_KEYS) {
      const r = s.regions[key];
      const sold = (r.fund.rented + r.fund.vacant) * share;
      r.fund.rented *= 1 - share;
      r.fund.vacant *= 1 - share;
      for (const k of ['newLicensingFund', 'newBuildingFund', 'renoLicensingFund', 'renoBuildingFund']) {
        r.pipeline[k] *= 1 - share;
      }
      flow(s, key, 'fundSales', sold);
    }
  }
  N.funds = Math.max(0, N.funds + delta);
}

// R12 — builders join when there is more work than workers and leave when sites are idle.
function stepBuilders(s, dt, ctx) {
  const N = s.national;
  const B = P.builders;
  const utilisation = ctx.labourDemand / N.builders;
  let change = -N.builders * B.retirement;
  if (utilisation > 1) change += N.builders * B.domesticEntry * Math.min(1, utilisation - 1);
  else if (utilisation < B.lowUtilisation) {
    change -= (N.builders * B.exitRate * (B.lowUtilisation - utilisation)) / B.lowUtilisation;
  }
  N.builders = Math.max(B.minimum, N.builders + change * dt);
}

function stepEconomy(s, dt) {
  const E = s.economy;
  const L = s.laws;

  // R13 — research money matures slowly into construction technology
  const IN = P.innovation;
  const research = IN.budget[L.innovation] * dt;
  expense(s, 'innovation', research);
  E.researchSpent += research;
  E.researchEffective += ((E.researchSpent - E.researchEffective) / IN.lagMonths) * dt;
  E.tech = 1 + IN.maxGain * (1 - Math.exp(-E.researchEffective / IN.scale));

  // R15 — gross income growth
  const I = P.income;
  const { homelessRate } = indicators(s);
  const growth =
    I.base +
    I.immigrationBoost[L.immigration] +
    P.foreignInvestment.incomeBoost[L.foreignInvestment] +
    (I.servicesEffect * (E.publicServices - 60)) / 20 -
    I.homelessDrag * Math.max(0, homelessRate - I.homelessDragThreshold) +
    I.techEffect * (E.tech - 1);
  E.grossIncome *= 1 + growth * dt;
  E.incomeGrowth = growth;
  E.priceIndex *= 1 + I.inflation * dt;

  // R17 — public services quality drifts toward its target
  E.publicServices += (servicesTarget(s) - E.publicServices) * P.services.adjustRate * dt;
}

export function servicesTarget(s) {
  const S = P.services;
  const W = S.weights;
  let n = 0;
  let schools = 0;
  let hospitals = 0;
  let transport = 0;
  let homeless = 0;
  for (const key of REGION_KEYS) {
    const r = s.regions[key];
    const h = householdsOf(r);
    const c = coverage(r);
    n += h;
    schools += c.schools * h;
    hospitals += c.hospitals * h;
    transport += c.transport * h;
    homeless += r.homeless;
  }
  const spending = S.spendingNormal - (S.spendingNormal - S.spendingAusterity) * austerity(s);
  const target =
    W.spending * spending +
    (W.schools * schools) / n +
    (W.hospitals * hospitals) / n +
    (W.transport * transport) / n -
    (S.homelessPenalty * homeless) / n;
  return clamp(target, 0, 100);
}

// R18 — recurring government revenue and spending (R16 transport investment included).
function stepBudget(s, dt) {
  const L = s.laws;
  const T = P.tax;
  const S = P.services;
  const IF = P.infrastructure;
  const income = s.economy.grossIncome;
  let housed = 0;
  let homeless = 0;
  let propertyValue = 0;
  let publicRented = 0;
  let upkeep = 0;
  for (const key of REGION_KEYS) {
    const r = s.regions[key];
    const H = r.houses;
    homeless += r.homeless;
    housed += householdsOf(r) - r.homeless;
    propertyValue += (H.ownerOccupied + H.rented + H.vacant) * r.market.price;
    publicRented += H.publicRented;
    upkeep += r.infra.schools * IF.schoolUpkeep + r.infra.hospitals * IF.hospitalUpkeep + r.infra.transport * IF.transportUpkeep;
  }
  const cut = austerity(s);
  // Public wages and benefits follow incomes.
  const costIndex = income / INITIAL.grossIncome;

  revenue(s, 'incomeTax', (housed * income * T.income * dt) / 1e6);
  revenue(s, 'propertyTax', (propertyValue * T.property * dt) / 1e6);
  revenue(s, 'publicRents', (publicRented * P.publicHousing.rent * dt) / 1e6);
  revenue(s, 'investmentFees', P.foreignInvestment.fees[L.foreignInvestment] * dt);

  const servicesCost = ((housed + homeless) * S.costPerHousehold * costIndex * dt) / 1e6;
  expense(s, 'publicServices', servicesCost * (1 - S.austerityCut * cut));
  expense(s, 'infrastructure', upkeep * (1 - 0.5 * cut) * dt);
  if (s.government.money < 0) expense(s, 'debtInterest', -s.government.money * S.debtInterest * dt);
  expense(s, 'homelessSupport', (homeless * S.homelessSupport * costIndex * dt) / 1e6);
  if (L.publicHousing >= 1) expense(s, 'publicHousing', (publicRented * P.publicHousing.maintenanceCost * dt) / 1e6);
  expense(s, 'developerIncentives', P.privateHousing.incentives[L.privateHousing] * dt);

  for (const key of REGION_KEYS) {
    const infra = s.regions[key].infra;
    for (const p of infra.projects) expense(s, 'infrastructure', p.costPerMonth * dt);
    if (cut > IF.transportDecayAusterity) {
      infra.transport = Math.max(0, infra.transport - IF.transportDecay * dt);
    } else if (s.government.money > IF.reserve && infra.transport < IF.transportMax) {
      expense(s, 'infrastructure', IF.transportInvestCost * dt);
      infra.transport = Math.min(IF.transportMax, infra.transport + IF.transportInvestGrowth * dt);
    }
  }
}

// R16 — schools and hospitals: progress projects, open finished ones, plan new ones.
function progressInfrastructure(s) {
  const IF = P.infrastructure;
  const sq = Math.sqrt(s.economy.tech);
  for (const key of REGION_KEYS) {
    const r = s.regions[key];
    for (const p of r.infra.projects) p.monthsLeft -= 1;
    for (const p of r.infra.projects.filter((p) => p.monthsLeft <= 0)) {
      r.infra[p.type === 'school' ? 'schools' : 'hospitals'] += 1;
      pushNews(s, `Abre ${infraName(r, p.type)} ${r.where}.`, 'good');
    }
    r.infra.projects = r.infra.projects.filter((p) => p.monthsLeft > 0);

    const n = householdsOf(r);
    const plan = (type, count, capacity, cost, months) => {
      if ((count * capacity) / n >= IF.targetCoverage) return;
      if (r.infra.projects.some((p) => p.type === type)) return;
      if (s.government.money - cost < IF.reserve) return;
      // The cost is paid month by month while the project is being built (see stepBudget).
      const duration = Math.ceil(months / sq);
      r.infra.projects.push({ type, monthsLeft: duration, months: duration, costPerMonth: cost / duration });
      pushNews(s, `Começam as obras de ${infraName(r, type)} ${r.where} (${cost} M€).`, 'info');
    };
    plan('school', r.infra.schools, IF.schoolCapacity, IF.schoolCost, IF.schoolMonths);
    plan('hospital', r.infra.hospitals, IF.hospitalCapacity, IF.hospitalCost, IF.hospitalMonths);
  }
}

function infraName(r, type) {
  return type === 'school' ? 'uma nova escola' : r.hospitalName === 'hospital' ? 'um novo hospital' : `um novo ${r.hospitalName}`;
}

// R19 — game over.
function checkGameOver(s) {
  if (s.government.money < P.gameOver.debtLimit) {
    s.status = 'bankrupt';
    pushNews(s, 'O Estado está falido. Os credores internacionais assumem o orçamento.', 'bad');
  } else if (indicators(s).homelessRate > P.gameOver.homelessLimit) {
    s.status = 'collapse';
    pushNews(s, 'Um em cada quatro agregados não tem casa. O governo cai.', 'bad');
  }
}

// ---------------------------------------------------------------------------
// Calendar, history and news
// ---------------------------------------------------------------------------

function advanceDate(s) {
  s.day += 1;
  const d = s.date;
  d.day += 1;
  if (d.day > daysInMonth(d)) {
    d.day = 1;
    d.month += 1;
    if (d.month > 11) {
      d.month = 0;
      d.year += 1;
    }
    closeMonth(s);
  }
}

function closeMonth(s) {
  s.lastMonth = summarizeMonth(s.month);
  s.month = emptyMonth();
  progressInfrastructure(s);
  s.history.push(historyPoint(s));
  if (s.history.length > 600) s.history.shift();
  scoreMonth(s);
  monthlyNews(s);
  if (s.status === 'running' && s.score.months >= P.game.maxMonths) {
    s.status = 'finished';
    pushNews(s, `Fim do mandato: 20 anos de governo e ${Math.round(s.score.total)} pontos.`, 'good');
  }
}

// R21 — every month the quality of life earns 0–100 points; the score is their sum.
export function monthPoints(s) {
  const G = P.game;
  const ind = indicators(s);
  const [lo, hi] = G.moneyToLiveRange;
  const parts = {
    services: clamp(ind.publicServices, 0, 100),
    money: 100 * clamp((ind.moneyToLive - lo) / (hi - lo), 0, 1),
    housing: 100 * clamp(1 - ind.homelessRate / G.homelessZero, 0, 1),
    equality: 100 * (1 - ind.inequality),
  };
  return { ...parts, points: (parts.services + parts.money + parts.housing + parts.equality) / 4 };
}

function scoreMonth(s) {
  const sc = s.score;
  const m = monthPoints(s);
  sc.total += m.points;
  sc.months += 1;
  for (const k of Object.keys(sc.sums)) sc.sums[k] += m[k];
  sc.last = m;
}

function isoDate(d) {
  return `${d.year}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

function summarizeMonth(month) {
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const totalRevenue = sum(month.revenue);
  const totalExpenses = sum(month.expenses);
  return { ...month, totalRevenue, totalExpenses, balance: totalRevenue - totalExpenses };
}

function historyPoint(s) {
  const ind = indicators(s);
  const { city, countryside } = s.regions;
  return {
    year: s.date.year,
    month: s.date.month,
    money: s.government.money,
    publicServices: s.economy.publicServices,
    moneyToLive: ind.moneyToLive,
    homelessRate: ind.homelessRate,
    homeless: ind.homeless,
    inequality: ind.inequality,
    rentCity: city.market.rent,
    rentCountryside: countryside.market.rent,
    priceCity: city.market.price,
    priceCountryside: countryside.market.price,
    funds: s.national.funds,
    builders: s.national.builders,
    tech: s.economy.tech,
  };
}

const HOMELESS_THRESHOLDS = [0.03, 0.05, 0.08, 0.12, 0.18];
function thresholdIndex(rate) {
  return HOMELESS_THRESHOLDS.filter((t) => rate >= t).length;
}

function pushNews(s, text, tone = 'info') {
  s.news.unshift({ date: isoDate(s.date), text, tone });
  if (s.news.length > 40) s.news.length = 40;
}

function monthlyNews(s) {
  const ind = indicators(s);
  const M = s.milestones;
  const pct = pctPt;

  const level = thresholdIndex(ind.homelessRate);
  if (level > M.homelessLevel) {
    pushNews(s, `${pct(ind.homelessRate)} dos agregados já não têm casa própria.`, 'bad');
  } else if (level < M.homelessLevel) {
    pushNews(s, `Menos agregados sem casa: ${pct(ind.homelessRate)}.`, 'good');
  }
  M.homelessLevel = level;

  const inDebt = s.government.money < 0;
  if (inDebt !== M.inDebt) {
    pushNews(
      s,
      inDebt
        ? 'O orçamento está no vermelho. A austeridade corta nos serviços públicos e na manutenção das estradas.'
        : 'As contas públicas voltaram a ser positivas.',
      inDebt ? 'bad' : 'good',
    );
    M.inDebt = inDebt;
  }

  const shortage = s.national.labour < 0.8;
  if (shortage !== M.shortage) {
    pushNews(
      s,
      shortage
        ? 'As obras param: faltam trabalhadores da construção.'
        : 'As obras voltaram a ter trabalhadores suficientes.',
      shortage ? 'bad' : 'good',
    );
    M.shortage = shortage;
  }

  const techLevel = [1.1, 1.25, 1.5, 1.75].filter((t) => s.economy.tech >= t).length;
  if (techLevel > M.techLevel) {
    pushNews(s, `Inovação na construção: as casas fazem-se agora ${Math.round((s.economy.tech - 1) * 100)}% mais depressa.`, 'good');
    M.techLevel = techLevel;
  }

  const capGap = 1 - s.regions.city.market.rent / (s.regions.city.market.shadowRent ?? s.regions.city.market.rent);
  const bigGap = capGap > 0.2;
  if (bigGap !== !!M.bigRentGap) {
    pushNews(
      s,
      bigGap
        ? `As rendas em Lisboa estão ${Math.round(capGap * 100)}% abaixo do mercado: senhorios retiram casas do arrendamento e deixam de as manter.`
        : 'As rendas em Lisboa voltaram a estar perto do valor de mercado.',
      bigGap ? 'bad' : 'good',
    );
    M.bigRentGap = bigGap;
  }

  const servicesLow = s.economy.publicServices < 50;
  if (servicesLow !== M.servicesLow) {
    pushNews(
      s,
      servicesLow ? 'Escolas e hospitais sobrecarregados: serviços públicos abaixo de 50.' : 'Os serviços públicos recuperam acima de 50.',
      servicesLow ? 'bad' : 'good',
    );
    M.servicesLow = servicesLow;
  }

  const flows = s.lastMonth.flows;
  const fundBuys = (flows.city.fundPurchases || 0) + (flows.countryside.fundPurchases || 0);
  if (s.date.month % 3 === 0 && fundBuys > 150) {
    pushNews(s, `Os fundos de investimento compraram ${Math.round(fundBuys)} casas no último mês.`, 'info');
  }

  if (s.date.month === 0 && s.history.length > 12) {
    const prev = s.history[s.history.length - 13];
    const now = s.history[s.history.length - 1];
    const change = (a, b) => `${b >= a ? '+' : '−'}${Math.abs(((b - a) / a) * 100).toFixed(1).replace('.', ',')}%`;
    pushNews(
      s,
      `${s.date.year - 1} em revista: rendas ${change(prev.rentCity, now.rentCity)} em Lisboa e ${change(prev.rentCountryside, now.rentCountryside)} no interior; ${pct(now.homelessRate)} sem casa.`,
      'info',
    );
  }
}

function simulateVote() {
  const seats = 230;
  const yes = 116 + Math.floor(Math.random() * 70);
  const abstain = Math.floor(Math.random() * Math.min(12, seats - yes));
  return { seats, yes, against: seats - yes - abstain, abstain };
}

export function formatDate({ year, month, day }) {
  return `${day} de ${MONTH_NAMES[month]} de ${year}`;
}

// ---------------------------------------------------------------------------
// View model sent to the browser
// ---------------------------------------------------------------------------

export function view(s) {
  const ctx = context(s);
  const ind = indicators(s);
  const dim = daysInMonth(s.date);
  const current = summarizeMonth(s.month);
  return {
    status: s.status,
    date: { ...s.date, label: formatDate(s.date), daysInMonth: dim },
    laws: { ...s.laws },
    indicators: ind,
    government: {
      money: s.government.money,
      austerity: austerity(s),
      lastMonth: s.lastMonth && {
        revenue: s.lastMonth.revenue,
        expenses: s.lastMonth.expenses,
        totalRevenue: s.lastMonth.totalRevenue,
        totalExpenses: s.lastMonth.totalExpenses,
        balance: s.lastMonth.balance,
      },
      currentMonthBalance: current.balance,
    },
    economy: { ...s.economy, servicesTarget: servicesTarget(s) },
    quality: monthPoints(s),
    national: {
      funds: s.national.funds,
      builders: s.national.builders,
      labour: ctx.labour,
      labourDemand: ctx.labourDemand,
      lastMonth: s.lastMonth?.flows.national ?? {},
    },
    regions: Object.fromEntries(REGION_KEYS.map((key) => [key, regionView(s, key, ctx)])),
    history: s.history.slice(-60),
    news: s.news,
    score: scoreView(s),
    lawLog: s.lawLog,
  };
}

export function scoreView(s) {
  const sc = s.score;
  const n = Math.max(1, sc.months);
  return {
    total: sc.total,
    months: sc.months,
    maxMonths: P.game.maxMonths,
    averages: Object.fromEntries(Object.entries(sc.sums).map(([k, v]) => [k, v / n])),
    last: sc.last,
  };
}

function regionView(s, key, ctx) {
  const r = s.regions[key];
  const H = r.houses;
  const pl = r.pipeline;
  const cov = coverage(r);
  const working = Math.min(s.national.builders, ctx.demand[key] * ctx.labour);
  return {
    key,
    name: r.name,
    houses: { ...H },
    fund: { ...r.fund },
    land: r.land,
    pipeline: {
      privateNew: pl.newBuilding,
      privateRenovation: pl.renoBuilding,
      publicNew: pl.publicBuilding,
      publicRenovation: pl.publicRenovating,
      underConstruction: pl.newBuilding + pl.renoBuilding + pl.publicBuilding + pl.publicRenovating,
      newAwaitingLicence: pl.newLicensing + pl.publicLicensing,
      renovationAwaitingLicence: pl.renoLicensing,
    },
    people: {
      households: householdsOf(r),
      homeless: r.homeless,
      owners: H.ownerOccupied,
      privateTenants: H.rented,
      publicTenants: H.publicRented,
      landlords: landlordsOf(r),
      funds: s.national.funds,
      fundHomes: r.fund.rented + r.fund.vacant + pl.renoLicensingFund + pl.renoBuildingFund + pl.newBuildingFund,
      builders: working,
    },
    infra: {
      schools: r.infra.schools,
      hospitals: r.infra.hospitals,
      transport: r.infra.transport,
      schoolCoverage: cov.schools,
      hospitalCoverage: cov.hospitals,
      projects: r.infra.projects.map((p) => ({ ...p })),
    },
    market: {
      rent: r.market.rent,
      shadowRent: r.market.shadowRent ?? r.market.rent,
      tenantRent: r.market.tenantRent,
      price: r.market.price,
      rentGrowthYear: (1 + r.market.rentGrowth) ** 12 - 1,
      priceGrowthYear: (1 + r.market.priceGrowth) ** 12 - 1,
    },
    lastMonth: s.lastMonth?.flows[key] ?? {},
  };
}
