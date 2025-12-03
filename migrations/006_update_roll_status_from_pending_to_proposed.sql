-- Migration: update roll status from pending to proposed
-- Created: 2025-12-03T05:15:23.165Z

-- Update terminology: 'pending' -> 'proposed' for consistency
-- This ensures all roll statuses use past tense (proposed, confirmed, executed)
UPDATE rolls SET status = 'proposed' WHERE status = 'pending';
