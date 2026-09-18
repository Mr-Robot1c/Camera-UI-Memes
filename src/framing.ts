/** Let the browser choose capture geometry without a forced crop or resolution. */
export function cameraPreferences(facing: 'user' | 'environment'): MediaTrackConstraints {
  return {
    facingMode: { ideal: facing },
    frameRate: { ideal: 24, max: 30 },
    resizeMode: { ideal: 'none' },
  } as MediaTrackConstraints;
}

/** Fit every source edge at 1x; only an explicit user zoom may crop pixels. */
export function frameGeometry(vw: number, vh: number, w: number, h: number, zoom = 1) {
  const scale = Math.min(w / vw, h / vh) * Math.min(3, Math.max(1, zoom));
  const sw = Math.min(vw, w / scale), sh = Math.min(vh, h / scale);
  return { scale, sw, sh, outW: sw * scale, outH: sh * scale };
}
