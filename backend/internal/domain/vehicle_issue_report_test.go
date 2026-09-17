package domain

import "testing"

func TestVehicleEligibleForIssueReport_IncludesPlanned(t *testing.T) {
	for _, s := range IssueReportVehicleStatuses() {
		if !VehicleEligibleForIssueReport(s) {
			t.Errorf("%q should be eligible for an issue report", s)
		}
	}
	if VehicleEligibleForIssueReport(VehicleStatus("NOPE")) {
		t.Fatal("unknown status must not be eligible")
	}
	if !VehicleEligibleForIssueReport(VehicleStatusPlanned) {
		t.Fatal("PLANNED must be eligible — typeahead/cache cannot use the Vehicles table filter")
	}
}
