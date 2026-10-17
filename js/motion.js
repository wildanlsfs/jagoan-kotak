// Pembaca gerakan tubuh dari landmark MediaPipe Pose.
//   jalan di tempat (angkat lutut bergantian) -> jalan; cepat -> lari
//   miringkan badan kiri/kanan -> geser kiri/kanan (mode arena; mata tetap ke layar)
//   (cadangan lama: toleh kepala -> belok;  dongak/tunduk -> lihat atas/bawah)
//   (lutut tidak terlihat? langkah dibaca dari goyangan naik-turun badan)
//   dorong tangan ke depan cepat -> tinju (kiri/kanan)
//   kedua tangan di depan wajah -> perisai;  kedua tangan ke atas -> jurus super
//   lompat sungguhan -> lompat;  jongkok -> merunduk
//   lengan & bahu pemain ditiru langsung oleh jagoan (hibrida: kaki tetap animasi game)
// Fungsi di sini murni (tanpa DOM) supaya bisa diuji dengan landmark buatan.

const L = { nose: 0, earL: 7, earR: 8, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16, hipL: 23, hipR: 24, kneeL: 25, kneeR: 26 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Filter One-Euro: halus saat diam (getaran hilang), cepat saat bergerak (tidak terasa telat). */
function oneEuro(minCut = 1.2, beta = .9, dCut = 1) {
  let x = null, dx = 0;
  const alpha = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
  return (v, dt) => {
    if (x === null) { x = v; return v; }
    dx += ((v - x) / dt - dx) * alpha(dCut, dt);
    x += (v - x) * alpha(minCut + beta * Math.abs(dx), dt);
    return x;
  };
}

export function createMotion() {
  const st = {
    ok: false, others: 0, kneesVisible: true,
    // hasil
    steps: 0, stepRate: 0, moving: false, run: false, kneeL: 0, kneeR: 0, bobSteps: false,
    turn: 0, side: 0, look: 0, block: false, crouch: false, raise: false, raiseHeld: 0,
    arms: null,                                 // { L: {x, z}, R: {x, z}, roll } sudut lengan & bahu untuk ditiru jagoan
    // dasar kalibrasi
    base: null,
  };
  // status internal
  const arm = { L: true, R: true };
  const kneeArm = { L: true, R: true };
  const prevW = { L: null, R: null };         // posisi pergelangan sebelumnya (2D, satuan torso)
  const hist = { L: [], R: [] };                // riwayat ~0.3 dtk: { t, reach } (meter, + = tangan di depan bahu)
  const peak = { L: 0, R: 0 };                  // jangkauan terjauh sejak tinju terakhir (untuk siap tinju lagi)
  const lastPunch = { L: -1e9, R: -1e9 };
  let blockSince = 0;
  let lastT = 0, stepTimes = [], lastStepSide = '', jumpArmed = true, crouchSince = 0, track = null, lostSince = 0;
  let calib = [];
  let leanS = 0;                                // kemiringan badan yang dihaluskan
  const bob = { fast: null, slow: 0, up: false }; // goyangan badan untuk langkah tanpa lutut
  const armF = { L: [oneEuro(), oneEuro(), oneEuro()], R: [oneEuro(), oneEuro(), oneEuro()], roll: oneEuro(1, .5) };
  const armSeen = { L: 0, R: 0 };               // 0..1, naik saat lengan terlihat jelas (transisi halus)

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
      lean: (sx - hx) * aspect / T,                   // + = bahu bergeser ke KIRI pemain (badan miring ke kiri)
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
    if (i < 0) { st.ok = false; st.moving = false; st.block = false; st.crouch = false; st.turn = 0; st.side = 0; st.arms = null; return ev; }
    const lm = all[i], wl = allWorld[i] || null, aspect = aspectOf(opts);
    const m = measure(lm, aspect);
    st.ok = true; st.kneesVisible = m.kneesVisible;
    const dt = lastT ? clamp((now - lastT) / 1000, 1 / 120, .2) : 1 / 30; lastT = now;

    if (opts.calibrating) { calib.push(m); return ev; }
    const B = st.base || { T: m.T, hy: m.hy, kL: .95, kR: .95, yaw: 0, pitch: 0, lean: 0 };
    const T = m.T;

    // 1) langkah: lutut naik (jarak lutut-pinggul mengecil) bergantian
    const liftOf = (k, base) => clamp((base - k) / (base * .55), 0, 1.2);
    st.kneeL = m.kneesVisible ? liftOf(m.kL, B.kL) : 0;
    st.kneeR = m.kneesVisible ? liftOf(m.kR, B.kR) : 0;
    for (const side of ['L', 'R']) {
      const v = side === 'L' ? st.kneeL : st.kneeR, other = side === 'L' ? st.kneeR : st.kneeL;
      // dua lutut naik bersamaan = jongkok/lompat, bukan langkah
      if (kneeArm[side] && v > .26 && other < .22) {
        kneeArm[side] = false;
        // lutut yang sama berturut-turut tetap dihitung, tapi minimal 0.18 dtk antarlangkah
        if (now - (stepTimes[stepTimes.length - 1] || 0) > 180) { stepTimes.push(now); st.steps++; lastStepSide = side; ev.step = true; }
      } else if (!kneeArm[side] && v < .12) kneeArm[side] = true;
    }
    // 1b) cadangan saat lutut tidak terlihat (HP terlalu dekat): tiap langkah di tempat membuat badan
    //     naik-turun sedikit. Ambil goyangan cepat bahu+pinggul dikurangi rata-rata lambatnya.
    st.bobSteps = !m.kneesVisible;
    const yMid = (m.sy + m.hy) / 2 / T;
    if (bob.fast === null) { bob.fast = bob.slow = yMid; }
    bob.fast += (yMid - bob.fast) * Math.min(1, dt * 14);
    bob.slow += (yMid - bob.slow) * Math.min(1, dt * 1.6);
    const hp = bob.fast - bob.slow;                                   // + = badan turun
    if (!m.kneesVisible) {
      if (!bob.up && hp < -.02) bob.up = true;                          // badan naik (lutut diangkat)…
      else if (bob.up && hp > .012) {                                  // …lalu turun lagi = satu langkah
        bob.up = false;
        if (now - (stepTimes[stepTimes.length - 1] || 0) > 220) { stepTimes.push(now); st.steps++; ev.step = true; }
      }
    } else bob.up = false;
    stepTimes = stepTimes.filter((t) => now - t < 2000);
    const recent = stepTimes.filter((t) => now - t < 1500).length;
    st.stepRate = recent / 1.5;
    st.moving = stepTimes.length > 0 && now - stepTimes[stepTimes.length - 1] < 1000;
    // jalan → lari dengan histeresis: mulai lari di ≥2.4 langkah/dtk, kembali jalan di <1.9 (tidak berkedip)
    st.run = st.moving && st.stepRate >= (st.run ? 1.9 : 2.4);

    // 2) kepala: belok (laju) dan lihat atas/bawah (sudut)
    //    belok bisa dengan menoleh ATAU memiringkan badan (mata tetap ke layar); hasilnya dijumlah
    const ramp = (v, dz, full) => (Math.abs(v) < dz ? 0 : clamp((Math.abs(v) - dz) / (full - dz), 0, 1) * Math.sign(v));
    const yaw = m.yaw - B.yaw;
    leanS += (m.lean - (B.lean || 0) - leanS) * Math.min(1, dt * 6);   // haluskan goyangan badan saat melangkah
    st.lean = leanS;
    st.turn = clamp(ramp(yaw, .1, .36) + ramp(leanS, .12, .3), -1, 1);
    st.side = ramp(leanS, .1, .26);                           // mode arena: hanya condong badan (kepala bebas melihat layar)
    const pitch = m.pitch - B.pitch;
    const target = Math.abs(pitch) < .1 ? 0 : clamp((pitch - Math.sign(pitch) * .1) / .3, -.6, 1);
    st.look += (target - st.look) * Math.min(1, dt * 4);      // pelan: getaran kepala tidak menggoyang kamera

    // 3) tangan
    //    Tinju lurus ke kamera hampir tidak bergerak di gambar 2D (pergelangan tetap di depan dagu), jadi
    //    dasarnya kedalaman 3D. Dua jebakan lama: (a) posisi kuda-kuda (kepalan di depan dagu) terbaca
    //    PERISAI dan menahan tinju; (b) tangan baru "siap" lagi kalau ditarik sangat dekat ke bahu.
    //    Sekarang: tinju = jangkauan bertambah cukup banyak dalam ~0.25 dtk (tahan frame rate rendah),
    //    siap lagi begitu tangan ditarik sedikit, dan tinju selalu menang atas perisai.
    const wrist = (side) => lm[side === 'L' ? L.wrL : L.wrR];
    const shoulder = (side) => lm[side === 'L' ? L.shL : L.shR];
    const nose = lm[L.nose];
    const nearFace = (w) => w.y < m.sy + T * .05 && w.y > nose.y - T * .55 && Math.abs(w.x - nose.x) * aspect < T * .6;
    const reachOf = (side) => (wl ? wl[side === 'L' ? L.shL : L.shR].z - wl[side === 'L' ? L.wrL : L.wrR].z : 0);

    for (const side of ['L', 'R']) {
      const w = wrist(side), s = shoulder(side);
      const wx = w.x * aspect / T, wy = w.y / T;
      let punched = false;
      // a) kedalaman dunia: jangkauan ≥ 22 cm & naik ≥ 8 cm dalam 0.25 dtk, tangan di depan bahu & setinggi dada
      if (wl) {
        const reach = reachOf(side), H = hist[side];
        H.push({ t: now, reach });
        while (H.length && now - H[0].t > 260) H.shift();
        const low = Math.min(...H.map((h) => h.reach));
        // setinggi dada/bahu (ayunan lengan saat jalan di tempat ada di dekat pinggul, bukan tinju)
        const high = wl[side === 'L' ? L.wrL : L.wrR].y - wl[side === 'L' ? L.shL : L.shR].y < .3;
        if (arm[side] && high && reach > .22 && reach - low > .08) punched = true;
        peak[side] = Math.max(peak[side], reach);
        if (!arm[side] && (reach < peak[side] - .07 || reach < .12)) arm[side] = true; // ditarik sedikit = siap lagi
      }
      // b) cadangan 2D: hentakan cepat menjauh dari bahu setinggi dada (pukulan samping / tinju miring)
      if (prevW[side]) {
        const vx = (wx - prevW[side][0]) / dt, vy = (wy - prevW[side][1]) / dt;
        const speed = Math.hypot(vx, vy);
        const dx = (w.x - s.x) * aspect / T, dy = (w.y - s.y) / T;
        const away = (vx * dx + vy * dy) / (Math.hypot(dx, dy) || 1);
        const chest = w.y > nose.y - T * .25 && w.y < m.sy + T * .65;
        if (arm[side] && chest && !nearFace(w) && speed > 2.3 && away > 1.5 && Math.hypot(dx, dy) > .5) punched = true; // bukan tangan naik ke kuda-kuda
        if (!wl && Math.hypot(dx, dy) < .45) arm[side] = true;
        if (!wl && speed < .6) arm[side] = true;
      }
      prevW[side] = [wx, wy];
      if (punched && now - lastPunch[side] > 240) {
        lastPunch[side] = now; arm[side] = false; peak[side] = reachOf(side);
        if (side === 'L') ev.punchL = true; else ev.punchR = true;
      }
    }

    // perisai: kedua tangan di depan wajah, TIDAK sedang terjulur, ditahan sebentar; batal oleh tinju
    const tucked = (side) => !wl || reachOf(side) < .2;
    const guard = nearFace(wrist('L')) && nearFace(wrist('R')) && tucked('L') && tucked('R');
    const sincePunch = now - Math.max(lastPunch.L, lastPunch.R);
    if (guard && sincePunch > 250) { if (!blockSince) blockSince = now; } else blockSince = 0;
    st.block = !!blockSince && now - blockSince > 110;
    const above = (w) => w.y < nose.y - T * .25;
    st.raise = above(wrist('L')) && above(wrist('R')) && !st.block;
    st.raiseHeld = st.raise ? st.raiseHeld + dt : 0;

    // 3b) tiru lengan: arah bahu→pergelangan diubah ke ruang jagoan (jagoan dilihat dari belakang, jadi
    //     lengan kiri pemain = lengan kiri jagoan di sisi kiri layar, seperti cermin).
    //     Landmark dunia: x+ = kiri pemain, y+ = bawah, z- = ke arah kamera (= depan jagoan).
    //     Jagoan: kiri = -x, atas = +y, depan = -z. Lengan berporos di bahu, menggantung ke -y:
    //     arah d = (sin z, -cos z·cos x, -cos z·sin x)  →  z = asin(dx), x = atan2(-dz, -dy).
    st.arms = mirrorArms(lm, wl, aspect, dt);

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

  function mirrorArms(lm, wl, aspect, dt) {
    const vis = (j) => (lm[j].visibility === undefined ? 1 : lm[j].visibility);
    const out = { L: null, R: null, roll: 0 };
    const pt = (j) => (wl ? wl[j] : { x: lm[j].x * aspect, y: lm[j].y, z: 0 }); // tanpa landmark dunia: 2D saja
    for (const side of ['L', 'R']) {
      const sI = side === 'L' ? L.shL : L.shR, eI = side === 'L' ? L.elL : L.elR, wI = side === 'L' ? L.wrL : L.wrR;
      const seen = vis(eI) > .5 && vis(wI) > .5;
      armSeen[side] = clamp(armSeen[side] + (seen ? dt * 4 : -dt * 3), 0, 1);
      if (!seen && !armSeen[side]) continue;
      if (seen) {
        const s = pt(sI), w = pt(wI);
        let dx = -(w.x - s.x), dy = -(w.y - s.y), dz = (w.z - s.z) * .85;   // kedalaman sedikit diredam (paling bergetar)
        const n = Math.hypot(dx, dy, dz) || 1;
        const f = armF[side];
        dx = f[0](dx / n, dt); dy = f[1](dy / n, dt); dz = f[2](dz / n, dt);
        const m = Math.hypot(dx, dy, dz) || 1; dx /= m; dy /= m; dz /= m;
        let x = Math.atan2(-dz, -dy);
        if (x < -Math.PI / 2) x += Math.PI * 2;                               // tangan lurus ke atas: jangan melompat dari +π ke -π
        armSeen[side + 'v'] = { x, z: Math.asin(clamp(dx, -1, 1)) };
      }
      if (armSeen[side + 'v']) out[side] = { ...armSeen[side + 'v'], w: armSeen[side] };
    }
    if (vis(L.shL) > .5 && vis(L.shR) > .5) {
      const a = pt(L.shL), b = pt(L.shR);
      out.roll = armF.roll(clamp(Math.atan2(-(b.y - a.y), -(b.x - a.x)), -.5, .5), dt); // + = bahu kanan lebih tinggi
    }
    return out.L || out.R ? out : null;
  }

  function startCalibration() { calib = []; track = null; lostSince = 0; }
  /** Ambil rata-rata pose tegak selama kalibrasi. Mengembalikan true kalau cukup data. */
  function finishCalibration() {
    if (calib.length < 8) return false;
    const avg = (k) => calib.reduce((s, m) => s + m[k], 0) / calib.length;
    const kv = calib.filter((m) => m.kneesVisible);                       // lutut boleh tidak terlihat (mode goyangan badan)
    const kavg = (k) => (kv.length ? kv.reduce((s, m) => s + m[k], 0) / kv.length : .95);
    st.base = { T: avg('T'), hy: avg('hy'), kL: Math.max(.5, kavg('kL')), kR: Math.max(.5, kavg('kR')), yaw: avg('yaw'), pitch: avg('pitch'), lean: avg('lean') };
    leanS = 0; bob.fast = null;
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
