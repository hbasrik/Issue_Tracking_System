package postgres

import (
	"encoding/json"

	"github.com/karea/backend/internal/domain"
)

func adminAuditEventTypeStrings() []string {
	out := make([]string, 0, len(domain.SensitiveAdminAuditEventTypes)+len(domain.MasterDataAuditEventTypes))
	for _, t := range domain.SensitiveAdminAuditEventTypes {
		out = append(out, string(t))
	}
	for _, t := range domain.MasterDataAuditEventTypes {
		out = append(out, string(t))
	}
	return out
}

// parseAdminAuditMetadata decodes a management row's metadata. Unreadable
// metadata yields an empty detail so the row still lists with its type.
func parseAdminAuditMetadata(raw []byte) *domain.AdminAuditDetail {
	out := &domain.AdminAuditDetail{}
	if len(raw) == 0 {
		return out
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return &domain.AdminAuditDetail{}
	}
	return out
}
