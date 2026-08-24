interface VehicleIdentityProps {
  vin: string;
  /** Compact table-cell layout vs the vehicle-detail heading. */
  compact?: boolean;
}

/** VIN identity shown read-only wherever a VIN is displayed. */
export function VehicleIdentity({
  vin,
  compact = false,
}: VehicleIdentityProps) {
  const tail = vin.slice(-5);

  if (compact) {
    return (
      <div>
        <div className="font-semibold text-[var(--accent)]">…{tail}</div>
        <div className="text-[13px] text-[var(--text-secondary)]">{vin}</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">…{tail}</h1>
      <p className="text-[13px] text-[var(--text-secondary)]">VIN {vin}</p>
    </div>
  );
}
