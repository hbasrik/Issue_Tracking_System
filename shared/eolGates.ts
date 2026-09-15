/**
 * Map server EOL gate payloads to i18n reason keys shared by web and mobile.
 * Clients supply translate(); this module never invents readiness itself.
 */

export type EOLBranchShipGate = {
  ready: boolean;
  already_done: boolean;
  branch_eol_remaining: number;
  branch_eol_missing?: number;
  test_remaining: number;
  test_missing?: number;
  shipment_remaining: number;
  shipment_missing?: number;
  station_steps_remaining: number;
  open_issue_count: number;
};

export type EOLDepotReleaseGate = {
  ready: boolean;
  already_done: boolean;
  needs_branch_ship: boolean;
  depot_eol_remaining: number;
  depot_eol_missing?: number;
  open_issue_count: number;
};

export type EOLDeliverGate = {
  ready: boolean;
  already_done: boolean;
  needs_depot_release: boolean;
};

export type EOLGates = {
  branch_ship: EOLBranchShipGate;
  depot_release: EOLDepotReleaseGate;
  deliver: EOLDeliverGate;
};

export type EolGateReasonKey =
  | 'eol.forbidden'
  | 'eol.needBranchShip'
  | 'eol.needDepotRelease'
  | 'eol.branchRemaining'
  | 'eol.branchBlockerTest'
  | 'eol.branchBlockerShipment'
  | 'eol.branchBlockerStationSteps'
  | 'eol.depotRemaining'
  | 'eol.depotOpenIssues';

export type EolGateReason = {
  key: EolGateReasonKey;
  params?: Record<string, string | number>;
};

export function branchShipGateReasons(
  gate: EOLBranchShipGate | undefined,
  hasPermission: boolean,
): EolGateReason[] {
  if (!hasPermission) return [{ key: 'eol.forbidden' }];
  if (!gate || gate.already_done) return [];
  const out: EolGateReason[] = [];
  if (gate.branch_eol_remaining > 0) {
    out.push({ key: 'eol.branchRemaining', params: { n: gate.branch_eol_remaining } });
  }
  if (gate.test_remaining > 0) {
    out.push({ key: 'eol.branchBlockerTest', params: { n: gate.test_remaining } });
  }
  if (gate.shipment_remaining > 0) {
    out.push({
      key: 'eol.branchBlockerShipment',
      params: { n: gate.shipment_remaining },
    });
  }
  if (gate.station_steps_remaining > 0) {
    out.push({
      key: 'eol.branchBlockerStationSteps',
      params: { n: gate.station_steps_remaining },
    });
  }
  return out;
}

export function depotReleaseGateReasons(
  gate: EOLDepotReleaseGate | undefined,
  hasPermission: boolean,
): EolGateReason[] {
  if (!hasPermission) return [{ key: 'eol.forbidden' }];
  if (!gate || gate.already_done) return [];
  const out: EolGateReason[] = [];
  if (gate.needs_branch_ship) {
    out.push({ key: 'eol.needBranchShip' });
    return out;
  }
  if (gate.depot_eol_remaining > 0) {
    out.push({ key: 'eol.depotRemaining', params: { n: gate.depot_eol_remaining } });
  }
  if (gate.open_issue_count > 0) {
    out.push({ key: 'eol.depotOpenIssues', params: { n: gate.open_issue_count } });
  }
  return out;
}

export function deliverGateReasons(
  gate: EOLDeliverGate | undefined,
  hasPermission: boolean,
): EolGateReason[] {
  if (!hasPermission) return [{ key: 'eol.forbidden' }];
  if (!gate || gate.already_done) return [];
  if (gate.needs_depot_release) return [{ key: 'eol.needDepotRelease' }];
  return [];
}
