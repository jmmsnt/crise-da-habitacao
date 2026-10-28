// Shared building blocks for the three scenes: palette, materials, buildings,
// people, trees, labels, the mood of the scene (quality of life), trash on the
// streets (government management) and the slot allocator that maps simulation
// counts to a fixed set of building plots.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Palette — the same colours are used by the HUD legend (see hud.js).
// A building's colour says who owns it; a darker, greyer version of that
// colour means the building is degraded; closed shutters mean it is empty.
// ---------------------------------------------------------------------------

export const OWNER_COLORS = {
  owner: '#F2C14E', // owned by the people who live there
  landlord: '#E58FA6', // owned by individual landlords
  fund: '#8A6FD1', // owned by investment funds
  public: '#3BA99C', // owned by the State
};

export function degradedColor(hex) {
  return `#${new THREE.Color(hex).lerp(new THREE.Color('#4B433D'), 0.6).getHexString()}`;
}

// Slot categories → owner and use
export const HOUSE_TYPES = {
  owner: { owner: 'owner', use: 'occupied' },
  rented: { owner: 'landlord', use: 'occupied' },
  vacant: { owner: 'landlord', use: 'vacant' },
  fundRented: { owner: 'fund', use: 'occupied' },
  fundVacant: { owner: 'fund', use: 'vacant' },
  degraded: { owner: 'landlord', use: 'degraded' },
  publicRented: { owner: 'public', use: 'occupied' },
  publicDegraded: { owner: 'public', use: 'degraded' },
};

export const CATEGORY_COLORS = {
  ...Object.fromEntries(
    Object.entries(HOUSE_TYPES).map(([cat, t]) => [cat, t.use === 'degraded' ? degradedColor(OWNER_COLORS[t.owner]) : OWNER_COLORS[t.owner]]),
  ),
  construction: '#F08A3C',
  land: '#B5C27E',
};

export const PEOPLE_COLORS = {
  homeless: '#6F7785',
  owner: '#C08A12',
  tenant: '#3F6FB5',
  landlord: '#B04A6E',
  fund: '#4E3D8F',
  builder: '#E07B2E',
};

const TERRACOTTA = '#C4683F';
const RUINED_TILES = '#7E5444';
const GOLD = '#E2B23A';

// Simulation region → counts per slot category
export function slotCounts(region) {
  const H = region.houses;
  const F = region.fund;
  const pl = region.pipeline;
  return {
    owner: H.ownerOccupied,
    rented: Math.max(0, H.rented - F.rented),
    vacant: Math.max(0, H.vacant - F.vacant),
    fundRented: F.rented,
    fundVacant: F.vacant,
    degraded: H.degraded + pl.renovationAwaitingLicence,
    publicRented: H.publicRented,
    publicDegraded: H.publicDegraded,
    construction: pl.underConstruction,
    land: region.land + pl.newAwaitingLicence,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const materials = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return materials.get(key);
}

export function mesh(geometry, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function box(w, h, d, color, { y = 0, cast = true, receive = true } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2 + y, 0);
  return mesh(g, typeof color === 'string' ? mat(color) : color, { cast, receive });
}

const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

// ---------------------------------------------------------------------------
// Mood: colourful things (blossoms, balcony flowers) lose their colour as
// quality of life falls. Shared by all scenes because quality of life is national.
// ---------------------------------------------------------------------------

const joyful = new Map();
export function joyMat(color) {
  if (!joyful.has(color)) {
    const m = new THREE.MeshLambertMaterial({ color });
    m.userData.base = new THREE.Color(color);
    joyful.set(color, m);
  }
  return joyful.get(color);
}

function setJoy(sadness) {
  const hsl = {};
  for (const m of joyful.values()) {
    m.userData.base.getHSL(hsl);
    m.color.setHSL(hsl.h, hsl.s * (1 - 0.8 * sadness), hsl.l * (1 - 0.25 * sadness));
  }
}

// How the street scenes look: sadness from quality of life, trash from government management.
export function streetLevels(state) {
  const ind = state.indicators;
  const s01 = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
  const services = s01(ind.publicServices, 35, 80);
  const qualityOfLife = 0.5 * services + 0.5 * (state.quality.money / 100); // money part of the score (R21)
  const management = 0.5 * services + 0.5 * (1 - (state.government.austerity ?? 0));
  return {
    qualityOfLife,
    management,
    sadness: clamp((0.75 - qualityOfLife) / 0.6, 0, 1),
    trash: clamp((0.9 - management) / 0.6, 0, 1),
  };
}

// ---------------------------------------------------------------------------
// Base scene: camera, orbit controls, lights, sky mood and a CSS2D label layer
// ---------------------------------------------------------------------------

const GREY_SKY = new THREE.Color('#A7AEB4');
const WARM_SUN = new THREE.Color('#fff1dc');
const COLD_SUN = new THREE.Color('#d3dae1');

export class BaseScene {
  constructor(renderer, labelsHost, { background, fog = [60, 140], camera, target, orbit = {}, clouds = true }) {
    this.scene = new THREE.Scene();
    this.sky = new THREE.Color(background);
    this.scene.background = this.sky.clone();
    this.scene.fog = new THREE.Fog(background, fog[0], fog[1]);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    this.camera.position.set(...camera);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(...target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = orbit.minDistance ?? 12;
    this.controls.maxDistance = orbit.maxDistance ?? 55;
    this.controls.minPolarAngle = orbit.minPolar ?? 0.35;
    this.controls.maxPolarAngle = orbit.maxPolar ?? 1.25;
    if (orbit.azimuth) {
      const az = Math.atan2(camera[0] - target[0], camera[2] - target[2]);
      this.controls.minAzimuthAngle = az - orbit.azimuth;
      this.controls.maxAzimuthAngle = az + orbit.azimuth;
    }
    this.controls.enabled = false;
    this.controls.update();

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels';
    this.labels.domElement.style.display = 'none';
    labelsHost.appendChild(this.labels.domElement);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#b9a990', 1.9);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#fff1dc', 2.3);
    sun.position.set(18, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 30;
    sc.bottom = -30;
    sc.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.sun = sun;

    // Clouds gather as quality of life falls
    this.clouds = [];
    if (clouds) {
      const rand = seeded(99);
      this.cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 });
      for (let i = 0; i < 14; i++) {
        const c = new THREE.Group();
        for (let k = 0; k < 4; k++) {
          const puff = mesh(new THREE.IcosahedronGeometry(1.4 + rand() * 1.2, 1), this.cloudMat, { receive: false });
          puff.position.set(k * 1.6 - 2.4, rand() * 0.6, (rand() - 0.5) * 1.4);
          puff.scale.y = 0.55;
          c.add(puff);
        }
        c.position.set(-36 + rand() * 72, 15 + rand() * 5, -30 + rand() * 50);
        c.userData.speed = 0.15 + rand() * 0.2;
        c.visible = false;
        this.scene.add(c);
        this.clouds.push(c);
      }
    }
  }

  setActive(active) {
    this.controls.enabled = active;
    this.labels.domElement.style.display = active ? '' : 'none';
  }

  // `panel` is the width in px covered by the side panel: shift the view so the
  // scene is centred in the remaining space.
  resize(width, height, panel = 0) {
    this.camera.aspect = (width + panel) / height;
    // On narrow (portrait) screens keep roughly the horizontal view of a 1.2:1 screen
    const tan = Math.tan(THREE.MathUtils.degToRad(19));
    this.camera.fov = this.camera.aspect < 1.2 ? Math.min(75, 2 * THREE.MathUtils.radToDeg(Math.atan((tan * 1.2) / this.camera.aspect))) : 38;
    if (panel > 0) this.camera.setViewOffset(width + panel, height, panel, 0, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.labels.setSize(width, height);
  }

  // 0 = cheerful, 1 = sad: overcast grey sky, colder and dimmer light, faded colours.
  setMood(sadness) {
    const bg = this.sky.clone().lerp(GREY_SKY, sadness * 0.85);
    this.scene.background.copy(bg);
    this.scene.fog.color.copy(bg);
    this.sun.intensity = 2.3 * (1 - 0.45 * sadness);
    this.sun.color.copy(WARM_SUN).lerp(COLD_SUN, sadness);
    this.hemi.intensity = 1.9 * (1 - 0.2 * sadness);
    const n = Math.round(sadness * this.clouds.length);
    this.clouds.forEach((c, i) => (c.visible = i < n));
    this.cloudMat?.color.set('#ffffff').lerp(new THREE.Color('#8E959C'), sadness);
    setJoy(sadness);
  }

  render(renderer) {
    this.controls.update();
    renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  tickClouds(dt) {
    for (const c of this.clouds) {
      if (!c.visible) continue;
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 40) c.position.x = -40;
    }
  }

  update() {}
  tick() {}
}

export function label(text, className = '') {
  const el = document.createElement('div');
  el.className = `scene-label ${className}`;
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 1);
  return obj;
}

// ---------------------------------------------------------------------------
// Facade textures (painted on a canvas, cached per style/category/floors)
// ---------------------------------------------------------------------------

const textures = new Map();

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return `#${c.getHexString()}`;
}

function windowColors(kind, rand) {
  switch (kind) {
    case 'lit':
      return rand() < 0.65 ? '#FFE7A1' : '#9FB6CC';
    case 'shutter':
      return rand() < 0.5 ? '#7E868E' : '#68707A';
    case 'broken':
      return rand() < 0.4 ? '#1F1C1A' : rand() < 0.5 ? '#8B6B4A' : '#3A3430';
    case 'modern':
      return rand() < 0.7 ? '#CFE9F4' : '#FFE7A1';
    default:
      return '#999';
  }
}

function windowKind(category) {
  const t = HOUSE_TYPES[category];
  if (t.use === 'degraded') return 'broken';
  if (t.use === 'vacant') return 'shutter';
  return t.owner === 'public' ? 'modern' : 'lit';
}

// Crumbling corners and a broken cornice for degraded buildings
function paintDecay(g, W, H, rand) {
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(30,25,20,${0.12 + rand() * 0.2})`;
    g.beginPath();
    g.ellipse(rand() * W, rand() * H, 8 + rand() * 20, 6 + rand() * 18, 0, 0, Math.PI * 2);
    g.fill();
  }
  for (const side of [0, 1]) {
    for (let y = 0; y < H; y += 6 + rand() * 10) {
      const w = 4 + rand() * 14;
      const h = 6 + rand() * 16;
      const x = side ? W - w : 0;
      g.fillStyle = rand() < 0.5 ? '#8E5A45' : '#5E4A3E'; // exposed brick and stone
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(side ? x : x + w - 2, y, 2, h);
    }
  }
  g.fillStyle = '#3A322C';
  for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 4, 2 + rand() * 9); // jagged top edge
}

export function facadeTexture(style, category, floors) {
  const key = `${style}|${category}|${floors}`;
  if (textures.has(key)) return textures.get(key);

  const W = 128;
  const H = style === 'city' ? 64 * floors : 96 * floors;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const base = CATEGORY_COLORS[category];
  const kind = windowKind(category);
  const rand = seeded(key.length * 7919 + floors * 31 + category.charCodeAt(0) + category.length * 131);
  const modern = kind === 'modern' || (kind !== 'lit' && HOUSE_TYPES[category].owner === 'public');

  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  if (style === 'city') {
    const cols = 3;
    const fh = H / floors;
    const cw = W / cols;
    if (modern) {
      g.fillStyle = '#F4F1EA';
      for (let f = 1; f < floors; f++) g.fillRect(0, f * fh - 3, W, 6);
    } else {
      g.fillStyle = shade(base, -0.12);
      g.fillRect(0, H - fh * 0.22, W, fh * 0.22); // ground floor band
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(0, 0, W, 5); // cornice
    }
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        const ground = f === floors - 1;
        const isDoor = ground && c === 1 && !modern;
        const ww = modern ? cw * 0.86 : cw * 0.46; // public housing: wide window walls
        const wh = isDoor ? fh * 0.72 : fh * (modern ? 0.56 : 0.56);
        const x = c * cw + (cw - ww) / 2;
        const y = isDoor ? f * fh + fh - wh : f * fh + fh * 0.2;
        g.fillStyle = modern ? '#FFFFFF' : 'rgba(255,255,255,0.8)';
        g.fillRect(x - 3, y - 3, ww + 6, wh + 6); // frame
        g.fillStyle = isDoor ? shade(base, -0.35) : windowColors(kind, rand);
        g.fillRect(x, y, ww, wh);
        if (kind === 'shutter' && !isDoor) {
          g.fillStyle = 'rgba(0,0,0,0.18)';
          for (let s = y + 4; s < y + wh; s += 6) g.fillRect(x, s, ww, 2);
        }
        if (!modern && !isDoor && !ground) {
          g.fillStyle = 'rgba(40,40,40,0.55)'; // balcony rail
          g.fillRect(x - 4, y + wh - 2, ww + 8, 3);
        }
      }
    }
  } else {
    // Countryside: white corner stones, cornice and a darker base band
    const fh = H / floors;
    g.fillStyle = shade(base, -0.14);
    g.fillRect(0, H - 18, W, 18);
    g.fillStyle = kind === 'broken' ? '#BDB4A6' : '#FBF8F1';
    g.fillRect(0, 0, W, 8);
    g.fillRect(0, 0, 8, H);
    g.fillRect(W - 8, 0, 8, H);
    for (let f = 0; f < floors; f++) {
      const ground = f === floors - 1;
      const slots = ground && !modern ? ['win', 'door', 'win'] : ['win', 'win', 'win'];
      slots.forEach((type, i) => {
        const cw = W / 3;
        const ww = type === 'door' ? cw * 0.5 : modern ? cw * 0.8 : cw * 0.42;
        const wh = type === 'door' ? fh * 0.62 : fh * 0.36;
        const x = i * cw + (cw - ww) / 2;
        const y = type === 'door' ? f * fh + fh - wh - 2 : f * fh + fh * 0.28;
        g.fillStyle = '#FBF8F1';
        g.fillRect(x - 4, y - 4, ww + 8, wh + 8);
        g.fillStyle = type === 'door' ? '#2F5D8A' : windowColors(kind, rand);
        g.fillRect(x, y, ww, wh);
      });
    }
  }

  if (kind === 'broken') paintDecay(g, W, H, rand);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  textures.set(key, tex);
  return tex;
}

function facadeMaterial(style, category, floors) {
  const key = `facade|${style}|${category}|${floors}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshLambertMaterial({ map: facadeTexture(style, category, floors) }));
  }
  return materials.get(key);
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

function gableRoofGeometry(w, d, h) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

const FLOWERS = ['#E4572E', '#F3A712', '#D1495B', '#A23B72'];

export class Building {
  // style: 'city' (3–5 floors, hip roofs) or 'country' (single storey, gable roofs)
  constructor({ style, w, d, floors, rand, crane = false }) {
    this.style = style;
    this.w = w;
    this.d = d;
    this.floors = floors;
    this.rand = rand;
    this.floorHeight = style === 'city' ? 0.72 : 1.05;
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.category = null;
    this.anim = 1;
    this.t = rand() * 10;

    // Body (facade on the four sides, plain top)
    this.body = mesh(new THREE.BoxGeometry(w, 1, d).translate(0, 0.5, 0), [], {});
    this.inner.add(this.body);

    // Pitched roof (terracotta, or sagging ruined tiles when degraded)
    if (style === 'city') {
      const r = (w / 2) * Math.SQRT2 * 1.06;
      this.tileRoof = mesh(new THREE.ConeGeometry(r, 0.5, 4, 1).rotateY(Math.PI / 4).translate(0, 0.25, 0), mat(TERRACOTTA));
    } else {
      this.tileRoof = mesh(gableRoofGeometry(w * 1.1, d * 1.08, 0.6), mat(TERRACOTTA));
      this.chimney = box(0.18, 0.5, 0.18, '#FBF8F1');
      this.chimney.position.set(w * 0.28, 0, 0);
      this.tileRoof.add(this.chimney);
    }
    this.inner.add(this.tileRoof);

    // Flat roof (public housing)
    this.flatRoof = new THREE.Group();
    this.flatSlab = box(w * 1.04, 0.08, d * 1.04, '#ECE8DF');
    this.flatRoof.add(this.flatSlab);
    this.tank = box(w * 0.3, 0.28, d * 0.3, '#D5D0C6', { y: 0.08 });
    this.tank.position.x = w * 0.2;
    this.flatRoof.add(this.tank);
    this.inner.add(this.flatRoof);

    // Roof damage: holes, fallen planks and weeds growing on top
    this.roofDamage = new THREE.Group();
    const hole = box(w * 0.42, 0.06, d * 0.36, '#231E1B', { cast: false });
    hole.position.set(-w * 0.12, 0.1, d * 0.08);
    hole.rotation.z = 0.25;
    this.roofDamage.add(hole);
    const plank = box(w * 0.85, 0.05, 0.14, '#6B4A35');
    plank.rotation.set(0.3, 0.4, 0.5);
    plank.position.set(w * 0.05, 0.22, -d * 0.12);
    this.roofDamage.add(plank);
    for (let i = 0; i < 2; i++) {
      const weed = mesh(new THREE.IcosahedronGeometry(0.14 + rand() * 0.08, 0), mat('#6F8F4E'));
      weed.position.set((rand() - 0.5) * w * 0.7, 0.12, (rand() - 0.5) * d * 0.7);
      this.roofDamage.add(weed);
    }
    this.inner.add(this.roofDamage);

    // Crumbling corners: exposed stone and a missing chunk at the top corners
    this.corners = new THREE.Group();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const strip = box(0.1, 1, 0.1, '#6A5446');
      strip.position.set((sx * w) / 2, 0, (sz * d) / 2);
      strip.userData.frac = 0.55 + rand() * 0.4;
      this.corners.add(strip);
      const chunk = box(0.16, 0.14, 0.16, '#857262');
      chunk.position.set((sx * w) / 2 + sx * 0.05, 0, (sz * d) / 2 + sz * 0.05);
      chunk.rotation.y = rand();
      chunk.userData.top = true;
      this.corners.add(chunk);
    }
    this.inner.add(this.corners);

    this.rubble = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const s = 0.12 + rand() * 0.16;
      const b = box(s, s, s, i % 2 ? '#8B8178' : '#A39A90');
      b.position.set((rand() - 0.5) * w * 1.1, 0, d / 2 + 0.15 + rand() * 0.3);
      b.rotation.y = rand() * 3;
      this.rubble.add(b);
    }
    this.inner.add(this.rubble);

    // Residents on balconies (city) or by the door (countryside)
    this.residents = new THREE.Group();
    this.inner.add(this.residents);

    // Construction site: concrete core, orange scaffolding, optional crane
    this.scaffold = new THREE.Group();
    const coreH = this.fullHeight() * 0.55;
    this.scaffold.add(box(w * 0.82, coreH, d * 0.82, '#CFCAC1'));
    const levels = Math.max(2, Math.round(this.fullHeight() / 0.7));
    const lineMat = new THREE.LineBasicMaterial({ color: CATEGORY_COLORS.construction });
    for (let i = 0; i < levels; i++) {
      const lh = (this.fullHeight() * 0.75) / levels;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 1.04, lh, d * 1.04)), lineMat);
      edges.position.y = lh / 2 + i * lh;
      this.scaffold.add(edges);
    }
    if (crane) {
      this.crane = new THREE.Group();
      const mastH = this.fullHeight() * 1.5 + 1;
      this.crane.add(box(0.14, mastH, 0.14, '#F2B134'));
      this.jib = new THREE.Group();
      const arm = box(3.2, 0.1, 0.12, '#F2B134');
      arm.position.x = 0.9;
      this.jib.add(arm);
      const weight = box(0.4, 0.3, 0.3, '#5E5A55');
      weight.position.x = -0.6;
      this.jib.add(weight);
      const hook = box(0.03, 0.9, 0.03, '#444');
      hook.position.set(2.1, -0.9, 0);
      this.jib.add(hook);
      this.jib.position.y = mastH;
      this.crane.add(this.jib);
      this.crane.position.set(w * 0.5, 0, -d * 0.5);
      this.scaffold.add(this.crane);
    }
    this.inner.add(this.scaffold);

    // Empty plot
    this.plot = new THREE.Group();
    this.plot.add(box(w * 1.05, 0.05, d * 1.05, mat(CATEGORY_COLORS.land), { cast: false }));
    const dirt = box(w * 0.5, 0.06, d * 0.4, '#C8AD84', { cast: false });
    dirt.position.set(w * 0.15, 0, -d * 0.1);
    this.plot.add(dirt);
    for (let i = 0; i < 2; i++) {
      const shrub = mesh(new THREE.IcosahedronGeometry(0.16 + rand() * 0.08, 0), mat('#7E9C55'));
      shrub.position.set((rand() - 0.5) * w * 0.8, 0.14, (rand() - 0.5) * d * 0.8);
      this.plot.add(shrub);
    }
    const post = box(0.04, 0.5, 0.04, '#7A6A58');
    post.position.set(-w * 0.35, 0, d * 0.4);
    const sign = box(0.36, 0.22, 0.03, '#FBF8F1', { y: 0.4 });
    sign.position.set(-w * 0.35, 0, d * 0.4);
    this.plot.add(post, sign);
    this.inner.add(this.plot);
  }

  fullHeight() {
    return this.floors * this.floorHeight + (this.style === 'city' ? 0.3 : 0);
  }

  setCategory(category) {
    if (category === this.category) return;
    this.category = category;
    const type = HOUSE_TYPES[category];
    const building = !!type;
    const degraded = type?.use === 'degraded';
    const isPublic = type?.owner === 'public';

    let floors = this.floors;
    if (this.style === 'country' && isPublic) floors = 2;
    const extra = this.style === 'city' ? 0.3 : 0;
    const h = (floors * this.floorHeight + extra) * (degraded ? (isPublic ? 0.85 : 0.8) : 1);

    this.body.visible = building;
    if (building) {
      const side = facadeMaterial(this.style, category, floors);
      const top = mat(degraded ? '#3A332E' : '#D9D3C7');
      this.body.material = [side, side, top, side, side, side];
      this.body.scale.y = h;
    }

    // Roofs: terracotta tiles for private homes, flat roofs for public housing; both ruined when degraded
    this.tileRoof.visible = building && !isPublic;
    this.tileRoof.position.y = h - (degraded ? 0.07 : 0);
    this.tileRoof.material = mat(degraded ? RUINED_TILES : TERRACOTTA);
    this.tileRoof.rotation.set(degraded ? 0.08 : 0, 0, degraded ? 0.12 : 0);
    if (this.chimney) this.chimney.rotation.z = degraded ? 0.7 : 0;
    this.flatRoof.visible = building && isPublic;
    this.flatRoof.position.y = h;
    this.flatSlab.material = mat(degraded ? '#4F4842' : '#ECE8DF');
    this.tank.rotation.z = degraded ? 0.5 : 0;
    this.roofDamage.visible = degraded;
    this.roofDamage.position.y = h + (isPublic ? 0.02 : this.style === 'city' ? 0.12 : 0.18);
    this.corners.visible = degraded;
    for (const c of this.corners.children) {
      if (c.userData.top) c.position.y = h - 0.1;
      else c.scale.y = h * c.userData.frac;
    }
    this.rubble.visible = degraded;
    this.scaffold.visible = category === 'construction';
    this.plot.visible = category === 'land';
    this.placeResidents(type, h, floors);
    this.anim = 0;
  }

  placeResidents(type, h, floors) {
    this.residents.clear();
    if (!type || type.use !== 'occupied') return;
    const who = type.owner === 'owner' ? 'owner' : 'tenant';
    const count = this.style === 'city' ? 2 : 1 + (this.rand() < 0.5 ? 1 : 0);
    const fh = h / floors;
    const used = new Set();
    for (let k = 0; k < count; k++) {
      let f;
      let c;
      for (let tries = 0; tries < 10; tries++) {
        f = floors > 1 ? 1 + Math.floor(this.rand() * (floors - 1)) : 0;
        c = Math.floor(this.rand() * 3);
        if (!used.has(f * 10 + c)) break;
      }
      used.add(f * 10 + c);
      const x = ((c + 0.5) / 3 - 0.5) * this.w;
      const p = figure(who, this.style === 'city' ? 1 : 1.2);
      if (f === 0) {
        p.position.set(x, 0, this.d / 2 + 0.22); // at the door or window of a house
      } else {
        const y = f * fh + 0.24 * fh; // balcony at the bottom of the window
        p.position.set(x, y, this.d / 2 + 0.13);
        const slab = box(0.44, 0.04, 0.24, '#ECE8DF', { y: y - 0.04, cast: false });
        slab.position.set(x, 0, this.d / 2 + 0.12);
        const pot = box(0.12, 0.08, 0.08, joyMat(FLOWERS[(f + c) % FLOWERS.length]), { y, cast: false });
        pot.position.set(x + 0.15, 0, this.d / 2 + 0.2);
        this.residents.add(slab, pot);
      }
      this.residents.add(p);
    }
  }

  tick(dt) {
    this.t += dt;
    if (this.anim < 1) {
      this.anim = Math.min(1, this.anim + dt / 0.7);
      this.inner.scale.y = Math.max(0.02, easeOutBack(this.anim));
    }
    if (this.jib && this.scaffold.visible) this.jib.rotation.y = Math.sin(this.t * 0.25) * 1.4;
  }
}

// ---------------------------------------------------------------------------
// Slot allocator: plots are given in a spatial order (a walk through the
// blocks), and each category gets a contiguous run of plots, grouped by owner:
// people who live there, then landlords, funds, the State, construction and
// land. Neighbourhoods stay together, and when counts change only the plots at
// the boundaries between neighbourhoods switch.
// ---------------------------------------------------------------------------

const RUN_ORDER = [
  'owner',
  'rented', 'vacant', 'degraded', // landlords
  'fundRented', 'fundVacant', // investment funds
  'publicRented', 'publicDegraded', // the State
  'construction',
  'land',
];

export class SlotAllocator {
  // slots: plots in spatial order — neighbouring indices are neighbouring plots
  constructor(slots) {
    this.slots = slots;
    this.assign = new Array(slots.length).fill(null);
  }

  targets(counts) {
    const n = this.slots.length;
    const total = Object.values(counts).reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const out = {};
    const rem = [];
    let used = 0;
    for (const cat of RUN_ORDER) {
      const exact = (Math.max(0, counts[cat] || 0) / total) * n;
      let k = Math.floor(exact);
      if (k === 0 && exact >= 0.15) k = 1; // keep small but present categories visible
      out[cat] = k;
      used += k;
      rem.push([cat, exact - Math.floor(exact)]);
    }
    rem.sort((a, b) => b[1] - a[1]);
    for (let i = 0; used < n; i = (i + 1) % rem.length) {
      out[rem[i][0]] += 1;
      used += 1;
    }
    while (used > n) {
      const biggest = RUN_ORDER.reduce((a, b) => (out[b] > out[a] ? b : a));
      out[biggest] -= 1;
      used -= 1;
    }
    return out;
  }

  // Returns the new assignment array.
  update(counts) {
    const target = this.targets(counts);
    let i = 0;
    for (const cat of RUN_ORDER) for (let k = 0; k < target[cat]; k++) this.assign[i++] = cat;
    return this.assign;
  }
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const bodyGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.3, 8).translate(0, 0.15, 0);
const headGeo = new THREE.SphereGeometry(0.075, 10, 8).translate(0, 0.39, 0);
const hatGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.04, 10).translate(0, 0.45, 0);
const caseGeo = new THREE.BoxGeometry(0.1, 0.07, 0.03).translate(0.11, 0.08, 0);
const tentGeo = new THREE.ConeGeometry(0.34, 0.38, 4).rotateY(Math.PI / 4).translate(0, 0.19, 0);
const TENTS = ['#A99C86', '#7F8C6E', '#8A7F9E', '#B08D6A'];

// type: owner | tenant | landlord | fund | builder | homeless (sitting by a tent) | homelessStanding
export function figure(type, scale = 1.35) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(scale);
  g.add(inner);
  const color = PEOPLE_COLORS[type === 'homelessStanding' ? 'homeless' : type];
  inner.add(mesh(bodyGeo, mat(color), { receive: false }));
  inner.add(mesh(headGeo, mat('#E8C4A0'), { receive: false }));
  if (type === 'builder') inner.add(mesh(hatGeo, mat('#FFD23F'), { receive: false }));
  if (type === 'fund') inner.add(mesh(caseGeo, mat(GOLD), { receive: false }));
  if (type === 'landlord') inner.add(mesh(hatGeo, mat('#4A3426'), { receive: false }));
  if (type === 'homeless') {
    inner.scale.y = scale * 0.7; // sitting
    const tent = mesh(tentGeo, mat(TENTS[Math.floor(Math.random() * TENTS.length)]));
    tent.position.set(0.42, 0, -0.05);
    g.add(tent);
  }
  return g;
}

// Pools of figures of one type: shows `count` of them at the given spots.
export class FigurePool {
  constructor(parent, type, max) {
    this.items = Array.from({ length: max }, () => {
      const f = figure(type);
      f.visible = false;
      parent.add(f);
      return f;
    });
  }

  place(spots) {
    this.items.forEach((f, i) => {
      const s = spots[i];
      f.visible = !!s;
      if (s) {
        f.position.set(s.x, s.y ?? 0, s.z);
        f.rotation.y = s.rot ?? 0;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Trash on the streets: bags, litter and overflowing bins appear as
// government management gets worse (see streetLevels).
// ---------------------------------------------------------------------------

export class StreetTrash {
  // areas: [{ x0, x1, z0, z1, y }]; reject(x, z) → true to skip a spot
  constructor(parent, { areas, reject = () => false, rand, count = 44 }) {
    const weights = areas.map((a) => (a.x1 - a.x0) * (a.z1 - a.z0));
    const total = weights.reduce((a, b) => a + b, 0);
    const pick = () => {
      for (let tries = 0; tries < 60; tries++) {
        let r = rand() * total;
        let a = areas[0];
        for (let i = 0; i < areas.length; i++) {
          if ((r -= weights[i]) <= 0) {
            a = areas[i];
            break;
          }
        }
        const x = a.x0 + rand() * (a.x1 - a.x0);
        const z = a.z0 + rand() * (a.z1 - a.z0);
        if (!reject(x, z)) return { x, y: a.y, z };
      }
      return null;
    };
    this.items = [];
    for (let i = 0; i < count; i++) {
      const p = pick();
      if (!p) continue;
      const item = trashItem(i % 4, rand);
      item.position.set(p.x, p.y, p.z);
      item.rotation.y = rand() * Math.PI * 2;
      item.visible = false;
      parent.add(item);
      this.items.push(item);
    }
  }

  update(level) {
    const n = Math.round(level * this.items.length);
    this.items.forEach((t, i) => (t.visible = i < n));
  }
}

function trashItem(kind, rand) {
  const g = new THREE.Group();
  const bag = () => {
    const b = mesh(new THREE.IcosahedronGeometry(0.13 + rand() * 0.05, 0), mat('#2B2B2E'), { receive: false });
    b.scale.y = 0.8;
    return b;
  };
  if (kind === 0 || kind === 2) {
    const a = bag();
    a.position.y = 0.1;
    const b = bag();
    b.position.set(0.2, 0.09, 0.08);
    g.add(a, b);
  } else if (kind === 1) {
    const colors = ['#E9E4D6', '#C8553D', '#5B8DB8', '#F2C14E'];
    for (let i = 0; i < 5; i++) {
      const bit = box(0.08, 0.02, 0.06, colors[i % colors.length], { cast: false });
      bit.position.set((rand() - 0.5) * 0.7, 0, (rand() - 0.5) * 0.7);
      bit.rotation.y = rand() * 3;
      g.add(bit);
    }
  } else {
    g.add(box(0.32, 0.42, 0.3, '#4E7A4A')); // overflowing bin
    const top = bag();
    top.position.y = 0.5;
    const side = bag();
    side.position.set(0.3, 0.1, 0);
    g.add(top, side);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Nature (blossoms use joyful materials: they fade when the mood is sad)
// ---------------------------------------------------------------------------

export function tree(kind, rand) {
  const g = new THREE.Group();
  if (kind === 'jacaranda') {
    g.add(box(0.1, 0.7, 0.1, '#6B4F3A'));
    const crown = mesh(new THREE.IcosahedronGeometry(0.55, 1), joyMat(rand() < 0.5 ? '#9C7BD1' : '#8A6CC4'));
    crown.position.y = 1.0;
    crown.scale.set(1, 0.8, 1);
    g.add(crown);
  } else if (kind === 'cork') {
    g.add(box(0.14, 0.6, 0.14, '#8A5A3B'));
    const crown = mesh(new THREE.IcosahedronGeometry(0.8, 1), joyMat('#5F7A3A'));
    crown.position.y = 0.95;
    crown.scale.set(1.2, 0.6, 1.1);
    g.add(crown);
  } else if (kind === 'pine') {
    g.add(box(0.1, 1.5, 0.1, '#7A5338'));
    const crown = mesh(new THREE.IcosahedronGeometry(0.85, 1), joyMat('#4E6B3A'));
    crown.position.y = 1.7;
    crown.scale.set(1.3, 0.38, 1.3);
    g.add(crown);
  } else {
    g.add(box(0.1, 0.5, 0.1, '#6B4F3A'));
    const crown = mesh(new THREE.IcosahedronGeometry(0.45, 1), joyMat('#6E9450'));
    crown.position.y = 0.75;
    g.add(crown);
  }
  g.rotation.y = rand() * Math.PI;
  const s = 0.85 + rand() * 0.3;
  g.scale.setScalar(s);
  return g;
}
