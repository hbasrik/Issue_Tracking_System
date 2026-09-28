package domain

// ShipmentWarningCode identifies one class of pre-shipment warning.
type ShipmentWarningCode string

const (
	ShipmentWarningShipmentIncomplete ShipmentWarningCode = "SHIPMENT_INCOMPLETE"
	ShipmentWarningTestIncomplete     ShipmentWarningCode = "TEST_INCOMPLETE"
	ShipmentWarningEOLIncomplete      ShipmentWarningCode = "EOL_INCOMPLETE"
	ShipmentWarningOpenIssue          ShipmentWarningCode = "OPEN_ISSUE"
)

// ShipmentWarning is one blocking item for the soft pre-shipment warning
// layer. Depot-release hard-block rules are unchanged.
//
// Message is a Turkish fallback for older clients; current clients build the
// localized line from the structured fields.
type ShipmentWarning struct {
	Code             ShipmentWarningCode `json:"code"`
	Message          string              `json:"message"`
	ChecklistType    ChecklistType       `json:"checklist_type,omitempty"`
	ItemID           int                 `json:"item_id,omitempty"`
	ItemNo           int                 `json:"item_no,omitempty"`
	ItemText         string              `json:"item_text,omitempty"`
	ItemStatus       CheckStatus         `json:"item_status,omitempty"`
	IssueID          int64               `json:"issue_id,omitempty"`
	IssueStatus      IssueStatus         `json:"issue_status,omitempty"`
	IssueDescription string              `json:"issue_description,omitempty"`
	RemainingCount   int                 `json:"remaining_count,omitempty"`
	// ReadFailed means the checklist could not be read, so its state is unknown.
	ReadFailed bool `json:"read_failed,omitempty"`
}

// ShipmentReadiness is the pre-shipment warning payload for one vehicle.
type ShipmentReadiness struct {
	VIN      string            `json:"vin"`
	Status   VehicleStatus     `json:"status"`
	Ready    bool              `json:"ready"`
	Warnings []ShipmentWarning `json:"warnings"`
}
