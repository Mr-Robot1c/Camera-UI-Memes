---
covers: src/App.tsx, src/index.css, src/camera.ts, src/recognition.ts
last_verified: 2026-09-18
ttl_days: 90
---
# Meme camera — design spec

## User ladder / Thang user
Personal iPhone use, no account inside the app. First-time users want a working camera: show camera permission CTA and installation guide. Returning users want immediate recording: retain local calibration, use automatic reactions by default. No upsells.

## Screen map
| Screen | Vào từ | Goal | Step tiếp | Primary |
|---|---|---|---|---|
| Camera / | Home icon or URL | Make a meme clip | Review recording | Open camera, then Record / Stop |
| Review / same route | Stop recording | Watch and save | Save/share clip or return | Save video |
| Install dialog | Header install button | Add app to home screen | Return to camera | Close |

## State matrix
Camera idle: real meme collage plus open-camera action. Loading: explicit progress, no recording. Ready: live 9:16 canvas and record. Recording: red indicator, elapsed time, stop; no camera flip or calibration. Calibration: seven-second neutral-face instruction, record blocked. Error: specific camera/model/microphone message plus retry or manual mode. Hidden page: stop recording safely, release camera; require tap to resume. Review: actual Blob URL, native video controls, save/share fallback. Unsupported recording: explain and disable Record. No-face: retain last position briefly; spin after persistence. No login or role variation in app. Empty review is inaccessible.

## Behavior and acceptance
- A user gesture requests camera; microphone separately when enabled. Denying audio permits a silent recording with a visible notice.
- Automatic mode ports the fourteen Python pose rules. Manual selection always works without models; selecting a meme locks it until Auto is tapped.
- Rendering and recording use the same portrait canvas. Images and decoded animated GIF frames are included in the recorded pixels. Audio is included only if granted and enabled.
- Stop produces a playable video, then a share-sheet save or download. Keep a download fallback when file sharing is absent or fails. Never claim the file is in Photos automatically.
- Front camera is mirrored consistently in preview and output; back camera is not. Changing camera must release previous tracks.
- Model failures do not block manual mode. Camera failures and recording interruptions retain a path to retry. A 60-second limit bounds memory use.
- Calibration is local, versioned, minimum thirty valid samples, recoverable if storage is unavailable.
- App shell and loaded models/assets can be cached for reuse, without caching user videos or camera data. First load requires network. No cloud video upload.

## Layout and density
Mobile: full-width portrait stage, compact header, horizontal scrollable effect strip, bottom recording controls with safe-area padding. Camera and recording action weight 3; effect selection weight 2; setup/help weight 1. At 320px allow vertical page scroll; never page horizontal overflow. Tablet: centered stage plus effects. Desktop: 2-column studio, portrait stage and reaction library; no fake device chrome. One route, no tabs, maximum three controls per action row. Review replaces stage, not a second camera.

## Tokens/components
Dark camera studio, near-black neutral ramp, lime accent, red recording/error, system sans. Shared spacing 4/8/12/16/24/32/48/64. shadcn-style Button (Radix Slot/CVA), Radix Dialog. Icons from Lucide. 44px minimum hit targets, 48px on main actions, accessible names and focus rings. Reduced-motion support. Text labels short Vietnamese, single-line. Real existing meme images provide the personality.

## Delivery/verification
Vite + React + TypeScript + Tailwind, static PWA, MediaPipe Tasks Vision, local models and WASM. Verify production build, pose logic and recorder/camera transitions, screenshots of camera/review/installation at 1440×900, 768×1024, 375×812 and narrow 320×568. Real iPhone performance and save-to-Photos remain a hardware validation step when no iPhone is available.
