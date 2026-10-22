import { useEffect, useRef } from 'react';
import { useTheme } from '@/features/theme/useTheme';
import { cn } from '@/lib/utils';

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

export interface NeonArcadeBackgroundProps {
  isIndexing?: boolean;
  isEmbedding?: boolean;
  isExtracting?: boolean;
  progressPercent?: number;
}

export default function NeonArcadeBackground({
  isIndexing = false,
  isEmbedding = false,
  isExtracting: _isExtracting = false,
  progressPercent = 0,
}: NeonArcadeBackgroundProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ isIndexing, isEmbedding, isLight });

  useEffect(() => {
    stateRef.current = { isIndexing, isEmbedding, isLight };
  }, [isIndexing, isEmbedding, isLight]);

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

    // Neon arcade color palette - Deep Pacific Teal / Quantum Cyan
    const darkColors: string[] = [
      'rgba(20, 184, 166, ',  // Electric Teal (#14b8a6)
      'rgba(45, 212, 191, ',  // Quantum Cyan Neon Glow (#2dd4bf)
      'rgba(13, 148, 136, ',  // Deep Cyan Teal (#0d9488)
      'rgba(94, 234, 212, ',  // Glint Cyan (#5eead4)
    ];

    const lightColors: string[] = [
      'rgba(15, 118, 110, ',  // Deep Ocean Teal (#0f766e)
      'rgba(17, 94, 89, ',    // Abyssal Pine Teal (#115e59)
      'rgba(20, 184, 166, ',  // Electric Teal (#14b8a6)
      'rgba(13, 148, 136, ',  // Ocean Teal (#0d9488)
      'rgba(45, 212, 191, ',  // Quantum Cyan (#2dd4bf)
    ];

    const activeColors = stateRef.current.isLight ? lightColors : darkColors;

    // Create 45 ambient floating cyber pixel embers
    const particleCount = 45;
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      const chosenColor = activeColors[Math.floor(Math.random() * activeColors.length)] || activeColors[0] || 'rgba(20, 184, 166, ';
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

      const speedMultiplier = stateRef.current.isEmbedding
        ? 1.9
        : stateRef.current.isIndexing
        ? 1.4
        : 1.0;

      // Draw each neon pixel particle
      for (const p of particles) {
        p.y += p.speedY * speedMultiplier;
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
        const pulseFactor = stateRef.current.isEmbedding ? 0.35 : 0.25;
        const currentOpacity = Math.max(0.15, Math.min(0.95, p.opacity + Math.sin(tick * p.pulseSpeed * speedMultiplier) * pulseFactor));

        // Draw pixel glow (arcade square pixel)
        ctx.fillStyle = `${p.color}${currentOpacity})`;
        ctx.shadowColor = `${p.color}${stateRef.current.isLight ? '0.6' : '0.8'})`;
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
  }, [isLight]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
      {/* ── AMBIENT NEON GLOW ORBS ────────────────────────────────────────── */}
      <div
        className={cn(
          "absolute top-[12%] left-[18%] w-[420px] h-[420px] rounded-full blur-[120px] animate-[neonPulseSlow_8s_ease-in-out_infinite]",
          isLight ? "bg-teal-300/20" : "bg-[#042f2e]/35"
        )}
      />
      <div
        className={cn(
          "absolute bottom-[18%] right-[15%] w-[460px] h-[460px] rounded-full blur-[130px] animate-[neonPulseSlow_10s_ease-in-out_infinite_2s]",
          isLight ? "bg-cyan-300/18" : "bg-[#0f766e]/25"
        )}
      />
      <div
        className={cn(
          "absolute top-[42%] right-[32%] w-[340px] h-[340px] rounded-full blur-[110px] animate-[neonPulseSlow_9s_ease-in-out_infinite_4s]",
          isLight ? "bg-teal-200/25" : "bg-[#14b8a6]/15"
        )}
      />

      {/* ── UPPER PERSPECTIVE CEILING GRID ─────────────────────────────────── */}
      <div className={cn("neon-grid-ceiling", isLight ? "opacity-60" : "opacity-70")} />

      {/* ── HORIZON LASER LINE & FLASHING GLOW ──────────────────────────────── */}
      <div
        className={cn(
          "neon-horizon-line",
          isIndexing && "neon-horizon-line-indexing",
          isEmbedding && "neon-horizon-line-embedding"
        )}
      >
        {/* Active Horizon Linear Progress Beam */}
        {isIndexing && (
          <div className="neon-horizon-progress-container">
            {/* The primary advancing laser beam across the horizon */}
            <div
              className="neon-horizon-progress-bar"
              style={{
                width: `${Math.max(4, Math.min(100, progressPercent || (isEmbedding ? 88 : 42)))}%`,
              }}
            />
            {/* Traveling laser scanner pulse traversing the horizon */}
            <div
              className={cn(
                "neon-horizon-progress-scanner",
                isEmbedding && "neon-horizon-progress-scanner-fast"
              )}
            />
          </div>
        )}
      </div>

      {/* Ambient Horizon Flashing Light Streak when Embedding */}
      {isIndexing && (
        <div
          className={cn(
            "absolute left-0 right-0 top-[48%] -translate-y-1/2 h-8 pointer-events-none transition-opacity duration-300",
            isEmbedding
              ? (isLight ? "bg-gradient-to-r from-transparent via-[#14b8a6]/30 to-transparent blur-md animate-pulse" : "bg-gradient-to-r from-transparent via-[#2dd4bf]/25 to-transparent blur-md animate-pulse")
              : (isLight ? "bg-gradient-to-r from-transparent via-[#0f766e]/25 to-transparent blur-md" : "bg-gradient-to-r from-transparent via-[#14b8a6]/20 to-transparent blur-md")
          )}
        />
      )}

      {/* ── LOWER 3D PERSPECTIVE NEON GRID FLOOR ───────────────────────────── */}
      <div className="neon-grid-floor" />

      {/* ── FLOATING NEON PIXEL PARTICLES CANVAS ────────────────────────────── */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-80" />

      {/* ── CRT SCANLINES OVERLAY ─────────────────────────────────────────── */}
      <div className={cn("absolute inset-0 arcade-scanlines pointer-events-none", isLight ? "opacity-25" : "opacity-40")} />

      {/* ── RADIAL RETRO VIGNETTE ─────────────────────────────────────────── */}
      <div className="absolute inset-0 arcade-vignette pointer-events-none" />
    </div>
  );
}
