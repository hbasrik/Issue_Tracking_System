import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyThemeVars,
  parseThemeMode,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from './tokens';

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  try {
    return parseThemeMode(localStorage.getItem(THEME_STORAGE_KEY)) ?? 'light';
  } catch {
    return 'light';
  }
}

function persistMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* quota / private mode */
  }
}

/** Theme provider — light default; explicit choice persisted in localStorage. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const initial = readStoredMode();
    applyThemeVars(initial);
    return initial;
  });

  useLayoutEffect(() => {
    applyThemeVars(mode);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    persistMode(next);
    setModeState(next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((m) => {
      const next: ThemeMode = m === 'dark' ? 'light' : 'dark';
      persistMode(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ mode, toggle, setMode }),
    [mode, toggle, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
