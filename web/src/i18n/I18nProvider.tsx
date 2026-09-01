import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  parseLocale,
  translate,
  type Locale,
  type MessageKey,
  type Translate,
  type Vars,
} from '../../../shared/i18n';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  try {
    return parseLocale(localStorage.getItem(LOCALE_STORAGE_KEY)) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* quota / private mode */
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, 'app.title');
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback<Translate>(
    (key: MessageKey, vars?: Vars) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
