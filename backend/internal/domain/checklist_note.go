package domain

// ChecklistNotes holds the per-answer description columns of
// checklist_item_progress. Every answer owns exactly one column; slot is the
// only place that answer→column mapping lives, so moving to a single note
// column later changes this file alone.
type ChecklistNotes struct {
	Rework      string // rework_desc
	Conditional string // conditional_desc
	Rejected    string // rejected_desc
	Approved    string // approved_desc
}

func (n *ChecklistNotes) slot(status CheckStatus) *string {
	switch status {
	case CheckStatusOK:
		return &n.Approved
	case CheckStatusConditionalOK:
		return &n.Conditional
	case CheckStatusNotOK:
		return &n.Rejected
	case CheckStatusRework:
		return &n.Rework
	default:
		return nil
	}
}

// NotesForStatus places one note in the column owned by status. PENDING owns
// no column, so its note is dropped.
func NotesForStatus(status CheckStatus, note string) ChecklistNotes {
	var n ChecklistNotes
	if s := n.slot(status); s != nil {
		*s = note
	}
	return n
}

// NoteFor returns the note stored in the column owned by status.
func (n ChecklistNotes) NoteFor(status CheckStatus) string {
	if s := n.slot(status); s != nil {
		return *s
	}
	return ""
}
