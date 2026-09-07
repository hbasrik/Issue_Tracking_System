import { useI18n } from '../i18n';
import { inkOn, statusColors } from '../theme/tokens';

/** Active / inactive for users and catalogue rows — not an issue or station status. */
export function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useI18n();
  const color = active ? statusColors.ok : statusColors.pending;
  const ink = inkOn(color);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold uppercase tracking-wide ring-1 ring-inset"
      style={{
        color: ink,
        backgroundColor: color,
        boxShadow: active
          ? undefined
          : '0 0 0 1px color-mix(in srgb, var(--text-secondary) 35%, transparent)',
        opacity: 1,
      }}
      data-active={active ? 'true' : 'false'}
    >
      {active ? t('common.active') : t('common.inactive')}
    </span>
  );
}
