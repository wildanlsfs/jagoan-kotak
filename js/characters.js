// Karakter kotak TANPA WAJAH: jagoan (pemain), monster kotak, slime, kelelawar, orang-orangan latihan,
// plus benda kecil (permata, hati), bayangan bulat, dan efek (gelombang tinju, serpihan kotak).
//
// Arah putaran anggota badan: karakter menghadap -z. rotation.x POSITIF = lengan/kaki ke DEPAN,
// badan atas rotation.x NEGATIF = condong ke depan, kepala rotation.x POSITIF = mendongak.
// Sisi kiri karakter ada di -x (dilihat dari belakang, sama seperti pemain melihat layar).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const matCache = new Map();
export function mat(color, extra = {}) {
  const k = color + JSON.stringify(extra);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, ...extra }));
  return matCache.get(k);
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

/** Balok dengan pivot di atasnya (untuk lengan/kaki yang berayun dari bahu/pinggul). */
function limb(w, h, d, material) {
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(BOX, material);
  m.scale.set(w, h, d); m.position.y = -h / 2;
  pivot.add(m);
  return pivot;
}
function block(w, h, d, material, y = 0) {
  const m = new THREE.Mesh(BOX, material);
  m.scale.set(w, h, d); m.position.y = y;
  return m;
}
/** Tambahkan anak lalu kembalikan ANAK-nya (Object3D.add mengembalikan induk, jadi `.add(x).position` salah sasaran). */
const put = (parent, child) => (parent.add(child), child);

/**
 * Manusia kotak (proporsi ala Minecraft, tinggi 1.8). Kepala polos tanpa mata/mulut:
 * hanya warna kulit dengan rambut/topi di atas & belakang.
 * Susunan: root → body (naik-turun/jongkok/pegas) → kaki + upper (pinggang: condong & memutar) → kepala, lengan.
 */
export function makeHumanoid({ skin, shirt, pants, hair, shoes = 0x3a3a46, hat = null, scale = 1, own = false }) {
  const M = (c) => (own ? new THREE.MeshLambertMaterial({ color: c }) : mat(c));
  const mats = { skin: M(skin), shirt: M(shirt), pants: M(pants), hair: hair != null ? M(hair) : null, shoes: M(shoes) };
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const upper = new THREE.Group(); upper.position.y = .75; body.add(upper);
  const torso = block(.5, .72, .26, mats.shirt, .36); upper.add(torso);
  upper.add(block(.52, .08, .28, mats.pants, .03));

  const headPivot = new THREE.Group(); headPivot.position.y = .72; upper.add(headPivot);
  headPivot.add(block(.5, .5, .5, mats.skin, .25));
  if (mats.hair) {
    // rambut menutup atas, belakang, dan sisi belakang: dari belakang (sudut pandang pemain) yang terlihat
    // rambut, jadi jelas kepala menghadap ke depan. Bagian depan tetap kulit polos tanpa wajah.
    headPivot.add(block(.54, .14, .54, mats.hair, .5));                      // atas
    put(headPivot, block(.54, .4, .1, mats.hair, .3)).position.z = .23;       // belakang
    for (const sx of [-1, 1]) put(headPivot, block(.06, .3, .3, mats.hair, .35)).position.set(sx * .26, .35, .1); // sisi
  }
  if (hat) headPivot.add(block(.6, .1, .6, M(hat), .56));

  const armL = limb(.24, .72, .24, mats.shirt); armL.position.set(-.37, .69, 0); upper.add(armL);
  const armR = limb(.24, .72, .24, mats.shirt); armR.position.set(.37, .69, 0); upper.add(armR);
  for (const a of [armL, armR]) a.add(block(.25, .2, .25, mats.skin, -.62)); // tangan

  // kaki bersendi: pinggul (paha) → lutut (betis) → pergelangan (sepatu), supaya jongkok/angkat lutut wajar
  const leg = (x) => {
    const hip = limb(.25, .38, .25, mats.pants); hip.position.set(x, .75, 0); body.add(hip);
    const knee = put(hip, limb(.24, .37, .24, mats.pants)); knee.position.y = -.375;
    knee.add(block(.245, .2, .245, mats.pants, 0));                       // isi celah sendi lutut saat menekuk
    const foot = put(knee, new THREE.Group()); foot.position.y = -.31;
    put(foot, block(.27, .14, .29, mats.shoes, 0)).position.z = -.02;
    hip.knee = knee; hip.foot = foot;
    return hip;
  };
  const legL = leg(-.13), legR = leg(.13);

  root.scale.setScalar(scale);
  return { root, body, upper, headPivot, armL, armR, legL, legR, torso, mats, baseScale: scale,
    a: { t: Math.random() * 10, phase: 0, amp: 0, ground: true, land: 0, cy: 0 } };
}

export const PUNCH_T = .3;
/** 0..1 seberapa jauh tinju terulur: cepat keluar, tahan sebentar, tarik kembali pelan. */
function punchExt(left) {
  if (left <= 0) return 0;
  const p = 1 - left / PUNCH_T;
  return p < .28 ? easeOut(p / .28) : 1 - easeInOut(clamp01((p - .4) / .6));
}

/**
 * Animasi manusia kotak dari status sederhana.
 * s: { speed, onGround, punchL, punchR, block, crouch, raise, headYaw, headPitch, hurt(0..1),
 *      slam(sisa detik, 0..0.6), kneeL/kneeR (mode kamera), zombie, windup(0..1), swing(detik sejak memukul, -1 = tidak) }
 */
export function animateHumanoid(r, s, dt) {
  const a = r.a; a.t += dt;
  const k = 1 - Math.exp(-dt * 14), kq = 1 - Math.exp(-dt * 26);
  const to = (o, key, v, kk = k) => { o.rotation[key] += (v - o.rotation[key]) * kk; };
  const sp = Math.abs(s.speed || 0), gait = Math.min(1, sp / 6.2);
  const air = s.onGround === false;
  const knees = s.kneeL !== undefined;

  // langkah: fase maju sesuai kecepatan, amplitudo naik/turun halus
  a.phase += dt * (sp * 1.9 + (sp > .2 ? 2.2 : 0));
  a.amp += ((sp > .25 ? .45 + gait * .6 : 0) - a.amp) * (1 - Math.exp(-dt * 8));
  const sw = Math.sin(a.phase) * a.amp;

  // mendarat → pegas sebentar
  if (!a.ground && !air) a.land = .2;
  a.ground = !air; a.land = Math.max(0, a.land - dt);

  // jurus hentak bumi: naik (angkat tangan) lalu menghantam
  const slamP = s.slam > 0 ? 1 - s.slam / .6 : -1;
  const slamUp = slamP >= 0 && slamP < .35, slamDown = slamP >= .35;

  // ---- kaki: pinggul (x+ = paha ke depan), lutut (x- = betis menekuk ke belakang), sepatu dijaga datar
  let lL, lR, nL = 0, nR = 0;
  const cyc = Math.cos(a.phase);
  if (air) { lL = .95; nL = -1.3; lR = -.2; nR = -.75; }                                  // lutut ditekuk di udara
  else if (s.crouch || slamDown) { lL = lR = 1.0; nL = nR = -2.0; }                       // jongkok: paha maju, betis ke belakang, telapak tetap di bawah badan
  else if (knees) { lL = s.kneeL * 1.5 + sw * .3; lR = s.kneeR * 1.5 - sw * .3; nL = -s.kneeL * 1.9; nR = -s.kneeR * 1.9; } // angkat lutut
  else { lL = sw; lR = -sw; nL = -Math.max(0, cyc) * a.amp * 1.3; nR = -Math.max(0, -cyc) * a.amp * 1.3; } // lutut menekuk saat kaki diayun ke depan
  const landB = a.land > 0 ? Math.sin(a.land / .2 * Math.PI) : 0;                         // pegas mendarat: lutut sedikit menekuk
  lL += landB * .3; lR += landB * .3; nL -= landB * .6; nR -= landB * .6;
  to(r.legL, 'x', lL, kq); to(r.legR, 'x', lR, kq);
  to(r.legL.knee, 'x', nL, kq); to(r.legR.knee, 'x', nR, kq);
  const flat = air ? .5 : 1;
  r.legL.foot.rotation.x = -(r.legL.rotation.x + r.legL.knee.rotation.x) * flat;
  r.legR.foot.rotation.x = -(r.legR.rotation.x + r.legR.knee.rotation.x) * flat;
  to(r.legL, 'z', air ? -.12 : 0); to(r.legR, 'z', air ? .12 : 0);

  // ---- badan: jongkok, langkah memantul, napas, pegas mendarat
  const crouchY = s.crouch || slamDown ? -.32 : 0;           // pas dengan sudut paha 1.0 & lutut -2.0: telapak tetap di tanah
  a.cy += (crouchY - a.cy) * kq;
  const bob = air || s.crouch ? 0 : Math.abs(Math.cos(a.phase)) * .075 * a.amp;
  const breath = Math.sin(a.t * 2.2) * .012 * (1 - Math.min(1, a.amp * 2));
  r.body.position.y = a.cy + bob + breath;
  const sq = a.land > 0 ? Math.sin(a.land / .2 * Math.PI) * .12 : 0;
  r.body.scale.set(1 + sq * .5, 1 - sq, 1 + sq * .5);

  // ---- pinggang: condong & memutar ke arah tinju
  const eL = punchExt(s.punchL || 0), eR = punchExt(s.punchR || 0);
  let lean = -.14 * gait - (eL + eR) * .08;
  if (s.crouch) lean = -.45;
  if (s.block) lean -= .06;
  if (s.windup) lean += .3 * s.windup;
  const striking = s.swing >= 0 && s.swing < .45;
  if (striking) lean -= .4 * (1 - s.swing / .45);
  if (slamUp) lean += .15; if (slamDown) lean -= .4;
  if (s.hurt) lean += .5 * s.hurt;
  const twist = (eR - eL) * .45 + Math.sin(a.phase) * .1 * a.amp * (knees ? 0 : 1);
  to(r.upper, 'x', lean, kq); to(r.upper, 'y', twist, kq);

  // ---- lengan
  const arm = (o, sx, ext, other, legSw) => {
    if (ext > 0) { o.rotation.x = .2 + ext * 1.42; o.rotation.z = -sx * .1 * ext; return; } // tinju lurus ke depan
    let x, z;
    if (s.block) { x = 1.95; z = -sx * .62; }                                              // silang di depan wajah
    else if (slamUp || s.raise) { x = 2.95; z = sx * .28; }                                // tangan ke atas
    else if (slamDown) { x = .55; z = sx * .55; }
    else if (striking && sx > 0) { const q = clamp01(s.swing / .12); x = 3.4 - 2.6 * easeOut(q); z = 0; o.rotation.x = x; o.rotation.z = z; return; }
    else if (s.windup && sx > 0) { x = 1.4 + 2.0 * s.windup; z = .1; }                     // ancang-ancang mengangkat lengan
    else if (s.zombie) { x = 1.42 + legSw * .18; z = -sx * .06; }                         // lengan terjulur ala zombi
    else if (air) { x = .35; z = sx * .85; }
    else if (other > 0) { x = .75; z = -sx * .28; }                                        // tangan lain menjaga
    else if (s.crouch) { x = .95; z = -sx * .1; }
    else { x = -clamp(legSw, -.85, .85) * .95; z = sx * (.05 + Math.sin(a.t * 2.2) * .02); }               // berayun berlawanan dengan kaki
    to(o, 'x', x, kq); to(o, 'z', z, kq);
  };
  arm(r.armL, -1, eL, eR, lL);
  arm(r.armR, 1, eR, eL, lR);

  // ---- kepala menoleh/mendongak mengikuti pemain
  to(r.headPivot, 'y', s.headYaw || 0);
  to(r.headPivot, 'x', (s.headPitch || 0) * .7 + (s.crouch ? .3 : 0));
}

/** Pakaian jagoan yang bisa dipilih anak (semua tanpa wajah). */
export const OUTFITS = [
  { id: 'biru', name: 'Biru Laut', skin: 0xf2c49b, shirt: 0x2fb5d6, pants: 0x3c4bb8, hair: 0x5a3a22 },
  { id: 'merah', name: 'Merah Api', skin: 0xe0ac7e, shirt: 0xe8504a, pants: 0x3a3a50, hair: 0x2b1d14 },
  { id: 'hijau', name: 'Hutan', skin: 0xc68e5e, shirt: 0x58b947, pants: 0x6b4a2e, hair: 0x1f1a17 },
  { id: 'ungu', name: 'Ungu Galaksi', skin: 0xf2c49b, shirt: 0x9a6bea, pants: 0x2f2a5a, hair: 0xe8c34a },
  { id: 'kuning', name: 'Kuning Petir', skin: 0x8d5a3b, shirt: 0xffc93c, pants: 0x2d6cdf, hair: 0x14100e },
  { id: 'pink', name: 'Pink Permen', skin: 0xf6d2b4, shirt: 0xff7eb6, pants: 0x5a4bd6, hair: 0x7a3f1f },
];

/** Jagoan pemain (material sendiri supaya warnanya bisa diganti). */
export function makeHero(outfit = OUTFITS[0]) {
  return makeHumanoid({ ...outfit, own: true });
}
export function setOutfit(hero, o) {
  hero.mats.skin.color.setHex(o.skin); hero.mats.shirt.color.setHex(o.shirt);
  hero.mats.pants.color.setHex(o.pants); hero.mats.hair.color.setHex(o.hair);
}

/** Monster kotak (tanpa wajah): kulit hijau-limau, baju ungu; level 2 berbaju merah & bertopi. */
export function makeBrute(level = 1) {
  return makeHumanoid({ skin: 0x8fd16a, shirt: level > 1 ? 0xd65b5b : 0x8e6bd6, pants: 0x3b3355, hair: null, hat: level > 1 ? 0x2d2d3a : null, scale: level > 1 ? 1.15 : 1 });
}

/** Slime kubus tembus pandang dengan inti gelap (tanpa wajah). */
export function makeSlime(big = true) {
  const root = new THREE.Group();
  const s = big ? 1 : .6;
  const body = new THREE.Group(); root.add(body);
  const outer = new THREE.Mesh(BOX, mat(0x6fdc6f, { transparent: true, opacity: .75 }));
  outer.scale.setScalar(s); outer.position.y = s / 2;
  const core = new THREE.Mesh(BOX, mat(0x2f8f3a));
  core.scale.setScalar(s * .5); core.position.y = s / 2;
  body.add(core, outer);
  return { root, body, outer, core, size: s, baseScale: 1 };
}

/** Kelelawar kotak: badan ungu tua + dua sayap yang mengepak (tanpa wajah). */
export function makeBat() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  body.add(block(.5, .45, .5, mat(0x4b3a6b)));
  const ear1 = block(.1, .15, .1, mat(0x4b3a6b), .3); ear1.position.x = .15; body.add(ear1);
  const ear2 = block(.1, .15, .1, mat(0x4b3a6b), .3); ear2.position.x = -.15; body.add(ear2);
  const wing = (side) => {
    const p = new THREE.Group(); p.position.x = side * .25;
    const w = new THREE.Mesh(BOX, mat(0x6a4f94)); w.scale.set(.8, .05, .45); w.position.x = side * .4;
    const tip = new THREE.Group(); tip.position.x = side * .8; p.add(tip);
    const w2 = new THREE.Mesh(BOX, mat(0x5a4282)); w2.scale.set(.45, .04, .35); w2.position.x = side * .22; tip.add(w2);
    p.add(w); body.add(p); return { p, tip };
  };
  const L = wing(1), R = wing(-1);
  return { root, body, wingL: L.p, wingR: R.p, tipL: L.tip, tipR: R.tip, baseScale: 1 };
}

/** Orang-orangan jerami untuk latihan tinju (tanpa wajah). */
export function makeDummy() {
  const root = new THREE.Group();
  root.add(block(.14, 1.0, .14, mat(0x7a5532), .5));
  const top = new THREE.Group(); top.position.y = 1; root.add(top);
  top.add(block(.6, .7, .4, mat(0xe8c34a), .25));
  top.add(block(1.3, .12, .12, mat(0xc4935a), .4));
  top.add(block(.45, .45, .45, mat(0xf0d070), .85));
  return { root, top };
}

// --- barang: satu geometri bersama, jadi tidak ada geometri baru setiap kali monster kalah
const GEM_GEO = new THREE.OctahedronGeometry(.28, 0);
const HEART_GEO = (() => {
  const px = [[-1, 1], [1, 1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, -1], [0, -1], [1, -1], [0, -2], [-2, 1], [2, 1]];
  return mergeGeometries(px.map(([x, y]) => new THREE.BoxGeometry(.12, .12, .12).translate(x * .12, y * .12, 0)));
})();
export function makeGem() { return new THREE.Mesh(GEM_GEO, mat(0x5ef0ff, { emissive: 0x1aa6c8, emissiveIntensity: .7 })); }
export function makeHeart() { return new THREE.Mesh(HEART_GEO, mat(0xff4d6d, { emissive: 0x991133, emissiveIntensity: .5 })); }

/** Bayangan bulat lembut di tanah (pengganti bayangan dinamis — jauh lebih ringan). */
const BLOB_GEO = new THREE.CircleGeometry(.5, 20).rotateX(-Math.PI / 2);
const BLOB_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(.6, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const BLOB_MAT = new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
export function makeBlob(size = 1) {
  const m = new THREE.Mesh(BLOB_GEO, BLOB_MAT); m.scale.setScalar(size); m.renderOrder = 1; m.userData.size = size;
  return m;
}

/** Kolam gelombang tinju (dipakai ulang, tidak membuat material baru setiap tinju). */
export function makePunchWavePool(scene, n = 10) {
  const pool = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0xeaffff, transparent: true, opacity: .6, depthWrite: false }));
    m.visible = false; scene.add(m); pool.push(m);
  }
  let next = 0;
  return { get() { const m = pool[next]; next = (next + 1) % n; m.visible = true; return m; }, release(m) { m.visible = false; }, meshes: pool };
}

/** Kolam serpihan kotak untuk efek pukul / hilang. */
export function makeDebris(scene, count = 160) {
  const mesh = new THREE.InstancedMesh(BOX, new THREE.MeshLambertMaterial(), count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const parts = [];
  const color = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) { parts.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), s: .1, r: 0 }); mesh.setColorAt(i, color.set(0xffffff)); mesh.setMatrixAt(i, zero); }
  let next = 0, alive = 0;
  return {
    burst(pos, hex, n = 14, speed = 4, size = .14) {
      for (let k = 0; k < n; k++) {
        const i = next, p = parts[i]; next = (next + 1) % count;
        p.life = .6 + Math.random() * .4; p.p.copy(pos);
        p.v.set((Math.random() - .5) * speed, Math.random() * speed * .9 + 1.5, (Math.random() - .5) * speed);
        p.s = size * (.6 + Math.random() * .8); p.r = Math.random() * 6;
        mesh.setColorAt(i, color.set(hex));
      }
      alive = count; mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      if (!alive) return;               // tidak ada serpihan: tidak perlu menghitung apa pun
      let live = 0;
      for (let i = 0; i < count; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt; p.v.y -= 14 * dt; p.p.addScaledVector(p.v, dt); p.r += dt * 6;
          if (p.p.y < 0) { p.p.y = 0; p.v.y *= -.3; p.v.x *= .7; p.v.z *= .7; }
          const s = p.life > 0 ? p.s * Math.min(1, p.life * 3) : 0;
          m4.compose(p.p, q.setFromEuler(e.set(p.r, p.r * .7, 0)), sc.set(s, s, s));
          mesh.setMatrixAt(i, m4); live++;
        } else if (p.life > -1) { p.life = -1; mesh.setMatrixAt(i, zero); }
      }
      alive = live; mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
