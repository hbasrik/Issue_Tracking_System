import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type DefectPart,
  type DefectProcess,
  type DefectType,
  type DefectZone,
  type Issue,
} from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { useI18n } from '../i18n';

const OTHER_PART = '99-99';
const OTHER_TYPE = '99';

const inputClass =
  'min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[14px] text-[var(--text-primary)]';

function nameOf(tr: string, en: string, locale: string) {
  return locale === 'en' ? en || tr : tr || en;
}

interface IssueClassificationEditorProps {
  issue: Issue;
  onSaved: (issue: Issue) => void;
  onCancel: () => void;
}

/** Inline editor for defect classification on an existing issue. */
export function IssueClassificationEditor({
  issue,
  onSaved,
  onCancel,
}: IssueClassificationEditorProps) {
  const { t, locale } = useI18n();
  const [zones, setZones] = useState<DefectZone[]>([]);
  const [parts, setParts] = useState<DefectPart[]>([]);
  const [types, setTypes] = useState<DefectType[]>([]);
  const [processes, setProcesses] = useState<DefectProcess[]>([]);
  const [zoneId, setZoneId] = useState<number | ''>(issue.DefectZoneID ?? '');
  const [partId, setPartId] = useState<number | ''>(issue.DefectPartID ?? '');
  const [typeId, setTypeId] = useState<number | ''>(issue.DefectTypeID ?? '');
  const [processId, setProcessId] = useState<number | ''>(
    issue.ResponsibleProcessID ?? '',
  );
  const [customPartName, setCustomPartName] = useState(issue.CustomPartName ?? '');
  const [customDefectName, setCustomDefectName] = useState(
    issue.CustomDefectName ?? '',
  );
  const [partSearch, setPartSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [z, p, ty, pr] = await Promise.all([
          api.listDefectCatalogZones(),
          api.listDefectCatalogParts(),
          api.listDefectCatalogTypes(),
          api.listDefectCatalogProcesses(),
        ]);
        if (cancelled) return;
        setZones(z.items ?? []);
        setParts(p.items ?? []);
        setTypes(ty.items ?? []);
        setProcesses(pr.items ?? []);
      } catch (err) {
        if (!cancelled) setLoadError(apiErrorMessage(err, t));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const selectedPart = useMemo(
    () => parts.find((p) => p.ID === partId) ?? null,
    [parts, partId],
  );
  const selectedType = useMemo(
    () => types.find((ty) => ty.ID === typeId) ?? null,
    [types, typeId],
  );

  const scopedParts = useMemo(() => {
    const base =
      zoneId === '' ? parts : parts.filter((p) => p.ZoneID === zoneId);
    const q = partSearch.trim().toLocaleLowerCase(locale === 'en' ? 'en' : 'tr');
    if (!q) return base;
    return base.filter((p) =>
      nameOf(p.NameTR, p.NameEN, locale).toLocaleLowerCase().includes(q),
    );
  }, [parts, zoneId, partSearch, locale]);

  useEffect(() => {
    if (!selectedPart) return;
    if (zoneId === '' || selectedPart.ZoneID !== zoneId) {
      setZoneId(selectedPart.ZoneID);
    }
  }, [selectedPart, zoneId]);

  useEffect(() => {
    if (!selectedType?.DefaultProcessID) return;
    const def = selectedType.DefaultProcessID;
    setProcessId((prev) => (prev === '' ? def : prev));
  }, [selectedType?.ID, selectedType?.DefaultProcessID]);

  async function save() {
    setError(null);
    if (partId === '' || typeId === '' || processId === '') {
      setError(t('issue.classificationIncomplete'));
      return;
    }
    if (selectedPart?.Code === OTHER_PART && !customPartName.trim()) {
      setError(t('report.customPartRequired'));
      return;
    }
    if (selectedType?.Code === OTHER_TYPE && !customDefectName.trim()) {
      setError(t('report.customDefectRequired'));
      return;
    }
    setBusy(true);
    try {
      const updated = await api.updateIssueClassification(issue.ID, {
        defect_part_id: partId,
        defect_type_id: typeId,
        responsible_process_id: processId,
        custom_part_name:
          selectedPart?.Code === OTHER_PART ? customPartName.trim() : undefined,
        custom_defect_name:
          selectedType?.Code === OTHER_TYPE ? customDefectName.trim() : undefined,
      });
      onSaved(updated);
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return <p className="text-[13px]" style={{ color: 'var(--status-not-ok)' }}>{loadError}</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
      <p className="text-[13px] font-semibold text-[var(--text-primary)]">
        {t('issue.editClassification')}
      </p>

      <label className="block text-[12px] text-[var(--text-secondary)]">
        {t('issue.defectZone')}
        <select
          className={`${inputClass} mt-1`}
          style={{ borderColor: 'var(--border)' }}
          value={zoneId === '' ? '' : String(zoneId)}
          onChange={(e) => {
            const next = e.target.value ? Number(e.target.value) : '';
            setZoneId(next);
            if (partId !== '' && next !== '') {
              const still = parts.find((p) => p.ID === partId && p.ZoneID === next);
              if (!still) setPartId('');
            }
          }}
        >
          <option value="">{t('report.pickZone')}</option>
          {zones.map((z) => (
            <option key={z.ID} value={z.ID}>
              {nameOf(z.NameTR, z.NameEN, locale)}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-[12px] text-[var(--text-secondary)]">
        {t('issue.defectPart')}
        <input
          type="search"
          className={`${inputClass} mt-1 mb-1`}
          style={{ borderColor: 'var(--border)' }}
          placeholder={t('issue.partFilterSearch')}
          value={partSearch}
          onChange={(e) => setPartSearch(e.target.value)}
        />
        <select
          className={inputClass}
          style={{ borderColor: 'var(--border)' }}
          value={partId === '' ? '' : String(partId)}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : '';
            setPartId(id);
            const p = parts.find((x) => x.ID === id);
            if (p) setZoneId(p.ZoneID);
            if (!p || p.Code !== OTHER_PART) setCustomPartName('');
          }}
        >
          <option value="">{t('report.pickPart')}</option>
          {scopedParts.map((p) => (
            <option key={p.ID} value={p.ID}>
              {p.Code} · {nameOf(p.NameTR, p.NameEN, locale)}
            </option>
          ))}
        </select>
      </label>

      {selectedPart?.Code === OTHER_PART ? (
        <label className="block text-[12px] text-[var(--text-secondary)]">
          {t('report.customPartName')}
          <input
            className={`${inputClass} mt-1`}
            style={{ borderColor: 'var(--border)' }}
            value={customPartName}
            onChange={(e) => setCustomPartName(e.target.value)}
          />
        </label>
      ) : null}

      <label className="block text-[12px] text-[var(--text-secondary)]">
        {t('issue.defectType')}
        <select
          className={`${inputClass} mt-1`}
          style={{ borderColor: 'var(--border)' }}
          value={typeId === '' ? '' : String(typeId)}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : '';
            setTypeId(id);
            const ty = types.find((x) => x.ID === id);
            if (ty?.DefaultProcessID) setProcessId(ty.DefaultProcessID);
            if (!ty || ty.Code !== OTHER_TYPE) setCustomDefectName('');
          }}
        >
          <option value="">{t('report.pickDefectType')}</option>
          {types.map((ty) => (
            <option key={ty.ID} value={ty.ID}>
              {ty.Code} · {nameOf(ty.NameTR, ty.NameEN, locale)}
            </option>
          ))}
        </select>
      </label>

      {selectedType?.Code === OTHER_TYPE ? (
        <label className="block text-[12px] text-[var(--text-secondary)]">
          {t('report.customDefectName')}
          <input
            className={`${inputClass} mt-1`}
            style={{ borderColor: 'var(--border)' }}
            value={customDefectName}
            onChange={(e) => setCustomDefectName(e.target.value)}
          />
        </label>
      ) : null}

      <label className="block text-[12px] text-[var(--text-secondary)]">
        {t('issue.defectProcess')}
        <select
          className={`${inputClass} mt-1`}
          style={{ borderColor: 'var(--border)' }}
          value={processId === '' ? '' : String(processId)}
          onChange={(e) =>
            setProcessId(e.target.value ? Number(e.target.value) : '')
          }
        >
          <option value="">{t('issue.pickProcess')}</option>
          {processes.map((p) => (
            <option key={p.ID} value={p.ID}>
              {nameOf(p.NameTR, p.NameEN, locale)}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p className="text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[14px] font-medium text-white disabled:opacity-40"
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="min-h-touch rounded-lg border px-4 text-[14px]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

/** Same authorization rules as backend CanEditIssueClassification. */
export function canEditIssueClassification(
  issue: Issue,
  userId: number | undefined,
  has: (code: string) => boolean,
): boolean {
  if (userId != null && issue.IssueReporterID === userId) return true;
  return (
    has('issue.transition.approve') ||
    has('issue.transition.conditional_approve') ||
    has('admin.manage_masters')
  );
}
