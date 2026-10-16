import * as THREE from 'three';
import { buildWorld, setupSky, groundAt, walkable, blockAt, islandRadius } from './world.js';
import { makeHero, makeBrute, makeSlime, makeBat, makeDummy, makeGem, makeHeart, makePunchWavePool, makeDebris, makeBlob, animateHumanoid, OUTFITS, setOutfit, PUNCH_T, easeOutBack } from './characters.js';
import { createMotion, drawSkeleton } from './motion.js';
import { sfx, music, unlock, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $('game'), cam: $('cam'), video: $('video'), pose: $('pose'), camStatus: $('cam-status'),
  hud: $('hud'), hearts: $('hearts'), wave: $('wave'), gems: $('gems'), steps: $('steps'), foes: $('foes'),
  energy: $('energy-fill'), energyBox: $('energy'), gesture: $('gesture'), prompt: $('prompt'), promptText: $('prompt-text'), promptSkip: $('prompt-skip'),
  toast: $('toast'), hurt: $('hurt'), reticle: $('reticle'),
  start: $('start'), calib: $('calib'), calibCount: $('calib-count'), calibBar: $('calib-bar'), calibHint: $('calib-hint'),
  pause: $('pause'), pauseMsg: $('pause-msg'), over: $('over'), summary: $('summary'), overTitle: $('over-title'),
  touch: $('touch'), stick: $('stick'), knob: $('knob'),
  howto: $('howto'), outfits: $('outfits'), menuMain: $('menu-main'), recWave: $('rec-wave'), recSteps: $('rec-steps'), recKills: $('rec-kills'),
  overBadge: $('over-badge'), stars: $('stars'),
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DEBUG = location.search.includes('debug');

// ---------------------------------------------------------------------------
// Renderer, scene, kamera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Dunia tidak bergerak, jadi peta bayangan cukup dibuat SEKALI (bukan setiap frame).
// Karakter memakai bayangan bulat di tanah. Ini menghemat satu putaran gambar seluruh pulau per frame.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, .1, 300);
setupSky(scene);
buildWorld(scene);

let sizeKey = '';
function resize() {
  const w = Math.max(1, ui.canvas.clientWidth || innerWidth), h = Math.max(1, ui.canvas.clientHeight || innerHeight);
  const key = `${w}x${h}@${pixelRatio}`; if (key === sizeKey) return; sizeKey = key;
  renderer.setPixelRatio(pixelRatio); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 78 : 65; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => { resize(); setTimeout(resize, 250); setTimeout(resize, 600); });
visualViewport?.addEventListener('resize', resize);
new ResizeObserver(resize).observe(ui.canvas);
resize();

// ---------------------------------------------------------------------------
// Pemain
// ---------------------------------------------------------------------------
let outfitId = 'biru'; try { outfitId = localStorage.getItem('kotak.outfit') || 'biru'; } catch {}
const hero = makeHero(OUTFITS.find((o) => o.id === outfitId) || OUTFITS[0]);
scene.add(hero.root);
const heroBlob = makeBlob(1); scene.add(heroBlob);
const P = {
  pos: new THREE.Vector3(0, 2, 4), yaw: 0, vy: 0, onGround: true, speed: 0,
  hp: 5, maxHp: 5, invuln: 0, energy: 0, punchL: 0, punchR: 0, nextHand: 'R', phase: 0, superFx: 0, hurtT: 0,
};
const stats = { steps: 0, punches: 0, jumps: 0, crouches: 0, kills: 0, gems: 0, active: 0, wave: 0 };

// ---------------------------------------------------------------------------
// Input gabungan: kamera (gerak tubuh), keyboard, sentuh
// ---------------------------------------------------------------------------
const ctl = { fwd: 0, run: false, turn: 0, look: 0, block: false, crouch: false, punchL: false, punchR: false, jump: false, superReq: false, source: 'keyboard' };
const keys = new Set();
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyJ') ctl.punchL = true;
  if (e.code === 'KeyK') ctl.punchR = true;
  if (e.code === 'Space') ctl.jump = true;
  if (e.code === 'KeyU') ctl.superReq = true;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
addEventListener('keyup', (e) => keys.delete(e.code));
ui.canvas.addEventListener('mousedown', (e) => { if (state.mode === 'play' || state.mode === 'tutorial') { if (e.button === 2) ctl.punchR = true; else ctl.punchL = true; } });
ui.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// sentuh: stik (maju/belok) + tombol
const touch = { x: 0, y: 0, id: null, block: false, crouch: false, look: false };
function stickMove(t) {
  const r = ui.stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
  let dx = t.clientX - cx, dy = t.clientY - cy; const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  ui.knob.style.transform = `translate(${dx}px, ${dy}px)`; touch.x = dx / R; touch.y = dy / R;
}
ui.stick.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; touch.id = t.identifier; stickMove(t); }, { passive: false });
ui.stick.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === touch.id) stickMove(t); }, { passive: false });
const stickEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === touch.id) { touch.id = null; touch.x = touch.y = 0; ui.knob.style.transform = ''; } };
ui.stick.addEventListener('touchend', stickEnd); ui.stick.addEventListener('touchcancel', stickEnd);
const holdBtn = (id, key) => { const b = $(id); b.addEventListener('touchstart', (e) => { e.preventDefault(); touch[key] = true; }, { passive: false }); const up = () => (touch[key] = false); b.addEventListener('touchend', up); b.addEventListener('touchcancel', up); };
const tapBtn = (id, fn) => $(id).addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
holdBtn('t-block', 'block'); holdBtn('t-crouch', 'crouch'); holdBtn('t-look', 'look');
tapBtn('t-punch', () => { if (P.nextHand === 'L') ctl.punchL = true; else ctl.punchR = true; });
tapBtn('t-jump', () => (ctl.jump = true));
tapBtn('t-super', () => (ctl.superReq = true));

// kamera + MediaPipe
const motion = createMotion();
let landmarker = null, lastVideoTime = -1;
const pctx = ui.pose.getContext('2d');
async function startCamera() {
  ui.camStatus.textContent = 'memuat…';
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
  const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  landmarker = await vision.PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'GPU' },
    runningMode: 'VIDEO', numPoses: 2,
  });
  ui.camStatus.textContent = 'izinkan kamera ya…';
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
  ui.video.srcObject = stream; await ui.video.play();
  ui.pose.width = ui.video.videoWidth || 640; ui.pose.height = ui.video.videoHeight || 480;
  ui.camStatus.textContent = 'kamera aktif';
  ctl.source = 'pose';
}
function readPose(now) {
  if (!landmarker || ui.video.readyState < 2 || ui.video.currentTime === lastVideoTime) return null;
  lastVideoTime = ui.video.currentTime;
  const res = landmarker.detectForVideo(ui.video, now);
  return handlePose(res.landmarks || [], res.worldLandmarks || [], now);
}
/** Satu frame pose → input. Dipisah supaya bisa diuji dengan landmark buatan (?debug). */
function handlePose(all, world, now) {
  const W = ui.pose.width, H = ui.pose.height;
  const ev = motion.process(all, world, now, { aspect: W / H, calibrating: state.mode === 'calib' });
  const s = motion.st;
  pctx.clearRect(0, 0, W, H);
  all.forEach((lm) => drawSkeleton(pctx, lm, W, H, 'rgba(255,255,255,.4)', 2, false));
  if (s.ok) {
    const me = all.length === 1 ? all[0] : null;
    if (me) drawSkeleton(pctx, me, W, H, s.block ? '#5ef0ff' : s.crouch ? '#ffd166' : '#5bd77a', 4, true);
  }
  if (ctl.source !== 'pose') return ev;
  if (ev.step) { stats.steps++; if (state.mode === 'play' || state.mode === 'tutorial') { P.energy = Math.min(100, P.energy + 1.4); sfx.step(); } }
  if (ev.punchL) ctl.punchL = true;
  if (ev.punchR) ctl.punchR = true;
  if (ev.jump) ctl.jump = true;
  if (s.raiseHeld > .45) ctl.superReq = true;
  if (!s.ok) {
    ui.camStatus.textContent = motion.lostSince && all.length ? 'Itu bukan kamu 👀' : 'Kamu tidak terlihat 👀';
    if (state.mode === 'play' && motion.lostSince && now - motion.lostSince > 2000) { togglePause(); ui.pauseMsg.hidden = false; }
  } else ui.camStatus.textContent = !s.kneesVisible && !s.moving ? 'Lutut tak terlihat — melangkah yang mantap ya' : s.block ? 'perisai 🛡️' : s.crouch ? 'jongkok 🙇' : s.run ? 'lari! 🏃' : s.moving ? 'jalan 🚶' : s.raise ? 'tangan ke atas 🙌' : s.turn > .2 ? 'belok kiri ↩️' : s.turn < -.2 ? 'belok kanan ↪️' : 'siap 🙂';
  return ev;
}

function gatherInput(dt) {
  const s = motion.st;
  if (ctl.source === 'pose') {
    ctl.fwd = s.moving ? 1 : 0; ctl.run = s.run; ctl.turn = s.turn; ctl.look = s.look; ctl.block = s.block; ctl.crouch = s.crouch;
  } else {
    const up = keys.has('KeyW') || keys.has('ArrowUp'), back = keys.has('KeyS') || keys.has('ArrowDown');
    ctl.fwd = up ? 1 : back ? -.6 : 0; ctl.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    ctl.turn = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
    const lookT = keys.has('KeyQ') ? 1 : keys.has('KeyE') ? -.5 : 0;
    ctl.block = keys.has('KeyL'); ctl.crouch = keys.has('KeyC') || keys.has('ControlLeft');
    // sentuh
    if (touch.id !== null) { ctl.fwd = clamp(-touch.y * 1.3, -.6, 1); ctl.run = -touch.y > .85; ctl.turn = Math.abs(touch.x) > .15 ? -touch.x : 0; }
    ctl.block ||= touch.block; ctl.crouch ||= touch.crouch;
    ctl.look += ((touch.look ? 1 : lookT) - ctl.look) * Math.min(1, dt * 6);
    if (ctl.fwd > 0 && P.onGround) { P.stepAcc = (P.stepAcc || 0) + dt * (ctl.run ? 3 : 2); if (P.stepAcc >= 1) { P.stepAcc -= 1; stats.steps++; P.energy = Math.min(100, P.energy + 1.4); } }
  }
}

// ---------------------------------------------------------------------------
// Gerak & tabrakan dengan dunia kotak
// ---------------------------------------------------------------------------
const RADIUS = .3;
function canStand(x, z, feetY) {
  for (const [ox, oz] of [[RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]) {
    if (!walkable(x + ox, z + oz)) return false;
    if (groundAt(x + ox, z + oz) - feetY > 1.05) return false; // tebing lebih dari 1 balok
  }
  return true;
}
function moveBody(b, dx, dz) {
  let moved = false;
  if (dx && canStand(b.pos.x + dx, b.pos.z, b.pos.y)) { b.pos.x += dx; moved = true; }
  if (dz && canStand(b.pos.x, b.pos.z + dz, b.pos.y)) { b.pos.z += dz; moved = true; }
  return moved;
}
function physicsY(b, dt) {
  const g = groundAt(b.pos.x, b.pos.z);
  if (b.onGround && g > b.pos.y) { b.pos.y = Math.min(g, b.pos.y + dt * 9); if (b.pos.y >= g) b.pos.y = g; return; } // naik 1 balok otomatis
  b.vy -= 24 * dt; b.pos.y += b.vy * dt;
  if (b.pos.y <= g) { b.pos.y = g; b.vy = 0; b.onGround = true; } else if (b.pos.y > g + .05) b.onGround = false;
}

// ---------------------------------------------------------------------------
// Monster, proyektil, barang
// ---------------------------------------------------------------------------
const foes = [];
const waves = [];     // gelombang tinju aktif
const items = [];     // permata & hati
const dying = [];     // monster yang sedang roboh (animasi kalah)
const debris = makeDebris(scene);
const wavePool = makePunchWavePool(scene);
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const dummy = makeDummy(); dummy.root.visible = false; scene.add(dummy.root);
let dummyHits = 0, dummyWobble = 0;

// lingkaran gelombang jurus super
const ring = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; scene.add(ring);

const FOE = {
  slime: { hp: 2, h: 1, r: .55, speed: 0, gems: 1, score: 10, color: 0x6fdc6f },
  slimeS: { hp: 1, h: .6, r: .35, speed: 0, gems: 1, score: 5, color: 0x6fdc6f },
  brute: { hp: 3, h: 1.8, r: .4, speed: 1.45, gems: 2, score: 20, color: 0x8e6bd6 },
  brute2: { hp: 5, h: 2.05, r: .45, speed: 1.8, gems: 3, score: 35, color: 0xd65b5b },
  bat: { hp: 1, h: .5, r: .45, speed: 0, gems: 2, score: 15, color: 0x6a4f94 },
};
function spawnFoe(type, near) {
  const def = FOE[type];
  let rig;
  if (type === 'slime' || type === 'slimeS') rig = makeSlime(type === 'slime');
  else if (type === 'bat') rig = makeBat();
  else rig = makeBrute(type === 'brute2' ? 2 : 1);
  const f = { type, def, rig, hp: def.hp, pos: new THREE.Vector3(), yaw: 0, vy: 0, onGround: true, t: Math.random() * 1.5, state: 'chase', timer: 0, flash: 0, knock: new THREE.Vector3(), phase: Math.random() * 6, hurtCd: 0, orbit: Math.random() * 6,
    born: 0, hurtT: 0, atkT: -1, speed: 0 };
  // tempat muncul: di pulau, jauh dari pemain
  for (let k = 0; k < 60; k++) {
    const a = Math.random() * Math.PI * 2, d = near ? 1.2 : 12 + Math.random() * 8;
    const x = (near ? near.x : P.pos.x) + Math.cos(a) * d, z = (near ? near.z : P.pos.z) + Math.sin(a) * d;
    if (Math.hypot(x, z) < islandRadius - 3 && walkable(x, z)) { f.pos.set(x, groundAt(x, z), z); break; }
  }
  if (type === 'bat') f.pos.y += 4.5;
  f.blob = makeBlob(def.r * 2.2); scene.add(f.blob);
  rig.root.position.copy(f.pos); rig.root.scale.setScalar(.01);
  scene.add(rig.root);
  foes.push(f);
  debris.burst(f.pos.clone().add(new THREE.Vector3(0, .5, 0)), 0xffffff, 10, 3);
  return f;
}
function removeFoe(f) {
  scene.remove(f.rig.root); scene.remove(f.blob);
  const i = foes.indexOf(f); if (i >= 0) foes.splice(i, 1);
  const j = dying.indexOf(f); if (j >= 0) dying.splice(j, 1);
}
function setFlash(f, on) {
  f.rig.root.traverse((o) => { if (o.isMesh) { if (on) { o.userData.m ??= o.material; o.material = flashMat; } else if (o.userData.m) o.material = o.userData.m; } });
}
function hurtFoe(f, dmg, dir, power = 4) {
  f.hp -= dmg; f.flash = .12; f.hurtT = .3; setFlash(f, true);
  f.knock.set(dir.x, 0, dir.z).normalize().multiplyScalar(power);
  if (f.type !== 'bat') { f.vy = 3.5; f.onGround = false; }
  else { f.state = 'circle'; f.timer = 2.5; }
  if (f.state === 'windup') { f.state = 'recover'; f.timer = .6; }
  debris.burst(center(f), f.def.color, 8, 4);
  sfx.hit();
  P.energy = Math.min(100, P.energy + 4);
  if (f.hp <= 0) killFoe(f);
}
function killFoe(f) {
  const c = center(f);
  debris.burst(c, f.def.color, 26, 6, .2); sfx.poof();
  stats.kills++; state.score += f.def.score;
  for (let k = 0; k < f.def.gems; k++) dropItem('gem', c);
  if (Math.random() < .14 || (P.hp <= 2 && Math.random() < .35)) dropItem('heart', c);
  if (f.type === 'slime') { spawnFoe('slimeS', f.pos); spawnFoe('slimeS', f.pos); state.foesLeft += 2; }
  // roboh dulu sebentar (bukan langsung hilang), lalu jadi serpihan
  foes.splice(foes.indexOf(f), 1); dying.push(f); state.foesLeft--;
  f.die = 0; f.fallDir = Math.random() < .5 ? 1 : -1; f.flash = .5; setFlash(f, true);
}
function updateDying(dt) {
  for (const f of [...dying]) {
    f.die += dt;
    const p = Math.min(1, f.die / .38), r = f.rig.root;
    if (f.type === 'bat') { f.pos.y -= dt * 6 * p; r.rotation.z += dt * 14; }
    else if (f.type === 'slime' || f.type === 'slimeS') { f.rig.body.scale.set(1 + p * .6, 1 - p * .85, 1 + p * .6); }
    else { r.rotation.z = f.fallDir * easeOutBack(p) * 1.45; f.rig.upper.rotation.x = .4; }
    r.position.copy(f.pos);
    f.blob.material.opacity = 1;
    f.blob.scale.setScalar(f.blob.userData.size * (1 - p * .7));
    if (f.die >= .38) { debris.burst(center(f), 0xffffff, 10, 3, .12); removeFoe(f); }
  }
}
const center = (f, out = new THREE.Vector3()) => out.set(f.pos.x, f.pos.y + f.def.h * .55, f.pos.z);

function dropItem(kind, at) {
  const mesh = kind === 'gem' ? makeGem() : makeHeart();
  const it = { kind, mesh, pos: at.clone(), v: new THREE.Vector3((Math.random() - .5) * 3, 5, (Math.random() - .5) * 3), t: 0 };
  scene.add(mesh); items.push(it);
}

function damagePlayer(from, label) {
  if (P.invuln > 0 || state.mode !== 'play') return false;
  const dir = new THREE.Vector3().subVectors(P.pos, from).setY(0).normalize();
  const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  if (ctl.block && fwd.dot(dir) < -.2) { // serangan dari depan ditangkis
    sfx.block(); toast('TANGKIS! 🛡️'); debris.burst(P.pos.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(fwd, .5), 0x5ef0ff, 10, 3);
    P.energy = Math.min(100, P.energy + 6);
    return 'blocked';
  }
  P.hp--; P.invuln = 1.2; P.hurtT = .35; sfx.hurt();
  moveBody(P, dir.x * .8, dir.z * .8);
  ui.hurt.classList.remove('on'); void ui.hurt.offsetWidth; ui.hurt.classList.add('on');
  toast(label || 'Aduh!');
  renderHearts();
  if (P.hp <= 0) gameOver();
  return true;
}

// ---------------------------------------------------------------------------
// Aksi pemain
// ---------------------------------------------------------------------------
const aimDir = () => {
  const p = .08 + ctl.look * .85;
  return new THREE.Vector3(-Math.sin(P.yaw) * Math.cos(p), Math.sin(p), -Math.cos(P.yaw) * Math.cos(p));
};
function punch(hand) {
  if (hand === 'L') P.punchL = PUNCH_T; else P.punchR = PUNCH_T;
  P.nextHand = hand === 'L' ? 'R' : 'L';
  stats.punches++; sfx.punch();
  const side = hand === 'L' ? 1 : -1;
  const right = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const origin = P.pos.clone().add(new THREE.Vector3(0, ctl.crouch ? .95 : 1.35, 0)).addScaledVector(right, side * -.35);
  let dir = aimDir();
  // bantuan bidik ramah anak: belokkan ke monster terdekat dalam kerucut di depan
  let best = null, bestScore = Infinity;
  const targets = foes.map((f) => ({ c: center(f), r: f.def.r }));
  if (dummy.root.visible) targets.push({ c: dummy.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)), r: .5, dummy: true });
  for (const t of targets) {
    const to = t.c.clone().sub(origin), d = to.length(); if (d > 10) continue;
    to.normalize();
    const flat = Math.acos(clamp(new THREE.Vector2(to.x, to.z).normalize().dot(new THREE.Vector2(dir.x, dir.z).normalize()), -1, 1));
    const vert = Math.abs(Math.asin(clamp(to.y, -1, 1)) - Math.asin(clamp(dir.y, -1, 1)));
    if (flat < .55 && vert < .5) { const sc = flat + vert + d * .03; if (sc < bestScore) { bestScore = sc; best = to; } }
  }
  if (best) dir = best;
  const mesh = wavePool.get(); mesh.position.copy(origin);
  waves.push({ mesh, pos: origin, dir, life: .55, hit: new Set() });
}
function superSlam() {
  if (P.energy < 100) return;
  P.energy = 0; P.superFx = .6; sfx.slam(); toast('JURUS HENTAK BUMI! 💥', 1400);
  ring.position.set(P.pos.x, P.pos.y + .1, P.pos.z);
  debris.burst(P.pos.clone().add(new THREE.Vector3(0, .3, 0)), 0xffe066, 30, 9, .2);
  for (const f of [...foes]) {
    const d = f.pos.distanceTo(P.pos);
    if (d < 7.5) hurtFoe(f, 3, new THREE.Vector3().subVectors(f.pos, P.pos), 8);
  }
}

// ---------------------------------------------------------------------------
// Status game, gelombang, tutorial
// ---------------------------------------------------------------------------
const state = { mode: 'start', score: 0, wave: 0, queue: [], foesLeft: 0, spawnT: 0, breakT: 0, tutorial: null, elapsed: 0, paused: false };
let best = 0; try { best = +localStorage.getItem('kotak.best') || 0; } catch {}
// catatan seumur main (disimpan di perangkat): total langkah & monster
const life = { steps: 0, kills: 0, games: 0 };
try { Object.assign(life, JSON.parse(localStorage.getItem('kotak.life') || '{}')); } catch {}
const fmt = (n) => n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}rb` : n.toLocaleString('id-ID');
function renderRecords() { ui.recWave.textContent = best; ui.recSteps.textContent = fmt(life.steps); ui.recKills.textContent = fmt(life.kills); }
renderRecords();

function planWave(n) {
  const q = [];
  const slimes = Math.min(2 + n, 7), brutes = n >= 2 ? Math.min(n - 1, 5) : 0, bats = n >= 3 ? Math.min(n - 2, 4) : 0, big = n >= 5 ? Math.floor((n - 3) / 2) : 0;
  for (let i = 0; i < slimes; i++) q.push('slime');
  for (let i = 0; i < brutes; i++) q.push('brute');
  for (let i = 0; i < bats; i++) q.push('bat');
  for (let i = 0; i < big; i++) q.push('brute2');
  for (let i = q.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [q[i], q[j]] = [q[j], q[i]]; }
  return q;
}
function startWave(n) {
  state.wave = n; stats.wave = n; state.queue = planWave(n); state.foesLeft = state.queue.length; state.spawnT = 1.2;
  ui.wave.textContent = n; sfx.wave(); toast(`Gelombang ${n}! 👾`, 1500);
}

const TUT = [
  { key: 'walk', text: 'Jalan di tempat! Angkat lutut bergantian 👣', keys: 'Tahan W / ↑', touch: 'Dorong stik ke atas', need: 8 },
  { key: 'left', text: 'Toleh kepala ke KIRI untuk belok ↩️', keys: 'Tahan A / ←', touch: 'Stik ke kiri', need: 1.4 },
  { key: 'right', text: 'Toleh kepala ke KANAN untuk belok ↪️', keys: 'Tahan D / →', touch: 'Stik ke kanan', need: 1.4 },
  { key: 'look', text: 'Dongakkan kepala — lihat ke ATAS ☁️', keys: 'Tahan Q', touch: 'Tahan tombol ☁️', need: .5 },
  { key: 'punch', text: 'Tinju orang-orangan jerami 3x! 👊', keys: 'J / K atau klik', touch: 'Tombol 👊', need: 3 },
  { key: 'block', text: 'Silangkan kedua tangan di depan wajah = PERISAI 🛡️', keys: 'Tahan L', touch: 'Tahan tombol 🛡️', need: .7 },
  { key: 'jump', text: 'Lompat! 🦘', keys: 'Spasi', touch: 'Tombol 🦘', need: 1 },
  { key: 'crouch', text: 'Jongkok! 🙇', keys: 'Tahan C', touch: 'Tahan tombol 🙇', need: .4 },
];
function startTutorial() {
  state.mode = 'tutorial'; state.tutorial = { i: 0, prog: 0, steps0: stats.steps, yaw0: P.yaw, jumps0: stats.jumps };
  ui.prompt.hidden = false; showTutStep();
}
function showTutStep() {
  const t = TUT[state.tutorial.i];
  const hint = ctl.source === 'pose' ? '' : matchMedia('(pointer: coarse)').matches ? t.touch : t.keys;
  ui.promptText.innerHTML = `<b>${state.tutorial.i + 1}/${TUT.length}</b> ${t.text}<small>${hint}</small><i class="prog"><i></i></i>`;
  state.tutorial.prog = 0; state.tutorial.steps0 = stats.steps; state.tutorial.yaw0 = P.yaw; state.tutorial.jumps0 = stats.jumps;
  if (t.key === 'punch') {
    dummyHits = 0;
    const f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    const x = P.pos.x + f.x * 3.5, z = P.pos.z + f.z * 3.5;
    dummy.root.position.set(x, groundAt(x, z), z); dummy.root.rotation.y = P.yaw; dummy.root.visible = true;
  }
}
function tickTutorial(dt) {
  const T = state.tutorial, t = TUT[T.i];
  let v = 0;
  if (t.key === 'walk') v = stats.steps - T.steps0;
  else if (t.key === 'left') v = Math.max(0, P.yaw - T.yaw0);
  else if (t.key === 'right') v = Math.max(0, T.yaw0 - P.yaw);
  else if (t.key === 'look') { T.prog = ctl.look > .45 ? T.prog + dt : Math.max(0, T.prog - dt); v = T.prog; }
  else if (t.key === 'punch') v = dummyHits;
  else if (t.key === 'block') { T.prog = ctl.block ? T.prog + dt : Math.max(0, T.prog - dt * .5); v = T.prog; }
  else if (t.key === 'jump') v = stats.jumps - T.jumps0;
  else if (t.key === 'crouch') { T.prog = ctl.crouch ? T.prog + dt : 0; v = T.prog; }
  const bar = ui.promptText.querySelector('.prog i'); if (bar) bar.style.width = `${Math.min(100, v / t.need * 100)}%`;
  if (v >= t.need) nextTutStep();
}
function nextTutStep() {
  sfx.check();
  if (TUT[state.tutorial.i].key === 'punch') { debris.burst(dummy.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)), 0xe8c34a, 24, 5); dummy.root.visible = false; }
  state.tutorial.i++;
  if (state.tutorial.i >= TUT.length) { endTutorial(); return; }
  showTutStep();
}
function endTutorial() {
  dummy.root.visible = false; ui.prompt.hidden = true; state.mode = 'play';
  try { localStorage.setItem('kotak.tutDone', '1'); } catch {}
  toast('Hebat! Monster kotak datang! 💪', 1600);
  startWave(1);
}
ui.promptSkip.addEventListener('click', () => { if (state.mode === 'tutorial') nextTutStep(); });

function resetGame() {
  for (const f of [...foes]) removeFoe(f);
  for (const it of items) scene.remove(it.mesh); items.length = 0;
  for (const f of [...dying]) removeFoe(f);
  for (const w of waves) wavePool.release(w.mesh); waves.length = 0;
  Object.assign(P, { yaw: 0, vy: 0, onGround: true, hp: 5, invuln: 0, energy: 0, punchL: 0, punchR: 0, superFx: 0, hurtT: 0, speed: 0 });
  P.pos.set(0, groundAt(0, 4), 4);
  Object.assign(stats, { steps: 0, punches: 0, jumps: 0, crouches: 0, kills: 0, gems: 0, active: 0, wave: 0 });
  Object.assign(state, { score: 0, wave: 0, queue: [], foesLeft: 0, elapsed: 0, breakT: 0 });
  motion.resetCounters();
  renderHearts(); ui.gems.textContent = 0; ui.wave.textContent = '–';
}
function beginGame() {
  resetGame();
  ui.start.hidden = true; ui.calib.hidden = true; ui.over.hidden = true; ui.hud.hidden = false; ui.reticle.hidden = false;
  ui.touch.hidden = !(matchMedia('(pointer: coarse)').matches && ctl.source !== 'pose');
  music.stop(.05); music.start(); sfx.ready();
  let tutDone = false; try { tutDone = localStorage.getItem('kotak.tutDone') === '1'; } catch {}
  if (tutDone && !state.forceTutorial) { state.mode = 'play'; toast('Ayo! 💪'); startWave(1); }
  else startTutorial();
}
function gameOver() {
  state.mode = 'over'; music.stop(.4); sfx.over();
  const newBest = state.wave > best && best > 0;
  if (state.wave > best) { best = state.wave; try { localStorage.setItem('kotak.best', String(best)); } catch {} }
  life.steps += stats.steps; life.kills += stats.kills; life.games++;
  try { localStorage.setItem('kotak.life', JSON.stringify(life)); } catch {}
  renderRecords();
  const starN = state.wave >= 6 ? 3 : state.wave >= 3 ? 2 : stats.kills >= 3 ? 1 : 0;
  [...ui.stars.children].forEach((el, i) => el.classList.toggle('on', i < starN));
  ui.overBadge.hidden = !newBest;
  const min = stats.active / 60;
  const kcal = Math.round(stats.steps * .045 + stats.punches * .12 + stats.jumps * .25 + stats.crouches * .2);
  ui.overTitle.textContent = stats.kills >= 10 ? 'Jagoan hebat! 🏆' : 'Bagus sekali! 💪';
  ui.summary.innerHTML = [
    ['👾', 'Gelombang', state.wave], ['⚔️', 'Monster dikalahkan', stats.kills], ['💎', 'Permata', stats.gems],
    ['👣', 'Langkah', stats.steps], ['👊', 'Tinju', stats.punches], ['🦘', 'Lompat', stats.jumps],
    ['⏱️', 'Menit bergerak', min < 1 ? '<1' : Math.round(min)], ['🔥', 'Perkiraan kalori', `±${kcal}`],
  ].map(([i, l, v]) => `<li><span>${i}</span><b>${v}</b><small>${l}</small></li>`).join('');
  setTimeout(() => { ui.over.hidden = false; ui.hud.hidden = true; ui.touch.hidden = true; ui.reticle.hidden = true; ui.prompt.hidden = true; }, 900);
}
function togglePause() {
  if (state.mode !== 'play' && state.mode !== 'tutorial' && state.mode !== 'paused') return;
  if (state.mode === 'paused') { state.mode = state.prevMode; ui.pause.hidden = true; music.resume(); return; }
  state.prevMode = state.mode; state.mode = 'paused'; ui.pause.hidden = false; music.pause();
}

let toastTimer = 0;
function toast(msg, ms = 1100) { ui.toast.textContent = msg; ui.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('show'), ms); }
function renderHearts() { ui.hearts.innerHTML = Array.from({ length: P.maxHp }, (_, i) => `<i class="${i < P.hp ? '' : 'empty'}"></i>`).join(''); }
renderHearts();

// ---------------------------------------------------------------------------
// Tombol layar
// ---------------------------------------------------------------------------
$('btn-camera').addEventListener('click', async () => {
  unlock(); sfx.check();
  ui.start.hidden = true; ui.cam.hidden = false; ui.calib.hidden = false; ui.calibHint.textContent = 'Menyalakan kamera…';
  try { if (!landmarker) await startCamera(); ctl.source = 'pose'; beginCalib(); }
  catch (e) { console.warn(e); ui.calib.hidden = true; ui.start.hidden = false; ui.cam.hidden = true; toast('Kamera tidak bisa dibuka 😢 — coba main pakai keyboard', 2600); }
});
$('btn-keys').addEventListener('click', () => { unlock(); sfx.check(); ctl.source = 'keyboard'; ui.cam.hidden = true; beginGame(); });
$('btn-again').addEventListener('click', () => { unlock(); if (ctl.source === 'pose') beginCalib(); else beginGame(); });
$('btn-tutorial').addEventListener('click', () => { state.forceTutorial = true; unlock(); if (ctl.source === 'pose') beginCalib(); else beginGame(); });
$('btn-resume').addEventListener('click', () => { ui.pauseMsg.hidden = true; togglePause(); });
// kembali ke menu utama tanpa memuat ulang halaman (izin kamera tetap tersimpan)
function goHome() {
  music.stop(.2); music.paused = false; resetGame(); state.mode = 'start'; state.forceTutorial = false;
  Object.assign(P, { yaw: 0 }); P.pos.set(0, groundAt(0, 4), 4); showoff.t = 1.5;
  ui.pause.hidden = ui.over.hidden = ui.hud.hidden = ui.touch.hidden = ui.reticle.hidden = ui.prompt.hidden = ui.calib.hidden = true;
  ui.pauseMsg.hidden = true; ui.cam.hidden = true; ui.start.hidden = false; ui.menuMain.hidden = false; ui.outfits.hidden = true;
  dummy.root.visible = false;
}
$('btn-home').addEventListener('click', goHome);
$('btn-home2').addEventListener('click', goHome);
$('btn-pause').addEventListener('click', togglePause);
const btnMute = $('btn-mute'), btnMusic = $('btn-music'), mMute = $('m-mute'), mMusic = $('m-music');
const syncSound = () => { for (const b of [btnMute, mMute]) b.classList.toggle('off', isMuted()); for (const b of [btnMusic, mMusic]) b.classList.toggle('off', !music.on); };
const toggleMute = () => { unlock(); setMuted(!isMuted()); syncSound(); sfx.check(); };
const toggleMusic = () => { unlock(); music.on = !music.on; if (music.on && state.mode === 'play') music.start(); syncSound(); };
btnMute.addEventListener('click', toggleMute); mMute.addEventListener('click', toggleMute);
btnMusic.addEventListener('click', toggleMusic); mMusic.addEventListener('click', toggleMusic);
syncSound();

// cara main
$('btn-howto').addEventListener('click', () => { unlock(); sfx.check(); ui.howto.hidden = false; });
$('howto-close').addEventListener('click', () => { ui.howto.hidden = true; });
ui.howto.addEventListener('click', (e) => { if (e.target === ui.howto) ui.howto.hidden = true; });

// ganti baju jagoan
const swatches = $('swatches');
swatches.innerHTML = OUTFITS.map((o) => {
  const c = (n) => '#' + o[n].toString(16).padStart(6, '0');
  return `<button class="swatch" data-id="${o.id}" style="--skin:${c('skin')};--shirt:${c('shirt')};--pants:${c('pants')};--hair:${c('hair')}"><span class="fig"><i class="h"></i><i class="a"></i><i class="t"></i><i class="a"></i><i class="p"></i></span>${o.name}</button>`;
}).join('');
const markOutfit = () => swatches.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.id === outfitId));
markOutfit();
swatches.addEventListener('click', (e) => {
  const b = e.target.closest('.swatch'); if (!b) return;
  outfitId = b.dataset.id; setOutfit(hero, OUTFITS.find((o) => o.id === outfitId)); markOutfit(); sfx.gem();
  try { localStorage.setItem('kotak.outfit', outfitId); } catch {}
  showoff.raise = .8;
});
$('btn-outfit').addEventListener('click', () => { unlock(); sfx.check(); ui.menuMain.hidden = true; ui.outfits.hidden = false; });
$('outfit-done').addEventListener('click', () => { ui.outfits.hidden = true; ui.menuMain.hidden = false; });

let calibStart = 0, calibSeen = 0;
function beginCalib() {
  state.mode = 'calib'; motion.startCalibration(); calibStart = performance.now(); calibSeen = 0;
  ui.over.hidden = true; ui.start.hidden = true; ui.calib.hidden = false; ui.cam.hidden = false;
}
function tickCalib(now) {
  const s = motion.st;
  // lutut sebaiknya terlihat, tapi setelah 4 dtk menunggu boleh lanjut (langkah dibaca dari goyangan badan)
  if (!s.ok) calibSeen = 0; else calibSeen ||= now;
  const good = s.ok && (s.kneesVisible || now - calibSeen > 4000);
  if (!good) calibStart = now;
  const t = (now - calibStart) / 1000, n = Math.max(0, Math.ceil(3 - t));
  if (ui.calibCount.textContent !== String(n)) { ui.calibCount.textContent = n; if (good) sfx.tick(); }
  ui.calibBar.style.width = `${Math.min(100, t / 3 * 100)}%`;
  ui.calibHint.textContent = !s.ok ? 'Berdiri di depan kamera ya.' : !s.kneesVisible ? (good ? 'Lutut tak terlihat — tidak apa-apa, melangkahlah yang mantap 👍' : 'Mundur sampai kepala sampai LUTUT terlihat 📏') : s.others ? 'Ada orang lain — kamera mengunci yang paling dekat 👍' : 'Mantap! Berdiri tegak & lihat ke layar 🙂';
  if (t >= 3) {
    if (motion.finishCalibration()) { ui.calib.hidden = true; beginGame(); }
    else { motion.startCalibration(); calibStart = now; }
  }
}

// ---------------------------------------------------------------------------
// Loop utama
// ---------------------------------------------------------------------------
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const setText = (el, v) => { v = String(v); if (el._t !== v) { el._t = v; el.textContent = v; } };
const setStyle = (el, k, v) => { el._s ??= {}; if (el._s[k] !== v) { el._s[k] = v; el.style[k] = v; } };
const setClass = (el, c, on) => { el._c ??= {}; if (el._c[c] !== on) { el._c[c] = on; el.classList.toggle(c, on); } };

// jagoan pamer gerakan di menu utama (tinju, lompat, angkat tangan)
const showoff = { t: 2, i: 0, raise: 0 };
function menuShowoff(dt) {
  P.yaw = menuFacing();
  showoff.t -= dt; showoff.raise = Math.max(0, showoff.raise - dt);
  if (showoff.t <= 0) {
    const act = ['combo', 'jump', 'raise', 'combo', 'slam'][showoff.i++ % 5];
    if (act === 'combo') { P.punchL = PUNCH_T; setTimeout(() => { if (state.mode === 'start') P.punchR = PUNCH_T; }, 220); setTimeout(() => { if (state.mode === 'start') P.punchL = PUNCH_T; }, 440); }
    if (act === 'jump' && P.onGround) { P.vy = 7.5; P.onGround = false; }
    if (act === 'raise') showoff.raise = 1.1;
    if (act === 'slam') { P.superFx = .6; ring.position.set(P.pos.x, P.pos.y + .1, P.pos.z); setTimeout(() => { if (state.mode === 'start') debris.burst(P.pos.clone().add(new THREE.Vector3(0, .3, 0)), 0xffe066, 18, 6, .16); }, 220); }
    showoff.t = 2.6 + Math.random();
  }
  physicsY(P, dt);
}
// mode kamera: kalau pemain tidak sedang belok, jagoan pelan-pelan menghadap monster terdekat
// (menoleh terus sambil melihat layar itu sulit untuk anak, jadi arah dibantu)
function assistFacing(dt) {
  let best = null, bd = 18;
  for (const f of foes) { const d = Math.hypot(f.pos.x - P.pos.x, f.pos.z - P.pos.z); if (d < bd) { bd = d; best = f; } }
  if (!best || bd < 1.2) return;
  const want = Math.atan2(-(best.pos.x - P.pos.x), -(best.pos.z - P.pos.z));
  const diff = Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw));
  P.yaw += clamp(diff, -1, 1) * Math.min(1.3 * dt, Math.abs(diff));
}
const menuFacing = () => Math.atan2(camera.position.x - P.pos.x, camera.position.z - P.pos.z);
let last = performance.now(), frameTimes = [];
function update(dt, now) {
  gatherInput(dt);
  const active = state.mode === 'play' || state.mode === 'tutorial';

  if (active) {
    // gerak pemain
    P.yaw += ctl.turn * (ctl.source === 'pose' ? 2.0 : 2.4) * dt;
    if (ctl.source === 'pose' && state.mode === 'play' && Math.abs(ctl.turn) < .05) assistFacing(dt);
    const target = ctl.crouch || ctl.block ? Math.min(ctl.fwd, .5) * 2 : ctl.fwd * (ctl.run ? 6.2 : 3.3);
    P.speed += (target - P.speed) * Math.min(1, dt * 8);
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    moveBody(P, fx * P.speed * dt, fz * P.speed * dt);
    if (ctl.jump && P.onGround && !ctl.crouch) { P.vy = 8.2; P.onGround = false; stats.jumps++; sfx.jump(); }
    if (ctl.crouch && !P.wasCrouch) stats.crouches++;
    P.wasCrouch = ctl.crouch;
    physicsY(P, dt);
    if (ctl.punchL) punch('L');
    if (ctl.punchR) punch('R');
    if (ctl.superReq) { if (P.energy >= 100) superSlam(); else if (ctl.source !== 'pose') toast('Energi belum penuh — terus bergerak! ⚡'); }
    if (Math.abs(P.speed) > .3 || ctl.block || ctl.crouch || P.punchL > 0 || P.punchR > 0 || !P.onGround) stats.active += dt;
    state.elapsed += dt;
  }
  ctl.punchL = ctl.punchR = ctl.jump = ctl.superReq = false;
  P.punchL = Math.max(0, P.punchL - dt); P.punchR = Math.max(0, P.punchR - dt); P.invuln = Math.max(0, P.invuln - dt); P.hurtT = Math.max(0, P.hurtT - dt);

  // jagoan: posisi & animasi
  const menu = state.mode === 'start' || state.mode === 'calib';
  if (menu) menuShowoff(dt);
  hero.root.position.copy(P.pos);
  const dyaw = Math.atan2(Math.sin(P.yaw - hero.root.rotation.y), Math.cos(P.yaw - hero.root.rotation.y));
  hero.root.rotation.y += dyaw * Math.min(1, dt * (menu ? 4 : 20));
  const s = motion.st, posed = ctl.source === 'pose' && s.ok && !menu;
  animateHumanoid(hero, {
    speed: menu ? 0 : P.speed, onGround: P.onGround,
    kneeL: posed && !s.moving ? s.kneeL : undefined, kneeR: s.kneeR,
    punchL: P.punchL, punchR: P.punchR, block: !menu && ctl.block, crouch: !menu && ctl.crouch,
    raise: (posed && s.raise) || (menu && showoff.raise > 0), slam: P.superFx, hurt: P.hurtT / .35,
    headYaw: ctl.source === 'pose' && !menu ? ctl.turn * .5 : menu ? Math.sin(now * .0007) * .25 : 0, headPitch: menu ? 0 : ctl.look,
  }, dt);
  hero.root.visible = P.invuln <= 0 || Math.floor(now / 90) % 2 === 0;
  const hg = groundAt(P.pos.x, P.pos.z);
  heroBlob.position.set(P.pos.x, hg + .03, P.pos.z); heroBlob.scale.setScalar(Math.max(.5, 1 - (P.pos.y - hg) * .12));
  if (dummyWobble > 0) { dummyWobble = Math.max(0, dummyWobble - dt * 2.2); dummy.top.rotation.x = -Math.sin(dummyWobble * 14) * dummyWobble * .35; }

  if (state.mode === 'tutorial') tickTutorial(dt);

  // gelombang monster
  if (state.mode === 'play') {
    if (state.queue.length) {
      state.spawnT -= dt;
      const cap = Math.min(3 + state.wave, 7);
      if (state.spawnT <= 0 && foes.length < cap) { spawnFoe(state.queue.shift()); state.spawnT = 1.6; }
    } else if (state.foesLeft <= 0 && foes.length === 0) {
      if (!state.breakT) { state.breakT = 4.5; sfx.win(); toast(`Gelombang ${state.wave} beres! ❤️+1`, 1800); P.hp = Math.min(P.maxHp, P.hp + 1); renderHearts(); }
      state.breakT -= dt;
      if (state.breakT <= 0) { state.breakT = 0; startWave(state.wave + 1); }
    }
  }

  if (active) updateFoes(dt, now);
  updateDying(dt);
  updateWaves(dt);
  updateItems(dt);
  debris.update(dt);

  // efek jurus
  if (P.superFx > 0) { P.superFx -= dt; const k = 1 - P.superFx / .6; ring.scale.setScalar(1 + k * 7.5); ring.material.opacity = (1 - k) * .8; } else ring.material.opacity = 0;

  // HUD (hanya ditulis kalau nilainya berubah — menulis DOM tiap frame membuat browser menghitung ulang tata letak)
  if (!menu) {
    setText(ui.gems, stats.gems); setText(ui.steps, stats.steps); setText(ui.foes, state.mode === 'play' ? state.foesLeft : '–');
    setStyle(ui.energy, 'width', `${Math.round(P.energy)}%`); setClass(ui.energyBox, 'full', P.energy >= 100);
    setText(ui.gesture, ctl.source === 'pose' ? ui.camStatus.textContent : ctl.block ? 'perisai 🛡️' : ctl.crouch ? 'jongkok 🙇' : ctl.run && ctl.fwd > 0 ? 'lari 🏃' : ctl.fwd > 0 ? 'jalan 🚶' : 'siap 🙂');
    setStyle(ui.reticle, 'transform', `translate(-50%, ${Math.round(-50 - ctl.look * 60)}%)`);
  }

  updateCamera(dt);
}

function updateFoes(dt, now) {
  for (const f of [...foes]) {
    const to = tmp.subVectors(P.pos, f.pos); const dist = Math.hypot(to.x, to.z);
    f.flash -= dt; if (f.flash <= 0 && f.flash > -dt * 2) setFlash(f, false);
    f.hurtCd -= dt; f.hurtT = Math.max(0, f.hurtT - dt); f.born += dt;
    if (f.atkT >= 0) f.atkT += dt;
    // dorongan saat dipukul
    if (f.knock.lengthSq() > .01) { if (f.type === 'bat') f.pos.addScaledVector(f.knock, dt); else moveBody(f, f.knock.x * dt, f.knock.z * dt); f.knock.multiplyScalar(Math.exp(-dt * 6)); }

    if (f.type === 'slime' || f.type === 'slimeS') {
      f.t -= dt;
      if (f.onGround && f.t <= 0 && f.knock.lengthSq() < .5) { f.vy = f.type === 'slime' ? 5.5 : 6.5; f.onGround = false; f.t = 1 + Math.random() * .6; f.hop = to.clone().setY(0).normalize().multiplyScalar(f.type === 'slime' ? 2.4 : 3); f.yaw = Math.atan2(-to.x, -to.z); }
      const wasAir = !f.onGround;
      if (!f.onGround && f.hop) moveBody(f, f.hop.x * dt, f.hop.z * dt);
      physicsY(f, dt);
      if (wasAir && f.onGround) f.land = .22;
      f.land = Math.max(0, (f.land || 0) - dt);
      // pegas: gepeng saat mendarat, merunduk (ancang-ancang) sebelum melompat, memanjang di udara
      let sy = 1;
      if (!f.onGround) sy = 1.18 - Math.min(.3, Math.abs(f.vy) * .02);
      else if (f.land > 0) sy = 1 - Math.sin(f.land / .22 * Math.PI) * .32;
      else if (f.t < .3) sy = 1 - (.3 - f.t) * .9;
      else sy = 1 + Math.sin(now * .006 + f.phase) * .03;
      const sxz = 1 / Math.sqrt(sy);
      f.rig.body.scale.y += (sy - f.rig.body.scale.y) * Math.min(1, dt * 22);
      f.rig.body.scale.x = f.rig.body.scale.z = sxz;
      f.rig.core.position.y = f.rig.size / 2 + Math.sin(now * .004 + f.phase) * .04 * f.rig.size;
      if (dist < f.def.r + .45 && Math.abs(P.pos.y - f.pos.y) < 1 && f.hurtCd <= 0) { if (damagePlayer(f.pos, 'Kena slime!') === 'blocked') { f.knock.set(-to.x, 0, -to.z).normalize().multiplyScalar(6); } f.hurtCd = 1; }
    } else if (f.type === 'brute' || f.type === 'brute2') {
      const face = Math.atan2(-to.x, -to.z);
      f.yaw += Math.atan2(Math.sin(face - f.yaw), Math.cos(face - f.yaw)) * Math.min(1, dt * 6);
      let walking = false;
      if (f.state === 'chase') {
        if (dist > 1.4) {
          const step = f.def.speed * dt;
          if (!moveBody(f, -Math.sin(f.yaw) * step, -Math.cos(f.yaw) * step)) moveBody(f, -Math.sin(f.yaw + 1.2) * step, -Math.cos(f.yaw + 1.2) * step);
          walking = true;
        } else { f.state = 'windup'; f.timer = .8; sfx.warn(); }
      } else if (f.state === 'windup') {
        f.timer -= dt;
        if (f.timer <= 0) {
          f.state = 'recover'; f.timer = .9; f.atkT = 0;
          if (dist < 2.1) { const r = damagePlayer(f.pos, 'Kena pukul!'); if (r === 'blocked') { f.knock.set(-to.x, 0, -to.z).normalize().multiplyScalar(5); f.timer = 1.4; } }
        }
      } else if (f.state === 'recover') { f.timer -= dt; if (f.timer <= 0) { f.state = 'chase'; f.atkT = -1; } }
      physicsY(f, dt);
      f.speed += ((walking ? f.def.speed * 1.6 : 0) - f.speed) * Math.min(1, dt * 8);
      animateHumanoid(f.rig, {
        speed: f.speed, onGround: f.onGround, zombie: true, hurt: f.hurtT / .3,
        windup: f.state === 'windup' ? clamp(1 - f.timer / .8, 0, 1) : 0, swing: f.atkT,
      }, dt);
    } else if (f.type === 'bat') {
      const g = groundAt(f.pos.x, f.pos.z);
      f.timer -= dt;
      let tilt = 0;
      if (f.state === 'chase' || f.state === 'circle') {
        f.orbit += dt * .8;
        const tx = P.pos.x + Math.cos(f.orbit) * 6, tz = P.pos.z + Math.sin(f.orbit) * 6, ty = Math.max(g, P.pos.y) + 4.5 - Math.min(2.2, (f.dives || 0) * .75) + Math.sin(now * .002 + f.phase) * .5; // makin rendah setiap habis menukik → makin mudah ditinju
        f.pos.x += (tx - f.pos.x) * Math.min(1, dt * 1.5); f.pos.z += (tz - f.pos.z) * Math.min(1, dt * 1.5); f.pos.y += (ty - f.pos.y) * Math.min(1, dt * 2);
        if (f.timer <= 0) { f.state = f.state === 'chase' ? 'circle' : 'warn'; f.timer = f.state === 'warn' ? .9 : 3 + Math.random() * 2; if (f.state === 'warn') sfx.warn(); }
        tilt = .25;
      } else if (f.state === 'warn') {
        tilt = -.35;
        if (f.timer <= 0) { f.dives = (f.dives || 0) + 1; f.state = 'dive'; f.dive = P.pos.clone().add(new THREE.Vector3(0, 1.5, 0)).sub(f.pos).normalize(); f.timer = 1.6; f.hit = false; }
      } else if (f.state === 'dive') {
        tilt = -.8;
        f.pos.addScaledVector(f.dive, dt * 10);
        const head = P.pos.clone().add(new THREE.Vector3(0, ctl.crouch ? .9 : 1.5, 0));
        if (!f.hit && f.pos.distanceTo(head) < .9) { f.hit = true; damagePlayer(f.pos, 'Kena kelelawar!'); }
        if (f.timer <= 0 || f.pos.y < g + .6) { f.state = 'circle'; f.timer = 3.5 + Math.random() * 2; }
      }
      f.yaw = Math.atan2(-to.x, -to.z);
      // kepak: cepat saat bersiap/menukik, ujung sayap menyusul (lebih luwes)
      const fs = f.state === 'dive' ? .045 : f.state === 'warn' ? .04 : .022;
      f.flapT = (f.flapT || 0) + dt * fs * 1000;
      const flap = Math.sin(f.flapT + f.phase) * (f.state === 'dive' ? .35 : .75);
      const tipF = Math.sin(f.flapT + f.phase - .9) * .6;
      f.rig.wingL.rotation.z = flap; f.rig.wingR.rotation.z = -flap;
      f.rig.tipL.rotation.z = tipF; f.rig.tipR.rotation.z = -tipF;
      f.rig.body.position.y = -Math.sin(f.flapT + f.phase) * .08;
      f.rig.body.rotation.x += (tilt + f.hurtT * 1.5 - f.rig.body.rotation.x) * Math.min(1, dt * 8);
    }
    f.rig.root.position.copy(f.pos);
    // muncul: membesar dengan sedikit memantul
    const bs = f.rig.baseScale * (f.born < .4 ? Math.max(.01, easeOutBack(f.born / .4)) : 1);
    f.rig.root.scale.setScalar(bs);
    // gemetar = tanda mau menyerang (beri anak waktu untuk menangkis / jongkok)
    if (f.state === 'windup' || f.state === 'warn') { f.rig.root.position.x += Math.sin(now * .07) * .06; f.rig.root.position.y += Math.abs(Math.sin(now * .05)) * .06; }
    f.rig.root.rotation.y = f.yaw;
    // bayangan bulat: mengecil saat makhluk tinggi di udara
    const gy = groundAt(f.pos.x, f.pos.z), hgt = Math.max(0, f.pos.y - gy);
    f.blob.position.set(f.pos.x, gy + .03, f.pos.z);
    f.blob.scale.setScalar(f.blob.userData.size * Math.max(.45, 1 - hgt * .09) * Math.min(1, bs / f.rig.baseScale));
    // tidak boleh menumpuk (dengan pemain maupun sesama monster)
    if (f.type !== 'bat') {
      const dx = f.pos.x - P.pos.x, dz = f.pos.z - P.pos.z, d = Math.hypot(dx, dz), min = f.def.r + RADIUS + .15;
      if (d > 0 && d < min) moveBody(f, dx / d * (min - d), dz / d * (min - d));
    }
    for (const o of foes) if (o !== f && o.type !== 'bat' && f.type !== 'bat') {
      const dx = f.pos.x - o.pos.x, dz = f.pos.z - o.pos.z, d = Math.hypot(dx, dz), min = f.def.r + o.def.r;
      if (d > 0 && d < min) moveBody(f, dx / d * (min - d) * .5, dz / d * (min - d) * .5);
    }
  }
}

function updateWaves(dt) {
  for (const w of [...waves]) {
    w.life -= dt; w.pos.addScaledVector(w.dir, dt * 17);
    w.mesh.position.copy(w.pos); w.mesh.rotation.x += dt * 9; w.mesh.rotation.y += dt * 7;
    w.mesh.material.opacity = Math.max(0, w.life / .55) * .6; w.mesh.scale.setScalar(.32 + (.55 - w.life) * .5);
    let done = w.life <= 0;
    for (const f of foes) {
      if (w.hit.has(f)) continue;
      if (center(f, tmp2).distanceTo(w.pos) < f.def.r + .45) { w.hit.add(f); hurtFoe(f, 1, w.dir); done = true; break; }
    }
    if (!done && dummy.root.visible && dummy.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)).distanceTo(w.pos) < .9) {
      dummyHits++; sfx.hit(); debris.burst(w.pos.clone(), 0xe8c34a, 8, 3); done = true;
      dummyWobble = 1;
    }
    if (!done && w.pos.y < groundAt(w.pos.x, w.pos.z)) done = true;
    if (done) { wavePool.release(w.mesh); waves.splice(waves.indexOf(w), 1); }
  }
}

function updateItems(dt) {
  for (const it of [...items]) {
    it.t += dt;
    const g = groundAt(it.pos.x, it.pos.z) + .45;
    const d = it.pos.distanceTo(tmp.copy(P.pos).setY(P.pos.y + .8));
    if (it.t > .5 && d < 3) it.pos.lerp(tmp, Math.min(1, dt * 7)); // tarik ke pemain
    else { it.v.y -= 14 * dt; it.pos.addScaledVector(it.v, dt); if (it.pos.y < g) { it.pos.y = g; it.v.set(0, 0, 0); } }
    it.mesh.position.copy(it.pos); it.mesh.position.y += Math.sin(it.t * 3) * .08; it.mesh.rotation.y += dt * 3;
    if (it.t > .5 && d < .8 && (state.mode === 'play' || state.mode === 'tutorial')) {
      if (it.kind === 'gem') { stats.gems++; state.score += 5; sfx.gem(); }
      else if (P.hp < P.maxHp) { P.hp++; renderHearts(); sfx.heart(); toast('+1 ❤️'); }
      else { state.score += 20; sfx.gem(); }
      scene.remove(it.mesh); items.splice(items.indexOf(it), 1);
    } else if (it.t > 25) { scene.remove(it.mesh); items.splice(items.indexOf(it), 1); }
  }
}

const camPos = new THREE.Vector3(0, 6, 12), camLook = new THREE.Vector3(), camWant = new THREE.Vector3(), camRay = new THREE.Vector3(), camQ = new THREE.Vector3();
let menuCamInit = false;
function updateCamera(dt) {
  const menu = state.mode === 'start' || state.mode === 'calib';
  if (menu) {
    // jagoan di depan kamera, berayun pelan; di layar lebar jagoan di sisi kanan (menu di kiri)
    const portrait = innerHeight > innerWidth;
    const a = Math.sin(performance.now() * .00012) * .35 + .5;
    const d = portrait ? 7.8 : 5.6, h = portrait ? 1.2 : 1.6;
    camWant.set(P.pos.x + Math.sin(a) * d, P.pos.y + h + 1.0, P.pos.z + Math.cos(a) * d);
    if (!menuCamInit) { camPos.copy(camWant); menuCamInit = true; }
    camPos.lerp(camWant, Math.min(1, dt * 3));
    camera.position.copy(camPos);
    const side = portrait ? 0 : -2.0;                                // geser titik pandang ke kiri → jagoan tampak di kanan
    const rx = Math.cos(a), rz = -Math.sin(a);                        // vektor kanan kamera
    camLook.set(P.pos.x + rx * side, P.pos.y + (portrait ? -1.5 : 1.05), P.pos.z + rz * side);
    camera.lookAt(camLook); return;
  }
  menuCamInit = false;
  // kamera bahu yang agak tinggi: jagoan di bawah, monster di depan tetap terlihat di atas kepalanya
  const cp = .44 - ctl.look * .7;                         // dongak → kamera turun & melihat ke atas
  const d = 5.8;
  const bx = Math.sin(P.yaw), bz = Math.cos(P.yaw);
  const target = tmp.set(P.pos.x, P.pos.y + 1.5 + (ctl.crouch ? -.35 : 0), P.pos.z);
  const want = camWant.set(target.x + bx * d * Math.cos(cp) + bz * .7, target.y + d * Math.sin(cp) + .3, target.z + bz * d * Math.cos(cp) - bx * .7);
  // jangan menembus pohon/bukit: maju mendekati pemain sampai sebelum balok pertama
  const ray = camRay.subVectors(want, target), len = ray.length();
  let free = len;
  for (let t = .6; t <= len; t += .2) {
    const q = camQ.copy(target).addScaledVector(ray, t / len);
    if (blockAt(q.x, q.y, q.z) || blockAt(q.x, q.y - .25, q.z)) { free = Math.max(.9, t - .35); break; }
  }
  want.copy(target).addScaledVector(ray, free / len);
  want.y = Math.max(want.y, groundAt(want.x, want.z) + .4);
  camPos.lerp(want, Math.min(1, dt * (free < len ? 18 : 8)));
  camera.position.copy(camPos);
  camLook.set(target.x - bx * 8, target.y + ctl.look * 8 - .1, target.z - bz * 8);
  camera.lookAt(camLook);
}

// Kualitas menyesuaikan perangkat: kalau frame lambat terus, turunkan resolusi bertahap (juga di menu).
let slowSince = 0, fastSince = 0;
function adaptQuality(raw, now) {
  if (raw > .25 || document.hidden) return;
  frameTimes.push(raw); if (frameTimes.length < 60) return;
  frameTimes.sort((x, y) => x - y);
  const med = frameTimes[30]; frameTimes = [];
  const budget = state.mode === 'play' || state.mode === 'tutorial' ? .021 : .04; // menu dibatasi 30 fps
  if (med > budget) {
    fastSince = 0;
    if (pixelRatio > .75) { pixelRatio = Math.max(.75, +(pixelRatio - .25).toFixed(2)); resize(); }
  } else if (med < budget * .62 && pixelRatio < maxRatio) {
    // perangkat kuat lagi (mis. sudah tidak panas) → naikkan pelan-pelan, paling cepat tiap 10 detik
    if (!fastSince) fastSince = now; else if (now - fastSince > 10000) { pixelRatio = Math.min(maxRatio, pixelRatio + .25); resize(); fastSince = 0; }
  }
}
const maxRatio = pixelRatio;

// Kompilasi semua shader monster/barang di awal, supaya tidak tersendat saat monster jenis baru pertama muncul.
function warmUp() {
  const g = new THREE.Group();
  const rigs = [makeBrute(1), makeBrute(2), makeSlime(true), makeBat(), makeDummy()];
  rigs.forEach((r, i) => { r.root.position.set(P.pos.x + i - 2, P.pos.y, P.pos.z - 3); g.add(r.root); });
  const flash = makeBrute(1); flash.root.traverse((o) => { if (o.isMesh) o.material = flashMat; }); g.add(flash.root);
  g.add(makeGem(), makeHeart(), makeBlob(1));
  scene.add(g);
  wavePool.meshes[0].visible = true;
  renderer.compile(scene, camera);
  wavePool.meshes[0].visible = false;
  scene.remove(g);
}
warmUp();

let lastRender = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  const active = state.mode === 'play' || state.mode === 'tutorial' || state.mode === 'calib';
  // di menu/jeda cukup 30 fps — mengurangi panas & baterai (penyebab makin lama makin lambat di laptop/HP)
  if (!active && now - lastRender < 31) return;
  const dt = Math.min(raw, .05); last = now; lastRender = now;
  if (ctl.source === 'pose' && state.mode !== 'start' && state.mode !== 'over') readPose(now);
  if (state.mode === 'calib') tickCalib(now);
  if (state.mode !== 'paused' && state.mode !== 'over') update(dt, now);
  else { debris.update(dt); updateDying(dt); updateCamera(dt); }
  adaptQuality(raw, now);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

if (DEBUG) window.__game = { state, P, stats, ctl, motion, foes, dying, items, hero, camera, handlePose, spawnFoe, beginGame, startWave, renderer, scene, keys, punch, superSlam, endTutorial, setSource: (s) => (ctl.source = s) };
