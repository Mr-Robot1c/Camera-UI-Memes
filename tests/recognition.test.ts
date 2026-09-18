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
test('new expressions: symmetric smile is superman, one-sided smirk is smug, closed eyes are chill', () => {
  assert.equal(decide({ ...face, bs: { mouthSmileLeft: .6, mouthSmileRight: .55 } }, [], null, 0, 0, null), 'superman');
  assert.equal(decide({ ...face, bs: { mouthSmileLeft: .5, mouthSmileRight: .1 } }, [], null, 0, 0, null), 'shrek_smug');
  assert.equal(decide({ ...face, bs: { eyeBlinkLeft: .7, eyeBlinkRight: .7 } }, [], null, 0, 0, null), 'chill');
});
test('open arms out wide are welcome; fists and a scream are the werewolf; pointing at the chest is who_me', () => {
  const open: Hand = { palm: [40, 260], thumb: [45, 250], index: [35, 250], middle: [40, 240], horizontal: false, vertical: true, open: true };
  assert.equal(decide(face, [open, { ...open, palm: [260, 260] }], null, 0, 0, null), 'welcome');
  const fist: Hand = { ...open, open: false, palm: [80, 240] };
  assert.equal(decide({ ...face, bs: { jawOpen: .8 } }, [fist, { ...fist, palm: [220, 240] }], null, 0, 0, null), 'werewolf');
  const point: Hand = { ...open, open: false, palm: [150, 390], thumb: [150, 370], index: [150, 380], middle: [145, 380] };
  assert.equal(decide(face, [point], null, 0, 0, null), 'who_me');
  const onLips: Hand = { ...open, open: false, palm: [150, 270], thumb: [150, 250], index: [150, 225], middle: [145, 250] };
  assert.equal(decide(face, [onLips], null, 0, 0, null), 'shush');
});
test('a slightly open mouth while dancing stays dance; wide-open flips to crashing out', () => {
  const behind: Hand = { palm: [150, 120], thumb: [150, 110], index: [150, 100], middle: [150, 105], horizontal: false, vertical: false, open: false };
  const hands = [behind, { ...behind, palm: [190, 120], thumb: [190, 110], index: [190, 100], middle: [190, 105] }];
  const body = { seen: true, elbowsUp: true };
  assert.equal(decide({ ...face, bs: { jawOpen: .25 } }, hands, body, 0, 0, null), 'dance');
  assert.equal(decide({ ...face, bs: { jawOpen: .8 } }, hands, body, 0, 0, null), 'crashing_out');
});
test('a hand thrust at the camera reads as sigma near the face and come here lower down', () => {
  const big: Hand = { palm: [150, 260], thumb: [110, 200], index: [150, 110], middle: [180, 200], horizontal: false, vertical: true, open: true };
  assert.equal(decide(face, [big], null, 0, 0, null), 'you_cat');
  const low: Hand = { ...big, palm: [150, 400], thumb: [110, 340], index: [150, 250], middle: [180, 340] };
  assert.equal(decide(face, [low], null, 0, 0, null), 'come_here');
});
test('calibration rejects too few samples and prevents zero-sigma triggers', () => {
  assert.equal(collectBaseline([face]), null);
  const samples = Array.from({ length: 40 }, () => ({ ...face, bs: { jawOpen: .25 } }));
  const baseline = collectBaseline(samples)!;
  assert.equal(baseline.samples, 40); assert.equal(baseline.sigma.jawOpen, .015);
  assert.equal(decide({ ...face, bs: { jawOpen: .26 } }, [], null, 0, 0, baseline), null);
  assert.equal(decide({ ...face, bs: { jawOpen: .8 } }, [], null, 0, 0, baseline), 'open_mouth');
});
