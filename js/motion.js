// Pembaca gerakan tubuh dari landmark MediaPipe Pose.
//   jalan di tempat (angkat lutut bergantian) -> jalan; cepat -> lari
//   toleh kiri/kanan -> belok;  dongak/tunduk -> lihat atas/bawah
//   dorong tangan ke depan cepat -> tinju (kiri/kanan)
//   kedua tangan di depan wajah -> perisai;  kedua tangan ke atas -> jurus super
//   lompat sungguhan -> lompat;  jongkok -> merunduk
// Fungsi di sini murni (tanpa DOM) supaya bisa diuji dengan landmark buatan.

const L = { nose: 0, earL: 7, earR: 8, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16, hipL: 23, hipR: 24, kneeL: 25, kneeR: 26 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createMotion() {
  const st = {
    ok: false, others: 0, kneesVisible: true,
    // hasil
    steps: 0, stepRate: 0, moving: false, run: false, kneeL: 0, kneeR: 0,
    turn: 0, look: 0, block: false, crouch: false, raise: false, raiseHeld: 0,
    // dasar kalibrasi
    base: null,
  };
  // status internal
  const arm = { L: true, R: true };
  const kneeArm = { L: true, R: true };
  const prevW = { L: null, R: null };         // posisi pergelangan sebelumnya (2D, satuan torso)
  const prevReach = { L: 0, R: 0 };
  const lastPunch = { L: -1e9, R: -1e9 };
  let lastT = 0, stepTimes = [], lastStepSide = '', jumpArmed = true, crouchSince = 0, track = null, lostSince = 0;
  let calib = [];

  const aspectOf = (o) => o.aspect || 4 / 3;

  /** Ukuran-ukuran dasar dari satu set landmark 2D (koordinat ternormalisasi). */
  function measure(lm, aspect) {
    const P = (i) => lm[i];
    const sx = (P(L.shL).x + P(L.shR).x) / 2, sy = (P(L.shL).y + P(L.shR).y) / 2;
    const hx = (P(L.hipL).x + P(L.hipR).x) / 2, hy = (P(L.hipL).y + P(L.hipR).y) / 2;
    const T = Math.max(.05, Math.hypot((sx - hx) * aspect, sy - hy));
    const ex = (P(L.earL).x + P(L.earR).x) / 2, ey = (P(L.earL).y + P(L.earR).y) / 2;
    const earD = Math.max(.01, Math.hypot((P(L.earL).x - P(L.earR).x) * aspect, P(L.earL).y - P(L.earR).y));
    const vis = (i) => (P(i).visibility === undefined ? 1 : P(i).visibility);
    return {
      T, sx, sy, hx, hy, ex, ey, earD,
      sw: Math.abs(P(L.shL).x - P(L.shR).x) * aspect,
      yaw: (P(L.nose).x - ex) * aspect / earD,        // + = menoleh ke KIRI pemain (gambar tidak dicermin)
      pitch: (ey - P(L.nose).y) / earD,               // + = mendongak
      kL: (P(L.kneeL).y - P(L.hipL).y) / T,           // jarak vertikal lutut di bawah pinggul
      kR: (P(L.kneeR).y - P(L.hipR).y) / T,
      kneesVisible: vis(L.kneeL) > .45 && vis(L.kneeR) > .45,
    };
  }

  // --- kunci pemain: abaikan orang lain yang lewat (sama seperti Bolu Lari) ---
  const bodyOf = (lm) => ({ x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2, sw: Math.hypot(lm[11].x - lm[12].x, lm[11].y - lm[12].y) });
  function pick(all, now) {
    if (!track) {
      let best = -1, bs = -Infinity;
      all.forEach((lm, i) => { const f = bodyOf(lm), sc = f.sw - Math.abs(f.x - .5) * .25; if (sc > bs) { bs = sc; best = i; } });
      if (best >= 0) { track = bodyOf(all[best]); lostSince = 0; }
      return best;
    }
    let best = -1, bc = Infinity;
    all.forEach((lm, i) => {
      const f = bodyOf(lm), ratio = f.sw / track.sw;
      if (ratio < .6 || ratio > 1.6) return;
      const c = Math.hypot(f.x - track.x, f.y - track.y);
      if (c < bc) { bc = c; best = i; }
    });
    if (best >= 0 && bc < (lostSince ? .22 : .14)) {
      const f = bodyOf(all[best]); track.x = f.x; track.y = f.y; track.sw += (f.sw - track.sw) * .1; lostSince = 0;
      return best;
    }
    if (!lostSince) lostSince = now;
    return -1;
  }

  /**
   * Proses satu frame. `all` = landmark 2D semua orang, `allWorld` = landmark dunia (meter) atau [].
   * Mengembalikan event frame ini: { step, punchL, punchR, jump } (boolean).
   */
  function process(all, allWorld, now, opts = {}) {
    const ev = { step: false, punchL: false, punchR: false, jump: false };
    const i = pick(all, now);
    st.others = all.length - (i >= 0 ? 1 : 0);
    if (i < 0) { st.ok = false; st.moving = false; st.block = false; st.crouch = false; st.turn = 0; return ev; }
    const lm = all[i], wl = allWorld[i] || null, aspect = aspectOf(opts);
    const m = measure(lm, aspect);
    st.ok = true; st.kneesVisible = m.kneesVisible;
    const dt = lastT ? clamp((now - lastT) / 1000, 1 / 120, .2) : 1 / 30; lastT = now;

    if (opts.calibrating) { calib.push(m); return ev; }
    const B = st.base || { T: m.T, hy: m.hy, kL: .95, kR: .95, yaw: 0, pitch: 0 };
    const T = m.T;

    // 1) langkah: lutut naik (jarak lutut-pinggul mengecil) bergantian
    const liftOf = (k, base) => clamp((base - k) / (base * .55), 0, 1.2);
    st.kneeL = m.kneesVisible ? liftOf(m.kL, B.kL) : 0;
    st.kneeR = m.kneesVisible ? liftOf(m.kR, B.kR) : 0;
    for (const side of ['L', 'R']) {
      const v = side === 'L' ? st.kneeL : st.kneeR, other = side === 'L' ? st.kneeR : st.kneeL;
      // dua lutut naik bersamaan = jongkok/lompat, bukan langkah
      if (kneeArm[side] && v > .32 && other < .22) {
        kneeArm[side] = false;
        // lutut yang sama berturut-turut tetap dihitung, tapi minimal 0.18 dtk antarlangkah
        if (now - (stepTimes[stepTimes.length - 1] || 0) > 180) { stepTimes.push(now); st.steps++; lastStepSide = side; ev.step = true; }
      } else if (!kneeArm[side] && v < .14) kneeArm[side] = true;
    }
    stepTimes = stepTimes.filter((t) => now - t < 2000);
    const recent = stepTimes.filter((t) => now - t < 1500).length;
    st.stepRate = recent / 1.5;
    st.moving = stepTimes.length > 0 && now - stepTimes[stepTimes.length - 1] < 800;
    st.run = st.moving && st.stepRate >= 2.6;

    // 2) kepala: belok (laju) dan lihat atas/bawah (sudut)
    const yaw = m.yaw - B.yaw;
    const dz = .1, full = .42;
    st.turn = Math.abs(yaw) < dz ? 0 : clamp((Math.abs(yaw) - dz) / (full - dz), 0, 1) * Math.sign(yaw);
    const pitch = m.pitch - B.pitch;
    const target = Math.abs(pitch) < .07 ? 0 : clamp((pitch - Math.sign(pitch) * .07) / .32, -.6, 1);
    st.look += (target - st.look) * Math.min(1, dt * 8);

    // 3) tangan
    const wrist = (side) => lm[side === 'L' ? L.wrL : L.wrR];
    const shoulder = (side) => lm[side === 'L' ? L.shL : L.shR];
    const nose = lm[L.nose];
    const nearFace = (w) => w.y < m.sy + T * .05 && w.y > nose.y - T * .55 && Math.abs(w.x - nose.x) * aspect < T * .6;
    st.block = nearFace(wrist('L')) && nearFace(wrist('R'));
    const above = (w) => w.y < nose.y - T * .25;
    st.raise = above(wrist('L')) && above(wrist('R')) && !st.block;
    st.raiseHeld = st.raise ? st.raiseHeld + dt : 0;

    for (const side of ['L', 'R']) {
      const w = wrist(side), s = shoulder(side);
      const wx = w.x * aspect / T, wy = w.y / T;
      let punched = false;
      // a) kedalaman dunia: tangan maju ke arah kamera dengan cepat
      if (wl) {
        const ww = wl[side === 'L' ? L.wrL : L.wrR], sw = wl[side === 'L' ? L.shL : L.shR];
        const reach = sw.z - ww.z;                          // + = tangan di depan bahu (lebih dekat ke kamera)
        const vel = (reach - prevReach[side]) / dt;
        prevReach[side] = reach;
        if (arm[side] && reach > .3 && vel > 1.3) punched = true;
        if (reach < .16) arm[side] = true;
      }
      // b) cadangan 2D: hentakan cepat menjauh dari bahu setinggi dada (pukulan samping / tinju miring)
      if (prevW[side]) {
        const vx = (wx - prevW[side][0]) / dt, vy = (wy - prevW[side][1]) / dt;
        const speed = Math.hypot(vx, vy);
        const dx = (w.x - s.x) * aspect / T, dy = (w.y - s.y) / T;
        const away = (vx * dx + vy * dy) / (Math.hypot(dx, dy) || 1);
        const chest = w.y > nose.y - T * .2 && w.y < m.hy;
        if (arm[side] && chest && speed > 3.2 && away > 2.2 && Math.hypot(dx, dy) > .55) punched = true;
        if (!wl && Math.hypot(dx, dy) < .45) arm[side] = true;
        if (!wl && speed < .6) arm[side] = true;
      }
      prevW[side] = [wx, wy];
      if (punched && now - lastPunch[side] > 260 && !st.block) {
        lastPunch[side] = now; arm[side] = false;
        if (side === 'L') ev.punchL = true; else ev.punchR = true;
      }
    }

    // 4) lompat & jongkok dari tinggi pinggul (relatif panjang badan)
    const up = (B.hy - m.hy) / T;
    if (jumpArmed && up > .2 && st.kneeL < .6 && st.kneeR < .6) { jumpArmed = false; ev.jump = true; }
    else if (!jumpArmed && up < .07) jumpArmed = true;
    const down = -up;
    if (down > .26) { if (!crouchSince) crouchSince = now; } else crouchSince = 0;
    st.crouch = !!crouchSince && now - crouchSince > 120;
    // pemain bergeser maju/mundur pelan-pelan: sesuaikan dasar saat tegak dan tidak melangkah besar
    if (Math.abs(up) < .08 && !st.moving && st.base) {
      st.base.hy += (m.hy - st.base.hy) * .02;
      st.base.T += (m.T - st.base.T) * .02;
    }
    return ev;
  }

  function startCalibration() { calib = []; track = null; lostSince = 0; }
  /** Ambil rata-rata pose tegak selama kalibrasi. Mengembalikan true kalau cukup data. */
  function finishCalibration() {
    if (calib.length < 8) return false;
    const avg = (k) => calib.reduce((s, m) => s + m[k], 0) / calib.length;
    st.base = { T: avg('T'), hy: avg('hy'), kL: Math.max(.5, avg('kL')), kR: Math.max(.5, avg('kR')), yaw: avg('yaw'), pitch: avg('pitch') };
    stepTimes = []; st.steps = 0; jumpArmed = true;
    return true;
  }
  function resetCounters() { st.steps = 0; stepTimes = []; }
  return { st, process, startCalibration, finishCalibration, resetCounters, get calibSamples() { return calib.length; }, get lostSince() { return lostSince; } };
}

/** Gambar kerangka di kanvas pratinjau. */
export function drawSkeleton(ctx, lm, W, H, color, width, dots) {
  ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineCap = 'round';
  const seg = (a, b) => { ctx.beginPath(); ctx.moveTo(lm[a].x * W, lm[a].y * H); ctx.lineTo(lm[b].x * W, lm[b].y * H); ctx.stroke(); };
  [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28]].forEach(([a, b]) => seg(a, b));
  if (!dots) return;
  ctx.fillStyle = '#ffd166';
  [0, 15, 16, 25, 26].forEach((i) => { ctx.beginPath(); ctx.arc(lm[i].x * W, lm[i].y * H, 6, 0, Math.PI * 2); ctx.fill(); });
}
