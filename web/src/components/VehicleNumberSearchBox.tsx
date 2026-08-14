import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

/**
 * Looks up a vehicle by the short factory number printed on the body
 * (GET /vehicles/resolve?vehicle_number=).
 */
export function VehicleNumberSearchBox({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resolve(e: React.FormEvent) {
    e.preventDefault();
    const number = value.trim();
    if (!number) {
      setError('vehicle number is required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const vehicle = await api.resolveVehicle(number);
      navigate(`/vehicles/${vehicle.VIN}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(`no vehicle found with vehicle_number ${number}`);
      } else {
        setError(err instanceof Error ? err.message : 'lookup failed');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={resolve} className={className}>
      <label className="text-[13px] text-[var(--text-secondary)]">
        Vehicle number
      </label>
      <div className="mt-1 flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 12345"
          aria-label="Vehicle number search"
          className="w-full rounded-lg border bg-[var(--bg-surface-1)] px-3 py-2 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
          style={{ borderColor: 'var(--border)' }}
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-2 text-[13px] text-white disabled:opacity-60"
        >
          Find
        </button>
      </div>
      {error && (
        <p className="mt-1 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
    </form>
  );
}
