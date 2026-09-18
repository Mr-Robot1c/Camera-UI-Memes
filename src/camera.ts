import { loadSprites } from './assets';
import { cameraPreferences, frameGeometry } from './framing';
import { makeFace, makeHand, makeBody, decide, PoseGate, collectBaseline, tongueScore, dist, type Baseline, type Face, type Hand, type Body, type Pose, type Point, type Landmark } from './recognition';

type VisionResult = { type: 'ready' } | { type: 'failed' } | { type: 'error' } | { type: 'result'; t: number; wantPose: boolean; face: Landmark[] | null; blend: { categoryName: string; score: number }[]; hands: Landmark[][] | null; body: Landmark[] | null };

// Face-mesh contours (MediaPipe indices): oval, eyes, outer lips, brows, nose.
const FACE_RINGS = [
  [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10],
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33],
  [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466, 263],
  [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61],
  [70, 63, 105, 66, 107],
  [336, 296, 334, 293, 300],
  [168, 6, 197, 195, 5, 4],
  [98, 97, 2, 326, 327],
];
export type CameraState = 'idle' | 'starting' | 'ready' | 'recording' | 'processing' | 'review';
export type Snapshot = { state: CameraState; model: 'idle' | 'loading' | 'ready' | 'failed'; message: string; notice: string; reaction: Pose | null; hasFace: boolean; seconds: number; calibration: number | null; calibrated: boolean; audio: boolean; facing: 'user' | 'environment'; progress: string; ratio: string; res: string; zoom: number };
export const initialSnapshot: Snapshot = { state: 'idle', model: 'idle', message: '', notice: '', reaction: null, hasFace: false, seconds: 0, calibration: null, calibrated: false, audio: true, facing: 'user', progress: '', ratio: '3:4', res: '', zoom: 1 };
export function supportedRecordingType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}
export function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was denied. Allow the camera in your browser settings and try again.';
  if (name === 'NotFoundError') return 'No camera found. Open the app on a phone or a device with a webcam.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera is busy. Close other apps using it and try again.';
  return error instanceof Error ? error.message : 'Could not open the camera. Please try again.';
}
export class MemeCamera {
  snapshot = { ...initialSnapshot };
  selected: Pose | null = null;
  blob: Blob | null = null;
  url = '';
  private video = document.createElement('video');
  private stream: MediaStream | null = null;
  private mic: MediaStream | null = null;
  private sprites: Awaited<ReturnType<typeof loadSprites>> | null = null;
  private spriteLoading: Promise<void> | null = null;
  private worker: Worker | null = null;
  private workerReady = false;
  private workerErrors = 0;
  private inFlight = false;
  private inFlightAt = 0;
  private lastResult = 0;
  private detectorsLoading: Promise<void> | null = null;
  private tongueScratch = document.createElement('canvas');
  private zoomLevel = 1;
  private feedRes = 0;
  private handPts: Point[][] = [];
  private handSkel: Point[][] = [];
  private face: Face | null = null;
  private lastFace: Face | null = null;
  private faceAt = 0;
  private hands: Hand[] = [];
  private body: Body | null = null;
  private baseline: Baseline | null = null;
  private samples: Face[] = [];
  private calibrationStart = 0;
  private gate = new PoseGate();
  private previousHands: Hand[] = [];
  private motion = 0;
  private raf = 0;
  private lastDraw = 0;
  private lastDetect = 0;
  private lastVideoTime = -1;
  private frame = 0;
  private recorder: MediaRecorder | null = null;
  private recordingStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private recordingStart = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;
  private micSequence = 0;
  private destroyed = false;
  private wakeLock: { release: () => Promise<void> } | null = null;

  constructor(private canvas: HTMLCanvasElement, private change: (s: Snapshot) => void) {
    canvas.width = 720; canvas.height = 960;
    this.video.muted = true; this.video.playsInline = true; this.video.autoplay = true;
    this.video.setAttribute('playsinline', ''); this.video.setAttribute('aria-hidden', 'true');
    this.video.className = 'capture-source'; document.body.append(this.video);
    try {
      const saved = JSON.parse(localStorage.getItem('itsgiving-baseline-v1') ?? 'null');
      if (saved?.version === 1 && saved.samples >= 30 && saved.mean && saved.sigma && Object.values(saved.mean).every(v => typeof v === 'number' && Number.isFinite(v)) && Object.values(saved.sigma).every(v => typeof v === 'number' && v > 0 && Number.isFinite(v))) this.baseline = saved;
    } catch { /* Storage may be disabled. */ }
    this.snapshot.calibrated = !!this.baseline;
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
  }
  private emit(update: Partial<Snapshot>) { if (this.destroyed) return; this.snapshot = { ...this.snapshot, ...update }; this.change({ ...this.snapshot }); }
  private async prepareSprites() {
    if (this.sprites) return;
    if (!this.spriteLoading) this.spriteLoading = loadSprites().then(s => { this.sprites = s; }).finally(() => { this.spriteLoading = null; });
    await this.spriteLoading;
  }
  private releaseCamera() {
    ++this.micSequence;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    this.mic?.getTracks().forEach(t => t.stop());
    this.stream = null; this.mic = null; this.video.pause(); this.video.srcObject = null;
    void this.wakeLock?.release().catch(() => {}); this.wakeLock = null;
  }
  async start(facing = this.snapshot.facing) {
    if (['starting', 'recording', 'processing'].includes(this.snapshot.state)) return;
    const seq = ++this.sequence;
    this.releaseCamera(); this.face = null; this.lastFace = null; this.hands = []; this.body = null; this.previousHands = []; this.gate = new PoseGate(); this.lastVideoTime = -1;
    this.zoomLevel = 1;
    this.emit({ state: 'starting', message: '', notice: '', facing, progress: 'Opening camera…', calibration: null, reaction: null, hasFace: false, zoom: 1 });
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('The camera needs HTTPS. Open the app using the link you were given.');
      // Ask for the camera's native 4:3 like the iPhone camera app; whatever
      // arrives, the canvas adopts its exact ratio, so nothing is cropped.
      // Ask for the largest 4:3 format: on iPhone that selects the widest
      // front-camera field of view (the native app's "zoomed out" framing).
      // No width/height constraints: on iOS they get matched against the
      // LANDSCAPE sensor modes and Safari then hands over a landscape feed
      // with the top and bottom of the picture cut away. A bare facingMode
      // request returns the portrait-oriented feed with the full frame.
      const video = cameraPreferences(facing);
      // The rear side has a real 0.5x: prefer the Ultra Wide camera there.
      if (facing === 'environment') {
        try {
          const ultra = (await navigator.mediaDevices.enumerateDevices()).find(d => d.kind === 'videoinput' && /ultra[ -]?wide/i.test(d.label));
          if (ultra) video.deviceId = { exact: ultra.deviceId };
        } catch { /* Labels may be unavailable. */ }
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false }).catch(error => {
        if (!video.deviceId) throw error;
        delete video.deviceId;
        return navigator.mediaDevices.getUserMedia({ video, audio: false });
      });
      if (seq !== this.sequence || this.destroyed) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; this.video.srcObject = stream;
      // Where the browser exposes native camera zoom, open at the widest
      // framing (the native camera app's "zoomed out" front view).
      try {
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { zoom?: { min: number } };
        if (caps.zoom && caps.zoom.min < 1) await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as unknown as MediaTrackConstraintSet] });
      } catch { /* Optional capability. */ }
      stream.getVideoTracks()[0].onended = () => {
        if (this.snapshot.state === 'recording') this.stopRecording();
        this.releaseCamera();
        this.emit({ ...(this.snapshot.state === 'processing' ? {} : { state: 'idle' as const }), message: 'The camera was disconnected. Open it again to continue.' });
      };
      await this.video.play();
      this.adoptFeedShape();
      // Do NOT applyConstraints width/height on the live track: any sized
      // request flips iOS to a cropped landscape mode (verified on device).
      // Sharpness comes from the 720px canvas and the higher bitrate instead.
      this.emit({ progress: 'Loading memes…' }); await this.prepareSprites();
      if (seq !== this.sequence || this.destroyed) return;
      if (this.snapshot.audio) await this.acquireMic(seq);
      if (seq !== this.sequence || this.destroyed) return;
      this.emit({ state: 'ready', progress: '' });
      this.raf = requestAnimationFrame(this.draw);
      void this.loadDetectors();
    } catch (e) {
      if (seq !== this.sequence || this.destroyed) return;
      this.releaseCamera(); this.emit({ state: 'idle', message: cameraError(e), progress: '' });
    }
  }
  // Match the canvas to the camera's own aspect ratio (like a native camera
  // app) and size the inference canvas to a bounded copy of the feed.
  private adoptFeedShape() {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const ch = Math.round(720 * vh / vw);
    if (this.canvas.width !== 720 || this.canvas.height !== ch) { this.canvas.width = 720; this.canvas.height = ch; }
    this.feedRes = Math.max(vw, vh);
    const known: [number, string][] = [[3 / 4, '3:4'], [9 / 16, '9:16'], [4 / 3, '4:3'], [16 / 9, '16:9'], [1, '1:1']];
    const r = 720 / ch, hit = known.find(([k]) => Math.abs(r - k) < .02);
    this.emit({ ratio: hit ? hit[1] : `${Math.round(r * 100)}:100`, res: `${Math.max(vw, vh)}p` });
  }
  private async acquireMic(seq: number) {
    const micSeq = ++this.micSequence;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (seq !== this.sequence || micSeq !== this.micSequence || !this.snapshot.audio || this.destroyed) { mic.getTracks().forEach(t => t.stop()); return; }
      this.mic = mic;
      mic.getAudioTracks().forEach(t => { t.onended = () => this.emit({ audio: false, notice: 'The microphone was disconnected. Recording continues without sound.' }); });
    } catch { if (seq === this.sequence && micSeq === this.micSequence) this.emit({ audio: false, notice: 'Microphone access was denied. You can still record without sound.' }); }
  }
  async toggleAudio() {
    if (['recording', 'processing', 'starting'].includes(this.snapshot.state)) return;
    if (this.snapshot.audio) { ++this.micSequence; this.mic?.getTracks().forEach(t => t.stop()); this.mic = null; this.emit({ audio: false }); }
    else { this.emit({ audio: true, notice: '' }); if (this.stream) await this.acquireMic(this.sequence); }
  }
  async loadDetectors() {
    if (this.workerReady) return;
    if (this.detectorsLoading) return this.detectorsLoading;
    this.detectorsLoading = this.initializeWorker().finally(() => { this.detectorsLoading = null; });
    return this.detectorsLoading;
  }
  // All inference lives in a Web Worker so the camera never stutters: the main
  // thread only snapshots frames (createImageBitmap) and consumes landmarks.
  private initializeWorker() {
    this.emit({ model: 'loading', progress: 'Loading recognition…' });
    return new Promise<void>(resolve => {
      try {
        this.closeDetectors();
        // Classic worker on purpose: MediaPipe's WASM loader needs
        // importScripts, which module workers forbid.
        const worker = new Worker(new URL('./vision.worker.ts', import.meta.url));
        this.worker = worker;
        const abs = (p: string) => new URL(import.meta.env.BASE_URL + p, location.href).toString();
        worker.onmessage = e => { this.onVision(e.data as VisionResult); resolve(); };
        worker.onerror = () => { this.workerFailed(); resolve(); };
        worker.postMessage({ type: 'init', wasm: abs('wasm'), models: { face: abs('models/face_landmarker.task'), hand: abs('models/hand_landmarker.task'), pose: abs('models/pose_landmarker_lite.task') } });
      } catch { this.workerFailed(); resolve(); }
    });
  }
  private workerFailed() {
    this.closeDetectors();
    if (!this.destroyed) this.emit({ model: 'failed', progress: '', notice: 'Recognition failed to load. Pick a meme manually or try loading it again.' });
  }
  private closeDetectors() { this.worker?.terminate(); this.worker = null; this.workerReady = false; this.inFlight = false; }
  private onVision(msg: VisionResult) {
    if (this.destroyed) return;
    if (msg.type === 'ready') { this.workerReady = true; this.workerErrors = 0; this.emit({ model: 'ready', progress: '' }); return; }
    if (msg.type === 'failed') { this.workerFailed(); return; }
    if (msg.type === 'error') {
      this.inFlight = false;
      if (++this.workerErrors >= 3) { this.closeDetectors(); this.emit({ model: 'failed', calibration: null, notice: 'Recognition paused. Pick a meme manually or reload recognition.' }); }
      return;
    }
    this.inFlight = false; this.workerErrors = 0; this.applyResult(msg);
  }
  select(pose: Pose | null) { this.selected = pose; this.emit({ reaction: pose }); }
  // Digital zoom: crops the drawn frame, so it works on every camera and is
  // baked into the recording. Detection still sees the full frame.
  setZoom(zoom: number) {
    const level = Math.round(Math.min(3, Math.max(1, zoom)) * 100) / 100;
    if (level === this.zoomLevel) return;
    this.zoomLevel = level; this.emit({ zoom: level });
  }
  calibrate() {
    if (this.snapshot.state !== 'ready' || this.snapshot.model !== 'ready') return;
    this.samples = []; this.calibrationStart = performance.now(); this.emit({ calibration: 7, notice: 'Keep a neutral face and look straight ahead for 7 seconds.' });
  }
  private detect(now: number) {
    if (this.snapshot.model !== 'ready' || !this.worker || !this.workerReady) return;
    // A frame lost in transit must not stall detection forever.
    if (this.inFlight && now - this.inFlightAt > 4000) this.inFlight = false;
    if (this.inFlight || now - this.lastDetect < 100 || this.video.currentTime === this.lastVideoTime) return;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!vw || !vh) return;
    this.lastDetect = now; this.lastVideoTime = this.video.currentTime;
    this.frame++;
    // Manual mode still tracks the face, but skips expensive hand/body inference.
    const wantHands = !this.selected && this.snapshot.calibration === null;
    const wantPose = wantHands && this.frame % 2 === 0;
    this.inFlight = true; this.inFlightAt = now;
    const s = Math.min(1, 640 / Math.max(vw, vh));
    createImageBitmap(this.video, { resizeWidth: Math.round(vw * s), resizeHeight: Math.round(vh * s) })
      .then(bitmap => {
        if (this.destroyed || !this.worker || !this.workerReady) { bitmap.close(); this.inFlight = false; return; }
        this.worker.postMessage({ type: 'frame', bitmap, t: now, wantHands, wantPose }, [bitmap]);
      })
      .catch(() => { this.inFlight = false; });
  }
  // Landmarks come back normalized, so mapping them with the CURRENT video
  // dimensions stays correct even a frame or two later.
  private applyResult(msg: Extract<VisionResult, { type: 'result' }>) {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const now = msg.t;
    const elapsed = Math.max(33, now - this.lastResult); this.lastResult = now;
    this.face = msg.face ? makeFace(msg.face, msg.blend, vw, vh) : null;
    if (this.face) { this.lastFace = this.face; this.faceAt = now; }
    if (msg.hands) {
      this.hands = msg.hands.map(lm => makeHand(lm, vw, vh));
      this.handPts = msg.hands.map(lm => lm.map(l => [l.x * vw, l.y * vh] as Point));
      const moves = this.hands.flatMap(h => this.previousHands.length ? [Math.min(...this.previousHands.map(p => dist(h.palm, p.palm)))] : []);
      const fw = this.face?.w ?? 100;
      // Allow up to 1.5 face-widths of travel per tick — a waving hand
      // legitimately moves that far between results.
      const speed = Math.max(0, ...moves.filter(v => v < 1.5 * fw)) / fw * (33 / Math.max(33, elapsed * 2));
      this.motion = .8 * this.motion + .2 * speed; this.previousHands = this.hands;
    }
    if (msg.wantPose) this.body = msg.body ? makeBody(msg.body) : null;
    if (this.snapshot.calibration !== null) {
      const passed = (now - this.calibrationStart) / 1000;
      if (this.face && passed > 1.5) this.samples.push(this.face);
      if (passed >= 7) {
        const base = collectBaseline(this.samples);
        if (base && (base.mean.jawOpen ?? 0) <= .3) {
          this.baseline = base;
          let persisted = true;
          try { localStorage.setItem('itsgiving-baseline-v1', JSON.stringify(base)); } catch { persisted = false; }
          this.emit({ calibrated: true, calibration: null, notice: persisted ? 'Expressions calibrated.' : 'Calibrated for this session. Your browser blocked saving it.' });
        } else this.emit({ calibration: null, notice: 'Calibration failed. Keep your face in frame, mouth closed, and try again.' });
      } else this.emit({ calibration: Math.ceil(7 - passed) });
    }
    const tongue = this.face ? tongueScore(this.tongueScratch.getContext('2d', { willReadFrequently: true })!, this.video, vw, vh, this.face, this.hands) : 0;
    const reaction = this.selected ?? this.gate.update(decide(this.face, this.hands, this.body, tongue, this.motion, this.baseline), now);
    if (reaction !== this.snapshot.reaction || !!this.face !== this.snapshot.hasFace) this.emit({ reaction, hasFace: !!this.face });
  }
  private draw = (now: number) => {
    if (!this.stream || this.destroyed) return;
    this.raf = requestAnimationFrame(this.draw);
    if (now - this.lastDraw < 1000 / 24 || this.video.readyState < 2) return;
    this.lastDraw = now;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!vw || !vh) return;
    // Follow mid-stream dimension changes, but never resize the canvas while
    // a recording has locked its size.
    if (!['recording', 'processing'].includes(this.snapshot.state) && (this.canvas.height !== Math.round(720 * vh / vw) || this.feedRes !== Math.max(vw, vh))) this.adoptFeedShape();
    const ctx = this.canvas.getContext('2d')!, w = this.canvas.width, h = this.canvas.height;
    // At 1x every source pixel stays visible; only a deliberate zoom crops.
    const { scale, sw, sh, outW, outH } = frameGeometry(vw, vh, w, h, this.zoomLevel);
    ctx.save();
    if (outW < w - .5 || outH < h - .5) { ctx.fillStyle = '#111310'; ctx.fillRect(0, 0, w, h); }
    if (this.snapshot.facing === 'user') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(this.video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, (w - outW) / 2, (h - outH) / 2, outW, outH); ctx.restore();
    this.detect(now);
    if (this.snapshot.calibration !== null) return;
    const face = this.face ?? (now - this.faceAt < 800 ? this.lastFace : null);
    // Landmarks are in video-pixel space; map through the crop used above,
    // mirroring x for the front camera to match what's on screen.
    const mapX = (x: number) => { const px = (w - outW) / 2 + (x - (vw - sw) / 2) * scale; return this.snapshot.facing === 'user' ? w - px : px; };
    const mapYb = (y: number) => (h - outH) / 2 + (y - (vh - sh) / 2) * scale;
    // Face tracking contours (oval, eyes, lips): live preview only, never
    // baked into a recording.
    if (this.snapshot.state === 'ready' && this.face && this.face.pts.length > 468) {
      const pts = this.face.pts;
      ctx.save();
      // The dense mesh look: every landmark as a faint dot...
      ctx.fillStyle = 'rgba(190,242,100,.4)';
      for (const p of pts) ctx.fillRect(mapX(p[0]) - .75, mapYb(p[1]) - .75, 1.5, 1.5);
      // ...with the key contours drawn on top.
      ctx.strokeStyle = 'rgba(190,242,100,.6)'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      for (const ring of FACE_RINGS) {
        ctx.beginPath();
        ring.forEach((idx, i) => { const x = mapX(pts[idx][0]), y = mapYb(pts[idx][1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
      }
      ctx.restore();
    }
    // Full 21-point hand skeletons (auto mode, preview only): joints and
    // bones drawn over each detected hand make posing the hand memes easy.
    if (this.snapshot.state === 'ready' && !this.selected) {
      const targets = this.handPts.map(pts => pts.map(p => [mapX(p[0]), mapYb(p[1])] as Point));
      const prev = this.handSkel;
      this.handSkel = targets.map(t => {
        let best: Point[] | null = null, span = 200;
        for (const p of prev) { const d = Math.hypot(p[0][0] - t[0][0], p[0][1] - t[0][1]); if (d < span) { span = d; best = p; } }
        return best && best.length === t.length ? t.map((pt, i) => [best![i][0] + (pt[0] - best![i][0]) * .5, best![i][1] + (pt[1] - best![i][1]) * .5] as Point) : t;
      });
      const bones = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
      ctx.save(); ctx.strokeStyle = 'rgba(190,242,100,.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.fillStyle = 'rgba(190,242,100,.95)';
      for (const pts of this.handSkel) {
        ctx.beginPath();
        for (const [a, b] of bones) { ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(pts[b][0], pts[b][1]); }
        ctx.stroke();
        for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    } else this.handSkel = [];
    const pose = this.selected ?? this.snapshot.reaction;
    const sprite = pose ? this.sprites?.get(pose) : null;
    if (!sprite) return;
    const mapY = (y: number) => (h - outH) / 2 + (y - (vh - sh) / 2) * scale;
    const faceTop = face ? mapY(face.top[1]) : 0;
    let height = face ? Math.min(h * .55, Math.max(150, face.h * scale * 1.2)) : h * .36;
    // Keep the meme above the head: when the head sits high in a tight frame,
    // shrink the meme to the headroom instead of dropping it over the face.
    const room = face ? faceTop - 18 : h;
    if (face && room < height) height = Math.max(84, room);
    const width = height * sprite.width / sprite.height;
    const fit = Math.min(1, (w - 32) / width);
    const dw = width * fit, dh = height * fit;
    const cx = face ? mapX(face.center[0]) : w / 2;
    let x = Math.min(w - dw - 16, Math.max(16, cx - dw / 2));
    let top = face ? Math.max(12, faceTop - dh - 6) : h * .14;
    if (face && room < 84) {
      // No headroom at all: park the meme beside the face, never on it.
      const halfFace = face.w * scale * .75;
      x = cx < w / 2 ? Math.min(w - dw - 12, cx + halfFace) : Math.max(12, cx - halfFace - dw);
      top = Math.max(12, Math.min(h - dh - 12, mapY(face.center[1]) - dh / 2));
    }
    ctx.drawImage(sprite.frame(now), x, top, dw, dh);
  };
  startRecording() {
    if (this.snapshot.state !== 'ready' || this.snapshot.calibration !== null) return;
    const mimeType = supportedRecordingType();
    if (mimeType === null || typeof this.canvas.captureStream !== 'function') { this.emit({ message: 'This browser cannot record video. Update iOS and open the app in Safari.' }); return; }
    try {
      this.clearClip(); this.chunks = [];
      this.recordingStream = this.canvas.captureStream(24);
      if (this.snapshot.audio && this.mic) this.mic.getAudioTracks().forEach(t => this.recordingStream!.addTrack(t.clone()));
      this.recorder = new MediaRecorder(this.recordingStream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 4_500_000, audioBitsPerSecond: 128_000 });
      this.recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
      const recorder = this.recorder;
      recorder.onstop = () => {
        this.recordingStream?.getTracks().forEach(t => t.stop()); this.recordingStream = null;
        if (this.destroyed) return;
        const blob = new Blob(this.chunks, { type: recorder.mimeType || this.chunks[0]?.type || 'video/mp4' }); this.chunks = [];
        if (!blob.size) { this.emit({ state: this.stream ? 'ready' : 'idle', message: 'Nothing was recorded. Please record again.' }); return; }
        this.blob = blob; this.url = URL.createObjectURL(blob); this.releaseCamera(); this.emit({ state: 'review', calibration: null });
      };
      recorder.onerror = () => { this.emit({ message: 'Recording was interrupted. Check the clip you just made.' }); this.stopRecording(); };
      recorder.start(1000); this.recordingStart = performance.now();
      this.emit({ state: 'recording', seconds: 0, message: '', notice: '' });
      this.timer = setInterval(() => { const seconds = Math.floor((performance.now() - this.recordingStart) / 1000); this.emit({ seconds }); if (seconds >= 60) this.stopRecording(); }, 250);
      if ('wakeLock' in navigator) void navigator.wakeLock.request('screen').then(lock => { if (this.snapshot.state === 'recording') this.wakeLock = lock; else void lock.release(); }).catch(() => {});
    } catch { this.recordingStream?.getTracks().forEach(t => t.stop()); this.recordingStream = null; this.emit({ message: 'Could not start recording. Reopen the camera and try again.' }); }
  }
  stopRecording() {
    if (this.snapshot.state !== 'recording') return;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    this.emit({ state: 'processing' });
    void this.wakeLock?.release().catch(() => {}); this.wakeLock = null;
    if (this.recorder?.state !== 'inactive') this.recorder?.stop();
  }
  private clearClip() { if (this.url) URL.revokeObjectURL(this.url); this.url = ''; this.blob = null; }
  async retake() { if (this.snapshot.state !== 'review') return; this.clearClip(); await this.start(); }
  file() { return this.blob ? new File([this.blob], `meme-camera-${new Date().toISOString().replace(/[:.]/g, '-')}.${this.blob.type.includes('mp4') ? 'mp4' : 'webm'}`, { type: this.blob.type }) : null; }
  private onVisibility = () => { if (document.hidden) this.suspend(); };
  private onPageHide = () => this.suspend();
  private suspend() {
    ++this.sequence;
    const state = this.snapshot.state;
    if (state === 'recording') this.stopRecording();
    this.releaseCamera();
    if (['starting', 'ready', 'idle'].includes(state)) this.emit({ state: 'idle', calibration: null, notice: 'Camera paused. Tap to open the camera again.' });
  }
  destroy() {
    this.destroyed = true; ++this.sequence;
    document.removeEventListener('visibilitychange', this.onVisibility); window.removeEventListener('pagehide', this.onPageHide);
    if (this.timer) clearInterval(this.timer);
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recordingStream?.getTracks().forEach(t => t.stop()); this.releaseCamera(); this.closeDetectors(); this.clearClip(); this.video.remove();
  }
}
