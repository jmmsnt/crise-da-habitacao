// Simulation parameters, law definitions and the initial state.
// Every number here is documented in docs/RULES.md — the rule IDs (R1, R2, …)
// in the comments match the sections of that document. Change both together.

export const REGION_KEYS = ['city', 'countryside'];

export const START_DATE = { year: 2027, month: 0, day: 1 };

// One real minute is one game month at 1x speed.
export const MONTH_MS = 60_000;

// ---------------------------------------------------------------------------
// Laws (R0). Each law has 5 levels; `default` is the status quo at game start.
// ---------------------------------------------------------------------------
export const LAWS = [
  {
    id: 'immigration',
    name: 'Imigração',
    summary: 'Quantos novos agregados se podem instalar no país. Quem chega traz construtores e impostos, mas cada novo agregado precisa de uma casa.',
    default: 3,
    levels: [
      { label: 'Fronteiras fechadas', effect: 'Sem chegadas. Os construtores reformam-se aos poucos e a economia encolhe.' },
      { label: 'Restritiva', effect: '≈0,25% mais agregados por ano. Poucos construtores novos e a economia cresce menos.' },
      { label: 'Moderada', effect: '≈0,7% mais agregados por ano.' },
      { label: 'Aberta', effect: '≈1,2% mais agregados por ano. Mais construtores, mais pessoas à procura de casa.' },
      { label: 'Muito aberta', effect: '≈1,9% mais agregados por ano. Muita mão de obra e muita procura de casas.' },
    ],
  },
  {
    id: 'foreignInvestment',
    name: 'Investimento estrangeiro',
    summary: 'Regras para fundos de investimento e capital estrangeiro. Os fundos financiam construção e pagam impostos, mas também compram casas existentes e deixam muitas vazias.',
    default: 3,
    levels: [
      { label: 'Proibido', effect: 'Os fundos saem depressa e vendem as suas casas. Menos capital para construir.' },
      { label: 'Restrito', effect: 'Os fundos saem lentamente.' },
      { label: 'Neutro', effect: 'Os fundos crescem devagar.' },
      { label: 'Incentivado', effect: 'Os fundos crescem ≈1,5%/mês. +0,8 M€/mês em taxas.' },
      { label: 'Vistos gold e benefícios fiscais', effect: 'Os fundos crescem ≈3,5%/mês. +2 M€/mês em taxas e forte pressão nos preços.' },
    ],
  },
  {
    id: 'publicHousing',
    name: 'Habitação pública',
    summary: 'Programa do Estado para reabilitar casas públicas degradadas, construir casas novas e comprar casas vazias para arrendamento público.',
    default: 1,
    levels: [
      { label: 'Nenhuma', effect: 'Sem manutenção: as casas públicas degradam-se 3× mais depressa.' },
      { label: 'Só manutenção', effect: 'As casas públicas são mantidas. Não há casas novas.' },
      { label: 'Programa modesto', effect: '5 M€/mês para reabilitar e construir casas públicas.' },
      { label: 'Programa ambicioso', effect: '12 M€/mês para reabilitar e construir casas públicas.' },
      { label: 'Programa massivo', effect: '20 M€/mês para reabilitar e construir casas públicas.' },
    ],
  },
  {
    id: 'privateHousing',
    name: 'Habitação privada',
    summary: 'Licenciamento e incentivos à construção e reabilitação privadas. Licenças mais rápidas trazem mais casas mais cedo; os benefícios fiscais custam dinheiro.',
    default: 1,
    levels: [
      { label: 'Construção congelada', effect: 'Não são emitidas novas licenças privadas.' },
      { label: 'Licenciamento lento', effect: 'As licenças demoram 18 meses. Poucos promotores começam obras.' },
      { label: 'Licenciamento normal', effect: 'As licenças demoram 12 meses.' },
      { label: 'Licenciamento rápido', effect: 'As licenças demoram 6 meses e há terrenos que passam a urbanizáveis. Custa 1,5 M€/mês.' },
      { label: 'Desregulado + benefícios fiscais', effect: 'As licenças demoram 3 meses e muitos terrenos passam a urbanizáveis. Custa 4 M€/mês.' },
    ],
  },
  {
    id: 'innovation',
    name: 'Inovação na construção',
    summary: 'Investigação em construção industrializada e modular. Demora a dar frutos (cerca de dois anos), mas torna cada casa mais rápida e mais barata de construir.',
    default: 1,
    levels: [
      { label: 'Nenhuma', effect: 'Sem investigação. A tecnologia de construção não avança.' },
      { label: 'Investigação básica', effect: '0,5 M€/mês.' },
      { label: 'Programa financiado', effect: '2 M€/mês.' },
      { label: 'Prioridade nacional', effect: '4 M€/mês.' },
      { label: 'Aposta máxima', effect: '7 M€/mês.' },
    ],
  },
  {
    id: 'rentRules',
    name: 'Regras do arrendamento',
    summary: 'Quanto podem os senhorios aumentar as rendas e com que facilidade podem terminar contratos. Regras apertadas protegem os inquilinos, mas os senhorios arrendam menos casas e cuidam menos delas.',
    default: 3,
    levels: [
      { label: 'Rendas congeladas', effect: 'As rendas não podem subir. Os senhorios deixam casas vazias e deixam de as manter.' },
      { label: 'Teto apertado (2%/ano)', effect: 'Poucos despejos, mas menos casas para arrendar.' },
      { label: 'Indexadas à inflação', effect: 'As rendas podem subir ≈2,2%/ano (coeficiente legal de 2026).' },
      { label: 'Regulação ligeira (8%/ano)', effect: 'As rendas podem subir até ≈8%/ano. Mais despejos.' },
      { label: 'Mercado livre', effect: 'Sem teto. Mais casas para arrendar, mas muitos despejos.' },
    ],
  },
];

export const DEFAULT_LAWS = Object.fromEntries(LAWS.map((l) => [l.id, l.default]));

// ---------------------------------------------------------------------------
// Parameters. Rates are per month unless stated otherwise. Money in €.
// Arrays indexed by law level 0..4.
// ---------------------------------------------------------------------------
export const PARAMS = {
  // R1 — household formation and dissolution
  households: {
    formationRate: 0.0005,
    countrysideYouthToCity: 0.5,
    dissolutionRate: 0.0003,
  },

  // R2 — immigration
  immigration: {
    rate: [0, 0.0002, 0.0006, 0.001, 0.0016],
    cityShare: 0.65,
    builderShare: 0.15,
    integrationCost: 1000,
    attractionReference: 1_700,
  },

  // R3 — emigration
  emigration: { homelessRate: 0.015 },

  // R4 — internal migration (city → countryside)
  internalMigration: { rate: 0.02, burdenSpan: 0.3 },

  // R5 — rental market: vacant homes offered and matched with households without a house
  rental: {
    offerRate: 0.024, // many non-occupied homes are second homes or short-term rentals, not on offer
    fundOfferFactor: 0.5,
    searchRate: 0.2,
    affordabilityMax: 0.55,
    affordabilitySpan: 0.25,
    affordabilityFloor: 0.03,
  },

  // R6 — tenants buying a home
  purchase: { rate: 0.003, maxPriceToIncome: 16, span: 8 },

  // R7 — evictions and tenants who can no longer pay
  eviction: {
    landlordRate: 0.0007,
    fundRate: 0.008,
    burdenRate: 0.003,
    burdenThreshold: 0.25,
    burdenSpan: 0.13,
  },

  // R8 — degradation
  degradation: {
    vacant: { city: 0.0015, countryside: 0.003 },
    rented: 0.0004,
    publicUnmaintained: 0.002,
    publicMaintained: 0.0006,
  },

  // R9 — investment funds
  funds: {
    purchasesPerFund: 3,
    regionShare: { city: 0.72, countryside: 0.28 },
    sources: {
      city: { vacant: 0.45, rented: 0.35, degraded: 0.2 },
      countryside: { vacant: 0.45, rented: 0.2, degraded: 0.35 },
    },
    yieldReference: 0.04,
    constructionHalf: 60,
    minEntry: 0.05,
    saturationShare: 0.4,
  },

  // R10 — private construction and renovation
  construction: {
    cost: { city: 260_000, countryside: 62_000 },
    salesNet: 0.85,
    startRate: { city: 0.04, countryside: 0.006 },
    renovationRate: 0.004,
    renovationLicenceFactor: 1 / 3,
    capitalBase: 0.8,
    capitalFunds: 0.4,
    workNew: 10,
    workRenovation: 4,
    durationNew: 8,
    durationRenovation: 3,
  },

  // R11 — public housing programme
  publicHousing: {
    budget: [0, 0, 5, 12, 20],
    renovationCost: { city: 42_000, countryside: 20_000 },
    renovationBudgetShare: 0.4,
    newCostFactor: 0.6,
    licenceMonths: 6,
    minRegionShare: 0.15,
    rent: 150,
    maintenanceCost: 25,
  },

  // R12 — builders (labour market)
  builders: {
    domesticEntry: 0.015,
    exitRate: 0.06,
    lowUtilisation: 0.7,
    retirement: 0.002,
    minimum: 200,
  },

  // R13 — innovation
  innovation: {
    budget: [0, 0.5, 2, 4, 7],
    lagMonths: 24,
    maxGain: 0.9,
    scale: 400,
  },

  // R14 — rent and price dynamics
  market: {
    externalDemand: { city: 250, countryside: 30 },
    externalDemandFundsReference: 40,
    priceTakerDemandShare: 0.4,
    externalDemandByInvestment: [0.5, 0.75, 1, 1.25, 1.6],
    rentDrift: 0.002,
    rentSensitivity: 0.006,
    rentSensitivityDown: 0.002,
    rentMaxFall: -0.008,
    rentMaxRise: 0.015, // a market trend never exceeds ≈20%/yr
    rentMomentumMonths: 12, // rents adjust gradually from their current trend
    priceMomentumMonths: 12, // prices too, more slowly
    tenantRentDown: 0.01,
    priceDrift: 0.0005,
    priceRentLink: 0.5,
    priceFundPressure: 1.5,
    priceSupplyRelief: 2,
    priceByInvestment: [-0.003, -0.001, 0, 0.001, 0.0025],
    priceMin: -0.01,
    priceMax: 0.02,
  },

  // R22 — consequences of binding rent caps. They grow with the gap between the
  // capped rent and the shadow market rent (what rents would be without the cap).
  rentControl: {
    offerExponent: 1.5, // vacant homes offered × (1 − gap)^1.5
    keyMoneyShare: 0.5, // new tenants pay half the gap under the table
    nonRenewalRate: 0.006, // contracts not renewed per month × gap
    maintenanceGap: 6, // degradation of rented homes × (1 + 6 × gap)
    catchUp: 0.08, // when the cap is lifted, rents close the gap by ≈8%/month (log terms)
    maxGap: 0.6, // the shadow rent stays below 2.5 × the capped rent
  },

  // Rent rules levels (law 4.6)
  rentRules: {
    cap: [0, 0.0017, 0.00185, 0.0065, Infinity], // indexed: 2026 legal update coefficient 2.24%/yr
    offer: [0.6, 0.8, 1.0, 1.3, 1.6], // immediate effects; the gap-driven ones (R22) come on top
    evict: [0.2, 0.5, 1.0, 1.4, 1.8],
    renewal: [0, 0.008, 0.015, 0.03, 0.045],
    maintenance: [1.5, 1.2, 1, 0.8, 0.7],
    renovation: [0.6, 0.8, 1.0, 1.2, 1.3],
  },

  // Private housing levels (law 4.4)
  privateHousing: {
    startFactor: [0, 0.5, 1, 1.6, 2.2],
    licenceMonths: [Infinity, 18, 12, 6, 3],
    incentives: [0, 0, 0, 1.5, 4],
    rezoning: {
      city: [0, 0, 0.00005, 0.0001, 0.0002],
      countryside: [0, 0, 0.0002, 0.0005, 0.001],
    },
  },

  // Foreign investment levels (law 4.2)
  foreignInvestment: {
    fundGrowth: [-0.06, -0.015, 0.003, 0.015, 0.035],
    fees: [0, 0, 0, 0.8, 2.0],
    incomeBoost: [-0.0006, -0.0003, 0, 0.0003, 0.0005],
  },

  // R15 — income
  income: {
    base: 0.003, // nominal wage growth ≈3.7%/yr (2025: +5.6% nominal, +3.2% real)
    inflation: 0.0019, // ≈2.3%/yr (2025)
    immigrationBoost: [-0.0018, -0.0009, 0, 0.0002, 0.0003],
    servicesEffect: 0.0005,
    homelessDrag: 0.03,
    homelessDragThreshold: 0.04,
    techEffect: 0.0005,
    homelessIncomeShare: 0.35,
    ownerCostBase: 150,
    ownerCostPriceFactor: 0.0005,
  },

  // R16 — infrastructure
  infrastructure: {
    schoolCapacity: 20_000,
    hospitalCapacity: 70_000,
    schoolCost: 15,
    hospitalCost: 60,
    schoolMonths: 12,
    hospitalMonths: 24,
    targetCoverage: 0.95,
    reserve: 300,
    schoolUpkeep: 0.25,
    hospitalUpkeep: 1.2,
    transportUpkeep: 0.03,
    transportInvestCost: 1.5,
    transportInvestGrowth: 0.25,
    transportMax: 95,
    transportPerNewHome: { city: 0.001, countryside: 0.003 },
    transportDecay: 0.1,
    transportDecayAusterity: 0.25,
  },

  // R17 — public services quality
  services: {
    costPerHousehold: 65,
    homelessSupport: 450,
    austerityCut: 0.4,
    austerityDebt: 600,
    debtInterest: 0.004,
    weights: { spending: 35, schools: 25, hospitals: 25, transport: 15 },
    spendingNormal: 0.8,
    spendingAusterity: 0.5,
    homelessPenalty: 250,
    adjustRate: 0.08,
  },

  // R18 — government budget
  tax: {
    income: 0.036, // share of household income reaching this housing & services budget
    property: 0.001 / 12,
    transactionHome: 0.03,
    transactionInvestor: 0.065,
  },

  // R19 — game over
  gameOver: { debtLimit: -800, homelessLimit: 0.25 },

  // Derived: individual landlords own on average this many rented or vacant homes
  landlords: { homesPerLandlord: 1.7 },

  // R20 — savings and inequality
  savings: {
    livingShare: 0.68, // share of gross income going to taxes and everything except housing
    landlordNetShare: 0.75, // share of rent a landlord keeps after costs and taxes
    fundNetShare: 0.8, // share of rent an investment fund keeps
  },

  // R21 — end of the game and score
  game: {
    maxMonths: 240, // 20 years
    moneyToLiveRange: [1_000, 2_700], // € (2027) for 0 and 100 points
    homelessZero: 0.1, // 10% of households without a house gives 0 points
  },
};

// ---------------------------------------------------------------------------
// Initial state (see docs/RULES.md §2).
// Houses and people are counted in households: one household needs one home.
// ---------------------------------------------------------------------------
export function initialRegions() {
  return {
    city: {
      key: 'city',
      name: 'Lisboa',
      where: 'em Lisboa',
      hospitalName: 'hospital',
      // Lisboa municipality: ≈240k households, ≈48k vacant homes (Censos 2021),
      // ≈23k municipal homes (Gebalis), new rents 17.4 €/m², sales 4,875 €/m² (INE 2025–26)
      houses: {
        ownerOccupied: 122_000,
        rented: 85_000,
        vacant: 48_000,
        degraded: 12_000,
        publicRented: 23_000,
        publicDegraded: 2_500,
      },
      fund: { rented: 7_000, vacant: 9_000 },
      land: 6_000,
      homeless: 7_500,
      infra: { schools: 8, hospitals: 2, transport: 70, projects: [] },
      // rent ≈ 70 m² × 17.4 €/m²; price ≈ 78 m² × 4,875 €/m²; trends: rents +7%/yr, prices +15%/yr
      market: { rent: 1_220, shadowRent: 1_220, tenantRent: 650, price: 380_000, rentTrend: 0.0057, priceTrend: 0.0117, rentGrowth: 0.0057, priceGrowth: 0.0117 },
      pipeline: {
        newLicensing: 400, newLicensingFund: 80,
        newBuilding: 900, newBuildingFund: 180,
        renoLicensing: 100, renoLicensingFund: 20,
        renoBuilding: 300, renoBuildingFund: 60,
        publicLicensing: 40, publicBuilding: 150, publicRenovating: 40,
      },
    },
    countryside: {
      key: 'countryside',
      name: 'Interior',
      where: 'no interior',
      hospitalName: 'centro de saúde',
      houses: {
        ownerOccupied: 60_000,
        rented: 12_000,
        vacant: 18_000,
        degraded: 15_000,
        publicRented: 2_000,
        publicDegraded: 800,
      },
      fund: { rented: 300, vacant: 700 },
      land: 50_000,
      homeless: 1_200,
      infra: { schools: 3, hospitals: 1, transport: 40, projects: [] },
      // Interior sub-regions: sales ≈ 600–750 €/m² (≈110 m² homes), rents ≈ 5.5 €/m²;
      // trends: rents +10%/yr, prices +17%/yr (national house price index 2025: +17.6%)
      market: { rent: 450, shadowRent: 450, tenantRent: 320, price: 80_000, rentTrend: 0.008, priceTrend: 0.0132, rentGrowth: 0.008, priceGrowth: 0.0132 },
      pipeline: {
        newLicensing: 150, newLicensingFund: 15,
        newBuilding: 350, newBuildingFund: 35,
        renoLicensing: 50, renoLicensingFund: 5,
        renoBuilding: 150, renoBuildingFund: 15,
        publicLicensing: 10, publicBuilding: 30, publicRenovating: 10,
      },
    },
  };
}

export const INITIAL = {
  money: 250,
  funds: 40,
  builders: 2_500,
  // Gross income per household: average gross pay €1,694/month per worker in 2025 (INE) × ≈1.45 earners
  grossIncome: 2_450,
  publicServices: 66,
};
