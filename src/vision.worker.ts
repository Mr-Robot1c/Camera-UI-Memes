// Runs all MediaPipe inference off the main thread so the camera never stutters.
import { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

let face: FaceLandmarker | null = null, hand: HandLandmarker | null = null, pose: PoseLandmarker | null = null;

async function init(wasm: string, models: { face: string; hand: string; pose: string }) {
  const fileset = await FilesetResolver.forVisionTasks(wasm);
  const build = async (delegate: 'GPU' | 'CPU') => {
    face = await FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: models.face, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true });
    hand = await HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: models.hand, delegate }, runningMode: 'VIDEO', numHands: 2 });
    pose = await PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: models.pose, delegate }, runningMode: 'VIDEO', numPoses: 1 });
  };
  // GPU is much faster where the worker gets WebGL; fall back to CPU.
  try { await build('GPU'); } catch { face?.close(); hand?.close(); pose?.close(); face = hand = pose = null; await build('CPU'); }
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try { await init(msg.wasm, msg.models); self.postMessage({ type: 'ready' }); }
    catch (error) { console.error('vision worker init failed:', error); self.postMessage({ type: 'failed' }); }
    return;
  }
  if (msg.type !== 'frame') return;
  const bitmap = msg.bitmap as ImageBitmap;
  try {
    const f = face!.detectForVideo(bitmap, msg.t);
    const h = msg.wantHands ? hand!.detectForVideo(bitmap, msg.t) : null;
    const p = msg.wantPose ? pose!.detectForVideo(bitmap, msg.t) : null;
    self.postMessage({ type: 'result', t: msg.t, wantPose: !!msg.wantPose, face: f.faceLandmarks[0] ?? null, blend: f.faceBlendshapes?.[0]?.categories ?? [], hands: h ? h.landmarks : null, body: p ? p.landmarks[0] ?? null : null });
  } catch { self.postMessage({ type: 'error' }); }
  finally { bitmap.close(); }
};
