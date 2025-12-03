-- Migration: add power levels to statuses
-- Created: 2025-12-03T03:29:42.368Z

-- Add power level columns to character_statuses
-- Each column represents a power level (1-6) that can be TRUE or FALSE
-- The highest TRUE power level is the effective power of the status
ALTER TABLE character_statuses ADD COLUMN power_1 INTEGER DEFAULT 0;
ALTER TABLE character_statuses ADD COLUMN power_2 INTEGER DEFAULT 0;
ALTER TABLE character_statuses ADD COLUMN power_3 INTEGER DEFAULT 0;
ALTER TABLE character_statuses ADD COLUMN power_4 INTEGER DEFAULT 0;
ALTER TABLE character_statuses ADD COLUMN power_5 INTEGER DEFAULT 0;
ALTER TABLE character_statuses ADD COLUMN power_6 INTEGER DEFAULT 0;
