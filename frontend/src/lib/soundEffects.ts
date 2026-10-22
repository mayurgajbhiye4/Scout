/**
 * Sound Effects Engine for AI Research Workspace (Scout)
 * 
 * Provides subtle, calibrated retro-arcade acoustic feedback using the native Web Audio API.
 * - Zero external audio file dependencies (no 404s, zero latency, offline ready)
 * - Precise mathematical frequency synthesis with smooth click-free gain envelopes
 * - Master mute toggle with localStorage persistence
 * - React hook and singleton API
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'scout_sfx_enabled';

class SoundEffectsEngine {
  private audioCtx: AudioContext | null = null;
  private enabled: boolean = true;
  private listeners: Set<(enabled: boolean) => void> = new Set();
  private isUnlocked: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        // Default to true if not explicitly set to 'false'
        this.enabled = stored !== 'false';
      } catch {
        this.enabled = true;
      }

      // Attach one-time unlock listeners for browser autoplay policies
      const unlock = () => {
        if (this.isUnlocked) return;
        const ctx = this.getContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().then(() => {
            this.isUnlocked = true;
          }).catch(() => {});
        } else if (ctx && ctx.state === 'running') {
          this.isUnlocked = true;
        }
      };

      window.addEventListener('click', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true, passive: true });
      window.addEventListener('dragover', unlock, { once: true, passive: true });
      window.addEventListener('drop', unlock, { once: true, passive: true });
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean): void {
    this.enabled = val;
    try {
      localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false');
    } catch {}
    this.listeners.forEach((fn) => fn(this.enabled));
    if (val) {
      this.playToggleChirp(true);
    }
  }

  public toggle(): boolean {
    const next = !this.enabled;
    this.setEnabled(next);
    return next;
  }

  public subscribe(listener: (enabled: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Helper to play an arcade note with precise envelope to avoid clicks/pops
   */
  private playTone({
    freq,
    type = 'triangle',
    startTime,
    duration,
    gain = 0.1,
    slideFreq,
  }: {
    freq: number;
    type?: OscillatorType;
    startTime: number;
    duration: number;
    gain?: number;
    slideFreq?: number;
  }) {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      if (slideFreq !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(10, slideFreq),
          startTime + duration
        );
      }

      // Smooth attack & exponential decay to prevent clicks
      const attackTime = 0.005; // 5ms
      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.linearRampToValueAtTime(gain, startTime + attackTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.0001,
        startTime + Math.max(attackTime + 0.01, duration)
      );

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    } catch {
      // Audio execution gracefully ignored if blocked by browser policy
    }
  }

  // ── 1. DROPPING A SOURCE (Crisp arcade item-pickup / cartridge insert) ──
  public playSourceDrop(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Note 1: 520Hz (A4-ish), duration 40ms
    this.playTone({
      freq: 520,
      type: 'triangle',
      startTime: now,
      duration: 0.045,
      gain: 0.11,
    });
    // Note 2: 784Hz (G5), duration 80ms
    this.playTone({
      freq: 784,
      type: 'triangle',
      startTime: now + 0.045,
      duration: 0.08,
      gain: 0.12,
    });
  }

  // ── 2. PASTING A SOURCE (Crisp tactile arcade pop) ──
  public playSourcePaste(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Quick two-step bright blip
    this.playTone({
      freq: 460,
      type: 'triangle',
      startTime: now,
      duration: 0.035,
      gain: 0.10,
    });
    this.playTone({
      freq: 690,
      type: 'sine',
      startTime: now + 0.035,
      duration: 0.075,
      gain: 0.11,
    });
  }

  // ── 3. EMBEDDING COMPLETED (Sparkling arcade victory chime / 4-note arpeggio) ──
  public playEmbeddingComplete(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // C5 (523.25Hz) -> E5 (659.25Hz) -> G5 (783.99Hz) -> C6 (1046.5Hz)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const isLast = i === notes.length - 1;
      this.playTone({
        freq,
        type: 'sine',
        startTime: now + i * 0.045,
        duration: isLast ? 0.18 : 0.045,
        gain: isLast ? 0.10 : 0.08,
      });
    });
  }

  // ── 4. CHAT STREAMING COMPLETED (Soft arcade AI resolution chime) ──
  public playStreamComplete(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Gentle dual-frequency cadence: E5 (659Hz) -> A5 (880Hz) with silky decay
    this.playTone({
      freq: 659.25,
      type: 'sine',
      startTime: now,
      duration: 0.065,
      gain: 0.07,
    });
    this.playTone({
      freq: 880.0,
      type: 'sine',
      startTime: now + 0.065,
      duration: 0.19,
      gain: 0.08,
    });
  }

  // ── 5. LOGGING OUT (Warm arcade power-down farewell) ──
  public playLogout(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Descending warm tones: A4 (440Hz) -> E4 (329.6Hz) -> A3 (220Hz)
    this.playTone({
      freq: 440,
      type: 'sine',
      startTime: now,
      duration: 0.075,
      gain: 0.09,
    });
    this.playTone({
      freq: 329.6,
      type: 'sine',
      startTime: now + 0.075,
      duration: 0.075,
      gain: 0.08,
    });
    this.playTone({
      freq: 220,
      type: 'sine',
      startTime: now + 0.15,
      duration: 0.16,
      gain: 0.09,
    });
  }

  // ── 6. DELETE ACTION HAPPENS (Arcade disintegrate / pop / zap) ──
  public playDelete(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Rapid downward pitch slide from 340Hz down to 110Hz
    this.playTone({
      freq: 340,
      slideFreq: 110,
      type: 'triangle',
      startTime: now,
      duration: 0.095,
      gain: 0.11,
    });
  }

  // ── 7. REMOVING ATTACHED CARTRIDGE / CHIP (Subtle discard blip) ──
  public playChipRemove(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.playTone({
      freq: 260,
      slideFreq: 160,
      type: 'triangle',
      startTime: now,
      duration: 0.06,
      gain: 0.08,
    });
  }

  // ── 8. TOGGLE CONFIRMATION CHIRP ──
  private playToggleChirp(on: boolean): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (on) {
      this.playTone({
        freq: 580,
        type: 'sine',
        startTime: now,
        duration: 0.04,
        gain: 0.08,
      });
      this.playTone({
        freq: 880,
        type: 'sine',
        startTime: now + 0.04,
        duration: 0.08,
        gain: 0.09,
      });
    }
  }

  // ── 9. RATE LIMIT WARNING (Retro arcade dual-tone tilt buzzer / cooldown siren) ──
  public playRateLimitWarning(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Rapid dual pulse with pitch decay — classic arcade tilt/caution buzz
    // Pulse 1: 340Hz -> 230Hz (triangle)
    this.playTone({
      freq: 340,
      slideFreq: 230,
      type: 'triangle',
      startTime: now,
      duration: 0.08,
      gain: 0.12,
    });
    // Pulse 2: 260Hz -> 170Hz (triangle)
    this.playTone({
      freq: 260,
      slideFreq: 170,
      type: 'triangle',
      startTime: now + 0.09,
      duration: 0.11,
      gain: 0.13,
    });
  }

  // ── 10. RATE LIMIT RESTORED / COOLDOWN COMPLETE (Arcade recovery chime) ──
  public playCooldownComplete(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Upward arcade chirp: 440Hz -> 880Hz
    this.playTone({
      freq: 440,
      type: 'sine',
      startTime: now,
      duration: 0.05,
      gain: 0.08,
    });
    this.playTone({
      freq: 880,
      type: 'triangle',
      startTime: now + 0.05,
      duration: 0.09,
      gain: 0.10,
    });
  }

  // ── 11. THEME SWITCH (Warm luminous chirp for light mode, deep synth chord for dark mode) ──
  public playThemeSwitch(isLight: boolean): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (isLight) {
      // Ascending bright sunrise chirp: 523Hz -> 784Hz -> 1046Hz
      this.playTone({
        freq: 523.25,
        type: 'sine',
        startTime: now,
        duration: 0.04,
        gain: 0.08,
      });
      this.playTone({
        freq: 784.0,
        type: 'sine',
        startTime: now + 0.035,
        duration: 0.05,
        gain: 0.09,
      });
      this.playTone({
        freq: 1046.5,
        type: 'triangle',
        startTime: now + 0.075,
        duration: 0.09,
        gain: 0.10,
      });
    } else {
      // Descending calm night chime: 880Hz -> 587Hz -> 440Hz
      this.playTone({
        freq: 880.0,
        type: 'sine',
        startTime: now,
        duration: 0.04,
        gain: 0.08,
      });
      this.playTone({
        freq: 587.33,
        type: 'sine',
        startTime: now + 0.035,
        duration: 0.05,
        gain: 0.09,
      });
      this.playTone({
        freq: 440.0,
        type: 'triangle',
        startTime: now + 0.075,
        duration: 0.10,
        gain: 0.10,
      });
    }
  }
}

export const soundEffects = new SoundEffectsEngine();

/**
 * React hook to access sound effects state and controls in components
 */
export function useSoundEffects() {
  const [enabled, setEnabled] = useState<boolean>(() => soundEffects.isEnabled());

  useEffect(() => {
    return soundEffects.subscribe((val) => setEnabled(val));
  }, []);

  return {
    soundEnabled: enabled,
    toggleSound: () => soundEffects.toggle(),
    setSoundEnabled: (val: boolean) => soundEffects.setEnabled(val),
    playSourceDrop: () => soundEffects.playSourceDrop(),
    playSourcePaste: () => soundEffects.playSourcePaste(),
    playEmbeddingComplete: () => soundEffects.playEmbeddingComplete(),
    playStreamComplete: () => soundEffects.playStreamComplete(),
    playLogout: () => soundEffects.playLogout(),
    playDelete: () => soundEffects.playDelete(),
    playChipRemove: () => soundEffects.playChipRemove(),
    playRateLimitWarning: () => soundEffects.playRateLimitWarning(),
    playCooldownComplete: () => soundEffects.playCooldownComplete(),
    playThemeSwitch: (isLight: boolean) => soundEffects.playThemeSwitch(isLight),
  };
}
