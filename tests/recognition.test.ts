import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, collectBaseline, PoseGate, type Face, type Hand } from '../src/recognition';
const face: Face = { pts: [], w: 100, h: 140, center: [150, 180], nose: [150, 170], mouth: [150, 220], top: [150, 80], eyeY: 150, turn: 0, bs: {} };
test('neutral face does not emit a meme; an obvious gasp does', () => {
  assert.equal(decide(face, [], null, 0, 0, null), null);
  assert.equal(decide({ ...face, bs: { jawOpen: .8 } }, [], null, 0, 0, null), 'open_mouth');
});
test('a missing face emits nothing', () => {
  assert.equal(decide(null, [], null, 0, 0, null), null);
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
test('expressions: symmetric smile is superman, closed eyes are chill, a sneer is disgust', () => {
  assert.equal(decide({ ...face, bs: { mouthSmileLeft: .6, mouthSmileRight: .55 } }, [], null, 0, 0, null), 'superman');
  assert.equal(decide({ ...face, bs: { eyeBlinkLeft: .7, eyeBlinkRight: .7 } }, [], null, 0, 0, null), 'chill');
  assert.equal(decide({ ...face, bs: { noseSneerLeft: .15, noseSneerRight: .15 } }, [], null, 0, 0, null), 'disgusted');
});
test('open arms out wide are welcome; pointing at the chest is who_me; a finger on the lips is monke', () => {
  const open: Hand = { palm: [40, 260], thumb: [45, 250], index: [35, 250], middle: [40, 240], horizontal: false, vertical: true, open: true };
  assert.equal(decide(face, [open, { ...open, palm: [260, 260] }], null, 0, 0, null), 'welcome');
  const point: Hand = { ...open, open: false, palm: [150, 390], thumb: [150, 370], index: [150, 380], middle: [145, 380] };
  assert.equal(decide(face, [point], null, 0, 0, null), 'who_me');
  const onLips: Hand = { ...open, open: false, palm: [150, 270], thumb: [150, 250], index: [150, 225], middle: [145, 250] };
  assert.equal(decide(face, [onLips], null, 0, 0, null), 'monkey_think');
});
test('dancing stays dance whether the mouth is open or not (crashing out was removed)', () => {
  const behind: Hand = { palm: [150, 120], thumb: [150, 110], index: [150, 100], middle: [150, 105], horizontal: false, vertical: false, open: false };
  const hands = [behind, { ...behind, palm: [190, 120], thumb: [190, 110], index: [190, 100], middle: [190, 105] }];
  const body = { seen: true, elbowsUp: true };
  assert.equal(decide({ ...face, bs: { jawOpen: .25 } }, hands, body, 0, 0, null), 'dance');
  assert.equal(decide({ ...face, bs: { jawOpen: .8 } }, hands, body, 0, 0, null), 'dance');
});
test('a hand thrust low at the camera reads as stop-right-there; near the face it emits nothing', () => {
  const big: Hand = { palm: [150, 260], thumb: [110, 200], index: [150, 110], middle: [180, 200], horizontal: false, vertical: true, open: true };
  assert.equal(decide(face, [big], null, 0, 0, null), null);
  const low: Hand = { ...big, palm: [150, 400], thumb: [110, 340], index: [150, 250], middle: [180, 340] };
  assert.equal(decide(face, [low], null, 0, 0, null), 'come_here');
});
test('prayer palms touch and beat heart; two palms beside the head are cinema', () => {
  const prayer: Hand = { palm: [145, 240], thumb: [145, 230], index: [145, 190], middle: [140, 190], horizontal: false, vertical: true, open: false };
  assert.equal(decide(face, [prayer, { ...prayer, palm: [155, 240], thumb: [155, 230], index: [155, 190] }], null, 0, 0, null), 'pray');
  const raised: Hand = { palm: [60, 120], thumb: [60, 130], index: [60, 80], middle: [55, 85], horizontal: false, vertical: true, open: true };
  assert.equal(decide(face, [raised, { ...raised, palm: [240, 120], thumb: [240, 130], index: [240, 80] }], null, 0, 0, null), 'absolute_cinema');
  // Clasped prayer hands often come back as ONE tall hand: still pray.
  const clasped: Hand = { palm: [150, 285], thumb: [130, 240], index: [150, 200], middle: [170, 240], horizontal: false, vertical: true, open: false };
  assert.equal(decide(face, [clasped], null, 0, 0, null), 'pray');
});
test('single-hand rules: mouth cover, temple tap, chin rest, side point and a high palm', () => {
  const base: Hand = { palm: [0, 0], thumb: [0, 0], index: [0, 0], middle: [0, 0], horizontal: false, vertical: true, open: false };
  assert.equal(decide(face, [{ ...base, palm: [150, 225], thumb: [130, 215], index: [150, 190], middle: [145, 190] }], null, 0, 0, null), 'son');
  assert.equal(decide(face, [{ ...base, palm: [85, 190], thumb: [90, 175], index: [95, 150], middle: [88, 180] }], null, 0, 0, null), 'roll_safe');
  assert.equal(decide(face, [{ ...base, palm: [150, 300], thumb: [140, 280], index: [150, 265], middle: [145, 285] }], null, 0, 0, null), 'batman_think');
  assert.equal(decide(face, [{ ...base, horizontal: true, vertical: false, palm: [260, 185], thumb: [270, 170], index: [330, 180], middle: [265, 175] }], null, 0, 0, null), 'objection');
  assert.equal(decide(face, [{ ...base, open: true, palm: [170, 30], thumb: [140, 20], index: [170, 5], middle: [160, 0] }], null, 0, 0, null), 'bless');
  assert.equal(decide(face, [{ ...base, open: true, palm: [260, 120], thumb: [250, 110], index: [265, 90], middle: [255, 95] }], null, 0, 0, null), 'hand_up');
});
test('calibration rejects too few samples and prevents zero-sigma triggers', () => {
  assert.equal(collectBaseline([face]), null);
  const samples = Array.from({ length: 40 }, () => ({ ...face, bs: { jawOpen: .25 } }));
  const baseline = collectBaseline(samples)!;
  assert.equal(baseline.samples, 40); assert.equal(baseline.sigma.jawOpen, .015);
  assert.equal(decide({ ...face, bs: { jawOpen: .26 } }, [], null, 0, 0, baseline), null);
  assert.equal(decide({ ...face, bs: { jawOpen: .8 } }, [], null, 0, 0, baseline), 'open_mouth');
});
