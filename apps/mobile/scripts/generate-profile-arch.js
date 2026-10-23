// Bakes the Profile arch (Figma "Rectangle 164", 942:5368) into assets/profile/arch.png.
//
// The design stacks six gradient fills plus a colour-burn layer. Drawing that live with react-native-svg
// and mixBlendMode costs offscreen layers and a big gradient raster on every Profile visit, which made
// the tab slide stutter on low-end phones. A static bitmap is one texture upload instead.
//
// Run from apps/mobile: node scripts/generate-profile-arch.js
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const W = 575;
const H = 534;
const OUT = path.join(__dirname, '..', 'assets', 'profile', 'arch.png');

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const lerp = (a, b, t) => a + (b - a) * t;

/** stops: [{ o, c: [r,g,b], a }] sorted by offset. Colours interpolate un-premultiplied, as in SVG. */
function sample(stops, t) {
  if (t <= stops[0].o) return { c: stops[0].c, a: stops[0].a };
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].o) {
      const p = stops[i - 1];
      const n = stops[i];
      const k = n.o === p.o ? 1 : (t - p.o) / (n.o - p.o);
      return { c: [lerp(p.c[0], n.c[0], k), lerp(p.c[1], n.c[1], k), lerp(p.c[2], n.c[2], k)], a: lerp(p.a, n.a, k) };
    }
  }
  const l = stops[stops.length - 1];
  return { c: l.c, a: l.a };
}

/** Radial gradient with an SVG gradientTransform matrix(a b c d e f) on the unit circle. */
function radial(m, stops) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  return (x, y) => {
    const px = x - e;
    const py = y - f;
    const ux = (d * px - c * py) / det;
    const uy = (-b * px + a * py) / det;
    return sample(stops, Math.hypot(ux, uy));
  };
}

const layers = [
  // 1. peach, left to right
  (x) =>
    sample(
      [
        { o: 0.278846, c: hex('#FDBE9B'), a: 1 },
        { o: 1, c: hex('#FDBE9B'), a: 0.01 },
      ],
      (x - 1) / 573,
    ),
  // 2. orange radial
  radial([100.585, -601.456, 703.618, 366.175, 108.228, 602.456], [
    { o: 0.326923, c: hex('#FF963A'), a: 1 },
    { o: 1, c: [1, 1, 1], a: 0 },
  ]),
  // 3. flat orange wash
  () => ({ c: hex('#FF8800'), a: 0.2 }),
  // 4. dark red radial
  radial([36.0219, 336.933, -870.72, 289.683, 145.088, 21.6889], [
    { o: 0, c: hex('#7B0000'), a: 1 },
    { o: 0.326923, c: hex('#A35336'), a: 1 },
    { o: 0.670958, c: hex('#F85555'), a: 0.07 },
    { o: 0.671058, c: hex('#77340F'), a: 0.5 },
    { o: 1, c: hex('#FF5B00'), a: 0 },
  ]),
];
const BURN = { c: hex('#EB7124'), a: 0.51 };
const fade = (y) =>
  sample(
    [
      { o: 0.399038, c: [1, 1, 1], a: 0 },
      { o: 1, c: hex('#ECF0F3'), a: 1 },
    ],
    (y - 1) / 532,
  );

// Straight-alpha "source over".
function over(dst, src) {
  const a = src.a + dst.a * (1 - src.a);
  if (a === 0) return { c: [0, 0, 0], a: 0 };
  const c = [0, 1, 2].map((i) => (src.c[i] * src.a + dst.c[i] * dst.a * (1 - src.a)) / a);
  return { c, a };
}

const burn = (cb, cs) => (cb >= 1 ? 1 : cs <= 0 ? 0 : 1 - Math.min(1, (1 - cb) / cs));

/** Coverage of the arch shape: a half disc (r 286.5 at 287.5,287.5) on a rectangle down to y 533. */
function coverage(x, y) {
  const cx = 287.5;
  const cy = 287.5;
  const r = 286.5;
  let d; // signed distance, negative inside
  if (y >= cy) d = Math.max(Math.abs(x - cx) - r, y - 533);
  else d = Math.hypot(x - cx, y - cy) - r;
  return Math.min(1, Math.max(0, 0.5 - d));
}

const png = new PNG({ width: W, height: H });
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const x = px + 0.5;
    const y = py + 0.5;
    const cov = coverage(x, y);
    const i = (py * W + px) * 4;
    if (cov === 0) continue;

    let px4 = { c: [0, 0, 0], a: 0 };
    for (const layer of layers) px4 = over(px4, layer(x, y));
    // 5. colour burn, composited against whatever is underneath
    const cs = px4.a === 0 ? BURN.c : BURN.c.map((s, k) => (1 - px4.a) * s + px4.a * burn(px4.c[k], s));
    px4 = over(px4, { c: cs, a: BURN.a });
    // 6. fade into the page background
    px4 = over(px4, fade(y));

    png.data[i] = Math.round(px4.c[0] * 255);
    png.data[i + 1] = Math.round(px4.c[1] * 255);
    png.data[i + 2] = Math.round(px4.c[2] * 255);
    png.data[i + 3] = Math.round(px4.a * cov * 255);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(png, { colorType: 6 }));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
