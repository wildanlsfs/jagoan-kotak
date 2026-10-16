// Pendeteksi pose MediaPipe di Web Worker (worker klasik, bukan modul: pustaka MediaPipe memuat
// skrip wasm-nya lewat importScripts). Deteksi berjalan di luar thread utama, jadi gambar game tetap
// mulus. Frame yang tersendat-sendat adalah salah satu pemicu pusing.
self.module = { exports: {} };
self.exports = self.module.exports;
// unpkg mengirim .cjs sebagai text/javascript; jsdelivr mengirimnya sebagai application/node (ditolak
// importScripts), jadi cadangannya diunduh manual lalu dijalankan di lingkup global.
try {
  importScripts('https://unpkg.com/@mediapipe/tasks-vision@0.10.14/vision_bundle.cjs');
} catch {
  const x = new XMLHttpRequest();
  x.open('GET', 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.cjs', false);
  x.send();
  (0, eval)(x.responseText);
}
const { FilesetResolver, PoseLandmarker } = self.module.exports;

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let landmarker = null;

const plain = (people) => people.map((pts) => pts.map((q) => ({ x: q.x, y: q.y, z: q.z, visibility: q.visibility })));

self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks(WASM);
      const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: 2 });
      try { landmarker = await PoseLandmarker.createFromOptions(files, opts('GPU')); }
      catch { landmarker = await PoseLandmarker.createFromOptions(files, opts('CPU')); }
      postMessage({ type: 'ready' });
    } catch (err) {
      postMessage({ type: 'error', message: String((err && err.message) || err) });
    }
  } else if (d.type === 'frame') {
    let res = null;
    try { res = landmarker.detectForVideo(d.bitmap, d.ts); } catch { /* frame dilewati */ }
    d.bitmap.close();
    postMessage({ type: 'pose', ts: d.ts, all: res ? plain(res.landmarks || []) : [], world: res ? plain(res.worldLandmarks || []) : [] });
  }
};
