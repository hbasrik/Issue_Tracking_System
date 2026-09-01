import { useI18n } from '../i18n';
import { formatActionStamp } from '../lib/actionStamp';

/** Quiet actor line under a completed action. Renders nothing when empty. */
export function ActionStamp({
  name,
  at,
  lines,
}: {
  name?: string;
  at?: string | null;
  lines?: string[];
}) {
  const { locale } = useI18n();
  const stamp = formatActionStamp(name, at, locale);
  const text = lines ?? (stamp ? [stamp] : []);
  if (text.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {text.map((line) => (
        <p key={line} className="text-[12px] text-[var(--text-secondary)]">
          {line}
        </p>
      ))}
    </div>
  );
}
