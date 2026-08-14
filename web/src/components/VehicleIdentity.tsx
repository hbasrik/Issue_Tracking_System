interface VehicleIdentityProps {
  vin: string;
  vehicleNumber?: string | null;
  /** Compact table-cell layout vs the vehicle-detail heading. */
  compact?: boolean;
}

/** VIN plus the Karar 5 short factory number, shown read-only wherever a VIN is. */
export function VehicleIdentity({
  vin,
  vehicleNumber,
  compact = false,
}: VehicleIdentityProps) {
  const tail = vin.slice(-5);
  const number = vehicleNumber?.trim();

  if (compact) {
    return (
      <div>
        <div className="font-semibold text-[var(--accent)]">…{tail}</div>
        <div className="text-[13px] text-[var(--text-secondary)]">{vin}</div>
        {number ? (
          <div className="text-[13px] text-[var(--text-secondary)]">
            No. {number}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">…{tail}</h1>
      <p className="text-[13px] text-[var(--text-secondary)]">
        VIN {vin}
        {number ? (
          <>
            {' · '}
            <span>No. {number}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
