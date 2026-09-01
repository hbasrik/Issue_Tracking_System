import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { useI18n } from '../i18n';

/** Status transition buttons gated on issue.transition.* permissions. */
export function IssueActions({
  status,
  busy,
  onTransition,
}: {
  status: string;
  busy: boolean;
  onTransition: (status: string) => void;
}) {
  const { has } = useAuth();
  const { t } = useI18n();
  const actions: { status: string; label: string; primary?: boolean }[] = [];

  if (status === 'OPEN' && has(Perm.IssueTransitionProgress)) {
    actions.push({ status: 'IN_PROGRESS', label: t('status.issue.inProgress'), primary: true });
  }
  if (status === 'IN_PROGRESS' && has(Perm.IssueTransitionProgress)) {
    actions.push({ status: 'DONE', label: t('status.issue.done'), primary: true });
  }
  if (status === 'DONE' && has(Perm.IssueTransitionApprove)) {
    actions.push({ status: 'APPROVED', label: t('status.issue.approved'), primary: true });
  }
  if (status === 'DONE' && has(Perm.IssueTransitionConditionalApprove)) {
    actions.push({ status: 'CONDITIONAL_APPROVED', label: t('status.issue.conditionalApproved') });
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
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
          {busy ? t('common.updating') : a.label}
        </button>
      ))}
    </div>
  );
}
