import { useEffect, useRef } from "react";

type ParticleCanvasProps = { className?: string; particleCount?: number };
type Particle = { x: number; y: number; vx: number; vy: number; r: number };

export function ParticleCanvas({ className, particleCount = 28 }: ParticleCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const darkMq = window.matchMedia("(prefers-color-scheme: dark)");
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const particles: Particle[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 1;
    let h = 1;
    let raf = 0;
    let alpha = darkMq.matches ? 0.16 : 0.11;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles.length = 0;
      for (let i = 0; i < particleCount; i += 1) {
        particles.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22, r: Math.random() * 1.4 + 0.5 });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `hsla(220,20%,58%,${alpha})`;
      for (const p of particles) {
        if (!motionMq.matches) {
          p.x += p.vx;
          p.y += p.vy;
        }
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;
        if (p.y < -4) p.y = h + 4;
        if (p.y > h + 4) p.y = -4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    const onTheme = (e: MediaQueryListEvent) => {
      alpha = e.matches ? 0.16 : 0.11;
    };

    resize();
    draw();
    darkMq.addEventListener("change", onTheme);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      darkMq.removeEventListener("change", onTheme);
      window.removeEventListener("resize", resize);
    };
  }, [particleCount]);

  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 ${className ?? ""}`} />;
}

export default ParticleCanvas;
