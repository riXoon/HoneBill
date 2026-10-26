// Builds the app icon set from the Figma icon tile (DRAFTS-HONEBILL, node 942:3774, "Frame 23").
//
// Figma only returns a ~255 px raster of the tile, far too small for a 1024 px icon, so this redraws it
// from the design's own numbers: the gradient stack (peach, orange radial, 20% orange, dark-red radial,
// 51% colour burn) and the three "Union" paths (planet-bee mark) blended with "overlay".
//
// Outputs (assets/):
//   icon.png           1024, full-bleed square (iOS and stores apply their own corner mask)
//   adaptive-icon.png  1024, art at 75% on transparent so Android masks never cut the mark
//   splash-icon.png    1024, the tile with its 20/216 rounded corners
//   favicon.png        48
//
// Run from apps/mobile: node scripts/generate-app-icon.js   (needs pngjs, which is in the repo root)
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ASSETS = path.join(__dirname, '..', 'assets');
const FRAME = 216.2667; // design units
const CORNER = 20; // design corner radius

const lerp = (a, b, t) => a + (b - a) * t;
const rgb = (r, g, b) => [r / 255, g / 255, b / 255];

function sample(stops, t) {
  if (t <= stops[0].o) return { c: stops[0].c, a: stops[0].a };
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].o) {
      const p = stops[i - 1];
      const n = stops[i];
      const k = n.o === p.o ? 1 : (t - p.o) / (n.o - p.o);
      return { c: [0, 1, 2].map((j) => lerp(p.c[j], n.c[j], k)), a: lerp(p.a, n.a, k) };
    }
  }
  const l = stops[stops.length - 1];
  return { c: l.c, a: l.a };
}

function radial([a, b, c, d, e, f], stops) {
  const det = a * d - b * c;
  return (x, y) => {
    const px = x - e;
    const py = y - f;
    // The Figma export draws these on an r=10 circle, so the stop offsets are distance / 10.
    return sample(stops, Math.hypot((d * px - c * py) / det, (-b * px + a * py) / det) / 10);
  };
}

const layers = [
  (x) =>
    sample(
      [
        { o: 0.27885, c: rgb(253, 190, 155), a: 1 },
        { o: 1, c: rgb(253, 190, 155), a: 0.01 },
      ],
      x / FRAME,
    ),
  radial([3.7964, -24.45, 26.557, 14.886, 40.471, 244.5], [
    { o: 0.32692, c: rgb(255, 150, 58), a: 1 },
    { o: 0.49519, c: rgb(255, 176, 107), a: 0.75 },
    { o: 0.66346, c: rgb(255, 202, 156), a: 0.5 },
    { o: 1, c: [1, 1, 1], a: 0 },
  ]),
  () => ({ c: rgb(255, 136, 0), a: 0.2 }),
  radial([1.3596, 13.697, -32.863, 11.776, 54.383, 8.4104], [
    { o: 0, c: rgb(123, 0, 0), a: 1 },
    { o: 0.040865, c: rgb(128, 10, 7), a: 1 },
    { o: 0.081731, c: rgb(133, 21, 14), a: 1 },
    { o: 0.16346, c: rgb(143, 42, 27), a: 1 },
    { o: 0.24519, c: rgb(153, 62, 41), a: 1 },
    { o: 0.32692, c: rgb(163, 83, 54), a: 1 },
    { o: 0.67096, c: rgb(248, 85, 85), a: 0.07 },
    { o: 0.67101, c: rgb(183, 68, 50), a: 0.285 },
    { o: 0.67106, c: rgb(119, 52, 15), a: 0.5 },
    { o: 1, c: rgb(255, 91, 0), a: 0 },
  ]),
];
const BURN = { c: rgb(235, 113, 36), a: 0.51 };
const MARK = rgb(247, 247, 251);

function over(dst, src) {
  const a = src.a + dst.a * (1 - src.a);
  if (a === 0) return { c: [0, 0, 0], a: 0 };
  return { c: [0, 1, 2].map((i) => (src.c[i] * src.a + dst.c[i] * dst.a * (1 - src.a)) / a), a };
}
const burn = (cb, cs) => (cb >= 1 ? 1 : cs <= 0 ? 0 : 1 - Math.min(1, (1 - cb) / cs));
const overlay = (cb, cs) => (cb <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs));

// ---- path parsing / rasterising (absolute M L H V C Z only, which is all the design uses) ----
const MARK_PATHS = [
  { rule: 'evenodd', d: 'M82.5828 21.8271C82.7366 21.8278 82.8904 21.8282 83.0441 21.8305C83.1276 21.8318 83.211 21.8339 83.2944 21.8356C83.4241 21.8384 83.5538 21.842 83.6834 21.8459C83.8792 21.8516 84.0747 21.8589 84.2699 21.8672C84.3701 21.8715 84.4703 21.8758 84.5704 21.8808C84.6988 21.8871 84.827 21.8947 84.9551 21.9021C85.0278 21.9064 85.1004 21.9103 85.173 21.9149C94.556 22.5053 103.14 26.0397 110.018 31.6068C110.144 31.7085 110.269 31.8113 110.394 31.9145C110.436 31.9496 110.479 31.985 110.521 32.0202C110.67 32.1444 110.819 32.2692 110.966 32.3954C110.989 32.415 111.012 32.4346 111.035 32.4542C111.382 32.752 111.723 33.056 112.061 33.3647C112.085 33.3873 112.11 33.4103 112.135 33.4329C112.597 33.8582 113.052 34.2935 113.497 34.739C114.05 35.2934 114.588 35.8624 115.11 36.4441C115.137 36.4742 115.164 36.5044 115.191 36.5345C115.316 36.6753 115.442 36.8168 115.565 36.9591C115.597 36.9959 115.63 37.033 115.661 37.0699C115.942 37.3949 116.218 37.7244 116.489 38.0572C116.537 38.1166 116.586 38.1757 116.634 38.2354C116.718 38.3397 116.802 38.4449 116.885 38.55C118.251 40.2768 119.493 42.1077 120.593 44.0302C120.862 44.5013 121.332 44.8306 121.868 44.916C146.448 48.8341 162.999 56.183 163 64.6032C162.999 75.9135 133.137 85.2897 94.0624 87.0151C100.409 87.5832 106.249 88.5443 111.315 89.8107C114.697 90.6563 115.93 94.6504 113.463 97.1171C105.5 105.077 94.5105 110 82.3717 110C82.0804 110 81.7899 109.996 81.5 109.99C81.2101 109.996 80.9196 110 80.6283 110C68.4895 110 57.4997 105.077 49.5372 97.1171C47.0704 94.6504 48.3028 90.6563 51.6849 89.8107C56.7511 88.5443 62.5913 87.5832 68.9376 87.0151C29.8635 85.2897 0.000750317 75.9135 0 64.6032C0.000527356 56.183 16.5517 48.8341 41.1322 44.916C41.6676 44.8306 42.1378 44.5013 42.4073 44.0302C43.5073 42.1077 44.7487 40.2768 46.1153 38.55C46.1983 38.4449 46.2816 38.3397 46.3656 38.2354C46.4136 38.1757 46.4627 38.1166 46.5111 38.0572C46.782 37.7244 47.0578 37.3949 47.3385 37.0699C47.3704 37.033 47.4027 36.9959 47.4347 36.9591C47.5584 36.8168 47.6836 36.6753 47.8092 36.5345C47.8361 36.5044 47.8632 36.4742 47.8901 36.4441C48.4121 35.8624 48.9497 35.2934 49.5032 34.739C49.948 34.2935 50.4025 33.8582 50.8651 33.4329C50.8898 33.4103 50.9145 33.3873 50.9392 33.3647C51.2766 33.056 51.6184 32.752 51.9649 32.4542C51.9878 32.4346 52.011 32.415 52.0339 32.3954C52.1813 32.2692 52.3301 32.1444 52.4791 32.0202C52.5213 31.985 52.5636 31.9496 52.6059 31.9145C52.7307 31.8113 52.8562 31.7085 52.9821 31.6068C59.8596 26.0397 68.444 22.5053 77.827 21.9149C77.8996 21.9103 77.9722 21.9064 78.0449 21.9021C78.173 21.8947 78.3012 21.8871 78.4296 21.8808C78.5297 21.8758 78.6299 21.8715 78.7301 21.8672C78.9253 21.8589 79.1208 21.8516 79.3166 21.8459C79.4462 21.842 79.5759 21.8384 79.7056 21.8356C79.789 21.8339 79.8724 21.8318 79.9559 21.8305C80.1096 21.8282 80.2634 21.8278 80.4172 21.8271C80.4876 21.8268 80.5579 21.8254 80.6283 21.8254C80.6975 21.8254 80.767 21.8268 80.836 21.8271C80.9936 21.8278 81.151 21.8289 81.3085 21.8314C81.3723 21.8323 81.4362 21.8327 81.5 21.8339C81.5638 21.8327 81.6277 21.8323 81.6915 21.8314C81.849 21.8289 82.0064 21.8278 82.164 21.8271C82.233 21.8268 82.3025 21.8254 82.3717 21.8254C82.4421 21.8254 82.5124 21.8268 82.5828 21.8271ZM81.5 37.5397C81.3569 37.5397 81.2168 37.574 81.0889 37.6369C80.9976 37.6818 80.9126 37.7412 80.8377 37.8142C80.6581 37.9895 80.5521 38.228 80.5279 38.4758C80.4199 39.5937 80.3178 40.7127 80.2206 41.8306C80.039 43.9196 79.8758 46.0095 79.732 48.0986C79.2143 55.6152 75.5082 64.0414 69.2968 67.6587C64.7 70.3351 50.4293 67.2214 45.762 66.3492C40.5567 65.3765 36.5058 61.5635 37.6498 56.3854C37.8306 55.5673 38.0355 54.7539 38.2636 53.9471C38.6137 52.708 37.6157 51.464 36.3398 51.623C19.6874 53.7003 9.01616 56.8996 9.01536 60.4887C9.01773 65.6377 30.9793 69.9841 61.0578 71.3656C71.0105 73.0973 78.884 81.4349 79.4647 91.6948C79.6632 95.2023 79.9156 98.7104 80.2206 102.218C80.3178 103.336 80.4199 104.455 80.5279 105.573C80.5521 105.82 80.6581 106.059 80.8377 106.234C80.9058 106.301 80.9823 106.356 81.0642 106.399C81.1986 106.469 81.3477 106.508 81.5 106.508C81.7453 106.508 81.9826 106.409 82.1623 106.234C82.3419 106.059 82.4479 105.82 82.4721 105.573C82.5801 104.455 82.6822 103.336 82.7794 102.218C83.0844 98.7104 83.3368 95.2023 83.5353 91.6948C84.116 81.4349 91.9895 73.0973 101.942 71.3656C132.021 69.9841 153.982 65.6377 153.985 60.4887C153.984 56.8996 143.313 53.7003 126.66 51.623C125.384 51.464 124.386 52.708 124.736 53.9471C124.964 54.7539 125.169 55.5673 125.35 56.3854C126.494 61.5635 122.443 65.3765 117.238 66.3492C112.571 67.2214 98.3 70.3351 93.7032 67.6587C87.4917 64.0414 83.7857 55.6152 83.268 48.0986C83.1242 46.0095 82.961 43.9196 82.7794 41.8306C82.6822 40.7127 82.5801 39.5937 82.4721 38.4758C82.4479 38.228 82.3419 37.9895 82.1623 37.8142C81.9826 37.639 81.7454 37.5398 81.5 37.5397Z' },
  { rule: 'nonzero', d: 'M50.992 0C54.223 0 58.0887 1.23582 61.6289 3.3531C65.2121 5.49609 68.7197 8.69352 71.0844 12.9077C71.9098 14.3787 71.3886 16.2413 69.9199 17.0681C68.4511 17.8949 66.5914 17.3728 65.7659 15.9018C64.01 12.7726 61.336 10.2954 58.5007 8.59972C55.6225 6.87846 52.8323 6.11111 50.992 6.11111C49.3071 6.11111 47.9412 4.74309 47.9412 3.05556C47.9412 1.36802 49.3071 0 50.992 0Z' },
  { rule: 'nonzero', d: 'M112.008 0C113.693 0 115.059 1.36802 115.059 3.05556C115.059 4.74309 113.693 6.11111 112.008 6.11111C110.168 6.11111 107.377 6.87846 104.499 8.59972C101.664 10.2954 98.99 12.7726 97.2341 15.9018C96.4086 17.3728 94.5489 17.8949 93.0801 17.0681C91.6114 16.2413 91.0902 14.3787 91.9156 12.9077C94.2803 8.69352 97.7879 5.49609 101.371 3.3531C104.911 1.23582 108.777 0 112.008 0Z' },
];
// The 163 x 110 mark sits centred in the 216.27 tile, nudged by (+0.37, +0.33).
const MARK_X = FRAME / 2 + 0.37 - 163 / 2;
const MARK_Y = FRAME / 2 + 0.33 - 110 / 2;

/** Flattens a path into closed polygons [[x,y],...] in mark space. */
function flatten(d) {
  const tokens = d.match(/[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const polys = [];
  let cur = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let i = 0;
  const num = () => parseFloat(tokens[i++]);
  let cmd = '';
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M') {
      x = num();
      y = num();
      sx = x;
      sy = y;
      cur = [[x, y]];
      polys.push(cur);
      cmd = 'L';
    } else if (cmd === 'L') {
      x = num();
      y = num();
      cur.push([x, y]);
    } else if (cmd === 'H') {
      x = num();
      cur.push([x, y]);
    } else if (cmd === 'V') {
      y = num();
      cur.push([x, y]);
    } else if (cmd === 'C') {
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
      for (let s = 1; s <= 14; s++) {
        const t = s / 14;
        const u = 1 - t;
        cur.push([
          u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
      x = x3;
      y = y3;
    } else if (cmd === 'Z') {
      x = sx;
      y = sy;
      cmd = '';
    } else {
      throw new Error('unsupported path command ' + cmd);
    }
  }
  return polys;
}
const MARK_POLYS = MARK_PATHS.map((p) => ({ rule: p.rule, polys: flatten(p.d) }));

const SS = 4; // sub-rows per pixel

/** Coverage mask (Float32Array size*size) of the mark paths, in canvas pixels. */
function markCoverage(size, toPx) {
  const cov = new Float32Array(size * size);
  for (const { rule, polys } of MARK_POLYS) {
    const edges = [];
    for (const poly of polys) {
      for (let k = 0; k < poly.length; k++) {
        const [ax, ay] = toPx(poly[k][0] + MARK_X, poly[k][1] + MARK_Y);
        const [bx, by] = toPx(poly[(k + 1) % poly.length][0] + MARK_X, poly[(k + 1) % poly.length][1] + MARK_Y);
        if (ay !== by) edges.push(ay < by ? { x0: ax, y0: ay, x1: bx, y1: by, dir: 1 } : { x0: bx, y0: by, x1: ax, y1: ay, dir: -1 });
      }
    }
    const layer = new Float32Array(size * size);
    for (let sy = 0; sy < size * SS; sy++) {
      const y = (sy + 0.5) / SS;
      const hits = [];
      for (const e of edges) {
        if (y >= e.y0 && y < e.y1) hits.push({ x: e.x0 + ((y - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), dir: e.dir });
      }
      hits.sort((p, q) => p.x - q.x);
      let wind = 0;
      const row = Math.floor(y);
      for (let h = 0; h < hits.length - 1; h++) {
        wind += hits[h].dir;
        const inside = rule === 'evenodd' ? h % 2 === 0 : wind !== 0;
        if (!inside) continue;
        const a = Math.max(0, hits[h].x);
        const b = Math.min(size, hits[h + 1].x);
        for (let px = Math.floor(a); px < Math.ceil(b); px++) {
          layer[row * size + px] += (Math.min(b, px + 1) - Math.max(a, px)) / SS;
        }
      }
    }
    // union of paths (the evenodd body and the two antennae do not overlap)
    for (let n = 0; n < cov.length; n++) cov[n] = Math.min(1, cov[n] + layer[n]);
  }
  return cov;
}

/** inset: fraction of the canvas left transparent on each side. rounded: apply the 20/216 corner radius. */
function render(size, { inset = 0, rounded = false } = {}) {
  const art = size * (1 - 2 * inset);
  const S = art / FRAME; // design unit -> pixel
  const off = size * inset;
  const toPx = (dx, dy) => [off + dx * S, off + dy * S];
  const mark = markCoverage(size, toPx);
  const png = new PNG({ width: size, height: size });

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5 - off) / S;
      const y = (py + 0.5 - off) / S;
      const i = (py * size + px) * 4;
      if (x < 0 || y < 0 || x > FRAME || y > FRAME) continue;

      let cover = 1;
      if (rounded) {
        const cx = Math.min(Math.max(x, CORNER), FRAME - CORNER);
        const cy = Math.min(Math.max(y, CORNER), FRAME - CORNER);
        cover = Math.min(1, Math.max(0, 0.5 - (Math.hypot(x - cx, y - cy) - CORNER) * S));
        if (cover === 0) continue;
      }

      let p = { c: [0, 0, 0], a: 0 };
      for (const layer of layers) p = over(p, layer(x, y));
      const cs = p.a === 0 ? BURN.c : BURN.c.map((s, k) => (1 - p.a) * s + p.a * burn(p.c[k], s));
      p = over(p, { c: cs, a: BURN.a });

      const m = mark[py * size + px];
      if (m > 0) {
        const blended = p.c.map((cb, k) => (1 - p.a) * MARK[k] + p.a * overlay(cb, MARK[k]));
        p = { c: p.c.map((cb, k) => lerp(cb, blended[k], m)), a: Math.max(p.a, m) };
      }

      png.data[i] = Math.round(p.c[0] * 255);
      png.data[i + 1] = Math.round(p.c[1] * 255);
      png.data[i + 2] = Math.round(p.c[2] * 255);
      png.data[i + 3] = Math.round(p.a * cover * 255);
    }
  }
  return png;
}

function write(name, png) {
  const file = path.join(ASSETS, name);
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: 6 }));
  console.log('wrote', name, fs.statSync(file).size, 'bytes');
}

write('icon.png', render(1024));
write('adaptive-icon.png', render(1024, { inset: 0.125 }));
write('splash-icon.png', render(1024, { rounded: true }));
write('favicon.png', render(48));
