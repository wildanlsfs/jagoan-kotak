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
export function block(w, h, d, material, y = 0) {
  const m = new THREE.Mesh(BOX, material);
  m.scale.set(w, h, d); m.position.y = y;
  return m;
}
/** Tambahkan anak lalu kembalikan ANAK-nya (Object3D.add mengembalikan induk, jadi `.add(x).position` salah sasaran). */
export const put = (parent, child) => (parent.add(child), child);

/**
 * Manusia kotak (proporsi ala Minecraft, tinggi 1.8). Kepala polos tanpa mata/mulut:
 * hanya warna kulit dengan rambut/topi di atas & belakang.
 * Susunan: root → body (naik-turun/jongkok/pegas) → kaki + upper (pinggang: condong & memutar) → kepala, lengan.
 */
export function makeHumanoid({ skin, shirt, pants, hair, shoes = 0x3a3a46, hat = null, scale = 1, own = false }) {
  const M = (c) => (own ? new THREE.MeshLambertMaterial({ color: c }) : mat(c));
  const mats = { skin: M(skin), shirt: M(shirt), pants: M(pants), hair: hair != null ? M(hair) : null, shoes: M(shoes) };
  mats.sleeve = own ? M(shirt) : mats.shirt;                       // lengan baju (bisa beda warna, mis. jaket)
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

  const armL = limb(.24, .72, .24, mats.sleeve); armL.position.set(-.37, .69, 0); upper.add(armL);
  const armR = limb(.24, .72, .24, mats.sleeve); armR.position.set(.37, .69, 0); upper.add(armR);
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
    fx: [],                                                             // animasi aksesori (baling-baling, jubah, sayap…)
    a: { t: Math.random() * 10, phase: 0, amp: 0, ground: true, land: 0, toff: 0, cy: 0 } };
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
  if (a.ground && air) a.toff = .16;                                   // lepas landas → badan meregang sebentar
  a.ground = !air; a.land = Math.max(0, a.land - dt); a.toff = Math.max(0, a.toff - dt);
  const flip = s.flip > 0 ? s.flip : 0;                                // salto lompat ganda (0..1)

  // jurus hentak bumi: naik (angkat tangan) lalu menghantam
  const slamP = s.slam > 0 ? 1 - s.slam / .6 : -1;
  const slamUp = slamP >= 0 && slamP < .35, slamDown = slamP >= .35;

  // ---- kaki: pinggul (x+ = paha ke depan), lutut (x- = betis menekuk ke belakang), sepatu dijaga datar
  let lL, lR, nL = 0, nR = 0;
  const cyc = Math.cos(a.phase);
  if (flip) { lL = lR = 1.5; nL = nR = -2.1; }                                             // salto: lutut dipeluk
  else if (air) { lL = .95; nL = -1.3; lR = -.2; nR = -.75; }                             // lutut ditekuk di udara
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
  const bob = air || s.crouch ? 0 : Math.abs(Math.cos(a.phase)) * (.075 + .05 * gait) * a.amp;
  const breath = Math.sin(a.t * 2.2) * .012 * (1 - Math.min(1, a.amp * 2));
  r.body.position.y = a.cy + bob + breath;
  const sq = a.land > 0 ? Math.sin(a.land / .2 * Math.PI) * .12 : 0;
  const str = a.toff > 0 ? Math.sin(a.toff / .16 * Math.PI) * .1 : 0;
  r.body.scale.set(1 + sq * .5 - str * .3, 1 - sq + str, 1 + sq * .5 - str * .3);
  // salto ke depan, berputar di sekitar pinggang (bukan di telapak kaki)
  if (flip) {
    const th = easeInOut(flip) * Math.PI * 2, h = .9;
    r.body.rotation.x = -th; r.body.position.y += h - h * Math.cos(th); r.body.position.z = h * Math.sin(th);
  } else if (r.body.rotation.x) { r.body.rotation.x = 0; r.body.position.z = 0; }

  // ---- pinggang: condong & memutar ke arah tinju
  const eL = punchExt(s.punchL || 0), eR = punchExt(s.punchR || 0);
  let lean = -.22 * gait - (eL + eR) * .08;                            // makin cepat, makin condong
  if (s.crouch) lean = -.45;
  if (s.block) lean -= .06;
  if (s.windup) lean += .3 * s.windup;
  const striking = s.swing >= 0 && s.swing < .45;
  if (striking) lean -= .4 * (1 - s.swing / .45);
  if (slamUp) lean += .15; if (slamDown) lean -= .4;
  if (s.hurt) lean += .5 * s.hurt;
  const twist = (eR - eL) * .45 + Math.sin(a.phase) * .1 * a.amp * (knees ? 0 : 1);
  to(r.upper, 'x', lean, kq); to(r.upper, 'y', twist, kq);
  to(r.upper, 'z', s.mirror && !flip ? s.mirror.roll * .6 : 0, k);                    // bahu miring mengikuti pemain

  // ---- lengan
  const arm = (o, sx, ext, other, legSw) => {
    if (ext > 0) { o.rotation.x = .2 + ext * 1.42; o.rotation.z = -sx * .1 * ext; return; } // tinju lurus ke depan
    let x, z;
    const mir = s.mirror && !slamUp && !slamDown && !flip ? s.mirror[sx < 0 ? 'L' : 'R'] : null;
    if (s.block) { x = 1.95; z = -sx * .62; }                                              // silang di depan wajah
    else if (slamUp || s.raise) { x = 2.95; z = sx * .28; }                                // tangan ke atas
    else if (slamDown) { x = .55; z = sx * .55; }
    else if (striking && sx > 0) { const q = clamp01(s.swing / .12); x = 3.4 - 2.6 * easeOut(q); z = 0; o.rotation.x = x; o.rotation.z = z; return; }
    else if (s.windup && sx > 0) { x = 1.4 + 2.0 * s.windup; z = .1; }                     // ancang-ancang mengangkat lengan
    else if (s.zombie) { x = 1.42 + legSw * .18; z = -sx * .06; }                         // lengan terjulur ala zombi
    else if (flip) { x = 1.6; z = -sx * .2; }                                              // memeluk lutut saat salto
    else if (air) { x = .35; z = sx * .85; }
    else if (other > 0) { x = .75; z = -sx * .28; }                                        // tangan lain menjaga
    else if (s.crouch) { x = .95; z = -sx * .1; }
    else { x = -clamp(legSw, -.85, .85) * (.95 + .35 * gait); z = sx * (.05 + Math.sin(a.t * 2.2) * .02); }               // berayun berlawanan dengan kaki
    const ov = s.arms && s.arms[sx < 0 ? 'L' : 'R'];                                        // pose khusus (membidik, merapal)
    if (ov) { x = ov[0]; z = ov[1]; }
    if (mir) { x += (mir.x - x) * mir.w; z += (mir.z - z) * mir.w; }                      // hibrida: tiru lengan pemain
    to(o, 'x', x, kq); to(o, 'z', z, kq);
  };
  arm(r.armL, -1, eL, eR, lL);
  arm(r.armR, 1, eR, eL, lR);

  // ---- kepala menoleh/mendongak mengikuti pemain
  to(r.headPivot, 'y', s.headYaw || 0);
  to(r.headPivot, 'x', (s.headPitch || 0) * .7 + (s.crouch ? .3 : 0));

  for (const f of r.fx) f(s, dt, a, gait, air);
}

/** Jagoan pemain: material sendiri + tekstur baju dari kanvas (pola diatur lemari, lihat wardrobe.js). */
export function makeHero() {
  const r = makeHumanoid({ skin: 0xf2c49b, shirt: 0xffffff, pants: 0x3c4bb8, hair: 0x5a3a22, own: true });
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  r.mats.shirt.map = tex; r.shirtCanvas = c;
  r.accHat = put(r.headPivot, new THREE.Group());
  r.accBack = put(r.upper, new THREE.Group());
  return r;
}

/** Monster kotak (tanpa wajah): kulit hijau-limau, baju ungu; level 2 berbaju merah & bertopi. */
export function makeBrute(level = 1) {
  return makeHumanoid({ skin: 0x8fd16a, shirt: level > 1 ? 0xd65b5b : 0x8e6bd6, pants: 0x3b3355, hair: null, hat: level > 1 ? 0x2d2d3a : null, scale: level > 1 ? 1.15 : 1 });
}

/**
 * Bos Raja Batu: manusia kotak raksasa dari batu, bermahkota emas, permata menyala di dada, bantalan bahu.
 * Tetap TANPA WAJAH. `stars` = bintang kecil berputar di atas kepala saat bos pusing.
 */
export function makeBoss() {
  const r = makeHumanoid({ skin: 0x9ea3ab, shirt: 0x5d6472, pants: 0x3d424d, hair: null, shoes: 0x2e323a, hat: 0xffc83d, scale: 2.3 });
  const gold = mat(0xffc83d);
  for (const x of [-.24, 0, .24]) for (const z of [-.24, 0, .24]) if (x || z) put(r.headPivot, block(.1, .16, .1, gold, .68)).position.set(x, .68, z); // gerigi mahkota
  put(r.upper, block(.18, .18, .06, mat(0xff7a3c, { emissive: 0xff5a1a, emissiveIntensity: .7 }), .46)).position.z = -.14; // permata dada (depan = -z)
  for (const sx of [-1, 1]) put(r.upper, block(.34, .14, .34, mat(0x7b828f), .76)).position.x = sx * .37;                 // bantalan bahu
  addStars(r, 2.55);
  return r;
}
/** Bintang kecil berputar di atas kepala (bos pusing). y dalam satuan lokal sebelum skala. */
function addStars(r, y) {
  const gold = mat(0xffc83d);
  r.stars = put(r.root, new THREE.Group()); r.stars.position.y = y; r.stars.visible = false;
  for (let i = 0; i < 3; i++) { const st = block(.13, .13, .13, gold); const a = i / 3 * Math.PI * 2; st.position.set(Math.cos(a) * .38, 0, Math.sin(a) * .38); r.stars.add(st); }
}
const crown = (head, y = .68) => { const gold = mat(0xffc83d); for (const x of [-.24, 0, .24]) for (const z of [-.24, 0, .24]) if (x || z) put(head, block(.1, .16, .1, gold, y)).position.set(x, y, z); };

/**
 * Tengkorak: tulang gading, rongga dada gelap dengan tulang rusuk, lengan & kaki kurus.
 * Kepala tengkorak POLOS (tanpa lubang mata — semua karakter tanpa wajah).
 *  - pedang (bawaan): helm besi + pedang di tangan kanan
 *  - archer: tudung hijau + busur di tangan kiri + tabung panah di punggung; `nock` = anak panah saat membidik
 *  - king: raksasa bermahkota dengan jubah ungu & pedang besar (bos Raja Tengkorak)
 */
export function makeSkeleton({ archer = false, king = false } = {}) {
  const bone = 0xe9e4d0, boneM = mat(bone);
  const r = makeHumanoid({ skin: bone, shirt: 0x2f2b36, pants: 0x2f2b36, hair: archer ? 0x3f7a3a : null, shoes: 0xd6d0b8, hat: king ? 0xffc83d : archer ? null : 0x8d96a3, scale: king ? 2.2 : 1 });
  const thin = (o) => o.traverse((m) => { if (m.isMesh) { m.material = boneM; m.scale.x *= .55; m.scale.z *= .55; } });
  thin(r.armL); thin(r.armR); thin(r.legL); thin(r.legR);
  for (const y of [.56, .42, .28]) put(r.upper, block(.54, .07, .3, boneM, y));          // tulang rusuk
  put(r.upper, block(.08, .72, .06, boneM, .36)).position.z = .1;                         // tulang punggung
  put(r.upper, block(.42, .1, .26, boneM, .04));                                          // panggul
  if (king) {
    crown(r.headPivot);
    put(r.upper, block(.6, 1.0, .05, mat(0x5b2a86), .25)).position.z = .17;               // jubah
    for (const sx of [-1, 1]) put(r.upper, block(.3, .12, .3, mat(0x7b828f), .74)).position.x = sx * .37;
    addStars(r, 2.5);
  }
  if (archer) {
    // busur di tangan kiri: memanjang di sumbu z lokal → tegak saat lengan diulurkan ke depan
    const bow = put(r.armL, new THREE.Group()); bow.position.y = -.66;
    const wood = mat(0x8a5a2b);
    put(bow, block(.06, .06, .5, wood));
    for (const sz of [-1, 1]) { const b = put(bow, block(.06, .06, .34, wood)); b.position.set(0, .1, sz * .38); b.rotation.x = sz * .5; }
    put(bow, block(.015, .015, 1.0, mat(0xf2efe6))).position.y = .2;                      // tali
    r.nock = put(r.armL, new THREE.Group()); r.nock.visible = false;
    put(r.nock, block(.04, .75, .04, wood, -.95)); put(r.nock, block(.08, .12, .08, mat(0x9aa3ad), -1.36));
    const q = put(r.upper, block(.16, .5, .16, mat(0x6b4426), .42)); q.position.z = .2; q.rotation.z = .3;   // tabung panah
  } else {
    // pedang: gagang di genggaman, bilah ke depan (tegak saat lengan diangkat)
    const sw = put(r.armR, new THREE.Group()); sw.position.y = -.66;
    put(sw, block(.07, .1, king ? 1.25 : .9, mat(0xcfd8e3))).position.z = king ? -.68 : -.5;
    put(sw, block(.32, .07, .08, mat(king ? 0xffc83d : 0x6b4426))).position.z = -.06;
  }
  return r;
}

/**
 * Penyihir jahat: jubah ungu (kaki tersembunyi, melayang), topi runcing, tongkat dengan ujung bercahaya.
 * Kepala polos tanpa wajah; rambut menutup belakang. queen = Ratu Penyihir (bos) bermahkota.
 * `glow` = material ujung tongkat (terang saat merapal sihir).
 */
export function makeWitch({ queen = false } = {}) {
  const robe = queen ? 0x40195e : 0x5b2a86, robeM = mat(robe);
  const r = makeHumanoid({ skin: 0xc4cfb0, shirt: robe, pants: robe, hair: queen ? 0xe2e2ef : 0x2b2140, shoes: robe, scale: queen ? 2.0 : 1 });
  r.legL.visible = r.legR.visible = false;
  put(r.body, block(.56, .42, .34, robeM, .55)); put(r.body, block(.68, .38, .44, robeM, .2)); // rok jubah melebar
  const hatM = mat(queen ? 0x241035 : 0x2d1b46);
  put(r.headPivot, block(.8, .06, .8, hatM, .53));
  put(r.headPivot, block(.46, .2, .46, hatM, .66));
  put(r.headPivot, block(.32, .2, .32, hatM, .85)).position.z = .04;
  put(r.headPivot, block(.2, .18, .2, hatM, 1.02)).position.z = .1;
  put(r.headPivot, block(.11, .14, .11, hatM, 1.16)).position.z = .19;
  put(r.headPivot, block(.48, .06, .48, mat(queen ? 0xffc83d : 0x7cd67a), .6));            // pita topi
  if (queen) { crown(r.headPivot, .6); addStars(r, 2.35); }
  r.glow = new THREE.MeshLambertMaterial({ color: 0xd36bff, emissive: 0xb23cff, emissiveIntensity: .4 });
  const staff = put(r.armR, new THREE.Group()); staff.position.y = -.66;
  put(staff, block(.07, 1.35, .07, mat(0x5a3a22), .1));
  put(staff, new THREE.Mesh(BOX, r.glow)).scale.setScalar(.2); staff.children[1].position.y = .85;
  return r;
}

// --- proyektil musuh (geometri & material bersama) ---
/** Anak panah menghadap -z (diarahkan dengan lookAt). */
export function makeArrow(bone = false) {
  const g = new THREE.Group();
  put(g, block(.05, .05, .8, mat(bone ? 0xe9e4d0 : 0x8a5a2b)));
  put(g, block(.1, .1, .14, mat(0x9aa3ad))).position.z = -.44;
  put(g, block(.16, .02, .16, mat(0xffffff))).position.z = .36;
  return g;
}
/** Bola sihir ungu bercahaya. */
export function makeOrb() {
  const g = new THREE.Group();
  put(g, new THREE.Mesh(BOX, mat(0xd36bff, { emissive: 0xb23cff, emissiveIntensity: .9 }))).scale.setScalar(.36);
  put(g, new THREE.Mesh(BOX, mat(0xffffff, { transparent: true, opacity: .35 }))).scale.setScalar(.56);
  return g;
}
/** Latihan: batang kayu melayang setinggi kepala (jongkok!) dan bola batu menggelinding (lompat/condong). */
export function makeLog() { return block(4, .3, .3, mat(0x8a5a2b)); }
export function makeBall() { const g = new THREE.Group(); put(g, block(.9, .9, .9, mat(0x9ea3ab))); put(g, block(.5, .92, .5, mat(0x7b828f))); return g; }

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
