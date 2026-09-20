// Shapes for the particle morph: a shape is just "where does particle i of n sit". Plain math,
// no three.js, so importing these never pulls the renderer into the main bundle.
// The whole lib/fx folder imports nothing from the app, so it can be lifted into its own package.

/** Where particle i of n sits. An optional 4th value tints it (0 = first colour, 1 = second). */
export type Shape = (i: number, n: number) => [x: number, y: number, z: number, tint?: number];

/** An evenly gridded page (A4-ish proportions), facing the camera. */
export const page =
  (w = 1.5, h = 2.1): Shape =>
  (i, n) => {
    const cols = Math.max(2, Math.ceil(Math.sqrt((n * w) / h)));
    const rows = Math.max(2, Math.ceil(n / cols));
    return [
      ((i % cols) / (cols - 1) - 0.5) * w,
      (0.5 - Math.floor(i / cols) / (rows - 1)) * h,
      0,
    ];
  };

/** Points spread evenly over a sphere (Fibonacci lattice). */
export const sphere =
  (radius = 1.1): Shape =>
  (i, n) => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.399963229728653; // golden angle
    return [Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius];
  };

// -- resume skeleton ------------------------------------------------------------------
// Draw a resume layout (name, contact, section headings with rules, bullet lines) on a hidden
// canvas and use its opaque pixels as particle positions. Headings are tinted warm, body text cool.

type Px = [x: number, y: number, tint: number];

const W = 240;
const H = 336; // same proportions as page(1.5, 2.1)

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawResume(ctx: CanvasRenderingContext2D) {
  const rnd = mulberry32(7); // fixed seed: the same skeleton every time
  const M = 20;
  // heading = red channel 255 (read back as the warm tint), body = black
  const bar = (x: number, y: number, w: number, h: number, heading = false) => {
    if (y + h > H - M) return; // ran off the page: drop it
    ctx.fillStyle = heading ? "#ff0000" : "#000000";
    ctx.fillRect(x, y, w, h);
  };

  bar(M, 22, 120, 16, true); // name
  bar(M, 48, 160, 6); // contact lines
  bar(M, 60, 110, 6);

  let y = 82;
  const section = (lines: number, bullets: boolean) => {
    bar(M, y, 70, 8, true); // heading
    y += 14;
    bar(M, y, W - 2 * M, 2); // rule
    y += 10;
    for (let k = 0; k < lines; k++) {
      const indent = bullets ? 12 : 0;
      if (bullets) bar(M + 1, y, 7, 7);
      bar(M + indent, y, (W - 2 * M - indent) * (0.6 + rnd() * 0.4), 7);
      y += 15;
    }
    y += 10;
  };
  section(2, false); // summary
  section(2, false); // skills
  section(3, true); // experience
  section(2, true); // more experience / education
}

/** A resume page drawn as dots: name, contact, headings, rules and bullet lines. */
export const resumePage = (w = 1.5, h = 2.1): Shape => {
  let pts: Px[] | undefined; // built on first use: needs `document`, so never during SSR
  return (i) => {
    if (!pts) {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      drawResume(ctx);
      const { data } = ctx.getImageData(0, 0, W, H);
      pts = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const k = (y * W + x) * 4;
          if (data[k + 3] > 128) pts.push([x, y, data[k] > 128 ? 0.7 : 0.05]);
        }
      }
      // shuffle once, so any subset of the particles still covers the whole layout evenly
      const rnd = mulberry32(11);
      for (let a = pts.length - 1; a > 0; a--) {
        const b = Math.floor(rnd() * (a + 1));
        [pts[a], pts[b]] = [pts[b], pts[a]];
      }
    }
    const [px, py, tint] = pts[i % pts.length];
    // sub-pixel jitter, so a wrap-around (more particles than pixels) is not a stack of twins
    return [((px + Math.random() - 0.5) / W - 0.5) * w, (0.5 - (py + Math.random() - 0.5) / H) * h, 0, tint];
  };
};
