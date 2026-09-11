package domain

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// DefectProcess is a responsible shop-floor process (Kaynak / Boya / …).
// Stored as a catalogue table (not an enum) so admins can add/rename/deactivate
// without migrations.
type DefectProcess struct {
	ID         int       `json:"ID"`
	Code       string    `json:"Code"`
	NameTR     string    `json:"NameTR"`
	NameEN     string    `json:"NameEN"`
	SortOrder  int       `json:"SortOrder"`
	IsActive   bool      `json:"IsActive"`
	CreatedAt  time.Time `json:"CreatedAt"`
	UpdatedAt  time.Time `json:"UpdatedAt"`
	UsageCount int       `json:"UsageCount"`
}

// DefectZone is a part group (Body / Şasi / Trim / Elektrik).
type DefectZone struct {
	ID         int       `json:"ID"`
	Code       string    `json:"Code"`
	NameTR     string    `json:"NameTR"`
	NameEN     string    `json:"NameEN"`
	SortOrder  int       `json:"SortOrder"`
	IsActive   bool      `json:"IsActive"`
	CreatedAt  time.Time `json:"CreatedAt"`
	UpdatedAt  time.Time `json:"UpdatedAt"`
	PartCount  int       `json:"PartCount"`
	UsageCount int       `json:"UsageCount"`
}

// DefectPart is a selectable vehicle part under a zone.
type DefectPart struct {
	ID         int       `json:"ID"`
	ZoneID     int       `json:"ZoneID"`
	Code       string    `json:"Code"`
	NameTR     string    `json:"NameTR"`
	NameEN     string    `json:"NameEN"`
	SortOrder  int       `json:"SortOrder"`
	IsActive   bool      `json:"IsActive"`
	CreatedAt  time.Time `json:"CreatedAt"`
	UpdatedAt  time.Time `json:"UpdatedAt"`
	ZoneCode   string    `json:"ZoneCode"`
	ZoneNameTR string    `json:"ZoneNameTR"`
	ZoneNameEN string    `json:"ZoneNameEN"`
	UsageCount int       `json:"UsageCount"`
}

// DefectType is a defect category independent of part.
type DefectType struct {
	ID               int       `json:"ID"`
	Code             string    `json:"Code"`
	NameTR           string    `json:"NameTR"`
	NameEN           string    `json:"NameEN"`
	DefaultProcessID *int      `json:"DefaultProcessID"`
	SortOrder        int       `json:"SortOrder"`
	IsActive         bool      `json:"IsActive"`
	CreatedAt        time.Time `json:"CreatedAt"`
	UpdatedAt        time.Time `json:"UpdatedAt"`
	ProcessCode      string    `json:"ProcessCode"`
	ProcessNameTR    string    `json:"ProcessNameTR"`
	ProcessNameEN    string    `json:"ProcessNameEN"`
	UsageCount       int       `json:"UsageCount"`
}

// Stable "Diğer / Other" catalogue codes from the seed (name may change; code does not).
const (
	DefectPartCodeOther = "99-99"
	DefectTypeCodeOther = "99"
)

// IsOtherPart reports whether the part is the free-text "Other" catch-all.
func IsOtherPart(code string) bool {
	return strings.TrimSpace(code) == DefectPartCodeOther
}

// IsOtherType reports whether the defect type is the free-text "Other" catch-all.
func IsOtherType(code string) bool {
	return strings.TrimSpace(code) == DefectTypeCodeOther
}

// FormatDefectCode builds PARÇA-KUSUR (e.g. 10-01-01) from stable catalogue codes.
// Part codes already embed the zone prefix.
func FormatDefectCode(partCode, typeCode string) string {
	partCode = strings.TrimSpace(partCode)
	typeCode = strings.TrimSpace(typeCode)
	if partCode == "" || typeCode == "" {
		return ""
	}
	return partCode + "-" + typeCode
}

// VehicleRequiresIssueStation is true only while the vehicle is on the line.
// Off-line statuses (warehouse / delivered / hold / planned / shipped) hide
// the station field on the report form.
func VehicleRequiresIssueStation(status VehicleStatus) bool {
	return status == VehicleStatusInProduction
}

const (
	maxDefectNameLen = 120
	maxDefectCodeLen = 32
)

// ValidateDefectCatalogueFields checks shared name/code constraints.
func ValidateDefectCatalogueFields(code, nameTR, nameEN string) error {
	code = strings.TrimSpace(code)
	nameTR = strings.TrimSpace(nameTR)
	nameEN = strings.TrimSpace(nameEN)
	if code == "" || nameTR == "" || nameEN == "" {
		return ErrDefectCatalogueFieldsRequired
	}
	if utf8.RuneCountInString(code) > maxDefectCodeLen {
		return ErrDefectCatalogueCodeTooLong
	}
	if utf8.RuneCountInString(nameTR) > maxDefectNameLen || utf8.RuneCountInString(nameEN) > maxDefectNameLen {
		return ErrDefectCatalogueNameTooLong
	}
	return nil
}

// CatalogInUseError is returned when DELETE is attempted on a catalogue row
// that is already referenced. Soft-deactivate instead.
type CatalogInUseError struct {
	Kind  string // zone | part | type | process
	Count int
}

// Error implements the error interface (Turkish operator-facing message).
func (e *CatalogInUseError) Error() string {
	n := 0
	if e != nil {
		n = e.Count
	}
	switch {
	case e != nil && e.Kind == "zone":
		return fmt.Sprintf("bu bölge %d kayıtta kullanılmış, silinemez — pasife çekebilirsiniz", n)
	case e != nil && e.Kind == "part":
		return fmt.Sprintf("bu parça %d kayıtta kullanılmış, silinemez — pasife çekebilirsiniz", n)
	case e != nil && e.Kind == "type":
		return fmt.Sprintf("bu kusur tipi %d kayıtta kullanılmış, silinemez — pasife çekebilirsiniz", n)
	case e != nil && e.Kind == "process":
		return fmt.Sprintf("bu süreç %d kayıtta kullanılmış, silinemez — pasife çekebilirsiniz", n)
	default:
		return fmt.Sprintf("katalog maddesi %d kayıtta kullanılmış, silinemez — pasife çekebilirsiniz", n)
	}
}
