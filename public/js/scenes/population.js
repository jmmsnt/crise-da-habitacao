// People in the city and countryside views. Each figure stands for many
// households. Residents are drawn by each building (balconies, doors — see
// Building in kit.js); this module places everyone else:
//   households without a house  → tents and standing figures in the main square
//   landlords / fund agents      → in front of the buildings they own
//   builders                     → at construction sites

import { FigurePool } from './kit.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A point in front of a slot's facade. `lateral` moves along the facade.
export function frontSpot(slot, out = 0.4, lateral = 0) {
  const fx = slot.fx ?? 0;
  const fz = slot.fz ?? 1;
  const depth = (Math.abs(fz) > 0 ? slot.d : slot.w) / 2;
  return {
    x: slot.x + fx * (depth + out) - fz * lateral,
    y: slot.y,
    z: slot.z + fz * (depth + out) + fx * lateral,
    rot: Math.atan2(fx, fz),
  };
}

// Grid of spots in a square, filled from the centre outwards; about 60% tents.
export function squareSpots({ x0, x1, z0, z1, y = 0, step = 0.85, centre, reject = () => false }) {
  const spots = [];
  for (let x = x0; x <= x1; x += step) {
    for (let z = z0; z <= z1; z += step) {
      if (reject(x, z)) continue;
      spots.push({ x, y, z, rot: Math.atan2(centre[0] - x, centre[1] - z) });
    }
  }
  spots.sort((a, b) => Math.hypot(a.x - centre[0], a.z - centre[1]) - Math.hypot(b.x - centre[0], b.z - centre[1]));
  spots.forEach((s, i) => (s.tent = i % 5 < 3));
  return spots;
}

export class RegionPopulation {
  constructor(parent, { square, homelessScale = 300 }) {
    this.square = square;
    this.homelessScale = homelessScale;
    this.tents = new FigurePool(parent, 'homeless', square.filter((s) => s.tent).length);
    this.standing = new FigurePool(parent, 'homelessStanding', square.filter((s) => !s.tent).length);
    this.landlords = new FigurePool(parent, 'landlord', 6);
    this.funds = new FigurePool(parent, 'fund', 6);
    this.builders = new FigurePool(parent, 'builder', 24);
    this.t = 0;
  }

  update(region, slots, assign) {
    const p = region.people;
    const of = (cats) => assign.map((c, i) => (cats.includes(c) ? i : -1)).filter((i) => i >= 0);

    // Households without a house stay in the main square
    const rate = p.homeless / p.households;
    const n = clamp(Math.round(rate * this.homelessScale), p.homeless > 30 ? 1 : 0, this.square.length);
    const shown = this.square.slice(0, n);
    this.tents.place(shown.filter((s) => s.tent));
    this.standing.place(shown.filter((s) => !s.tent));

    // Landlords in front of the homes they own (rented or empty)
    const lets = of(['rented', 'vacant']);
    const nLandlords = Math.min(lets.length, clamp(Math.round((p.landlords / p.households) * 14), p.landlords > 0 ? 1 : 0, 6));
    this.landlords.place(spread(lets, nLandlords).map((i) => frontSpot(slots[i], 0.35, 0.35)));

    // Fund agents next to fund-owned buildings
    const fundSlots = of(['fundRented', 'fundVacant']);
    const nFunds = Math.min(fundSlots.length * 2, clamp(Math.round(p.fundHomes / 2500), p.fundHomes > 200 ? 1 : 0, 6));
    const fundSpots = [];
    for (let k = 0; k < nFunds; k++) {
      fundSpots.push(frontSpot(slots[fundSlots[k % fundSlots.length]], 0.35, k < fundSlots.length ? -0.3 : 0.15));
    }
    this.funds.place(fundSpots);

    // Builders around construction sites (one figure ≈ 100 workers)
    const sites = of(['construction']);
    const nBuilders = Math.min(sites.length * 5, Math.round(p.builders / 100));
    const builderSpots = [];
    for (let k = 0; k < nBuilders; k++) {
      const slot = slots[sites[k % sites.length]];
      const ring = Math.floor(k / sites.length);
      const lateral = [-0.45, 0.45, 0, -0.75, 0.75][ring % 5];
      builderSpots.push(frontSpot(slot, 0.25 + (ring % 2) * 0.25, lateral));
    }
    this.builders.place(builderSpots);
  }

  tick(dt) {
    this.t += dt;
    this.builders.items.forEach((b, i) => {
      if (b.visible) b.rotation.z = Math.sin(this.t * 6 + i) * 0.08; // hammering
    });
    this.standing.items.forEach((f, i) => {
      if (f.visible) f.rotation.z = Math.sin(this.t * 0.8 + i) * 0.03; // shifting weight
    });
  }
}

// Pick `n` items spread evenly over `list`.
function spread(list, n) {
  if (n <= 0) return [];
  const step = list.length / n;
  return Array.from({ length: n }, (_, k) => list[Math.floor(k * step)]);
}
