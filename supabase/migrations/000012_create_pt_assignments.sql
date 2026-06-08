-- ============================================================
-- 000012: PT ASSIGNMENTS — Credit Tracking System
-- PRO LINE Gym Platform
-- Tracks "X of Y sessions remaining" per student per package
-- Replaces the old pattern of creating pt_sessions rows on assignment
-- ============================================================

-- -----------------------------------------------------------
-- PT ASSIGNMENTS table
-- -----------------------------------------------------------
CREATE TABLE pt_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES pt_packages(id) ON DELETE RESTRICT,
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
    sessions_total INTEGER NOT NULL CHECK (sessions_total > 0),
    sessions_used INTEGER NOT NULL DEFAULT 0 CHECK (sessions_used >= 0),
    sessions_remaining INTEGER GENERATED ALWAYS AS (sessions_total - sessions_used) STORED,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sessions_used_lte_total CHECK (sessions_used <= sessions_total)
);

-- Index: find active assignments per student
CREATE INDEX idx_pt_assignments_student ON pt_assignments(student_id) WHERE is_active = true;

-- Index: find assignments per package
CREATE INDEX idx_pt_assignments_package ON pt_assignments(package_id);

-- Index: find assignments per coach
CREATE INDEX idx_pt_assignments_coach ON pt_assignments(coach_id);

-- -----------------------------------------------------------
-- AUTO-UPDATE updated_at trigger
-- -----------------------------------------------------------
CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON pt_assignments
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- -----------------------------------------------------------
-- FUNCTION: increment_sessions_used
-- Called when a pt_session is marked 'completed'
-- Prevents over-usage via CHECK constraint
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_sessions_used(assignment_id UUID)
RETURNS pt_assignments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result pt_assignments;
BEGIN
    UPDATE pt_assignments
    SET sessions_used = sessions_used + 1,
        updated_at = NOW()
    WHERE id = assignment_id
      AND is_active = true
      AND sessions_used < sessions_total
    RETURNING * INTO result;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot increment: assignment % is exhausted or inactive', assignment_id;
    END IF;

    RETURN result;
END;
$$;

-- -----------------------------------------------------------
-- FUNCTION: get_active_assignment_for_student
-- Returns the active assignment for a student+package combo
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_active_assignment(p_student_id UUID, p_package_id UUID)
RETURNS SETOF pt_assignments
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT * FROM pt_assignments
    WHERE student_id = p_student_id
      AND package_id = p_package_id
      AND is_active = true
      AND sessions_remaining > 0
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY purchased_at DESC
    LIMIT 1;
$$;

-- -----------------------------------------------------------
-- RLS: ENABLE
-- -----------------------------------------------------------
ALTER TABLE pt_assignments ENABLE ROW LEVEL SECURITY;

-- Staff can manage all assignments in their gym (via pt_packages.gym_id)
CREATE POLICY pt_assignments_staff ON pt_assignments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM pt_packages pkg
            WHERE pkg.id = pt_assignments.package_id
              AND pkg.gym_id = get_user_gym_id()
        )
        AND is_staff()
    );

-- Coaches see assignments where they are the coach
CREATE POLICY pt_assignments_coach ON pt_assignments FOR SELECT
    USING (
        coach_id IN (SELECT id FROM coaches WHERE profile_id = auth.uid())
    );

-- Students see their own assignments
CREATE POLICY pt_assignments_student ON pt_assignments FOR SELECT
    USING (
        student_id IN (SELECT id FROM students WHERE profile_id = auth.uid())
    );

-- -----------------------------------------------------------
-- AUDIT TRIGGER for pt_assignments
-- -----------------------------------------------------------
CREATE TRIGGER trg_audit_pt_assignments AFTER INSERT OR UPDATE OR DELETE ON pt_assignments
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
