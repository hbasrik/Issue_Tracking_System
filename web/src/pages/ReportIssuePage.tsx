import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  api,
  type DefectPart,
  type DefectType,
  type DefectZone,
  type IssueType,
  type Station,
  type Vehicle,
} from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { VinSearchBox } from '../components/VinSearchBox';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { useI18n } from '../i18n';

const OTHER_PART = '99-99';
const OTHER_TYPE = '99';
const SEVERITIES = ['CRITICAL', 'MEDIUM', 'LOW'] as const;

const inputClass =
  'min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';
const btnPrimary =
  'min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[14px] font-medium text-white disabled:opacity-40';

function nameOf(tr: string, en: string, locale: string) {
  return locale === 'en' ? en || tr : tr || en;
}

/** Standalone web issue report — MANUAL source with defect classification. */
export default function ReportIssuePage() {
  const { t, locale } = useI18n();
  const { has } = useAuth();
  const navigate = useNavigate();

  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [zones, setZones] = useState<DefectZone[]>([]);
  const [parts, setParts] = useState<DefectPart[]>([]);
  const [types, setTypes] = useState<DefectType[]>([]);

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [stationId, setStationId] = useState<number | ''>('');
  const [zoneId, setZoneId] = useState<number | ''>('');
  const [partId, setPartId] = useState<number | ''>('');
  const [typeId, setTypeId] = useState<number | ''>('');
  const [partSearch, setPartSearch] = useState('');
  const [customPartName, setCustomPartName] = useState('');
  const [customDefectName, setCustomDefectName] = useState('');
  const [issueTypeId, setIssueTypeId] = useState<number | ''>('');
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number] | ''>('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsStation = vehicle?.CurrentGlobalStatus === 'IN_PRODUCTION';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [typesRes, stationsRes, zonesRes, partsRes, defectTypesRes] =
          await Promise.all([
            api.listIssueTypes(),
            api.listStations(),
            api.listDefectCatalogZones(),
            api.listDefectCatalogParts(),
            api.listDefectCatalogTypes(),
          ]);
        if (cancelled) return;
        setIssueTypes(typesRes.items ?? []);
        setStations(
          (stationsRes.items ?? []).slice().sort((a, b) => a.SequenceNo - b.SequenceNo),
        );
        setZones(zonesRes.items ?? []);
        setParts(partsRes.items ?? []);
        setTypes(defectTypesRes.items ?? []);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, t));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!needsStation) setStationId('');
  }, [needsStation]);

  const selectedPart = useMemo(
    () => parts.find((p) => p.ID === partId) ?? null,
    [parts, partId],
  );
  const selectedType = useMemo(
    () => types.find((ty) => ty.ID === typeId) ?? null,
    [types, typeId],
  );

  const filteredParts = useMemo(() => {
    const q = partSearch.trim().toLocaleLowerCase();
    if (q) {
      return parts.filter((p) => {
        const hay = `${p.Code} ${p.NameTR} ${p.NameEN} ${p.ZoneNameTR} ${p.ZoneNameEN}`.toLocaleLowerCase();
        return hay.includes(q);
      });
    }
    if (zoneId === '') return [];
    return parts.filter((p) => p.ZoneID === zoneId);
  }, [parts, partSearch, zoneId]);

  const pickPart = useCallback((p: DefectPart) => {
    setPartId(p.ID);
    setZoneId(p.ZoneID);
    setPartSearch('');
    if (p.Code !== OTHER_PART) setCustomPartName('');
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!vehicle) {
      setError(t('report.vinRequired'));
      return;
    }
    if (needsStation && stationId === '') {
      setError(t('report.stationRequired'));
      return;
    }
    if (zoneId === '') {
      setError(t('report.zoneRequired'));
      return;
    }
    if (partId === '' || !selectedPart) {
      setError(t('report.partRequired'));
      return;
    }
    if (typeId === '' || !selectedType) {
      setError(t('report.defectTypeRequired'));
      return;
    }
    if (selectedPart.Code === OTHER_PART && !customPartName.trim()) {
      setError(t('report.customPartRequired'));
      return;
    }
    if (selectedType.Code === OTHER_TYPE && !customDefectName.trim()) {
      setError(t('report.customDefectRequired'));
      return;
    }
    if (!severity) {
      setError(t('report.severityRequired'));
      return;
    }
    if (issueTypeId === '') {
      setError(t('report.typeRequired'));
      return;
    }
    if (!description.trim()) {
      setError(t('report.descRequired'));
      return;
    }
    if (!photo) {
      setError(t('report.photoRequired'));
      return;
    }

    setBusy(true);
    try {
      const issue = await api.createIssue({
        vin: vehicle.VIN,
        source_type: 'MANUAL',
        station_id: needsStation ? Number(stationId) : null,
        issue_type_id: Number(issueTypeId),
        severity,
        description: description.trim(),
        defect_part_id: Number(partId),
        defect_type_id: Number(typeId),
        custom_part_name:
          selectedPart.Code === OTHER_PART ? customPartName.trim() : undefined,
        custom_defect_name:
          selectedType.Code === OTHER_TYPE ? customDefectName.trim() : undefined,
      });
      await api.uploadMedia('ISSUE', String(issue.ID), photo);
      navigate(`/issues`, { replace: true, state: { highlightIssueId: issue.ID } });
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (!has(Perm.IssueCreate)) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-[var(--text-secondary)]">{t('error.forbidden')}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">{t('nav.reportIssueWeb')}</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {t('report.manualSubtitle')}
          </p>
        </div>
        <Link
          to="/issues"
          className="text-[13px] text-[var(--accent)] underline-offset-2 hover:underline"
        >
          {t('nav.issues')}
        </Link>
      </header>

      <form
        onSubmit={(e) => void submit(e)}
        className="space-y-4 rounded-xl border bg-[var(--bg-surface-1)] p-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <label className="block text-[12px] text-[var(--text-secondary)]">
          {t('issue.vin')} *
          <div className="mt-1">
            <VinSearchBox onPick={setVehicle} placeholder={t('report.pickVehicle')} />
          </div>
          {vehicle ? (
            <p className="mt-2 text-[13px] font-medium text-[var(--text-primary)]">
              {vehicle.VIN} · {vehicle.CurrentGlobalStatus}
            </p>
          ) : null}
        </label>

        {needsStation ? (
          <label className="block text-[12px] text-[var(--text-secondary)]">
            {t('issueDetail.station')} *
            <select
              className={`${inputClass} mt-1`}
              style={{ borderColor: 'var(--border)' }}
              value={stationId}
              onChange={(e) =>
                setStationId(e.target.value === '' ? '' : Number(e.target.value))
              }
            >
              <option value="">{t('report.pickStation')}</option>
              {stations.map((s) => (
                <option key={s.ID} value={s.ID}>
                  {s.SequenceNo}. {s.Name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block text-[12px] text-[var(--text-secondary)]">
          {t('report.zone')} *
          <select
            className={`${inputClass} mt-1`}
            style={{ borderColor: 'var(--border)' }}
            value={zoneId}
            onChange={(e) => {
              const id = e.target.value === '' ? '' : Number(e.target.value);
              setZoneId(id);
              setPartId('');
              setPartSearch('');
            }}
          >
            <option value="">{t('report.pickZone')}</option>
            {zones.map((z) => (
              <option key={z.ID} value={z.ID}>
                {z.Code} · {nameOf(z.NameTR, z.NameEN, locale)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[12px] text-[var(--text-secondary)]">
          {t('report.partSearch')}
          <input
            className={`${inputClass} mt-1`}
            style={{ borderColor: 'var(--border)' }}
            value={partSearch}
            onChange={(e) => setPartSearch(e.target.value)}
            placeholder={t('report.partSearch')}
          />
        </label>

        <label className="block text-[12px] text-[var(--text-secondary)]">
          {t('report.part')} *
          <select
            className={`${inputClass} mt-1`}
            style={{ borderColor: 'var(--border)' }}
            value={partId}
            onChange={(e) => {
              const id = e.target.value === '' ? '' : Number(e.target.value);
              const p = parts.find((x) => x.ID === id);
              if (p) pickPart(p);
              else setPartId('');
            }}
          >
            <option value="">{t('report.pickPart')}</option>
            {filteredParts.map((p) => (
              <option key={p.ID} value={p.ID}>
                {p.Code} · {nameOf(p.NameTR, p.NameEN, locale)}
                {partSearch.trim()
                  ? ` (${nameOf(p.ZoneNameTR, p.ZoneNameEN, locale)})`
                  : ''}
              </option>
            ))}
          </select>
        </label>

        {selectedPart?.Code === OTHER_PART ? (
          <label className="block text-[12px] text-[var(--text-secondary)]">
            {t('report.customPartName')} *
            <input
              className={`${inputClass} mt-1`}
              style={{ borderColor: 'var(--border)' }}
              value={customPartName}
              onChange={(e) => setCustomPartName(e.target.value)}
            />
          </label>
        ) : null}

        <label className="block text-[12px] text-[var(--text-secondary)]">
          {t('report.defectType')} *
          <select
            className={`${inputClass} mt-1`}
            style={{ borderColor: 'var(--border)' }}
            value={typeId}
            onChange={(e) => {
              const id = e.target.value === '' ? '' : Number(e.target.value);
              setTypeId(id);
              const ty = types.find((x) => x.ID === id);
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
            {t('report.customDefectName')} *
            <input
              className={`${inputClass} mt-1`}
              style={{ borderColor: 'var(--border)' }}
              value={customDefectName}
              onChange={(e) => setCustomDefectName(e.target.value)}
            />
          </label>
        ) : null}

        <fieldset>
          <legend className="text-[12px] text-[var(--text-secondary)]">
            {t('severity.label')} *
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                className="min-h-touch rounded-lg border px-3 text-[13px]"
                style={{
                  borderColor: severity === s ? 'var(--accent)' : 'var(--border)',
                  background:
                    severity === s
                      ? 'color-mix(in srgb, var(--accent) 18%, transparent)'
                      : 'var(--bg-page)',
                }}
                onClick={() => setSeverity(s)}
              >
                {s === 'CRITICAL'
                  ? t('severity.critical')
                  : s === 'MEDIUM'
                    ? t('severity.medium')
                    : t('severity.low')}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block text-[12px] text-[var(--text-secondary)]">
          {t('issue.type')} *
          <select
            className={`${inputClass} mt-1`}
            style={{ borderColor: 'var(--border)' }}
            value={issueTypeId}
            onChange={(e) =>
              setIssueTypeId(e.target.value === '' ? '' : Number(e.target.value))
            }
          >
            <option value="">{t('report.typeRequired')}</option>
            {issueTypes.map((it) => (
              <option key={it.ID} value={it.ID}>
                {it.Name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[12px] text-[var(--text-secondary)]">
          {t('issueDetail.descriptionStar')}
          <textarea
            className={`${inputClass} mt-1 min-h-[100px] py-2`}
            style={{ borderColor: 'var(--border)' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className="block text-[12px] text-[var(--text-secondary)]">
          {t('report.photoRequired').split('—')[0].trim()} *
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="mt-1 block w-full text-[13px]"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
          {photo ? (
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{photo.name}</p>
          ) : null}
        </label>

        {error ? (
          <p className="text-[13px] text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? t('common.saving') : t('report.save')}
        </button>
      </form>
    </section>
  );
}
