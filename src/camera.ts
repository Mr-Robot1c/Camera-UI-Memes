import type { FaceLandmarker, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { loadSprites } from './assets';
import { makeFace, makeHand, makeBody, decide, PoseGate, collectBaseline, tongueScore, dist, type Baseline, type Face, type Hand, type Body, type Pose } from './recognition';

export type CameraState = 'idle' | 'starting' | 'ready' | 'recording' | 'processing' | 'review';
export type Snapshot = { state: CameraState; model: 'idle' | 'loading' | 'ready' | 'failed'; message: string; notice: string; reaction: Pose | null; hasFace: boolean; seconds: number; calibration: number | null; calibrated: boolean; audio: boolean; facing: 'user' | 'environment'; progress: string };
export const initialSnapshot: Snapshot = { state: 'idle', model: 'idle', message: '', notice: '', reaction: null, hasFace: false, seconds: 0, calibration: null, calibrated: false, audio: true, facing: 'user', progress: '' };
export function supportedRecordingType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}
export function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Chưa được phép dùng camera. Cho phép camera trong cài đặt trang web rồi thử lại.';
  if (name === 'NotFoundError') return 'Không tìm thấy camera. Hãy mở app trên điện thoại hoặc máy có webcam.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'Camera đang bận. Đóng ứng dụng dùng camera rồi thử lại.';
  return error instanceof Error ? error.message : 'Không mở được camera. Hãy thử lại.';
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
  private faceDetector: FaceLandmarker | null = null;
  private handDetector: HandLandmarker | null = null;
  private poseDetector: PoseLandmarker | null = null;
  private detectorsLoading: Promise<void> | null = null;
  private inference = document.createElement('canvas');
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
    canvas.width = 540; canvas.height = 960;
    this.inference.width = 270; this.inference.height = 480;
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
    this.emit({ state: 'starting', message: '', notice: '', facing, progress: 'Đang mở camera…', calibration: null, reaction: null, hasFace: false });
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera cần đường dẫn HTTPS. Hãy mở app bằng đường dẫn đã được cung cấp.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 24, max: 30 } }, audio: false });
      if (seq !== this.sequence || this.destroyed) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; this.video.srcObject = stream;
      stream.getVideoTracks()[0].onended = () => {
        if (this.snapshot.state === 'recording') this.stopRecording();
        this.releaseCamera();
        this.emit({ ...(this.snapshot.state === 'processing' ? {} : { state: 'idle' as const }), message: 'Camera đã ngắt kết nối. Mở lại camera để tiếp tục.' });
      };
      await this.video.play();
      this.emit({ progress: 'Đang tải meme…' }); await this.prepareSprites();
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
  private async acquireMic(seq: number) {
    const micSeq = ++this.micSequence;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (seq !== this.sequence || micSeq !== this.micSequence || !this.snapshot.audio || this.destroyed) { mic.getTracks().forEach(t => t.stop()); return; }
      this.mic = mic;
      mic.getAudioTracks().forEach(t => { t.onended = () => this.emit({ audio: false, notice: 'Micro đã ngắt kết nối. Video tiếp tục không có tiếng.' }); });
    } catch { if (seq === this.sequence && micSeq === this.micSequence) this.emit({ audio: false, notice: 'Micro chưa được cho phép. Bạn vẫn có thể quay không tiếng.' }); }
  }
  async toggleAudio() {
    if (['recording', 'processing', 'starting'].includes(this.snapshot.state)) return;
    if (this.snapshot.audio) { ++this.micSequence; this.mic?.getTracks().forEach(t => t.stop()); this.mic = null; this.emit({ audio: false }); }
    else { this.emit({ audio: true, notice: '' }); if (this.stream) await this.acquireMic(this.sequence); }
  }
  async loadDetectors() {
    if (this.faceDetector && this.handDetector && this.poseDetector) return;
    if (this.detectorsLoading) return this.detectorsLoading;
    this.detectorsLoading = this.initializeDetectors().finally(() => { this.detectorsLoading = null; });
    return this.detectorsLoading;
  }
  private async initializeDetectors() {
    this.emit({ model: 'loading', progress: 'Đang tải nhận diện…' });
    try {
      const { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(import.meta.env.BASE_URL + 'wasm');
      if (this.destroyed) return;
      this.faceDetector = await FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: import.meta.env.BASE_URL + 'models/face_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true });
      if (this.destroyed) { this.closeDetectors(); return; }
      this.handDetector = await HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: import.meta.env.BASE_URL + 'models/hand_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2 });
      if (this.destroyed) { this.closeDetectors(); return; }
      this.poseDetector = await PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: import.meta.env.BASE_URL + 'models/pose_landmarker_lite.task', delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1 });
      if (this.destroyed) { this.closeDetectors(); return; }
      this.emit({ model: 'ready', progress: '' });
    } catch {
      this.closeDetectors(); this.emit({ model: 'failed', progress: '', notice: 'Chưa tải được nhận diện. Bạn có thể chọn meme bằng tay hoặc thử tải lại.' });
    }
  }
  private closeDetectors() { this.faceDetector?.close(); this.handDetector?.close(); this.poseDetector?.close(); this.faceDetector = null; this.handDetector = null; this.poseDetector = null; }
  select(pose: Pose | null) { this.selected = pose; this.emit({ reaction: pose }); }
  calibrate() {
    if (this.snapshot.state !== 'ready' || this.snapshot.model !== 'ready') return;
    this.samples = []; this.calibrationStart = performance.now(); this.emit({ calibration: 7, notice: 'Giữ mặt tự nhiên, nhìn thẳng trong 7 giây.' });
  }
  private detect(now: number) {
    if (this.snapshot.model !== 'ready' || !this.faceDetector || !this.handDetector || !this.poseDetector) return;
    if (now - this.lastDetect < 100 || this.video.currentTime === this.lastVideoTime) return;
    const elapsed = now - this.lastDetect; this.lastDetect = now; this.lastVideoTime = this.video.currentTime;
    const ctx = this.inference.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.canvas, 0, 0, this.inference.width, this.inference.height);
    try {
      const result = this.faceDetector.detectForVideo(this.inference, now);
      this.face = result.faceLandmarks.length ? makeFace(result.faceLandmarks[0], result.faceBlendshapes[0]?.categories ?? [], 270, 480) : null;
      if (this.face) { this.lastFace = this.face; this.faceAt = now; }
      this.frame++;
      // Manual mode still tracks the face, but skips expensive hand/body inference.
      if (!this.selected && this.snapshot.calibration === null && this.frame % 2 === 0) {
        const r = this.handDetector.detectForVideo(this.inference, now); this.hands = r.landmarks.map(lm => makeHand(lm, 270, 480));
        const moves = this.hands.flatMap(h => this.previousHands.length ? [Math.min(...this.previousHands.map(p => dist(h.palm, p.palm)))] : []);
        const fw = this.face?.w ?? 100;
        const speed = Math.max(0, ...moves.filter(v => v < fw)) / fw * (33 / Math.max(33, elapsed * 2));
        this.motion = .8 * this.motion + .2 * speed; this.previousHands = this.hands;
      }
      if (!this.selected && this.snapshot.calibration === null && this.frame % 3 === 0) {
        const r = this.poseDetector.detectForVideo(this.inference, now); this.body = r.landmarks.length ? makeBody(r.landmarks[0]) : null;
      }
      if (this.snapshot.calibration !== null) {
        const passed = (now - this.calibrationStart) / 1000;
        if (this.face && passed > 1.5) this.samples.push(this.face);
        if (passed >= 7) {
          const base = collectBaseline(this.samples);
          if (base && (base.mean.jawOpen ?? 0) <= .3) {
            this.baseline = base;
            let persisted = true;
            try { localStorage.setItem('itsgiving-baseline-v1', JSON.stringify(base)); } catch { persisted = false; }
            this.emit({ calibrated: true, calibration: null, notice: persisted ? 'Đã căn chỉnh biểu cảm.' : 'Đã căn chỉnh cho phiên này. Trình duyệt không cho phép lưu.' });
          } else this.emit({ calibration: null, notice: 'Chưa căn chỉnh được. Giữ mặt trong khung hình, ngậm miệng và thử lại.' });
        } else this.emit({ calibration: Math.ceil(7 - passed) });
      }
      const tongue = this.face ? tongueScore(ctx, this.face, this.hands) : 0;
      const reaction = this.selected ?? this.gate.update(decide(this.face, this.hands, this.body, tongue, this.motion, this.baseline), now);
      if (reaction !== this.snapshot.reaction || !!this.face !== this.snapshot.hasFace) this.emit({ reaction, hasFace: !!this.face });
    } catch { this.emit({ model: 'failed', calibration: null, notice: 'Nhận diện đã tạm dừng. Hãy chọn meme bằng tay hoặc tải lại nhận diện.' }); this.closeDetectors(); }
  }
  private draw = (now: number) => {
    if (!this.stream || this.destroyed) return;
    this.raf = requestAnimationFrame(this.draw);
    if (now - this.lastDraw < 1000 / 24 || this.video.readyState < 2) return;
    this.lastDraw = now;
    const ctx = this.canvas.getContext('2d')!, w = this.canvas.width, h = this.canvas.height;
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const scale = Math.max(w / vw, h / vh), sw = w / scale, sh = h / scale;
    ctx.save();
    if (this.snapshot.facing === 'user') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(this.video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h); ctx.restore();
    this.detect(now);
    if (this.snapshot.calibration !== null) return;
    const pose = this.selected ?? this.snapshot.reaction;
    const sprite = pose ? this.sprites?.get(pose) : null;
    if (!sprite) return;
    const face = this.face ?? (now - this.faceAt < 800 ? this.lastFace : null);
    const height = face ? Math.min(h * .55, Math.max(160, face.h * 2.6)) : h * .36;
    const width = height * sprite.width / sprite.height;
    const fit = Math.min(1, (w - 32) / width);
    const dw = width * fit, dh = height * fit;
    const cx = face ? face.center[0] * 2 : w / 2;
    const top = face ? Math.max(24, face.top[1] * 2 - dh * .86) : h * .14;
    const x = Math.min(w - dw - 16, Math.max(16, cx - dw / 2));
    ctx.drawImage(sprite.frame(now), x, top, dw, dh);
  };
  startRecording() {
    if (this.snapshot.state !== 'ready' || this.snapshot.calibration !== null) return;
    const mimeType = supportedRecordingType();
    if (mimeType === null || typeof this.canvas.captureStream !== 'function') { this.emit({ message: 'Trình duyệt chưa hỗ trợ quay video. Hãy cập nhật iOS và mở lại bằng Safari.' }); return; }
    try {
      this.clearClip(); this.chunks = [];
      this.recordingStream = this.canvas.captureStream(24);
      if (this.snapshot.audio && this.mic) this.mic.getAudioTracks().forEach(t => this.recordingStream!.addTrack(t.clone()));
      this.recorder = new MediaRecorder(this.recordingStream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 });
      this.recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
      const recorder = this.recorder;
      recorder.onstop = () => {
        this.recordingStream?.getTracks().forEach(t => t.stop()); this.recordingStream = null;
        if (this.destroyed) return;
        const blob = new Blob(this.chunks, { type: recorder.mimeType || this.chunks[0]?.type || 'video/mp4' }); this.chunks = [];
        if (!blob.size) { this.emit({ state: this.stream ? 'ready' : 'idle', message: 'Video chưa ghi được. Hãy quay lại.' }); return; }
        this.blob = blob; this.url = URL.createObjectURL(blob); this.releaseCamera(); this.emit({ state: 'review', calibration: null });
      };
      recorder.onerror = () => { this.emit({ message: 'Quá trình quay bị gián đoạn. Hãy kiểm tra đoạn video vừa ghi.' }); this.stopRecording(); };
      recorder.start(1000); this.recordingStart = performance.now();
      this.emit({ state: 'recording', seconds: 0, message: '', notice: '' });
      this.timer = setInterval(() => { const seconds = Math.floor((performance.now() - this.recordingStart) / 1000); this.emit({ seconds }); if (seconds >= 60) this.stopRecording(); }, 250);
      if ('wakeLock' in navigator) void navigator.wakeLock.request('screen').then(lock => { if (this.snapshot.state === 'recording') this.wakeLock = lock; else void lock.release(); }).catch(() => {});
    } catch { this.recordingStream?.getTracks().forEach(t => t.stop()); this.recordingStream = null; this.emit({ message: 'Không bắt đầu quay được. Hãy mở lại camera và thử lại.' }); }
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
  file() { return this.blob ? new File([this.blob], `its-giving-${new Date().toISOString().replace(/[:.]/g, '-')}.${this.blob.type.includes('mp4') ? 'mp4' : 'webm'}`, { type: this.blob.type }) : null; }
  private onVisibility = () => { if (document.hidden) this.suspend(); };
  private onPageHide = () => this.suspend();
  private suspend() {
    ++this.sequence;
    const state = this.snapshot.state;
    if (state === 'recording') this.stopRecording();
    this.releaseCamera();
    if (['starting', 'ready', 'idle'].includes(state)) this.emit({ state: 'idle', calibration: null, notice: 'Camera đã tạm dừng. Chạm mở camera để tiếp tục.' });
  }
  destroy() {
    this.destroyed = true; ++this.sequence;
    document.removeEventListener('visibilitychange', this.onVisibility); window.removeEventListener('pagehide', this.onPageHide);
    if (this.timer) clearInterval(this.timer);
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recordingStream?.getTracks().forEach(t => t.stop()); this.releaseCamera(); this.closeDetectors(); this.clearClip(); this.video.remove();
  }
}
