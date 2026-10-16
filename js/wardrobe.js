// Lemari jagoan: katalog barang (baju, celana, sepatu, rambut, kulit, topi, punggung), dompet permata,
// dan pemasangan tampilan ke model 3D. Semua karakter tetap TANPA WAJAH: topi/aksesori tidak menambah mata/mulut.
// Barang hanya kosmetik (tidak menambah kekuatan), jadi adil untuk semua anak. Warna kulit selalu gratis.
import * as THREE from 'three';
import { block, put, mat } from './characters.js';

export const SLOTS = [
  { id: 'shirt', name: 'Baju', icon: '👕' },
  { id: 'hat', name: 'Topi', icon: '🧢' },
  { id: 'back', name: 'Punggung', icon: '🎒' },
  { id: 'pants', name: 'Celana', icon: '👖' },
  { id: 'shoes', name: 'Sepatu', icon: '👟' },
  { id: 'hair', name: 'Rambut', icon: '✂️' },
  { id: 'skin', name: 'Kulit', icon: '✋' },
];

const color = (slot, id, name, c, price) => ({ id: `${slot}-${id}`, slot, name, color: c, price });
export const ITEMS = [
  // baju: warna polos + baju berpola (lengan bisa beda warna)
  color('shirt', 'biru', 'Biru Laut', 0x2fb5d6, 0),
  color('shirt', 'merah', 'Merah Api', 0xe8504a, 0),
  color('shirt', 'hijau', 'Hijau Hutan', 0x58b947, 15),
  color('shirt', 'kuning', 'Kuning Petir', 0xffc93c, 15),
  color('shirt', 'ungu', 'Ungu Galaksi', 0x9a6bea, 25),
  color('shirt', 'pink', 'Pink Permen', 0xff7eb6, 25),
  { id: 'shirt-jaket', slot: 'shirt', name: 'Jaket Oranye', color: 0xff8c2e, sleeve: 0x2d2d3a, pattern: 'zip', accent: 0xe8e8e8, price: 40 },
  { id: 'shirt-belang', slot: 'shirt', name: 'Kaos Belang', color: 0xffffff, sleeve: 0x3a7bd5, pattern: 'stripes', accent: 0x3a7bd5, price: 60 },
  { id: 'shirt-ninja', slot: 'shirt', name: 'Baju Ninja', color: 0x26262e, sleeve: 0x26262e, pattern: 'belt', accent: 0xd83a3a, price: 80 },
  { id: 'shirt-zirah', slot: 'shirt', name: 'Zirah Ksatria', color: 0xa9b4c2, sleeve: 0x8a95a5, pattern: 'plate', accent: 0xdde4ec, price: 150 },
  { id: 'shirt-emas', slot: 'shirt', name: 'Kostum Emas', color: 0xf5c542, sleeve: 0xe0a92a, pattern: 'trim', accent: 0xfff1a8, price: 250 },
  // topi
  { id: 'hat-none', slot: 'hat', name: 'Tanpa topi', icon: '🚫', price: 0 },
  { id: 'hat-cap', slot: 'hat', name: 'Topi Pet', icon: '🧢', price: 30 },
  { id: 'hat-beanie', slot: 'hat', name: 'Kupluk', icon: '🧶', price: 30 },
  { id: 'hat-ninja', slot: 'hat', name: 'Ikat Kepala', icon: '🥋', price: 40 },
  { id: 'hat-propeller', slot: 'hat', name: 'Baling-baling', icon: '🚁', price: 80 },
  { id: 'hat-viking', slot: 'hat', name: 'Helm Viking', icon: '🐂', price: 100 },
  { id: 'hat-helmet', slot: 'hat', name: 'Helm Ksatria', icon: '⚔️', price: 120 },
  { id: 'hat-crown', slot: 'hat', name: 'Mahkota', icon: '👑', price: 200 },
  // punggung
  { id: 'back-none', slot: 'back', name: 'Kosong', icon: '🚫', price: 0 },
  { id: 'back-bag', slot: 'back', name: 'Ransel', icon: '🎒', price: 40 },
  { id: 'back-cape', slot: 'back', name: 'Jubah Merah', icon: '🟥', price: 70 },
  { id: 'back-galaxy', slot: 'back', name: 'Jubah Galaksi', icon: '🌌', price: 90 },
  { id: 'back-sword', slot: 'back', name: 'Pedang', icon: '🗡️', price: 110 },
  { id: 'back-jet', slot: 'back', name: 'Jetpack', icon: '🚀', price: 140 },
  { id: 'back-wings', slot: 'back', name: 'Sayap', icon: '🪶', price: 160 },
  // celana
  color('pants', 'biru', 'Biru Tua', 0x3c4bb8, 0),
  color('pants', 'abu', 'Abu-abu', 0x5a5f6e, 0),
  color('pants', 'coklat', 'Coklat', 0x6b4a2e, 10),
  color('pants', 'hitam', 'Hitam', 0x26262e, 10),
  color('pants', 'merah', 'Merah', 0xc23b3b, 25),
  color('pants', 'putih', 'Putih', 0xeeeeee, 25),
  color('pants', 'emas', 'Emas', 0xe0a92a, 120),
  // sepatu
  color('shoes', 'abu', 'Abu-abu', 0x3a3a46, 0),
  color('shoes', 'coklat', 'Coklat', 0x5a3a22, 0),
  color('shoes', 'merah', 'Merah', 0xd83a3a, 10),
  color('shoes', 'putih', 'Putih', 0xf2f2f2, 15),
  color('shoes', 'neon', 'Hijau Neon', 0x7dff4a, 25),
  color('shoes', 'emas', 'Emas', 0xf5c542, 100),
  // rambut
  color('hair', 'coklat', 'Coklat', 0x5a3a22, 0),
  color('hair', 'hitam', 'Hitam', 0x1f1a17, 0),
  color('hair', 'pirang', 'Pirang', 0xe8c34a, 20),
  color('hair', 'merah', 'Merah', 0xc2452d, 20),
  color('hair', 'putih', 'Putih', 0xeeeeee, 30),
  color('hair', 'biru', 'Biru', 0x3a7bd5, 40),
  color('hair', 'pink', 'Pink', 0xff7eb6, 40),
  color('hair', 'hijau', 'Hijau', 0x58b947, 40),
  // kulit (selalu gratis)
  color('skin', '1', 'Kulit 1', 0xf6d2b4, 0),
  color('skin', '2', 'Kulit 2', 0xf2c49b, 0),
  color('skin', '3', 'Kulit 3', 0xe0ac7e, 0),
  color('skin', '4', 'Kulit 4', 0xc68e5e, 0),
  color('skin', '5', 'Kulit 5', 0x8d5a3b, 0),
  color('skin', '6', 'Kulit 6', 0x6b4029, 0),
];
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const itemById = (id) => BY_ID.get(id);
const firstFree = (slot) => ITEMS.find((i) => i.slot === slot && i.price === 0);

// ---------------------------------------------------------------------------
// Dompet & barang milik (disimpan di perangkat)
// ---------------------------------------------------------------------------
const START_GEMS = 30; // hadiah awal supaya anak bisa langsung membeli sesuatu
export function loadWardrobe() {
  const w = { gems: START_GEMS, owned: new Set(), eq: {} };
  try {
    const g = localStorage.getItem('kotak.wallet');
    if (g !== null) w.gems = Math.max(0, parseInt(g, 10) || 0);
    const d = JSON.parse(localStorage.getItem('kotak.wardrobe') || 'null');
    if (d) { (d.owned || []).forEach((id) => BY_ID.has(id) && w.owned.add(id)); Object.assign(w.eq, d.eq || {}); }
  } catch {}
  for (const s of SLOTS) {
    const it = BY_ID.get(w.eq[s.id]);
    if (!it || it.slot !== s.id || !(it.price === 0 || w.owned.has(it.id))) w.eq[s.id] = (s.id === 'skin' ? BY_ID.get('skin-2') : firstFree(s.id)).id;
  }
  return w;
}
export function saveWardrobe(w) {
  try {
    localStorage.setItem('kotak.wallet', String(w.gems));
    localStorage.setItem('kotak.wardrobe', JSON.stringify({ owned: [...w.owned], eq: w.eq }));
  } catch {}
}
export const owns = (w, it) => it.price === 0 || w.owned.has(it.id);
/** Beli barang. Mengembalikan true kalau berhasil. */
export function buy(w, it) {
  if (owns(w, it) || w.gems < it.price) return false;
  w.gems -= it.price; w.owned.add(it.id); saveWardrobe(w);
  return true;
}

// ---------------------------------------------------------------------------
// Pasang tampilan ke jagoan
// ---------------------------------------------------------------------------
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
function drawShirt(hero, it) {
  const g = hero.shirtCanvas.getContext('2d'), A = hex(it.accent ?? it.color);
  g.fillStyle = hex(it.color); g.fillRect(0, 0, 16, 16);
  g.fillStyle = A;
  if (it.pattern === 'stripes') for (let y = 1; y < 16; y += 4) g.fillRect(0, y, 16, 2);
  else if (it.pattern === 'zip') { g.fillRect(7, 0, 2, 16); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 14, 16, 2); }
  else if (it.pattern === 'belt') { g.fillRect(0, 11, 16, 2); g.fillRect(6, 0, 1, 11); }
  else if (it.pattern === 'plate') { g.fillRect(2, 2, 12, 5); g.fillRect(2, 9, 12, 5); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(7, 2, 2, 12); }
  else if (it.pattern === 'trim') { g.fillRect(0, 0, 16, 2); g.fillRect(0, 14, 16, 2); g.fillRect(6, 5, 4, 4); }
  hero.mats.shirt.map.needsUpdate = true;
}

// topi (kepala: kubus 0.5 dari y=0 sampai 0.5, depan = -z)
const HATS = {
  'hat-cap'(g) {
    g.add(block(.56, .14, .56, mat(0xd83a3a), .56));
    put(g, block(.5, .05, .26, mat(0xb02e2e), .52)).position.z = -.36;               // lidah topi ke depan
  },
  'hat-beanie'(g) {
    g.add(block(.57, .2, .57, mat(0x3a7bd5), .56), block(.59, .07, .59, mat(0xffffff), .47), block(.14, .14, .14, mat(0xffffff), .72));
  },
  'hat-ninja'(g, fx) {
    g.add(block(.56, .09, .56, mat(0xd83a3a), .4));
    const tails = put(g, new THREE.Group()); tails.position.set(0, .4, .31);
    for (const x of [-.05, .05]) put(tails, block(.06, .26, .03, mat(0xd83a3a), -.12)).position.x = x;
    fx.push((s, dt, a, gait) => { tails.rotation.x = -(.2 + gait * .9) + Math.sin(a.t * 9) * .08 * (gait + .3); });
  },
  'hat-propeller'(g, fx) {
    g.add(block(.56, .14, .56, mat(0xffc93c), .56), block(.04, .12, .04, mat(0x777777), .68));
    const rotor = put(g, new THREE.Group()); rotor.position.y = .75;
    rotor.add(block(.52, .03, .08, mat(0xd83a3a)), block(.08, .03, .52, mat(0x3a7bd5)));
    fx.push((s, dt, a, gait, air) => { rotor.rotation.y += dt * (3 + gait * 14 + (air ? 22 : 0)); });
  },
  'hat-viking'(g) {
    g.add(block(.58, .18, .58, mat(0x8a8f99), .56), block(.6, .06, .6, mat(0xc79a3a), .48));
    for (const sx of [-1, 1]) {
      put(g, block(.14, .1, .1, mat(0xf2ead2), .55)).position.x = sx * .34;
      put(g, block(.08, .16, .08, mat(0xf2ead2), .68)).position.x = sx * .4;
    }
  },
  'hat-helmet'(g) {
    const m = mat(0xa9b4c2);
    g.add(block(.6, .16, .6, m, .57));
    for (const sx of [-1, 1]) put(g, block(.06, .42, .6, m, .34)).position.x = sx * .3;   // depan dibiarkan terbuka (tanpa wajah)
    put(g, block(.6, .42, .06, m, .34)).position.z = .3;
    put(g, block(.08, .22, .4, mat(0xd83a3a), .75)).position.z = .06;                     // jambul
  },
  'hat-crown'(g) {
    const m = mat(0xf5c542);
    for (const z of [-.27, .27]) put(g, block(.58, .1, .04, m, .58)).position.z = z;
    for (const x of [-.27, .27]) put(g, block(.04, .1, .58, m, .58)).position.x = x;
    for (const [x, z] of [[-.27, -.27], [0, -.27], [.27, -.27], [-.27, .27], [0, .27], [.27, .27], [-.27, 0], [.27, 0]]) put(g, block(.07, .1, .07, m, .68)).position.set(x, .68, z);
    put(g, block(.08, .08, .03, mat(0xe8504a), .58)).position.z = -.3;
  },
};

// punggung (badan atas: badan setinggi 0.72 dari y=0, punggung di z=+0.13, bahu di y≈0.7)
function cape(g, fx, c, dots) {
  const pv = put(g, new THREE.Group()); pv.position.set(0, .7, .16);
  pv.add(block(.52, .95, .04, mat(c), -.47));
  if (dots) for (const [x, y] of [[-.15, -.25], [.12, -.45], [-.08, -.7], [.18, -.8], [0, -.15]]) put(pv, block(.05, .05, .02, mat(0xffe066), y)).position.set(x, y, .03);
  let k = 0;
  fx.push((s, dt, a, gait, air) => {
    const want = .1 + gait * .95 + (air ? .5 : 0) + Math.sin(a.t * 8) * .05 * (gait + .2);
    k += (want - k) * Math.min(1, dt * 6); pv.rotation.x = -k;               // jubah terangkat ke belakang saat berlari
  });
}
const BACKS = {
  'back-bag'(g) {
    put(g, block(.42, .46, .18, mat(0xd8633a), .36)).position.z = .22;
    put(g, block(.3, .16, .05, mat(0xb84e2b), .24)).position.z = .33;
    for (const x of [-.13, .13]) put(g, block(.06, .5, .02, mat(0x7a3a20), .42)).position.set(x, .42, -.14);
  },
  'back-cape'(g, fx) { cape(g, fx, 0xd83a3a, false); },
  'back-galaxy'(g, fx) { cape(g, fx, 0x4b2a8a, true); },
  'back-sword'(g) {
    const sw = put(g, new THREE.Group()); sw.position.set(0, .38, .18); sw.rotation.z = .7;
    sw.add(block(.08, .8, .03, mat(0xdfe6ee), .2), block(.26, .06, .06, mat(0xc79a3a), -.22), block(.06, .2, .06, mat(0x5a3a22), -.34));
  },
  'back-jet'(g, fx) {
    const flames = [];
    for (const x of [-.11, .11]) {
      put(g, block(.17, .42, .17, mat(0xb8c2cc), .38)).position.set(x, .38, .23);
      put(g, block(.19, .07, .19, mat(0xd83a3a), .6)).position.set(x, .6, .23);
      const f = put(g, block(.1, .2, .1, mat(0xffa030, { emissive: 0xff6a00 }), 0)); f.position.set(x, .08, .23); flames.push(f);
    }
    fx.push((s, dt, a, gait, air) => {
      for (const f of flames) { f.visible = air || gait > .6; f.scale.y = .2 * (.7 + Math.random() * .6); }
    });
  },
  'back-wings'(g, fx) {
    const wings = [];
    for (const sx of [-1, 1]) {
      const pv = put(g, new THREE.Group()); pv.position.set(sx * .08, .55, .16);
      put(pv, block(.6, .34, .03, mat(0xf5f5ff), .06)).position.x = sx * .32;
      put(pv, block(.34, .18, .03, mat(0xdfe3ff), -.16)).position.x = sx * .22;
      wings.push([pv, sx]);
    }
    fx.push((s, dt, a, gait, air) => {
      const f = air ? Math.sin(a.t * 16) * .55 : Math.sin(a.t * 3) * .12;
      for (const [pv, sx] of wings) pv.rotation.y = sx * (.45 + f);
    });
  },
};

/** Pasang perlengkapan `eq` ({slot: itemId}) ke jagoan. */
export function applyLook(hero, eq) {
  const get = (slot) => BY_ID.get(eq[slot]) || firstFree(slot);
  hero.mats.skin.color.setHex(get('skin').color);
  hero.mats.hair.color.setHex(get('hair').color);
  hero.mats.pants.color.setHex(get('pants').color);
  hero.mats.shoes.color.setHex(get('shoes').color);
  const sh = get('shirt');
  drawShirt(hero, sh); hero.mats.sleeve.color.setHex(sh.sleeve ?? sh.color);
  // aksesori: geometri & material dipakai bersama (BOX + cache), jadi cukup dilepas dari grup
  hero.fx.length = 0;
  hero.accHat.clear(); hero.accBack.clear();
  HATS[get('hat').id]?.(hero.accHat, hero.fx);
  BACKS[get('back').id]?.(hero.accBack, hero.fx);
}

/** Warna kartu untuk barang warna (dipakai UI lemari). */
export const swatchOf = (it) => (it.color != null ? hex(it.color) : null);
export const sleeveOf = (it) => hex(it.sleeve ?? it.color ?? 0xffffff);
