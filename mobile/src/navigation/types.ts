import type { NavigatorScreenParams } from '@react-navigation/native';
import type { HomeIssueStatKey } from '../lib/homeIssueStats';

export type RootStackParamList = {
  Login: undefined;
  Unauthorized: undefined;
  /** Drawer shell: Home, Vehicles, Issues, Profile. */
  MainDrawer: NavigatorScreenParams<MainDrawerParamList> | undefined;
  VehicleStation: { vin: string };
  IssueReport: {
    vin: string;
    stationStepId: number;
    stationId?: number;
    stationName: string;
    stationStepName: string;
  };
  /** Standalone MANUAL Issue Bildir — no checklist/step source. */
  ManualIssueReport: undefined;
  EOLChecklist: { vin: string };
  ShipmentChecklist: { vin: string };
  TestChecklist: { vin: string };
  IssueDetail: { id: number };
};

export type MainDrawerParamList = {
  Home: undefined;
  Vehicles: undefined;
  MyIssues: { homeStat?: HomeIssueStatKey } | undefined;
  Profile: undefined;
};
