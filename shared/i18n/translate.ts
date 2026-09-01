import { DEFAULT_LOCALE, type Locale, type Vars } from './types';
import { en, tr, type MessageKey } from './messages';

const tables: Record<Locale, Record<MessageKey, string>> = { tr, en };

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Vars,
): string {
  const table = tables[locale] ?? tables[DEFAULT_LOCALE];
  let s = table[key] ?? tables.tr[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

export type Translate = (key: MessageKey, vars?: Vars) => string;
export type { MessageKey };
