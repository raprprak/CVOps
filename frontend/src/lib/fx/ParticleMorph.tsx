"use client";

import { useEffect, useRef } from "react";
import { createParticleMorph, type Morph, type MorphOptions } from "./particles";

interface Props extends MorphOptions {
  /** false = `from` shape, true = `to` shape (animated). Ignored while `loop` is on. */
  morphed?: boolean;
  /** Ambient mode: morph there and back forever. */
  loop?: boolean;
  className?: string;
}

// Shapes, colours and size are read once when the canvas is created (pass stable values); only
// `morphed` and `loop` react to changes.
export default function ParticleMorph({ morphed = false, loop = false, className, ...opts }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const morph = useRef<Morph | null>(null);

  useEffect(() => {
    const m = createParticleMorph(canvas.current!, opts);
    morph.current = m;
    return () => {
      m.dispose();
      morph.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.count, opts.size]);

  useEffect(() => {
    if (loop) morph.current?.loop();
    else morph.current?.morphTo(morphed ? 1 : 0);
  }, [morphed, loop, opts.count, opts.size]);

  return <canvas ref={canvas} aria-hidden="true" className={className} />;
}
