"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import type { MotionValue } from "motion/react";
import { Children, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

// A 3D staircase of planes driven by virtual scroll. Numbers measured from the reference demo:
// plane p (its distance from the current position) sits at translate3d(240p, -84p, -288p),
// tilted -50deg about Y under 2000px perspective. Wheel input moves a spring-smoothed position
// (one plane per 240px). Scroll speed adds a vertical travelling wave to the planes:
//   y += speed * 240 * 0.09 * cos(2pi (p + 4) / 13)
// which dies away as the scroll slows. Only y moves; tilt, x and z never do.

const STEP = { x: 240, y: -84, z: -288 };
const TILT = -50;
const PERSPECTIVE = 2000;
const PX_PER_PLANE = 240;
const WAVE = { gain: 0.09, period: 13, phase: 4 };
const POS_SPRING = { stiffness: 50, damping: 14 }; // the position eases in over ~0.4s
const SPEED_SPRING = { stiffness: 80, damping: 22 }; // the wave lags the scroll a little
const INDEX_SPRING = { stiffness: 140, damping: 22 }; // planes glide when one is added or removed
const INSTANT = { duration: 0.001, bounce: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function Plane({
  index, pos, speed, reduce, active, onSelect, className, children,
}: {
  index: number;
  pos: MotionValue<number>;
  speed: MotionValue<number>;
  reduce: boolean;
  active: boolean;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}) {
  const idx = useSpring(index, reduce ? INSTANT : INDEX_SPRING);
  useEffect(() => idx.set(index), [idx, index]); // useSpring(number) ignores later changes; follow them
  const p = useTransform([pos, idx], ([s, i]: number[]) => i - s);
  const x = useTransform(p, (q) => STEP.x * q);
  const z = useTransform(p, (q) => STEP.z * q);
  const y = useTransform([p, speed], ([q, v]: number[]) => {
    const wave = reduce ? 0 : v * PX_PER_PLANE * WAVE.gain * Math.cos((2 * Math.PI * (q + WAVE.phase)) / WAVE.period);
    return STEP.y * q + wave;
  });
  return (
    <motion.li
      style={{ x, y, z, rotateY: TILT }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: reduce ? 0 : index * 0.06 } }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.25 } }}
      onClick={() => !active && onSelect()}
      aria-current={active || undefined}
      className={`pointer-events-auto absolute left-[30%] top-[54%] w-[17rem] -translate-x-1/2 -translate-y-1/2 ${
        active ? "" : "cursor-pointer"
      } ${className ?? ""}`}
    >
      {/* only the current plane is interactive; the others are clicked to bring them forward */}
      <div inert={!active}>{children}</div>
    </motion.li>
  );
}

export function VelocityGallery({
  children, label, className, planeClassName, buttonClassName,
}: {
  children: ReactNode; // one keyed element per plane
  label: string; // accessible name of the scrollable region
  className?: string; // the stage (give it a height)
  planeClassName?: string; // the plane surface (background, border, radius)
  buttonClassName?: string; // the previous/next buttons
}) {
  const items = Children.toArray(children);
  const last = Math.max(0, items.length - 1);
  const reduce = useReducedMotion() ?? false;

  const target = useMotionValue(0); // where the wheel/keys/drag want to be, in planes
  const pos = useSpring(target, reduce ? INSTANT : POS_SPRING);
  const speed = useSpring(useVelocity(pos), SPEED_SPRING);
  const [active, setActive] = useState(0);
  useMotionValueEvent(target, "change", (v) => setActive(Math.round(v)));

  const stage = useRef<HTMLDivElement>(null);
  const go = (n: number) => target.set(clamp(Math.round(n), 0, last));

  useEffect(() => {
    if (target.get() > last) target.set(last); // a plane was removed from the end
  }, [last, target]);

  // Wheel: the same 1px = 1/240 plane as the reference, then settle on the nearest plane. At either
  // end the event is left alone so the page can keep scrolling.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let settle: number | undefined;
    const onWheel = (e: WheelEvent) => {
      const now = target.get();
      const next = clamp(now + e.deltaY / PX_PER_PLANE, 0, last);
      if (next === now) return;
      e.preventDefault();
      target.set(next);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => go(target.get()), 140);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last, target]);

  // Drag (touch and mouse), ignoring presses that start on a control inside a plane.
  const drag = useRef<{ y: number; from: number; moved: boolean } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button, a, input, textarea, select")) return;
    drag.current = { y: e.clientY, from: target.get(), moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dy) < 6) return;
    if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId);
    d.moved = true;
    target.set(clamp(d.from - dy / PX_PER_PLANE, 0, last));
  };
  const onPointerUp = () => {
    if (drag.current?.moved) go(target.get());
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next: Record<string, number> = {
      ArrowDown: active + 1, ArrowRight: active + 1, PageDown: active + 1,
      ArrowUp: active - 1, ArrowLeft: active - 1, PageUp: active - 1,
      Home: 0, End: last,
    };
    if (e.key in next) {
      e.preventDefault();
      go(next[e.key]);
    }
  };

  return (
    <div>
      <div
        ref={stage}
        role="region"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ perspective: PERSPECTIVE, touchAction: "none" }}
        className={`relative overflow-hidden ${className ?? ""}`}
      >
        {/* pointer-events-none: the list is a depth-0 plane of its own and would win the hit test over
            the front card; each plane opts back in */}
        <ul className="pointer-events-none absolute inset-0 [transform-style:preserve-3d]">
          <AnimatePresence initial={false}>
            {items.map((child, i) => (
              <Plane
                key={(child as { key: string }).key}
                index={i}
                pos={pos}
                speed={speed}
                reduce={reduce}
                active={i === active}
                onSelect={() => go(i)}
                className={planeClassName}
              >
                {child}
              </Plane>
            ))}
          </AnimatePresence>
        </ul>
      </div>
      {items.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button type="button" onClick={() => go(active - 1)} disabled={active === 0} className={buttonClassName}>
            Previous
          </button>
          <span aria-live="polite" className="min-w-[6rem] text-center text-sm tabular-nums">
            {active + 1} / {items.length}
          </span>
          <button type="button" onClick={() => go(active + 1)} disabled={active === last} className={buttonClassName}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
