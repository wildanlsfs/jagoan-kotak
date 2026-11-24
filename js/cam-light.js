// cam-light.js — shared low-light helpers for webcam games (copy into each game; zero deps).
// 1) CAM_VIDEO: ask for 720p/30 (measured on the owner's cheap USB webcam: 640x480 fell to 15 fps, 720p held 30).
// 2) lowLightTune(track): ask the camera for continuous exposure + positive exposure compensation, only what it supports.
// 3) LightMeter: average brightness (0-255) of the live video, sampled cheaply, with a smoothed gain for pose frames.
// 4) brightFrame(): draws the video into a small reusable canvas with a brightness filter for the pose model ONLY
//    (the on-screen preview stays untouched). Falls back to the raw video when the picture is bright enough.

export const CAM_VIDEO = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, min: 15 },
  facingMode: 'user',
};

/** Best-effort exposure tuning. Never throws; returns the list of settings that were accepted. */
export async function lowLightTune(track) {
  const applied = [];
  if (!track || typeof track.getCapabilities !== 'function') return applied;
  let caps = {};
  try { caps = track.getCapabilities() || {}; } catch (_) { return applied; }
  const tryApply = async (name, advanced) => {
    try { await track.applyConstraints({ advanced: [advanced] }); applied.push(name); } catch (_) { /* unsupported on this camera */ }
  };
  if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) await tryApply('exposureMode', { exposureMode: 'continuous' });
  if (caps.exposureCompensation && typeof caps.exposureCompensation.max === 'number') {
    const { min, max } = caps.exposureCompensation;
    await tryApply('exposureCompensation', { exposureCompensation: Math.min(max, Math.max(min, 1)) });
  }
  if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) await tryApply('whiteBalanceMode', { whiteBalanceMode: 'continuous' });
  return applied;
}

export const LIGHT = { dark: 60, dim: 90, target: 115, maxGain: 1.8 };

export class LightMeter {
  constructor(video) {
    this.video = video;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 16; this.canvas.height = 12;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.avg = null;     // latest average luma 0-255 (null = unknown)
    this.gain = 1;       // smoothed brightness gain for pose frames, 1 = untouched
    this.at = 0;
  }
  /** Call every frame; it only reads pixels every ~500 ms. Returns the latest average (or null). */
  sample(nowMs = performance.now()) {
    if (nowMs - this.at < 500 || !this.video || this.video.readyState < 2) return this.avg;
    this.at = nowMs;
    try {
      this.ctx.drawImage(this.video, 0, 0, 16, 12);
      const d = this.ctx.getImageData(0, 0, 16, 12).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      this.avg = sum / (d.length / 4);
      const want = this.avg < LIGHT.target - 8 ? Math.min(LIGHT.maxGain, LIGHT.target / Math.max(this.avg, 20)) : 1;
      this.gain += (want - this.gain) * 0.35;
    } catch (_) { this.avg = null; }
    return this.avg;
  }
  /** 'dark' | 'dim' | 'ok' | 'unknown' */
  get level() {
    if (this.avg === null) return 'unknown';
    return this.avg < LIGHT.dark ? 'dark' : this.avg < LIGHT.dim ? 'dim' : 'ok';
  }
}

let _bf = null;
/** Pose-model input: the video brightened by `gain`, drawn at w x h. Returns the video itself when no boost is needed. */
export function brightFrame(video, gain, w = 320, h = 240) {
  if (!(gain > 1.06)) return video;
  if (!_bf) { _bf = document.createElement('canvas'); _bf.ctx = _bf.getContext('2d'); }
  if (_bf.width !== w || _bf.height !== h) { _bf.width = w; _bf.height = h; }
  if (!('filter' in _bf.ctx)) return video; // Safari: no canvas filter, keep raw frames
  _bf.ctx.filter = `brightness(${gain.toFixed(2)}) contrast(1.08)`;
  _bf.ctx.drawImage(video, 0, 0, w, h);
  return _bf;
}

export const DARK_HINT_ID = 'Ruangan terlalu gelap: nyalakan lampu di depanmu (bukan di belakang).';
export const DIM_HINT_ID = 'Agak redup: tambah cahaya dari depan supaya gerakan terbaca lebih mulus.';
