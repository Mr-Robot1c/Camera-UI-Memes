# Meme Camera — iPhone meme camera PWA

PWA port of the Python project in the parent directory. The original Python files are unchanged.

## Run

Node 22+ recommended. `npm ci`, `npm run dev`. Production: `npm run build`, then `npm run preview`.
`npm test` runs behavioral pose tests. `node tests/browser-qa.mjs` runs browser checks against a production preview on port 4173 using installed Microsoft Edge and synthetic camera/microphone streams. It saves screenshots and a sample recording in ignored `test-results/`.

The app deploys to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`, built with `BASE_PATH=/Camera-UI-Memes/`): https://mr-robot1c.github.io/Camera-UI-Memes/

Serve `dist/` on HTTPS for phones; an HTTP LAN address cannot access the iPhone camera. Open the hosted URL in Safari, Share → Add to Home Screen → Open as Web App. A private Sites URL requires the owner's sign-in.

## App flow

Open camera, optionally allow microphone, choose Auto or one of the twenty-four memes, record up to sixty seconds, preview, then save/share. MediaPipe and recording run on the device. Native file sharing is used when available; download is the fallback. Downloaded files may appear in Files rather than Photos. The app does not upload videos. Closing/reloading clears an unsaved recording. Backgrounding stops recording and releases camera tracks.

Automatic recognition uses face, hand and pose models ported from the Python reaction rules. Generic thresholds are available immediately; seven-second calibration saves a local baseline on this device only. Models/assets are served locally, with no runtime CDN dependency. The optional calibration can be retried. Recognition failure preserves manual selection and recording.

GIFs are decoded into actual composited animation frames for canvas recording, including frame delays and disposal. Video and preview share one 540×960 portrait canvas. Front camera is mirrored consistently; the rear camera is not. Inference is throttled and hand/body inference is staggered. Decoded GIF dimensions are bounded to reduce mobile memory.

## Files

- `src/camera.ts`: camera permissions, MediaPipe, compositing, calibration and recorder lifecycle.
- `src/recognition.ts`: pure pose rules and persistence gate.
- `src/assets.ts`: image and GIF decoding.
- `src/App.tsx`, `src/index.css`: camera, effects, review and installation UI.
- `public/`: original memes, model files, icons, PWA manifest and service worker.
- `docs/app-map/01-design-spec.md`: user flow, states and layout decisions.

## Verification boundary

Browser automation validates genuine MediaPipe initialization, composited recording/playback/download with synthetic camera input, audio fallback, camera switching, interruption and responsive UI. It does not prove expression accuracy, thermal behavior or save-to-Photos on physical iPhones. Test those on the target phone, especially older iPhones. Keeping the app in the foreground is required during recording. Startup downloads about 30 MB of model/WASM assets before browser caching; offline availability depends on retained browser cache and hosting authentication.

The optional `select_meme` WebMCP tool only changes selection; it never requests permissions or starts recording. Unsupported browsers ignore it.
