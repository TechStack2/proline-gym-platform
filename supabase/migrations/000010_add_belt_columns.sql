-- ============================================================
-- 000010: ADD BELT COLUMNS TO STUDENTS TABLE
-- SHOWSTOPPER: belt-engine-client.tsx queries current_belt_rank 
-- and belt_promotion_date on students table, but these columns 
-- were missing from the CREATE TABLE in 000002.
-- belt_rank_enum is defined in 000001_create_enums.sql
-- ============================================================

-- Add current_belt_rank column using the existing belt_rank_enum type
ALTER TABLE students 
  ADD COLUMN IF NOT EXISTS current_belt_rank belt_rank_enum;

-- Add belt_promotion_date column for tracking when the student was last promoted
ALTER TABLE students 
  ADD COLUMN IF NOT EXISTS belt_promotion_date DATE;

-- Update existing students with default belt rank if null
-- (belt engine seed data in 000006 already inserts these columns)
UPDATE students 
SET current_belt_rank = 'white' 
WHERE current_belt_rank IS NULL;
