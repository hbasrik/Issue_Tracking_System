-- Irreversible data backfill; down is a no-op. Removing the inserted PENDING
-- rows would risk deleting operator work if any were later evaluated.
SELECT 1;
