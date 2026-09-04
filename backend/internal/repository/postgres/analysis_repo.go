package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// AnalysisRepo reads Analysis-tab metrics from the live tables so every
// series can honor the same from/to (inclusive calendar day) filter.
type AnalysisRepo struct {
	pool *pgxpool.Pool
}

// NewAnalysisRepo constructs an AnalysisRepo.
func NewAnalysisRepo(pool *pgxpool.Pool) *AnalysisRepo {
	return &AnalysisRepo{pool: pool}
}

var _ repository.AnalysisRepository = (*AnalysisRepo)(nil)

const eolStageExpr = `CASE WHEN w.current_stage = 'DOCUMENT' THEN 'DEPOT' ELSE w.current_stage::text END`

const issueJoin = `
FROM issue_list i
JOIN vehicles v ON v.vin = i.vin
LEFT JOIN issue_types it ON it.id = i.issue_type_id
LEFT JOIN vehicle_eol_workflow w ON w.vin = v.vin`

const vehicleEOLJoin = `LEFT JOIN vehicle_eol_workflow w ON w.vin = v.vin`

// issueWhere binds $1 from, $2 until (exclusive), $3 vin suffix, $4 station,
// $5 vehicle status, $6 issue type name, $7 severity, $8 EOL stage. tsColumn
// is the timestamptz compared to the date window (issue_date, finish_date, …).
func issueWhere(tsColumn string) string {
	return fmt.Sprintf(`
WHERE ($1::timestamptz IS NULL OR %s >= $1)
  AND ($2::timestamptz IS NULL OR %s < $2)
  AND ($3 = '' OR i.vin ILIKE '%%' || $3 || '%%')
  AND ($4::int IS NULL OR i.station_id = $4)
  AND ($5 = '' OR v.current_global_status::text = $5)
  AND ($6 = '' OR it.name ILIKE '%%' || $6 || '%%')
  AND ($7 = '' OR i.severity::text = $7)
  AND ($8 = '' OR %s = $8)`, tsColumn, tsColumn, eolStageExpr)
}

func eolStageWhere(param int) string {
	return fmt.Sprintf(`AND ($%d = '' OR %s = $%d)`, param, eolStageExpr, param)
}

type boundArgs struct {
	from     any
	until    any
	suffix   string
	station  any
	status   string
	itype    string
	severity string
	eolStage string
}

func normalizeEOLStage(raw string) string {
	s := strings.ToUpper(strings.TrimSpace(raw))
	if s == "DOCUMENT" {
		return "DEPOT"
	}
	return s
}

func bounds(f domain.AnalysisFilter) boundArgs {
	b := boundArgs{
		suffix:   strings.TrimSpace(f.VINSuffix),
		itype:    strings.TrimSpace(f.IssueType),
		eolStage: normalizeEOLStage(f.EOLStage),
	}
	from, until := domain.InclusiveDateBounds(f.From, f.To)
	if from != nil {
		b.from = *from
	}
	if until != nil {
		b.until = *until
	}
	if f.StationID != nil {
		b.station = *f.StationID
	}
	if f.VehicleStatus != nil {
		b.status = string(*f.VehicleStatus)
	}
	if f.Severity != nil {
		b.severity = string(*f.Severity)
	}
	return b
}

func (b boundArgs) slice() []any {
	return []any{b.from, b.until, b.suffix, b.station, b.status, b.itype, b.severity, b.eolStage}
}

func (b boundArgs) vehicleEOLArgs() []any {
	return []any{b.from, b.until, b.suffix, b.status, b.eolStage}
}

func intersectWindow(f domain.AnalysisFilter, winFrom, winUntil time.Time) (from, until time.Time, empty bool) {
	return domain.IntersectWindow(f.From, f.To, winFrom, winUntil)
}

// DailyPendingIssues returns per-day counts of issues reported that day that
// are still open (OPEN/IN_PROGRESS/DONE). Honors the full AnalysisFilter —
// not the unfiltered vw_daily_pending_issues view.
func (r *AnalysisRepo) DailyPendingIssues(ctx context.Context, f domain.AnalysisFilter) ([]domain.DailyPendingIssue, error) {
	b := bounds(f)
	rows, err := r.pool.Query(ctx,
		`SELECT date_trunc('day', i.issue_date AT TIME ZONE 'UTC')::date AS day,
		        count(*) FILTER (WHERE i.status IN ('OPEN','IN_PROGRESS','DONE'))::bigint
		 `+issueJoin+issueWhere("i.issue_date")+`
		 GROUP BY 1
		 HAVING count(*) FILTER (WHERE i.status IN ('OPEN','IN_PROGRESS','DONE')) > 0
		 ORDER BY 1`, b.slice()...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.DailyPendingIssue
	for rows.Next() {
		var d domain.DailyPendingIssue
		if err := rows.Scan(&d.Day, &d.PendingCount); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// CompletedIssuesDaily returns finish_date buckets inside the filter window.
func (r *AnalysisRepo) CompletedIssuesDaily(ctx context.Context, f domain.AnalysisFilter) ([]domain.CompletedIssuesDaily, error) {
	b := bounds(f)
	rows, err := r.pool.Query(ctx,
		`SELECT date_trunc('day', i.finish_date AT TIME ZONE 'UTC')::date AS day, count(*)
		 `+issueJoin+issueWhere("i.finish_date")+`
		   AND i.finish_date IS NOT NULL
		 GROUP BY 1 ORDER BY 1`, b.slice()...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.CompletedIssuesDaily
	for rows.Next() {
		var d domain.CompletedIssuesDaily
		if err := rows.Scan(&d.Day, &d.CompletedCount); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// DefectRatePerStation counts issues created in the filter window per station.
func (r *AnalysisRepo) DefectRatePerStation(ctx context.Context, f domain.AnalysisFilter) ([]domain.StationDefectRate, error) {
	b := bounds(f)
	rows, err := r.pool.Query(ctx,
		`SELECT s.id, s.name, count(DISTINCT i.vin), count(i.id)
		 `+issueJoin+`
		 JOIN stations s ON s.id = i.station_id
		 `+issueWhere("i.issue_date")+`
		 GROUP BY s.id, s.name
		 ORDER BY count(i.id) DESC, s.sequence_no`, b.slice()...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.StationDefectRate
	for rows.Next() {
		var s domain.StationDefectRate
		if err := rows.Scan(&s.StationID, &s.StationName, &s.VehiclesWithIssue, &s.IssueCount); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// MTTRPerStation averages finish_date - process_date for issues completed
// (DONE stamped) in the window. OPEN→IN_PROGRESS is process_date; that is the
// clock the Analysis tab uses, not issue_date (notification).
func (r *AnalysisRepo) MTTRPerStation(ctx context.Context, f domain.AnalysisFilter) ([]domain.StationMTTR, error) {
	b := bounds(f)
	rows, err := r.pool.Query(ctx,
		`SELECT s.id, s.name, EXTRACT(EPOCH FROM avg(i.finish_date - i.process_date))
		 FROM stations s
		 JOIN issue_list i ON i.station_id = s.id
		 JOIN vehicles v ON v.vin = i.vin
		 LEFT JOIN issue_types it ON it.id = i.issue_type_id
		 `+vehicleEOLJoin+`
		 `+issueWhere("i.finish_date")+`
		   AND i.process_date IS NOT NULL AND i.finish_date IS NOT NULL
		 GROUP BY s.id, s.name
		 ORDER BY s.sequence_no`, b.slice()...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.StationMTTR
	for rows.Next() {
		var s domain.StationMTTR
		var seconds float64
		if err := rows.Scan(&s.StationID, &s.StationName, &seconds); err != nil {
			return nil, err
		}
		s.MeanTimeToResolve = time.Duration(seconds * float64(time.Second))
		s.Hours = seconds / 3600
		out = append(out, s)
	}
	return out, rows.Err()
}

// VehicleSeverityBreakdown returns open (OPEN/IN_PROGRESS/DONE) issues in the
// window, grouped by VIN.
func (r *AnalysisRepo) VehicleSeverityBreakdown(ctx context.Context, f domain.AnalysisFilter) ([]domain.VehicleSeverityBreakdown, error) {
	b := bounds(f)
	rows, err := r.pool.Query(ctx,
		`SELECT i.vin,
		        count(*)::bigint,
		        count(*) FILTER (WHERE i.severity = 'CRITICAL')::bigint,
		        count(*) FILTER (WHERE i.severity = 'MEDIUM')::bigint,
		        count(*) FILTER (WHERE i.severity = 'LOW')::bigint
		 `+issueJoin+issueWhere("i.issue_date")+`
		   AND i.status IN ('OPEN', 'IN_PROGRESS', 'DONE')
		 GROUP BY i.vin
		 ORDER BY count(*) DESC`, b.slice()...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.VehicleSeverityBreakdown
	for rows.Next() {
		var v domain.VehicleSeverityBreakdown
		if err := rows.Scan(&v.VIN, &v.TotalOpenIssues, &v.CriticalCount, &v.MediumCount, &v.LowCount); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// Dashboard gathers every Analysis-tab series under one filter.
func (r *AnalysisRepo) Dashboard(ctx context.Context, f domain.AnalysisFilter) (*domain.AnalysisDashboard, error) {
	dash := &domain.AnalysisDashboard{
		IssueStatus:      []domain.IssueStatusCount{},
		SeverityMix:      []domain.SeverityCount{},
		DefectRate:       []domain.StationDefectRate{},
		OpenByStation:    []domain.StationDefectRate{},
		TotalByStation:   []domain.StationDefectRate{},
		MTTR:             []domain.StationMTTR{},
		Severity:         []domain.VehicleSeverityBreakdown{},
		EOLFunnel:        []domain.EOLStageCount{},
		StagePerformance: []domain.StagePerformance{},
		TopIssueTypes:    []domain.IssueTypeCount{},
		CompletedDaily:   []domain.CompletedIssuesDaily{},
		DailyOpenTrend:   []domain.DailyPendingIssue{},
		OpenAgeBuckets:   []domain.OpenAgeBucket{},
		CompareMode:      f.CompareMode,
	}

	kpis, err := r.kpis(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.KPIs = kpis

	cards, err := r.kpiCards(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.Cards = cards

	cmpFilter, err := compareFilter(f)
	if err == nil {
		cmp, err := r.kpiCards(ctx, cmpFilter)
		if err != nil {
			return nil, err
		}
		dash.CompareCards = cmp
	}

	if err := r.scanWorkAndStatus(ctx, f, dash); err != nil {
		return nil, err
	}
	if err := r.scanSeverityMix(ctx, f, dash); err != nil {
		return nil, err
	}
	defects, err := r.DefectRatePerStation(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.DefectRate = defects
	dash.TotalByStation = topNStations(defects, 8)

	openBy, err := r.openIssuesPerStation(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.OpenByStation = topNStations(openBy, 5)

	mttr, err := r.MTTRPerStation(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.MTTR = mttr
	sev, err := r.VehicleSeverityBreakdown(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.Severity = sev
	daily, err := r.CompletedIssuesDaily(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.CompletedDaily = daily

	pending, err := r.DailyPendingIssues(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.DailyOpenTrend = pending

	funnel, err := r.eolFunnel(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.EOLFunnel = funnel

	stagePerf, err := r.stagePerformance(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.StagePerformance = stagePerf

	age, err := r.openAgeBuckets(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.OpenAgeBuckets = age

	cond, err := r.conditionalMix(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.ConditionalMix = cond

	types, err := r.topIssueTypes(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.TopIssueTypes = types

	sparks, err := r.sparklines(ctx, f)
	if err != nil {
		return nil, err
	}
	dash.Sparklines = sparks

	return dash, nil
}

func topNStations(rows []domain.StationDefectRate, n int) []domain.StationDefectRate {
	if len(rows) <= n {
		return rows
	}
	return rows[:n]
}

func compareFilter(f domain.AnalysisFilter) (domain.AnalysisFilter, error) {
	out := f
	mode := f.CompareMode
	if mode == "" {
		mode = "previous_period"
	}
	out.CompareMode = mode

	from, until := domain.InclusiveDateBounds(f.From, f.To)
	now := time.Now().UTC()
	if until == nil {
		u := domain.StartOfUTCDay(now).Add(24 * time.Hour)
		until = &u
	}
	if from == nil {
		// default primary window = last 7 days ending at until
		fr := until.AddDate(0, 0, -7)
		from = &fr
	}
	dur := until.Sub(*from)
	if dur <= 0 {
		return out, fmt.Errorf("empty primary window")
	}

	var cFrom, cUntil time.Time
	switch mode {
	case "previous_week":
		cUntil = *from
		cFrom = cUntil.AddDate(0, 0, -7)
	case "previous_month":
		cUntil = *from
		cFrom = cUntil.AddDate(0, -1, 0)
	default: // previous_period — same duration immediately before
		cUntil = *from
		cFrom = cUntil.Add(-dur)
	}
	out.From = &cFrom
	// InclusiveDateBounds expects inclusive calendar To; store day before cUntil
	toDay := cUntil.Add(-time.Hour) // land in previous calendar day
	y, m, d := toDay.UTC().Date()
	toInclusive := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	out.To = &toInclusive
	return out, nil
}

func (r *AnalysisRepo) scanWorkAndStatus(ctx context.Context, f domain.AnalysisFilter, dash *domain.AnalysisDashboard) error {
	b := bounds(f)
	rows, err := r.pool.Query(ctx,
		`SELECT i.status::text, count(*)
		 `+issueJoin+issueWhere("i.issue_date")+`
		 GROUP BY i.status`, b.slice()...)
	if err != nil {
		return err
	}
	defer rows.Close()
	counts := map[domain.IssueStatus]int64{}
	for rows.Next() {
		var status string
		var n int64
		if err := rows.Scan(&status, &n); err != nil {
			return err
		}
		counts[domain.IssueStatus(status)] = n
	}
	if err := rows.Err(); err != nil {
		return err
	}
	order := []domain.IssueStatus{
		domain.IssueStatusOpen, domain.IssueStatusInProgress, domain.IssueStatusDone,
		domain.IssueStatusApproved, domain.IssueStatusConditionalApproved,
	}
	for _, st := range order {
		n := counts[st]
		dash.IssueStatus = append(dash.IssueStatus, domain.IssueStatusCount{Status: st, Count: n})
		switch st {
		case domain.IssueStatusOpen, domain.IssueStatusInProgress:
			dash.WorkSplit.Ongoing += n
			dash.KPIs.OpenIssuesInRange += n
		case domain.IssueStatusDone, domain.IssueStatusApproved, domain.IssueStatusConditionalApproved:
			dash.WorkSplit.Completed += n
		}
	}
	return nil
}

func (r *AnalysisRepo) kpis(ctx context.Context, f domain.AnalysisFilter) (domain.AnalysisKPIs, error) {
	var k domain.AnalysisKPIs
	today := domain.IstanbulDayStart(time.Now())
	todayEnd := today.Add(24 * time.Hour)
	weekStart := today.AddDate(0, 0, -6)

	shipped, err := r.countShipped(ctx, f, nil, nil)
	if err != nil {
		return k, err
	}
	k.ShippedInRange = shipped

	if from, until, empty := intersectWindow(f, today, todayEnd); !empty {
		k.ShippedToday, err = r.countShipped(ctx, f, &from, &until)
		if err != nil {
			return k, err
		}
	}
	if from, until, empty := intersectWindow(f, weekStart, todayEnd); !empty {
		k.ShippedWeek, err = r.countShipped(ctx, f, &from, &until)
		if err != nil {
			return k, err
		}
	}

	k.DepotReleasedInRange, err = r.countDepotReleased(ctx, f)
	if err != nil {
		return k, err
	}

	hours, err := r.avgResolutionHours(ctx, f)
	if err != nil {
		return k, err
	}
	k.AvgResolutionHours = hours

	ftr, err := r.firstTimeRight(ctx, f)
	if err != nil {
		return k, err
	}
	k.FirstTimeRightPercent = ftr

	k.OnLineCount, err = r.countOnLine(ctx, f)
	if err != nil {
		return k, err
	}
	return k, nil
}

func (r *AnalysisRepo) countShipped(ctx context.Context, f domain.AnalysisFilter, from, until *time.Time) (int64, error) {
	b := bounds(f)
	if from != nil {
		b.from = *from
	}
	if until != nil {
		b.until = *until
	}
	// Post-0013 "sevk" = branch shipment stamp. document_approved_at and
	// STATUS_CHANGE→SHIPPED are legacy and no longer written in the live flow.
	var n int64
	err := r.pool.QueryRow(ctx,
		`SELECT count(*)
		 FROM vehicle_eol_workflow w
		 JOIN vehicles v ON v.vin = w.vin
		 WHERE w.branch_shipped_at IS NOT NULL
		   AND ($1::timestamptz IS NULL OR w.branch_shipped_at >= $1)
		   AND ($2::timestamptz IS NULL OR w.branch_shipped_at < $2)
		   AND ($3 = '' OR w.vin ILIKE '%' || $3 || '%')
		   AND ($4 = '' OR v.current_global_status::text = $4)
		   `+eolStageWhere(5),
		b.from, b.until, b.suffix, b.status, b.eolStage,
	).Scan(&n)
	return n, err
}

func (r *AnalysisRepo) countDepotReleased(ctx context.Context, f domain.AnalysisFilter) (int64, error) {
	b := bounds(f)
	var n int64
	err := r.pool.QueryRow(ctx,
		`SELECT count(*)
		 FROM vehicle_eol_workflow w
		 JOIN vehicles v ON v.vin = w.vin
		 WHERE w.depot_released_at IS NOT NULL
		   AND ($1::timestamptz IS NULL OR w.depot_released_at >= $1)
		   AND ($2::timestamptz IS NULL OR w.depot_released_at < $2)
		   AND ($3 = '' OR w.vin ILIKE '%' || $3 || '%')
		   AND ($4 = '' OR v.current_global_status::text = $4)
		   `+eolStageWhere(5),
		b.from, b.until, b.suffix, b.status, b.eolStage,
	).Scan(&n)
	return n, err
}

func (r *AnalysisRepo) avgResolutionHours(ctx context.Context, f domain.AnalysisFilter) (*float64, error) {
	b := bounds(f)
	var hours *float64
	err := r.pool.QueryRow(ctx,
		`SELECT EXTRACT(EPOCH FROM avg(i.finish_date - i.process_date)) / 3600
		 `+issueJoin+issueWhere("i.finish_date")+`
		   AND i.process_date IS NOT NULL AND i.finish_date IS NOT NULL`,
		b.slice()...,
	).Scan(&hours)
	return hours, err
}

func (r *AnalysisRepo) firstTimeRight(ctx context.Context, f domain.AnalysisFilter) (*float64, error) {
	b := bounds(f)
	var pct *float64
	err := r.pool.QueryRow(ctx,
		`SELECT CASE WHEN count(*) = 0 THEN NULL
		        ELSE round(100.0 * count(*) FILTER (WHERE p.status = 'OK') / count(*), 1)
		        END
		 FROM vehicle_station_step_progress p
		 JOIN vehicles v ON v.vin = p.vin
		 `+vehicleEOLJoin+`
		 WHERE p.status <> 'PENDING'
		   AND ($1::timestamptz IS NULL OR p.checked_at >= $1)
		   AND ($2::timestamptz IS NULL OR p.checked_at < $2)
		   AND ($3 = '' OR p.vin ILIKE '%' || $3 || '%')
		   AND ($4::int IS NULL OR p.station_id = $4)
		   AND ($5 = '' OR v.current_global_status::text = $5)
		   `+eolStageWhere(6),
		b.from, b.until, b.suffix, b.station, b.status, b.eolStage,
	).Scan(&pct)
	return pct, err
}

func (r *AnalysisRepo) kpiCards(ctx context.Context, f domain.AnalysisFilter) (domain.AnalysisKPICards, error) {
	var c domain.AnalysisKPICards
	b := bounds(f)

	if err := r.pool.QueryRow(ctx,
		`SELECT count(*)
		 FROM vehicles v
		 `+vehicleEOLJoin+`
		 WHERE ($1::timestamptz IS NULL OR v.created_at >= $1)
		   AND ($2::timestamptz IS NULL OR v.created_at < $2)
		   AND ($3 = '' OR v.vin ILIKE '%' || $3 || '%')
		   AND ($4 = '' OR v.current_global_status::text = $4)
		   AND v.current_global_status <> 'PLANNED'
		   `+eolStageWhere(5),
		b.from, b.until, b.suffix, b.status, b.eolStage,
	).Scan(&c.TotalProduction); err != nil {
		return c, err
	}

	openQ := `
		SELECT
		  count(*) FILTER (WHERE i.status IN ('OPEN','IN_PROGRESS','DONE'))::bigint,
		  count(*) FILTER (WHERE i.status IN ('OPEN','IN_PROGRESS','DONE') AND i.severity = 'CRITICAL')::bigint,
		  count(*) FILTER (WHERE i.status = 'DONE')::bigint,
		  count(*)::bigint,
		  count(*) FILTER (WHERE i.status IN ('APPROVED','CONDITIONAL_APPROVED')
		                   OR (i.finish_date IS NOT NULL AND i.status IN ('DONE','APPROVED','CONDITIONAL_APPROVED')))::bigint
		 ` + issueJoin + issueWhere("i.issue_date")
	var opened, closedRough int64
	if err := r.pool.QueryRow(ctx, openQ, b.slice()...).Scan(
		&c.OpenIssues, &c.CriticalOpen, &c.PendingQuality, &opened, &closedRough,
	); err != nil {
		return c, err
	}
	c.OpenedIssues = opened

	// Closed = quality outcomes stamped in window (approve / conditional dates)
	if err := r.pool.QueryRow(ctx,
		`SELECT count(*)
		 `+issueJoin+`
		 WHERE (
		         (i.approve_date IS NOT NULL AND ($1::timestamptz IS NULL OR i.approve_date >= $1)
		           AND ($2::timestamptz IS NULL OR i.approve_date < $2))
		      OR (i.conditional_approve_date IS NOT NULL AND ($1::timestamptz IS NULL OR i.conditional_approve_date >= $1)
		           AND ($2::timestamptz IS NULL OR i.conditional_approve_date < $2))
		      OR (i.finish_date IS NOT NULL AND i.status IN ('APPROVED','CONDITIONAL_APPROVED')
		           AND ($1::timestamptz IS NULL OR i.finish_date >= $1)
		           AND ($2::timestamptz IS NULL OR i.finish_date < $2))
		       )
		   AND ($3 = '' OR i.vin ILIKE '%' || $3 || '%')
		   AND ($4::int IS NULL OR i.station_id = $4)
		   AND ($5 = '' OR v.current_global_status::text = $5)
		   AND ($6 = '' OR it.name ILIKE '%' || $6 || '%')
		   AND ($7 = '' OR i.severity::text = $7)
		   `+eolStageWhere(8)+``,
		b.slice()...,
	).Scan(&c.ClosedIssues); err != nil {
		return c, err
	}

	if err := r.pool.QueryRow(ctx,
		`SELECT count(*)
		 FROM vehicle_eol_workflow w
		 JOIN vehicles v ON v.vin = w.vin
		 WHERE w.branch_shipped_at IS NOT NULL
		   AND ($1::timestamptz IS NULL OR w.branch_shipped_at >= $1)
		   AND ($2::timestamptz IS NULL OR w.branch_shipped_at < $2)
		   AND ($3 = '' OR w.vin ILIKE '%' || $3 || '%')
		   AND ($4 = '' OR v.current_global_status::text = $4)
		   `+eolStageWhere(5),
		b.from, b.until, b.suffix, b.status, b.eolStage,
	).Scan(&c.BranchShipped); err != nil {
		return c, err
	}

	if err := r.pool.QueryRow(ctx,
		`SELECT count(*)
		 FROM vehicle_eol_workflow w
		 JOIN vehicles v ON v.vin = w.vin
		 WHERE w.delivered_at IS NOT NULL
		   AND ($1::timestamptz IS NULL OR w.delivered_at >= $1)
		   AND ($2::timestamptz IS NULL OR w.delivered_at < $2)
		   AND ($3 = '' OR w.vin ILIKE '%' || $3 || '%')
		   AND ($4 = '' OR v.current_global_status::text = $4)
		   `+eolStageWhere(5),
		b.from, b.until, b.suffix, b.status, b.eolStage,
	).Scan(&c.Delivered); err != nil {
		return c, err
	}

	hours, err := r.avgResolutionHours(ctx, f)
	if err != nil {
		return c, err
	}
	c.AvgResolutionHours = hours

	ftr, err := r.firstTimeRight(ctx, f)
	if err != nil {
		return c, err
	}
	c.FirstTimeRightPercent = ftr

	var done, total int64
	if err := r.pool.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE p.check_status IN ('OK','CONDITIONAL_OK'))::bigint,
		       count(*)::bigint
		  FROM checklist_item_progress p
		  JOIN checklist_template_items cti ON cti.id = p.check_item_id
		  JOIN vehicles v ON v.vin = p.vin
		  `+vehicleEOLJoin+`
		 WHERE p.checklist_type = 'EOL'
		   AND v.current_global_status <> 'PLANNED'
		   AND cti.eol_phase IN ('BRANCH','DEPOT')
		   AND ($1 = '' OR p.vin ILIKE '%' || $1 || '%')
		   AND ($2 = '' OR v.current_global_status::text = $2)
		   `+eolStageWhere(3),
		b.suffix, b.status, b.eolStage,
	).Scan(&done, &total); err != nil {
		return c, err
	}
	if total > 0 {
		pct := float64(done) * 100 / float64(total)
		rounded := float64(int(pct*10+0.5)) / 10
		c.CompletionPercent = &rounded
	}
	return c, nil
}

func (r *AnalysisRepo) scanSeverityMix(ctx context.Context, f domain.AnalysisFilter, dash *domain.AnalysisDashboard) error {
	b := bounds(f)
	rows, err := r.pool.Query(ctx,
		`SELECT i.severity::text, count(*)
		 `+issueJoin+issueWhere("i.issue_date")+`
		 GROUP BY i.severity`, b.slice()...)
	if err != nil {
		return err
	}
	defer rows.Close()
	found := map[domain.IssueSeverity]int64{}
	for rows.Next() {
		var sev string
		var n int64
		if err := rows.Scan(&sev, &n); err != nil {
			return err
		}
		found[domain.IssueSeverity(sev)] = n
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, sev := range []domain.IssueSeverity{
		domain.IssueSeverityCritical, domain.IssueSeverityMedium, domain.IssueSeverityLow,
	} {
		dash.SeverityMix = append(dash.SeverityMix, domain.SeverityCount{
			Severity: sev, Count: found[sev],
		})
	}
	return nil
}

func (r *AnalysisRepo) openIssuesPerStation(ctx context.Context, f domain.AnalysisFilter) ([]domain.StationDefectRate, error) {
	b := bounds(f)
	rows, err := r.pool.Query(ctx,
		`SELECT s.id, s.name, count(DISTINCT i.vin), count(i.id)
		 `+issueJoin+`
		 JOIN stations s ON s.id = i.station_id
		 `+issueWhere("i.issue_date")+`
		   AND i.status IN ('OPEN','IN_PROGRESS','DONE')
		 GROUP BY s.id, s.name
		 ORDER BY count(i.id) DESC, s.sequence_no`, b.slice()...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.StationDefectRate
	for rows.Next() {
		var s domain.StationDefectRate
		if err := rows.Scan(&s.StationID, &s.StationName, &s.VehiclesWithIssue, &s.IssueCount); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *AnalysisRepo) eolFunnel(ctx context.Context, f domain.AnalysisFilter) ([]domain.EOLStageCount, error) {
	b := bounds(f)
	rows, err := r.pool.Query(ctx, `
		SELECT CASE WHEN w.current_stage = 'DOCUMENT' THEN 'DEPOT' ELSE w.current_stage::text END,
		       count(*)::bigint
		  FROM vehicle_eol_workflow w
		  JOIN vehicles v ON v.vin = w.vin
		 WHERE v.current_global_status <> 'PLANNED'
		   AND ($1 = '' OR w.vin ILIKE '%' || $1 || '%')
		   AND ($2 = '' OR v.current_global_status::text = $2)
		   `+eolStageWhere(3)+`
		 GROUP BY 1`, b.suffix, b.status, b.eolStage)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	found := map[string]int64{}
	for rows.Next() {
		var stage string
		var n int64
		if err := rows.Scan(&stage, &n); err != nil {
			return nil, err
		}
		found[stage] += n
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]domain.EOLStageCount, 0, 3)
	for _, stage := range []string{"BRANCH", "DEPOT", "COMPLETED"} {
		out = append(out, domain.EOLStageCount{Stage: stage, Count: found[stage]})
	}
	return out, nil
}

func (r *AnalysisRepo) stagePerformance(ctx context.Context, f domain.AnalysisFilter) ([]domain.StagePerformance, error) {
	b := bounds(f)
	rows, err := r.pool.Query(ctx, `
		SELECT cti.eol_phase::text,
		       count(*) FILTER (WHERE p.check_status IN ('OK','CONDITIONAL_OK'))::bigint,
		       count(*)::bigint
		  FROM checklist_item_progress p
		  JOIN checklist_template_items cti ON cti.id = p.check_item_id
		  JOIN vehicles v ON v.vin = p.vin
		  `+vehicleEOLJoin+`
		 WHERE p.checklist_type = 'EOL'
		   AND v.current_global_status <> 'PLANNED'
		   AND cti.eol_phase IN ('BRANCH','DEPOT')
		   AND ($1 = '' OR p.vin ILIKE '%' || $1 || '%')
		   AND ($2 = '' OR v.current_global_status::text = $2)
		   `+eolStageWhere(3)+`
		 GROUP BY cti.eol_phase`, b.suffix, b.status, b.eolStage)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	found := map[string]domain.StagePerformance{}
	for rows.Next() {
		var row domain.StagePerformance
		if err := rows.Scan(&row.Stage, &row.Completed, &row.Total); err != nil {
			return nil, err
		}
		found[row.Stage] = row
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := []domain.StagePerformance{
		{Stage: "BRANCH", Completed: found["BRANCH"].Completed, Total: found["BRANCH"].Total},
		{Stage: "DEPOT", Completed: found["DEPOT"].Completed, Total: found["DEPOT"].Total},
	}
	var completedN, funnelN int64
	_ = r.pool.QueryRow(ctx, `
		SELECT count(*) FILTER (
		         WHERE CASE WHEN w.current_stage = 'DOCUMENT' THEN 'DEPOT' ELSE w.current_stage::text END = 'COMPLETED'
		       )::bigint,
		       count(*)::bigint
		  FROM vehicle_eol_workflow w
		  JOIN vehicles v ON v.vin = w.vin
		 WHERE v.current_global_status <> 'PLANNED'
		   AND ($1 = '' OR w.vin ILIKE '%' || $1 || '%')
		   AND ($2 = '' OR v.current_global_status::text = $2)
		   `+eolStageWhere(3),
		b.suffix, b.status, b.eolStage,
	).Scan(&completedN, &funnelN)
	out = append(out, domain.StagePerformance{
		Stage: "COMPLETED", Completed: completedN, Total: funnelN,
	})
	return out, nil
}

func (r *AnalysisRepo) openAgeBuckets(ctx context.Context, f domain.AnalysisFilter) ([]domain.OpenAgeBucket, error) {
	b := bounds(f)
	rows, err := r.pool.Query(ctx, `
		SELECT bucket, count(*)::bigint FROM (
		  SELECT CASE
		           WHEN now() - coalesce(i.issue_date, i.created_at) < interval '1 day' THEN '0-1'
		           WHEN now() - coalesce(i.issue_date, i.created_at) < interval '3 days' THEN '1-3'
		           WHEN now() - coalesce(i.issue_date, i.created_at) < interval '7 days' THEN '3-7'
		           ELSE '7+'
		         END AS bucket
		    `+issueJoin+issueWhere("i.issue_date")+`
		     AND i.status IN ('OPEN','IN_PROGRESS','DONE')
		) x
		GROUP BY bucket`, b.slice()...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	found := map[string]int64{}
	for rows.Next() {
		var bucket string
		var n int64
		if err := rows.Scan(&bucket, &n); err != nil {
			return nil, err
		}
		found[bucket] = n
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]domain.OpenAgeBucket, 0, 4)
	for _, bkt := range []string{"0-1", "1-3", "3-7", "7+"} {
		out = append(out, domain.OpenAgeBucket{Bucket: bkt, Count: found[bkt]})
	}
	return out, nil
}

func (r *AnalysisRepo) conditionalMix(ctx context.Context, f domain.AnalysisFilter) (domain.ConditionalApprovalMix, error) {
	b := bounds(f)
	var mix domain.ConditionalApprovalMix
	// Windowed: quality stamp (approve / conditional_approve) falls in range.
	// No window: all currently APPROVED / CONDITIONAL_APPROVED issues.
	err := r.pool.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE i.status = 'APPROVED')::bigint,
		       count(*) FILTER (WHERE i.status = 'CONDITIONAL_APPROVED')::bigint
		 `+issueJoin+`
		 WHERE i.status IN ('APPROVED','CONDITIONAL_APPROVED')
		   AND (
		         ($1::timestamptz IS NULL AND $2::timestamptz IS NULL)
		      OR (i.approve_date IS NOT NULL AND ($1::timestamptz IS NULL OR i.approve_date >= $1)
		           AND ($2::timestamptz IS NULL OR i.approve_date < $2))
		      OR (i.conditional_approve_date IS NOT NULL AND ($1::timestamptz IS NULL OR i.conditional_approve_date >= $1)
		           AND ($2::timestamptz IS NULL OR i.conditional_approve_date < $2))
		       )
		   AND ($3 = '' OR i.vin ILIKE '%' || $3 || '%')
		   AND ($4::int IS NULL OR i.station_id = $4)
		   AND ($5 = '' OR v.current_global_status::text = $5)
		   AND ($6 = '' OR it.name ILIKE '%' || $6 || '%')
		   AND ($7 = '' OR i.severity::text = $7)
		   `+eolStageWhere(8)+``,
		b.slice()...,
	).Scan(&mix.Approved, &mix.Conditional)
	return mix, err
}

func (r *AnalysisRepo) sparklines(ctx context.Context, f domain.AnalysisFilter) (domain.AnalysisSparklines, error) {
	var s domain.AnalysisSparklines
	pending, err := r.DailyPendingIssues(ctx, f)
	if err != nil {
		return s, err
	}
	s.OpenStock = pending
	closed, err := r.CompletedIssuesDaily(ctx, f)
	if err != nil {
		return s, err
	}
	s.Closed = closed

	b := bounds(f)
	rows, err := r.pool.Query(ctx,
		`SELECT date_trunc('day', i.issue_date AT TIME ZONE 'UTC')::date AS day, count(*)
		 `+issueJoin+issueWhere("i.issue_date")+`
		 GROUP BY 1 ORDER BY 1`, b.slice()...)
	if err != nil {
		return s, err
	}
	defer rows.Close()
	for rows.Next() {
		var d domain.CompletedIssuesDaily
		if err := rows.Scan(&d.Day, &d.CompletedCount); err != nil {
			return s, err
		}
		s.Opened = append(s.Opened, d)
	}
	if err := rows.Err(); err != nil {
		return s, err
	}

	vrows, err := r.pool.Query(ctx, `
		SELECT date_trunc('day', v.created_at AT TIME ZONE 'UTC')::date AS day, count(*)
		  FROM vehicles v
		  `+vehicleEOLJoin+`
		 WHERE v.current_global_status <> 'PLANNED'
		   AND ($1::timestamptz IS NULL OR v.created_at >= $1)
		   AND ($2::timestamptz IS NULL OR v.created_at < $2)
		   AND ($3 = '' OR v.vin ILIKE '%' || $3 || '%')
		   AND ($4 = '' OR v.current_global_status::text = $4)
		   `+eolStageWhere(5)+`
		 GROUP BY 1 ORDER BY 1`, b.from, b.until, b.suffix, b.status, b.eolStage)
	if err != nil {
		return s, err
	}
	defer vrows.Close()
	for vrows.Next() {
		var d domain.DailyPendingIssue
		if err := vrows.Scan(&d.Day, &d.PendingCount); err != nil {
			return s, err
		}
		s.Production = append(s.Production, d)
	}
	return s, vrows.Err()
}

func (r *AnalysisRepo) topIssueTypes(ctx context.Context, f domain.AnalysisFilter) ([]domain.IssueTypeCount, error) {
	b := bounds(f)
	rows, err := r.pool.Query(ctx,
		`SELECT coalesce(it.name, '(unknown)'), count(*)::bigint
		 `+issueJoin+issueWhere("i.issue_date")+`
		 GROUP BY it.name
		 ORDER BY count(*) DESC
		 LIMIT 8`, b.slice()...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.IssueTypeCount
	for rows.Next() {
		var row domain.IssueTypeCount
		if err := rows.Scan(&row.Name, &row.Count); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// countOnLine is a snapshot: IN_PRODUCTION vehicles right now. Date filters
// are ignored; VIN suffix and station still apply.
func (r *AnalysisRepo) countOnLine(ctx context.Context, f domain.AnalysisFilter) (int64, error) {
	b := bounds(f)
	var n int64
	err := r.pool.QueryRow(ctx,
		`SELECT count(*)
		 FROM vehicles v
		 `+vehicleEOLJoin+`
		 WHERE v.current_global_status = 'IN_PRODUCTION'
		   AND ($1 = '' OR v.vin ILIKE '%' || $1 || '%')
		   AND ($2::int IS NULL OR v.current_station_id = $2)
		   `+eolStageWhere(3),
		b.suffix, b.station, b.eolStage,
	).Scan(&n)
	return n, err
}

var _ repository.HomeRepository = (*AnalysisRepo)(nil)

// EOLStageCounts returns non-PLANNED vehicles grouped by live EOL stage.
// Legacy DOCUMENT rows are counted as DEPOT. Vehicles without a workflow
// row are omitted (they have not entered the EOL path).
func (r *AnalysisRepo) EOLStageCounts(ctx context.Context) ([]domain.HomeEOLStageCount, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT CASE
		         WHEN w.current_stage = 'DOCUMENT' THEN 'DEPOT'
		         ELSE w.current_stage::text
		       END AS stage,
		       count(*)::bigint
		  FROM vehicle_eol_workflow w
		  JOIN vehicles v ON v.vin = w.vin
		 WHERE v.current_global_status <> 'PLANNED'
		 GROUP BY 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	found := map[string]int64{}
	for rows.Next() {
		var stage string
		var n int64
		if err := rows.Scan(&stage, &n); err != nil {
			return nil, err
		}
		found[stage] += n
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	order := []string{"BRANCH", "DEPOT", "COMPLETED"}
	out := make([]domain.HomeEOLStageCount, 0, len(order))
	for _, stage := range order {
		out = append(out, domain.HomeEOLStageCount{Stage: stage, Count: found[stage]})
	}
	return out, nil
}

// EOLChecklistCounts returns passing vs total EOL progress rows per phase
// for vehicles that are not PLANNED.
func (r *AnalysisRepo) EOLChecklistCounts(ctx context.Context) ([]domain.HomeEOLChecklistCount, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT cti.eol_phase::text,
		       count(*) FILTER (WHERE p.check_status IN ('OK', 'CONDITIONAL_OK'))::bigint,
		       count(*)::bigint,
		       count(DISTINCT p.vin)::bigint,
		       count(DISTINCT p.check_item_id)::bigint
		  FROM checklist_item_progress p
		  JOIN checklist_template_items cti ON cti.id = p.check_item_id
		  JOIN vehicles v ON v.vin = p.vin
		 WHERE p.checklist_type = 'EOL'
		   AND v.current_global_status <> 'PLANNED'
		   AND cti.eol_phase IN ('BRANCH', 'DEPOT')
		 GROUP BY cti.eol_phase`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	found := map[string]domain.HomeEOLChecklistCount{}
	for rows.Next() {
		var row domain.HomeEOLChecklistCount
		if err := rows.Scan(&row.Phase, &row.Done, &row.Total, &row.VehicleCount, &row.ItemsPerVehicle); err != nil {
			return nil, err
		}
		found[row.Phase] = row
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]domain.HomeEOLChecklistCount, 0, 2)
	for _, phase := range []string{"BRANCH", "DEPOT"} {
		row := found[phase]
		row.Phase = phase
		out = append(out, row)
	}
	return out, nil
}

// CriticalVehicles ranks VINs by open CRITICAL issue count.
func (r *AnalysisRepo) CriticalVehicles(ctx context.Context, limit int) ([]domain.HomeCriticalVehicle, error) {
	if limit <= 0 {
		limit = 8
	}
	rows, err := r.pool.Query(ctx, `
		SELECT i.vin,
		       count(*) FILTER (WHERE i.severity = 'CRITICAL')::bigint,
		       CASE
		         WHEN count(*) FILTER (WHERE i.severity = 'CRITICAL') > 0 THEN 'CRITICAL'
		         WHEN count(*) FILTER (WHERE i.severity = 'MEDIUM') > 0 THEN 'MEDIUM'
		         ELSE 'LOW'
		       END,
		       v.current_global_status::text,
		       COALESCE(
		         CASE WHEN w.current_stage = 'DOCUMENT' THEN 'DEPOT' ELSE w.current_stage::text END,
		         ''
		       )
		  FROM issue_list i
		  JOIN vehicles v ON v.vin = i.vin
		  LEFT JOIN vehicle_eol_workflow w ON w.vin = i.vin
		 WHERE i.status IN ('OPEN', 'IN_PROGRESS')
		 GROUP BY i.vin, v.current_global_status, w.current_stage
		HAVING count(*) FILTER (WHERE i.severity = 'CRITICAL') > 0
		 ORDER BY 2 DESC, i.vin
		 LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.HomeCriticalVehicle
	for rows.Next() {
		var row domain.HomeCriticalVehicle
		if err := rows.Scan(&row.VIN, &row.CriticalCount, &row.WorstSeverity, &row.Status, &row.EOLStage); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []domain.HomeCriticalVehicle{}
	}
	return out, rows.Err()
}
