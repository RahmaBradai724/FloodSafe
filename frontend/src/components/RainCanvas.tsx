import { useEffect, useRef } from "react";

/** Falling rain drawn over the map; density and darkness follow the replayed rain (mm per hour). */
export default function RainCanvas({ mmPerHour }: { mmPerHour: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const intensity = useRef(mmPerHour);
  intensity.current = mmPerHour;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let drops: { x: number; y: number; v: number; l: number }[] = [];
    let raf = 0;

    const resize = () => {
      el.width = el.clientWidth * devicePixelRatio;
      el.height = el.clientHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = () => {
      const w = el.width;
      const h = el.height;
      // 0 mm/h: no drops; 8 mm/h and more: a heavy downpour
      const level = Math.min(1, intensity.current / 8);
      const target = reduced ? 0 : Math.round(level * 900);
      while (drops.length < target) drops.push({ x: Math.random() * w, y: Math.random() * h, v: 14 + Math.random() * 10, l: 10 + Math.random() * 14 });
      if (drops.length > target) drops = drops.slice(0, target);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(30, 41, 70, ${0.32 * level})`;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(200, 220, 255, 0.55)";
      ctx.lineWidth = 1.2 * devicePixelRatio;
      ctx.beginPath();
      for (const d of drops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.l * 0.25, d.y + d.l);
        d.y += d.v * devicePixelRatio;
        d.x -= d.v * 0.25 * devicePixelRatio;
        if (d.y > h) {
          d.y = -d.l;
          d.x = Math.random() * w * 1.2;
        }
      }
      ctx.stroke();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvas} className="rain" aria-hidden />;
}
