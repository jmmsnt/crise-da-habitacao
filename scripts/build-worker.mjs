// Builds dist/ for the Cloudflare Worker: the static site plus only the three.js
// files the game imports (the import map points at /vendor/three/...).

import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const three = path.join(root, 'node_modules/three');

const files = [
  ['build/three.module.js', 'vendor/three/build/three.module.js'],
  ['build/three.core.js', 'vendor/three/build/three.core.js'],
  ['examples/jsm/controls/OrbitControls.js', 'vendor/three/addons/controls/OrbitControls.js'],
  ['examples/jsm/renderers/CSS2DRenderer.js', 'vendor/three/addons/renderers/CSS2DRenderer.js'],
];

await rm(dist, { recursive: true, force: true });
await cp(path.join(root, 'public'), dist, { recursive: true });
for (const [from, to] of files) {
  await mkdir(path.dirname(path.join(dist, to)), { recursive: true });
  await cp(path.join(three, from), path.join(dist, to));
}
console.log('Built dist/ for the Cloudflare Worker');
