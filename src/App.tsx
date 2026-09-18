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
    setSaveMessage('Download requested. Check your Downloads or Files.'); setSaved(true);
  };
  const save = async () => {
    const file = engine.current?.file(); if (!file) return;
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Meme Camera' }); setSaved(true); setSaveMessage('Share sheet closed. Choose “Save Video” there to add it to Photos.'); }
      catch (e) { if ((e as Error).name !== 'AbortError') setSaveMessage('Could not share. Use the Download button instead.'); }
    } else download();
  };
  const retake = () => { setRetakeOpen(false); setSaved(false); setSaveMessage(''); void engine.current?.retake(); };
  const primary = () => { if (recording) engine.current?.stopRecording(); else if (state.state === 'ready') { setSaved(false); engine.current?.startRecording(); } else void engine.current?.start(); };

  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="/" aria-label="Meme Camera — home" onClick={e => e.preventDefault()}><span className="brand-mark"><Camera size={23} strokeWidth={2.5}/></span><span>meme camera<span className="brand-dot">.</span></span></a>
      <div className="header-actions">
        <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="How to record a meme"><CircleHelp/></Button></DialogTrigger><DialogContent><div className="dialog-symbol"><Sparkles/></div><DialogTitle>How to record a meme</DialogTitle><DialogDescription>Your expression picks the meme.</DialogDescription><ol className="guide-steps"><li><span>1</span><div><strong>Open the camera</strong><p>Allow camera access. Turn on the mic if you want sound.</p></div></li><li><span>2</span><div><strong>Choose Auto or a meme</strong><p>Auto reads your expression, hands and pose. Tap a meme to lock that effect.</p></div></li><li><span>3</span><div><strong>Record, then save</strong><p>Each clip is up to 60 seconds. On iPhone, choose “Save Video” in the share sheet.</p></div></li></ol><p className="privacy-note">Camera and video are processed on your device. The app never uploads your videos.</p></DialogContent></Dialog>
        {!standalone && <Dialog open={installOpen} onOpenChange={setInstallOpen}><DialogTrigger asChild><Button variant="outline" size="sm"><Smartphone/><span>Install app</span></Button></DialogTrigger><DialogContent><div className="dialog-symbol"><Smartphone/></div><DialogTitle>Add to iPhone</DialogTitle><DialogDescription>Open this link in Safari.</DialogDescription><ol className="guide-steps"><li><span><Share2 size={18}/></span><div><strong>Tap Share</strong><p>In the browser toolbar.</p></div></li><li><span><Plus size={18}/></span><div><strong>Add to Home Screen</strong><p>Scroll the list if you don’t see it.</p></div></li><li><span><Check size={18}/></span><div><strong>Open as web app</strong><p>Enable the option if shown, then tap Add.</p></div></li></ol><p className="privacy-note">Android: open the browser menu → Install app or Add to Home screen.</p></DialogContent></Dialog>}
      </div>
    </header>

    <main className={`studio ${review ? 'is-review' : ''}`}>
      <section className="camera-section" aria-label={review ? 'Review your video' : 'Meme camera'}>
        <div className="section-heading"><div><span className="eyebrow">MEME CAMERA</span><h1>{review ? 'Your moment' : 'Strike a pose'}</h1></div><span className="format-label">9:16</span></div>
        <div className={`viewfinder ${active ? 'is-active' : ''}`}>
          <canvas ref={canvas} className={active && !review ? 'camera-canvas' : 'camera-canvas concealed'} aria-label="Camera with meme overlay"/>
          {review && <video className="review-video" src={engine.current?.url} controls playsInline preload="metadata" aria-label="Your recorded meme video"/>}
          {!active && !review && <div className="camera-welcome">
            <div className="meme-collage" aria-hidden="true"><img className="collage-one" src={import.meta.env.BASE_URL + 'memes/open_mouth.jpeg'} alt=""/><img className="collage-two" src={import.meta.env.BASE_URL + 'memes/heart.jpeg'} alt=""/><img className="collage-three" src={import.meta.env.BASE_URL + 'memes/suspicious.jpeg'} alt=""/><span className="collage-spark"><Sparkles size={28}/></span></div>
            <div className="welcome-caption"><span className="welcome-icon"><ScanFace size={32}/></span><h2>Your face. Your meme.</h2><p>{busy ? state.progress : 'Ready for a reaction?'}</p></div>
          </div>}
          {!review && <><div className="viewfinder-top"><span className={`camera-badge ${recording ? 'is-recording' : ''}`}>{recording ? <><span className="record-dot"/>{time}</> : <><Video size={14}/>{active ? 'Live camera' : 'Front camera'}</>}</span>{active && <span className="camera-badge">{state.audio ? <Mic size={14}/> : <MicOff size={14}/>}</span>}</div>
          {active && <div className="viewfinder-bottom"><span className="reaction-badge"><Sparkles size={14}/>{state.calibration !== null ? `Hold a neutral face · ${state.calibration}s` : current?.label ?? (state.model === 'loading' ? 'Loading recognition…' : state.hasFace ? 'Try an expression' : 'Look at the camera')}</span></div>}
          {state.calibration !== null && <div className="calibration-guide"><div className="face-outline"/><span>{state.calibration}</span></div>}</>}
        </div>

        <div className="camera-controls">
          {review ? <><div className="review-action-row"><Button variant="secondary" size="icon" aria-label="Retake" onClick={() => saved ? retake() : setRetakeOpen(true)}><RotateCcw/></Button><Button className="save-button" onClick={() => void save()}><Share2/>Save Video</Button><Button variant="secondary" size="icon" aria-label="Download video" onClick={download}><ArrowDownToLine/></Button></div><p className="control-caption">{saveMessage || 'Review before saving or sharing'}</p></> : <><div className="record-action-row"><Button variant="secondary" size="icon" aria-label={state.audio ? 'Turn mic off' : 'Turn mic on'} title={state.audio ? 'Turn mic off' : 'Turn mic on'} disabled={recording || busy} onClick={() => void engine.current?.toggleAudio()}>{state.audio ? <Mic/> : <MicOff/>}</Button><button className={`record-button ${recording ? 'recording' : ''} ${!active ? 'start-camera' : ''}`} disabled={busy || state.calibration !== null || (active && supportedRecordingType() === null)} onClick={primary} aria-label={recording ? 'Stop recording' : active ? 'Start recording' : 'Open camera'}>{busy ? <LoaderCircle className="spinner" size={28}/> : recording ? <span className="stop-shape"/> : active ? <span className="record-shape"/> : <Camera size={28}/>}</button><Button variant="secondary" size="icon" aria-label="Switch camera" title="Switch camera" disabled={!active || busy || recording || state.calibration !== null} onClick={() => void engine.current?.start(state.facing === 'user' ? 'environment' : 'user')}><FlipHorizontal2/></Button></div><p className="control-caption">{recording ? `Recording · ${time} / 01:00` : busy ? state.progress || 'Processing video…' : state.calibration !== null ? 'Hold a neutral face, no talking' : active ? supportedRecordingType() === null ? 'Update your browser to record video' : 'Tap to record · up to 60 seconds' : 'Tap to open the camera'}</p></>}
        </div>
        {(state.message || state.notice) && <div className={`status-message ${state.message ? 'error' : ''}`} role={state.message ? 'alert' : 'status'}>{state.message || state.notice}</div>}
      </section>

      {!review && <aside className="effects-panel" aria-label="Choose a meme">
        <div className="effects-heading"><div><span className="eyebrow">REACTION PACK</span><h2>Every face has a meme</h2></div><span className="count-label">14</span></div>
        <button className={`auto-mode ${selection === null ? 'selected' : ''}`} onClick={() => select(null)} aria-pressed={selection === null}><span className="auto-icon"><Sparkles size={22}/></span><span><strong>Auto</strong><small>{state.model === 'loading' ? 'Loading recognition…' : state.model === 'failed' ? 'Recognition unavailable' : 'Meme follows your expression'}</small></span><span className="selection-indicator">{selection === null && <Check size={16}/>}</span></button>
        <div className="effect-divider"><span>OR PICK A MEME</span></div>
        <div className="effects-grid">{REACTIONS.map(r => <button key={r.id} className={`effect-card ${selection === r.id ? 'selected' : ''} ${selection === null && state.reaction === r.id ? 'detected' : ''}`} aria-label={`${r.label} — ${r.hint}`} aria-pressed={selection === r.id} onClick={() => select(r.id)} title={r.hint}><span className="effect-image"><img src={import.meta.env.BASE_URL + 'memes/' + r.file} alt="" loading="lazy"/>{selection === r.id && <span className="effect-check"><Check size={13}/></span>}</span><span className="effect-name">{r.label}</span></button>)}</div>
        <div className="effect-detail"><Focus size={18}/><span>{selection ? current?.hint : 'Pick a meme to lock it while recording'}</span></div>
        <div className="calibration-row"><span><ScanFace size={18}/>{state.calibrated ? 'Calibrated' : 'Calibrate expressions'}</span>{state.model === 'failed' ? <Button variant="outline" size="sm" disabled={busy || recording} onClick={() => void engine.current?.loadDetectors()}>Try again</Button> : <Button variant="outline" size="sm" disabled={state.state !== 'ready' || state.model !== 'ready' || state.calibration !== null} onClick={() => engine.current?.calibrate()}>{state.calibrated ? 'Redo' : 'Start'}</Button>}</div>
        <div className="local-note"><Aperture size={14}/><span>Processed on your device</span></div>
      </aside>}
      {review && <aside className="review-panel"><span className="review-symbol"><Check size={32}/></span><span className="eyebrow">THAT’S A WRAP</span><h2>This meme is all you.</h2><p>Tap <strong>Save Video</strong> to open the share sheet. On iPhone, choose <strong>Save Video</strong> there to add it to Photos.</p><div className="review-facts"><span><Video size={18}/>9:16 vertical video</span><span>{state.audio ? <Volume2 size={18}/> : <MicOff size={18}/>} {state.audio ? 'With sound' : 'No sound'}</span><span><AudioLines size={18}/>{time}</span></div><p className="review-reminder">Save your video before closing the app or recording a new one.</p></aside>}
    </main>
    <footer className="app-footer"><span>meme camera<span className="brand-dot">.</span></span><span>Made for your main-character moment.</span></footer>
    <Dialog open={retakeOpen} onOpenChange={setRetakeOpen}><DialogContent><DialogTitle>Record a new clip?</DialogTitle><DialogDescription>The current clip will be discarded. Save it first if you want to keep it.</DialogDescription><div className="dialog-actions"><Button variant="secondary" onClick={() => setRetakeOpen(false)}><ChevronLeft/>Go back</Button><Button onClick={retake}>Record new</Button></div></DialogContent></Dialog>
  </div>;
}
