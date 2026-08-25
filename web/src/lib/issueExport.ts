import {
  mediaFileUrl,
  type Issue,
  type MediaAttachment,
} from './api';
import { issueStatusLabel } from './issueStatus';

const CSV_HEADERS = [
  'id',
  'vin',
  'issue_tipi',
  'severity',
  'durum',
  'aciklama',
  'bildiren',
  'olusturma_tarihi',
  'isleme_alma_tarihi',
  'tamamlama_tarihi',
  'onaylayan',
  'onay_tarihi',
  'istasyon',
  'cozum_aciklamasi',
  'fotograf_urlleri',
] as const;

export type IssueExportPhoto = {
  issueId: number;
  kind: 'rapor' | 'cozum';
  index: number;
  fileName: string;
  bytes: Uint8Array;
  url: string;
};

export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatExportInstant(iso?: string | null): string {
  if (!iso || iso.startsWith('0001')) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString();
}

function approverOf(issue: Issue): { name: string; at: string } {
  if (issue.Status === 'CONDITIONAL_APPROVED') {
    return {
      name: issue.ConditionalApproveReporterName ?? '',
      at: formatExportInstant(issue.ConditionalApproveDate),
    };
  }
  return {
    name: issue.ApproveReporterName ?? '',
    at: formatExportInstant(issue.ApproveDate),
  };
}

export function issueCsvRow(
  issue: Issue,
  photoUrls: string[],
): string[] {
  const approver = approverOf(issue);
  return [
    String(issue.ID),
    issue.VIN ?? '',
    issue.IssueTypeName ?? '',
    issue.Severity ?? '',
    issueStatusLabel(issue.Status),
    issue.Description ?? '',
    issue.ReporterName ?? '',
    formatExportInstant(issue.CreatedAt || issue.IssueDate),
    formatExportInstant(issue.ProcessDate),
    formatExportInstant(issue.FinishDate),
    approver.name,
    approver.at,
    issue.StationName ?? '',
    issue.SolutionDescription ?? '',
    photoUrls.join(' | '),
  ];
}

export function buildIssuesCsv(
  issues: Issue[],
  photosByIssue: Map<number, string[]>,
): string {
  const lines = [
    CSV_HEADERS.join(','),
    ...issues.map((issue) =>
      issueCsvRow(issue, photosByIssue.get(issue.ID) ?? []).map(csvEscape).join(','),
    ),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function zipPhotoPath(photo: IssueExportPhoto): string {
  const stem = photo.kind === 'rapor' ? 'rapor' : 'cozum';
  const suffix = photo.index <= 1 ? '' : `-${photo.index}`;
  const ext = extOf(photo.fileName) || 'jpg';
  return `${photo.issueId}/${stem}${suffix}.${ext}`;
}

export function buildIssuesZip(
  csv: string,
  photos: IssueExportPhoto[],
): Uint8Array {
  const files: { name: string; data: Uint8Array }[] = [
    { name: 'issues.csv', data: new TextEncoder().encode(csv) },
    ...photos.map((p) => ({ name: zipPhotoPath(p), data: p.bytes })),
  ];
  return zipStore(files);
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  return name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4);
}

/** Uncompressed ZIP (STORE). JPEG is already compressed. */
function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = concat(
      u16(0x4b50),
      u16(0x0403),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      file.data,
    );
    locals.push(local);

    const central = concat(
      u16(0x4b50),
      u16(0x0201),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    );
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = concat(...centrals);
  const eocd = concat(
    u16(0x4b50),
    u16(0x0605),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  );
  return concat(...locals, centralDir, eocd);
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >> 8) & 0xff;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >> 8) & 0xff;
  b[2] = (n >> 16) & 0xff;
  b[3] = (n >> 24) & 0xff;
  return b;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function photoUrl(item: MediaAttachment): string {
  return mediaFileUrl(item.storage_path);
}
