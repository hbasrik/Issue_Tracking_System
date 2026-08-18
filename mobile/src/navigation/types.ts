export type RootStackParamList = {
  Login: undefined;
  Unauthorized: undefined;
  /** Drawer shell: Home, Vehicles, My Issues, Profile. */
  MainDrawer: undefined;
  VehicleStation: { vin: string };
  IssueReport: {
    vin: string;
    stationStepId: number;
    stationId?: number;
    stationName: string;
    stationStepName: string;
  };
  /** Standalone MANUAL Hata Bildir — no checklist/step source. */
  ManualIssueReport: undefined;
  EOLChecklist: { vin: string };
  ShipmentChecklist: { vin: string };
  TestChecklist: { vin: string };
  IssueDetail: { id: number };
};

export type MainDrawerParamList = {
  Home: undefined;
  Vehicles: undefined;
  MyIssues: undefined;
  Profile: undefined;
};
