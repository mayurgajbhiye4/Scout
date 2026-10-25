import React, { useEffect, useState, useCallback } from 'react';
import { soundEffects } from '@/lib/soundEffects';
import { ThemeContext, type Theme } from './ThemeContext';

const THEME_STORAGE_KEY = 'scout_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
          return stored;
        }
      } catch {
        // Storage unavailable (private mode / blocked) — theme just won't persist
      }
    }
    return 'dark';
  });

  const applyTheme = useCallback((targetTheme: Theme) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(targetTheme);
    root.setAttribute('data-theme', targetTheme);
    root.style.colorScheme = targetTheme;
  }, []);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage unavailable (private mode / blocked) — theme just won't persist
    }
  }, [theme, applyTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    soundEffects.playThemeSwitch(newTheme === 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      soundEffects.playThemeSwitch(next === 'light');
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
