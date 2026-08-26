/** Shared issue-detail labels — keep in lockstep with mobile `issueDetailCopy`. */
export const issueDetailCopy = {
  panelTitle: 'Issue Detayı',
  empty: 'Listeden bir issue seçin',
  reporter: 'Bildiren',
  issueType: 'Issue türü',
  station: 'İstasyon',
  reportedAt: 'Bildirim tarihi',
  history: 'Durum Geçmişi',
  photos: 'Fotoğraflar',
  photosEmpty: 'Henüz fotoğraf yok',
  upload: 'Yükle',
  uploading: 'Yükleniyor…',
  reportPhotos: 'Bildirim',
  resolutionPhotos: 'Çözüm',
  solution: 'Çözüm açıklaması',
} as const;

export function issueStationLabel(issue: {
  StationName?: string;
  StationID?: number | null;
}): string {
  if (issue.StationName) return issue.StationName;
  if (issue.StationID != null) return String(issue.StationID);
  return '—';
}
