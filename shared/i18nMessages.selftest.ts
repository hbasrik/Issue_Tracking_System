/**
 * Turkish copy must not show raw technical terms: enum identifiers
 * (PENDING, NOT_OK, IN_PRODUCTION), snake_case field names, env
 * assignments. Standard acronyms and product vocabulary are allowed.
 * Run: node --experimental-strip-types shared/i18nMessages.selftest.ts
 */
import { tr } from './i18n/messages.ts';

const TOKEN =
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b(?:OK|PENDING|REWORK|CONDITIONAL|BRANCH|DEPOT|FILE|COND)\b|\b[a-z]+_[a-z_]+\b|\b[A-Z_]+=\w+/g;

// Example of the role-code format the user types; not a status.
const ALLOWED_VALUES = new Set(['QUALITY_LEAD']);

const failures: string[] = [];
for (const [key, value] of Object.entries(tr as Record<string, string>)) {
  const hits = (value.match(TOKEN) ?? []).filter((h) => !ALLOWED_VALUES.has(h));
  if (hits.length) failures.push(`${key}: ${JSON.stringify(value)} -> ${hits.join(', ')}`);
}

if (failures.length) {
  console.error('raw technical terms in Turkish messages:\n' + failures.join('\n'));
  process.exit(1);
}
console.log(`shared/i18n/messages.ts ok (${Object.keys(tr).length} tr keys scanned)`);
