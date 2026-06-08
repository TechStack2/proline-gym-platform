-- ============================================================
-- 000007: FIXES
-- 1. currency_preference column width (VARCHAR(3) → VARCHAR(4))
-- 2. Add 'red' to belt_rank_enum (needed by Taekwondo seed data)
-- ============================================================

-- Fix 1: Widen currency_preference to accept default 'BOTH'
ALTER TABLE gyms
  ALTER COLUMN currency_preference TYPE VARCHAR(4),
  ALTER COLUMN currency_preference SET NOT NULL,
  ALTER COLUMN currency_preference SET DEFAULT 'BOTH';

-- Fix 2: Add 'red' to belt_rank_enum for Taekwondo
ALTER TYPE belt_rank_enum ADD VALUE IF NOT EXISTS 'red';
