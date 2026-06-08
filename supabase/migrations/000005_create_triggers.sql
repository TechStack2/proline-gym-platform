-- ============================================================
-- 000005: TRIGGERS & FUNCTIONS
-- Proline Gym — Auto-update timestamps, audit logging, rate validation
-- ============================================================

-- -----------------------------------------------------------
-- AUTO UPDATE TIMESTAMP
-- Apply to every table with updated_at column
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Attach to all tables with updated_at
CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON gyms
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON coaches
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON guardians
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON disciplines
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON class_schedules
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON membership_plans
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON student_memberships
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON pt_packages
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON pt_sessions
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON external_coaches
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON rentals
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON rental_bookings
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON camps
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON camp_registrations
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON trial_classes
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- -----------------------------------------------------------
-- AUDIT LOGGING
-- Logs all INSERT/UPDATE/DELETE operations on key tables
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, record_id, operation, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'create', row_to_json(NEW), auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'update', row_to_json(OLD), row_to_json(NEW), auth.uid());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, record_id, operation, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'delete', row_to_json(OLD), auth.uid());
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach audit triggers to critical tables
CREATE TRIGGER trg_audit_students AFTER INSERT OR UPDATE OR DELETE ON students
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_audit_payments AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_audit_belt_promotions AFTER INSERT OR UPDATE OR DELETE ON belt_promotions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_audit_student_memberships AFTER INSERT OR UPDATE OR DELETE ON student_memberships
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- -----------------------------------------------------------
-- EXCHANGE RATE VALIDATION
-- Ensures rate > 0 before insert/update
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_exchange_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rate <= 0 THEN
    RAISE EXCEPTION 'Exchange rate must be greater than 0 (got: %)', NEW.rate;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_exchange_rate BEFORE INSERT OR UPDATE ON exchange_rates
  FOR EACH ROW EXECUTE FUNCTION validate_exchange_rate();

-- -----------------------------------------------------------
-- AUTO SET PROFILE ON USER SIGNUP
-- Creates a profile record when a new auth user is created
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profiles (id, gym_id, phone, created_at, updated_at)
  VALUES (
    NEW.id,
    (SELECT id FROM gyms WHERE is_active = true ORDER BY created_at ASC LIMIT 1),
    NEW.phone,
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert (Supabase-managed)
-- Note: This trigger must be created in a separate migration after Supabase schema is available
-- Uncomment after Supabase project is provisioned:
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- -----------------------------------------------------------
-- AUTO CALCULATE INVOICE TOTALS
-- Computes tax_amount and total from base amount
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tax_amount_usd := ROUND(NEW.amount_usd * NEW.tax_rate / 100, 2);
  NEW.total_usd := NEW.amount_usd + NEW.tax_amount_usd;
  IF NEW.exchange_rate IS NOT NULL AND NEW.exchange_rate > 0 THEN
    NEW.total_lbp := ROUND(NEW.total_usd * NEW.exchange_rate, 2);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calculate_invoice_totals BEFORE INSERT OR UPDATE OF amount_usd, tax_rate, exchange_rate ON invoices
  FOR EACH ROW EXECUTE FUNCTION calculate_invoice_totals();

-- -----------------------------------------------------------
-- AUTO GENERATE INVOICE NUMBER
-- Sequential per gym, format: INV-{GYM_SLUG}-{YYYY}-{SEQ}
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  gym_slug TEXT;
  year_part TEXT;
  seq_num INTEGER;
BEGIN
  SELECT slug INTO gym_slug FROM gyms WHERE id = NEW.gym_id;
  year_part := TO_CHAR(NOW(), 'YYYY');
  
  SELECT COUNT(*) + 1 INTO seq_num
  FROM invoices
  WHERE gym_id = NEW.gym_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  
  NEW.invoice_number := 'INV-' || UPPER(gym_slug) || '-' || year_part || '-' || LPAD(seq_num::TEXT, 5, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_invoice_number BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();
