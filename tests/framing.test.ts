import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraPreferences, frameGeometry } from '../src/framing';

test('1x keeps every source edge inside the output across orientation changes', () => {
  for (const [vw, vh] of [[960, 1280], [1280, 960], [1920, 1080], [1080, 1920], [4032, 3024]]) {
    for (const [w, h] of [[540, 720], [540, 405], [540, 960]]) {
      const frame = frameGeometry(vw, vh, w, h);
      assert.ok(Math.abs(frame.sw - vw) < 1e-8);
      assert.ok(Math.abs(frame.sh - vh) < 1e-8);
      assert.ok(frame.outW <= w + 1e-8 && frame.outH <= h + 1e-8);
      // Equal x/y scale keeps detection landmarks aligned without stretching.
      assert.ok(Math.abs(frame.outW / frame.sw - frame.outH / frame.sh) < 1e-8);
    }
  }
});

test('explicit digital zoom crops around the center and is bounded to 1–3x', () => {
  const base = frameGeometry(960, 1280, 540, 720);
  const zoomed = frameGeometry(960, 1280, 540, 720, 2);
  assert.equal(zoomed.scale, base.scale * 2);
  assert.equal(zoomed.sw, 480);
  assert.equal(zoomed.sh, 640);
  assert.equal(zoomed.outW, 540);
  assert.equal(zoomed.outH, 720);
  assert.deepEqual(frameGeometry(960, 1280, 540, 720, 0.5), base);
  assert.deepEqual(frameGeometry(960, 1280, 540, 720, 4), frameGeometry(960, 1280, 540, 720, 3));
});

test('capture does not force a resolution or aspect ratio', () => {
  assert.equal(cameraPreferences('user').width, undefined);
  assert.equal(cameraPreferences('user').height, undefined);
  assert.equal(cameraPreferences('user').aspectRatio, undefined);
  assert.deepEqual(cameraPreferences('environment').facingMode, { ideal: 'environment' });
});
