import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError, type Issue } from '../lib/api';
import { useI18n } from '../i18n';
import { ApiErrorText } from '../components/ApiErrorText';
import { IssueDetailPanel } from '../components/IssueList';
import { isAuthError } from '../../../shared/networkError';

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) {
      setError(new Error(t('issue.detailNotFound')));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await api.getIssue(n);
      setIssue(row);
    } catch (err) {
      if (isAuthError(err) || (err instanceof ApiError && err.status === 401)) {
        return;
      }
      setIssue(null);
      setError(err instanceof Error ? err : new Error(t('issue.detailFailed')));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex min-h-touch items-center gap-2 rounded-lg border px-3 text-[14px] font-medium hover:bg-[var(--bg-surface-2)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate('/issues');
          }}
        >
          <ArrowLeft size={16} aria-hidden />
          {t('common.back')}
        </button>
        <Link
          to="/issues"
          className="text-[14px] text-[var(--accent)] hover:underline"
        >
          {t('nav.issues')}
        </Link>
        {issue ? (
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">
            #{issue.ID}
          </h1>
        ) : null}
      </div>

      {loading ? (
        <p className="text-[15px] text-[var(--text-secondary)]">{t('common.loading')}</p>
      ) : null}
      {error ? (
        <ApiErrorText
          error={error}
          className="text-[14px] text-[var(--status-not-ok)]"
        />
      ) : null}
      {issue ? (
        <IssueDetailPanel issue={issue} onStatusChanged={() => void load()} />
      ) : null}
    </div>
  );
}
