import type { AnalysisDashboard, AnalysisQuery } from './api';
import type { MessageKey, Translate } from '../../../shared/i18n';
import { issueStatusLabel } from './issueStatus';
import { eolStageLabel } from './vehicleStatus';
import { defectCoverageRates, formatPct } from './defectCoverage';

const AGE_BUCKET_KEYS: Record<string, MessageKey> = {
  '0-1': 'analysis.age.0_1',
  '1-3': 'analysis.age.1_3',
  '3-7': 'analysis.age.3_7',
  '7+': 'analysis.age.7plus',
};

const SEVERITY_KEYS: Record<string, MessageKey> = {
  CRITICAL: 'severity.critical',
  MEDIUM: 'severity.medium',
  LOW: 'severity.low',
};

function severityText(severity: string, t: Translate): string {
  const key = SEVERITY_KEYS[severity.toUpperCase()];
  return key ? t(key) : severity;
}

function waitStageText(stage: string, t: Translate): string {
  return stage === 'DELIVERY' ? t('analysis.wait.delivery') : eolStageLabel(stage, t);
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvEscape).join(',');
}

function section(title: string, lines: string[]): string[] {
  return [title, ...lines, ''];
}

function mergeSparkDays(
  sparks: AnalysisDashboard['Sparklines'] | undefined,
): string[] {
  const byDay = new Map<string, { opened: number; closed: number }>();
  for (const r of sparks?.Opened ?? []) {
    byDay.set(r.Day, { opened: r.CompletedCount, closed: 0 });
  }
  for (const r of sparks?.Closed ?? []) {
    const prev = byDay.get(r.Day);
    if (prev) prev.closed = r.CompletedCount;
    else byDay.set(r.Day, { opened: 0, closed: r.CompletedCount });
  }
  let o = 0;
  let c = 0;
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => {
      o += v.opened;
      c += v.closed;
      return row([day, o, c]);
    });
}

export function buildAnalysisCsv(
  dash: AnalysisDashboard,
  filters: AnalysisQuery,
  t: Translate,
): string {
  const lines: string[] = [];
  lines.push(
    row([
      t('analysis.title'),
      new Date().toISOString(),
    ]),
    '',
  );

  const filterParts = [
    filters.from && `from=${filters.from}`,
    filters.to && `to=${filters.to}`,
    filters.station && `station=${filters.station}`,
    filters.status && `status=${filters.status}`,
    filters.issue_type && `issue_type=${filters.issue_type}`,
    filters.vin_suffix && `vin_suffix=${filters.vin_suffix}`,
    filters.vins && `vins=${filters.vins}`,
    filters.severity && `severity=${filters.severity}`,
    filters.eol_stage && `eol_stage=${filters.eol_stage}`,
    filters.compare && `compare=${filters.compare}`,
  ].filter(Boolean);
  lines.push(...section(t('analysis.activeFilters', { summary: filterParts.join(' · ') || t('analysis.noFilters') }), []));

  const c = dash.Cards;
  const cmp = dash.CompareCards;
  lines.push(
    ...section(t('analysis.kpiSection'), [
      row([t('analysis.kpi.production'), c.TotalProduction, cmp.TotalProduction]),
      row([t('analysis.kpi.open'), c.OpenIssues, cmp.OpenIssues]),
      row([t('analysis.kpi.criticalOpen'), c.CriticalOpen, cmp.CriticalOpen]),
      row([t('analysis.kpi.pendingQuality'), c.PendingQuality, cmp.PendingQuality]),
      row([t('analysis.kpi.opened'), c.OpenedIssues, cmp.OpenedIssues]),
      row([t('analysis.kpi.closed'), c.ClosedIssues, cmp.ClosedIssues]),
      row([t('analysis.kpi.branchShipped'), c.BranchShipped, cmp.BranchShipped]),
      row([t('analysis.kpi.delivered'), c.Delivered, cmp.Delivered]),
      row([
        t('analysis.kpi.mttr'),
        c.AvgResolutionHours ?? '',
        cmp.AvgResolutionHours ?? '',
      ]),
      row([
        t('analysis.kpi.fpy'),
        c.FirstTimeRightPercent ?? '',
        cmp.FirstTimeRightPercent ?? '',
      ]),
      row([
        t('analysis.kpi.completion'),
        c.CompletionPercent ?? '',
        cmp.CompletionPercent ?? '',
      ]),
    ]),
  );

  if (dash.IssueStatus.length) {
    lines.push(
      ...section(t('analysis.statusDist'), [
        row([t('analysis.statusDist'), t('analysis.total')]),
        ...dash.IssueStatus.map((s) => row([issueStatusLabel(s.Status, t), s.Count])),
      ]),
    );
  }

  if (dash.SeverityMix.length) {
    lines.push(
      ...section(t('analysis.severityMix'), [
        row([t('severity.label'), t('analysis.total')]),
        ...dash.SeverityMix.map((s) => row([severityText(s.Severity, t), s.Count])),
      ]),
    );
  }

  if (dash.EOLFunnel.length) {
    lines.push(
      ...section(t('analysis.eolFunnel'), [
        row([t('home.colStage'), t('analysis.total')]),
        ...dash.EOLFunnel.map((s) => row([eolStageLabel(s.Stage, t), s.Count])),
      ]),
    );
  }

  if (dash.OpenAgeBuckets.length) {
    lines.push(
      ...section(t('analysis.openAge'), [
        row([t('analysis.ageBucket'), t('analysis.total')]),
        ...dash.OpenAgeBuckets.map((b) => row([AGE_BUCKET_KEYS[b.Bucket] ? t(AGE_BUCKET_KEYS[b.Bucket]) : b.Bucket, b.Count])),
      ]),
    );
  }

  if (dash.OpenByStation.length) {
    lines.push(
      ...section(t('analysis.openByStation'), [
        row([t('vehicles.station'), t('nav.issues')]),
        ...dash.OpenByStation.map((s) =>
          row([s.StationName || s.StationID, s.IssueCount]),
        ),
      ]),
    );
  }

  if (dash.TotalByStation.length) {
    lines.push(
      ...section(t('analysis.totalByStation'), [
        row([t('vehicles.station'), t('nav.issues')]),
        ...dash.TotalByStation.map((s) =>
          row([s.StationName || s.StationID, s.IssueCount]),
        ),
      ]),
    );
  }

  if (dash.Severity.length) {
    lines.push(
      ...section(t('analysis.vehicleBreakdown'), [
        row([
          t('issue.vin'),
          t('analysis.total'),
          t('severity.critical'),
          t('severity.medium'),
          t('severity.low'),
        ]),
        ...dash.Severity.map((v) =>
          row([
            v.VIN,
            v.TotalOpenIssues,
            v.CriticalCount,
            v.MediumCount,
            v.LowCount,
          ]),
        ),
      ]),
    );
  }

  if (dash.FPYByStation?.length) {
    lines.push(
      ...section(t('analysis.fpyByStation'), [
        row([
          t('vehicles.station'),
          t('analysis.kpi.fpy'),
          t('analysis.export.okCount'),
          t('analysis.export.checkCount'),
        ]),
        ...dash.FPYByStation.map((s) =>
          row([s.StationName || s.StationID, s.Percent ?? '', s.OkCount, s.TotalCount]),
        ),
      ]),
    );
  }

  if (dash.OpenedByReporter?.length) {
    lines.push(
      ...section(t('analysis.openedByReporter'), [
        row([t('issueDetail.reporter'), t('analysis.total')]),
        ...dash.OpenedByReporter.map((r) => row([r.ReporterName, r.Count])),
      ]),
    );
  }

  if (dash.TypeSeverity?.length) {
    lines.push(
      ...section(t('analysis.typeSeverity'), [
        row([t('analysis.issueType'), t('severity.label'), t('analysis.total')]),
        ...dash.TypeSeverity.map((r) => row([r.TypeName, severityText(r.Severity, t), r.Count])),
      ]),
    );
  }

  if (dash.Sparklines?.Opened?.length || dash.Sparklines?.Closed?.length) {
    lines.push(
      ...section(t('analysis.cumulativeFlow'), [
        row([t('analysis.export.day'), t('analysis.kpi.opened'), t('analysis.kpi.closed')]),
        ...mergeSparkDays(dash.Sparklines),
      ]),
    );
  }

  if (dash.AvgHoursToBranchShip != null || dash.EOLStageWait?.length) {
    lines.push(
      ...section(t('analysis.branchShipHours'), [
        row([
          t('analysis.branchShipHoursHint'),
          dash.AvgHoursToBranchShip != null
            ? Math.round(dash.AvgHoursToBranchShip * 10) / 10
            : '',
        ]),
        ...((dash.EOLStageWait ?? []).map((s) =>
          row([waitStageText(s.Stage, t), Math.round(s.AvgHours * 10) / 10]),
        )),
      ]),
    );
  }

  if (dash.BranchShippedList?.length) {
    lines.push(
      ...section(t('analysis.branchShippedList'), [
        row([
          t('issue.vin'),
          t('analysis.shippedAt'),
          t('analysis.shippedBy'),
          t('issue.status'),
          t('print.eolStage'),
        ]),
        ...dash.BranchShippedList.map((r) =>
          row([r.VIN, r.ShippedAt, r.ShippedByName, r.CurrentStatus, r.EOLStage]),
        ),
      ]),
    );
  }

  const nameLocale = (tr: string, en: string) => tr || en;
  const cov = dash.DefectCoverage;
  if (cov && cov.Total > 0) {
    const rates = defectCoverageRates(cov);
    const shareOf = t('analysis.defectOtherShareOf', { classified: cov.Classified });
    lines.push(
      ...section(t('analysis.defectCoverage'), [
        row([t('analysis.defectCatalogAdequacyHint')]),
        row([t('analysis.defectOtherPartRate'), cov.OtherPart, formatPct(rates.otherPartPct, ''), shareOf]),
        row([t('analysis.defectOtherTypeRate'), cov.OtherType, formatPct(rates.otherTypePct, ''), shareOf]),
        row([t('analysis.defectClassified'), cov.Classified]),
        ...(cov.TopOtherParts ?? []).map((r) =>
          row([`${t('analysis.defectTopOtherParts')}: ${r.Name}`, r.Count]),
        ),
        ...(cov.TopOtherTypes ?? []).map((r) =>
          row([`${t('analysis.defectTopOtherTypes')}: ${r.Name}`, r.Count]),
        ),
      ]),
      ...section(t('analysis.defectLegacyTitle'), [
        row([t('analysis.defectLegacyUnclassifiedNote'), cov.Unclassified, formatPct(rates.legacyPct, '')]),
        row([t('analysis.total'), cov.Total]),
      ]),
    );
  }

  if (dash.DefectByZone?.length) {
    lines.push(
      ...section(t('analysis.defectByZone'), [
        row([t('defects.colName'), t('defects.colCode'), t('analysis.total')]),
        ...dash.DefectByZone.map((r) =>
          row([nameLocale(r.NameTR, r.NameEN), r.Code, r.Count]),
        ),
      ]),
    );
  }

  if (dash.DefectTopParts?.length) {
    lines.push(
      ...section(t('analysis.defectTopParts'), [
        row([t('defects.colName'), t('defects.colCode'), t('analysis.total')]),
        ...dash.DefectTopParts.map((r) =>
          row([nameLocale(r.NameTR, r.NameEN), r.Code, r.Count]),
        ),
      ]),
    );
  }

  if (dash.DefectByType?.length) {
    lines.push(
      ...section(t('analysis.defectByType'), [
        row([t('defects.colName'), t('defects.colCode'), t('analysis.total')]),
        ...dash.DefectByType.map((r) =>
          row([nameLocale(r.NameTR, r.NameEN), r.Code, r.Count]),
        ),
      ]),
    );
  }

  if (dash.DefectPartTypeTop?.length) {
    lines.push(
      ...section(t('analysis.defectPartType'), [
        row(['part', 'type', t('analysis.total')]),
        ...dash.DefectPartTypeTop.map((r) =>
          row([
            nameLocale(r.PartNameTR, r.PartNameEN),
            nameLocale(r.TypeNameTR, r.TypeNameEN),
            r.Count,
          ]),
        ),
      ]),
    );
  }

  const rec = dash.DefectRecurrence;
  if (rec && (rec.CodedIssueCount > 0 || rec.Cases?.length)) {
    lines.push(
      ...section(t('analysis.defectRecurrence'), [
        row([
          t('analysis.defectRecurrenceRate'),
          rec.RecurrenceRatePct ?? '',
        ]),
        row([t('analysis.defectOccurrences'), rec.RecurringIssueCount]),
        row(['coded', rec.CodedIssueCount]),
        ...(rec.Cases ?? []).map((c) =>
          row([c.VIN, c.DefectCode, c.Count]),
        ),
      ]),
    );
    if (rec.Hotspots?.length) {
      lines.push(
        ...section(t('analysis.defectRecurrenceHotspots'), [
          row(['part', 'type', t('analysis.total')]),
          ...rec.Hotspots.map((h) =>
            row([
              nameLocale(h.PartNameTR, h.PartNameEN),
              nameLocale(h.TypeNameTR, h.TypeNameEN),
              h.RecurringIssueCount,
            ]),
          ),
        ]),
      );
    }
  }

  return lines.join('\n');
}
