const HOUR = 3_600_000;
const now = Date.now();
const ago = (h) => new Date(now - h * HOUR).toISOString();

export const fixtureVehicle = {
  VIN: 'KAREA0LAYOUT00042',
  VehicleModelID: 1,
  CurrentGlobalStatus: 'IN_PRODUCTION',
  CurrentEOLStage: null,
  CurrentStationID: 2,
  TotalProgressPercentage: 38,
};

const base = {
  VIN: fixtureVehicle.VIN,
  SourceType: 'STATION',
  IssueReporterID: 1,
};

export const fixtureIssues = [
  {
    ...base,
    ID: 101,
    Severity: 'CRITICAL',
    Status: 'OPEN',
    Description: 'Sol ön kapı menteşesinde boşluk',
    IssueDate: ago(50),
    DefectPartID: 1,
    DefectTypeID: 1,
    DefectPartNameTR: 'Ön kapı',
    DefectPartNameEN: 'Front door',
    DefectTypeNameTR: 'Boşluk',
    DefectTypeNameEN: 'Gap',
  },
  {
    ...base,
    ID: 102,
    Severity: 'MEDIUM',
    Status: 'CONDITIONAL_APPROVED',
    Description:
      'Arka tampon sağ alt köşesinde boya akıntısı ve hafif portakallanma, müşteri görünür bölgede, tekrar boya kabinine gönderilmeli mi değerlendirilecek',
    IssueDate: ago(30),
    ConditionalApproveDate: ago(4),
    DefectPartID: 99,
    DefectTypeID: 99,
    CustomPartName:
      'Arka tampon sağ alt köşe bağlantı braketi ve plastik koruma kapağı montaj bölgesi',
    CustomDefectName: 'Boya akıntısı / portakallanma / renk tonu farkı',
  },
  {
    ...base,
    ID: 103,
    Severity: 'LOW',
    Status: 'APPROVED',
    Description: 'Torpido kapağı hafif gıcırtı',
    IssueDate: ago(6),
    ApproveDate: ago(1),
    DefectPartID: 2,
    DefectTypeID: 2,
    DefectPartNameTR: 'Torpido',
    DefectPartNameEN: 'Glovebox',
    DefectTypeNameTR: 'Ses',
    DefectTypeNameEN: 'Noise',
  },
  {
    ...base,
    ID: 104,
    Severity: 'MEDIUM',
    Status: 'IN_PROGRESS',
    Description: 'Bagaj contası tam oturmuyor',
    IssueDate: ago(0.3),
  },
];

let id = 1;
function step(stationId, stationName, seq, name, status) {
  return {
    ID: id++,
    StationID: stationId,
    StationName: stationName,
    SequenceNo: seq,
    Name: name,
    Status: status,
    CheckedByName: status === 'PENDING' ? undefined : 'Operatör',
    CheckedAt: status === 'PENDING' ? null : ago(2),
  };
}

export const fixtureSteps = [
  step(1, 'Gövde montaj', 1, 'Şasi numarası kontrolü', 'OK'),
  step(1, 'Gövde montaj', 2, 'Kapı montajı', 'OK'),
  step(2, 'Boya kontrol', 1, 'Renk tonu', 'OK'),
  step(2, 'Boya kontrol', 2, 'Yüzey kusuru', 'PENDING'),
  step(3, 'Elektrik', 1, 'Kablo demeti', 'PENDING'),
  step(4, 'Son montaj ve iç trim uzun istasyon adı örneği', 1, 'Koltuk montajı', 'NOT_OK'),
  step(4, 'Son montaj ve iç trim uzun istasyon adı örneği', 2, 'Torpido', 'OK'),
];
