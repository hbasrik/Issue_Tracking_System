/** Vehicle identity used to match typed VIN / vehicle_number text. */
export interface VinMatchVehicle {
  VIN: string;
  VehicleNumber?: string;
}

/**
 * True when the issue belongs to a vehicle whose VIN or vehicle_number
 * contains the typed query. VIN substring matches immediately; vehicle_number
 * matches come from typeahead results (the issue row has no number field).
 */
export function issueMatchesVinQuery(
  issue: { VIN: string },
  query: string,
  matchedVehicles: VinMatchVehicle[],
): boolean {
  const q = query.trim().toUpperCase();
  if (!q) return true;
  if (issue.VIN.toUpperCase().includes(q)) return true;
  return matchedVehicles.some((v) => {
    if (v.VIN !== issue.VIN) return false;
    const vin = v.VIN.toUpperCase();
    const num = (v.VehicleNumber ?? '').toUpperCase();
    return vin.includes(q) || num.includes(q);
  });
}

/** VIN / vehicle number OR reporter name (case-insensitive). */
export function issueMatchesListQuery(
  issue: { VIN: string; ReporterName?: string },
  query: string,
  matchedVehicles: VinMatchVehicle[],
): boolean {
  const q = query.trim();
  if (!q) return true;
  if (issueMatchesVinQuery(issue, q, matchedVehicles)) return true;
  const name = (issue.ReporterName ?? '').toLocaleLowerCase('tr-TR');
  return name.includes(q.toLocaleLowerCase('tr-TR'));
}
