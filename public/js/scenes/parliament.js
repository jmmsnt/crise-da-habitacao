// Assembleia da República: the hemicycle with 230 deputies. When a law is put
// to the vote, deputies light up green / red / yellow and those in favour stand up.

import * as THREE from 'three';
import { BaseScene, box, mesh, mat } from './kit.js';

const SEATS = 230;
const ROWS = 8;
const STEP = 0.26;
const THETA = 1.75; // half-angle of the hemicycle (radians)

// Parliamentary groups from left to right (seats sum to 230)
const PARTIES = [
  ['#B5232F', 6], ['#D23B3B', 5], ['#5FA35A', 6], ['#E8628A', 58],
  ['#2BA6A0', 1], ['#F08A3C', 89], ['#2C9FD9', 9], ['#1F3A6E', 56],
];
const VOTE = { yes: new THREE.Color('#3BB273'), against: new THREE.Color('#E15554'), abstain: new THREE.Color('#E1BC29') };

function tierGeometry(rInner, rOuter, height) {
  const a0 = -THETA - 0.05 - Math.PI / 2;
  const a1 = THETA + 0.05 - Math.PI / 2;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter, a0, a1, false);
  shape.absarc(0, 0, rInner, a1, a0, true);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 48 }).rotateX(-Math.PI / 2);
}

export class ParliamentScene extends BaseScene {
  constructor(renderer, labelsHost) {
    super(renderer, labelsHost, {
      background: '#F1EBE2',
      fog: [40, 90],
      camera: [0, 11, -12.5],
      target: [0, 1, 4.2],
      orbit: { minDistance: 8, maxDistance: 26, azimuth: 0.85, minPolar: 0.4, maxPolar: 1.3 },
      clouds: false,
    });
    const s = this.scene;
    s.add(box(60, 0.2, 60, '#E6DCCB', { y: -0.2, cast: false }));
    s.add(box(1.8, 0.02, 9, '#9E2A2B', { cast: false }).translateZ(-5));

    // Tiers
    const radii = Array.from({ length: ROWS }, (_, i) => 3.6 + i * 0.74);
    radii.forEach((r, i) => s.add(mesh(tierGeometry(r - 0.37, r + 0.37, (i + 1) * STEP), mat(i % 2 ? '#C9A27A' : '#C29A70'))));

    // Seats per row in proportion to the radius
    const total = radii.reduce((a, b) => a + b, 0);
    const counts = radii.map((r) => Math.floor((r / total) * SEATS));
    for (let i = ROWS - 1; counts.reduce((a, b) => a + b, 0) < SEATS; i--) counts[i] += 1;

    const seats = [];
    radii.forEach((r, row) => {
      const n = counts[row];
      for (let k = 0; k < n; k++) {
        const theta = -THETA + ((k + 0.5) / n) * THETA * 2;
        seats.push({ theta, x: r * Math.sin(theta), z: r * Math.cos(theta), y: (row + 1) * STEP });
      }
    });
    // Left-wing parties sit on the president's left (+x)
    seats.sort((a, b) => b.theta - a.theta);
    let p = 0;
    let left = PARTIES[0][1];
    for (const seat of seats) {
      if (left === 0) left = PARTIES[++p][1];
      seat.party = new THREE.Color(PARTIES[p][0]);
      left--;
    }
    this.seats = seats;

    const seatGeo = new THREE.BoxGeometry(0.34, 0.14, 0.32);
    const backGeo = new THREE.BoxGeometry(0.34, 0.3, 0.06);
    const bodyGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.32, 8);
    const headGeo = new THREE.SphereGeometry(0.08, 10, 8);
    this.seatMesh = new THREE.InstancedMesh(seatGeo, mat('#A3262A'), SEATS);
    this.backMesh = new THREE.InstancedMesh(backGeo, mat('#8C1F23'), SEATS);
    this.bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), SEATS);
    this.heads = new THREE.InstancedMesh(headGeo, mat('#E8C4A0'), SEATS);
    for (const m of [this.seatMesh, this.backMesh, this.bodies, this.heads]) {
      m.castShadow = true;
      m.receiveShadow = true;
      s.add(m);
    }
    this.standing = new Float32Array(SEATS);
    this.layout(true);
    seats.forEach((seat, i) => this.bodies.setColorAt(i, seat.party));
    this.bodies.instanceColor.needsUpdate = true;

    // President's table and speaker's podium
    s.add(box(4.6, 0.9, 1.2, '#F4F0E8').translateZ(0.2));
    s.add(box(4.8, 0.08, 1.35, '#B98E62', { y: 0.9 }).translateZ(0.2));
    s.add(box(1.1, 0.75, 0.6, '#F4F0E8').translateZ(1.6));
    s.add(box(1.2, 0.06, 0.7, '#B98E62', { y: 0.75 }).translateZ(1.6));

    // Portuguese flag
    s.add(box(0.04, 2.6, 0.04, '#8D8A86').translateX(-3.2).translateZ(1.2));
    const flag = new THREE.Group();
    flag.add(box(0.32, 0.54, 0.02, '#046A38'));
    flag.add(box(0.48, 0.54, 0.02, '#DA291C').translateX(0.4));
    const sphere = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 20).rotateX(Math.PI / 2), mat('#F4C430'));
    sphere.position.set(0.16, 0.27, 0);
    flag.add(sphere);
    flag.position.set(-3.6, 2.0, 1.2);
    s.add(flag);

    // Colonnade, entablature and back wall around the chamber
    const R = radii[ROWS - 1] + 1.2;
    for (let i = 0; i <= 16; i++) {
      const theta = -THETA - 0.15 + (i / 16) * (THETA + 0.15) * 2;
      const col = mesh(new THREE.CylinderGeometry(0.16, 0.19, 3.4, 14).translate(0, 1.7 + ROWS * STEP, 0), mat('#FAF7F0'));
      col.position.set(R * Math.sin(theta), 0, R * Math.cos(theta));
      s.add(col);
    }
    const band = mesh(
      new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.7, 64, 1, true, -THETA - 0.3, (THETA + 0.3) * 2),
      mat('#F3EEE4', { side: THREE.DoubleSide }),
    );
    band.position.y = 3.4 + ROWS * STEP + 0.35;
    s.add(band);
    const wall = mesh(
      new THREE.CylinderGeometry(R + 0.9, R + 0.9, 7, 64, 1, true, -THETA - 0.3, (THETA + 0.3) * 2),
      mat('#E9DFCF', { side: THREE.DoubleSide }),
      { cast: false },
    );
    wall.position.y = 3.5;
    s.add(wall);
    s.add(
      mesh(new THREE.CylinderGeometry(R - 0.6, R - 0.6, ROWS * STEP, 64, 1, true, -THETA - 0.05, (THETA + 0.05) * 2), mat('#D7C7AE', { side: THREE.DoubleSide })).translateY(
        (ROWS * STEP) / 2,
      ),
    );
    s.add(mesh(tierGeometry(R - 0.6, R + 0.9, ROWS * STEP), mat('#D7C7AE')));

    this.vote = null;
    this.t = 0;
  }

  layout(force = false) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    this.seats.forEach((seat, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), seat.theta + Math.PI);
      if (force) {
        this.seatMesh.setMatrixAt(i, m.compose(v.set(seat.x, seat.y + 0.07, seat.z), q, one));
        const bx = seat.x + Math.sin(seat.theta) * 0.16;
        const bz = seat.z + Math.cos(seat.theta) * 0.16;
        this.backMesh.setMatrixAt(i, m.compose(v.set(bx, seat.y + 0.22, bz), q, one));
      }
      const up = this.standing[i] * 0.16;
      this.bodies.setMatrixAt(i, m.compose(v.set(seat.x, seat.y + 0.28 + up, seat.z), q, one));
      this.heads.setMatrixAt(i, m.compose(v.set(seat.x, seat.y + 0.52 + up, seat.z), q, one));
    });
    this.seatMesh.instanceMatrix.needsUpdate = true;
    this.backMesh.instanceMatrix.needsUpdate = true;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  // Show the outcome of a vote: { yes, abstain, against }. Parties vote in blocks.
  showVote({ yes, abstain }) {
    const n = this.seats.length;
    const start = Math.floor(Math.random() * n);
    const outcome = new Array(n);
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      outcome[i] = k < yes ? 'yes' : k < yes + abstain ? 'abstain' : 'against';
    }
    this.vote = { outcome, t: 0 };
  }

  tick(dt) {
    this.t += dt;
    if (!this.vote) return;
    const v = this.vote;
    v.t += dt;
    const f = v.t < 0.5 ? v.t / 0.5 : v.t < 6 ? 1 : Math.max(0, 1 - (v.t - 6) / 1.2);
    const c = new THREE.Color();
    this.seats.forEach((seat, i) => {
      const target = VOTE[v.outcome[i]];
      this.bodies.setColorAt(i, c.copy(seat.party).lerp(target, f));
      this.standing[i] = v.outcome[i] === 'yes' ? f : 0;
    });
    this.bodies.instanceColor.needsUpdate = true;
    this.layout();
    if (f === 0 && v.t > 6) this.vote = null;
  }
}
