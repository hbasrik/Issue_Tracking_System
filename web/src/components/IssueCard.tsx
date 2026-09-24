import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ImageOff } from 'lucide-react';
import {
  formatIssueOpenDuration,
  issueCardIsCompact,
  issueOpenDurationMs,
  ISSUE_CARD_PHOTO_ASPECT,
  severityMessageKey,
} from '../../../shared/issueCardLayout';
import { useI18n } from '../i18n';
import { type Issue } from '../lib/api';
import { defectLabels } from '../lib/issueDetailCopy';
import { AuthenticatedMediaImg } from './AuthenticatedMediaImg';
import {
  SeverityIndicator,
  normalizeSeverity,
  severityFillColor,
} from './SeverityIndicator';
import { StatusBadge } from './StatusBadge';
import { isNonWebImage } from '../lib/mediaKind';
import { patchBoardScrollTop, readAppScrollTop } from '../lib/issuesBoardState';
import { useTheme } from '../theme/ThemeProvider';
import {
  darkCardElevation,
  lightCardElevation,
} from '../../../shared/surfaces';

type Props = {
  issue: Issue;
  hideVin?: boolean;
  /** Container width drives compact vs grid layout (shared threshold). */
  layoutWidth: number;
  className?: string;
  /** Brief visual emphasis for a newly appeared CRITICAL (board alert). */
  highlighted?: boolean;
};

/**
 * Single issue card — compact list (&lt;600px) or grid photo-top (≥600px).
 * Whole card → /issues/:id; photo click → fullscreen (does not navigate).
 */
export function IssueCard({
  issue,
  hideVin = false,
  layoutWidth,
  className = '',
  highlighted = false,
}: Props) {
  const { t, locale } = useI18n();
  const { mode } = useTheme();
  const navigate = useNavigate();
  const compact = issueCardIsCompact(layoutWidth);
  const elev = mode === 'dark' ? darkCardElevation : lightCardElevation;
  const [lightbox, setLightbox] = useState(false);
  const [now] = useState(() => Date.now());

  const defect = defectLabels(issue, t, locale);
  const duration = formatIssueOpenDuration(
    issueOpenDurationMs(issue, now),
    locale,
  );
  const sevKey = severityMessageKey(issue.Severity);
  const sevLabel = sevKey ? t(sevKey) : issue.Severity;
  const sevLevel = normalizeSeverity(issue.Severity);
  const sevColor = sevLevel ? severityFillColor(sevLevel) : undefined;
  const hasPhoto = Boolean(issue.ReportPhotoPath);
  const photoIsHeic =
    hasPhoto && isNonWebImage(null, null, issue.ReportPhotoPath);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  function openDetail() {
    patchBoardScrollTop(readAppScrollTop());
    navigate(`/issues/${issue.ID}`);
  }

  function onCardKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDetail();
    }
  }

  function onPhotoClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (hasPhoto && !photoIsHeic) setLightbox(true);
  }

  const photo = (
    <button
      type="button"
      onClick={onPhotoClick}
      disabled={!hasPhoto || photoIsHeic}
      className={`relative block overflow-hidden bg-[var(--bg-surface-2)] ${
        compact
          ? 'h-16 w-16 shrink-0 rounded-md'
          : 'w-full rounded-t-xl'
      }`}
      style={
        compact
          ? undefined
          : { aspectRatio: String(ISSUE_CARD_PHOTO_ASPECT) }
      }
      aria-label={
        hasPhoto ? t('issue.photoFullscreen') : t('issue.noPhoto')
      }
    >
      {hasPhoto && !photoIsHeic ? (
        <AuthenticatedMediaImg
          storagePath={issue.ReportPhotoPath!}
          variant={compact ? 'sm' : 'md'}
          lazy
          alt=""
          className="h-full w-full object-cover"
        />
      ) : photoIsHeic ? (
        <EmptyPhoto compact={compact} label="HEIC" />
      ) : (
        <EmptyPhoto compact={compact} label={t('issue.noPhoto')} />
      )}
    </button>
  );

  const body = (
    <div className={`min-w-0 flex-1 ${compact ? 'space-y-1' : 'space-y-2 p-3'}`}>
      <p
        className={`truncate font-medium text-[var(--text-primary)] ${
          compact ? 'text-[14px] leading-snug' : 'text-[15px] leading-snug'
        }`}
      >
        {issue.Description?.trim() || t('common.emDash')}
      </p>
      <p className="truncate text-[12px] text-[var(--text-secondary)]">
        {defect.listLine}
      </p>
      <div
        className={`flex min-w-0 items-center justify-between gap-2 ${
          compact ? 'text-[12px]' : 'text-[13px]'
        }`}
      >
        <div className="flex min-w-0 flex-shrink items-center gap-2 overflow-hidden">
          {!hideVin ? (
            <Link
              to={`/vehicles/${issue.VIN}?tab=issues`}
              className="min-w-0 truncate font-mono font-semibold text-[var(--accent)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              …{issue.VIN.slice(-5)}
            </Link>
          ) : null}
          <span
            className="min-w-0 truncate tabular-nums text-[var(--text-secondary)]"
            title={t('issue.openDuration')}
          >
            {duration}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SeverityIndicator severity={issue.Severity} decorative />
          <span
            className="max-w-[4.5rem] truncate font-medium"
            style={sevColor ? { color: sevColor } : undefined}
          >
            {sevLabel}
          </span>
          <StatusBadge kind="issue" value={issue.Status} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <article
        role="link"
        tabIndex={0}
        onClick={openDetail}
        onKeyDown={onCardKeyDown}
        className={`flex cursor-pointer overflow-hidden rounded-xl border bg-[var(--bg-surface-1)] transition-[box-shadow,border-color,background-color,opacity] duration-150 hover:bg-[color-mix(in_srgb,var(--bg-surface-2)_55%,var(--bg-surface-1))] active:opacity-90 ${
          compact
            ? 'flex-row items-start gap-3 p-3'
            : 'h-full flex-col'
        } ${highlighted ? 'ring-2 ring-offset-2 ring-offset-[var(--bg-page)]' : ''} ${className}`}
        style={{
          borderColor: highlighted
            ? sevColor || 'var(--border)'
            : 'var(--border)',
          borderWidth: highlighted ? 2 : 1,
          boxShadow: highlighted
            ? `0 0 0 3px color-mix(in srgb, ${sevColor || '#C62222'} 45%, transparent)`
            : elev.cssBoxShadow,
          ['--tw-ring-color' as string]: sevColor || '#C62222',
        }}
        data-highlighted={highlighted ? '1' : undefined}
      >
        {photo}
        {body}
      </article>

      {lightbox && hasPhoto && issue.ReportPhotoPath ? (
        <PhotoLightbox
          storagePath={issue.ReportPhotoPath}
          onClose={() => setLightbox(false)}
        />
      ) : null}
    </>
  );
}

function EmptyPhoto({
  compact,
  label,
}: {
  compact: boolean;
  label: string;
}) {
  return (
    <span
      className={`flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--text-secondary)] ${
        compact ? 'px-1' : 'px-3'
      }`}
    >
      <ImageOff size={compact ? 18 : 28} aria-hidden />
      <span
        className={`text-center font-medium leading-tight ${
          compact ? 'text-[9px]' : 'text-[12px]'
        }`}
      >
        {label}
      </span>
    </span>
  );
}

function PhotoLightbox({
  storagePath,
  onClose,
}: {
  storagePath: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal
      aria-label={t('issue.photoFullscreen')}
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-4 top-4 rounded-lg bg-white/10 px-3 py-1.5 text-[14px] text-white hover:bg-white/20"
        onClick={onClose}
      >
        {t('common.close')}
      </button>
      <div
        className="max-h-full max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <AuthenticatedMediaImg
          storagePath={storagePath}
          alt=""
          className="max-h-[90vh] max-w-[90vw] object-contain"
        />
      </div>
    </div>
  );
}
