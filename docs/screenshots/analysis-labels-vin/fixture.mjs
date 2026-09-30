/**
 * Mocked API responses for the Analysis page and issue detail captures.
 * Catalogue names are the real live-catalogue names (read-only query,
 * 2026-09-30), including the longest ones, plus two long free-text entries.
 * Coverage mirrors the live window: 27 issues, 17 legacy-unclassified,
 * 10 classified, 1 "Other" part, 0 "Other" type.
 */
const day = (d) => `2026-09-${String(d).padStart(2, '0')}`;

const cards = {
  TotalProduction: 42, OpenIssues: 12, CriticalOpen: 3, PendingQuality: 2,
  OpenedIssues: 27, ClosedIssues: 15, BranchShipped: 9, Delivered: 4,
  AvgResolutionHours: 18.4, FirstTimeRightPercent: 71.2, CompletionPercent: 64.5,
};

const named = (NameTR, NameEN, Code, Count) => ({ NameTR, NameEN, Code, Count });

export const dashboard = {
  KPIs: {
    ShippedToday: 1, ShippedWeek: 5, ShippedInRange: 9, DepotReleasedInRange: 4,
    AvgResolutionHours: 18.4, FirstTimeRightPercent: 71.2, OpenIssuesInRange: 12, OnLineCount: 20,
  },
  Cards: cards,
  CompareCards: { ...cards, OpenIssues: 10, OpenedIssues: 22 },
  CompareMode: 'previous',
  PrimaryFrom: '2026-09-01T00:00:00Z',
  PrimaryTo: '2026-09-30T23:59:59Z',
  CompareFrom: '2026-08-02T00:00:00Z',
  CompareTo: '2026-08-31T23:59:59Z',
  WorkSplit: { Completed: 15, Ongoing: 12 },
  IssueStatus: [
    { Status: 'OPEN', Count: 7 }, { Status: 'IN_PROGRESS', Count: 5 },
    { Status: 'DONE', Count: 2 }, { Status: 'APPROVED', Count: 11 },
    { Status: 'CONDITIONAL_APPROVED', Count: 2 },
  ],
  SeverityMix: [
    { Severity: 'CRITICAL', Count: 7 }, { Severity: 'MEDIUM', Count: 11 }, { Severity: 'LOW', Count: 9 },
  ],
  DefectRate: [],
  OpenByStation: [
    { StationID: 1, StationName: 'Body Shop', VehiclesWithIssue: 4, IssueCount: 4 },
    { StationID: 4, StationName: 'Trim Station', VehiclesWithIssue: 5, IssueCount: 5 },
    { StationID: 8, StationName: 'Final Assembly Station', VehiclesWithIssue: 3, IssueCount: 3 },
  ],
  TotalByStation: [
    { StationID: 1, StationName: 'Body Shop', VehiclesWithIssue: 9, IssueCount: 9 },
    { StationID: 4, StationName: 'Trim Station', VehiclesWithIssue: 11, IssueCount: 11 },
    { StationID: 8, StationName: 'Final Assembly Station', VehiclesWithIssue: 7, IssueCount: 7 },
  ],
  MTTR: [
    { StationID: 1, StationName: 'Body Shop', MeanTimeToResolve: 12.5 * 3.6e12, Hours: 12.5 },
    { StationID: 4, StationName: 'Trim Station', MeanTimeToResolve: 22.1 * 3.6e12, Hours: 22.1 },
  ],
  Severity: [
    { VIN: 'N7V1K1SA4TK000005', TotalOpenIssues: 4, CriticalCount: 2, MediumCount: 1, LowCount: 1 },
    { VIN: 'N7V1K1SA0TK000017', TotalOpenIssues: 3, CriticalCount: 1, MediumCount: 1, LowCount: 1 },
  ],
  EOLFunnel: [
    { Stage: 'BRANCH', Count: 12 }, { Stage: 'DEPOT', Count: 6 }, { Stage: 'DELIVERED', Count: 4 },
  ],
  StagePerformance: [
    { Stage: 'BRANCH', Completed: 9, Total: 12 }, { Stage: 'DEPOT', Completed: 4, Total: 6 },
  ],
  TopIssueTypes: [{ Name: 'Hata', Count: 19 }, { Name: 'Tamir Gerekiyor', Count: 8 }],
  CompletedDaily: [1, 3, 5, 8, 12].map((d, i) => ({ Day: day(d), CompletedCount: i + 1 })),
  DailyOpenTrend: [1, 5, 10, 15, 20, 25, 30].map((d, i) => ({ Day: day(d), PendingCount: 4 + (i % 3) })),
  OpenAgeBuckets: [
    { Bucket: '0-1', Count: 3 }, { Bucket: '1-3', Count: 4 }, { Bucket: '3-7', Count: 3 }, { Bucket: '7+', Count: 2 },
  ],
  ConditionalMix: { Approved: 11, Conditional: 2 },
  Sparklines: {
    Production: [1, 10, 20, 30].map((d) => ({ Day: day(d), PendingCount: 10 })),
    Opened: [1, 10, 20, 30].map((d, i) => ({ Day: day(d), CompletedCount: 5 + i })),
    Closed: [1, 10, 20, 30].map((d, i) => ({ Day: day(d), CompletedCount: 3 + i })),
    OpenStock: [1, 10, 20, 30].map((d) => ({ Day: day(d), PendingCount: 12 })),
  },
  FPYByStation: [
    { StationID: 1, StationName: 'Body Shop', Percent: 80, OkCount: 8, TotalCount: 10 },
    { StationID: 4, StationName: 'Trim Station', Percent: 66.7, OkCount: 6, TotalCount: 9 },
  ],
  OpenedByReporter: [
    { ReporterName: 'Assembly Operator', Count: 12 },
    { ReporterName: 'Quality Operator Mehmet Yılmazoğlu', Count: 9 },
    { ReporterName: 'Local Manager', Count: 6 },
  ],
  TypeSeverity: [
    { TypeName: 'Hata', Severity: 'CRITICAL', Count: 5 },
    { TypeName: 'Hata', Severity: 'MEDIUM', Count: 8 },
    { TypeName: 'Tamir Gerekiyor', Severity: 'LOW', Count: 6 },
  ],
  AvgHoursToBranchShip: 52.3,
  EOLStageWait: [{ Stage: 'BRANCH', AvgHours: 20.5 }, { Stage: 'DEPOT', AvgHours: 31.2 }, { Stage: 'DELIVERY', AvgHours: 12 }],
  BranchShippedList: [],
  DefectByZone: [
    named('Body', 'Body', '10', 9), named('Trim', 'Trim', '30', 6),
    named('Şasi', 'Chassis', '20', 3), named('Elektrik', 'Electrical', '40', 2),
  ],
  DefectTopParts: [
    named('Bağlantı elemanı (perçin, somun, vida, klips, saplama)', 'Fastener (rivet, nut, screw, clip, stud)', '20-03', 5),
    named('İç mekân (koltuk, konsol, direksiyon, panel, döşeme)', 'Interior (seat, console, steering, panel, trim)', '30-07', 4),
    named('Conta / Sızdırmazlık elemanı', 'Seal / weatherstrip', '30-05', 3),
    named('Şarj sistemi / Yüksek voltaj', 'Charging / high voltage', '40-03', 3),
    named('Kablo / Soket / Tesisat', 'Cable / connector / harness', '40-02', 2),
    named('Bagaj kapağı / Tailgate', 'Tailgate / liftgate', '10-02', 2),
    named('Far / Stop / Aydınlatma', 'Lamp / lighting', '40-01', 1),
    named('Kapı', 'Door', '10-01', 1),
  ],
  DefectByType: [
    named('Boşluk / hizasızlık', 'Gap / misalignment', '01', 6),
    named('Yüzey / boya hatası', 'Surface / paint defect', '02', 4),
    named('Çizik / darbe / hasar', 'Scratch / impact / damage', '03', 3),
    named('Bağlantı / tork sorunu', 'Fastener / torque issue', '06', 3),
    named('Fonksiyon çalışmıyor', 'Function not working', '08', 2),
    named('Diğer', 'Other', '99', 1),
  ],
  DefectByProcess: [],
  DefectPartTypeTop: [
    ['Bağlantı elemanı (perçin, somun, vida, klips, saplama)', 'Fastener (rivet, nut, screw, clip, stud)', 'Bağlantı / tork sorunu', 'Fastener / torque issue', 4],
    ['İç mekân (koltuk, konsol, direksiyon, panel, döşeme)', 'Interior (seat, console, steering, panel, trim)', 'Çizik / darbe / hasar', 'Scratch / impact / damage', 3],
    ['Conta / Sızdırmazlık elemanı', 'Seal / weatherstrip', 'Boşluk / hizasızlık', 'Gap / misalignment', 3],
    ['Şarj sistemi / Yüksek voltaj', 'Charging / high voltage', 'Fonksiyon çalışmıyor', 'Function not working', 2],
    ['Bagaj kapağı / Tailgate', 'Tailgate / liftgate', 'Yüzey / boya hatası', 'Surface / paint defect', 2],
    ['Kapı', 'Door', 'Boşluk / hizasızlık', 'Gap / misalignment', 1],
  ].map(([PartNameTR, PartNameEN, TypeNameTR, TypeNameEN, Count]) => ({ PartNameTR, PartNameEN, TypeNameTR, TypeNameEN, Count })),
  DefectCoverage: {
    Total: 27,
    Classified: 10,
    Unclassified: 17,
    OtherPart: 1,
    OtherType: 0,
    ProcessUnassigned: 22,
    TopOtherParts: [{ Name: 'Arka tampon sağ alt köşe bağlantı braketi ve plastik koruma kapağı', Count: 1 }],
    TopOtherTypes: [],
  },
  DefectRecurrence: {
    Cases: [{ VIN: 'N7V1K1SA4TK000005', DefectCode: '20-03-06', Count: 2 }],
    Hotspots: [
      { PartNameTR: 'Bağlantı elemanı (perçin, somun, vida, klips, saplama)', PartNameEN: 'Fastener (rivet, nut, screw, clip, stud)', TypeNameTR: 'Bağlantı / tork sorunu', TypeNameEN: 'Fastener / torque issue', RecurringIssueCount: 2 },
    ],
    RecurringIssueCount: 2,
    CodedIssueCount: 10,
    RecurrenceRatePct: 20,
  },
};

export const stations = [
  { ID: 1, Name: 'Body Shop', SequenceNo: 1, IsActive: true },
  { ID: 4, Name: 'Trim Station', SequenceNo: 4, IsActive: true },
  { ID: 8, Name: 'Final Assembly Station', SequenceNo: 8, IsActive: true },
];

export const issue = {
  ID: 101,
  VIN: 'N7V1K1SA4TK000005',
  SourceType: 'STATION',
  IssueReporterID: 3,
  ReporterName: 'Assembly Operator',
  IssueTypeName: 'Hata',
  StationID: 4,
  StationName: 'Trim Station',
  Severity: 'CRITICAL',
  Status: 'OPEN',
  Description: 'Sol ön kapı menteşesinde boşluk',
  IssueDate: '2026-09-28T12:41:00Z',
  CreatedAt: '2026-09-28T12:41:00Z',
  DefectZoneID: 1, DefectZoneNameTR: 'Body', DefectZoneNameEN: 'Body',
  DefectPartID: 1, DefectPartNameTR: 'Kapı', DefectPartNameEN: 'Door',
  DefectTypeID: 1, DefectTypeNameTR: 'Boşluk / hizasızlık', DefectTypeNameEN: 'Gap / misalignment',
  DefectCode: '10-01-01',
};

export const PERMISSIONS = [
  'web.access', 'vehicle.view', 'issue.view', 'issue.create', 'issue.transition.progress',
  'issue.transition.approve', 'issue.transition.conditional_approve', 'analysis.view',
];

export const session = {
  token: 'fixture-token-not-a-real-jwt',
  user: { ID: 900001, FullName: 'Fixture Viewer', Email: 'fixture@karea.invalid', Role: 'MANAGER', IsActive: true },
  permissions: PERMISSIONS,
};
