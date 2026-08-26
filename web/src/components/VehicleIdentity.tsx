interface VehicleIdentityProps {
  vin: string;
  /** Compact table-cell vs the issue-detail hero. */
  variant?: 'compact' | 'hero';
}

/** VIN identity shown read-only wherever a VIN is displayed. */
export function VehicleIdentity({
  vin,
  variant = 'hero',
}: VehicleIdentityProps) {
  const tail = vin.slice(-5);

  if (variant === 'compact') {
    return (
      <div>
        <div className="font-semibold text-[var(--accent)]">…{tail}</div>
        <div className="text-[13px] text-[var(--text-secondary)]">{vin}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-2xl font-bold tracking-tight text-[var(--accent)]">
        …{tail}
      </div>
      <div className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{vin}</div>
    </div>
  );
}
