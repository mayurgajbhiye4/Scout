import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  opacity: number;
  color: string;
  pulseSpeed: number;
}

export default function NeonArcadeBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Neon arcade color palette
    const colors: string[] = [
      'rgba(59, 130, 246, ',  // Electric Blue (#3b82f6)
      'rgba(6, 182, 212, ',   // Neon Cyan (#06b6d4)
      'rgba(168, 85, 247, ',  // Synthwave Purple (#a855f7)
      'rgba(96, 165, 250, ',  // Light Blue (#60a5fa)
    ];

    // Create 45 ambient floating cyber pixel embers
    const particleCount = 45;
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      const chosenColor = colors[Math.floor(Math.random() * colors.length)] || colors[0] || 'rgba(59, 130, 246, ';
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() < 0.3 ? 3 : Math.random() < 0.7 ? 2 : 1.5,
        speedY: -(0.2 + Math.random() * 0.45),
        speedX: (Math.random() - 0.5) * 0.25,
        opacity: 0.2 + Math.random() * 0.6,
        color: chosenColor,
        pulseSpeed: 0.015 + Math.random() * 0.02,
      });
    }

    let tick = 0;
    const render = () => {
      tick++;
      ctx.clearRect(0, 0, width, height);

      // Draw each neon pixel particle
      for (const p of particles) {
        p.y += p.speedY;
        p.x += p.speedX;

        // Wrap around vertically
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        // Wrap around horizontally
        if (p.x < -10) p.x = width + 10;
        else if (p.x > width + 10) p.x = -10;

        // Subtle opacity pulsing
        const currentOpacity = Math.max(0.1, Math.min(0.9, p.opacity + Math.sin(tick * p.pulseSpeed) * 0.25));

        // Draw pixel glow (arcade square pixel)
        ctx.fillStyle = `${p.color}${currentOpacity})`;
        ctx.shadowColor = `${p.color}0.8)`;
        ctx.shadowBlur = p.size > 2 ? 8 : 4;
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
      }

      ctx.shadowBlur = 0;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
      {/* ── AMBIENT NEON GLOW ORBS ────────────────────────────────────────── */}
      <div
        className="absolute top-[12%] left-[18%] w-[420px] h-[420px] rounded-full bg-[#1e3a8a]/20 blur-[120px] animate-[neonPulseSlow_8s_ease-in-out_infinite]"
      />
      <div
        className="absolute bottom-[18%] right-[15%] w-[460px] h-[460px] rounded-full bg-[#7c3aed]/18 blur-[130px] animate-[neonPulseSlow_10s_ease-in-out_infinite_2s]"
      />
      <div
        className="absolute top-[42%] right-[32%] w-[340px] h-[340px] rounded-full bg-[#06b6d4]/15 blur-[110px] animate-[neonPulseSlow_9s_ease-in-out_infinite_4s]"
      />

      {/* ── UPPER PERSPECTIVE CEILING GRID ─────────────────────────────────── */}
      <div className="neon-grid-ceiling opacity-70" />

      {/* ── HORIZON LASER LINE & GLOW ───────────────────────────────────────── */}
      <div className="neon-horizon-line" />

      {/* ── LOWER 3D PERSPECTIVE NEON GRID FLOOR ───────────────────────────── */}
      <div className="neon-grid-floor" />

      {/* ── FLOATING NEON PIXEL PARTICLES CANVAS ────────────────────────────── */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-80" />

      {/* ── CRT SCANLINES OVERLAY ─────────────────────────────────────────── */}
      <div className="absolute inset-0 arcade-scanlines opacity-40 pointer-events-none" />

      {/* ── RADIAL RETRO VIGNETTE ─────────────────────────────────────────── */}
      <div className="absolute inset-0 arcade-vignette pointer-events-none" />
    </div>
  );
}
