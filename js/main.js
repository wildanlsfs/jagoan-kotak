import * as THREE from 'three';
import { buildWorld, setupSky, groundAt, walkable, blockAt, islandRadius, ARENA_R } from './world.js';
import { makeHero, makeBrute, makeBoss, makeSkeleton, makeWitch, makeArrow, makeOrb, makeLog, makeBall, makeSlime, makeBat, makeDummy, makeGem, makeHeart, makePunchWavePool, makeDebris, makeBlob, animateHumanoid, PUNCH_T, easeOutBack } from './characters.js';
import { SLOTS, ITEMS, loadWardrobe, saveWardrobe, applyLook, owns, buy, swatchOf, sleeveOf } from './wardrobe.js';
import { createMotion, drawSkeleton } from './motion.js';
import { sfx, music, unlock, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const ui = {
  canvas: $('game'), cam: $('cam'), video: $('video'), pose: $('pose'), camStatus: $('cam-status'),
  hud: $('hud'), hearts: $('hearts'), wave: $('wave'), gems: $('gems'), steps: $('steps'), foes: $('foes'),
  energy: $('energy-fill'), energyBox: $('energy'), gesture: $('gesture'), prompt: $('prompt'), promptText: $('prompt-text'), promptSkip: $('prompt-skip'),
  toast: $('toast'), hurt: $('hurt'), reticle: $('reticle'), foeArrow: $('foe-arrow'), overGems: $('over-gems'),
  start: $('start'), calib: $('calib'), calibCount: $('calib-count'), calibBar: $('calib-bar'), calibHint: $('calib-hint'),
  pause: $('pause'), pauseMsg: $('pause-msg'), over: $('over'), summary: $('summary'), overTitle: $('over-title'),
  touch: $('touch'), stick: $('stick'), knob: $('knob'),
  howto: $('howto'), outfits: $('outfits'), menuMain: $('menu-main'), recWave: $('rec-wave'), recSteps: $('rec-steps'), recKills: $('rec-kills'),
  overBadge: $('over-badge'), stars: $('stars'),
  boss: $('boss'), bossFill: $('boss-fill'), bossLag: $('boss-lag'), bossLv: $('boss-lv'), bossName: $('boss-name'),
  practice: $('practice'), prStep: $('pr-step'), prTitle: $('pr-title'), prScore: $('pr-score'), prTask: $('pr-task'), prBar: $('pr-bar'), prMoves: $('pr-moves'),
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DEBUG = location.search.includes('debug');
// Mode arena = main dengan kamera. Tanpa kacamata VR, mata pemain harus SELALU ke layar, jadi tidak ada
// belok dengan menoleh: kamera tidak pernah berputar, jagoan otomatis menghadap monster terdekat,
// jalan di tempat = mendekatinya, condong badan kiri/kanan = bergeser kiri/kanan layar.
const arena = () => ctl.source === 'pose';
const playing = () => state.mode === 'play' || state.mode === 'tutorial' || state.mode === 'practice';

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
const wardrobe = loadWardrobe();          // dompet 💎 + barang milik + yang dipakai
const hero = makeHero(); applyLook(hero, wardrobe.eq);
scene.add(hero.root);
const heroBlob = makeBlob(1); scene.add(heroBlob);
const P = {
  pos: new THREE.Vector3(0, 2, 4), yaw: 0, vy: 0, onGround: true, speed: 0,
  hp: 5, maxHp: 5, invuln: 0, energy: 0, punchL: 0, punchR: 0, nextHand: 'R', phase: 0, superFx: 0, hurtT: 0,
  airJumps: 0, flipT: 0, crouchT: 0, lastCrouch: 0, sinceCrouch: 9, vel: new THREE.Vector3(), yawWant: 0,
};
const stats = { steps: 0, punches: 0, jumps: 0, crouches: 0, kills: 0, gems: 0, active: 0, wave: 0, bosses: 0 };

// ---------------------------------------------------------------------------
// Input gabungan: kamera (gerak tubuh), keyboard, sentuh
// ---------------------------------------------------------------------------
const ctl = { fwd: 0, run: false, turn: 0, side: 0, look: 0, block: false, crouch: false, punchL: false, punchR: false, jump: false, superReq: false, source: 'keyboard' };
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
ui.canvas.addEventListener('mousedown', (e) => { if (playing()) { if (e.button === 2) ctl.punchR = true; else ctl.punchL = true; } });
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
// Deteksi pose sebaiknya di Web Worker (gambar game tidak tersendat saat deteksi berjalan).
// Kalau worker gagal dimuat, kembali ke deteksi di thread utama.
let poseWorker = null, workerBusy = false;
function startPoseWorker() {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL('./pose-worker.js', import.meta.url)); } catch (e) { reject(e); return; }
    const timer = setTimeout(() => { w.terminate(); reject(new Error('worker timeout')); }, 45000);
    w.onerror = (e) => { clearTimeout(timer); w.terminate(); reject(e); };
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'ready') { clearTimeout(timer); w.onerror = null; resolve(w); }
      else if (d.type === 'error') { clearTimeout(timer); w.terminate(); reject(new Error(d.message)); }
      else if (d.type === 'pose') {
        workerBusy = false;
        if (ctl.source === 'pose' && state.mode !== 'start' && state.mode !== 'over') handlePose(d.all, d.world, d.ts);
      }
    };
    w.postMessage({ type: 'init' });
  });
}
async function startCamera() {
  ui.camStatus.textContent = 'memuat…';
  try {
    poseWorker = await startPoseWorker();
    landmarker = { worker: true };
  } catch (err) {
    console.warn('pose worker tidak tersedia, deteksi di thread utama:', err && err.message);
    poseWorker = null;
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
    const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    landmarker = await vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'GPU' },
      runningMode: 'VIDEO', numPoses: 2,
    });
  }
  ui.camStatus.textContent = 'izinkan kamera ya…';
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
  ui.video.srcObject = stream; await ui.video.play();
  ui.pose.width = ui.video.videoWidth || 640; ui.pose.height = ui.video.videoHeight || 480;
  ui.camStatus.textContent = 'kamera aktif';
  ctl.source = 'pose';
}
function readPose(now) {
  if (!landmarker || ui.video.readyState < 2 || ui.video.currentTime === lastVideoTime) return null;
  if (poseWorker) {
    if (workerBusy) return null;                // satu frame diproses sekali waktu; sisanya dilewati
    lastVideoTime = ui.video.currentTime; workerBusy = true;
    createImageBitmap(ui.video)
      .then((bitmap) => poseWorker.postMessage({ type: 'frame', bitmap, ts: performance.now() }, [bitmap]))
      .catch(() => { workerBusy = false; });
    return null;
  }
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
  if (ev.step) { stats.steps++; if (playing()) { P.energy = Math.min(100, P.energy + 1.4); sfx.step(); } }
  if (ev.punchL) ctl.punchL = true;
  if (ev.punchR) ctl.punchR = true;
  if (ev.jump) ctl.jump = true;
  if (s.raiseHeld > .45) ctl.superReq = true;
  if (!s.ok) {
    ui.camStatus.textContent = motion.lostSince && all.length ? 'Itu bukan kamu 👀' : 'Kamu tidak terlihat 👀';
    if (state.mode === 'play' && motion.lostSince && now - motion.lostSince > 2000) { togglePause(); ui.pauseMsg.hidden = false; }
  } else ui.camStatus.textContent = !s.kneesVisible && !s.moving ? 'Lutut tak terlihat — melangkah yang mantap ya' : s.block ? 'perisai 🛡️' : s.crouch ? 'jongkok 🙇' : s.run ? 'lari! 🏃' : s.moving ? 'jalan 🚶' : s.raise ? 'tangan ke atas 🙌' : s.side > .3 ? 'geser kiri ⬅️' : s.side < -.3 ? 'geser kanan ➡️' : 'siap 🙂';
  return ev;
}

function gatherInput(dt) {
  const s = motion.st;
  if (ctl.source === 'pose') {
    ctl.fwd = s.moving ? 1 : 0; ctl.run = s.run; ctl.turn = 0; ctl.side = s.side; ctl.look = 0; ctl.block = s.block; ctl.crouch = s.crouch;
  } else {
    const up = keys.has('KeyW') || keys.has('ArrowUp'), back = keys.has('KeyS') || keys.has('ArrowDown');
    ctl.fwd = up ? 1 : back ? -.6 : 0; ctl.run = keys.has('ShiftLeft') || keys.has('ShiftRight'); ctl.side = 0;
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
  skel: { hp: 3, h: 1.8, r: .4, speed: 2.0, gems: 2, score: 25, color: 0xe9e4d0 },
  archer: { hp: 2, h: 1.8, r: .4, speed: 1.6, gems: 2, score: 25, color: 0xe9e4d0 },
  witch: { hp: 3, h: 1.9, r: .45, speed: 1.4, gems: 3, score: 35, color: 0x9b5de5 },
  boss: { hp: 26, h: 4.1, r: 1.0, speed: 1.5, gems: 15, score: 300, color: 0x9ea3ab, boss: true, icon: '👑', title: 'RAJA BATU' },
  bossSkel: { hp: 28, h: 4.0, r: 1.0, speed: 1.8, gems: 18, score: 350, color: 0xe9e4d0, boss: true, icon: '💀', title: 'RAJA TENGKORAK' },
  bossWitch: { hp: 24, h: 3.9, r: .95, speed: 0, gems: 18, score: 350, color: 0x9b5de5, boss: true, icon: '🔮', title: 'RATU PENYIHIR' },
};
// makhluk melayang/terbang: tidak memakai gravitasi & tidak perlu dipindah kalau "tersangkut"
const floaty = (f) => f.type === 'bat' || f.type === 'witch' || f.type === 'bossWitch';
function spawnFoe(type, near) {
  const def = FOE[type];
  let rig;
  if (type === 'slime' || type === 'slimeS') rig = makeSlime(type === 'slime');
  else if (type === 'bat') rig = makeBat();
  else if (type === 'boss') rig = makeBoss();
  else if (type === 'skel' || type === 'archer' || type === 'bossSkel') rig = makeSkeleton({ archer: type === 'archer', king: type === 'bossSkel' });
  else if (type === 'witch' || type === 'bossWitch') rig = makeWitch({ queen: type === 'bossWitch' });
  else rig = makeBrute(type === 'brute2' ? 2 : 1);
  const f = { type, def, rig, hp: def.hp, pos: new THREE.Vector3(), yaw: 0, vy: 0, onGround: true, t: Math.random() * 1.5, state: 'chase', timer: 0, flash: 0, knock: new THREE.Vector3(), phase: Math.random() * 6, hurtCd: 0, orbit: Math.random() * 6,
    born: 0, hurtT: 0, atkT: -1, speed: 0 };
  spawnPoint(def, near, type === 'bat', f.pos);
  if (type === 'bat') f.pos.y += 4.5;
  if (type === 'witch') { f.pos.y += .35; f.onGround = false; f.cd = 1.5 + Math.random(); }
  if (type === 'archer') f.cd = 1.2 + Math.random();
  if (def.boss) {
    f.hp = f.maxHp = def.hp + 7 * (state.bossLv - 1);
    f.state = 'intro'; f.born = 1; f.cd = 0; f.told = {};
    if (type === 'bossWitch') { f.pos.y += .7; f.onGround = false; f.timer = 1.6; f.born = 0; }   // muncul dengan "puf"
    else { f.pos.y += 14; f.onGround = false; }                                                  // jatuh dari langit
    ui.boss.hidden = false; ui.boss.classList.remove('rage'); ui.bossLv.textContent = state.bossLv > 1 ? `Lv ${state.bossLv}` : '';
    ui.bossName.textContent = `${def.icon} ${def.title}`;
    setStyle(ui.bossFill, 'width', '100%'); setStyle(ui.bossLag, 'width', '100%');
    sfx.boss(); toast(`${def.icon} ${def.title} DATANG!`, 1800);
  }
  f.blob = makeBlob(def.r * 2.2); scene.add(f.blob);
  rig.root.position.copy(f.pos); rig.root.scale.setScalar(.01);
  scene.add(rig.root);
  foes.push(f);
  debris.burst(f.pos.clone().add(new THREE.Vector3(0, .5, 0)), 0xffffff, 10, 3);
  return f;
}
// Tempat muncul yang PASTI bisa dicapai. Dulu monster kadang muncul di sela pohon/batu atau di balik
// tebing (tidak bisa bergerak), dan kalau pencarian gagal posisinya tertinggal di (0,0,0): tertanam di
// tanah. Sekarang: utamakan arena (datar, tanpa pohon), periksa jalur lurus ke pemain, selalu ada cadangan.
function pathClear(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / .4));
  let y = groundAt(ax, az);
  for (let i = 1; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
    if (!walkable(x, z)) return false;
    const g = groundAt(x, z); if (Math.abs(g - y) > 1) return false; y = g;
  }
  return true;
}
const roomy = (x, z, r) => walkable(x, z) && walkable(x + r, z) && walkable(x - r, z) && walkable(x, z + r) && walkable(x, z - r);
function spawnPoint(def, near, fly, out = new THREE.Vector3()) {
  const ok = (x, z) => Math.hypot(x, z) < islandRadius - 3 && roomy(x, z, def.r) && (fly || pathClear(x, z, P.pos.x, P.pos.z));
  if (near) {
    for (let k = 0; k < 12; k++) { const a = Math.random() * Math.PI * 2, x = near.x + Math.cos(a) * 1.2, z = near.z + Math.sin(a) * 1.2; if (roomy(x, z, def.r)) return out.set(x, groundAt(x, z), z); }
    return out.set(near.x, groundAt(near.x, near.z), near.z);
  }
  const inArena = arena() || Math.hypot(P.pos.x, P.pos.z) < ARENA_R + 1;
  for (let k = 0; k < 80; k++) {
    let x, z;
    if (inArena) {
      // mode kamera: di depan kamera (-z) supaya langsung terlihat; selain itu di mana saja di arena
      const a = arena() && k < 50 ? -Math.PI / 2 + (Math.random() - .5) * 2.4 : Math.random() * Math.PI * 2;
      const r = ARENA_R - 1.6 - Math.random() * 4;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      if (Math.hypot(x - P.pos.x, z - P.pos.z) < 5.5) continue;
    } else {
      const a = Math.random() * Math.PI * 2, d = 7 + Math.random() * 5;
      x = P.pos.x + Math.cos(a) * d; z = P.pos.z + Math.sin(a) * d;
    }
    if (ok(x, z)) return out.set(x, groundAt(x, z), z);
  }
  const a = Math.atan2(P.pos.z, P.pos.x) + Math.PI, x = Math.cos(a) * 6, z = Math.sin(a) * 6; // cadangan: arena di seberang pemain
  return out.set(x, groundAt(x, z), z);
}
// monster yang tersangkut (tidak bergerak padahal masih jauh) atau tertanam: pindahkan dengan "puf"
function unstick(f, dt, dist) {
  f.chk = (f.chk || 0) + dt;
  if (f.chk < 2) return;
  f.chk = 0;
  const moved = f.lastPos ? Math.hypot(f.pos.x - f.lastPos.x, f.pos.z - f.lastPos.z) : 9;
  f.lastPos = (f.lastPos || new THREE.Vector3()).copy(f.pos);
  const buried = f.pos.y < groundAt(f.pos.x, f.pos.z) - .3;
  f.stuck = dist > 2.6 && moved < .5 && f.state !== 'windup' && f.state !== 'recover' ? (f.stuck || 0) + 1 : 0;
  if (!buried && f.stuck < 2) return;
  debris.burst(center(f), 0xffffff, 10, 3, .12);
  spawnPoint(f.def, null, false, f.pos); f.vy = 0; f.onGround = true; f.knock.set(0, 0, 0); f.born = 0; f.stuck = 0; f.lastPos = null;
  debris.burst(center(f), 0xffffff, 10, 3);
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
  const boss = !!f.def.boss;
  if (boss && f.state === 'dizzy') dmg *= 2;                             // bos pusing = kesempatan emas
  f.hp -= dmg; f.flash = .12; f.hurtT = .3; setFlash(f, true);
  f.knock.set(dir.x, 0, dir.z).normalize().multiplyScalar(boss ? power * .12 : power);
  if (boss) { setStyle(ui.bossFill, 'width', `${Math.max(0, f.hp / f.maxHp * 100)}%`); setStyle(ui.bossLag, 'width', `${Math.max(0, f.hp / f.maxHp * 100)}%`); }
  else if (f.type === 'witch') { if (f.hp > 0 && Math.random() < .5) f.blink = .45; }  // kadang menghilang & muncul di tempat lain
  else if (f.type !== 'bat') { f.vy = 3.5; f.onGround = false; }
  else { f.state = 'circle'; f.timer = 2.5; }
  // dipukul saat bersiap = serangannya batal (pemanah & penyihir juga)
  if (f.state === 'windup' || f.state === 'aim' || f.state === 'cast' || f.state === 'hex') { f.state = 'recover'; f.timer = .6; if (f.rig.nock) f.rig.nock.visible = false; }
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
  if (f.def.boss) {
    ui.boss.hidden = true; f.rig.stars.visible = false; stats.bosses++;
    dropItem('heart', c); dropItem('heart', c); debris.burst(c, 0xffc83d, 40, 9, .25);
    sfx.win(); toast(`${f.def.title} KALAH! 🏆`, 2200);
  }
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

function damagePlayer(from, label, unblockable = false) {
  if (P.invuln > 0 || (state.mode !== 'play' && state.mode !== 'practice')) return false;
  const dir = new THREE.Vector3().subVectors(P.pos, from).setY(0).normalize();
  const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  if (ctl.block && !unblockable && fwd.dot(dir) < (arena() ? .3 : -.2)) { // serangan dari depan (mode kamera: depan & samping) ditangkis
    sfx.block(); toast('TANGKIS! 🛡️'); debris.burst(P.pos.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(fwd, .5), 0x5ef0ff, 10, 3);
    P.energy = Math.min(100, P.energy + 6);
    return 'blocked';
  }
  if (state.mode === 'practice') {                        // ruang latihan: tidak ada nyawa yang berkurang
    P.invuln = .7; P.hurtT = .35; sfx.hurt(); toast(label || 'Kena!');
    ui.hurt.classList.remove('on'); void ui.hurt.offsetWidth; ui.hurt.classList.add('on');
    return true;
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
  for (const sh of shots) if (sh.kind === 'orb' && !sh.mine) targets.push({ c: sh.pos.clone(), r: .4 });   // bola sihir bisa ditinju balik
  for (const t of targets) {
    const to = t.c.clone().sub(origin), d = to.length(); if (d > 10) continue;
    to.normalize();
    const flat = Math.acos(clamp(new THREE.Vector2(to.x, to.z).normalize().dot(new THREE.Vector2(dir.x, dir.z).normalize()), -1, 1));
    const vert = Math.abs(Math.asin(clamp(to.y, -1, 1)) - Math.asin(clamp(dir.y, -1, 1)));
    if (flat < .55 && vert < (arena() ? 1.1 : .5)) { const sc = flat + vert + d * .03; if (sc < bestScore) { bestScore = sc; best = to; } }
  }
  if (best) dir = best;
  const mesh = wavePool.get(); mesh.position.copy(origin);
  waves.push({ mesh, pos: origin, dir, life: .55, hit: new Set(), hand });
  if (state.mode === 'practice') practiceMove('punch' + hand);
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
const state = { mode: 'start', score: 0, wave: 0, queue: [], foesLeft: 0, spawnT: 0, breakT: 0, tutorial: null, elapsed: 0, paused: false, bossLv: 0 };
let best = 0; try { best = +localStorage.getItem('kotak.best') || 0; } catch {}
// catatan seumur main (disimpan di perangkat): total langkah & monster
const life = { steps: 0, kills: 0, games: 0 };
try { Object.assign(life, JSON.parse(localStorage.getItem('kotak.life') || '{}')); } catch {}
const fmt = (n) => n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}rb` : n.toLocaleString('id-ID');
function renderRecords() { ui.recWave.textContent = best; ui.recSteps.textContent = fmt(life.steps); ui.recKills.textContent = fmt(life.kills); }
renderRecords();

// setiap gelombang ke-5 = bos, bergiliran sesuai monster kecilnya: Raja Batu (monster kotak),
// Raja Tengkorak (tengkorak), Ratu Penyihir (penyihir). Makin kuat setiap kali muncul.
const BOSS_EVERY = 5;
const BOSSES = ['boss', 'bossSkel', 'bossWitch'];
function planWave(n) {
  if (n % BOSS_EVERY === 0) return [BOSSES[(n / BOSS_EVERY - 1) % BOSSES.length]];
  const q = [];
  // monster baru diperkenalkan satu per satu: tengkorak pedang (gel. 3), pemanah (4), penyihir (6)
  const slimes = Math.max(2, Math.min(2 + n, 7) - Math.floor(n / 3)), brutes = n >= 2 ? Math.min(n - 1, 4) : 0, bats = n >= 3 ? Math.min(n - 2, 3) : 0;
  const skels = n >= 3 ? Math.min(n - 2, 4) : 0, archers = n >= 4 ? Math.min(Math.floor((n - 2) / 2), 3) : 0, witches = n >= 6 ? Math.min(Math.floor((n - 4) / 2), 2) : 0;
  const big = n >= 7 ? Math.floor((n - 5) / 2) : 0;
  const add = (t, k) => { for (let i = 0; i < k; i++) q.push(t); };
  // monster istimewa dulu, lalu diisi slime/monster kotak sampai batas (makin banyak jenis = jumlah tidak meledak)
  add('skel', skels); add('archer', archers); add('witch', witches); add('brute2', big); add('bat', bats);
  const cap = Math.round(3 + n * 1.6);
  for (let i = 0; i < Math.max(slimes, brutes) && q.length < cap; i++) { if (i < slimes) q.push('slime'); if (i < brutes && q.length < cap) q.push('brute'); }
  for (let i = q.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [q[i], q[j]] = [q[j], q[i]]; }
  return q;
}
function startWave(n) {
  state.wave = n; stats.wave = n; state.queue = planWave(n); state.foesLeft = state.queue.length; state.spawnT = 1.2;
  ui.wave.textContent = n;
  if (n % BOSS_EVERY === 0) { state.bossLv = n / BOSS_EVERY; state.spawnT = 2.2; sfx.warn(); toast(`Gelombang ${n}: BOS! 👑`, 1800); }
  else { sfx.wave(); toast(`Gelombang ${n}! 👾`, 1500); }
}

const TUT = [
  { key: 'walk', text: 'Jalan di tempat! Angkat lutut bergantian 👣', keys: 'Tahan W / ↑', touch: 'Dorong stik ke atas', need: 8 },
  { key: 'left', text: 'Belok KIRI ↩️', pose: 'Condongkan badan ke KIRI — jagoan bergeser ⬅️ (mata tetap ke layar)', keys: 'Tahan A / ←', touch: 'Stik ke kiri', need: 1.0 },
  { key: 'right', text: 'Belok KANAN ↪️', pose: 'Condongkan badan ke KANAN — jagoan bergeser ➡️', keys: 'Tahan D / →', touch: 'Stik ke kanan', need: 1.0 },
  { key: 'look', text: 'Lihat ke ATAS ☁️', keys: 'Tahan Q', touch: 'Tahan tombol ☁️', need: .5, noPose: true },
  { key: 'punch', text: 'Tinju orang-orangan jerami 3x! 👊', keys: 'J / K atau klik', touch: 'Tombol 👊', need: 3 },
  { key: 'block', text: 'Silangkan kedua tangan di depan wajah = PERISAI 🛡️', keys: 'Tahan L', touch: 'Tahan tombol 🛡️', need: .7 },
  { key: 'jump', text: 'Lompat! 🦘', keys: 'Spasi', touch: 'Tombol 🦘', need: 1 },
  { key: 'crouch', text: 'Jongkok! 🙇', keys: 'Tahan C', touch: 'Tahan tombol 🙇', need: .4 },
];
function startTutorial() {
  state.mode = 'tutorial'; state.tutorial = { i: 0, prog: 0, steps0: stats.steps, yaw0: P.yaw, x0: P.pos.x, jumps0: stats.jumps, list: TUT.filter((t) => !(arena() && t.noPose)) };
  ui.prompt.hidden = false; showTutStep();
}
function showTutStep() {
  const L = state.tutorial.list, t = L[state.tutorial.i];
  const hint = ctl.source === 'pose' ? '' : matchMedia('(pointer: coarse)').matches ? t.touch : t.keys;
  ui.promptText.innerHTML = `<b>${state.tutorial.i + 1}/${L.length}</b> ${arena() && t.pose ? t.pose : t.text}<small>${hint}</small><i class="prog"><i></i></i>`;
  state.tutorial.prog = 0; state.tutorial.steps0 = stats.steps; state.tutorial.yaw0 = P.yaw; state.tutorial.x0 = P.pos.x; state.tutorial.jumps0 = stats.jumps;
  if (t.key === 'punch') {
    dummyHits = 0;
    const f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    const x = P.pos.x + f.x * 3.5, z = P.pos.z + f.z * 3.5;
    dummy.root.position.set(x, groundAt(x, z), z); dummy.root.rotation.y = P.yaw; dummy.root.visible = true;
  }
}
function tickTutorial(dt) {
  const T = state.tutorial, t = T.list[T.i];
  let v = 0;
  if (t.key === 'walk') v = stats.steps - T.steps0;
  else if (t.key === 'left') v = arena() ? Math.max(0, T.x0 - P.pos.x) : Math.max(0, P.yaw - T.yaw0);   // arena: geser 1 m
  else if (t.key === 'right') v = arena() ? Math.max(0, P.pos.x - T.x0) : Math.max(0, T.yaw0 - P.yaw);
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
  if (state.tutorial.list[state.tutorial.i].key === 'punch') { debris.burst(dummy.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)), 0xe8c34a, 24, 5); dummy.root.visible = false; }
  state.tutorial.i++;
  if (state.tutorial.i >= state.tutorial.list.length) { endTutorial(); return; }
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
  Object.assign(P, { yaw: 0, yawWant: 0, turnVel: 0, flipT: 0, airJumps: 0, crouchT: 0, lastCrouch: 0, sinceCrouch: 9, vy: 0, onGround: true, hp: 5, invuln: 0, energy: 0, punchL: 0, punchR: 0, superFx: 0, hurtT: 0, speed: 0 });
  P.pos.set(0, groundAt(0, 4), 4);
  Object.assign(stats, { steps: 0, punches: 0, jumps: 0, crouches: 0, kills: 0, gems: 0, active: 0, wave: 0, bosses: 0 });
  for (const sh of shocks) scene.remove(sh.m); shocks.length = 0; ui.boss.hidden = true; P.vel.set(0, 0, 0);
  clearShots(); dummy.root.visible = false;
  Object.assign(state, { score: 0, wave: 0, queue: [], foesLeft: 0, elapsed: 0, breakT: 0 });
  motion.resetCounters();
  renderHearts(); ui.gems.textContent = 0; ui.wave.textContent = '–';
}
function beginGame() {
  resetGame();
  ui.start.hidden = true; ui.calib.hidden = true; ui.over.hidden = true; ui.hud.hidden = false; ui.reticle.hidden = false;
  ui.practice.hidden = true; ui.hud.classList.remove('practice');
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
  // bonus permata dari bergerak: makin aktif, makin banyak 💎 untuk lemari
  const bonus = Math.floor(stats.steps / 20) + state.wave * 2;
  wardrobe.gems += bonus; saveWardrobe(wardrobe); syncWallet();
  ui.overGems.innerHTML = `💎 +${stats.gems} permata · +${bonus} bonus gerak → <b>${wardrobe.gems}</b> di dompet. Belanja di <b>Lemari 👕</b>!`;
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
  if (!playing() && state.mode !== 'paused') return;
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
  state.after = 'game';
  try { if (!landmarker) await startCamera(); ctl.source = 'pose'; beginCalib(); }
  catch (e) { console.warn(e); ui.calib.hidden = true; ui.start.hidden = false; ui.cam.hidden = true; toast('Kamera tidak bisa dibuka 😢 — coba main pakai keyboard', 2600); }
});
$('btn-keys').addEventListener('click', () => { unlock(); sfx.check(); ctl.source = 'keyboard'; ui.cam.hidden = true; beginGame(); });
// ruang latihan: pakai kamera kalau bisa (memang untuk membiasakan badan), kalau tidak pakai keyboard/sentuh
$('btn-practice').addEventListener('click', async () => {
  unlock(); sfx.check(); state.after = 'practice';
  ui.start.hidden = true; ui.cam.hidden = false; ui.calib.hidden = false; ui.calibHint.textContent = 'Menyalakan kamera…';
  try { if (!landmarker) await startCamera(); ctl.source = 'pose'; beginCalib(); }
  catch (e) { console.warn(e); ui.calib.hidden = true; ui.cam.hidden = true; ctl.source = 'keyboard'; toast('Kamera tidak bisa dibuka — latihan pakai keyboard/sentuh', 2400); beginPractice(); }
});
$('btn-again').addEventListener('click', () => { unlock(); state.after = 'game'; if (ctl.source === 'pose') beginCalib(); else beginGame(); });
$('btn-tutorial').addEventListener('click', () => { state.forceTutorial = true; state.after = 'game'; unlock(); if (ctl.source === 'pose') beginCalib(); else beginGame(); });
$('btn-resume').addEventListener('click', () => { ui.pauseMsg.hidden = true; togglePause(); });
// kembali ke menu utama tanpa memuat ulang halaman (izin kamera tetap tersimpan)
function goHome() {
  if (state.mode === 'practice' || (state.mode === 'paused' && state.prevMode === 'practice')) endPractice();
  ui.practice.hidden = true; ui.hud.classList.remove('practice');
  music.stop(.2); music.paused = false; resetGame(); state.mode = 'start'; state.forceTutorial = false;
  Object.assign(P, { yaw: 0 }); P.pos.set(0, groundAt(0, 4), 4); showoff.t = 1.5;
  ui.pause.hidden = ui.over.hidden = ui.hud.hidden = ui.touch.hidden = ui.reticle.hidden = ui.prompt.hidden = ui.calib.hidden = true;
  ui.pauseMsg.hidden = true; ui.cam.hidden = true; ui.start.hidden = false; ui.menuMain.hidden = false; ui.outfits.hidden = true; ui.start.classList.remove('shop'); shop.pick = null; previewLook(); syncWallet();
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

// mode anti pusing (bawaan: menyala): putaran & lari lebih pelan (mode kamera selalu arena tanpa putaran)
let comfort = true;
try { comfort = localStorage.getItem('kotak.comfort') !== '0'; } catch {}
const mComfort = $('m-comfort');
const syncComfort = () => { mComfort.classList.toggle('off', !comfort); mComfort.title = comfort ? 'Anti pusing: NYALA' : 'Anti pusing: MATI'; };
mComfort.addEventListener('click', () => {
  unlock(); comfort = !comfort; syncComfort(); sfx.check();
  toast(comfort ? 'Anti pusing NYALA 🌀 — belok & gerak lebih pelan' : 'Anti pusing MATI — belok halus');
  try { localStorage.setItem('kotak.comfort', comfort ? '1' : '0'); } catch {}
});
syncComfort();

// cara main
$('btn-howto').addEventListener('click', () => { unlock(); sfx.check(); ui.howto.hidden = false; });
$('howto-close').addEventListener('click', () => { ui.howto.hidden = true; });
ui.howto.addEventListener('click', (e) => { if (e.target === ui.howto) ui.howto.hidden = true; });

// lemari: coba barang (langsung terlihat di jagoan), beli dengan 💎, pakai
const shop = { slot: 'shirt', pick: null };
const shopTabs = $('shop-tabs'), shopItems = $('shop-items'), shopBuy = $('shop-buy'), shopMsg = $('shop-msg');
const syncWallet = () => { for (const el of document.querySelectorAll('.wallet-n')) el.textContent = wardrobe.gems; };
syncWallet();
shopTabs.innerHTML = SLOTS.map((t) => `<button class="tab" data-slot="${t.id}"><i>${t.icon}</i>${t.name}</button>`).join('');
function cardHtml(it) {
  const own = owns(wardrobe, it), on = wardrobe.eq[it.slot] === it.id, pick = shop.pick === it.id;
  const sw = swatchOf(it);
  const art = sw ? `<span class="sw" style="--c:${sw};--s:${sleeveOf(it)}"></span>` : `<span class="ic">${it.icon}</span>`;
  const tag = on ? '<em class="on">dipakai ✓</em>' : own ? '<em>punya</em>' : `<em class="price">💎 ${it.price}</em>`;
  return `<button class="item${on ? ' on' : ''}${pick ? ' pick' : ''}${own ? '' : ' locked'}" data-id="${it.id}">${art}<b>${it.name}</b>${tag}</button>`;
}
function renderShop() {
  shopTabs.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.slot === shop.slot));
  shopItems.innerHTML = ITEMS.filter((i) => i.slot === shop.slot).map(cardHtml).join('');
  const it = shop.pick && ITEMS.find((i) => i.id === shop.pick);
  shopBuy.hidden = !it;
  if (it) {
    const short = it.price - wardrobe.gems;
    shopBuy.disabled = short > 0;
    shopBuy.innerHTML = short > 0 ? `Kurang 💎 ${short} lagi — ayo main & bergerak!` : `Beli ${it.name} · 💎 ${it.price}`;
  }
  syncWallet();
}
const previewLook = () => applyLook(hero, shop.pick ? { ...wardrobe.eq, [shop.slot]: shop.pick } : wardrobe.eq);
shopTabs.addEventListener('click', (e) => {
  const b = e.target.closest('.tab'); if (!b) return;
  shop.slot = b.dataset.slot; shop.pick = null; previewLook(); renderShop(); sfx.tick();
});
shopItems.addEventListener('click', (e) => {
  const b = e.target.closest('.item'); if (!b) return;
  const it = ITEMS.find((i) => i.id === b.dataset.id);
  if (owns(wardrobe, it)) {                 // milik sendiri: langsung dipakai
    wardrobe.eq[it.slot] = it.id; shop.pick = null; saveWardrobe(wardrobe); sfx.gem(); showoff.raise = .6;
  } else { shop.pick = it.id; sfx.tick(); }  // belum punya: dicoba dulu
  previewLook(); renderShop();
});
shopBuy.addEventListener('click', () => {
  const it = ITEMS.find((i) => i.id === shop.pick); if (!it) return;
  if (!buy(wardrobe, it)) { sfx.nope(); return; }
  wardrobe.eq[it.slot] = it.id; shop.pick = null; saveWardrobe(wardrobe);
  sfx.buy(); showoff.raise = 1.1; toast(`${it.name} jadi milikmu! 🎉`, 1600);
  debris.burst(tmp.copy(P.pos).setY(P.pos.y + 1.2), 0xffe066, 16, 4, .1);
  previewLook(); renderShop();
});
function openShop() { unlock(); sfx.check(); shop.pick = null; renderShop(); ui.menuMain.hidden = true; ui.outfits.hidden = false; ui.start.classList.add('shop'); }
function closeShop() { shop.pick = null; previewLook(); ui.outfits.hidden = true; ui.menuMain.hidden = false; ui.start.classList.remove('shop'); }
$('btn-outfit').addEventListener('click', openShop);
$('outfit-done').addEventListener('click', closeShop);

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
    if (motion.finishCalibration()) { ui.calib.hidden = true; if (state.after === 'practice') beginPractice(); else beginGame(); }
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
  // di lemari tab Punggung: jagoan berbalik supaya jubah/ransel/sayap terlihat
  P.yaw = menuFacing() + (!ui.outfits.hidden && shop.slot === 'back' ? Math.PI * .8 : 0);
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
// Lompat: dari tanah (biasa / tinggi setelah jongkok) atau sekali lagi di udara (lompat ganda + salto)
function jump() {
  if (P.onGround) {
    const high = (ctl.crouch && P.crouchT > .2) || (P.sinceCrouch < .45 && P.lastCrouch > .2);
    P.vy = high ? 10.8 : 8.2; P.onGround = false; P.airJumps = 1; stats.jumps++;
    P.crouchT = 0; P.lastCrouch = 0;
    if (high) { sfx.highJump(); debris.burst(tmp.copy(P.pos).setY(P.pos.y + .1), 0xd8c9a0, 10, 3, .1); if (!P.toldHigh) { P.toldHigh = true; toast('LOMPAT TINGGI! 🚀'); } }
    else sfx.jump();
  } else if (P.airJumps > 0) {
    P.airJumps--; P.vy = Math.max(P.vy, 0) * .3 + 7.4; P.flipT = .5; stats.jumps++; sfx.doubleJump();
    debris.burst(tmp.copy(P.pos).setY(P.pos.y + .1), 0xffffff, 8, 2.5, .09);
    if (!P.toldDouble) { P.toldDouble = true; toast('LOMPAT GANDA! ✨'); }
  }
}

// Belok yang ramah mata (lihat README: putaran kamera adalah pemicu pusing terbesar).
// Mode anti pusing + kamera: belok "patah" 30° sekaligus, tanpa putaran yang terlihat.
// Selain itu: putaran halus dengan percepatan terbatas (mulai dan berhenti pelan, tidak menyentak).
const SNAP = Math.PI / 6;
const snap = { armed: true, t: 0 };
function turnPlayer(dt) {
  if (ctl.source === 'pose' && comfort) {
    P.turnVel = 0;
    const a = Math.abs(ctl.turn);
    if (a < .25) { snap.armed = true; snap.t = 0; }
    else if (a > .45) {
      snap.t -= dt;
      if (snap.armed || snap.t <= 0) { P.yaw += Math.sign(ctl.turn) * SNAP; P.snapped = true; snap.armed = false; snap.t = .8; sfx.tick(); }
    }
    return;
  }
  const max = ctl.source === 'pose' ? 1.2 : comfort ? 1.7 : 2.4;   // rad/dtk (dulu 2.0 di mode kamera)
  const want = ctl.turn * max, acc = 5 * dt;
  P.turnVel = (P.turnVel || 0) + clamp(want - (P.turnVel || 0), -acc, acc);
  P.yaw += P.turnVel * dt;
}
// panah di tepi layar ke monster terdekat yang tidak terlihat (pengganti putar-otomatis kamera)
function updateFoeArrow() {
  let best = null, bd = 30;
  for (const f of foes) { const d = Math.hypot(f.pos.x - P.pos.x, f.pos.z - P.pos.z); if (d < bd) { bd = d; best = f; } }
  let show = '';
  const fighting = state.mode === 'play' || state.mode === 'practice';
  if (best && fighting && arena()) {
    // kamera arena tidak berputar: cek apakah monster terdekat ada di luar layar
    const v = center(best, tmp2).project(camera);
    const behind = v.z > 1, off = behind || Math.abs(v.x) > .92 || v.y < -1 || v.y > 1;
    if (off) show = (behind ? -v.x : v.x) < 0 ? 'L' : 'R';
  } else if (best && fighting) {
    const want = Math.atan2(-(best.pos.x - P.pos.x), -(best.pos.z - P.pos.z));
    const diff = Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw));
    if (Math.abs(diff) > .75) show = diff > 0 ? 'L' : 'R';
  }
  setClass(ui.foeArrow, 'on', !!show); setClass(ui.foeArrow, 'r', show === 'R');
  if (show) setText(ui.foeArrow, show === 'L' ? '◀ 👾' : '👾 ▶');
}
// Mode arena (kamera): sasaran otomatis = monster terdekat (atau orang-orangan latihan, atau permata).
function arenaTarget() {
  let best = null, bd = 18;
  for (const f of foes) { const d = Math.hypot(f.pos.x - P.pos.x, f.pos.z - P.pos.z) - f.def.r; if (d < bd) { bd = d; best = f; } }
  if (best) return { x: best.pos.x, z: best.pos.z, reach: best.def.r + (best.type === 'bat' ? 2 : 1.15) };
  if (dummy.root.visible) return { x: dummy.root.position.x, z: dummy.root.position.z, reach: drillId() === 'dodge' ? 99 : 1.9 };
  let gem = null, gd = 14;
  for (const it of items) { const d = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z); if (d < gd) { gd = d; gem = it; } }
  return gem ? { x: gem.pos.x, z: gem.pos.z, reach: 0, item: true } : null;
}
function arenaMove(dt) {
  const t = arenaTarget(), slow = ctl.crouch || ctl.block;
  let vx = 0, vz = 0;
  if (t) {
    const dx = t.x - P.pos.x, dz = t.z - P.pos.z, d = Math.hypot(dx, dz);
    if (!t.item || ctl.fwd > 0) P.yawWant = Math.atan2(-dx, -dz);            // selalu menghadap monster
    if (ctl.fwd > 0 && d > t.reach && d > .05) { const sp = slow ? 1.2 : ctl.run ? 4.6 : 3.1; vx = dx / d * sp; vz = dz / d * sp; }
  }
  vx -= ctl.side * (slow ? 1.4 : 3.2);                                       // condong ke kiri pemain = kiri layar (-x)
  const k = Math.min(1, dt * 6);
  P.vel.x += (vx - P.vel.x) * k; P.vel.z += (vz - P.vel.z) * k;
  moveBody(P, P.vel.x * dt, P.vel.z * dt);
  const r = Math.hypot(P.pos.x, P.pos.z), lim = ARENA_R - .8;                 // tetap di arena (kamera membingkai arena)
  if (r > lim) { P.pos.x *= lim / r; P.pos.z *= lim / r; }
  P.speed = Math.hypot(P.vel.x, P.vel.z);
  if (!t && P.speed > .5) P.yawWant = Math.atan2(-P.vel.x, -P.vel.z);
  const dy = Math.atan2(Math.sin(P.yawWant - P.yaw), Math.cos(P.yawWant - P.yaw));
  P.yaw += clamp(dy, -7 * dt, 7 * dt);
}
// jagoan menghadap kamera di menu (karakter menghadap -z lokal, jadi arah ke kamera dibalik)
const menuFacing = () => Math.atan2(P.pos.x - camera.position.x, P.pos.z - camera.position.z);
let last = performance.now(), frameTimes = [];
function update(dt, now) {
  gatherInput(dt);
  const active = playing();

  if (active) {
    // gerak pemain
    if (arena()) arenaMove(dt);
    else {
      turnPlayer(dt);
      const runV = comfort ? 5 : 6.2, walkV = comfort ? 3 : 3.3;
      const target = ctl.crouch || ctl.block ? Math.min(ctl.fwd, .5) * 2 : ctl.fwd * (ctl.run ? runV : walkV);
      P.speed += (target - P.speed) * Math.min(1, dt * 3.5);       // mulai/berhenti pelan: perubahan laju memicu pusing
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      moveBody(P, fx * P.speed * dt, fz * P.speed * dt);
    }
    // jongkok yang baru selesai (≤0.45 dtk) atau masih ditahan → lompatan berikutnya jadi LOMPAT TINGGI
    if (ctl.crouch && P.onGround) P.crouchT += dt;
    else if (P.wasCrouch) { P.lastCrouch = P.crouchT; P.sinceCrouch = 0; P.crouchT = 0; }
    P.sinceCrouch += dt;
    if (ctl.jump) jump();
    if (ctl.crouch && !P.wasCrouch) stats.crouches++;
    P.wasCrouch = ctl.crouch;
    physicsY(P, dt);
    if (ctl.punchL) punch('L');
    if (ctl.punchR) punch('R');
    if (ctl.superReq && state.mode === 'practice' && ctl.source !== 'pose') practiceMove('raise');
    if (ctl.superReq) { if (P.energy >= 100) superSlam(); else if (ctl.source !== 'pose') toast('Energi belum penuh — terus bergerak! ⚡'); }
    if (Math.abs(P.speed) > .3 || ctl.block || ctl.crouch || P.punchL > 0 || P.punchR > 0 || !P.onGround) stats.active += dt;
    state.elapsed += dt;
  }
  ctl.punchL = ctl.punchR = ctl.jump = ctl.superReq = false;
  P.flipT = P.onGround ? 0 : Math.max(0, P.flipT - dt);
  P.punchL = Math.max(0, P.punchL - dt); P.punchR = Math.max(0, P.punchR - dt); P.invuln = Math.max(0, P.invuln - dt); P.hurtT = Math.max(0, P.hurtT - dt);

  // jagoan: posisi & animasi
  const menu = state.mode === 'start' || state.mode === 'calib';
  if (menu) menuShowoff(dt);
  hero.root.position.copy(P.pos);
  const dyaw = Math.atan2(Math.sin(P.yaw - hero.root.rotation.y), Math.cos(P.yaw - hero.root.rotation.y));
  hero.root.rotation.y += P.snapped ? dyaw : dyaw * Math.min(1, dt * (menu ? 4 : 20));
  const s = motion.st, posed = ctl.source === 'pose' && s.ok && !menu;
  animateHumanoid(hero, {
    speed: menu ? 0 : P.speed, onGround: P.onGround,
    kneeL: posed && !s.moving ? s.kneeL : undefined, kneeR: s.kneeR,
    punchL: P.punchL, punchR: P.punchR, block: !menu && ctl.block, crouch: !menu && ctl.crouch && P.onGround,
    flip: P.flipT > 0 ? 1 - P.flipT / .5 : 0,
    raise: (posed && s.raise) || (menu && showoff.raise > 0), slam: P.superFx, hurt: P.hurtT / .35,
    headYaw: menu ? Math.sin(now * .0007) * .25 : 0, headPitch: menu ? 0 : ctl.look,
    mirror: posed && P.hp > 0 ? s.arms : null,
  }, dt);
  hero.root.visible = P.invuln <= 0 || Math.floor(now / 90) % 2 === 0;
  // debu kecil di setiap jejak saat berlari
  const foot = Math.floor(hero.a.phase / Math.PI);
  if (foot !== P.lastFoot) { P.lastFoot = foot; if (!menu && P.onGround && P.speed > 4.2) debris.burst(tmp.copy(P.pos).setY(P.pos.y + .05), 0xcbb991, 2, 1.2, .07); }
  const hg = groundAt(P.pos.x, P.pos.z);
  heroBlob.position.set(P.pos.x, hg + .03, P.pos.z); heroBlob.scale.setScalar(Math.max(.5, 1 - (P.pos.y - hg) * .12));
  if (dummyWobble > 0) { dummyWobble = Math.max(0, dummyWobble - dt * 2.2); dummy.top.rotation.x = -Math.sin(dummyWobble * 14) * dummyWobble * .35; }

  if (state.mode === 'tutorial') tickTutorial(dt);
  if (state.mode === 'practice') tickPractice(dt);

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
  updateShocks(dt);
  updateShots(dt);
  updateRunes(dt);
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
    setStyle(ui.reticle, 'display', arena() ? 'none' : '');
  }

  updateCamera(dt);
  updateFoeArrow();
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
    } else if (f.type === 'boss') updateBoss(f, dt, to, dist);
    else if (f.type === 'bossSkel') updateBossSkel(f, dt, to, dist);
    else if (f.type === 'bossWitch') updateBossWitch(f, dt, to, dist);
    else if (f.type === 'skel') updateSkel(f, dt, to, dist);
    else if (f.type === 'archer') updateArcher(f, dt, to, dist);
    else if (f.type === 'witch') updateWitch(f, dt, to, dist);
    else if (f.type === 'bat') {
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
    if (!floaty(f) && !f.def.boss) unstick(f, dt, dist);
    f.rig.root.position.copy(f.pos);
    // muncul: membesar dengan sedikit memantul
    const bs = f.rig.baseScale * (f.born < .4 ? Math.max(.01, easeOutBack(f.born / .4)) : 1);
    f.rig.root.scale.setScalar(bs);
    // gemetar = tanda mau menyerang (beri anak waktu untuk menangkis / jongkok)
    if (f.state === 'windup' || f.state === 'warn' || f.state === 'aim' || f.state === 'cast' || f.state === 'hex' || (f.def.boss && f.state.endsWith('Wind'))) { f.rig.root.position.x += Math.sin(now * .07) * .06; f.rig.root.position.y += Math.abs(Math.sin(now * .05)) * .06; }
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

// --- Bos Raja Batu ---
// Setiap serangan diawali ancang-ancang yang jelas (gemetar + petunjuk), dan tiap serangan dilawan dengan
// gerakan badan yang berbeda: hentakan → LOMPAT, pukulan → JONGKOK/PERISAI, serudukan → CONDONG ke samping.
// Habis menyeruduk / kena tangkis, bos pusing (bintang berputar) dan pukulan bernilai 2×.
const BOSS_TIPS = {
  slam: 'Bos mau menghentak — LOMPAT! 🦘', swing: 'Pukulan bos — JONGKOK atau PERISAI! 🙇🛡️', charge: 'Bos mau menyeruduk — CONDONG ke samping! ↔️',
  sweep: 'Tebasan raksasa — JONGKOK atau PERISAI! 🙇🛡️', volley: 'Hujan panah tulang — PERISAI atau JONGKOK! 🛡️', spin: 'Dia mau berputar menyerbu — CONDONG ke samping! ↔️',
  orbs: 'Bola sihir — TINJU untuk memantulkannya! 👊✨', runes: 'Lingkaran sihir — GESER keluar atau LOMPAT! ✨',
};
const BOSS_WIND = { slam: 1.35, swing: .95, charge: 1.0, sweep: 1.1, volley: 1.15, spin: .95, orbs: 1.0, runes: .95 };
function bossAttack(f, kind, q) {
  f.state = kind + 'Wind'; f.timer = BOSS_WIND[kind] * q; f.wind = f.timer; sfx.warn();
  const n = (f.told[kind] || 0); if (n < 2) { f.told[kind] = n + 1; toast(BOSS_TIPS[kind], 1500); }
}
// bos jatuh dari langit: mendarat dengan gelombang kejut (tidak berbahaya), lalu mulai mengejar
function introFall(f) {
  if (f.onGround && !f.landed) { f.landed = true; f.timer = 1.1; sfx.slam(); shockwave(f.pos, false); debris.burst(f.pos.clone().setY(f.pos.y + .3), f.def.color, 30, 8, .22); }
  if (f.landed && f.timer <= 0) { f.state = 'chase'; f.cd = 1.2; }
}
// setengah nyawa: bos marah (lebih cepat) dan memanggil 2 anak buah sesuai jenisnya
function bossRage(f, minion) {
  if (f.enraged || f.hp > f.maxHp / 2) return;
  f.enraged = true; ui.boss.classList.add('rage'); sfx.boss(); toast(`${f.def.title} MARAH! 😤`, 1500);
  for (let i = 0; i < 2; i++) spawnFoe(minion); state.foesLeft += 2;
}
function updateBoss(f, dt, to, dist) {
  const rage = f.hp <= f.maxHp / 2, q = rage ? .8 : 1;
  const face = Math.atan2(-to.x, -to.z), turnTo = (rate) => { f.yaw += clamp(Math.atan2(Math.sin(face - f.yaw), Math.cos(face - f.yaw)), -rate * dt, rate * dt); };
  let walking = false, raise = false, windup = 0;
  f.timer -= dt; f.cd -= dt;
  bossRage(f, 'slime');
  if (f.state === 'intro') introFall(f);
  else if (f.state === 'chase') {
    turnTo(3);
    if (f.cd <= 0) bossAttack(f, dist < 3.4 ? (Math.random() < .6 ? 'swing' : 'slam') : dist > 5.5 ? (Math.random() < .5 ? 'charge' : 'slam') : 'slam', q);
    else if (dist > 2.7) {
      const step = f.def.speed * (rage ? 1.3 : 1) * dt;
      if (!moveBody(f, -Math.sin(f.yaw) * step, -Math.cos(f.yaw) * step)) moveBody(f, -Math.sin(f.yaw + 1.2) * step, -Math.cos(f.yaw + 1.2) * step);
      walking = true;
    }
  } else if (f.state === 'slamWind') {
    raise = true;
    if (f.timer <= 0) { f.state = 'slam'; f.timer = .5; sfx.slam(); shockwave(f.pos, true); debris.burst(f.pos.clone().setY(f.pos.y + .3), 0xcbb991, 24, 7, .18); }
  } else if (f.state === 'slam') {
    if (f.timer <= 0) { f.state = 'recover'; f.timer = 1.1; }
  } else if (f.state === 'swingWind') {
    turnTo(2.5); windup = clamp(1 - f.timer / f.wind, 0, 1);
    if (f.timer <= 0) {
      f.state = 'recover'; f.timer = 1.1; f.atkT = 0;
      const dodged = (ctl.crouch && P.onGround) || P.pos.y - groundAt(P.pos.x, P.pos.z) > .9;   // pukulan setinggi dada
      if (dist < 3.7 && !dodged) {
        const r = damagePlayer(f.pos, 'Kena pukulan bos!');
        if (r === 'blocked') { f.state = 'dizzy'; f.timer = 1.6; toast('TANGKIS! Bos pusing — pukul! 💫', 1400); }
      } else if (dist < 3.7) toast('Lolos! 👍', 800);
    }
  } else if (f.state === 'chargeWind') {
    turnTo(4);
    if (f.timer <= 0) { f.state = 'charge'; f.timer = 1.7; f.hitP = false; f.cdir = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw)); sfx.jump(); }
  } else if (f.state === 'charge') {
    const step = (rage ? 10 : 8.5) * dt, moved = moveBody(f, f.cdir.x * step, f.cdir.z * step);
    walking = true;
    if (!f.hitP && dist < f.def.r + .7) { f.hitP = true; damagePlayer(f.pos, 'Diseruduk bos!', true); }
    if (f.timer <= 0 || !moved || Math.hypot(f.pos.x, f.pos.z) > ARENA_R - 1.3) {
      f.state = 'dizzy'; f.timer = rage ? 1.7 : 2.3; sfx.poof(); debris.burst(center(f), 0xffffff, 14, 4);
      if (!f.toldDizzy) { f.toldDizzy = true; toast('Bos pusing — pukul sekarang! 💫 (2×)', 1500); }
    }
  } else if (f.state === 'dizzy') {
    if (f.timer <= 0) { f.state = 'chase'; f.cd = .9; }
  } else if (f.state === 'recover') {
    if (f.timer <= 0) { f.state = 'chase'; f.atkT = -1; f.cd = (rage ? 1.1 : 1.9) + Math.random() * .8; }
  }
  physicsY(f, dt);
  f.rig.stars.visible = f.state === 'dizzy';
  if (f.rig.stars.visible) f.rig.stars.rotation.y += dt * 5;
  f.speed += ((f.state === 'charge' ? 9 : walking ? f.def.speed * 1.6 : 0) - f.speed) * Math.min(1, dt * 8);
  animateHumanoid(f.rig, {
    speed: f.speed, onGround: f.onGround, zombie: f.state === 'chase' || f.state === 'charge', hurt: f.hurtT / .3 * .4,
    windup, swing: f.atkT, raise, slam: f.state === 'slam' ? Math.max(.01, f.timer * .7) : 0,
    headPitch: f.state === 'dizzy' ? Math.sin(f.timer * 9) * .3 : 0,
  }, dt);
}
// gelombang kejut hentakan bos: cincin yang melebar di tanah, hanya bisa dihindari dengan melompat
const shocks = [];
const shockGeo = new THREE.RingGeometry(.8, 1, 64);
function shockwave(at, harmful, drill = false) {
  const m = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({ color: harmful ? 0xff8a3c : 0xffffff, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(at.x, groundAt(at.x, at.z) + .08, at.z); scene.add(m);
  shocks.push({ m, c: at.clone(), r: 1, hit: !harmful, max: harmful ? 13 : 6, drill });
}
function updateShocks(dt) {
  for (const sh of [...shocks]) {
    sh.r += dt * 7.5; sh.m.scale.setScalar(sh.r); sh.m.material.opacity = .85 * Math.max(0, 1 - sh.r / sh.max);
    const d = Math.hypot(P.pos.x - sh.c.x, P.pos.z - sh.c.z);
    if (!sh.hit && Math.abs(d - sh.r) < .55 && P.pos.y - groundAt(P.pos.x, P.pos.z) < .35) { sh.hit = true; damagePlayer(sh.c, 'Kena gelombang! Lompat ya 🦘', true); if (sh.drill) { sh.drill = false; practiceResult(false); } }
    if (sh.drill && d < sh.r - .8) { sh.drill = false; practiceResult(true, 'lompat'); }        // gelombang sudah lewat tanpa kena
    if (sh.r >= sh.max) { scene.remove(sh.m); sh.m.material.dispose(); shocks.splice(shocks.indexOf(sh), 1); }
  }
}

// ---------------------------------------------------------------------------
// Monster baru: tengkorak pedang, tengkorak pemanah, penyihir — dan bos versi mereka.
// Setiap serangan diawali tanda yang jelas, dan tiap jenis mengajarkan gerakan yang berbeda.
// ---------------------------------------------------------------------------
const FOE_TIPS = {
  skel: 'Tengkorak mengangkat pedang — JONGKOK atau PERISAI! 🙇🛡️',
  archer: 'Pemanah membidik — PERISAI, JONGKOK, atau CONDONG! 🏹',
  witch: 'Bola sihir — TINJU untuk memantulkannya! 👊✨',
  hex: 'Lingkaran sihir di kakimu — GESER keluar atau LOMPAT! ✨',
};
const tipsShown = {};
function tip(key) { const n = tipsShown[key] || 0; if (n < 2) { tipsShown[key] = n + 1; toast(FOE_TIPS[key], 1700); } }
const faceTo = (f, to, rate, dt) => { const want = Math.atan2(-to.x, -to.z); f.yaw += clamp(Math.atan2(Math.sin(want - f.yaw), Math.cos(want - f.yaw)), -rate * dt, rate * dt); };
const walkFwd = (f, step) => { if (!moveBody(f, -Math.sin(f.yaw) * step, -Math.cos(f.yaw) * step)) moveBody(f, -Math.sin(f.yaw + 1.2) * step, -Math.cos(f.yaw + 1.2) * step); };
const dodgedHigh = () => (ctl.crouch && P.onGround) || P.pos.y - groundAt(P.pos.x, P.pos.z) > .8;   // serangan setinggi dada
const chestOf = (out) => out.set(P.pos.x, groundAt(P.pos.x, P.pos.z) + 1.25, P.pos.z);              // tinggi dada saat BERDIRI

// --- Tengkorak pedang: tebasan setinggi dada → JONGKOK atau PERISAI (tangkisan membuatnya terhuyung) ---
function updateSkel(f, dt, to, dist) {
  faceTo(f, to, 7, dt);
  let walking = false;
  if (f.state === 'chase') {
    if (dist > 1.5) { walkFwd(f, f.def.speed * dt); walking = true; }
    else { f.state = 'windup'; f.timer = .8; sfx.warn(); tip('skel'); }
  } else if (f.state === 'windup') {
    f.timer -= dt;
    if (f.timer <= 0) {
      f.state = 'recover'; f.timer = .9; f.atkT = 0; sfx.swish();
      if (dist < 2.3) {
        if (dodgedHigh()) toast('Lolos! 👍', 700);
        else if (damagePlayer(f.pos, 'Kena pedang! Jongkok atau perisai 🙇🛡️') === 'blocked') { f.knock.set(-to.x, 0, -to.z).normalize().multiplyScalar(5); f.timer = 1.5; }
      }
    }
  } else if (f.state === 'recover') { f.timer -= dt; if (f.timer <= 0) { f.state = 'chase'; f.atkT = -1; } }
  physicsY(f, dt);
  f.speed += ((walking ? f.def.speed * 1.6 : 0) - f.speed) * Math.min(1, dt * 8);
  animateHumanoid(f.rig, {
    speed: f.speed, onGround: f.onGround, hurt: f.hurtT / .3,
    windup: f.state === 'windup' ? clamp(1 - f.timer / .8, 0, 1) : 0, swing: f.atkT,
    arms: f.state === 'chase' ? { R: [.75, .05] } : null,                                  // pedang siap di depan
  }, dt);
}

// --- Tengkorak pemanah: menjaga jarak, membidik ±1 dtk (anak panah terlihat), panah setinggi dada ---
function updateArcher(f, dt, to, dist) {
  faceTo(f, to, 6, dt);
  f.timer -= dt; f.cd -= dt; f.backT = (f.backT || 0) - dt;
  let walking = false, aim = 0;
  if (f.state === 'chase') {
    if (f.backing > 0) {                                     // mundur sebentar kalau didekati (tidak terus-menerus)
      f.backing -= dt; walking = true;
      if (Math.hypot(f.pos.x, f.pos.z) < ARENA_R - 2) moveBody(f, Math.sin(f.yaw) * f.def.speed * .8 * dt, Math.cos(f.yaw) * f.def.speed * .8 * dt);
    } else if (dist < 4.5 && f.backT <= 0) { f.backing = 1.1; f.backT = 4.5; }
    else if (dist > 10) { walkFwd(f, f.def.speed * dt); walking = true; }
    if (f.cd <= 0 && dist < 14 && !(f.backing > 0)) { f.state = 'aim'; f.timer = f.wind = 1.15; f.rig.nock.visible = true; sfx.warn(); tip('archer'); }
  } else if (f.state === 'aim') {
    aim = clamp(1 - f.timer / f.wind, 0, 1);
    if (f.timer <= 0) {
      const from = tmp2.set(f.pos.x - Math.sin(f.yaw) * .6, f.pos.y + 1.3, f.pos.z - Math.cos(f.yaw) * .6);
      fire('arrow', from, chestOf(new THREE.Vector3()), f); sfx.arrow();
      f.rig.nock.visible = false; f.state = 'recover'; f.timer = .6; f.cd = 2.8 + Math.random() * 1.4;
    }
  } else if (f.state === 'recover') { if (f.timer <= 0) f.state = 'chase'; }
  physicsY(f, dt);
  f.speed += ((walking ? f.def.speed * 1.6 : 0) - f.speed) * Math.min(1, dt * 8);
  animateHumanoid(f.rig, {
    speed: f.speed, onGround: f.onGround, hurt: f.hurtT / .3,
    arms: f.state === 'aim' ? { L: [1.57, .12], R: [1.45 - .1 * aim, -.3 - .4 * aim] } : f.state === 'chase' ? { L: [.35, -.1] } : null,
  }, dt);
}

// --- Penyihir: melayang, bola sihir yang mengejar pelan (TINJU = memantul balik, atau PERISAI),
//     lingkaran sihir di bawah kaki pemain (GESER keluar atau LOMPAT). Kadang menghilang setelah dipukul. ---
function hover(f, dt, h) {
  f.t2 = (f.t2 || 0) + dt * 2.2;
  const g = groundAt(f.pos.x, f.pos.z);
  f.pos.y += (g + h + Math.sin(f.t2 + f.phase) * .12 - f.pos.y) * Math.min(1, dt * 4);
}
function teleport(f, dmin, dmax) {
  debris.burst(center(f), 0xb23cff, 16, 4, .12); sfx.poof();
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2, d = dmin + Math.random() * (dmax - dmin), x = P.pos.x + Math.cos(a) * d, z = P.pos.z + Math.sin(a) * d;
    if (Math.hypot(x, z) < ARENA_R - 1.5 && roomy(x, z, f.def.r)) { f.pos.set(x, groundAt(x, z) + .3, z); break; }
  }
  f.born = 0; f.knock.set(0, 0, 0);
}
function castOrb(f, spread = 0) {
  const sc = f.rig.baseScale, a = f.yaw + spread;
  const from = tmp2.set(f.pos.x - Math.sin(a) * .55 * sc, f.pos.y + 1.55 * sc, f.pos.z - Math.cos(a) * .55 * sc);
  fire('orb', from, tmp.set(P.pos.x, P.pos.y + 1.2, P.pos.z), f); sfx.magic();
}
function updateWitch(f, dt, to, dist) {
  faceTo(f, to, 5, dt);
  f.timer -= dt; f.cd -= dt;
  if (f.blink > 0) { f.blink -= dt; if (f.blink <= 0) teleport(f, 5, 8.5); }
  let cast = 0;
  if (f.state === 'chase') {
    // jaga jarak ±6 m, sambil melayang menyamping pelan
    const want = dist > 7.5 ? 1 : dist < 4.5 ? -1 : 0, fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
    f.orbit += dt * .35;
    const side = Math.sin(f.orbit) * .7;
    moveBody(f, (fx * want * 1.3 + fz * side) * dt, (fz * want * 1.3 - fx * side) * dt);
    if (f.cd <= 0 && dist < 13) {
      f.state = Math.random() < .62 ? 'cast' : 'hex'; f.timer = f.wind = f.state === 'cast' ? 1.0 : .85; sfx.warn();
      tip(f.state === 'cast' ? 'witch' : 'hex');
    }
  } else if (f.state === 'cast') {
    cast = clamp(1 - f.timer / f.wind, 0, 1);
    if (f.timer <= 0) { castOrb(f); f.state = 'recover'; f.timer = .6; f.cd = 3.4 + Math.random() * 1.4; }
  } else if (f.state === 'hex') {
    cast = clamp(1 - f.timer / f.wind, 0, 1);
    if (f.timer <= 0) { rune(P.pos.x, P.pos.z, 1.4); sfx.magic(); f.state = 'recover'; f.timer = .5; f.cd = 3.2 + Math.random() * 1.4; }
  } else if (f.state === 'recover') { if (f.timer <= 0) f.state = 'chase'; }
  hover(f, dt, .35);
  f.rig.glow.emissiveIntensity += ((cast ? .5 + cast * 2.2 : .4) - f.rig.glow.emissiveIntensity) * Math.min(1, dt * 8);
  animateHumanoid(f.rig, {
    speed: 0, onGround: true, hurt: f.hurtT / .3,
    arms: f.state === 'cast' ? { L: [2.3, .35], R: [2.3, -.35] } : f.state === 'hex' ? { L: [2.95, .25], R: [2.95, -.25] } : { R: [.45, 0] },
  }, dt);
}

// --- Bos Raja Tengkorak: tebasan raksasa (JONGKOK/PERISAI → pusing), hujan panah tulang (PERISAI/JONGKOK),
//     putaran menyerbu (CONDONG ke samping → pusing). Marah: memanggil 2 tengkorak. ---
function updateBossSkel(f, dt, to, dist) {
  const rage = f.hp <= f.maxHp / 2, q = rage ? .8 : 1;
  let walking = false, windup = 0, arms = null;
  f.timer -= dt; f.cd -= dt;
  bossRage(f, 'skel');
  if (f.state === 'intro') introFall(f);
  else if (f.state === 'chase') {
    faceTo(f, to, 3, dt);
    if (f.cd <= 0) bossAttack(f, dist < 4 ? (Math.random() < .7 ? 'sweep' : 'spin') : (Math.random() < .55 ? 'volley' : 'spin'), q);   // panah hanya dari jauh
    else if (dist > 3) { walkFwd(f, f.def.speed * (rage ? 1.3 : 1) * dt); walking = true; }
  } else if (f.state === 'sweepWind') {
    faceTo(f, to, 2.5, dt); windup = clamp(1 - f.timer / f.wind, 0, 1);
    if (f.timer <= 0) {
      f.state = 'recover'; f.timer = 1.1; f.atkT = 0; sfx.swish();
      if (dist < 4.6) {
        if (dodgedHigh()) toast('Lolos! 👍', 800);
        else if (damagePlayer(f.pos, 'Kena tebasan!') === 'blocked') { f.state = 'dizzy'; f.timer = 1.6; toast('TANGKIS! Bos pusing — pukul! 💫', 1400); }
      }
    }
  } else if (f.state === 'volleyWind') {
    faceTo(f, to, 3, dt); arms = { L: [2.7, .4], R: [2.7, -.4] };
    if (f.timer <= 0) {
      const base = Math.atan2(P.pos.x - f.pos.x, P.pos.z - f.pos.z), g = groundAt(f.pos.x, f.pos.z);
      for (const a of rage ? [-.5, -.25, 0, .25, .5] : [-.36, -.12, .12, .36]) {
        const dx = Math.sin(base + a), dz = Math.cos(base + a);
        const from = new THREE.Vector3(f.pos.x + dx * 1.4, g + 1.25, f.pos.z + dz * 1.4);
        fire('bone', from, from.clone().add(tmp.set(dx, 0, dz)), f);
      }
      sfx.arrow(); f.state = 'recover'; f.timer = 1.0;
    }
  } else if (f.state === 'spinWind') {
    faceTo(f, to, 4, dt); windup = clamp(1 - f.timer / f.wind, 0, 1) * .6;
    if (f.timer <= 0) { f.state = 'spin'; f.timer = 1.5; f.hitP = false; f.cdir = new THREE.Vector3(to.x, 0, to.z).normalize(); sfx.jump(); }
  } else if (f.state === 'spin') {
    const step = (rage ? 8.5 : 7.2) * dt, moved = moveBody(f, f.cdir.x * step, f.cdir.z * step);
    f.yaw += dt * 16; walking = true; arms = { L: [1.5, -1.2], R: [1.5, 1.2] };
    if (!f.hitP && dist < f.def.r + .8) { f.hitP = true; damagePlayer(f.pos, 'Kena putaran! Condong ke samping ↔️', true); }
    if (f.timer <= 0 || !moved || Math.hypot(f.pos.x, f.pos.z) > ARENA_R - 1.3) {
      f.state = 'dizzy'; f.timer = rage ? 1.7 : 2.3; sfx.poof(); debris.burst(center(f), 0xffffff, 14, 4);
      if (!f.toldDizzy) { f.toldDizzy = true; toast('Bos pusing — pukul sekarang! 💫 (2×)', 1500); }
    }
  } else if (f.state === 'dizzy') { if (f.timer <= 0) { f.state = 'chase'; f.cd = .9; } }
  else if (f.state === 'recover') { if (f.timer <= 0) { f.state = 'chase'; f.atkT = -1; f.cd = (rage ? 1.1 : 1.9) + Math.random() * .8; } }
  physicsY(f, dt);
  f.rig.stars.visible = f.state === 'dizzy';
  if (f.rig.stars.visible) f.rig.stars.rotation.y += dt * 5;
  f.speed += ((f.state === 'spin' ? 6 : walking ? f.def.speed * 1.6 : 0) - f.speed) * Math.min(1, dt * 8);
  animateHumanoid(f.rig, {
    speed: f.speed, onGround: f.onGround, hurt: f.hurtT / .3 * .4, windup, swing: f.atkT,
    arms: arms || (f.state === 'chase' ? { R: [.8, .05] } : null),
    headPitch: f.state === 'dizzy' ? Math.sin(f.timer * 9) * .3 : 0,
  }, dt);
}

// --- Bos Ratu Penyihir: melayang & berpindah tempat; rentetan bola sihir (TINJU = pantul balik, kena dia
//     sendiri → pusing), tiga lingkaran sihir (GESER/LOMPAT). Marah: memanggil 2 kelelawar. ---
function updateBossWitch(f, dt, to, dist) {
  const rage = f.hp <= f.maxHp / 2, q = rage ? .8 : 1;
  let arms = null, cast = 0;
  f.timer -= dt; f.cd -= dt;
  if (f.state !== 'dizzy') faceTo(f, to, 4, dt);
  bossRage(f, 'bat');
  if (f.state === 'intro') { arms = { L: [2.9, .3], R: [2.9, -.3] }; if (f.timer <= 0) { f.state = 'chase'; f.cd = 1.2; } }
  else if (f.state === 'chase') {
    f.orbit += dt * .3;
    const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw), want = dist > 9 ? 1 : dist < 5.5 ? -1 : 0, side = Math.sin(f.orbit) * .8;
    if (Math.hypot(f.pos.x, f.pos.z) < ARENA_R - 2 || want > 0) moveBody(f, (fx * want * 1.2 + fz * side) * dt, (fz * want * 1.2 - fx * side) * dt);
    if (f.cd <= 0) {
      if ((f.combo || 0) >= 2) { f.combo = 0; teleport(f, 6, 9); f.cd = .9; }
      else { f.combo = (f.combo || 0) + 1; f.last = f.last === 'orbs' ? (Math.random() < .75 ? 'runes' : 'orbs') : (Math.random() < .75 ? 'orbs' : 'runes'); bossAttack(f, f.last, q); }   // bergantian (kadang diulang)
    }
  } else if (f.state === 'orbsWind') {
    cast = clamp(1 - f.timer / f.wind, 0, 1); arms = { L: [2.3, .35], R: [2.3, -.35] };
    if (f.timer <= 0) { f.state = 'orbs'; f.n = rage ? 4 : 3; f.timer = 0; }
  } else if (f.state === 'orbs') {
    cast = 1; arms = { L: [1.6, .2], R: [1.6, -.2] };
    if (f.timer <= 0) { if (f.n-- > 0) { castOrb(f, (Math.random() - .5) * .5); f.timer = .45; } else { f.state = 'recover'; f.timer = .8; } }
  } else if (f.state === 'runesWind') {
    cast = clamp(1 - f.timer / f.wind, 0, 1); arms = { L: [2.95, .25], R: [2.95, -.25] };
    if (f.timer <= 0) {
      // satu tepat di kaki pemain + di depan & belakangnya: condong ke samping (atau lompat) selalu selamat
      rune(P.pos.x, P.pos.z, 1.5); rune(P.pos.x, P.pos.z - 2.7, 1.5); rune(P.pos.x, P.pos.z + 2.7, 1.5);
      sfx.magic(); f.state = 'recover'; f.timer = .9;
    }
  } else if (f.state === 'dizzy') { if (f.timer <= 0) { f.state = 'chase'; f.cd = .9; } }
  else if (f.state === 'recover') { if (f.timer <= 0) { f.state = 'chase'; f.cd = (rage ? 1.0 : 1.7) + Math.random() * .8; } }
  hover(f, dt, f.state === 'dizzy' ? 0 : .7);                                    // pusing: turun ke tanah, gampang dipukul
  f.rig.glow.emissiveIntensity += ((cast ? .5 + cast * 2.2 : .4) - f.rig.glow.emissiveIntensity) * Math.min(1, dt * 8);
  f.rig.stars.visible = f.state === 'dizzy';
  if (f.rig.stars.visible) f.rig.stars.rotation.y += dt * 5;
  animateHumanoid(f.rig, {
    speed: 0, onGround: true, hurt: f.hurtT / .3 * .4, arms: arms || { R: [.45, 0] },
    headPitch: f.state === 'dizzy' ? Math.sin(f.timer * 9) * .3 : 0,
  }, dt);
}

// --- Proyektil: panah, panah tulang, bola sihir; (ruang latihan) batang kayu & bola batu ---
// Tiap jenis punya cara menghindar yang jelas:
//   panah setinggi dada      → PERISAI, JONGKOK, atau CONDONG
//   bola sihir (mengejar)     → TINJU (memantul balik!) atau PERISAI
//   batang kayu (kepala)      → JONGKOK            bola batu (tanah) → LOMPAT atau CONDONG
const shots = [];
const SHOT = {
  arrow: { sp: 12, r: .3, vr: .12, label: 'Kena panah! Perisai, jongkok, atau condong 🏹' },
  bone: { sp: 10, r: .3, vr: .12, label: 'Kena panah tulang! Perisai atau jongkok 🛡️' },
  orb: { sp: 4.6, r: .4, vr: .2, label: 'Kena sihir! Tinju bolanya 👊' },
  log: { sp: 6, r: .3, vr: .15, wide: 2.1, hard: true, label: 'Kena kayu! Jongkok ya 🙇' },
  ball: { sp: 6.5, r: .45, vr: .45, hard: true, label: 'Kena batu! Lompat atau condong 🦘' },
};
function fire(kind, from, target, owner = null, drill = false) {
  const k = SHOT[kind];
  const mesh = kind === 'orb' ? makeOrb() : kind === 'log' ? makeLog() : kind === 'ball' ? makeBall() : makeArrow(kind === 'bone');
  const vel = new THREE.Vector3().subVectors(target, from);
  if (k.hard || kind === 'bone') vel.y = 0;
  vel.normalize().multiplyScalar(k.sp);
  const sh = { kind, k, mesh, pos: from.clone(), vel, owner, mine: false, life: kind === 'orb' ? 6 : 4, drill };
  mesh.position.copy(sh.pos);
  if (kind === 'log') mesh.rotation.y = Math.atan2(vel.x, vel.z);
  scene.add(mesh); shots.push(sh);
  return sh;
}
function removeShot(sh) { scene.remove(sh.mesh); const i = shots.indexOf(sh); if (i >= 0) shots.splice(i, 1); }
function reflectOrb(sh, dir) {
  sh.mine = true; sh.life = 2.5; sh.vel.copy(dir).setY(0).setLength(11); sh.mesh.scale.setScalar(1.4);
  sfx.block(); P.energy = Math.min(100, P.energy + 6);
  debris.burst(sh.pos.clone(), 0xd36bff, 12, 4, .1);
  if (!tipsShown.pantul) { tipsShown.pantul = 1; toast('PANTUL! ✨ Sihirnya balik ke penyihir', 1500); }
  if (sh.drill) { sh.drill = false; practiceResult(true, 'pantul'); }
}
function updateShots(dt) {
  if (!shots.length) return;
  const top = P.pos.y + (ctl.crouch && P.onGround ? 1.0 : 1.75);
  for (const sh of [...shots]) {
    sh.life -= dt;
    if (sh.kind === 'orb' && !sh.mine) {                     // mengejar pelan ke dada pemain
      tmp.set(P.pos.x, P.pos.y + (ctl.crouch ? .7 : 1.2), P.pos.z).sub(sh.pos).setLength(sh.k.sp);
      sh.vel.lerp(tmp, Math.min(1, dt * .9)).setLength(sh.k.sp);
    } else if (sh.mine && sh.owner && foes.includes(sh.owner)) {   // pantulan mencari si penyihir
      tmp.copy(center(sh.owner)).sub(sh.pos).setLength(11);
      sh.vel.lerp(tmp, Math.min(1, dt * 5)).setLength(11);
    }
    sh.pos.addScaledVector(sh.vel, dt);
    if (sh.kind === 'ball') { sh.pos.y = groundAt(sh.pos.x, sh.pos.z) + .45; sh.mesh.rotation.x -= dt * sh.k.sp / .45; sh.mesh.rotation.y = Math.atan2(sh.vel.x, sh.vel.z); }
    sh.mesh.position.copy(sh.pos);
    if (sh.kind === 'arrow' || sh.kind === 'bone') sh.mesh.lookAt(tmp.copy(sh.pos).sub(sh.vel));
    else if (sh.kind === 'orb') { sh.mesh.rotation.x += dt * 4; sh.mesh.rotation.y += dt * 5; }
    let done = sh.life <= 0 || (!sh.k.hard && sh.pos.y < groundAt(sh.pos.x, sh.pos.z)) || Math.hypot(sh.pos.x, sh.pos.z) > islandRadius;
    if (!done && sh.mine) {
      for (const f of foes) {
        if (center(f, tmp2).distanceTo(sh.pos) > f.def.r + .55) continue;
        hurtFoe(f, 2, sh.vel); done = true;
        if (f.type === 'bossWitch' && f.hp > 0) { f.state = 'dizzy'; f.timer = 2.2; toast('Kena sihirnya sendiri! Pukul sekarang 💫', 1500); }
        break;
      }
    } else if (!done && !sh.hit) {
      const dx = P.pos.x - sh.pos.x, dz = P.pos.z - sh.pos.z;
      let near;
      if (sh.k.wide) { const l = Math.hypot(sh.vel.x, sh.vel.z) || 1, ux = sh.vel.x / l, uz = sh.vel.z / l; near = Math.abs(dx * ux + dz * uz) < .4 && Math.abs(dx * uz - dz * ux) < sh.k.wide; }
      else near = Math.hypot(dx, dz) < sh.k.r + RADIUS;
      if (near && sh.pos.y - sh.k.vr < top && sh.pos.y + sh.k.vr > P.pos.y + .05) {
        sh.hit = true;
        const r = damagePlayer(tmp2.copy(sh.pos).addScaledVector(sh.vel, -.3), sh.k.label, !!sh.k.hard);
        if (r === 'blocked') { debris.burst(sh.pos.clone(), sh.kind === 'orb' ? 0xd36bff : 0xcfd8e3, 10, 3, .1); if (sh.drill) { sh.drill = false; practiceResult(true, 'perisai'); } }
        else if (sh.drill) { sh.drill = false; practiceResult(false); }
        done = true;
      } else if (sh.drill && Math.hypot(dx, dz) > 1.2 && dx * sh.vel.x + dz * sh.vel.z < 0) {
        // sudah lewat tanpa kena = berhasil menghindar
        sh.drill = false; practiceResult(true, ctl.crouch ? 'jongkok' : P.onGround ? 'menghindar' : 'lompat');
      }
    }
    if (done) { if (sh.drill) { sh.drill = false; practiceResult(true, 'menghindar'); } removeShot(sh); }
  }
}

// --- Lingkaran sihir di tanah: makin terang, lalu meledak. Keluar (condong) atau lompat. ---
const runes = [];
const runeRing = new THREE.RingGeometry(1.15, 1.32, 40), runeDisc = new THREE.CircleGeometry(1.15, 40);
function rune(x, z, delay = 1.4, drill = false) {
  const g = new THREE.Group();
  const ringM = new THREE.MeshBasicMaterial({ color: 0xd36bff, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false });
  const discM = new THREE.MeshBasicMaterial({ color: 0xb23cff, transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(runeRing, ringM), disc = new THREE.Mesh(runeDisc, discM);
  ring.rotation.x = disc.rotation.x = -Math.PI / 2; g.add(disc, ring);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(BOX1, ringM); b.scale.set(.5, .02, .08); const a = i / 4 * Math.PI * 2; b.position.set(Math.cos(a) * .7, .01, Math.sin(a) * .7); b.rotation.y = -a; g.add(b); }
  g.position.set(x, groundAt(x, z) + .07, z); scene.add(g);
  runes.push({ g, ringM, discM, x, z, t: delay, max: delay, drill });
}
const BOX1 = new THREE.BoxGeometry(1, 1, 1);
function updateRunes(dt) {
  for (const r of [...runes]) {
    r.t -= dt; const k = clamp(1 - r.t / r.max, 0, 1);
    r.discM.opacity = .12 + k * .5; r.g.rotation.y += dt * (1 + k * 5);
    if (r.t > 0) continue;
    debris.burst(tmp.set(r.x, groundAt(r.x, r.z) + .3, r.z), 0xd36bff, 18, 5, .14); sfx.poof();
    const inside = Math.hypot(P.pos.x - r.x, P.pos.z - r.z) < 1.32 && P.pos.y - groundAt(P.pos.x, P.pos.z) < .5;
    if (inside) damagePlayer(tmp.set(r.x, P.pos.y, r.z), 'Kena sihir! Geser keluar atau lompat ✨', true);
    if (r.drill) practiceResult(!inside, P.onGround ? 'geser' : 'lompat');
    scene.remove(r.g); r.ringM.dispose(); r.discM.dispose(); runes.splice(runes.indexOf(r), 1);
  }
}
function clearShots() {
  for (const sh of [...shots]) removeShot(sh);
  for (const r of runes) { scene.remove(r.g); r.ringM.dispose(); r.discM.dispose(); } runes.length = 0;
}

// ---------------------------------------------------------------------------
// Ruang latihan: membiasakan badan dengan gerakan tanpa takut kalah (nyawa tidak berkurang).
//   1) Kenali gerakan — semua gerakan dicoba sampai menyala
//   2) Tinju sasaran — tangan kiri/kanan sesuai perintah
//   3) Hindari serangan — panah, kayu, batu, gelombang, bola sihir, lingkaran sihir (satu per satu, pelan)
//   4) Lawan monster jinak — tiap jenis monster muncul satu per satu
// Latihan berikutnya mulai otomatis (pemain berdiri jauh dari layar, tidak perlu menekan tombol).
// ---------------------------------------------------------------------------
const MOVES = [
  { k: 'walk', i: '👣', n: 'Jalan', need: 10 }, { k: 'left', i: '⬅️', n: 'Condong kiri', need: 1 }, { k: 'right', i: '➡️', n: 'Condong kanan', need: 1 },
  { k: 'punchL', i: '👊', n: 'Tinju kiri', need: 3 }, { k: 'punchR', i: '👊', n: 'Tinju kanan', need: 3 }, { k: 'block', i: '🛡️', n: 'Perisai', need: 1 },
  { k: 'jump', i: '🦘', n: 'Lompat', need: 2 }, { k: 'crouch', i: '🙇', n: 'Jongkok', need: 2 }, { k: 'raise', i: '🙌', n: 'Tangan ke atas', need: 1 },
];
const DRILLS = [
  { id: 'moves', title: 'Kenali gerakan', task: 'Coba semua gerakan di bawah sampai menyala hijau ✅' },
  { id: 'punch', title: 'Tinju sasaran', need: 12 },
  { id: 'dodge', title: 'Hindari serangan', need: 8 },
  { id: 'spar', title: 'Lawan monster jinak', need: 6 },
];
const HAZ = {
  arrow: '🏹 Panah datang! PERISAI, JONGKOK, atau CONDONG', log: '🪵 Kayu setinggi kepala — JONGKOK!',
  ball: '🪨 Batu menggelinding — LOMPAT atau CONDONG!', shock: '💥 Gelombang di tanah — LOMPAT!',
  orb: '🔮 Bola sihir — TINJU untuk memantulkannya!', rune: '✨ Lingkaran sihir di kakimu — GESER keluar atau LOMPAT!',
};
const HAZ_ORDER = ['arrow', 'log', 'ball', 'shock', 'orb', 'rune'];
const SPAR = ['slime', 'brute', 'skel', 'archer', 'bat', 'witch'];
const SPAR_NAME = { slime: 'Slime 🟩', brute: 'Monster kotak 👾', skel: 'Tengkorak pedang 💀', archer: 'Tengkorak pemanah 🏹', bat: 'Kelelawar 🦇', witch: 'Penyihir 🔮' };
const SPAR_TIP = { slime: 'Tinju saat dia mendekat', brute: 'Dia gemetar = mau memukul → PERISAI', skel: FOE_TIPS.skel, archer: FOE_TIPS.archer, bat: 'Menukik → JONGKOK, lalu tinju', witch: FOE_TIPS.witch };
const drillId = () => (state.mode === 'practice' && state.practice ? DRILLS[state.practice.i].id : '');
ui.prMoves.innerHTML = MOVES.map((m) => `<div class="mv" data-k="${m.k}"><i>${m.i}</i><b>${m.n}</b><small>0/${m.need}</small></div>`).join('');
const moveEls = Object.fromEntries([...ui.prMoves.children].map((el) => [el.dataset.k, el]));

function beginPractice() {
  resetGame();
  ui.start.hidden = ui.calib.hidden = ui.over.hidden = true; ui.hud.hidden = false; ui.practice.hidden = false; ui.hud.classList.add('practice');
  ui.reticle.hidden = arena(); ui.touch.hidden = !(matchMedia('(pointer: coarse)').matches && ctl.source !== 'pose');
  music.stop(.05); music.start(); sfx.ready();
  state.mode = 'practice';
  state.practice = { i: 0, cnt: {}, done: 0, steps0: stats.steps, jumps0: stats.jumps, crouch0: stats.crouches };
  toast('Ruang latihan 🥋 — santai saja, nyawa tidak berkurang', 2200);
  startDrill(0);
}
function startDrill(i) {
  const pr = state.practice;
  for (const f of [...foes]) removeFoe(f);
  for (const f of [...dying]) removeFoe(f);
  clearShots(); dummy.root.visible = false;
  Object.assign(pr, { i, score: 0, tries: 0, fin: false, t: 0, round: null, wait: 1.2, want: 'L', active: false, haz: 0 });
  if (i === 0) Object.assign(pr, { cnt: {}, steps0: stats.steps, jumps0: stats.jumps, crouch0: stats.crouches });
  const d = DRILLS[i];
  if (d.id === 'punch' || d.id === 'dodge') {
    // orang-orangan: sasaran tinju, atau "pelatih" yang melempar serangan dari kejauhan
    const fwd = arena() ? tmp.set(0, 0, -1) : tmp.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    const far = d.id === 'dodge' ? 8.5 : 2.6;
    let x = P.pos.x + fwd.x * far, z = P.pos.z + fwd.z * far;
    if (Math.hypot(x, z) > ARENA_R - 1) { P.pos.set(0, groundAt(0, 4), 4); x = fwd.x * far; z = 4 + fwd.z * far; }
    dummy.root.position.set(x, groundAt(x, z), z); dummy.root.rotation.y = Math.atan2(P.pos.x - x, P.pos.z - z) + Math.PI; dummy.root.visible = true;
  }
  if (d.id === 'spar') pr.queue = [...SPAR];
  setText(ui.prStep, `${i + 1}/${DRILLS.length}`); setText(ui.prTitle, d.title);
  sfx.wave(); renderDrill();
}
function renderDrill() {
  const pr = state.practice, d = DRILLS[pr.i];
  let task = d.task || '', prog = 0, score = '';
  if (d.id === 'moves') { const n = MOVES.filter((m) => moveCount(m.k) >= m.need).length; prog = n / MOVES.length; score = `${n}/${MOVES.length}`; }
  else if (d.id === 'punch') { task = pr.want === 'L' ? 'Tinju pakai tangan KIRI 👊⬅️' : pr.want === 'R' ? 'Tinju pakai tangan KANAN ➡️👊' : 'Tinju cepat kiri-kanan! 👊👊'; prog = pr.score / d.need; score = `${pr.score}/${d.need}`; }
  else if (d.id === 'dodge') { task = pr.round ? HAZ[pr.round.kind] : 'Bersiap… pelatih akan melempar serangan 👀'; prog = pr.score / d.need; score = `${pr.score}/${d.need}`; }
  else if (d.id === 'spar') { const t = pr.cur; task = t ? `${SPAR_NAME[t]}: ${SPAR_TIP[t]}` : 'Monster berikutnya datang…'; prog = pr.score / d.need; score = `${pr.score}/${d.need}`; }
  if (pr.fin) task = pr.i < DRILLS.length - 1 ? 'Hebat! Latihan berikutnya sebentar lagi… ⭐' : 'Semua latihan selesai! Badanmu sudah siap bertarung 💪 Tekan ✔ Selesai, atau ulangi.';
  ui.prTask.textContent = task; setText(ui.prScore, score); setStyle(ui.prBar, 'width', `${Math.round(Math.min(1, prog) * 100)}%`);
}
function moveCount(k) {
  const pr = state.practice;
  if (k === 'walk') return ctl.source === 'pose' ? stats.steps - pr.steps0 : pr.cnt.walk || 0;   // tanpa kamera: 2 per detik berjalan
  if (k === 'jump') return stats.jumps - pr.jumps0;
  if (k === 'crouch') return stats.crouches - pr.crouch0;
  return pr.cnt[k] || 0;
}
function practiceMove(k) { const pr = state.practice; pr.cnt[k] = (pr.cnt[k] || 0) + 1; const el = moveEls[k]; if (el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } }
function finishDrill() {
  const pr = state.practice; if (pr.fin) return;
  pr.fin = true; pr.t = 0; pr.done++; sfx.win(); toast(`${DRILLS[pr.i].title} — selesai! ⭐`, 1600); renderDrill();
}
function tickPractice(dt) {
  const pr = state.practice, d = DRILLS[pr.i];
  // lampu gerakan: menyala saat dilakukan, hijau kalau sudah cukup
  const lr = arena() ? ctl.side : ctl.turn;   // kamera: condong badan; keyboard/sentuh: belok
  const on = { walk: ctl.fwd > 0, left: lr > .3, right: lr < -.3, punchL: P.punchL > 0, punchR: P.punchR > 0, block: ctl.block, jump: !P.onGround, crouch: ctl.crouch, raise: ctl.source === 'pose' ? motion.st.raise : P.superFx > 0 };
  for (const k of ['left', 'right', 'block', 'raise']) if (on[k]) pr.cnt[k] = (pr.cnt[k] || 0) + dt;   // ditahan: detik
  if (on.walk && ctl.source !== 'pose') pr.cnt.walk = (pr.cnt.walk || 0) + dt * 2;
  for (const m of MOVES) {
    const el = moveEls[m.k], c = moveCount(m.k);
    setClass(el, 'on', !!on[m.k]); setClass(el, 'done', c >= m.need);
    setText(el.lastChild, c >= m.need ? '✓' : `${Math.floor(c)}/${m.need}`);
  }
  if (pr.fin) {
    pr.t += dt;
    if (pr.t > 2.8 && pr.i < DRILLS.length - 1) startDrill(pr.i + 1);
    return;
  }
  if (d.id === 'moves') { if (MOVES.every((m) => moveCount(m.k) >= m.need)) finishDrill(); else renderDrill(); }
  else if (d.id === 'dodge') {
    if (!pr.round) {
      pr.wait -= dt;
      if (pr.wait <= 0) {
        const kind = pr.haz < HAZ_ORDER.length ? HAZ_ORDER[pr.haz] : HAZ_ORDER[(Math.random() * HAZ_ORDER.length) | 0];
        pr.haz++; pr.round = { kind, t: 1.3 }; sfx.warn(); renderDrill();
      }
    } else if (pr.round.t > 0) {
      pr.round.t -= dt;
      if (pr.round.t <= 0) launchHazard(pr.round.kind);
    }
  } else if (d.id === 'spar') {
    if (pr.active && !foes.length && !dying.length) { pr.active = false; pr.cur = null; pr.score++; pr.wait = 1; sfx.check(); renderDrill(); if (pr.score >= d.need) finishDrill(); }
    else if (!pr.active && pr.queue.length) { pr.wait -= dt; if (pr.wait <= 0) { pr.cur = pr.queue.shift(); spawnFoe(pr.cur); pr.active = true; renderDrill(); } }
  }
}
function launchHazard(kind) {
  const d = dummy.root.position, g = groundAt(P.pos.x, P.pos.z);
  dummyWobble = .8; debris.burst(tmp.set(d.x, d.y + 1.3, d.z), 0xffffff, 8, 3, .1);
  const from = (y) => new THREE.Vector3(d.x, g + y, d.z), at = (y) => new THREE.Vector3(P.pos.x, g + y, P.pos.z);
  if (kind === 'arrow') { fire('arrow', from(1.25), at(1.25), null, true); sfx.arrow(); }
  else if (kind === 'log') { fire('log', from(1.45), at(1.45), null, true); sfx.swish(); }
  else if (kind === 'ball') { fire('ball', from(.45), at(.45), null, true); sfx.jump(); }
  else if (kind === 'orb') { fire('orb', from(1.5), at(1.2), null, true); sfx.magic(); }
  else if (kind === 'shock') { shockwave(tmp.set(P.pos.x + (d.x - P.pos.x) * .6, g, P.pos.z + (d.z - P.pos.z) * .6), true, true); sfx.slam(); }
  else if (kind === 'rune') { rune(P.pos.x, P.pos.z, 1.6, true); sfx.magic(); }
}
function practiceResult(ok, how) {
  const pr = state.practice;
  if (state.mode !== 'practice' || !pr || drillId() !== 'dodge' || !pr.round || pr.fin) return;
  pr.tries++;
  if (ok) { pr.score++; sfx.check(); toast(how ? `Berhasil (${how})! ✅` : 'Berhasil! ✅', 1000); }
  pr.round = null; pr.wait = 1.4; renderDrill();
  if (pr.score >= DRILLS[pr.i].need) finishDrill();
}
function practiceDummyHit(hand) {
  const pr = state.practice;
  if (drillId() !== 'punch' || pr.fin) return;
  if (pr.want !== 'any' && hand !== pr.want) { toast(pr.want === 'L' ? 'Tangan KIRI ya 🙂' : 'Tangan KANAN ya 🙂', 900); return; }
  pr.score++; sfx.check();
  pr.want = pr.score >= 8 ? 'any' : pr.score % 2 ? (pr.want === 'L' ? 'R' : 'L') : pr.want === 'L' ? 'R' : 'L';
  renderDrill();
  if (pr.score >= DRILLS[pr.i].need) { dummy.root.visible = false; debris.burst(dummy.root.position.clone().add(tmp.set(0, 1.3, 0)), 0xe8c34a, 24, 5); finishDrill(); }
}
function endPractice() {
  const pr = state.practice; if (!pr) return;
  const bonus = Math.floor((stats.steps) / 40) + pr.done * 3;
  if (bonus > 0) { wardrobe.gems += bonus; saveWardrobe(wardrobe); syncWallet(); setTimeout(() => toast(`Latihan bagus! 💎 +${bonus} untuk lemari`, 2200), 300); }
  state.practice = null;
}
$('pr-next').addEventListener('click', () => { if (state.mode !== 'practice') return; sfx.tick(); startDrill((state.practice.i + 1) % DRILLS.length); });
$('pr-prev').addEventListener('click', () => { if (state.mode !== 'practice') return; sfx.tick(); startDrill((state.practice.i + DRILLS.length - 1) % DRILLS.length); });
$('pr-exit').addEventListener('click', () => { if (state.mode === 'practice') goHome(); });

function updateWaves(dt) {
  for (const w of [...waves]) {
    w.life -= dt; w.pos.addScaledVector(w.dir, dt * 17);
    w.mesh.position.copy(w.pos); w.mesh.rotation.x += dt * 9; w.mesh.rotation.y += dt * 7;
    w.mesh.material.opacity = Math.max(0, w.life / .55) * .6; w.mesh.scale.setScalar(.32 + (.55 - w.life) * .5);
    let done = w.life <= 0;
    for (const sh of shots) if (sh.kind === 'orb' && !sh.mine && sh.pos.distanceTo(w.pos) < .85) { reflectOrb(sh, w.dir); done = true; break; }
    if (!done) for (const f of foes) {
      if (w.hit.has(f)) continue;
      if (center(f, tmp2).distanceTo(w.pos) < f.def.r + .45) { w.hit.add(f); hurtFoe(f, 1, w.dir); done = true; break; }
    }
    if (!done && dummy.root.visible && dummy.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)).distanceTo(w.pos) < .9) {
      dummyHits++; sfx.hit(); debris.burst(w.pos.clone(), 0xe8c34a, 8, 3); done = true;
      dummyWobble = 1;
      if (state.mode === 'practice') practiceDummyHit(w.hand);
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
    if (it.t > .5 && d < .8 && playing()) {
      if (it.kind === 'gem') { stats.gems++; wardrobe.gems++; saveWardrobe(wardrobe); state.score += 5; sfx.gem(); }
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
    // lemari terbuka di HP tegak: jagoan dinaikkan ke bagian atas layar supaya barang yang dicoba terlihat
    const shopUp = portrait && !ui.outfits.hidden;
    const d = shopUp ? 7.6 : portrait ? 7.8 : 5.6, h = portrait ? 1.2 : 1.6;
    camWant.set(P.pos.x + Math.sin(a) * d, P.pos.y + h + 1.0, P.pos.z + Math.cos(a) * d);
    if (!menuCamInit) { camPos.copy(camWant); menuCamInit = true; }
    camPos.lerp(camWant, Math.min(1, dt * 3));
    camera.position.copy(camPos);
    const side = portrait ? 0 : -2.0;                                // geser titik pandang ke kiri → jagoan tampak di kanan
    const rx = Math.cos(a), rz = -Math.sin(a);                        // vektor kanan kamera
    camLook.set(P.pos.x + rx * side, P.pos.y + (shopUp ? -3.6 : portrait ? -1.5 : 1.05), P.pos.z + rz * side);
    camera.lookAt(camLook); return;
  }
  menuCamInit = false;
  if (arena()) { arenaCamera(dt); return; }
  // kamera bahu yang agak tinggi: jagoan di bawah, monster di depan tetap terlihat di atas kepalanya
  const cp = .44 - ctl.look * .4;                         // dongak → kamera sedikit turun & melihat ke atas
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
  // terhalang pohon: maju agak cepat; mundur lagi pelan (tidak memompa maju-mundur)
  if (P.snapped) camPos.copy(want);
  else camPos.lerp(want, Math.min(1, dt * (camPos.distanceTo(target) > free ? 7 : 3)));
  P.snapped = false;
  camera.position.copy(camPos);
  camLook.set(target.x - bx * 8, target.y + ctl.look * 8 - .1, target.z - bz * 8);
  camera.lookAt(camLook);
}

// Kamera arena: arah TETAP (tidak pernah berputar = tidak memicu pusing), tinggi di belakang jagoan,
// mengikuti posisinya pelan-pelan. Dekat tepi selatan kamera naik & lebih tegak supaya pohon tidak menghalangi.
function arenaCamera(dt) {
  const portrait = innerHeight > innerWidth, south = clamp(P.pos.z / ARENA_R, 0, 1);
  // HP tegak: titik pandang lebih jauh ke depan → jagoan di sepertiga bawah, arena di depannya terlihat
  const back = (portrait ? 9.5 : 8.4) * (1 - south * .35), up = (portrait ? 7.2 : 6.6) + south * 3;
  camWant.set(P.pos.x, P.pos.y + up, P.pos.z + back);
  camPos.lerp(camWant, Math.min(1, dt * 3));
  camera.position.copy(camPos);
  camLook.set(P.pos.x, P.pos.y + .9, P.pos.z - (portrait ? 7 : 3));
  camera.lookAt(camLook);
}

// Kualitas menyesuaikan perangkat: kalau frame lambat terus, turunkan resolusi bertahap (juga di menu).
let slowSince = 0, fastSince = 0;
function adaptQuality(raw, now) {
  if (raw > .25 || document.hidden) return;
  frameTimes.push(raw); if (frameTimes.length < 60) return;
  frameTimes.sort((x, y) => x - y);
  const med = frameTimes[30]; frameTimes = [];
  const budget = playing() ? .021 : .04; // menu dibatasi 30 fps
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
  const rigs = [makeBrute(1), makeBrute(2), makeSlime(true), makeBat(), makeDummy(), makeSkeleton(), makeSkeleton({ archer: true }), makeWitch(), makeBoss(), makeSkeleton({ king: true }), makeWitch({ queen: true }), { root: makeArrow() }, { root: makeArrow(true) }, { root: makeOrb() }, { root: makeLog() }, { root: makeBall() }];
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
  const active = playing() || state.mode === 'calib';
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

if (DEBUG) window.__game = { state, P, stats, ctl, motion, foes, dying, items, hero, camera, handlePose, spawnFoe, spawnPoint, shocks, shots, runes, killFoe, hurtFoe, planWave, beginPractice, startDrill, fire, rune, shockwave, beginGame, startWave, renderer, scene, keys, punch, superSlam, endTutorial, wardrobe, gameOver, applyLook, setSource: (s) => (ctl.source = s) };
