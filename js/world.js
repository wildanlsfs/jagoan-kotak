// Dunia kotak-kotak ala Minecraft: pulau bulat dengan arena datar di tengah, pohon, batu, pantai dan laut.
// Semua balok digambar dengan InstancedMesh per jenis (sedikit draw call), tekstur piksel 16x16 dari kanvas.
import * as THREE from 'three';

export const SIZE = 64;              // lebar peta (balok)
export const HALF = SIZE / 2;
const ISLAND_R = 27;                 // jari-jari pulau
export const ARENA_R = 11;           // arena datar di tengah, bebas pohon
export const WATER_Y = 1;            // permukaan air (atas balok tingkat 0)

// --- PRNG deterministik supaya pulau selalu sama ---
let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// --- tekstur piksel ---
function pixelTex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d'); draw(g);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(g, base, cols, n = 70, x0 = 0, y0 = 0, w = 16, h = 16) {
  g.fillStyle = base; g.fillRect(x0, y0, w, h);
  for (let i = 0; i < n; i++) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x0 + ((rnd() * w) | 0), y0 + ((rnd() * h) | 0), 1, 1); }
}
const TEX = {
  grassTop: pixelTex((g) => speckle(g, '#6cc04a', ['#5aab3c', '#7fd35a', '#4f9e35', '#8be066'], 110)),
  grassSide: pixelTex((g) => {
    speckle(g, '#9a6b43', ['#87593a', '#ad7a4e', '#7a4e31'], 80);
    speckle(g, '#6cc04a', ['#5aab3c', '#7fd35a'], 30, 0, 0, 16, 4);
    for (let x = 0; x < 16; x++) if (rnd() < .5) { g.fillStyle = '#5aab3c'; g.fillRect(x, 4, 1, 1 + ((rnd() * 2) | 0)); }
  }),
  dirt: pixelTex((g) => speckle(g, '#9a6b43', ['#87593a', '#ad7a4e', '#7a4e31'], 90)),
  stone: pixelTex((g) => { speckle(g, '#9b9b9b', ['#8a8a8a', '#adadad', '#7c7c7c', '#b8b8b8'], 120); }),
  sand: pixelTex((g) => speckle(g, '#ecd99a', ['#e0cb85', '#f4e4ad', '#d9c27a'], 90)),
  logSide: pixelTex((g) => { g.fillStyle = '#7a5532'; g.fillRect(0, 0, 16, 16); for (let x = 0; x < 16; x += 3) { g.fillStyle = rnd() < .5 ? '#664526' : '#8a623c'; g.fillRect(x, 0, 1, 16); } speckle(g, 'rgba(0,0,0,0)', ['#5a3c20'], 20); }),
  logTop: pixelTex((g) => { g.fillStyle = '#b38a57'; g.fillRect(0, 0, 16, 16); g.strokeStyle = '#8f6a3e'; for (let r = 2; r < 8; r += 2) g.strokeRect(8 - r, 8 - r, r * 2, r * 2); g.fillStyle = '#7a5532'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16); }),
  leaves: pixelTex((g) => speckle(g, '#3f9a3a', ['#2f7d2c', '#4fb048', '#2a6e27', '#5cc455'], 140)),
  plank: pixelTex((g) => { g.fillStyle = '#c4935a'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#a87a45'; [3, 7, 11, 15].forEach((y) => g.fillRect(0, y, 16, 1)); g.fillRect(5, 0, 1, 3); g.fillRect(11, 4, 1, 3); g.fillRect(3, 8, 1, 3); g.fillRect(9, 12, 1, 3); }),
  hay: pixelTex((g) => { speckle(g, '#e8c34a', ['#d4ab32', '#f2d469', '#c99d24'], 100); g.fillStyle = '#b8862a'; g.fillRect(0, 7, 16, 2); }),
  water: pixelTex((g) => speckle(g, '#3d8fe0', ['#4a9cec', '#3380d0', '#5aa8f0'], 60)),
};

const lam = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, ...extra });
export const MATS = {
  grass: [lam(TEX.grassSide), lam(TEX.grassSide), lam(TEX.grassTop), lam(TEX.dirt), lam(TEX.grassSide), lam(TEX.grassSide)],
  dirt: lam(TEX.dirt),
  stone: lam(TEX.stone),
  sand: lam(TEX.sand),
  log: [lam(TEX.logSide), lam(TEX.logSide), lam(TEX.logTop), lam(TEX.logTop), lam(TEX.logSide), lam(TEX.logSide)],
  leaves: lam(TEX.leaves),
  plank: lam(TEX.plank),
  hay: lam(TEX.hay),
};
export { TEX };

// --- peta tinggi & sel ---
const heights = new Int8Array(SIZE * SIZE);   // tinggi permukaan (y atas balok teratas), 0 = laut
const solid = new Uint8Array(SIZE * SIZE);    // 1 = penghalang (batang pohon / batu besar)
const kind = new Uint8Array(SIZE * SIZE);     // 0 air, 1 rumput, 2 pasir, 3 batu
const idx = (x, z) => (z + HALF) * SIZE + (x + HALF);
const blocks = new Set();                     // semua balok padat (untuk kamera agar tidak menembus pohon/bukit)
const bkey = (x, y, z) => (x + 128) * 65536 + (y + 16) * 256 + (z + 128);
/** Apakah ada balok di sel (x,y,z) dunia. */
export function blockAt(x, y, z) { return blocks.has(bkey(Math.floor(x + .5), Math.floor(y), Math.floor(z + .5))); }
const inMap = (x, z) => x >= -HALF && x < HALF && z >= -HALF && z < HALF;

/** Tinggi tanah di posisi dunia (x,z kontinu). Air = 0. */
export function groundAt(x, z) {
  const cx = Math.floor(x + .5), cz = Math.floor(z + .5);
  return inMap(cx, cz) ? heights[idx(cx, cz)] : 0;
}
/** Apakah sel ini bisa diinjak (bukan air, bukan pohon). */
export function walkable(x, z) {
  const cx = Math.floor(x + .5), cz = Math.floor(z + .5);
  if (!inMap(cx, cz)) return false;
  const i = idx(cx, cz);
  return kind[i] !== 0 && !solid[i];
}
export const islandRadius = ISLAND_R;

export function buildWorld(scene) {
  seed = 1337;
  // 1) tinggi permukaan
  for (let z = -HALF; z < HALF; z++) for (let x = -HALF; x < HALF; x++) {
    const d = Math.hypot(x, z);
    const edge = ISLAND_R + Math.sin(Math.atan2(z, x) * 5) * 2 + Math.cos(Math.atan2(z, x) * 3 + 1) * 1.5;
    const i = idx(x, z);
    if (d > edge) { heights[i] = 0; kind[i] = 0; continue; }
    let h = 2 + Math.round(Math.sin(x * .16) * Math.cos(z * .14) * 1.4 + Math.sin((x + z) * .09) * 1.1 + Math.cos((x - z) * .05) * .8);
    if (d < ARENA_R) h = 2;                                   // arena datar
    else if (d < ARENA_R + 3) h = Math.round(2 + (h - 2) * (d - ARENA_R) / 3);
    if (d > edge - 3) { h = Math.min(h, 1); kind[i] = 2; } else kind[i] = 1;
    heights[i] = Math.max(1, h);
  }

  const parts = { grass: [], dirt: [], stone: [], sand: [], log: [], leaves: [], plank: [], hay: [] };
  const put = (type, x, y, z) => { parts[type].push(x, y, z); blocks.add(bkey(x, y, z)); };
  blocks.clear();

  // 2) kolom tanah: hanya balok yang mungkin terlihat (dari tetangga terendah sampai permukaan)
  for (let z = -HALF; z < HALF; z++) for (let x = -HALF; x < HALF; x++) {
    const i = idx(x, z), h = heights[i];
    if (!h) continue;
    let low = h - 1;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) low = Math.min(low, inMap(x + dx, z + dz) ? heights[idx(x + dx, z + dz)] : 0);
    low = Math.max(0, low - (kind[i] === 2 ? 0 : 0));
    for (let y = low; y < h; y++) {
      const top = y === h - 1;
      if (kind[i] === 2) put('sand', x, y, z);
      else put(top ? 'grass' : y < h - 2 ? 'stone' : 'dirt', x, y, z);
    }
  }

  // 3) pohon & batu di luar arena
  const occupied = (x, z, r) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (inMap(x + dx, z + dz) && solid[idx(x + dx, z + dz)]) return true; return false; };
  let trees = 0, tries = 0;
  while (trees < 34 && tries++ < 2000) {
    const x = Math.round((rnd() * 2 - 1) * ISLAND_R), z = Math.round((rnd() * 2 - 1) * ISLAND_R);
    const d = Math.hypot(x, z);
    if (d < ARENA_R + 2 || !inMap(x, z) || kind[idx(x, z)] !== 1 || occupied(x, z, 2)) continue;
    const h = heights[idx(x, z)], th = 3 + ((rnd() * 2) | 0);
    for (let y = 0; y < th; y++) put('log', x, h + y, z);
    solid[idx(x, z)] = 1;
    const top = h + th;
    for (let ly = -2; ly <= 1; ly++) {
      const r = ly >= 0 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dz === 0 && ly < 0) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r && (ly === 1 || rnd() < .5)) continue;
        put('leaves', x + dx, top + ly, z + dz);
      }
    }
    trees++;
  }
  let rocks = 0; tries = 0;
  while (rocks < 10 && tries++ < 800) {
    const x = Math.round((rnd() * 2 - 1) * ISLAND_R), z = Math.round((rnd() * 2 - 1) * ISLAND_R);
    if (Math.hypot(x, z) < ARENA_R + 1 || !inMap(x, z) || kind[idx(x, z)] !== 1 || occupied(x, z, 1)) continue;
    const h = heights[idx(x, z)];
    put('stone', x, h, z); solid[idx(x, z)] = 1;
    if (rnd() < .5) put('stone', x, h + 1, z);
    rocks++;
  }

  // 4) dekorasi arena: pagar kayu kecil & tumpukan jerami di tepi
  for (let a = 0; a < 8; a++) {
    const ang = a / 8 * Math.PI * 2 + .2, x = Math.round(Math.cos(ang) * (ARENA_R + .5)), z = Math.round(Math.sin(ang) * (ARENA_R + .5));
    if (a % 2) { put('hay', x, heights[idx(x, z)], z); solid[idx(x, z)] = 1; }
  }

  // 5) InstancedMesh per jenis
  const box = new THREE.BoxGeometry(1, 1, 1);
  const m4 = new THREE.Matrix4();
  const group = new THREE.Group();
  for (const [type, arr] of Object.entries(parts)) {
    const n = arr.length / 3; if (!n) continue;
    const mesh = new THREE.InstancedMesh(box, MATS[type], n);
    for (let k = 0; k < n; k++) { m4.makeTranslation(arr[k * 3], arr[k * 3 + 1] + .5, arr[k * 3 + 2]); mesh.setMatrixAt(k, m4); }
    mesh.castShadow = type !== 'sand' && type !== 'dirt';
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  scene.add(group);

  // 6) laut
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x3d8fe0, transparent: true, opacity: .88 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = WATER_Y - .15; sea.receiveShadow = true;
  scene.add(sea);
  const seaFloor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), lam(TEX.sand));
  TEX.sand.wrapS = TEX.sand.wrapT = THREE.RepeatWrapping;
  seaFloor.rotation.x = -Math.PI / 2; seaFloor.position.y = -1.5;
  scene.add(seaFloor);

  // 7) awan kotak
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aaabb, emissiveIntensity: .5 });
  const clouds = new THREE.Group();
  for (let c = 0; c < 14; c++) {
    const w = 6 + ((rnd() * 8) | 0), d = 4 + ((rnd() * 5) | 0);
    const cl = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), cloudMat);
    cl.position.set((rnd() * 2 - 1) * 90, 26 + rnd() * 8, (rnd() * 2 - 1) * 90);
    clouds.add(cl);
  }
  scene.add(clouds);
  return { group, sea, clouds };
}

/** Langit + cahaya. */
export function setupSky(scene) {
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 40, 110);
  const hemi = new THREE.HemisphereLight(0xdff2ff, 0x5d8a3c, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.0);
  sun.position.set(20, 40, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera; s.left = -34; s.right = 34; s.top = 34; s.bottom = -34; s.near = 1; s.far = 120;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = .02;
  scene.add(sun, sun.target);
  scene.add(new THREE.AmbientLight(0xffffff, .25));
  return { sun };
}
