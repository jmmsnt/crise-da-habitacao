// The countryside (interior): a village around the town hall and its square,
// scattered farms in the fields, cork oaks, the railway, stilt huts on the river.

import * as THREE from 'three';
import {
  BaseScene, Building, SlotAllocator, StreetTrash, slotCounts, streetLevels, box, mesh, mat, tree, label, seeded,
} from './kit.js';
import { RegionPopulation, squareSpots } from './population.js';

const SLOT_W = 1.8;
const SLOT_D = 1.4;
const VILLAGE = { x0: -14, x1: 14, z0: -8.5, z1: 5 };
const RAIL_Z = -14;
const ROAD_Z = -11.4;
const SQUARE_TREES = [[-4.2, -0.4], [4.2, -0.4], [-6.5, -3.6], [6.5, -3.6]];

function inVillage(x, z, pad = 0) {
  return x > VILLAGE.x0 - pad && x < VILLAGE.x1 + pad && z > VILLAGE.z0 - pad && z < VILLAGE.z1 + pad;
}

export class CountrysideScene extends BaseScene {
  constructor(renderer, labelsHost) {
    super(renderer, labelsHost, {
      background: '#E4EEF0',
      camera: [22, 20, 34],
      target: [-1, 0, -3],
      orbit: { minDistance: 14, maxDistance: 62, azimuth: 1.0, maxPolar: 1.2 },
    });
    const rand = seeded(2027);
    this.slots = [];
    this.buildLand(rand);
    this.buildVillage(rand);
    this.buildRiver(rand);
    this.buildTransport();
    this.placeSlots(rand);
    this.scatterTrees(rand);

    const nearTree = (x, z) => SQUARE_TREES.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 0.8);
    const nearHall = (x, z) => Math.abs(x) < 2.7 && z < -1.9 && z > -5;
    this.population = new RegionPopulation(this.scene, {
      square: squareSpots({
        x0: -10, x1: 10, z0: -4.2, z1: 1.1, y: 0.03, step: 0.8, centre: [0, -0.6],
        reject: (x, z) => nearHall(x, z) || nearTree(x, z),
      }),
    });
    this.trash = new StreetTrash(this.scene, {
      rand,
      areas: [{ x0: -13.5, x1: 13.5, z0: -8, z1: 4.6, y: 0.03 }],
      reject: (x, z) =>
        nearHall(x, z) ||
        nearTree(x, z) ||
        this.slots.some((sl) => Math.abs(sl.x - x) < 1.15 && Math.abs(sl.z - z) < 1.0),
    });
  }

  buildLand(rand) {
    const s = this.scene;
    s.add(box(200, 0.4, 110, '#CBD39C', { y: -0.4, cast: false }).translateZ(-46));
    // Lezíria patchwork: wheat, rice paddies, pasture, ploughed fields
    const crops = ['#B7C97A', '#D9C27A', '#9EC2A6', '#C2A27A', '#A8BF6E', '#E0CF8E'];
    for (let x = -46; x < 46; x += 6) {
      for (let z = -34; z < 8; z += 4.6) {
        const cx = x + 3;
        const cz = z + 2.3;
        if (inVillage(cx, cz, 2) || Math.abs(cz - RAIL_Z) < 3.2 || Math.abs(cz - ROAD_Z) < 1.2) continue;
        const color = crops[Math.floor(rand() * crops.length)];
        const f = box(5.5 + rand() * 0.2, 0.04, 4.1, color, { cast: false });
        f.position.set(cx, 0, cz);
        s.add(f);
        if (color === '#9EC2A6') {
          const shine = box(4.6, 0.045, 3.2, '#B9D9DA', { cast: false });
          shine.position.set(cx, 0, cz);
          s.add(shine);
        }
      }
    }
    // Village square and streets
    s.add(box(28, 0.03, 13.2, '#E9E2D2', { cast: false }).translateZ(-1.7));
    // Bulls grazing — tiny black silhouettes
    for (let i = 0; i < 5; i++) {
      const bull = new THREE.Group();
      bull.add(box(0.7, 0.32, 0.3, '#2A2624', { y: 0.22 }));
      bull.add(box(0.22, 0.22, 0.22, '#2A2624', { y: 0.36 }).translateX(0.42));
      for (const lx of [-0.25, 0.25]) for (const lz of [-0.1, 0.1]) bull.add(box(0.06, 0.22, 0.06, '#2A2624').translateX(lx).translateZ(lz));
      bull.position.set(-30 + rand() * 8, 0, -24 + rand() * 6);
      bull.rotation.y = rand() * Math.PI * 2;
      s.add(bull);
    }
  }

  buildVillage() {
    const s = this.scene;
    // Câmara Municipal (town hall): two storeys, clock tower, portico and flags, facing the square
    const hall = new THREE.Group();
    hall.add(box(4.6, 2.2, 1.8, '#FBF8F1'));
    hall.add(box(4.64, 0.25, 1.84, '#E2C77E', { y: 1.05 })); // ochre band between floors
    hall.add(box(4.8, 0.14, 2.0, '#E9E2D2', { y: 2.2 })); // cornice
    hall.add(mesh(
      new THREE.ExtrudeGeometry(
        new THREE.Shape([new THREE.Vector2(-2.4, 0), new THREE.Vector2(2.4, 0), new THREE.Vector2(0, 0.6)]),
        { depth: 1.9, bevelEnabled: false },
      ).translate(0, 2.34, -0.95),
      mat('#C4683F'),
    ));
    hall.add(box(1.1, 1.3, 1.1, '#FBF8F1', { y: 2.3 })); // clock tower
    hall.add(mesh(new THREE.ConeGeometry(0.85, 0.6, 4).rotateY(Math.PI / 4).translate(0, 3.9, 0), mat('#C4683F')));
    const clock = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20).rotateX(Math.PI / 2), mat('#F4F1EA'));
    clock.position.set(0, 3.1, 0.57);
    hall.add(clock);
    hall.add(box(0.03, 0.2, 0.02, '#333', { y: 3.1 }).translateZ(0.6));
    for (let i = 0; i < 4; i++) {
      const col = mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.05, 10).translate(0, 0.52, 0), mat('#F4F1EA'));
      col.position.set(-0.9 + i * 0.6, 0, 1.25);
      hall.add(col);
    }
    hall.add(box(2.2, 0.12, 0.7, '#E9E2D2', { y: 1.05 }).translateZ(1.25)); // balcony over the portico
    for (let i = 0; i < 5; i++) {
      hall.add(box(0.36, 0.5, 0.04, i === 2 ? '#2F5D8A' : '#9FB6CC', { y: i === 2 ? 0 : 0.35 }).translateX(-1.6 + i * 0.8).translateZ(0.91));
      hall.add(box(0.36, 0.5, 0.04, '#9FB6CC', { y: 1.45 }).translateX(-1.6 + i * 0.8).translateZ(0.91));
    }
    for (const [fx, colors] of [[-0.5, ['#046A38', '#DA291C']], [0.5, ['#2F5D8A', '#F4C430']]]) {
      hall.add(box(0.03, 1.1, 0.03, '#8D8A86', { y: 1.15 }).translateX(fx).translateZ(1.5));
      hall.add(box(0.2, 0.28, 0.02, colors[0], { y: 1.95 }).translateX(fx + 0.11).translateZ(1.5));
      hall.add(box(0.2, 0.28, 0.02, colors[1], { y: 1.95 }).translateX(fx + 0.31).translateZ(1.5));
    }
    hall.position.set(0, 0, -3.6);
    s.add(hall);

    // School (west) and health centre (east)
    const school = new THREE.Group();
    school.add(box(3.6, 1.2, 2.2, '#FBF8F1'));
    school.add(box(3.62, 0.3, 2.22, '#3E7CB1'));
    school.add(box(3.8, 0.1, 2.4, '#ECE8DF', { y: 1.2 }));
    const court = box(2.6, 0.03, 1.6, '#6FAF6A', { cast: false });
    court.position.z = 2.2;
    school.add(court);
    school.position.set(-17.5, 0, -2.4);
    s.add(school);
    this.schoolLabel = label('');
    this.schoolLabel.position.set(-17.5, 2.1, -2.4);
    s.add(this.schoolLabel);
    this.schoolSite = this.siteMarker(-17.5, 0, -5.6);

    const health = new THREE.Group();
    health.add(box(3, 1.5, 1.9, '#F7F7F4'));
    health.add(box(3.02, 0.15, 1.92, '#9FC4D8', { y: 0.7 }));
    health.add(box(0.8, 0.22, 0.22, '#D7263D', { y: 1.5 }));
    health.add(box(0.22, 0.22, 0.8, '#D7263D', { y: 1.5 }));
    health.position.set(8.5, 0, -9.4);
    s.add(health);
    this.hospitalLabel = label('');
    this.hospitalLabel.position.set(8.5, 2.4, -9.4);
    s.add(this.hospitalLabel);
    this.hospitalSite = this.siteMarker(12.4, 0, -9.4);
  }

  buildRiver(rand) {
    const s = this.scene;
    const water = mesh(new THREE.PlaneGeometry(260, 130).rotateX(-Math.PI / 2), mat('#73AACB'), { cast: false });
    water.position.set(0, -0.25, 74);
    s.add(water);
    // Mudflats and salt marsh along the estuary shore
    s.add(box(200, 0.06, 2.4, '#BFAE8E', { y: -0.3, cast: false }).translateZ(9.4));
    for (let i = 0; i < 18; i++) {
      const reed = box(0.8 + rand() * 1.6, 0.18, 0.5 + rand() * 0.6, '#9DAE72', { y: -0.25, cast: false });
      reed.position.set(-40 + rand() * 80, 0, 9.4 + rand() * 1.6);
      s.add(reed);
    }
    // Palafitas (stilt huts) and their walkway
    s.add(box(0.6, 0.08, 6, '#8A6A4A', { y: 0.55 }).translateX(-8).translateZ(12));
    const colors = ['#2F5D8A', '#C8553D', '#3BA99C', '#E2B23A'];
    for (let i = 0; i < 4; i++) {
      const hut = new THREE.Group();
      for (const px of [-0.45, 0.45]) for (const pz of [-0.4, 0.4]) hut.add(box(0.07, 1, 0.07, '#5C4630', { y: -0.4 }).translateX(px).translateZ(pz));
      hut.add(box(1.1, 0.75, 1, '#9C7B57', { y: 0.6 }));
      hut.add(box(0.3, 0.45, 0.02, colors[i], { y: 0.6 }).translateZ(0.51));
      hut.add(mesh(new THREE.ConeGeometry(0.85, 0.4, 4).rotateY(Math.PI / 4).translate(0, 1.55, 0), mat('#7E6248')));
      hut.position.set(-8 + (i % 2 ? 1.1 : -1.1), 0, 10.8 + i * 1.5);
      s.add(hut);
    }
    // Varino: traditional Tejo sailing boat
    const boat = new THREE.Group();
    boat.add(box(2.6, 0.35, 0.8, '#2B2A2E'));
    boat.add(box(0.06, 2.2, 0.06, '#5C4630', { y: 0.3 }));
    const sail = mesh(
      new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.5, 0.2), new THREE.Vector2(0.1, 1.9)])),
      mat('#C8553D', { side: THREE.DoubleSide }),
    );
    sail.position.y = 0.45;
    boat.add(sail);
    boat.position.set(0, -0.2, 24);
    s.add(boat);
    this.boat = boat;
  }

  buildTransport() {
    const s = this.scene;
    s.add(box(200, 0.12, 1.4, '#A9A196', { cast: false }).translateZ(RAIL_Z));
    for (const dz of [-0.3, 0.3]) s.add(box(200, 0.06, 0.06, '#6E6A66', { y: 0.12, cast: false }).translateZ(RAIL_Z + dz));
    s.add(box(200, 0.04, 1.6, '#A3A19B', { cast: false }).translateZ(ROAD_Z));
    for (let x = -60; x < 60; x += 2.4) s.add(box(1, 0.045, 0.08, '#F4F1EA', { cast: false }).translateX(x).translateZ(ROAD_Z));
    // Station
    const station = new THREE.Group();
    station.add(box(3.4, 1.2, 1.4, '#F3E3B3'));
    station.add(box(3.6, 0.12, 1.6, '#C4683F', { y: 1.2 }));
    station.add(box(6, 0.25, 0.9, '#D9D3C7').translateZ(1.25));
    station.position.set(4, 0, RAIL_Z - 2.1);
    s.add(station);

    const train = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const car = new THREE.Group();
      car.add(box(2.5, 0.8, 0.8, '#F2F2F0', { y: 0.15 }));
      car.add(box(2.52, 0.12, 0.82, '#2E6DA4', { y: 0.3 }));
      car.add(box(2.2, 0.22, 0.84, '#4A5A66', { y: 0.55 }));
      car.position.x = i * 2.65;
      train.add(car);
    }
    train.position.set(-80, 0, RAIL_Z);
    s.add(train);
    this.train = train;
    this.trainX = -80;
    this.trainWait = 2;

    this.cars = ['#C8553D', '#2F5D8A', '#F2F2F0', '#3BA99C'].map((c, i) => {
      const car = new THREE.Group();
      car.add(box(0.8, 0.3, 0.42, c, { y: 0.1 }));
      car.add(box(0.45, 0.22, 0.4, '#4A5A66', { y: 0.4 }));
      car.position.set(-50 + i * 25, 0, ROAD_Z + (i % 2 ? 0.4 : -0.4));
      car.userData.dir = i % 2 ? -1 : 1;
      s.add(car);
      return car;
    });
  }

  siteMarker(x, y, z) {
    const g = new THREE.Group();
    g.add(box(1.4, 0.7, 1.4, '#CFCAC1'));
    const lines = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.5, 1.1, 1.5)),
      new THREE.LineBasicMaterial({ color: '#F08A3C' }),
    );
    lines.position.y = 0.55;
    g.add(lines);
    g.position.set(x, y, z);
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  placeSlots(rand) {
    const add = (x, z, fx, fz, extra = {}) => this.slots.push({ x, y: 0, z, w: SLOT_W, d: SLOT_D, fx, fz, ...extra });
    const xs = [-9.4, -7.2, -5, -2.8, 2.8, 5, 7.2, 9.4];
    // A walk around the square: west side, north row, east side, south row, then the farms
    for (const z of [0.8, -1.4, -3.6]) add(-12.3, z, 1, 0);
    for (const x of xs) add(x, -6.2, 0, 1);
    for (const z of [-3.6, -1.4, 0.8]) add(12.3, z, -1, 0);
    for (const x of [...xs].reverse()) add(x, 3.0, 0, -1);
    // Montes: farmhouses out in the fields
    for (const [x, z] of [[14, 6.8], [5.5, 7.2], [-9.5, 7], [-18.5, 6.6], [-21, -7.5], [-24, -17], [-13, -18.5], [-3, -20.5], [8, -18.5], [16, -21]]) {
      add(x, z, 0, 1, { farm: true });
    }
    this.allocator = new SlotAllocator(this.slots);
    this.buildings = this.slots.map((slot, i) => {
      const b = new Building({ style: 'country', w: SLOT_W - 0.1, d: SLOT_D - 0.1, floors: 1, rand, crane: i % 4 === 1 });
      b.group.position.set(slot.x, 0, slot.z);
      b.group.rotation.y = Math.atan2(slot.fx, slot.fz);
      this.scene.add(b.group);
      if (slot.farm) {
        for (let k = 0; k < 2; k++) {
          const t = tree('cork', rand);
          t.position.set(slot.x + (k ? 2 : -1.8), 0, slot.z - 1.2 + k * 0.6);
          this.scene.add(t);
        }
      }
      return b;
    });
  }

  scatterTrees(rand) {
    for (let i = 0; i < 70; i++) {
      const x = -45 + rand() * 90;
      const z = -34 + rand() * 41;
      if (inVillage(x, z, 4) || Math.abs(z - RAIL_Z) < 2 || Math.abs(z - ROAD_Z) < 1.2) continue;
      if (this.slots.some((s) => Math.hypot(s.x - x, s.z - z) < 2.5)) continue;
      const t = tree(rand() < 0.75 ? 'cork' : 'pine', rand);
      t.position.set(x, 0, z);
      this.scene.add(t);
    }
    for (const [x, z] of SQUARE_TREES) {
      const t = tree('plain', rand);
      t.position.set(x, 0, z);
      this.scene.add(t);
    }
  }

  update(state) {
    const region = state.regions.countryside;
    const assign = this.allocator.update(slotCounts(region));
    this.buildings.forEach((b, i) => b.setCategory(assign[i]));
    this.population.update(region, this.slots, assign);
    const street = streetLevels(state);
    this.setMood(street.sadness);
    this.trash.update(street.trash);

    const inf = region.infra;
    this.schoolLabel.element.textContent = `Escolas ×${inf.schools} · ${Math.round(inf.schoolCoverage * 100)}% de cobertura`;
    this.hospitalLabel.element.textContent = `Centros de saúde ×${inf.hospitals} · ${Math.round(inf.hospitalCoverage * 100)}% de cobertura`;
    this.schoolSite.visible = inf.projects.some((p) => p.type === 'school');
    this.hospitalSite.visible = inf.projects.some((p) => p.type === 'hospital');
    this.transport = inf.transport / 100;
  }

  tick(dt) {
    for (const b of this.buildings) b.tick(dt);
    this.population.tick(dt);
    this.tickClouds(dt);

    // Trains run more often when roads & railways are better
    if (this.trainWait > 0) {
      this.trainWait -= dt;
    } else {
      this.trainX += dt * 9;
      if (this.trainX > 80) {
        this.trainX = -80;
        this.trainWait = 30 - 24 * (this.transport ?? 0.4);
      }
    }
    this.train.position.x = this.trainX;

    for (const car of this.cars) {
      car.position.x += car.userData.dir * dt * (2 + 3 * (this.transport ?? 0.4));
      if (car.position.x > 60) car.position.x = -60;
      if (car.position.x < -60) car.position.x = 60;
      car.rotation.y = car.userData.dir > 0 ? 0 : Math.PI;
    }

    this.boat.position.x += dt * 0.6;
    if (this.boat.position.x > 50) this.boat.position.x = -50;
  }
}
