export type RootStackParamList = {
  Login: undefined;
  Unauthorized: undefined;
  MainTabs: undefined;
  VehiclePhase: { vin: string };
  IssueReport: {
    vin: string;
    checkpointId: number;
    phase: number;
    stationId?: number;
    checkpointName: string;
  };
  EOLChecklist: { vin: string };
  ShipmentChecklist: { vin: string };
  IssueDetail: { id: number };
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  MyStation: undefined;
  MyIssues: undefined;
  Profile: undefined;
};
