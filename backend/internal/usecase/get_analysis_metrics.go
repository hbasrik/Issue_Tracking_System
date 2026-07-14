package usecase

import (
	"context"

	"github.com/karea/backend/internal/domain"
	"github.com/karea/backend/internal/repository"
)

// AnalysisMetricsReader serves the web Analysis tab from the SQL views
// defined in the initial migration.
type AnalysisMetricsReader struct {
	analysis repository.AnalysisRepository
}

// NewAnalysisMetricsReader wires the usecase with its repository.
func NewAnalysisMetricsReader(analysis repository.AnalysisRepository) *AnalysisMetricsReader {
	return &AnalysisMetricsReader{analysis: analysis}
}

// DailyPendingIssues returns the historical pending-issue trend (FR-6.5).
func (a *AnalysisMetricsReader) DailyPendingIssues(ctx context.Context, f domain.AnalysisFilter) ([]domain.DailyPendingIssue, error) {
	return a.analysis.DailyPendingIssues(ctx, f)
}

// CompletedIssuesDaily returns the daily completed-issue counts.
func (a *AnalysisMetricsReader) CompletedIssuesDaily(ctx context.Context, f domain.AnalysisFilter) ([]domain.CompletedIssuesDaily, error) {
	return a.analysis.CompletedIssuesDaily(ctx, f)
}

// DefectRatePerStation returns the per-station defect distribution (Pareto).
func (a *AnalysisMetricsReader) DefectRatePerStation(ctx context.Context, f domain.AnalysisFilter) ([]domain.StationDefectRate, error) {
	return a.analysis.DefectRatePerStation(ctx, f)
}

// MTTRPerStation returns the mean time to resolve per station.
func (a *AnalysisMetricsReader) MTTRPerStation(ctx context.Context, f domain.AnalysisFilter) ([]domain.StationMTTR, error) {
	return a.analysis.MTTRPerStation(ctx, f)
}

// VehicleSeverityBreakdown returns per-vehicle open-issue counts split by
// severity (Decision Log #7).
func (a *AnalysisMetricsReader) VehicleSeverityBreakdown(ctx context.Context, f domain.AnalysisFilter) ([]domain.VehicleSeverityBreakdown, error) {
	return a.analysis.VehicleSeverityBreakdown(ctx, f)
}
