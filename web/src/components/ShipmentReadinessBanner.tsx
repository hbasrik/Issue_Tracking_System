import type { ShipmentReadiness } from '../lib/api';

/** Soft pre-shipment warning — does not replace depot-release hard blocks. */
export function ShipmentReadinessBanner({
  readiness,
}: {
  readiness: ShipmentReadiness | null;
}) {
  if (!readiness || readiness.ready || readiness.warnings.length === 0) {
    return null;
  }
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: 'var(--status-conditional-ok)',
        backgroundColor: 'color-mix(in srgb, var(--status-conditional-ok) 12%, transparent)',
      }}
      role="status"
    >
      <h3 className="text-[15px] font-semibold">Sevk öncesi uyarı</h3>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Araç sevk edilmeden önce aşağıdaki kalemler tamamlanmalı. Depot Release
        hard-block kuralları değişmedi.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px]">
        {readiness.warnings.map((w, i) => (
          <li key={`${w.code}-${w.item_id ?? w.issue_id ?? i}`}>{w.message}</li>
        ))}
      </ul>
    </div>
  );
}
