import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  bindThemeMode,
  parseThemeMode,
  THEME_STORAGE_KEY,
  tokensFor,
  type ThemeMode,
  type ThemeTokens,
} from './tokens';

interface ThemeContextValue {
  mode: ThemeMode;
  tokens: ThemeTokens;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(THEME_STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      const stored = parseThemeMode(raw);
      if (stored) {
        bindThemeMode(stored);
        setModeState(stored);
      } else {
        bindThemeMode('light');
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    bindThemeMode(next);
    setModeState(next);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((m) => {
      const next: ThemeMode = m === 'dark' ? 'light' : 'dark';
      bindThemeMode(next);
      void AsyncStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      mode,
      tokens: tokensFor(mode),
      toggle,
      setMode,
    }),
    [mode, toggle, setMode],
  );

  if (!ready) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
