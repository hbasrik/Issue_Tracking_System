/** Status transition buttons valid for current status + role. */
export function IssueActions({
  status,
  isManager,
  busy,
  onTransition,
}: {
  status: string;
  isManager: boolean;
  busy: boolean;
  onTransition: (status: string) => void;
}) {
  const actions: { status: string; label: string; primary?: boolean }[] = [];

  if (status === 'OPEN') {
    actions.push({ status: 'IN_PROGRESS', label: 'Mark In Progress', primary: true });
  }
  if (status === 'IN_PROGRESS') {
    actions.push({ status: 'DONE', label: 'Mark Done', primary: true });
  }
  if (status === 'DONE' && isManager) {
    actions.push({ status: 'APPROVED', label: 'Kalite Onay', primary: true });
    actions.push({ status: 'CONDITIONAL_APPROVED', label: 'Şartlı Onay' });
  }

  if (actions.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.status}
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onTransition(a.status);
          }}
          className={
            a.primary
              ? 'min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[13px] text-white disabled:opacity-60'
              : 'min-h-touch rounded-lg border px-4 text-[13px] disabled:opacity-60'
          }
          style={a.primary ? undefined : { borderColor: 'var(--border)' }}
        >
          {busy ? 'Updating…' : a.label}
        </button>
      ))}
    </div>
  );
}
