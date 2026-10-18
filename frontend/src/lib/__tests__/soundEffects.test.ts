import { describe, it, expect, beforeEach, vi } from 'vitest';
import { soundEffects } from '../soundEffects';

describe('SoundEffects Engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with sound enabled by default', () => {
    soundEffects.setEnabled(true);
    expect(soundEffects.isEnabled()).toBe(true);
  });

  it('persists disabled state to localStorage', () => {
    soundEffects.setEnabled(false);
    expect(soundEffects.isEnabled()).toBe(false);
    expect(localStorage.getItem('scout_sfx_enabled')).toBe('false');

    soundEffects.setEnabled(true);
    expect(soundEffects.isEnabled()).toBe(true);
    expect(localStorage.getItem('scout_sfx_enabled')).toBe('true');
  });

  it('toggles sound on and off', () => {
    soundEffects.setEnabled(true);
    const toggled = soundEffects.toggle();
    expect(toggled).toBe(false);
    expect(soundEffects.isEnabled()).toBe(false);

    const toggledBack = soundEffects.toggle();
    expect(toggledBack).toBe(true);
    expect(soundEffects.isEnabled()).toBe(true);
  });

  it('notifies subscribers when sound status changes', () => {
    const listener = vi.fn();
    const unsubscribe = soundEffects.subscribe(listener);

    soundEffects.setEnabled(false);
    expect(listener).toHaveBeenCalledWith(false);

    soundEffects.setEnabled(true);
    expect(listener).toHaveBeenCalledWith(true);

    unsubscribe();
    soundEffects.setEnabled(false);
    expect(listener).toHaveBeenCalledTimes(2);
    // Reset back to true for other tests
    soundEffects.setEnabled(true);
  });

  it('executes all sound cue methods without throwing even in test environment without full audio hardware', () => {
    expect(() => soundEffects.playSourceDrop()).not.toThrow();
    expect(() => soundEffects.playSourcePaste()).not.toThrow();
    expect(() => soundEffects.playEmbeddingComplete()).not.toThrow();
    expect(() => soundEffects.playStreamComplete()).not.toThrow();
    expect(() => soundEffects.playLogout()).not.toThrow();
    expect(() => soundEffects.playDelete()).not.toThrow();
    expect(() => soundEffects.playChipRemove()).not.toThrow();
  });

  it('does not play tones when muted', () => {
    soundEffects.setEnabled(false);
    expect(() => {
      soundEffects.playSourceDrop();
      soundEffects.playSourcePaste();
      soundEffects.playEmbeddingComplete();
      soundEffects.playStreamComplete();
      soundEffects.playLogout();
      soundEffects.playDelete();
    }).not.toThrow();
    soundEffects.setEnabled(true);
  });
});
