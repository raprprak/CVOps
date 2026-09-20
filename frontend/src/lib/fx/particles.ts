// Particle morph: N points that move between two shapes, driven by one number (0 = `from`,
// 1 = `to`). Plain three.js + a GLSL ShaderMaterial (no TSL/WebGPU: stable and small), animated
// by motion's vanilla `animate`. No React here; ParticleMorph.tsx is the thin adapter.

import { animate } from "motion";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";
import { page, sphere, type Shape } from "./shapes";

export interface MorphOptions {
  count?: number; // particles; 6000 is smooth on a laptop iGPU
  from?: Shape;
  to?: Shape;
  colors?: [string, string]; // particles blend from the first to the second as they morph
  size?: number; // point size (px at distance 4, before pixel ratio)
}

export interface Morph {
  /** Animate the morph to `value` (0..1). */
  morphTo(value: number, duration?: number): void;
  /** Morph there and back forever, holding `hold` seconds at each end. */
  loop(hold?: number, duration?: number): void;
  dispose(): void;
}

const VERT = /* glsl */ `
uniform float uProgress;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
attribute vec3 aTarget;
attribute float aRand;
varying float vMix;
varying float vRand;

void main() {
  // Staggered per particle, so the cloud peels away instead of moving as one block.
  float t = clamp(uProgress * 1.7 - aRand * 0.7, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);

  // The target slowly spins, so the formed shape (a globe) keeps turning.
  float a = uTime * 0.3;
  float c = cos(a);
  float s = sin(a);
  vec3 tg = vec3(aTarget.x * c - aTarget.z * s, aTarget.y, aTarget.x * s + aTarget.z * c);

  vec3 p = mix(position, tg, t);

  // Arc outward mid-flight along a per-particle direction, then settle.
  vec3 dir = vec3(sin(aRand * 43.0), cos(aRand * 71.0), sin(aRand * 97.0));
  p += dir * sin(t * 3.14159265) * 0.55;

  // Idle drift so nothing is ever perfectly still.
  p += 0.025 * vec3(
    sin(uTime * 0.9 + aRand * 31.0),
    cos(uTime * 0.7 + aRand * 17.0),
    sin(uTime * 0.5 + aRand * 23.0)
  );

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixelRatio / -mv.z;
  vMix = t;
  vRand = aRand;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
varying float vMix;
varying float vRand;

void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  vec3 col = mix(uA, uB, clamp(vRand * 0.6 + vMix * 0.5, 0.0, 1.0));
  gl_FragColor = vec4(col, smoothstep(0.5, 0.05, d) * 0.9);
  #include <colorspace_fragment>
}
`;

const EASE: [number, number, number, number] = [0.45, 0, 0.15, 1];

export function createParticleMorph(canvas: HTMLCanvasElement, opts: MorphOptions = {}): Morph {
  const { count = 6000, from = page(), to = sphere(), colors = ["#60a5fa", "#fb923c"], size = 14 } = opts;

  const start = new Float32Array(count * 3);
  const target = new Float32Array(count * 3);
  const rand = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    start.set(from(i, count), i * 3);
    target.set(to(i, count), i * 3);
    rand[i] = Math.random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(start, 3));
  geometry.setAttribute("aTarget", new BufferAttribute(target, 3));
  geometry.setAttribute("aRand", new BufferAttribute(rand, 1));

  const uniforms = {
    uProgress: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: size },
    uPixelRatio: { value: 1 },
    uA: { value: new Color(colors[0]) },
    uB: { value: new Color(colors[1]) },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false; // the shader moves points far from the (start-only) bounds

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  scene.add(points);
  const camera = new PerspectiveCamera(40, 1, 0.1, 50);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t0 = performance.now();
  const draw = () => {
    uniforms.uTime.value = reduced ? 0 : (performance.now() - t0) / 1000;
    renderer.render(scene, camera);
  };

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    uniforms.uPixelRatio.value = dpr;
    camera.aspect = w / h;
    camera.position.z = 4.2 * Math.max(1, 0.75 / camera.aspect); // keep the shape in frame when narrow
    camera.updateProjectionMatrix();
    draw();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  // Only render while on screen and the tab is visible. Reduced motion never runs a loop: it
  // draws a frame whenever the morph value changes.
  let visible = true;
  let raf = 0;
  const frame = () => {
    draw();
    raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    const run = !reduced && visible && !document.hidden;
    if (run && !raf) raf = requestAnimationFrame(frame);
    if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const intersection = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    sync();
  });
  intersection.observe(canvas);
  document.addEventListener("visibilitychange", sync);
  sync();

  let current: { stop(): void } | undefined;
  const set = (v: number) => {
    uniforms.uProgress.value = v;
    if (reduced) draw();
  };

  return {
    morphTo(value, duration = 2.2) {
      current?.stop();
      current = animate(uniforms.uProgress.value, value, {
        duration: reduced ? 0 : duration,
        ease: EASE,
        onUpdate: set,
      });
    },
    loop(hold = 1.4, duration = 2.6) {
      current?.stop();
      if (reduced) return;
      current = animate(0, 1, {
        duration,
        ease: EASE,
        repeat: Infinity,
        repeatType: "reverse",
        repeatDelay: hold,
        onUpdate: set,
      });
    },
    dispose() {
      current?.stop();
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", sync);
      geometry.dispose();
      material.dispose();
      renderer.dispose(); // not forceContextLoss: React strict mode remounts on the same canvas
    },
  };
}
