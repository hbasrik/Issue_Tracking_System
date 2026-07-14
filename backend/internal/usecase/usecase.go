// Package usecase contains application business logic. Usecases depend only on
// the domain layer and repository interfaces; they re-implement the critical
// soft-warning and hard-block rules independently of the database triggers for
// defense in depth (PRD FR-3.6/FR-4.3).
package usecase
