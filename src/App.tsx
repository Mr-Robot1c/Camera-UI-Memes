import { useEffect, useRef, useState } from 'react';
import { Aperture, ArrowDownToLine, AudioLines, Camera, Check, ChevronLeft, CircleHelp, FlipHorizontal2, Focus, LoaderCircle, Mic, MicOff, Plus, RotateCcw, ScanFace, Share2, Smartphone, Sparkles, Video, Volume2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './components/ui/dialog';
import { MemeCamera, initialSnapshot, supportedRecordingType, type Snapshot } from './camera';
import { REACTIONS, type Pose } from './recognition';

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<MemeCamera | null>(null);
  const [state, setState] = useState<Snapshot>(initialSnapshot);
  const [selection, setSelection] = useState<Pose | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [installOpen, setInstallOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retakeOpen, setRetakeOpen] = useState(false);
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const camera = new MemeCamera(canvas.current!, setState); engine.current = camera; setState({ ...camera.snapshot });
    setStandalone(matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    return () => { camera.destroy(); engine.current = null; };
  }, []);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const life = new AbortController();
    try { void Promise.resolve(context.registerTool({ name: 'select_meme', description: 'Select a meme overlay or automatic recognition. Does not open the camera or start recording.', inputSchema: { type: 'object', properties: { meme: { type: 'string', enum: ['auto', ...REACTIONS.map(r => r.id)] } }, required: ['meme'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: async (input: unknown) => {
      const id = (input as { meme?: string })?.meme;
      if (id !== 'auto' && !REACTIONS.some(r => r.id === id)) throw new Error('Unknown meme');
      const pose = id === 'auto' ? null : id as Pose;
      engine.current?.select(pose); setSelection(pose); await new Promise(resolve => requestAnimationFrame(resolve)); return { meme: id };
    } }, { signal: life.signal })).catch(() => {}); } catch { /* Optional API. */ }
    return () => life.abort();
  }, []);
  const busy = state.state === 'starting' || state.state === 'processing';
  const recording = state.state === 'recording';
  const review = state.state === 'review';
  const active = ['ready', 'recording', 'processing'].includes(state.state);
  const current = REACTIONS.find(r => r.id === (selection ?? state.reaction));
  const select = (pose: Pose | null) => { setSelection(pose); engine.current?.select(pose); };
  const time = `00:${String(state.seconds).padStart(2, '0')}`;
  const download = () => {
    const file = engine.current?.file(); if (!file || !engine.current?.url) return;
    const a = document.createElement('a'); a.href = engine.current.url; a.download = file.name; document.body.append(a); a.click(); a.remove();
    setSaveMessage('Đã yêu cầu tải video. Kiểm tra mục Tải về / Tệp.'); setSaved(true);
  };
  const save = async () => {
    const file = engine.current?.file(); if (!file) return;
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "It's giving" }); setSaved(true); setSaveMessage('Đã đóng bảng chia sẻ. Chọn “Lưu video” để lưu vào Ảnh.'); }
      catch (e) { if ((e as Error).name !== 'AbortError') setSaveMessage('Chưa chia sẻ được. Hãy dùng nút Tải xuống.'); }
    } else download();
  };
  const retake = () => { setRetakeOpen(false); setSaved(false); setSaveMessage(''); void engine.current?.retake(); };
  const primary = () => { if (recording) engine.current?.stopRecording(); else if (state.state === 'ready') { setSaved(false); engine.current?.startRecording(); } else void engine.current?.start(); };

  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="/" aria-label="It's giving — trang chính" onClick={e => e.preventDefault()}><span className="brand-mark"><Camera size={23} strokeWidth={2.5}/></span><span>it's giving<span className="brand-dot">.</span></span></a>
      <div className="header-actions">
        <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Cách quay meme"><CircleHelp/></Button></DialogTrigger><DialogContent><div className="dialog-symbol"><Sparkles/></div><DialogTitle>Cách quay meme</DialogTitle><DialogDescription>Biểu cảm của bạn sẽ chọn meme.</DialogDescription><ol className="guide-steps"><li><span>1</span><div><strong>Mở camera</strong><p>Cho phép camera. Bật micro nếu muốn thu tiếng.</p></div></li><li><span>2</span><div><strong>Chọn tự động hoặc một meme</strong><p>Tự động nhận biểu cảm, tay và tư thế. Chạm một meme để giữ hiệu ứng đó.</p></div></li><li><span>3</span><div><strong>Quay rồi lưu</strong><p>Mỗi đoạn tối đa 60 giây. Trên iPhone, chọn “Lưu video” trong bảng chia sẻ.</p></div></li></ol><p className="privacy-note">Camera và video được xử lý trên thiết bị. App không tải video của bạn lên máy chủ.</p></DialogContent></Dialog>
        {!standalone && <Dialog open={installOpen} onOpenChange={setInstallOpen}><DialogTrigger asChild><Button variant="outline" size="sm"><Smartphone/><span>Cài app</span></Button></DialogTrigger><DialogContent><div className="dialog-symbol"><Smartphone/></div><DialogTitle>Thêm vào iPhone</DialogTitle><DialogDescription>Mở đường dẫn này bằng Safari.</DialogDescription><ol className="guide-steps"><li><span><Share2 size={18}/></span><div><strong>Chạm Chia sẻ</strong><p>Trong thanh công cụ của trình duyệt.</p></div></li><li><span><Plus size={18}/></span><div><strong>Thêm vào Màn hình chính</strong><p>Cuộn danh sách nếu chưa thấy mục này.</p></div></li><li><span><Check size={18}/></span><div><strong>Mở dưới dạng ứng dụng web</strong><p>Bật tùy chọn nếu có, rồi chạm Thêm.</p></div></li></ol><p className="privacy-note">Android: mở menu trình duyệt → Cài đặt ứng dụng hoặc Thêm vào màn hình chính.</p></DialogContent></Dialog>}
      </div>
    </header>

    <main className={`studio ${review ? 'is-review' : ''}`}>
      <section className="camera-section" aria-label={review ? 'Xem lại video' : 'Camera quay meme'}>
        <div className="section-heading"><div><span className="eyebrow">MEME CAMERA</span><h1>{review ? 'Khoảnh khắc của bạn' : 'Đến lượt bạn diễn'}</h1></div><span className="format-label">9:16</span></div>
        <div className={`viewfinder ${active ? 'is-active' : ''}`}>
          <canvas ref={canvas} className={active && !review ? 'camera-canvas' : 'camera-canvas concealed'} aria-label="Camera đã ghép meme"/>
          {review && <video className="review-video" src={engine.current?.url} controls playsInline preload="metadata" aria-label="Video meme vừa quay"/>}
          {!active && !review && <div className="camera-welcome">
            <div className="meme-collage" aria-hidden="true"><img className="collage-one" src="/memes/open_mouth.jpeg" alt=""/><img className="collage-two" src="/memes/heart.jpeg" alt=""/><img className="collage-three" src="/memes/suspicious.jpeg" alt=""/><span className="collage-spark"><Sparkles size={28}/></span></div>
            <div className="welcome-caption"><span className="welcome-icon"><ScanFace size={32}/></span><h2>Mặt bạn. Meme bạn.</h2><p>{busy ? state.progress : 'Sẵn sàng cho một chiếc reaction?'}</p></div>
          </div>}
          {!review && <><div className="viewfinder-top"><span className={`camera-badge ${recording ? 'is-recording' : ''}`}>{recording ? <><span className="record-dot"/>{time}</> : <><Video size={14}/>{active ? 'Camera trực tiếp' : 'Camera trước'}</>}</span>{active && <span className="camera-badge">{state.audio ? <Mic size={14}/> : <MicOff size={14}/>}</span>}</div>
          {active && <div className="viewfinder-bottom"><span className="reaction-badge"><Sparkles size={14}/>{state.calibration !== null ? `Giữ mặt tự nhiên · ${state.calibration}s` : current?.label ?? (state.model === 'loading' ? 'Đang tải nhận diện…' : state.hasFace ? 'Thử một biểu cảm' : 'Nhìn vào camera')}</span></div>}
          {state.calibration !== null && <div className="calibration-guide"><div className="face-outline"/><span>{state.calibration}</span></div>}</>}
        </div>

        <div className="camera-controls">
          {review ? <><div className="review-action-row"><Button variant="secondary" size="icon" aria-label="Quay lại" onClick={() => saved ? retake() : setRetakeOpen(true)}><RotateCcw/></Button><Button className="save-button" onClick={() => void save()}><Share2/>Lưu video</Button><Button variant="secondary" size="icon" aria-label="Tải xuống video" onClick={download}><ArrowDownToLine/></Button></div><p className="control-caption">{saveMessage || 'Xem lại trước khi lưu hoặc chia sẻ'}</p></> : <><div className="record-action-row"><Button variant="secondary" size="icon" aria-label={state.audio ? 'Tắt micro' : 'Bật micro'} title={state.audio ? 'Tắt micro' : 'Bật micro'} disabled={recording || busy} onClick={() => void engine.current?.toggleAudio()}>{state.audio ? <Mic/> : <MicOff/>}</Button><button className={`record-button ${recording ? 'recording' : ''} ${!active ? 'start-camera' : ''}`} disabled={busy || state.calibration !== null || (active && supportedRecordingType() === null)} onClick={primary} aria-label={recording ? 'Dừng quay' : active ? 'Bắt đầu quay' : 'Mở camera'}>{busy ? <LoaderCircle className="spinner" size={28}/> : recording ? <span className="stop-shape"/> : active ? <span className="record-shape"/> : <Camera size={28}/>}</button><Button variant="secondary" size="icon" aria-label="Đổi camera" title="Đổi camera" disabled={!active || busy || recording || state.calibration !== null} onClick={() => void engine.current?.start(state.facing === 'user' ? 'environment' : 'user')}><FlipHorizontal2/></Button></div><p className="control-caption">{recording ? `Đang quay · ${time} / 01:00` : busy ? state.progress || 'Đang xử lý video…' : state.calibration !== null ? 'Giữ mặt tự nhiên, đừng nói chuyện' : active ? supportedRecordingType() === null ? 'Cập nhật trình duyệt để quay video' : 'Chạm để quay · tối đa 60 giây' : 'Chạm để mở camera'}</p></>}
        </div>
        {(state.message || state.notice) && <div className={`status-message ${state.message ? 'error' : ''}`} role={state.message ? 'alert' : 'status'}>{state.message || state.notice}</div>}
      </section>

      {!review && <aside className="effects-panel" aria-label="Chọn meme">
        <div className="effects-heading"><div><span className="eyebrow">BỘ REACTION</span><h2>Mỗi nét mặt, một meme</h2></div><span className="count-label">14</span></div>
        <button className={`auto-mode ${selection === null ? 'selected' : ''}`} onClick={() => select(null)} aria-pressed={selection === null}><span className="auto-icon"><Sparkles size={22}/></span><span><strong>Tự động</strong><small>{state.model === 'loading' ? 'Đang tải nhận diện…' : state.model === 'failed' ? 'Nhận diện chưa sẵn sàng' : 'Meme đổi theo biểu cảm'}</small></span><span className="selection-indicator">{selection === null && <Check size={16}/>}</span></button>
        <div className="effect-divider"><span>HOẶC CHỌN MỘT MEME</span></div>
        <div className="effects-grid">{REACTIONS.map(r => <button key={r.id} className={`effect-card ${selection === r.id ? 'selected' : ''} ${selection === null && state.reaction === r.id ? 'detected' : ''}`} aria-label={`${r.label} — ${r.hint}`} aria-pressed={selection === r.id} onClick={() => select(r.id)} title={r.hint}><span className="effect-image"><img src={'/memes/' + r.file} alt="" loading="lazy"/>{selection === r.id && <span className="effect-check"><Check size={13}/></span>}</span><span className="effect-name">{r.label}</span></button>)}</div>
        <div className="effect-detail"><Focus size={18}/><span>{selection ? current?.hint : 'Chọn một meme để giữ hiệu ứng khi quay'}</span></div>
        <div className="calibration-row"><span><ScanFace size={18}/>{state.calibrated ? 'Đã căn chỉnh' : 'Căn chỉnh biểu cảm'}</span>{state.model === 'failed' ? <Button variant="outline" size="sm" disabled={busy || recording} onClick={() => void engine.current?.loadDetectors()}>Thử lại</Button> : <Button variant="outline" size="sm" disabled={state.state !== 'ready' || state.model !== 'ready' || state.calibration !== null} onClick={() => engine.current?.calibrate()}>{state.calibrated ? 'Chỉnh lại' : 'Bắt đầu'}</Button>}</div>
        <div className="local-note"><Aperture size={14}/><span>Xử lý ngay trên thiết bị</span></div>
      </aside>}
      {review && <aside className="review-panel"><span className="review-symbol"><Check size={32}/></span><span className="eyebrow">QUAY XONG RỒI</span><h2>Meme này là của bạn.</h2><p>Chạm <strong>Lưu video</strong> để mở bảng chia sẻ. Trên iPhone, chọn <strong>Lưu video</strong> để đưa vào Ảnh.</p><div className="review-facts"><span><Video size={18}/>Video dọc 9:16</span><span>{state.audio ? <Volume2 size={18}/> : <MicOff size={18}/>} {state.audio ? 'Có âm thanh' : 'Không tiếng'}</span><span><AudioLines size={18}/>{time}</span></div><p className="review-reminder">Lưu video trước khi đóng app hoặc quay đoạn mới.</p></aside>}
    </main>
    <footer className="app-footer"><span>it's giving<span className="brand-dot">.</span></span><span>Made for your main-character moment.</span></footer>
    <Dialog open={retakeOpen} onOpenChange={setRetakeOpen}><DialogContent><DialogTitle>Quay đoạn mới?</DialogTitle><DialogDescription>Đoạn vừa quay sẽ được bỏ. Hãy lưu video nếu bạn muốn giữ lại.</DialogDescription><div className="dialog-actions"><Button variant="secondary" onClick={() => setRetakeOpen(false)}><ChevronLeft/>Quay về</Button><Button onClick={retake}>Quay mới</Button></div></DialogContent></Dialog>
  </div>;
}
