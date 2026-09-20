// Shapes for the particle morph: a shape is just "where does particle i of n sit". Plain math,
// no three.js, so importing these never pulls the renderer into the main bundle.
// The whole lib/fx folder imports nothing from the app, so it can be lifted into its own package.

export type Shape = (i: number, n: number) => [number, number, number];

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
