# Housing Crisis — simulation rules

This document is the single source of truth for **how the game variables affect each other over time**.
Every rule has an ID (`R1`, `R2`, …). The same IDs appear as comments in
[`server/sim/engine.js`](../server/sim/engine.js), and every number below lives in `PARAMS` in
[`server/sim/config.js`](../server/sim/config.js).

**When you change a rule, change all three together** (this file, `config.js`, `engine.js`), then run:

```sh
npm test                                   # invariants and the cause → effect checks below
npm run simulate -- --years 10             # yearly table with the default laws
npm run simulate -- --law rentRules=0      # …or with any laws changed (level 0–4)
```

---

## 1. Time and units

| | |
|---|---|
| Real time | **1 real minute = 1 game month** at 1× speed. The player can pause or play at 2×, 4× or 8×. |
| Simulation step | One **game day**. A monthly rate `r` is applied as `r × 1/(days in month)` each day, so a month always integrates to exactly `r`. |
| End of month | Budget summary, history point (for the sparklines), news, and decisions about schools and hospitals (R16). |
| Start date | 1 January 2027. The game ends after **20 years** (1 January 2047) if the government has not fallen before (R21). |
| Houses and people | Counted in **households**. One household needs one home. A "person without a house" is a household without a home of its own (people on the street, in shelters, in overcrowded rooms, or adult children who cannot leave home). |
| Money | Government money in **millions of €**. Incomes, rents and prices in **€**. |
| Pausing | The server only advances the clock while a browser is polling. If the page is closed or hidden the game effectively pauses. |

---

## 2. Variables

The game has two regions with the same variables: **Lisboa** (city) and the **countryside** (shown as *Interior* in the game). Some variables are national.

### 2.1 Houses (per region)

| Spec | Variable | Lisboa start | Countryside start | Notes |
|---|---|---:|---:|---|
| 1.1.1 | Private, owner-occupied (`houses.ownerOccupied`) | 122,000 | 60,000 | Always equal to the number of owners. |
| 1.1.2 | Private, rented (`houses.rented`) | 85,000 | 12,000 | Of which owned by funds: 7,000 / 300 (`fund.rented`). |
| 1.1.3 | Private, non-occupied (`houses.vacant`) | 48,000 | 18,000 | Second homes, short-term rentals, inheritances, speculation. Of which owned by funds: 9,000 / 700 (`fund.vacant`). |
| 1.1.4 | Private, degraded (`houses.degraded`) | 12,000 | 15,000 | Not fit to live in. |
| 1.2.1 | Public, rented (`houses.publicRented`) | 23,000 | 2,000 | Rent €150/month. |
| 1.2.2 | Public, degraded (`houses.publicDegraded`) | 2,500 | 800 | |
| 1.3.1 | Land without houses (`land`), in homes it could hold | 6,000 | 50,000 | |
| — | In the pipeline (`pipeline`): waiting for a licence or under works | 1,930 | 750 | Of which under works: 1,390 / 540. Homes leave their category while in the pipeline and come back when finished (§2.5). |

### 2.2 Infrastructure (per region)

| Spec | Variable | Lisboa | Countryside | Notes |
|---|---|---:|---:|---|
| 1.4.1 | Schools | 8 | 3 | One school serves 20,000 households. |
| 1.4.2 | Hospitals / health centres | 2 | 1 | One serves 70,000 households. |
| 1.4.3 | Roads & railways (index 0–100) | 70 | 40 | |

### 2.3 Quality of life (national)

| Spec | Variable | Start | Notes |
|---|---|---:|---|
| 2.1 | Money to live (`indicators.moneyToLive`) | €2,036 | Average monthly money a household has left **after paying for housing**, in 2027 euros (R15). |
| 2.2 | Quality of public services (`economy.publicServices`, 0–100) | 66 | R17. |
| 2.3 | Savings inequality (`indicators.inequality`, Gini 0–1) | 0.35 | How unequally owners, tenants, landlords and investment funds save each month (R20). |
| — | Gross household income (`economy.grossIncome`) | €2,450/month | Nominal; grows with the economy (R15). |

### 2.4 People

| Spec | Variable | Lisboa | Countryside | How it is defined |
|---|---|---:|---:|---|
| 3.1 | Without a house (`homeless`) | 7,500 | 1,200 | Stock. |
| 3.2 | Owners | 122,000 | 60,000 | `= houses.ownerOccupied` |
| 3.3 | Tenants | 108,000 | 14,000 | `= houses.rented + houses.publicRented` |
| 3.4 | Landlords | ≈51,000 | ≈17,000 | `= (rented − fund.rented + vacant − fund.vacant) / 1.7` (each individual landlord owns 1.7 homes on average) |
| 3.5 | Investment funds (national) | 40 | | Stock (R9). Each fund owns homes in both regions. |
| 3.6 | Construction builders (national) | 2,500 | | Stock (R12). The views show how many are working in each region. |

Households in a region = owners + tenants + without a house.

### 2.5 Construction pipeline (per region)

| Stock | Meaning |
|---|---|
| `newLicensing` → `newBuilding` | Private new homes waiting for a licence, then being built. The land has already been used. |
| `renoLicensing` → `renoBuilding` | Private degraded homes waiting for a renovation licence, then being renovated. |
| `publicLicensing` → `publicBuilding` | New public homes. |
| `publicRenovating` | Public degraded homes being renovated. |

Each private stock has a `…Fund` sub-stock: the part owned by investment funds. Fund homes stay fund homes when finished.

### 2.6 Laws

There are six laws. Each has five levels (0–4). The status quo at the start is marked ★.

The game shows the laws in Portuguese; English translations are in brackets.

| Spec | Law | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|---|
| 4.1 | Imigração (immigration) | Fronteiras fechadas | Restritiva | Moderada | Aberta ★ | Muito aberta |
| 4.2 | Investimento estrangeiro (foreign investment) | Proibido | Restrito | Neutro | Incentivado ★ | Vistos gold e benefícios fiscais |
| 4.3 | Habitação pública (public housing) | Nenhuma | Só manutenção ★ | Programa modesto | Programa ambicioso | Programa massivo |
| 4.4 | Habitação privada (private housing) | Construção congelada | Licenciamento lento ★ | Licenciamento normal | Licenciamento rápido | Desregulado + benefícios fiscais |
| 4.5 | Inovação na construção (innovation) | Nenhuma | Investigação básica ★ | Programa financiado | Prioridade nacional | Aposta máxima |
| 4.6 | Regras do arrendamento (rent rules) | Rendas congeladas | Teto apertado (2%/ano) | Indexadas à inflação | Regulação ligeira (8%/ano) ★ | Mercado livre |

**R0 — Approving a law.** In the Parliament view the player picks a level and puts it to the vote. The vote always passes. Between 116 and 185 of the 230 deputies vote in favour; this is cosmetic. The new level applies from the next simulated day. There is no lag on the law itself, but every rule below has its own inertia.

Parameters by level (index = level):

| Parameter | 0 | 1 | 2 | 3 | 4 | Used in |
|---|---:|---:|---:|---:|---:|---|
| **Immigration** — arrivals per household per month | 0 | 0.0002 | 0.0006 | 0.0010 | 0.0016 | R2 |
| Immigration — income growth boost /month | −0.0018 | −0.0009 | 0 | +0.0002 | +0.0003 | R15 |
| **Foreign investment** — fund growth /month | −6% | −1.5% | +0.3% | +1.5% | +3.5% | R9 |
| Foreign investment — fees, M€/month | 0 | 0 | 0 | 0.8 | 2.0 | R18 |
| Foreign investment — external rental demand × | 0.5 | 0.75 | 1 | 1.25 | 1.6 | R14 |
| Foreign investment — price growth /month | −0.3% | −0.1% | 0 | +0.1% | +0.25% | R14 |
| Foreign investment — income growth /month | −0.0006 | −0.0003 | 0 | +0.0003 | +0.0005 | R15 |
| **Public housing** — programme budget, M€/month | 0 | 0 | 5 | 12 | 20 | R11 |
| Public housing — public homes maintained | no | yes | yes | yes | yes | R8, R18 |
| **Private housing** — construction starts × | 0 | 0.5 | 1 | 1.6 | 2.2 | R10 |
| Private housing — licence time, months | never | 18 | 12 | 6 | 3 | R10 |
| Private housing — developer tax breaks, M€/month | 0 | 0 | 0 | 1.5 | 4 | R18 |
| Private housing — land rezoned per home per month, Lisboa | 0 | 0 | 0.00005 | 0.0001 | 0.0002 | R10 |
| Private housing — land rezoned per home per month, countryside | 0 | 0 | 0.0002 | 0.0005 | 0.001 | R10 |
| **Innovation** — research budget, M€/month | 0 | 0.5 | 2 | 4 | 7 | R13 |
| **Rent rules** — max rent growth /month | 0 | 0.17% | 0.185% (2.24%/yr, 2026 legal coefficient) | 0.65% | no cap | R14 |
| Rent rules — vacant homes offered for rent × (immediate) | 0.6 | 0.8 | 1.0 | 1.3 | 1.6 | R5, plus R22 |
| Rent rules — evictions × | 0.2 | 0.5 | 1.0 | 1.4 | 1.8 | R7 |
| Rent rules — sitting tenants' rent catches up /month | 0 | 0.8% | 1.5% | 3% | 4.5% | R14 |
| Rent rules — degradation of rented homes × (immediate) | 1.5 | 1.2 | 1 | 0.8 | 0.7 | R8, plus R22 |
| Rent rules — private renovations × (immediate) | 0.6 | 0.8 | 1.0 | 1.2 | 1.3 | R10, plus R22 |

### 2.7 Calibration: Portugal 2025–26

Starting values use the latest published figures as of October 2026. Lisboa is modelled on the municipality (≈240k households). The countryside is a stylised interior region.

| Figure | Real value | How it is used |
|---|---|---|
| Average gross monthly pay per worker, 2025 (INE) | €1,694 (+5.6% nominal, +3.2% real) | Household income €2,450 (≈1.45 earners); nominal wage growth ≈3.7%/yr |
| Inflation, 2025 | 2.3% | Price index +0.19%/month |
| Median sale price, Lisboa municipality, 2025 (INE) | €4,875/m² (national €2,076/m², +16.8%) | Lisboa home ≈78 m² → €380,000 |
| Cheapest interior sub-regions, 2025 | ≈€600–750/m² | Countryside home ≈110 m² → €80,000 |
| House price index, 2025 (INE) | +17.6% (Q4: +18.9% year on year) | Initial price trend +15%/yr (Lisboa), +17%/yr (countryside), fading with 12-month momentum |
| New-lease median rent, Lisboa municipality, Q1 2026 (INE) | €17.42/m² (national €9.46/m², ≈+9%/yr) | New contract ≈70 m² → €1,220/month; initial trend +7%/yr (Lisboa), +10%/yr (countryside) |
| Legal rent update coefficient, 2026 | 2.24% | Cap of the "indexed to inflation" rent rule |
| Vacant homes, Lisboa municipality (Censos 2021) | ≈47,700 | 48,000 non-occupied homes, of which 9,000 owned by funds |
| Municipal housing, Lisboa (Gebalis) | ≈23,000 homes (national public stock ≈2%) | 23,000 public rented homes in Lisboa; 2,000 in the countryside |
| People without a home, end of 2024 (ENIPSSA) | 14,476 in Portugal, +10% in a year | 7,500 households without a house in Lisboa, also counting hidden homelessness (adults unable to leave home, overcrowding) |
| Foreign residents, end of 2025 (AIMA/INE) | ≈1.59 million (14% of residents) | "Open" immigration status quo |

The calibrated status quo reproduces the current trends in the first year: households without a house +15% (+20% in Lisboa), Lisboa new rents +5%, Lisboa prices +11%.

Sources: [INE via Idealista — house price index 2025](https://www.idealista.pt/news/node/74572) · [Notícias ao Minuto — prices +17.6% in 2025](https://www.noticiasaominuto.com/economia/2960456/precos-da-habitacao-com-aumento-recorde-de-17-6-em-2025) · [Idealista — median prices 2025, €2,076/m²](https://www.idealista.pt/news/node/75156) · [Observador — median prices by municipality](https://observador.pt/2026/07/17/preco-mediano-de-alojamentos-familiares-aumentou-168-em-2025/) · [Idealista — real wages +3.2% in 2025](https://www.idealista.pt/news/node/73929) · [Montepio — rents in Portugal](https://www.montepio.org/ei/pessoal/casa/precos-das-rendas-em-portugal/) · [Postal — new-lease rents 2025](https://postal.pt/algarve/algarve-supera-mediana-nacional-nas-rendas-de-novos-contratos/) · [Idealista — 14,476 homeless](https://www.idealista.pt/news/node/73197) · [Idealista — Lisboa vacant homes](https://www.idealista.pt/news/node/77062) · [Idealista — public housing 2% → 5%](https://www.idealista.pt/news/node/53957) · [DN — population and immigrants 2025](https://www.dn.pt/sociedade/populao-em-portugal-atinge-114-milhes-imigrantes-so-14-dos-residentes) · [Comparaja — cheapest sub-regions](https://www.comparaja.pt/credito-habitacao/noticias/casas-subir-preco-metro-quadrado)

---

## 3. Rules

All rates are **per month**. The daily step runs in this order:
regions (R5 → R6 → R1 dissolution → R7 → R8 → R9 → R10 → R14), then R11, R1 formation, R2, R3, R4, R9 fund growth, R12, R13, R15, R17, R18, R19.
R16 schools and hospitals are decided at the end of each month.

### R1 — Households form and dissolve
- **New households**: `0.05%` of all households in a region form each month (young people leaving home). They start **without a house**. Half of the new households from countryside move to Lisboa.
- **Dissolution**: `0.03%` of owner households dissolve each month (deaths, merging). Their home becomes **non-occupied** (inheritance). This is one way vacant homes appear.

### R2 — Immigration *(spec example: "more migration → more builders, but also more people without a house")*
```
arrivals = immigrationRate[law 4.1] × all households × attraction
attraction = clamp(moneyToLive / 1,700, 0.4, 1.4) × √(publicServices / 66)
```
- 65% arrive in Lisboa and 35% in the countryside, all **without a house**.
- Each arriving household adds **0.15 construction builders**.
- Integration costs the state €1,000 per arriving household.
- The economy grows faster with more immigration (R15).

### R3 — Emigration
1.5% of households without a house give up and leave the country each month.

### R4 — Internal migration (Lisboa → countryside)
```
moving = Lisboa homeless × 2% × clamp((rent Lisboa − rent countryside) / income / 0.3, 0, 1) × transport countryside / 100
```
Better roads and railways in the countryside let more people escape Lisboa's prices.

### R5 — Rental market: vacant homes get tenants
```
offered = (vacant − fund vacant) × 2.4% × offer[law 4.6]  +  fund vacant × 2.4% × offer × 0.5
seekers = homeless × 20% × affordability
housed  = min(offered, seekers)          → vacant → rented, homeless → tenants
affordability = clamp((0.55 − rent / income) / 0.25, 0.03, 1)
```
Funds offer their empty homes at half the rate: they prefer short-term rentals and capital gains.
Only 2.4% of non-occupied homes are offered each month, because many are second homes or short-term rentals. In Lisboa, at the start, a new contract costs 50% of gross household income, so only ≈21% of the people looking can afford one.

### R6 — Tenants buy homes
```
buyers = private non-fund tenants × 0.3% × clamp((16 − price / yearly income) / 8, 0, 1)
```
A buyer moves from a rented home into a vacant one: **rented −1, owner-occupied +1**. A 3% transaction tax goes to the state.

### R7 — Evictions and unaffordable rent
```
landlord evictions = (rented − fund rented) × 0.07% × evict[law 4.6]
fund conversions   = fund rented × 0.8% × evict[law 4.6]        (to short-term rental / resale)
cannot pay         = rented × 0.3% × max(0, (average rent paid / income − 0.25) / 0.13)
```
In every case the home becomes **non-occupied** and the household is **without a house**.

### R8 — Degradation
| From → to | Rate | Who is affected |
|---|---|---|
| Non-occupied (not fund-owned) → degraded | 0.15% (Lisboa), 0.3% (countryside) | — |
| Rented (not fund-owned) → degraded | 0.04% × maintenance[law 4.6] | The tenant household is left without a house. |
| Public rented → public degraded | 0.06% if maintained (law 4.3 ≥ 1), else 0.2% | The tenant household is left without a house. |

### R9 — Investment funds *(spec example: "more funds → more homes bought by them")*
**Number of funds**
```
growth = fundGrowth[law 4.2] × profitability × room       (when growth > 0, plus 0.05 new funds/month)
profitability = clamp(Lisboa gross yield / 4%, 0.4, 1.6)    yield = rent × 12 / price
room = max(0, 1 − fund homes / (rented + vacant) / 40%)     (fewer opportunities as funds own more)
```
When the number of funds falls, leaving funds sell the same share of their homes and projects to local landlords. Homes keep their category (rented or vacant).

**Purchases — each fund buys 3 homes per month**, 72% in Lisboa and 28% in the countryside.

| Bought from | Lisboa | Countryside | Result |
|---|---:|---:|---|
| Non-occupied | 45% | 45% | Becomes fund vacant. |
| Rented (with the tenants) | 35% | 20% | Becomes fund rented; R7 then converts it at a high rate. |
| Degraded | 20% | 35% | Goes into a fund renovation project (R10), then fund vacant. |

The state collects a 6.5% transaction tax on every purchase. Funds also finance construction (R10) and push rents (R14) and prices (R14) up.

### R10 — Private construction and renovation
```
margin        = clamp(price × 0.85 / buildCost − 1, 0, 1)        buildCost: Lisboa €260k, countryside €62k, ÷ √tech
capital       = 0.8 + 0.4 × funds / (funds + 60)
new starts    = land × startRate × margin × startFactor[law 4.4] × capital     (startRate: Lisboa 4%, countryside 0.6%)
renovations   = degraded × 0.4% × renovation[law 4.6] × √startFactor[law 4.4] × clamp(0.5 + margin, 0.2, 1.5)
licensing     = stock / licenceMonths[law 4.4]          (renovation licences take a third of that)
completions   = building stock / duration × labour      (duration: new 8 months, renovation 3 months, ÷ √tech)
rezoning      = homes in region × rezoning[law 4.4]     → new land
```
- A share `funds / (funds + 60)` of new starts is owned by funds.
- Finished private homes enter the market as **non-occupied**. They are then rented (R5) or bought (R6).
- Under a construction freeze no licences are issued. Projects already licensed still finish.

### R11 — Public housing programme
Each month the budget `budget[law 4.3]` is split between the regions in proportion to their households without a house (each region gets at least 15%). Within a region:
1. **Renovate** public degraded homes with up to 40% of the money (€42k in Lisboa, €20k in countryside, ÷ √tech).
2. **Build** on free land with the rest (60% of the private build cost, ÷ √tech). Licensing takes 6 months, then the work needs builders like any other site.
3. If there is no land left, **buy** non-occupied homes at market price. These are available at once.

Only money that is actually used is spent. A finished public home goes first to a household without a house. If there is none, it goes to a private tenant, whose rental becomes vacant. If there are no private tenants either, a newly formed household moves in.

### R12 — Builders and labour
```
labour needed = Σ (building stock / duration) × work per home        (new 10, renovation 4 builder-months, ÷ tech)
labour        = min(1, builders / labour needed)                    → slows every site in both regions
builders     += arrivals × 0.15                                     (R2)
             + 1.5% × builders × min(1, utilisation − 1)            if utilisation > 1 (locals join)
             − 6% × builders × (0.7 − utilisation) / 0.7            if utilisation < 0.7 (they leave)
             − 0.2% × builders                                       (retirement; never below 200)
```
More immigration means more builders. Few construction starts means builders leave, and then a later building boom hits a labour shortage.

### R13 — Housing technology innovation (long-term)
```
research spent      += budget[law 4.5]
research effective  += (spent − effective) / 24             (about two years of delay)
tech = 1 + 0.9 × (1 − e^(−effective / 400))                  (from 1.0 up to a maximum of 1.9)
```
Tech divides the work per home, divides build and renovation durations and costs by √tech, raises income growth slightly (R15) and shortens school and hospital works (R16).

### R14 — Rents and prices
```
external demand = base (Lisboa 250, countryside 30) × external[law 4.2] × (0.5 + 0.5 × funds / 40)
demand          = homeless × 20% × (0.4 + 0.6 × affordability) + external demand
pressure        = ln(demand / offered)                                   (offered from R5)
pressure        = ln(demand / homes landlords would offer at market rents)
rent trend     += (clamp(0.2% + (pressure > 0 ? 0.6% : 0.2%) × pressure, −0.8%, +1.5%) − rent trend) / 12   (momentum)
rent growth     = clamp(rent trend + 8% × ln(shadow rent / rent), −0.8%, cap[law 4.6])   (rent rules cap it at once)
shadow rent     grows with the uncapped rent trend; it is what rents would be without the cap (R22)
average rent paid → moves toward the new-contract rent by renewal[law 4.6] per month (down by 1%);
                  each newly housed tenant also pays the new-contract cost (rent + key money, R22)
price trend    += (target − price trend) / 12                                   (momentum, 12 months)
price growth    = clamp(price trend, −1%, +2%)
target          = 0.05% + 0.5 × rent growth + priceBoost[law 4.2] + 1.5 × fund purchases / stock
                  − 2 × completions / stock
```
People who cannot afford the rent still push rents up, but less. Short-term-rental and foreign demand grows with the number of funds.

### R15 — Income and money to live
```
income growth = 0.3% + immigrationBoost[4.1] + incomeBoost[4.2] + 0.05% × (publicServices − 60) / 20
                − 3% × max(0, homeless share − 4%) + 0.05% × (tech − 1)
prices (inflation) grow 0.19% per month (≈2.3%/yr)

money to live = [ owners × (income − (150 + 0.0005 × price))
                + private tenants × (income − average rent paid)
                + public tenants × (income − 150)
                + homeless × income × 0.35 ] / households / price index
```

### R16 — Infrastructure
- **Schools and hospitals** are planned automatically at the end of a month when all of these hold:
  - coverage in the region is below 95% (`count × capacity / households`)
  - none of that type is already being built there
  - the budget would stay above €300M after paying for it

  A school costs €15M and takes 12 months; a hospital costs €60M and takes 24 months. Both durations are divided by √tech, and the cost is paid month by month during the works.
- **Roads & railways** (0–100):
  - +0.25/month for €1.5M/month in each region while the budget is above €300M (up to 95)
  - +0.001 (Lisboa) or +0.003 (countryside) per finished new home, doubled when private housing is deregulated
  - −0.1/month when austerity (R18) exceeds 25%
- Running costs: €0.25M per school, €1.2M per hospital and €0.03M per transport point each month (halved under full austerity).

### R17 — Quality of public services (0–100)
```
target = 35 × spending + 25 × school coverage + 25 × hospital coverage + 15 × transport / 100
         − 250 × homeless share
spending = 0.8 − 0.3 × austerity          (coverages capped at 110%, weighted by households)
quality += (target − quality) × 8%
```

### R18 — Government budget (M€)
| Revenue | |
|---|---|
| Income tax | households with a home × income × 3.6% (the part that reaches this budget) |
| Property tax (IMI) | value of private homes (owner-occupied, rented, vacant) × 0.1% / 12 |
| Transaction tax (IMT) | 3% on tenant purchases (R6), 6.5% on fund purchases (R9) |
| Public rents | public tenants × €150 |
| Investment & visa fees | fees[law 4.2] |

| Spending | |
|---|---|
| Public services | all households × €65 × income index × (1 − 40% × austerity) |
| Infrastructure | R16 running costs, investments and projects |
| Support for people without a house | homeless × €450 × income index |
| Public housing | R11 programme, plus €25 per public home for maintenance (law 4.3 ≥ 1) |
| Innovation | budget[law 4.5] |
| Developer tax breaks | incentives[law 4.4] |
| Immigrant integration | R2 |
| Interest on debt | 0.4% of debt per month |

`income index = income / €2,450` (public wages follow incomes). **Austerity** = `clamp(−money / 600, 0, 1)`. It is 0 while money is positive and reaches 1 at €600M of debt.

### R19 — Game over
- Debt beyond **€800M** means the state is bankrupt.
- More than **25% of households without a house** means the government falls.

### R20 — Savings and inequality
People who do not own their home save less: rent takes what would otherwise be saved. Landlords and funds also save the rents they collect. Monthly savings per group, in 2027 euros:
```
living costs     = income × 68%                      (taxes and everything except housing)
owner            = income − (150 + 0.0005 × price) − living costs          (≥ 0)
private tenant   = income − average rent paid − living costs              (≥ 0)
public tenant    = income − 150 − living costs
without a house  = 0
landlord         = owner + (landlords' rented homes × rent paid × 75%) / landlords
investment fund  = (fund rented homes × rent paid × 80%) / funds          (per fund)
```
Landlords are counted as owners who also let homes; each fund counts as one saver. **Inequality** is the Gini coefficient of savings over all these groups, weighted by their size (0 = everyone saves the same, 1 = one group saves everything). At the start it is 0.35. Rising rents push it up; rent controls and public housing push it down.

### R22 — Consequences of rent caps
A binding cap (a rent freeze above all, but also the strict 2% cap or any cap the market outpaces) opens a **gap** between the capped rent and the **shadow market rent**:
```
gap = clamp(1 − rent / shadow rent, 0, 60%)
```
The wider the gap, the stronger the consequences. They build up over time as the market moves away from the frozen rent:

| Consequence | Rule |
|---|---|
| Landlords offer fewer vacant homes | offered × (1 − gap)^1.5 (R5) |
| Contracts are not renewed; tenants must look for a new home | 0.6% × gap of private rented homes per month → non-occupied; households → without a house (R7) |
| Landlords stop maintaining | degradation of rented homes × (1 + 6 × gap) (R8) |
| Renovations dry up | private renovations × (1 − gap) (R10) |
| Key money under the table | new tenants pay rent + 50% of the gap: it limits who can afford a new contract (R5), and every new tenant brings that cost into the average rent paid |
| Funds avoid tenanted homes | the rented share of fund purchases × (1 − gap) moves to empty homes for short-term rental (R9) |
| When the cap is lifted | rents catch up with the shadow rent at ≈8% of the (log) gap per month (R14) |

The panel shows the shadow rent ("Renda de mercado sem teto"), and the news warns when Lisboa rents fall 20% below the market. With a freeze, Lisboa's shadow rent reaches about €1,800 after 5 years against a frozen €1,220, and degraded homes roughly triple over 20 years.

### R21 — End of the game and score
- The game ends after **240 months (20 years)** with status `finished`, unless R19 ends it earlier.
- At the end of every month the quality of life earns 0–100 points, the average of four parts:

  | Part | 0 points | 100 points |
  |---|---|---|
  | Public services | 0 | 100 |
  | Money to live | €1,000 | €2,700 |
  | Housing: share of households without a house | 10% or more | 0% |
  | Savings equality: `100 × (1 − inequality)` | Gini 1 | Gini 0 |

- The **score** is the sum over all months played (at most 24,000), so the best quality of life for the longest time wins. Losing early stops the score.
- When the game ends a pop-up shows the score. The player can save it with a name (1–40 characters) once per game. The server computes the score itself and stores the name, score, months, how the game ended, the average of each part, the final laws and every law change with its date. The scores page (`/scores.html`) shows the top 50 and each player's decisions.

---

## 4. Cause → effect summary

| If… | …then, over time |
|---|---|
| Immigration opens | More households without a house; more builders; faster income growth; higher rent pressure; services stretched (more households per school and hospital). |
| Immigration closes | Fewer people looking for homes; builders retire or leave; slower income growth, so less money to live. |
| Investment funds grow | More homes bought by funds (3 per fund per month), more empty fund homes, more evictions (fund conversions), higher rents and prices; more transaction taxes and fees; more capital for construction. |
| Public housing budget rises | Degraded public homes come back first, then new public homes; people without a house are housed directly; costs money every month. |
| Private licensing speeds up | More construction starts, sooner; more land rezoned; more builders needed; tax breaks cost money; more fund-owned new builds. |
| Innovation is funded | Nothing for about a year, then every home is built and renovated faster and cheaper. |
| Rent rules tighten | Rents and evictions fall; landlords offer fewer vacant homes, maintain less and renovate less, so more homes degrade. |
| Rent rules loosen | More vacant homes offered; rents rise up to the cap; more evictions. |
| Households without a house increase | Rents rise; services fall; support costs rise; income growth slows above 4%; fewer immigrants want to come; more emigrate. |
| Budget goes negative | Austerity: services and road maintenance are cut, interest is due; schools, hospitals and transport stop being built. |

### Reference outcomes
From `npm run simulate`, 10 years from January 2027; only the listed laws are changed from the status quo:

| Scenario | Homeless at 5 y | Homeless at 10 y | Budget | Services | Money to live | Lisboa rent | Builders | Fund homes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Status quo (defaults) | 4.5% | 8.9% | €376M | 74 | €2,253 | €1,938 | 3,458 | 49,186 |
| Very open immigration | 6.9% | 15.4% | −€118M | 51 | €1,878 | €2,120 | 3,822 | 49,683 |
| Restrictive immigration | 3.6% | 2.9% | €803M | 88 | €2,196 | €1,613 | 2,317 | 48,504 |
| Golden visas & tax breaks | 4.9% | 12.1% | €1148M | 68 | €2,163 | €2,173 | 4,136 | 74,607 |
| Foreign investment banned | 4.2% | 5.7% | €262M | 63 | €2,114 | €1,591 | 1,831 | 26 |
| Massive public housing | 3.2% | 4.2% | −€113M | 57 | €2,408 | €1,811 | 3,728 | 46,535 |
| Rent freeze | 5.8% | 12.9% | −€140M | 63 | €2,196 | €1,220 | 2,726 | 46,808 |
| Deregulated building + innovation moonshot | 3.8% | 3.8% | €298M | 64 | €2,485 | €1,729 | 4,064 | 62,283 |
| Balanced package* | 2.5% | 2.2% | −€63M | 65 | €2,391 | €1,523 | 3,148 | 40,911 |

20-year scores: status quo 12,111 · very open immigration 9,390 · rent freeze 12,141 · massive public housing + rent freeze 13,477 · balanced package 16,927 · best fixed laws (2,5,4,5,3,1) 17,980.

Searching all 15,625 fixed-law combinations, the five rent rules reach best scores within about 2% of each other: rent freeze 17,980, strict cap 17,587, indexed 17,587, light regulation 17,652, free market 17,657.

\* Moderate immigration, neutral foreign investment, ambitious public housing, fast-track licensing, funded innovation, rents indexed to inflation.

Update this table whenever the rules change.

---

## 5. How the views show the variables

The interface is in Portuguese (pt-PT). The countryside region is called *Interior*.

- **Buildings.** Each region has a fixed set of building plots: 40 in Lisboa, 32 in the countryside. Plots are shared out in proportion to the house categories (§2.1) plus *under construction* and *land without houses*, with the private rented and vacant homes split between landlords and funds. A category that is present gets at least one plot once it reaches about 0.4% of the total.
- **Neighbourhoods.** The plots are ordered as a walk through the scene, block by block. In Lisboa the walk runs from the top of the hill to the riverfront and on to the first terrace; in the countryside it goes around the town square and then out to the farms. Each category takes a contiguous run of that walk, in this order: owners who live there, then landlords (rented, vacant, degraded), then funds (rented, vacant), then the State (rented, degraded), then construction, then land. Homes with the same owner therefore always appear together, and when counts change only the plots at the borders between neighbourhoods switch.
- **Colours show who owns a building:**

  | Owner | Colour |
  |---|---|
  | The people who live there (1.1.1) | yellow |
  | Individual landlords (1.1.2, 1.1.3) | pink |
  | Investment funds | purple |
  | The State (1.2) | teal |

  - **Use** is shown by the windows: lit windows mean occupied, closed shutters mean non-occupied. Public housing has wide window walls.
  - **Degraded** buildings (1.1.4, 1.2.2) use a darker, greyer version of the owner's colour, with broken windows, crumbling corners and cornice, a sagging roof with holes and weeds (public buildings get a dark, broken flat roof) and rubble in front. Private degraded homes are shown as landlord-owned, since they are owned by people who do not live in them.
  - **Construction** is orange scaffolding, with a crane on some plots. **Land** is a green plot with a sign.
- **People.** Each figure stands for many households:
  - **Residents** appear on the balconies (city) or at the door (countryside) of the buildings they live in. Owners are dark yellow, tenants blue. Empty and degraded buildings have none.
  - **Households without a house** stay in the **main square**: the riverfront square with a statue in Lisboa, the town hall square in the countryside. They sit by tents or stand, filling the square from the centre outwards. There are about 300 × the region's share of figures, so 3% gives 9.
  - **Landlords** stand by their rented and vacant homes. **Fund agents**, with a gold briefcase, stand by fund-owned buildings, one per 2,500 fund homes.
  - **Builders** in hard hats work at construction sites, one per 100 builders working there.
- **Mood (quality of life).** `quality = ½ · services(35→80) + ½ · money-to-live part of the score (R21)`, each scaled to 0–1, and `sadness = clamp((0.75 − quality) / 0.6, 0, 1)`. As sadness grows:
  - the sky turns overcast grey and grey clouds gather
  - the sunlight dims and turns colder
  - tree blossoms and balcony flowers lose their colour

  Streets do not get dirtier.
- **Trash (government management).** `management = ½ · services(35→80) + ½ · (1 − austerity)` and `trash = clamp((0.9 − management) / 0.6, 0, 1)`. Up to 44 items appear on streets and in squares: rubbish bags, litter and overflowing bins.
- **Infrastructure.** Labels show schools and hospitals (health centres in the countryside) with their coverage, and a scaffold appears beside them while a new one is being built. The Lisbon tram and the countryside trains and cars run more often when roads & railways are better.
- **Parliament.** 230 deputies in party blocks. During a vote they turn green, red or yellow, and those in favour stand up, as in São Bento.
