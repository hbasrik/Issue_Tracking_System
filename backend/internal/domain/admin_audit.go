package domain

import "encoding/json"

// Management audit events (migration 0038, Karar 25). They are not tied to a
// vehicle: AuditLog.VIN stays empty (NULL) and old_value/new_value stay NULL;
// the readable detail lives in metadata as an AdminAuditDetail.
const (
	AuditEventUserAdmin         AuditEvent = "USER_ADMIN_CHANGE"
	AuditEventRolePermission    AuditEvent = "ROLE_PERMISSION_CHANGE"
	AuditEventChecklistTemplate AuditEvent = "CHECKLIST_TEMPLATE_CHANGE"
	AuditEventDefectCatalog     AuditEvent = "DEFECT_CATALOG_CHANGE"
)

// SensitiveAdminAuditEventTypes are readable only with admin.manage_users:
// they reveal who granted whom which rights and whose password was reset.
var SensitiveAdminAuditEventTypes = []AuditEvent{
	AuditEventUserAdmin,
	AuditEventRolePermission,
}

// MasterDataAuditEventTypes are template and catalogue edits, shown on the
// Activity page to analysis.view holders like the shop-floor events.
var MasterDataAuditEventTypes = []AuditEvent{
	AuditEventChecklistTemplate,
	AuditEventDefectCatalog,
}

// AdminAuditDetail.Action values.
const (
	AdminActionCreate        = "create"
	AdminActionUpdate        = "update"
	AdminActionRoleChange    = "role_change"
	AdminActionActivate      = "activate"
	AdminActionDeactivate    = "deactivate"
	AdminActionDelete        = "delete"
	AdminActionPasswordReset = "password_reset"
	AdminActionLoginUnlock   = "login_unlock"
	AdminActionGrantsChange  = "grants_change"
	AdminActionReorder       = "reorder"
)

// AdminAuditDetail.Entity values.
const (
	AdminEntityUser         = "user"
	AdminEntityRole         = "role"
	AdminEntityTemplateItem = "template_item"
	AdminEntityZone         = "zone"
	AdminEntityPart         = "part"
	AdminEntityDefectType   = "defect_type"
	AdminEntityProcess      = "process"
)

// AdminFieldChange.Field values.
const (
	AdminFieldName           = "name"
	AdminFieldEmail          = "email"
	AdminFieldRole           = "role"
	AdminFieldActive         = "is_active"
	AdminFieldCode           = "code"
	AdminFieldZone           = "zone"
	AdminFieldDefaultProcess = "default_process"
	AdminFieldSortOrder      = "sort_order"
	AdminFieldItemText       = "item_text"
	AdminFieldEOLPhase       = "eol_phase"
	AdminFieldSection        = "section"
)

// AdminAuditValue is one readable value snapshotted at write time, so a
// renamed or deleted object still reads as it was. Code is the stable key a
// client translates when it knows it (role code, "true"/"false", EOL phase,
// section key, catalogue code); TR/EN are display names. All empty means
// "not set".
type AdminAuditValue struct {
	Code string `json:"code,omitempty"`
	TR   string `json:"tr,omitempty"`
	EN   string `json:"en,omitempty"`
}

// IsZero reports an unset value.
func (v AdminAuditValue) IsZero() bool { return v.Code == "" && v.TR == "" && v.EN == "" }

// AdminText is a single-language text value (user name, item text).
func AdminText(s string) AdminAuditValue { return AdminAuditValue{TR: s, EN: s} }

// AdminNames is a bilingual catalogue name with its code.
func AdminNames(code, tr, en string) AdminAuditValue {
	return AdminAuditValue{Code: code, TR: tr, EN: en}
}

// AdminBool is an active flag ("true"/"false"); clients translate it.
func AdminBool(b bool) AdminAuditValue {
	if b {
		return AdminAuditValue{Code: "true"}
	}
	return AdminAuditValue{Code: "false"}
}

// AdminFieldChange is one changed field: old and new readable values.
type AdminFieldChange struct {
	Field string          `json:"field"`
	From  AdminAuditValue `json:"from"`
	To    AdminAuditValue `json:"to"`
}

// AdminAuditMove is one object whose position changed in a reorder.
type AdminAuditMove struct {
	Subject AdminAuditValue `json:"subject"`
	From    int             `json:"from"`
	To      int             `json:"to"`
}

// AdminAuditDetail is the metadata of a management audit row. It never holds
// a password, a hash or a token: a password reset records only the action
// and whose password it was.
type AdminAuditDetail struct {
	Action       string          `json:"action"`
	Entity       string          `json:"entity"`
	EntityID     int             `json:"entity_id,omitempty"`
	Subject      AdminAuditValue `json:"subject"`
	SubjectEmail string          `json:"subject_email,omitempty"`
	// Parent is the containing object: a template for its items, the zone
	// list for zone reorders, a zone for its parts.
	Parent       AdminAuditValue    `json:"parent,omitempty"`
	TemplateType string             `json:"template_type,omitempty"`
	ItemNo       int                `json:"item_no,omitempty"`
	Changes      []AdminFieldChange `json:"changes,omitempty"`
	Granted      []AdminAuditValue  `json:"granted,omitempty"`
	Revoked      []AdminAuditValue  `json:"revoked,omitempty"`
	Moved        []AdminAuditMove   `json:"moved,omitempty"`
}

// AddChange appends a field change when the two values differ.
func (d *AdminAuditDetail) AddChange(field string, from, to AdminAuditValue) {
	if from == to {
		return
	}
	d.Changes = append(d.Changes, AdminFieldChange{Field: field, From: from, To: to})
}

// Metadata is the JSONB form stored in audit_logs.metadata.
func (d AdminAuditDetail) Metadata() map[string]any {
	raw, err := json.Marshal(d)
	if err != nil {
		return map[string]any{"action": d.Action, "entity": d.Entity}
	}
	out := map[string]any{}
	if err := json.Unmarshal(raw, &out); err != nil {
		return map[string]any{"action": d.Action, "entity": d.Entity}
	}
	return out
}

// IsAdminAuditEvent reports the four management event types.
func IsAdminAuditEvent(t string) bool {
	for _, e := range SensitiveAdminAuditEventTypes {
		if string(e) == t {
			return true
		}
	}
	for _, e := range MasterDataAuditEventTypes {
		if string(e) == t {
			return true
		}
	}
	return false
}
