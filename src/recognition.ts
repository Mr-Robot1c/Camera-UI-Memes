// Pose rules ported from ../its_giving_v2.py; distances use face-relative pixels.
export const REACTIONS = [
  { id: 'time_out', label: 'Time out', hint: 'Make a T with both hands', file: 'time_out.jpeg' },
  { id: 'heart', label: 'Heart hands', hint: 'Form a heart with both hands', file: 'heart.jpeg' },
  { id: 'cover_nose', label: 'Cover face', hint: 'Cover your nose and mouth', file: 'cover_nose.jpeg' },
  { id: 'dance', label: 'Dance', hint: 'Raise both elbows up high', file: 'dance.jpeg' },
  { id: 'nose_closed', label: 'Skuba', hint: 'Pinch your nose shut', file: 'nose_closed.gif' },
  { id: 'shush', label: 'Shhh', hint: 'Tap to pick — quiet please', file: 'shush.jpg', hidden: true },
  { id: 'hand_up', label: 'Scare', hint: 'Open palm beside your head', file: 'hand_up.jpeg' },
  { id: 'tongue_out', label: 'Tongue out', hint: 'Mouth open, tongue out', file: 'tongue_out.jpeg' },
  { id: 'open_mouth', label: 'Gasp', hint: 'Drop your jaw in surprise', file: 'open_mouth.jpeg' },
  { id: 'disgusted', label: 'Disgust', hint: 'Scrunch your nose or frown', file: 'disgusted.jpeg' },
  { id: 'talking_to_wall', label: 'To the wall', hint: 'Gesture while talking', file: 'talking_to_wall.gif' },
  { id: 'suspicious', label: 'Side-eye', hint: 'Turn your head and squint', file: 'suspicious.jpeg' },
  { id: 'superman', label: 'Superman', hint: 'Big confident smile', file: 'superman.jpg' },
  { id: 'shrek_smug', label: 'Smug', hint: 'Smirk with one corner', file: 'shrek_smug.jpg', hidden: true },
  { id: 'welcome', label: 'Welcome', hint: 'Open both arms out wide', file: 'welcome.jpg' },
  { id: 'who_me', label: 'Who, me?', hint: 'Point at your chest', file: 'who_me.jpg' },
  { id: 'werewolf', label: 'Lonely wolf', hint: 'Fists up and howl', file: 'werewolf.jpg', hidden: true },
  { id: 'chill', label: 'Chilling', hint: 'Close your eyes and relax', file: 'chill.jpg' },
  { id: 'monkey_think', label: 'Monke', hint: 'Finger on your lips', file: 'monkey_think.jpg' },
  { id: 'come_here', label: 'Stop right there', hint: 'Reach a hand out low toward the camera', file: 'come_here.jpg' },
  { id: 'you_cat', label: 'Sigma', hint: 'Point right at the camera', file: 'you_cat.jpg', hidden: true },
  { id: 'absolute_cinema', label: 'Cinema', hint: 'Raise both palms beside your head', file: 'absolute_cinema.jpg' },
  { id: 'pray', label: 'Thinking', hint: 'Palms together at your lips', file: 'pray.jpg' },
  { id: 'objection', label: 'Objection!', hint: 'Point hard to the side', file: 'objection.jpg' },
  { id: 'roll_safe', label: 'Big brain', hint: 'Tap your temple', file: 'roll_safe.jpg' },
  { id: 'batman_think', label: 'Hmm', hint: 'Hand on your chin', file: 'batman_think.jpg' },
  { id: 'son', label: 'Son ✌️', hint: 'Cover your mouth with one hand', file: 'son.jpg' },
  { id: 'bless', label: 'Blessing', hint: 'Flat palm high above your head', file: 'bless.jpg' },
  { id: 'selfie', label: 'Selfie', hint: 'Tap to pick — say cheese', file: 'selfie.jpg', hidden: true },
  { id: 'stare', label: 'Let him cook', hint: 'Turn your head and stare, no squint', file: 'stare.jpg', hidden: true },
] as const;
export type Pose = typeof REACTIONS[number]['id'];
export type Point = [number, number];
export type Landmark = { x: number; y: number; visibility?: number };
export type Face = { pts: Point[]; w: number; h: number; center: Point; nose: Point; mouth: Point; top: Point; eyeY: number; turn: number; bs: Record<string, number> };
export type Hand = { palm: Point; thumb: Point; index: Point; middle: Point; horizontal: boolean; vertical: boolean; open: boolean };
export type Body = { seen: boolean; elbowsUp: boolean };
export type Baseline = { version: 1; mean: Record<string, number>; sigma: Record<string, number>; samples: number };
export const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export function makeFace(lm: Landmark[], categories: { categoryName: string; score: number }[], w: number, h: number): Face {
  const p = lm.map(l => [l.x * w, l.y * h] as Point);
  const x = p.map(p => p[0]), y = p.map(p => p[1]);
  const x0 = Math.min(...x), x1 = Math.max(...x), y0 = Math.min(...y), y1 = Math.max(...y);
  return { pts: p, w: x1 - x0, h: y1 - y0, center: [(x0 + x1) / 2, (y0 + y1) / 2], nose: p[1], top: p[10], mouth: midpoint(p[13], p[14]), eyeY: (p[33][1] + p[263][1]) / 2, turn: (p[1][0] - p[234][0]) / Math.max(p[454][0] - p[234][0], .001) - .5, bs: Object.fromEntries(categories.map(c => [c.categoryName, c.score])) };
}
export function makeHand(lm: Landmark[], w: number, h: number): Hand {
  const p = lm.map(l => [l.x * w, l.y * h] as Point);
  const palm: Point = [0, 0];
  for (const i of [0, 5, 9, 13, 17]) { palm[0] += p[i][0] / 5; palm[1] += p[i][1] / 5; }
  const dx = p[9][0] - p[0][0], dy = p[9][1] - p[0][1];
  return { palm, thumb: p[4], index: p[8], middle: p[12], horizontal: Math.abs(dx) > 1.5 * Math.abs(dy), vertical: Math.abs(dy) > 1.5 * Math.abs(dx), open: [8, 12, 16, 20].filter(t => dist(p[0], p[t]) > 1.2 * dist(p[0], p[t - 2])).length >= 3 };
}
export function makeBody(lm: Landmark[]): Body {
  const seen = [11, 12, 13, 14].every(i => (lm[i].visibility ?? 1) > .5);
  return { seen, elbowsUp: seen && [13, 14].every(i => lm[i].y < (lm[11].y + lm[12].y) / 2) };
}
const generic: Record<string, number> = { jawOpen: .08, eyeSquintLeft: .1, eyeSquintRight: .1, eyeBlinkLeft: .1, eyeBlinkRight: .1, noseSneerLeft: .03, noseSneerRight: .03, browDownLeft: .06, browDownRight: .06, mouthFrownLeft: .05, mouthFrownRight: .05, mouthUpperUpLeft: .05, mouthUpperUpRight: .05, mouthSmileLeft: .1, mouthSmileRight: .1 };
export function decide(face: Face | null, hands: Hand[], body: Body | null, tongue: number, gesture: number, base: Baseline | null): Pose | null {
  if (!face) return null;
  const b = (name: string) => face.bs[name] ?? 0;
  const z = (name: string) => (b(name) - (base?.mean[name] ?? generic[name] ?? .02)) / Math.max(base?.sigma[name] ?? .035, .015);
  const pair = (name: string) => (b(name + 'Left') + b(name + 'Right')) / 2;
  const zp = (name: string) => (z(name + 'Left') + z(name + 'Right')) / 2;
  const near = (a: Point, b: Point, k: number) => dist(a, b) < k * face.w;
  if (hands.length >= 2) {
    const [a, b] = hands;
    for (const [top, under] of [[a, b], [b, a]]) if (top.horizontal && under.vertical && top.palm[1] < under.palm[1] && near(under.middle, top.palm, .6)) return 'time_out';
    // Prayer hands would also satisfy the heart rule, but their palms touch;
    // heart palms stay far apart, so check pray first.
    if (a.vertical && b.vertical && near(a.palm, b.palm, .3) && near(a.palm, face.mouth, .8) && near(b.palm, face.mouth, .8)) return 'pray';
    if (near(a.index, b.index, .3) && near(a.thumb, b.thumb, .3) && a.index[1] + b.index[1] < a.thumb[1] + b.thumb[1]) return 'heart';
    if (near(a.palm, face.mouth, .6) && near(b.palm, face.mouth, .6)) return 'cover_nose';
    // Both open palms raised beside the head (not behind it — that's dance).
    const beside = (h: Hand) => h.open && h.palm[1] < face.nose[1] && Math.abs(h.palm[0] - face.nose[0]) > .6 * face.w && Math.abs(h.palm[0] - face.nose[0]) < 1.8 * face.w;
    if (beside(a) && beside(b) && (a.palm[0] - face.nose[0]) * (b.palm[0] - face.nose[0]) < 0) return 'absolute_cinema';
    // Both hands up on or behind the head is dance, whatever the mouth does —
    // this used to leak into gasp when the body model missed the elbows.
    const onHead = (hd: Hand) => hd.palm[1] < face.eyeY && Math.abs(hd.palm[0] - face.nose[0]) < 1.1 * face.w && hd.palm[1] > face.top[1] - .8 * face.h;
    if (onHead(a) && onHead(b)) return 'dance';
    // Below the nose (cinema is above) and only moderately wide, so the hands
    // still fit a phone's 3:4 selfie frame.
    if (a.open && b.open && [a, b].every(h => h.palm[1] > face.nose[1] && Math.abs(h.palm[0] - face.nose[0]) > .7 * face.w) && (a.palm[0] - face.nose[0]) * (b.palm[0] - face.nose[0]) < 0) return 'welcome';
  }
  if (body?.elbowsUp && hands.every(h => Math.abs(h.palm[0] - face.nose[0]) < 1.3 * face.w && h.palm[1] < face.eyeY + .3 * face.h)) return 'dance';
  const solo = hands.length === 1;
  for (const h of hands) {
    if (near(h.thumb, face.nose, .4) && near(h.index, face.nose, .4) && near(h.thumb, h.index, .3)) return 'nose_closed';
    // A hand thrust at the camera looks far bigger than the face — a depth
    // proxy that separates these from the on-face gestures at normal distance.
    const size = Math.max(dist(h.palm, h.thumb), dist(h.palm, h.index), dist(h.palm, h.middle));
    if (size > 1.4 * face.w && h.palm[1] >= face.mouth[1] + .8 * face.h) return 'come_here';
    // Clasped prayer hands are often detected as ONE tall hand: fingertips at
    // the lips, palm down at the chin, larger than a single relaxed hand.
    if (h.vertical && size >= .8 * face.w && size <= 1.4 * face.w && near(h.index, face.mouth, .3) && near(h.palm, [face.mouth[0], face.mouth[1] + .45 * face.h] as Point, .5)) return 'pray';
    // One finger resting on the lips, palm clear of the mouth: monke.
    if (solo && h.vertical && near(h.index, face.mouth, .25) && !near(h.palm, face.mouth, .3)) return 'monkey_think';
    // One-hand mouth cover; a nose pinch keeps thumb and index together, a
    // flat covering hand does not, which separates son from skuba.
    if (solo && near(h.palm, face.mouth, .3) && !near(h.thumb, h.index, .25)) return 'son';
    if (!h.open && Math.abs(h.index[0] - face.nose[0]) > .35 * face.w && Math.abs(h.index[0] - face.nose[0]) < face.w && Math.abs(h.index[1] - face.eyeY) < .3 * face.h) return 'roll_safe';
    if (!h.open && h.index[1] > face.mouth[1] + .1 * face.h && (near(h.index, [face.mouth[0], face.mouth[1] + .3 * face.h] as Point, .35) || near(h.thumb, [face.mouth[0], face.mouth[1] + .3 * face.h] as Point, .35))) return 'batman_think';
    if (!h.open && Math.abs(h.index[0] - face.nose[0]) > 1.1 * face.w && Math.abs(h.index[0] - face.nose[0]) > Math.abs(h.palm[0] - face.nose[0]) + .15 * face.w && h.index[1] > face.top[1] && h.index[1] < face.mouth[1] + face.h) return 'objection';
    // Above the crown it's a blessing; beside the head (crown to nose) it's
    // the scare hand — split by height so they stop colliding.
    if (h.open && h.palm[1] < face.top[1] - .3 * face.h && Math.abs(h.palm[0] - face.nose[0]) < 1.4 * face.w) return 'bless';
    if (h.open && h.palm[1] < face.nose[1] && h.palm[1] > face.top[1] - .3 * face.h && Math.abs(h.palm[0] - face.nose[0]) > .8 * face.w) return 'hand_up';
    if (!h.open && Math.abs(h.index[0] - face.nose[0]) < .7 * face.w && h.index[1] > face.mouth[1] + .8 * face.h) return 'who_me';
  }
  if (tongue > .35) return 'tongue_out';
  // A visible tongue vetoes the gasp so tongue_out doesn't lose the race.
  if (z('jawOpen') >= 6 && b('jawOpen') >= .3 && tongue < .2) return 'open_mouth';
  const disgust = 2 * Math.min(zp('noseSneer'), 8) + Math.min(zp('browDown'), 8) + Math.min(zp('mouthFrown'), 8) + Math.min(zp('mouthUpperUp'), 8);
  if ((zp('noseSneer') >= 3 && pair('noseSneer') >= .05) || disgust >= 12) return 'disgusted';
  if (zp('mouthSmile') >= 4 && pair('mouthSmile') >= .45) return 'superman';
  if (hands.length && gesture > .035) return 'talking_to_wall';
  if (Math.abs(face.turn - (base?.mean.turn_signed ?? 0)) > .15 && Math.max(zp('eyeSquint'), zp('eyeBlink')) >= 4 && Math.max(pair('eyeSquint'), pair('eyeBlink')) >= .18) return 'suspicious';
  if (zp('eyeBlink') >= 3 && pair('eyeBlink') >= .55 && Math.abs(face.turn - (base?.mean.turn_signed ?? 0)) < .12) return 'chill';
  return null;
}
// Time-based persistence keeps the original feel across different phone frame rates.
const arm: Partial<Record<Pose, number>> = { suspicious: 400, talking_to_wall: 300, dance: 300, open_mouth: 200, tongue_out: 250, disgusted: 250, superman: 350, welcome: 250, who_me: 300, chill: 700, come_here: 250, absolute_cinema: 250, pray: 300, monkey_think: 300, objection: 250, roll_safe: 300, batman_think: 300, son: 250, bless: 250 };
export class PoseGate {
  candidate: Pose | null = null; since = 0; shown: Pose | null = null; heldAt = 0;
  update(pose: Pose | null, now: number) {
    if (pose !== this.candidate) { this.candidate = pose; this.since = now; }
    if (pose && now - this.since >= (arm[pose] ?? 150)) { this.shown = pose; this.heldAt = now; }
    if (now - this.heldAt > 500) this.shown = null;
    return this.shown;
  }
}
export function collectBaseline(samples: Face[]): Baseline | null {
  if (samples.length < 30) return null;
  const rows = samples.map(f => ({ ...f.bs, turn_signed: f.turn }));
  const mean: Record<string, number> = {}, sigma: Record<string, number> = {};
  for (const key of Object.keys(rows[0])) {
    const values = rows.map(r => (r as Record<string, number>)[key] ?? 0);
    mean[key] = values.reduce((a, b) => a + b, 0) / values.length;
    sigma[key] = Math.min(.08, Math.max(.015, Math.sqrt(values.reduce((s, v) => s + (v - mean[key]) ** 2, 0) / values.length)));
  }
  return { version: 1, samples: rows.length, mean, sigma };
}
const lips = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
export function tongueScore(scratch: CanvasRenderingContext2D, source: CanvasImageSource, sourceW: number, sourceH: number, face: Face, hands: Hand[]): number {
  if ((face.bs.jawOpen ?? 0) < .18 || hands.some(h => dist(h.palm, face.mouth) < .7 * face.w)) return 0;
  const poly = lips.map(i => face.pts[i]);
  const x0 = Math.max(0, Math.floor(Math.min(...poly.map(p => p[0])))), y0 = Math.max(0, Math.floor(Math.min(...poly.map(p => p[1]))));
  const bw = Math.min(sourceW - x0, Math.ceil(Math.max(...poly.map(p => p[0]))) - x0), bh = Math.min(sourceH - y0, Math.ceil(Math.max(...poly.map(p => p[1]))) - y0);
  if (bw < 8 || bh < 8) return 0;
  // Sample the mouth region at a bounded resolution so full-res video stays cheap.
  const w = Math.max(8, Math.round(bw * Math.min(1, 96 / bw))), h = Math.max(8, Math.round(bh * Math.min(1, 96 / bw)));
  scratch.canvas.width = w; scratch.canvas.height = h;
  scratch.drawImage(source, x0, y0, bw, bh, 0, 0, w, h);
  const path = new Path2D(); poly.forEach((p, i) => { const px = (p[0] - x0) * w / bw, py = (p[1] - y0) * h / bh; if (i) path.lineTo(px, py); else path.moveTo(px, py); }); path.closePath();
  const rgba = scratch.getImageData(0, 0, w, h).data; let total = 0, pink = 0;
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    if (!scratch.isPointInPath(path, i, j) || !scratch.isPointInPath(path, i, j - 1) || !scratch.isPointInPath(path, i, j + 1)) continue;
    const at = (j * w + i) * 4, r = rgba[at], g = rgba[at + 1], b = rgba[at + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const hue = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
    total++; if ((hue < 24 || hue > 320) && d / Math.max(max, 1) * 255 > 70 && max > 110) pink++;
  }
  return total >= 40 ? pink / total : 0;
}
