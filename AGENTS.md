# Working on the web app

Read `docs/app-map/01-design-spec.md` before changing UI behavior. Keep Python originals outside this directory untouched. No server receives camera frames or video. Keep browser camera/recorder tracks released on review, interruption and teardown. Do not cache login pages or Blob videos in the service worker.

Use `npm run build` and behavioral tests for functional changes. Use `tests/browser-qa.mjs` for camera/recording changes, and visually inspect its responsive screenshots. Hardware iPhone validation must be reported separately from emulation. Keep model and WASM versions compatible; the build copies the pinned dependency's WASM and versions the service-worker cache.
