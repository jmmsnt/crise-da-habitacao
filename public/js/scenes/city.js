// Lisboa: a few terraced blocks climbing a hill above the Tejo, the castle on
// top, a square on the riverfront, the river, the 25 de Abril bridge and a yellow tram.

import * as THREE from 'three';
import {
  BaseScene, Building, SlotAllocator, StreetTrash, slotCounts, streetLevels, box, mesh, mat, tree, label, seeded,
} from './kit.js';
import { RegionPopulation, squareSpots } from './population.js';

const TIERS = [0, 1.2, 2.4];
const SLOT_W = 1.7;
const SLOT_D = 1.7;
// Main square on the riverfront (west end), with a statue in the middle
const SQUARE = { x0: -17.6, x1: -10.6, z0: 2.2, z1: 8.4, centre: [-14.1, 5.3] };

export class CityScene extends BaseScene {
  constructor(renderer, labelsHost) {
    super(renderer, labelsHost, {
      background: '#DCEBF5',
      camera: [15, 21, 37],
      target: [-3, 1.2, 0],
      orbit: { minDistance: 14, maxDistance: 62, azimuth: 0.9, maxPolar: 1.2 },
    });
    const rand = seeded(1147);
    this.rand = rand;
    this.buildTerrain(rand);
    this.buildLandmarks(rand);
    this.buildSlots(rand);

    this.population = new RegionPopulation(this.scene, {
      square: squareSpots({
        x0: SQUARE.x0 + 0.4, x1: SQUARE.x1 - 0.3, z0: SQUARE.z0 + 0.4, z1: SQUARE.z1 - 0.2, y: 0.03,
        centre: SQUARE.centre,
        reject: (x, z) => Math.hypot(x - SQUARE.centre[0], z - SQUARE.centre[1]) < 1,
      }),
    });

    this.trash = new StreetTrash(this.scene, {
      rand,
      areas: [
        { x0: -16, x1: 16, z0: 7.3, z1: 8.3, y: 0.02 },
        { x0: -10, x1: 10, z0: 1.5, z1: 2.9, y: 0.02 },
        { x0: -16, x1: 16, z0: -5.5, z1: -3.9, y: 1.22 },
        { x0: 1.2, x1: 16, z0: -6.7, z1: -5.95, y: 2.42 },
        { x0: SQUARE.x0, x1: SQUARE.x1, z0: SQUARE.z0, z1: SQUARE.z1, y: 0.03 },
      ],
      reject: (x, z) => Math.abs(x) < 1.3 || (x > 10.4 && z > 2.6 && z < 7.2) || Math.hypot(x - SQUARE.centre[0], z - SQUARE.centre[1]) < 1,
    });
  }

  buildTerrain(rand) {
    const s = this.scene;
    // Riverfront level, then two terraces up the hill and the hills behind
    s.add(box(120, 0.4, 50, '#E4DACA', { y: -0.4, cast: false }).translateZ(-15));
    s.add(box(32, 1.2, 14.2, '#E0D4C0', { cast: false }).translateZ(-5.9));
    s.add(box(32, 2.4, 7.2, '#DCCFB9', { cast: false }).translateZ(-9.4));
    s.add(box(120, 3.6, 30, '#D6C9B2', { cast: false }).translateZ(-28));

    // Streets (lighter calçada) and the main square
    const street = '#F1EBE0';
    s.add(box(SQUARE.x1 - SQUARE.x0, 0.03, SQUARE.z1 - SQUARE.z0, '#F4EEE2', { cast: false }).translateX((SQUARE.x0 + SQUARE.x1) / 2).translateZ((SQUARE.z0 + SQUARE.z1) / 2));
    const statue = new THREE.Group();
    statue.add(box(1, 0.9, 1, '#DCD3C2'));
    statue.add(box(0.7, 0.45, 0.3, '#5E6B5A', { y: 0.9 }));
    statue.add(box(0.22, 0.6, 0.22, '#5E6B5A', { y: 1.3 }));
    statue.position.set(SQUARE.centre[0], 0, SQUARE.centre[1]);
    s.add(statue);
    s.add(box(32, 0.02, 2.8, street, { cast: false }).translateZ(8.6));
    s.add(box(32, 0.02, 1.6, street, { cast: false }).translateZ(2.2));
    s.add(box(32, 0.02, 1.8, street, { y: 1.2, cast: false }).translateZ(-4.7));
    s.add(box(32, 0.02, 1.0, street, { y: 2.4, cast: false }).translateZ(-6.3));
    // Escadinhas: stairs up the middle of the hill
    for (let i = 1; i < 6; i++) {
      s.add(box(2.2, 1.2 - 0.2 * i, 0.3, '#E9E1D2', { cast: false }).translateZ(1.2 + 0.15 + 0.3 * (i - 1)));
      s.add(box(2.2, 2.4 - 0.2 * i, 0.3, '#E9E1D2', { cast: false }).translateZ(-5.8 + 0.15 + 0.3 * (i - 1)));
    }

    // River Tejo and the quay
    const water = mesh(new THREE.PlaneGeometry(240, 120).rotateX(-Math.PI / 2), mat('#6AA2C8'), { cast: false });
    water.position.set(0, -0.3, 70);
    s.add(water);
    this.water = water;
    s.add(box(120, 0.5, 0.4, '#CBBFA8', { y: -0.4 }).translateZ(10.1));

    // Far bank (Almada) and Cristo Rei
    s.add(box(240, 2, 30, '#B7B48F', { y: -0.5, cast: false }).translateZ(62));
    const cristo = new THREE.Group();
    cristo.add(box(1, 5, 1, '#E6E0D4'));
    cristo.add(box(0.35, 1.2, 0.35, '#E6E0D4', { y: 5 }));
    cristo.add(box(1.4, 0.2, 0.25, '#E6E0D4', { y: 5.8 }));
    cristo.position.set(-12, 1.5, 50);
    s.add(cristo);

    // 25 de Abril bridge
    const red = '#C0392B';
    const bridge = new THREE.Group();
    const x = -18;
    bridge.add(box(1.2, 0.3, 43, red, { y: 3 }).translateZ(31.5));
    for (const z of [16, 44]) {
      bridge.add(box(0.35, 9, 0.35, red).translateZ(z).translateX(-0.5));
      bridge.add(box(0.35, 9, 0.35, red).translateZ(z).translateX(0.5));
      bridge.add(box(1.4, 0.3, 0.4, red, { y: 8.3 }).translateZ(z));
    }
    for (const side of [-0.5, 0.5]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side, 3.3, 10.5), new THREE.Vector3(side, 9, 16), new THREE.Vector3(side, 3.6, 30),
        new THREE.Vector3(side, 9, 44), new THREE.Vector3(side, 3.3, 52),
      ]);
      bridge.add(mesh(new THREE.TubeGeometry(curve, 60, 0.06, 5), mat(red), { receive: false }));
    }
    bridge.position.x = x;
    s.add(bridge);

    // Hills of the city behind: small pastel blocks with terracotta tops
    const pastel = ['#F2DDB0', '#EBC6C1', '#DDE1E4', '#E9D3A6', '#CFE0D6', '#F0E6D8'];
    for (let i = 0; i < 110; i++) {
      const bx = -40 + rand() * 80;
      const bz = -15 - rand() * 14;
      const h = 0.5 + rand() * 1.3;
      const size = 0.9 + rand() * 0.6;
      const b = box(size, h, size, pastel[i % pastel.length], { y: 3.6, cast: false });
      b.position.set(bx, 0, bz);
      s.add(b);
      const top = box(size + 0.08, 0.1, size + 0.08, '#D08A68', { y: 3.6 + h, cast: false });
      top.position.set(bx, 0, bz);
      s.add(top);
    }

    // Jacarandas on the riverfront and on the terraces
    for (let i = 1; i < 10; i++) {
      const t = tree('jacaranda', rand);
      t.position.set(-12.5 + i * 2.8, 0, 7.4);
      s.add(t);
    }
    for (const [tx, tz, ty] of [[-11.2, -4.9, 1.2], [11.2, -4.9, 1.2], [-1.6, -4.9, 1.2], [1.6, 2.2, 0], [-9.8, 2.2, 0]]) {
      const t = tree('jacaranda', rand);
      t.position.set(tx, ty, tz);
      s.add(t);
    }

    // Tram rails along the riverfront
    for (const dz of [-0.25, 0.25]) s.add(box(34, 0.03, 0.05, '#8D8A86', { cast: false }).translateZ(8.9 + dz));
  }

  buildLandmarks(rand) {
    const s = this.scene;

    // Castelo de São Jorge
    const castle = new THREE.Group();
    const stone = '#CDBF9F';
    castle.add(box(6.6, 1.3, 0.4, stone).translateZ(-6.9));
    castle.add(box(6.6, 1.3, 0.4, stone).translateZ(-11.6));
    castle.add(box(0.4, 1.3, 5, stone).translateX(-9.3).translateZ(-9.25));
    castle.add(box(0.4, 1.3, 5, stone).translateX(-3).translateZ(-9.25));
    for (let i = 0; i < 12; i++) {
      castle.add(box(0.25, 0.25, 0.42, stone, { y: 1.3 }).translateX(-9 + i * 0.55).translateZ(-6.9));
    }
    for (const [tx, tz] of [[-9.3, -6.9], [-3, -6.9], [-9.3, -11.6], [-3, -11.6], [-6.2, -9.3]]) {
      castle.add(box(1, 2.1, 1, '#C5B693').translateX(tx).translateZ(tz));
    }
    const pole = box(0.04, 1, 0.04, '#666', { y: 2.1 });
    pole.position.set(-6.2, 0, -9.3);
    castle.add(pole);
    const flag = box(0.5, 0.3, 0.02, '#1E7B3A', { y: 2.8 });
    flag.position.set(-5.95, 0, -9.3);
    castle.add(flag);
    castle.position.y = 2.4;
    s.add(castle);
    for (let i = 0; i < 4; i++) {
      const t = tree('pine', rand);
      t.position.set(-8.2 + i * 1.5, 2.4, -8.6 - (i % 2) * 1.2);
      s.add(t);
    }

    // School with a sports court (riverfront level, east)
    const school = new THREE.Group();
    school.add(box(3.6, 1.6, 2.6, '#F3E3B3'));
    school.add(box(3.62, 0.25, 2.62, '#3E7CB1', { y: 1.0 }));
    school.add(box(3.8, 0.1, 2.8, '#ECE8DF', { y: 1.6 }));
    const court = box(3.6, 0.03, 1.5, '#6FAF6A', { cast: false });
    court.position.z = 2.1;
    school.add(court);
    school.add(box(3.2, 0.035, 0.04, '#FFFFFF', { cast: false }).translateZ(2.1));
    school.position.set(12.6, 0, 4.1);
    s.add(school);
    this.schoolLabel = label('');
    this.schoolLabel.position.set(12.6, 2.6, 4.1);
    s.add(this.schoolLabel);
    this.schoolSite = this.siteMarker(15.2, 0, 4.1);

    // Hospital (first terrace, west)
    const hospital = new THREE.Group();
    hospital.add(box(3.4, 3.2, 3, '#F7F7F4'));
    hospital.add(box(3.42, 0.15, 3.02, '#9FC4D8', { y: 1.1 }));
    hospital.add(box(3.42, 0.15, 3.02, '#9FC4D8', { y: 2.2 }));
    hospital.add(box(0.9, 0.25, 0.25, '#D7263D', { y: 3.2 }));
    hospital.add(box(0.25, 0.25, 0.9, '#D7263D', { y: 3.2 }));
    hospital.position.set(-12.6, 1.2, -2);
    s.add(hospital);
    this.hospitalLabel = label('');
    this.hospitalLabel.position.set(-12.6, 5.2, -2);
    s.add(this.hospitalLabel);
    this.hospitalSite = this.siteMarker(-12.6, 1.2, -5.2);

    // Tram and ferry
    const tram = new THREE.Group();
    tram.add(box(1.7, 0.75, 0.62, '#F5C518', { y: 0.12 }));
    tram.add(box(1.72, 0.22, 0.64, '#F7F3E8', { y: 0.55 }));
    tram.add(box(1.5, 0.08, 0.5, '#E9E4D6', { y: 0.87 }));
    for (let i = 0; i < 4; i++) tram.add(box(0.28, 0.2, 0.66, '#5A7180', { y: 0.55 }).translateX(-0.6 + i * 0.4));
    tram.position.set(0, 0, 8.9);
    s.add(tram);
    this.tram = tram;

    const ferry = new THREE.Group();
    ferry.add(box(2.6, 0.5, 1, '#F07F2B'));
    ferry.add(box(1.6, 0.5, 0.8, '#F7F3E8', { y: 0.5 }));
    ferry.position.set(0, -0.3, 20);
    s.add(ferry);
    this.ferry = ferry;
    this.t = 0;
  }

  siteMarker(x, y, z) {
    const g = new THREE.Group();
    g.add(box(1.4, 0.9, 1.4, '#CFCAC1'));
    const lines = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, 1.4, 1.5)),
      new THREE.LineBasicMaterial({ color: '#F08A3C' }),
    );
    lines.position.y = 0.7;
    g.add(lines);
    g.position.set(x, y, z);
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  buildSlots(rand) {
    // Blocks in the order neighbourhoods are laid out: owners start up the hill,
    // landlords and funds fill the riverfront, public housing sits on the first terrace (west).
    const left = [-8.5, -6.7, -4.9, -3.1];
    const right = [3.1, 4.9, 6.7, 8.5];
    const blocks = [
      { y: TIERS[2], front: -7.7, back: -9.5, xs: right },
      { y: TIERS[1], front: -0.9, back: -2.7, xs: right },
      { y: TIERS[0], front: 5.9, back: 4.1, xs: [...right].reverse() },
      { y: TIERS[0], front: 5.9, back: 4.1, xs: [...left].reverse() },
      { y: TIERS[1], front: -0.9, back: -2.7, xs: left },
    ];
    const slots = [];
    for (const b of blocks) {
      // Snake: along the front row, then back along the back row, so runs stay together
      for (const x of b.xs) slots.push({ x, y: b.y, z: b.front, w: SLOT_W, d: SLOT_D, fx: 0, fz: 1 });
      for (const x of [...b.xs].reverse()) slots.push({ x, y: b.y, z: b.back, w: SLOT_W, d: SLOT_D, fx: 0, fz: -1 });
    }
    this.slots = slots;
    this.allocator = new SlotAllocator(slots);
    this.buildings = slots.map((slot, i) => {
      const b = new Building({ style: 'city', w: SLOT_W - 0.08, d: SLOT_D - 0.08, floors: 3 + Math.floor(rand() * 3), rand, crane: i % 3 === 0 });
      b.group.position.set(slot.x, slot.y, slot.z);
      b.group.rotation.y = slot.fz < 0 ? Math.PI : 0;
      this.scene.add(b.group);
      return b;
    });
  }

  update(state) {
    const region = state.regions.city;
    const assign = this.allocator.update(slotCounts(region));
    this.buildings.forEach((b, i) => b.setCategory(assign[i]));
    this.population.update(region, this.slots, assign);
    const street = streetLevels(state);
    this.setMood(street.sadness);
    this.trash.update(street.trash);

    const inf = region.infra;
    const project = (type) => inf.projects.find((p) => p.type === type);
    this.schoolLabel.element.textContent = `Escolas ×${inf.schools} · ${Math.round(inf.schoolCoverage * 100)}% de cobertura`;
    this.hospitalLabel.element.textContent = `Hospitais ×${inf.hospitals} · ${Math.round(inf.hospitalCoverage * 100)}% de cobertura`;
    this.schoolSite.visible = !!project('school');
    this.hospitalSite.visible = !!project('hospital');
    this.trafficLevel = inf.transport / 100;
  }

  tick(dt) {
    this.t += dt;
    for (const b of this.buildings) b.tick(dt);
    this.population.tick(dt);
    this.tickClouds(dt);
    // Tram goes back and forth along the riverfront; faster with better transport
    const speed = 0.08 + 0.1 * (this.trafficLevel ?? 0.7);
    this.tram.position.x = Math.sin(this.t * speed) * 15;
    this.ferry.position.x = -6 + Math.sin(this.t * 0.03) * 22;
    this.ferry.position.z = 22 + Math.cos(this.t * 0.03) * 6;
    this.ferry.rotation.y = Math.cos(this.t * 0.03) > 0 ? 0 : Math.PI;
  }
}
