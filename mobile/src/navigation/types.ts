export type RootStackParamList = {
  Login: undefined;
  Unauthorized: undefined;
  MainTabs: undefined;
  VehicleStation: { vin: string };
  IssueReport: {
    vin: string;
    stationStepId: number;
    stationId?: number;
    stationName: string;
    stationStepName: string;
  };
  EOLChecklist: { vin: string };
  ShipmentChecklist: { vin: string };
  IssueDetail: { id: number };
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Durum: undefined;
  MyStation: undefined;
  MyIssues: undefined;
  Profile: undefined;
};
