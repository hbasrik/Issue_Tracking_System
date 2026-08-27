import { inkOn, statusColors } from '../theme/tokens';

/** Active / inactive for users and catalogue rows — not an issue or station status. */
export function ActiveBadge({ active }: { active: boolean }) {
  const color = active ? statusColors.ok : statusColors.pending;
  const ink = inkOn(color);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium"
      style={{ color: ink, backgroundColor: color }}
    >
      {active ? 'Aktif' : 'Pasif'}
    </span>
  );
}
