import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, collectBaseline, PoseGate, type Face, type Hand } from '../src/recognition';
const face: Face = { pts: [], w: 100, h: 140, center: [150, 180], nose: [150, 170], mouth: [150, 220], top: [150, 80], eyeY: 150, turn: 0, bs: {} };
test('neutral face does not emit a meme; an obvious gasp does', () => {
  assert.equal(decide(face, [], null, 0, 0, null), null);
  assert.equal(decide({ ...face, bs: { jawOpen: .8 } }, [], null, 0, 0, null), 'open_mouth');
});
test('missing face triggers spin only when hands/body are absent', () => {
  assert.equal(decide(null, [], null, 0, 0, null), 'spin');
  assert.equal(decide(null, [], { seen: true, elbowsUp: false }, 0, 0, null), null);
});
test('heart gesture wins over a simultaneous gasp', () => {
  const hand: Hand = { palm: [100, 300], thumb: [150, 300], index: [150, 260], middle: [130, 260], horizontal: false, vertical: true, open: false };
  assert.equal(decide({ ...face, bs: { jawOpen: .8 } }, [hand, { ...hand, palm: [200, 300] }], null, 0, 0, null), 'heart');
});
test('persistence filters a short false detection and holds a real one briefly', () => {
  const gate = new PoseGate();
  assert.equal(gate.update('open_mouth', 100), null);
  assert.equal(gate.update(null, 200), null);
  assert.equal(gate.update('open_mouth', 300), null);
  assert.equal(gate.update('open_mouth', 550), 'open_mouth');
  assert.equal(gate.update(null, 700), 'open_mouth');
  assert.equal(gate.update(null, 1100), null);
});
test('calibration rejects too few samples and prevents zero-sigma triggers', () => {
  assert.equal(collectBaseline([face]), null);
  const samples = Array.from({ length: 40 }, () => ({ ...face, bs: { jawOpen: .25 } }));
  const baseline = collectBaseline(samples)!;
  assert.equal(baseline.samples, 40); assert.equal(baseline.sigma.jawOpen, .015);
  assert.equal(decide({ ...face, bs: { jawOpen: .26 } }, [], null, 0, 0, baseline), null);
  assert.equal(decide({ ...face, bs: { jawOpen: .8 } }, [], null, 0, 0, baseline), 'open_mouth');
});
