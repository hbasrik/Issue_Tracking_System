import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface VehicleIdentityProps {
  vin: string;
  /** Compact table-cell vs the issue-detail hero. */
  variant?: 'compact' | 'hero';
  /** When set, the hero becomes a link to the vehicle detail page. */
  linkLabel?: string;
}

/** VIN identity shown wherever a VIN is displayed. */
export function VehicleIdentity({
  vin,
  variant = 'hero',
  linkLabel,
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

  if (linkLabel) {
    return (
      <Link
        to={`/vehicles/${encodeURIComponent(vin)}`}
        aria-label={`${linkLabel}: ${vin}`}
        title={linkLabel}
        data-testid="issue-vehicle-link"
        className="group inline-block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <span className="flex items-center gap-1 text-2xl font-bold tracking-tight text-[var(--accent)] underline decoration-dotted decoration-2 underline-offset-4 group-hover:decoration-solid">
          …{tail}
          <ChevronRight size={22} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
        </span>
        <span className="mt-0.5 block text-[13px] text-[var(--text-secondary)]">{vin}</span>
      </Link>
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
