export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_invites: {
        Row: {
          channel: string
          created_at: string
          gym_id: string
          id: string
          profile_id: string
          provider: string
          status: string
          student_id: string | null
          token: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          gym_id: string
          id?: string
          profile_id: string
          provider?: string
          status?: string
          student_id?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          gym_id?: string
          id?: string
          profile_id?: string
          provider?: string
          status?: string
          student_id?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_invites_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_invites_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attendance_date: string
          check_in_time: string | null
          class_id: string
          created_at: string
          id: string
          marked_by: string | null
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          offline_sync_id: string | null
          schedule_id: string | null
          status: Database["public"]["Enums"]["attendance_status_enum"]
          student_id: string
        }
        Insert: {
          attendance_date: string
          check_in_time?: string | null
          class_id: string
          created_at?: string
          id?: string
          marked_by?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          offline_sync_id?: string | null
          schedule_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status_enum"]
          student_id: string
        }
        Update: {
          attendance_date?: string
          check_in_time?: string | null
          class_id?: string
          created_at?: string
          id?: string
          marked_by?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          offline_sync_id?: string | null
          schedule_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status_enum"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          changed_by: string | null
          created_at: string
          gym_id: string | null
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          operation: Database["public"]["Enums"]["audit_action_enum"]
          record_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          gym_id?: string | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          operation: Database["public"]["Enums"]["audit_action_enum"]
          record_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          gym_id?: string | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          operation?: Database["public"]["Enums"]["audit_action_enum"]
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      belt_hierarchies: {
        Row: {
          created_at: string
          discipline_id: string
          id: string
          is_active: boolean
          is_black_belt: boolean
          min_classes_attended: number | null
          min_months_in_rank: number | null
          name_ar: string
          name_en: string
          name_fr: string
          rank: Database["public"]["Enums"]["belt_rank_enum"]
          sort_order: number
          stripe_count: number | null
        }
        Insert: {
          created_at?: string
          discipline_id: string
          id?: string
          is_active?: boolean
          is_black_belt?: boolean
          min_classes_attended?: number | null
          min_months_in_rank?: number | null
          name_ar: string
          name_en: string
          name_fr: string
          rank: Database["public"]["Enums"]["belt_rank_enum"]
          sort_order: number
          stripe_count?: number | null
        }
        Update: {
          created_at?: string
          discipline_id?: string
          id?: string
          is_active?: boolean
          is_black_belt?: boolean
          min_classes_attended?: number | null
          min_months_in_rank?: number | null
          name_ar?: string
          name_en?: string
          name_fr?: string
          rank?: Database["public"]["Enums"]["belt_rank_enum"]
          sort_order?: number
          stripe_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "belt_hierarchies_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
        ]
      }
      belt_promotions: {
        Row: {
          belt_hierarchy_id: string
          coach_id: string
          created_at: string
          discipline_id: string
          from_rank: Database["public"]["Enums"]["belt_rank_enum"] | null
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          promotion_date: string
          student_id: string
          to_rank: Database["public"]["Enums"]["belt_rank_enum"]
        }
        Insert: {
          belt_hierarchy_id: string
          coach_id: string
          created_at?: string
          discipline_id: string
          from_rank?: Database["public"]["Enums"]["belt_rank_enum"] | null
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          promotion_date: string
          student_id: string
          to_rank: Database["public"]["Enums"]["belt_rank_enum"]
        }
        Update: {
          belt_hierarchy_id?: string
          coach_id?: string
          created_at?: string
          discipline_id?: string
          from_rank?: Database["public"]["Enums"]["belt_rank_enum"] | null
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          promotion_date?: string
          student_id?: string
          to_rank?: Database["public"]["Enums"]["belt_rank_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "belt_promotions_belt_hierarchy_id_fkey"
            columns: ["belt_hierarchy_id"]
            isOneToOne: false
            referencedRelation: "belt_hierarchies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "belt_promotions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "belt_promotions_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "belt_promotions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      camp_attendance: {
        Row: {
          attendance_date: string
          camp_id: string
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          picked_up_by: string | null
          status: Database["public"]["Enums"]["attendance_status_enum"]
          student_id: string
        }
        Insert: {
          attendance_date: string
          camp_id: string
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          picked_up_by?: string | null
          status?: Database["public"]["Enums"]["attendance_status_enum"]
          student_id: string
        }
        Update: {
          attendance_date?: string
          camp_id?: string
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          picked_up_by?: string | null
          status?: Database["public"]["Enums"]["attendance_status_enum"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "camp_attendance_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "camps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camp_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      camp_registrations: {
        Row: {
          camp_id: string
          created_at: string
          dietary_restrictions: string | null
          guardian_id: string | null
          id: string
          invoice_id: string | null
          medical_notes: string | null
          pickup_authorized_persons: string | null
          price_lbp: number | null
          price_usd: number | null
          registration_date: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          camp_id: string
          created_at?: string
          dietary_restrictions?: string | null
          guardian_id?: string | null
          id?: string
          invoice_id?: string | null
          medical_notes?: string | null
          pickup_authorized_persons?: string | null
          price_lbp?: number | null
          price_usd?: number | null
          registration_date?: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          camp_id?: string
          created_at?: string
          dietary_restrictions?: string | null
          guardian_id?: string | null
          id?: string
          invoice_id?: string | null
          medical_notes?: string | null
          pickup_authorized_persons?: string | null
          price_lbp?: number | null
          price_usd?: number | null
          registration_date?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "camp_registrations_camp_id_fkey"
            columns: ["camp_id"]
            isOneToOne: false
            referencedRelation: "camps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camp_registrations_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camp_registrations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camp_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          code: string
          created_at: string
          gym_id: string
          id: string
          is_active: boolean
          name: string
          source: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          gym_id: string
          id?: string
          is_active?: boolean
          name: string
          source?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          gym_id?: string
          id?: string
          is_active?: boolean
          name?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      camps: {
        Row: {
          created_at: string
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          description_fr: string | null
          early_bird_deadline: string | null
          early_bird_price_usd: number | null
          end_date: string
          gym_id: string
          id: string
          max_age: number | null
          max_capacity: number
          min_age: number | null
          name_ar: string
          name_en: string
          name_fr: string
          price_lbp: number | null
          price_usd: number
          show_on_landing: boolean
          sibling_discount_percent: number | null
          start_date: string
          status: Database["public"]["Enums"]["camp_status_enum"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          early_bird_deadline?: string | null
          early_bird_price_usd?: number | null
          end_date: string
          gym_id: string
          id?: string
          max_age?: number | null
          max_capacity: number
          min_age?: number | null
          name_ar: string
          name_en: string
          name_fr: string
          price_lbp?: number | null
          price_usd: number
          show_on_landing?: boolean
          sibling_discount_percent?: number | null
          start_date: string
          status?: Database["public"]["Enums"]["camp_status_enum"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          early_bird_deadline?: string | null
          early_bird_price_usd?: number | null
          end_date?: string
          gym_id?: string
          id?: string
          max_age?: number | null
          max_capacity?: number
          min_age?: number | null
          name_ar?: string
          name_en?: string
          name_fr?: string
          price_lbp?: number | null
          price_usd?: number
          show_on_landing?: boolean
          sibling_discount_percent?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["camp_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "camps_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      class_enrollments: {
        Row: {
          class_id: string
          created_at: string
          enrolled_at: string
          id: string
          is_active: boolean
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          enrolled_at?: string
          id?: string
          is_active?: boolean
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          enrolled_at?: string
          id?: string
          is_active?: boolean
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_registrations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          billing_anchor: string | null
          cancelled_at: string | null
          class_id: string
          created_at: string
          discount_amount_usd: number | null
          discount_pct: number | null
          end_date: string | null
          first_cycle_prorated: boolean
          gym_id: string
          id: string
          invoice_id: string | null
          monthly_fee_lbp: number | null
          monthly_fee_usd: number | null
          paid_until: string | null
          rejected_reason: string | null
          requested_at: string
          start_date: string | null
          status: Database["public"]["Enums"]["class_registration_status_enum"]
          student_id: string
          suspended_at: string | null
          updated_at: string
          waitlist_position: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          billing_anchor?: string | null
          cancelled_at?: string | null
          class_id: string
          created_at?: string
          discount_amount_usd?: number | null
          discount_pct?: number | null
          end_date?: string | null
          first_cycle_prorated?: boolean
          gym_id: string
          id?: string
          invoice_id?: string | null
          monthly_fee_lbp?: number | null
          monthly_fee_usd?: number | null
          paid_until?: string | null
          rejected_reason?: string | null
          requested_at?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["class_registration_status_enum"]
          student_id: string
          suspended_at?: string | null
          updated_at?: string
          waitlist_position?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          billing_anchor?: string | null
          cancelled_at?: string | null
          class_id?: string
          created_at?: string
          discount_amount_usd?: number | null
          discount_pct?: number | null
          end_date?: string | null
          first_cycle_prorated?: boolean
          gym_id?: string
          id?: string
          invoice_id?: string | null
          monthly_fee_lbp?: number | null
          monthly_fee_usd?: number | null
          paid_until?: string | null
          rejected_reason?: string | null
          requested_at?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["class_registration_status_enum"]
          student_id?: string
          suspended_at?: string | null
          updated_at?: string
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "class_registrations_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_registrations_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_registrations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedules: {
        Row: {
          class_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_schedules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          belt_requirement: Database["public"]["Enums"]["belt_rank_enum"] | null
          coach_id: string
          color: string | null
          created_at: string
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          description_fr: string | null
          discipline_id: string
          gym_id: string
          id: string
          is_active: boolean
          max_age: number | null
          max_capacity: number
          min_age: number | null
          monthly_fee_lbp: number | null
          monthly_fee_usd: number | null
          name_ar: string
          name_en: string
          name_fr: string
          room: string | null
          show_on_landing: boolean
          status: Database["public"]["Enums"]["class_status_enum"]
          updated_at: string
        }
        Insert: {
          belt_requirement?:
            | Database["public"]["Enums"]["belt_rank_enum"]
            | null
          coach_id: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          discipline_id: string
          gym_id: string
          id?: string
          is_active?: boolean
          max_age?: number | null
          max_capacity?: number
          min_age?: number | null
          monthly_fee_lbp?: number | null
          monthly_fee_usd?: number | null
          name_ar: string
          name_en: string
          name_fr: string
          room?: string | null
          show_on_landing?: boolean
          status?: Database["public"]["Enums"]["class_status_enum"]
          updated_at?: string
        }
        Update: {
          belt_requirement?:
            | Database["public"]["Enums"]["belt_rank_enum"]
            | null
          coach_id?: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          discipline_id?: string
          gym_id?: string
          id?: string
          is_active?: boolean
          max_age?: number | null
          max_capacity?: number
          min_age?: number | null
          monthly_fee_lbp?: number | null
          monthly_fee_usd?: number | null
          name_ar?: string
          name_en?: string
          name_fr?: string
          room?: string | null
          show_on_landing?: boolean
          status?: Database["public"]["Enums"]["class_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_availability: {
        Row: {
          coach_id: string
          created_at: string
          day_of_week: number
          end_time: string
          gym_id: string
          id: string
          is_active: boolean
          start_time: string
          updated_at: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          gym_id: string
          id?: string
          is_active?: boolean
          start_time: string
          updated_at?: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          gym_id?: string
          id?: string
          is_active?: boolean
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_availability_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_availability_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_availability_overrides: {
        Row: {
          coach_id: string
          created_at: string
          date: string
          end_time: string | null
          gym_id: string
          id: string
          kind: string
          start_time: string | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          date: string
          end_time?: string | null
          gym_id: string
          id?: string
          kind: string
          start_time?: string | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          date?: string
          end_time?: string | null
          gym_id?: string
          id?: string
          kind?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_availability_overrides_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_availability_overrides_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_profile_pending: {
        Row: {
          avatar_url: string | null
          bio_ar: string | null
          bio_en: string | null
          bio_fr: string | null
          coach_id: string
          gym_id: string
          specialization_ar: string | null
          specialization_en: string | null
          specialization_fr: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio_ar?: string | null
          bio_en?: string | null
          bio_fr?: string | null
          coach_id: string
          gym_id: string
          specialization_ar?: string | null
          specialization_en?: string | null
          specialization_fr?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio_ar?: string | null
          bio_en?: string | null
          bio_fr?: string | null
          coach_id?: string
          gym_id?: string
          specialization_ar?: string | null
          specialization_en?: string | null
          specialization_fr?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_profile_pending_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_profile_pending_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          belt_rank: Database["public"]["Enums"]["belt_rank_enum"] | null
          bio_ar: string | null
          bio_en: string | null
          bio_fr: string | null
          created_at: string
          deleted_at: string | null
          gym_id: string
          has_pending_changes: boolean
          hourly_rate_lbp: number | null
          hourly_rate_usd: number | null
          id: string
          is_active: boolean
          landing_status: string
          landing_visible: boolean
          last_published_at: string | null
          profile_id: string
          specialization_ar: string | null
          specialization_en: string | null
          specialization_fr: string | null
          updated_at: string
        }
        Insert: {
          belt_rank?: Database["public"]["Enums"]["belt_rank_enum"] | null
          bio_ar?: string | null
          bio_en?: string | null
          bio_fr?: string | null
          created_at?: string
          deleted_at?: string | null
          gym_id: string
          has_pending_changes?: boolean
          hourly_rate_lbp?: number | null
          hourly_rate_usd?: number | null
          id?: string
          is_active?: boolean
          landing_status?: string
          landing_visible?: boolean
          last_published_at?: string | null
          profile_id: string
          specialization_ar?: string | null
          specialization_en?: string | null
          specialization_fr?: string | null
          updated_at?: string
        }
        Update: {
          belt_rank?: Database["public"]["Enums"]["belt_rank_enum"] | null
          bio_ar?: string | null
          bio_en?: string | null
          bio_fr?: string | null
          created_at?: string
          deleted_at?: string | null
          gym_id?: string
          has_pending_changes?: boolean
          hourly_rate_lbp?: number | null
          hourly_rate_usd?: number | null
          id?: string
          is_active?: boolean
          landing_status?: string
          landing_visible?: boolean
          last_published_at?: string | null
          profile_id?: string
          specialization_ar?: string | null
          specialization_en?: string | null
          specialization_fr?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaches_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disciplines: {
        Row: {
          created_at: string
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          description_fr: string | null
          gym_id: string
          icon_url: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          name_fr: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          gym_id: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          name_fr: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          gym_id?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          name_fr?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disciplines_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          document_type: Database["public"]["Enums"]["document_type_enum"]
          expires_at: string | null
          external_coach_id: string | null
          file_path: string
          file_size_bytes: number | null
          gym_id: string
          id: string
          mime_type: string | null
          student_id: string | null
          title_ar: string | null
          title_en: string | null
          title_fr: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type: Database["public"]["Enums"]["document_type_enum"]
          expires_at?: string | null
          external_coach_id?: string | null
          file_path: string
          file_size_bytes?: number | null
          gym_id: string
          id?: string
          mime_type?: string | null
          student_id?: string | null
          title_ar?: string | null
          title_en?: string | null
          title_fr?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type_enum"]
          expires_at?: string | null
          external_coach_id?: string | null
          file_path?: string
          file_size_bytes?: number | null
          gym_id?: string
          id?: string
          mime_type?: string | null
          student_id?: string | null
          title_ar?: string | null
          title_en?: string | null
          title_fr?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_external_coach_id_fkey"
            columns: ["external_coach_id"]
            isOneToOne: false
            referencedRelation: "external_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          entered_by: string | null
          gym_id: string
          id: string
          notes: string | null
          rate: number
          rate_date: string
          source: string | null
        }
        Insert: {
          created_at?: string
          entered_by?: string | null
          gym_id: string
          id?: string
          notes?: string | null
          rate: number
          rate_date: string
          source?: string | null
        }
        Update: {
          created_at?: string
          entered_by?: string | null
          gym_id?: string
          id?: string
          notes?: string | null
          rate?: number
          rate_date?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      external_coaches: {
        Row: {
          belt_rank: Database["public"]["Enums"]["belt_rank_enum"] | null
          created_at: string
          deleted_at: string | null
          email: string | null
          first_name_ar: string | null
          first_name_en: string | null
          first_name_fr: string | null
          gym_id: string
          hourly_rate_usd: number | null
          id: string
          insurance_verified: boolean
          is_active: boolean
          last_name_ar: string | null
          last_name_en: string | null
          last_name_fr: string | null
          phone: string
          profile_id: string | null
          specialization_ar: string | null
          specialization_en: string | null
          specialization_fr: string | null
          updated_at: string
          waiver_signed: boolean
          waiver_signed_at: string | null
        }
        Insert: {
          belt_rank?: Database["public"]["Enums"]["belt_rank_enum"] | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name_ar?: string | null
          first_name_en?: string | null
          first_name_fr?: string | null
          gym_id: string
          hourly_rate_usd?: number | null
          id?: string
          insurance_verified?: boolean
          is_active?: boolean
          last_name_ar?: string | null
          last_name_en?: string | null
          last_name_fr?: string | null
          phone: string
          profile_id?: string | null
          specialization_ar?: string | null
          specialization_en?: string | null
          specialization_fr?: string | null
          updated_at?: string
          waiver_signed?: boolean
          waiver_signed_at?: string | null
        }
        Update: {
          belt_rank?: Database["public"]["Enums"]["belt_rank_enum"] | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          first_name_ar?: string | null
          first_name_en?: string | null
          first_name_fr?: string | null
          gym_id?: string
          hourly_rate_usd?: number | null
          id?: string
          insurance_verified?: boolean
          is_active?: boolean
          last_name_ar?: string | null
          last_name_en?: string | null
          last_name_fr?: string | null
          phone?: string
          profile_id?: string | null
          specialization_ar?: string | null
          specialization_en?: string | null
          specialization_fr?: string | null
          updated_at?: string
          waiver_signed?: boolean
          waiver_signed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_coaches_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_coaches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_students: {
        Row: {
          created_at: string
          guardian_id: string
          id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          guardian_id: string
          id?: string
          student_id: string
        }
        Update: {
          created_at?: string
          guardian_id?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_students_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          can_pickup: boolean
          created_at: string
          deleted_at: string | null
          gym_id: string
          id: string
          is_primary_contact: boolean
          profile_id: string
          relationship_ar: string | null
          relationship_en: string | null
          relationship_fr: string | null
          updated_at: string
        }
        Insert: {
          can_pickup?: boolean
          created_at?: string
          deleted_at?: string | null
          gym_id: string
          id?: string
          is_primary_contact?: boolean
          profile_id: string
          relationship_ar?: string | null
          relationship_en?: string | null
          relationship_fr?: string | null
          updated_at?: string
        }
        Update: {
          can_pickup?: boolean
          created_at?: string
          deleted_at?: string | null
          gym_id?: string
          id?: string
          is_primary_contact?: boolean
          profile_id?: string
          relationship_ar?: string | null
          relationship_en?: string | null
          relationship_fr?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_domains: {
        Row: {
          created_at: string
          domain: string
          gym_id: string
          id: string
          is_primary: boolean
        }
        Insert: {
          created_at?: string
          domain: string
          gym_id: string
          id?: string
          is_primary?: boolean
        }
        Update: {
          created_at?: string
          domain?: string
          gym_id?: string
          id?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gym_domains_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_landing_images: {
        Row: {
          caption_ar: string | null
          caption_en: string | null
          caption_fr: string | null
          created_at: string
          gym_id: string
          id: string
          image_url: string
          is_active: boolean
          section: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          caption_ar?: string | null
          caption_en?: string | null
          caption_fr?: string | null
          created_at?: string
          gym_id: string
          id?: string
          image_url: string
          is_active?: boolean
          section: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          caption_ar?: string | null
          caption_en?: string | null
          caption_fr?: string | null
          created_at?: string
          gym_id?: string
          id?: string
          image_url?: string
          is_active?: boolean
          section?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_landing_images_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_whatsapp_config: {
        Row: {
          access_token: string | null
          created_at: string
          default_country_code: string
          gym_id: string
          phone_number_id: string | null
          status: string
          updated_at: string
          waba_id: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          default_country_code?: string
          gym_id: string
          phone_number_id?: string | null
          status?: string
          updated_at?: string
          waba_id?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string
          default_country_code?: string
          gym_id?: string
          phone_number_id?: string | null
          status?: string
          updated_at?: string
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gym_whatsapp_config_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gyms: {
        Row: {
          address_ar: string | null
          address_en: string | null
          address_fr: string | null
          auto_dunning_enabled: boolean
          brand_color: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          country: string | null
          created_at: string
          currency_preference: string
          deleted_at: string | null
          dunning_grace_days: number
          email: string | null
          enabled_products: Json
          facebook_handle: string | null
          freeze_max_days_year: number
          freeze_min_chunk_days: number
          hero_image_url: string | null
          id: string
          instagram_followers: number | null
          instagram_handle: string | null
          is_active: boolean
          logo_url: string | null
          map_lat: number | null
          map_lng: number | null
          name_ar: string
          name_en: string
          name_fr: string
          office_hours: Json | null
          phone: string | null
          pt_booking_horizon_days: number
          pt_buffer_minutes: number
          pt_late_cancel_window_hours: number
          pt_min_notice_hours: number
          pt_no_show_forfeits: boolean
          pt_refill_days_threshold: number
          pt_refill_sessions_threshold: number
          pt_slot_minutes: number
          renewal_lead_days: number
          slug: string
          tagline_ar: string | null
          tagline_en: string | null
          tagline_fr: string | null
          tax_rate: number
          tiktok_handle: string | null
          timezone: string | null
          tva_registration_number: string | null
          updated_at: string
          website: string | null
          youtube_handle: string | null
        }
        Insert: {
          address_ar?: string | null
          address_en?: string | null
          address_fr?: string | null
          auto_dunning_enabled?: boolean
          brand_color?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          country?: string | null
          created_at?: string
          currency_preference?: string
          deleted_at?: string | null
          dunning_grace_days?: number
          email?: string | null
          enabled_products?: Json
          facebook_handle?: string | null
          freeze_max_days_year?: number
          freeze_min_chunk_days?: number
          hero_image_url?: string | null
          id?: string
          instagram_followers?: number | null
          instagram_handle?: string | null
          is_active?: boolean
          logo_url?: string | null
          map_lat?: number | null
          map_lng?: number | null
          name_ar: string
          name_en: string
          name_fr: string
          office_hours?: Json | null
          phone?: string | null
          pt_booking_horizon_days?: number
          pt_buffer_minutes?: number
          pt_late_cancel_window_hours?: number
          pt_min_notice_hours?: number
          pt_no_show_forfeits?: boolean
          pt_refill_days_threshold?: number
          pt_refill_sessions_threshold?: number
          pt_slot_minutes?: number
          renewal_lead_days?: number
          slug: string
          tagline_ar?: string | null
          tagline_en?: string | null
          tagline_fr?: string | null
          tax_rate?: number
          tiktok_handle?: string | null
          timezone?: string | null
          tva_registration_number?: string | null
          updated_at?: string
          website?: string | null
          youtube_handle?: string | null
        }
        Update: {
          address_ar?: string | null
          address_en?: string | null
          address_fr?: string | null
          auto_dunning_enabled?: boolean
          brand_color?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          country?: string | null
          created_at?: string
          currency_preference?: string
          deleted_at?: string | null
          dunning_grace_days?: number
          email?: string | null
          enabled_products?: Json
          facebook_handle?: string | null
          freeze_max_days_year?: number
          freeze_min_chunk_days?: number
          hero_image_url?: string | null
          id?: string
          instagram_followers?: number | null
          instagram_handle?: string | null
          is_active?: boolean
          logo_url?: string | null
          map_lat?: number | null
          map_lng?: number | null
          name_ar?: string
          name_en?: string
          name_fr?: string
          office_hours?: Json | null
          phone?: string | null
          pt_booking_horizon_days?: number
          pt_buffer_minutes?: number
          pt_late_cancel_window_hours?: number
          pt_min_notice_hours?: number
          pt_no_show_forfeits?: boolean
          pt_refill_days_threshold?: number
          pt_refill_sessions_threshold?: number
          pt_slot_minutes?: number
          renewal_lead_days?: number
          slug?: string
          tagline_ar?: string | null
          tagline_en?: string | null
          tagline_fr?: string | null
          tax_rate?: number
          tiktok_handle?: string | null
          timezone?: string | null
          tva_registration_number?: string | null
          updated_at?: string
          website?: string | null
          youtube_handle?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_lbp: number
          amount_usd: number
          created_at: string
          deleted_at: string | null
          due_date: string
          exchange_rate: number | null
          gym_id: string
          id: string
          invoice_number: string
          invoice_type: Database["public"]["Enums"]["invoice_type_enum"]
          membership_id: string | null
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          paid_at: string | null
          payer_profile_id: string | null
          rate_date: string | null
          rate_source: string | null
          status: Database["public"]["Enums"]["payment_status_enum"]
          student_id: string
          tax_amount_usd: number | null
          tax_rate: number | null
          total_lbp: number | null
          total_usd: number
          updated_at: string
        }
        Insert: {
          amount_lbp?: number
          amount_usd?: number
          created_at?: string
          deleted_at?: string | null
          due_date: string
          exchange_rate?: number | null
          gym_id: string
          id?: string
          invoice_number: string
          invoice_type: Database["public"]["Enums"]["invoice_type_enum"]
          membership_id?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          paid_at?: string | null
          payer_profile_id?: string | null
          rate_date?: string | null
          rate_source?: string | null
          status?: Database["public"]["Enums"]["payment_status_enum"]
          student_id: string
          tax_amount_usd?: number | null
          tax_rate?: number | null
          total_lbp?: number | null
          total_usd: number
          updated_at?: string
        }
        Update: {
          amount_lbp?: number
          amount_usd?: number
          created_at?: string
          deleted_at?: string | null
          due_date?: string
          exchange_rate?: number | null
          gym_id?: string
          id?: string
          invoice_number?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type_enum"]
          membership_id?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          paid_at?: string | null
          payer_profile_id?: string | null
          rate_date?: string | null
          rate_source?: string | null
          status?: Database["public"]["Enums"]["payment_status_enum"]
          student_id?: string
          tax_amount_usd?: number | null
          tax_rate?: number | null
          total_lbp?: number | null
          total_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "student_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payer_profile_id_fkey"
            columns: ["payer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          campaign_id: string | null
          client_uuid: string | null
          converted_at: string | null
          converted_student_id: string | null
          created_at: string
          email: string | null
          first_name: string | null
          gym_id: string
          id: string
          interest_categories: string[] | null
          interested_discipline_id: string | null
          last_name: string | null
          notes: string | null
          phone: string | null
          source: string
          source_detail: string | null
          status: Database["public"]["Enums"]["lead_status_enum"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          campaign_id?: string | null
          client_uuid?: string | null
          converted_at?: string | null
          converted_student_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          gym_id: string
          id?: string
          interest_categories?: string[] | null
          interested_discipline_id?: string | null
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          source?: string
          source_detail?: string | null
          status?: Database["public"]["Enums"]["lead_status_enum"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          campaign_id?: string | null
          client_uuid?: string | null
          converted_at?: string | null
          converted_student_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          gym_id?: string
          id?: string
          interest_categories?: string[] | null
          interested_discipline_id?: string | null
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          source?: string
          source_detail?: string | null
          status?: Database["public"]["Enums"]["lead_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_student_id_fkey"
            columns: ["converted_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_interested_discipline_id_fkey"
            columns: ["interested_discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
        ]
      }
      member_followups: {
        Row: {
          created_at: string
          created_by: string | null
          gym_id: string
          id: string
          kind: string
          next_action_date: string | null
          note: string | null
          outcome: Database["public"]["Enums"]["member_followup_outcome_enum"]
          student_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gym_id: string
          id?: string
          kind?: string
          next_action_date?: string | null
          note?: string | null
          outcome: Database["public"]["Enums"]["member_followup_outcome_enum"]
          student_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gym_id?: string
          id?: string
          kind?: string
          next_action_date?: string | null
          note?: string | null
          outcome?: Database["public"]["Enums"]["member_followup_outcome_enum"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_followups_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_followups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      member_requests: {
        Row: {
          created_at: string
          decline_reason: string | null
          gym_id: string
          id: string
          kind: Database["public"]["Enums"]["member_request_kind"]
          note: string | null
          payload: Json
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["member_request_status"]
          student_id: string
        }
        Insert: {
          created_at?: string
          decline_reason?: string | null
          gym_id: string
          id?: string
          kind: Database["public"]["Enums"]["member_request_kind"]
          note?: string | null
          payload?: Json
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["member_request_status"]
          student_id: string
        }
        Update: {
          created_at?: string
          decline_reason?: string | null
          gym_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["member_request_kind"]
          note?: string | null
          payload?: Json
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["member_request_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_requests_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_freezes: {
        Row: {
          actual_end_date: string | null
          created_at: string
          created_by: string | null
          days_frozen: number
          id: string
          membership_id: string
          planned_end_date: string
          start_date: string
        }
        Insert: {
          actual_end_date?: string | null
          created_at?: string
          created_by?: string | null
          days_frozen: number
          id?: string
          membership_id: string
          planned_end_date: string
          start_date: string
        }
        Update: {
          actual_end_date?: string | null
          created_at?: string
          created_by?: string | null
          days_frozen?: number
          id?: string
          membership_id?: string
          planned_end_date?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_freezes_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "student_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          created_at: string
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          description_fr: string | null
          duration_days: number
          gym_id: string
          id: string
          includes_pt: boolean
          is_active: boolean
          max_classes_per_week: number | null
          name_ar: string
          name_en: string
          name_fr: string
          price_lbp: number | null
          price_usd: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          duration_days: number
          gym_id: string
          id?: string
          includes_pt?: boolean
          is_active?: boolean
          max_classes_per_week?: number | null
          name_ar: string
          name_en: string
          name_fr: string
          price_lbp?: number | null
          price_usd: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          duration_days?: number
          gym_id?: string
          id?: string
          includes_pt?: boolean
          is_active?: boolean
          max_classes_per_week?: number | null
          name_ar?: string
          name_en?: string
          name_fr?: string
          price_lbp?: number | null
          price_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_plans_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      message_logs: {
        Row: {
          channel: Database["public"]["Enums"]["message_channel_enum"]
          created_at: string
          delivered_at: string | null
          error_message: string | null
          gym_id: string
          id: string
          locale: string | null
          message_content: string
          provider_message_id: string | null
          recipient_id: string | null
          recipient_phone: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["message_status_enum"]
          template_name: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["message_channel_enum"]
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          gym_id: string
          id?: string
          locale?: string | null
          message_content: string
          provider_message_id?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status_enum"]
          template_name?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["message_channel_enum"]
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          gym_id?: string
          id?: string
          locale?: string | null
          message_content?: string
          provider_message_id?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status_enum"]
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body_ar: string | null
          body_en: string | null
          body_fr: string | null
          body_key: string | null
          created_at: string
          dedup_key: string | null
          entity_id: string | null
          entity_type: string | null
          gym_id: string | null
          id: string
          is_read: boolean
          params: Json
          read_at: string | null
          title_ar: string | null
          title_en: string | null
          title_fr: string | null
          title_key: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body_ar?: string | null
          body_en?: string | null
          body_fr?: string | null
          body_key?: string | null
          created_at?: string
          dedup_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          gym_id?: string | null
          id?: string
          is_read?: boolean
          params?: Json
          read_at?: string | null
          title_ar?: string | null
          title_en?: string | null
          title_fr?: string | null
          title_key?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          body_ar?: string | null
          body_en?: string | null
          body_fr?: string | null
          body_key?: string | null
          created_at?: string
          dedup_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          gym_id?: string | null
          id?: string
          is_read?: boolean
          params?: Json
          read_at?: string | null
          title_ar?: string | null
          title_en?: string | null
          title_fr?: string | null
          title_key?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_messages: {
        Row: {
          body: string
          created_at: string
          dedup_key: string | null
          error: string | null
          gym_id: string
          id: string
          status: string
          template: string
          to_phone: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          dedup_key?: string | null
          error?: string | null
          gym_id: string
          id?: string
          status?: string
          template: string
          to_phone: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          dedup_key?: string | null
          error?: string | null
          gym_id?: string
          id?: string
          status?: string
          template?: string
          to_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_messages_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_lbp: number
          amount_usd: number
          client_uuid: string | null
          created_at: string
          exchange_rate: number | null
          id: string
          invoice_id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method_enum"]
          rate_date: string | null
          received_by: string | null
          reference_number: string | null
          student_id: string
        }
        Insert: {
          amount_lbp?: number
          amount_usd?: number
          client_uuid?: string | null
          created_at?: string
          exchange_rate?: number | null
          id?: string
          invoice_id: string
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          payment_date?: string
          payment_method: Database["public"]["Enums"]["payment_method_enum"]
          rate_date?: string | null
          received_by?: string | null
          reference_number?: string | null
          student_id: string
        }
        Update: {
          amount_lbp?: number
          amount_usd?: number
          client_uuid?: string | null
          created_at?: string
          exchange_rate?: number | null
          id?: string
          invoice_id?: string
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method_enum"]
          rate_date?: string | null
          received_by?: string | null
          reference_number?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_leads: {
        Row: {
          activity_type: string | null
          business_name: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          message: string | null
          name: string
          phone: string
          source: string
          status: string
        }
        Insert: {
          activity_type?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name: string
          phone: string
          source?: string
          status?: string
        }
        Update: {
          activity_type?: string | null
          business_name?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string
          phone?: string
          source?: string
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          contact_email: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          first_name_ar: string | null
          first_name_en: string | null
          first_name_fr: string | null
          gender: Database["public"]["Enums"]["gender_enum"] | null
          gym_id: string
          id: string
          is_active: boolean
          last_login_at: string | null
          last_name_ar: string | null
          last_name_en: string | null
          last_name_fr: string | null
          locale: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          contact_email?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          first_name_ar?: string | null
          first_name_en?: string | null
          first_name_fr?: string | null
          gender?: Database["public"]["Enums"]["gender_enum"] | null
          gym_id: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          last_name_ar?: string | null
          last_name_en?: string | null
          last_name_fr?: string | null
          locale?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          contact_email?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          first_name_ar?: string | null
          first_name_en?: string | null
          first_name_fr?: string | null
          gender?: Database["public"]["Enums"]["gender_enum"] | null
          gym_id?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          last_name_ar?: string | null
          last_name_en?: string | null
          last_name_fr?: string | null
          locale?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      pt_assignments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          coach_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          invoice_id: string | null
          is_active: boolean
          package_id: string
          purchased_at: string
          rejected_reason: string | null
          requested_at: string | null
          sessions_remaining: number | null
          sessions_total: number
          sessions_used: number
          status: Database["public"]["Enums"]["pt_assignment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          coach_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invoice_id?: string | null
          is_active?: boolean
          package_id: string
          purchased_at?: string
          rejected_reason?: string | null
          requested_at?: string | null
          sessions_remaining?: number | null
          sessions_total: number
          sessions_used?: number
          status?: Database["public"]["Enums"]["pt_assignment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          coach_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invoice_id?: string | null
          is_active?: boolean
          package_id?: string
          purchased_at?: string
          rejected_reason?: string | null
          requested_at?: string | null
          sessions_remaining?: number | null
          sessions_total?: number
          sessions_used?: number
          status?: Database["public"]["Enums"]["pt_assignment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pt_assignments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_assignments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_assignments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "pt_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      pt_packages: {
        Row: {
          coach_id: string | null
          created_at: string
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          description_fr: string | null
          discipline_id: string | null
          gym_id: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          name_fr: string
          price_lbp: number | null
          price_usd: number
          session_count: number
          show_on_landing: boolean
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          discipline_id?: string | null
          gym_id: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          name_fr: string
          price_lbp?: number | null
          price_usd: number
          session_count: number
          show_on_landing?: boolean
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          coach_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          discipline_id?: string | null
          gym_id?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          name_fr?: string
          price_lbp?: number | null
          price_usd?: number
          session_count?: number
          show_on_landing?: boolean
          updated_at?: string
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pt_packages_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_packages_discipline_id_fkey"
            columns: ["discipline_id"]
            isOneToOne: false
            referencedRelation: "disciplines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_packages_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      pt_sessions: {
        Row: {
          assignment_id: string | null
          coach_id: string
          created_at: string
          duration_minutes: number
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          package_id: string | null
          proposed_by: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["pt_session_status_enum"]
          student_id: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          coach_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          package_id?: string | null
          proposed_by?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["pt_session_status_enum"]
          student_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          coach_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          package_id?: string | null
          proposed_by?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["pt_session_status_enum"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pt_sessions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "pt_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_sessions_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_sessions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "pt_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_sessions_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_invoices: {
        Row: {
          created_at: string
          invoice_id: string
          period_end: string
          period_start: string
          product_id: string
          product_type: string
        }
        Insert: {
          created_at?: string
          invoice_id: string
          period_end: string
          period_start: string
          product_id: string
          product_type: string
        }
        Update: {
          created_at?: string
          invoice_id?: string
          period_end?: string
          period_start?: string
          product_id?: string
          product_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_invoices_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_bookings: {
        Row: {
          created_at: string
          end_time: string
          external_coach_id: string
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          rental_id: string
          start_time: string
          status: Database["public"]["Enums"]["booking_status_enum"]
          total_amount_lbp: number | null
          total_amount_usd: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time: string
          external_coach_id: string
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          rental_id: string
          start_time: string
          status?: Database["public"]["Enums"]["booking_status_enum"]
          total_amount_lbp?: number | null
          total_amount_usd: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string
          external_coach_id?: string
          id?: string
          notes_ar?: string | null
          notes_en?: string | null
          notes_fr?: string | null
          rental_id?: string
          start_time?: string
          status?: Database["public"]["Enums"]["booking_status_enum"]
          total_amount_lbp?: number | null
          total_amount_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_bookings_external_coach_id_fkey"
            columns: ["external_coach_id"]
            isOneToOne: false
            referencedRelation: "external_coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rentals: {
        Row: {
          created_at: string
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          description_fr: string | null
          gym_id: string
          hourly_rate_lbp: number | null
          hourly_rate_usd: number
          id: string
          max_capacity: number | null
          name_ar: string
          name_en: string
          name_fr: string
          status: Database["public"]["Enums"]["rental_status_enum"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          gym_id: string
          hourly_rate_lbp?: number | null
          hourly_rate_usd: number
          id?: string
          max_capacity?: number | null
          name_ar: string
          name_en: string
          name_fr: string
          status?: Database["public"]["Enums"]["rental_status_enum"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          description_fr?: string | null
          gym_id?: string
          hourly_rate_lbp?: number | null
          hourly_rate_usd?: number
          id?: string
          max_capacity?: number | null
          name_ar?: string
          name_en?: string
          name_fr?: string
          status?: Database["public"]["Enums"]["rental_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rentals_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      student_memberships: {
        Row: {
          auto_renew: boolean
          cancelled_at: string | null
          created_at: string
          end_date: string
          id: string
          lapsed_at: string | null
          pause_end_date: string | null
          pause_start_date: string | null
          pending_plan_id: string | null
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["membership_status_enum"]
          student_id: string
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          end_date: string
          id?: string
          lapsed_at?: string | null
          pause_end_date?: string | null
          pause_start_date?: string | null
          pending_plan_id?: string | null
          plan_id: string
          start_date: string
          status?: Database["public"]["Enums"]["membership_status_enum"]
          student_id: string
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          end_date?: string
          id?: string
          lapsed_at?: string | null
          pause_end_date?: string | null
          pause_start_date?: string | null
          pending_plan_id?: string | null
          plan_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["membership_status_enum"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_memberships_pending_plan_id_fkey"
            columns: ["pending_plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_memberships_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          belt_promotion_date: string | null
          created_at: string
          current_belt_rank:
            | Database["public"]["Enums"]["belt_rank_enum"]
            | null
          deleted_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gym_id: string
          id: string
          is_active: boolean
          join_date: string
          medical_notes: string | null
          portal_login_override: boolean | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          belt_promotion_date?: string | null
          created_at?: string
          current_belt_rank?:
            | Database["public"]["Enums"]["belt_rank_enum"]
            | null
          deleted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gym_id: string
          id?: string
          is_active?: boolean
          join_date?: string
          medical_notes?: string | null
          portal_login_override?: boolean | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          belt_promotion_date?: string | null
          created_at?: string
          current_belt_rank?:
            | Database["public"]["Enums"]["belt_rank_enum"]
            | null
          deleted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gym_id?: string
          id?: string
          is_active?: boolean
          join_date?: string
          medical_notes?: string | null
          portal_login_override?: boolean | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_classes: {
        Row: {
          assigned_coach_id: string | null
          class_id: string | null
          created_at: string
          feedback: string | null
          id: string
          interested: boolean | null
          lead_id: string
          scheduled_date: string
          scheduled_time: string | null
          show_up: boolean | null
          status: Database["public"]["Enums"]["trial_status_enum"]
          updated_at: string
        }
        Insert: {
          assigned_coach_id?: string | null
          class_id?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          interested?: boolean | null
          lead_id: string
          scheduled_date: string
          scheduled_time?: string | null
          show_up?: boolean | null
          status?: Database["public"]["Enums"]["trial_status_enum"]
          updated_at?: string
        }
        Update: {
          assigned_coach_id?: string | null
          class_id?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          interested?: boolean | null
          lead_id?: string
          scheduled_date?: string
          scheduled_time?: string | null
          show_up?: boolean | null
          status?: Database["public"]["Enums"]["trial_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_classes_assigned_coach_id_fkey"
            columns: ["assigned_coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_classes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_classes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          is_active: boolean
          is_primary: boolean
          role: Database["public"]["Enums"]["user_role_enum"]
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          role: Database["public"]["Enums"]["user_role_enum"]
          user_id: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          role?: Database["public"]["Enums"]["user_role_enum"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_signatures: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          signature: string
          signed_at: string
          signed_by_profile_id: string
          student_id: string
          template_id: string
          template_version: number
          typed_name: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          signature: string
          signed_at?: string
          signed_by_profile_id: string
          student_id: string
          template_id: string
          template_version: number
          typed_name?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          signature?: string
          signed_at?: string
          signed_by_profile_id?: string
          student_id?: string
          template_id?: string
          template_version?: number
          typed_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waiver_signatures_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_signed_by_profile_id_fkey"
            columns: ["signed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_signatures_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "waiver_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_templates: {
        Row: {
          body_ar: string
          body_en: string
          body_fr: string
          created_at: string
          gym_id: string
          id: string
          is_active: boolean
          title_ar: string
          title_en: string
          title_fr: string
          updated_at: string
          version: number
        }
        Insert: {
          body_ar?: string
          body_en?: string
          body_fr?: string
          created_at?: string
          gym_id: string
          id?: string
          is_active?: boolean
          title_ar?: string
          title_en?: string
          title_fr?: string
          updated_at?: string
          version?: number
        }
        Update: {
          body_ar?: string
          body_en?: string
          body_fr?: string
          created_at?: string
          gym_id?: string
          id?: string
          is_active?: boolean
          title_ar?: string
          title_en?: string
          title_fr?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "waiver_templates_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _activate_class_registration: {
        Args: {
          p_discount_amount_usd: number
          p_discount_pct: number
          p_notify_type: string
          p_reg_id: string
        }
        Returns: undefined
      }
      _apply_profile_change: {
        Args: { p_payload: Json; p_student_id: string }
        Returns: undefined
      }
      _invoice_month_label: {
        Args: { d: string; lang: string }
        Returns: string
      }
      _issue_membership_renewal: {
        Args: { p_membership_id: string }
        Returns: string
      }
      _issue_registration_renewal: {
        Args: { p_reg_id: string }
        Returns: string
      }
      _notify_class_student: {
        Args: {
          p_gym_id: string
          p_params: Json
          p_reg_id: string
          p_student_id: string
          p_type: string
        }
        Returns: undefined
      }
      _notify_student_billing: {
        Args: {
          p_entity_id: string
          p_gym_id: string
          p_params: Json
          p_student_id: string
          p_type: string
        }
        Returns: undefined
      }
      _primary_guardian_profile: {
        Args: { p_student_id: string }
        Returns: string
      }
      _promote_next_waitlisted: {
        Args: { p_class_id: string }
        Returns: string
      }
      _recompact_waitlist: { Args: { p_class_id: string }; Returns: undefined }
      _system_issue_invoice: {
        Args: {
          p_amount_lbp?: number
          p_amount_usd: number
          p_due_date?: string
          p_exchange_rate?: number
          p_gym_id: string
          p_invoice_type: Database["public"]["Enums"]["invoice_type_enum"]
          p_membership_id?: string
          p_notes_ar?: string
          p_notes_en?: string
          p_notes_fr?: string
          p_payer_profile_id?: string
          p_rate_date?: string
          p_student_id: string
        }
        Returns: {
          amount_lbp: number
          amount_usd: number
          created_at: string
          deleted_at: string | null
          due_date: string
          exchange_rate: number | null
          gym_id: string
          id: string
          invoice_number: string
          invoice_type: Database["public"]["Enums"]["invoice_type_enum"]
          membership_id: string | null
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          paid_at: string | null
          payer_profile_id: string | null
          rate_date: string | null
          rate_source: string | null
          status: Database["public"]["Enums"]["payment_status_enum"]
          student_id: string
          tax_amount_usd: number | null
          tax_rate: number | null
          total_lbp: number | null
          total_usd: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_class_registration: {
        Args: {
          p_billing_anchor?: string
          p_discount_amount_usd?: number
          p_discount_pct?: number
          p_prorate?: boolean
          p_reg_id: string
          p_start_date?: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          class_id: string
          created_at: string
          discount_amount_usd: number | null
          discount_pct: number | null
          end_date: string | null
          gym_id: string
          id: string
          invoice_id: string | null
          monthly_fee_lbp: number | null
          monthly_fee_usd: number | null
          paid_until: string | null
          rejected_reason: string | null
          requested_at: string
          start_date: string | null
          status: Database["public"]["Enums"]["class_registration_status_enum"]
          student_id: string
          suspended_at: string | null
          updated_at: string
          waitlist_position: number | null
        }
        SetofOptions: {
          from: "*"
          to: "class_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_member_request: {
        Args: { p_request_id: string }
        Returns: {
          created_at: string
          decline_reason: string | null
          gym_id: string
          id: string
          kind: Database["public"]["Enums"]["member_request_kind"]
          note: string | null
          payload: Json
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["member_request_status"]
          student_id: string
        }
        SetofOptions: {
          from: "*"
          to: "member_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attach_student_to_profile: {
        Args: { p_profile_id: string }
        Returns: {
          belt_promotion_date: string | null
          created_at: string
          current_belt_rank:
            | Database["public"]["Enums"]["belt_rank_enum"]
            | null
          deleted_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gym_id: string
          id: string
          is_active: boolean
          join_date: string
          medical_notes: string | null
          portal_login_override: boolean | null
          profile_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      book_pt_session: {
        Args: {
          p_assignment_id: string
          p_duration?: number
          p_override?: boolean
          p_propose?: boolean
          p_scheduled_at: string
        }
        Returns: {
          assignment_id: string | null
          coach_id: string
          created_at: string
          duration_minutes: number
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          package_id: string | null
          proposed_by: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["pt_session_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_class_registration: {
        Args: { p_reg_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          class_id: string
          created_at: string
          discount_amount_usd: number | null
          discount_pct: number | null
          end_date: string | null
          gym_id: string
          id: string
          invoice_id: string | null
          monthly_fee_lbp: number | null
          monthly_fee_usd: number | null
          paid_until: string | null
          rejected_reason: string | null
          requested_at: string
          start_date: string | null
          status: Database["public"]["Enums"]["class_registration_status_enum"]
          student_id: string
          suspended_at: string | null
          updated_at: string
          waitlist_position: number | null
        }
        SetofOptions: {
          from: "*"
          to: "class_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_or_no_show_pt_session: {
        Args: { p_outcome: string; p_session_id: string }
        Returns: {
          assignment_id: string | null
          coach_id: string
          created_at: string
          duration_minutes: number
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          package_id: string | null
          proposed_by: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["pt_session_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_pt_booking: {
        Args: { p_session_id: string }
        Returns: {
          assignment_id: string | null
          coach_id: string
          created_at: string
          duration_minutes: number
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          package_id: string | null
          proposed_by: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["pt_session_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_membership_plan: {
        Args: { p_membership_id: string; p_plan_id: string }
        Returns: {
          auto_renew: boolean
          cancelled_at: string | null
          created_at: string
          end_date: string
          id: string
          lapsed_at: string | null
          pause_end_date: string | null
          pause_start_date: string | null
          pending_plan_id: string | null
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["membership_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "student_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_pt_session: {
        Args: { p_session_id: string }
        Returns: {
          assignment_id: string | null
          coach_id: string
          created_at: string
          duration_minutes: number
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          package_id: string | null
          proposed_by: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["pt_session_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      convert_lead_to_member: {
        Args: { p_lead_id: string; p_plan_id: string }
        Returns: {
          invoice_id: string
          invoice_number: string
          membership_id: string
          profile_id: string
          student_id: string
          total_usd: number
        }[]
      }
      create_student: {
        Args: {
          p_current_belt_rank: Database["public"]["Enums"]["belt_rank_enum"]
          p_date_of_birth: string
          p_emergency_contact_name: string
          p_emergency_contact_phone: string
          p_first_name_ar: string
          p_first_name_en: string
          p_first_name_fr: string
          p_gender: Database["public"]["Enums"]["gender_enum"]
          p_join_date: string
          p_last_name_ar: string
          p_last_name_en: string
          p_last_name_fr: string
          p_medical_notes: string
          p_phone: string
        }
        Returns: {
          belt_promotion_date: string | null
          created_at: string
          current_belt_rank:
            | Database["public"]["Enums"]["belt_rank_enum"]
            | null
          deleted_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gym_id: string
          id: string
          is_active: boolean
          join_date: string
          medical_notes: string | null
          portal_login_override: boolean | null
          profile_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      credentialed_phone_owner: {
        Args: { p_exclude: string; p_phone: string }
        Returns: string
      }
      decline_member_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: {
          created_at: string
          decline_reason: string | null
          gym_id: string
          id: string
          kind: Database["public"]["Enums"]["member_request_kind"]
          note: string | null
          payload: Json
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["member_request_status"]
          student_id: string
        }
        SetofOptions: {
          from: "*"
          to: "member_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      discard_offline_lead: {
        Args: { p_name: string; p_op_id: string; p_reason: string }
        Returns: undefined
      }
      discard_offline_payment: {
        Args: {
          p_amount_usd: number
          p_invoice_id: string
          p_op_id: string
          p_reason: string
        }
        Returns: undefined
      }
      due_dunning_reminders: {
        Args: { p_gym_id: string }
        Returns: {
          amount_usd: number
          dedup_key: string
          due_date: string
          invoice_id: string
          member_locale: string
          member_name: string
          nudge: string
          product_type: string
          to_phone: string
        }[]
      }
      extend_pt_package: {
        Args: { p_assignment_id: string; p_days?: number }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          coach_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          invoice_id: string | null
          is_active: boolean
          package_id: string
          purchased_at: string
          rejected_reason: string | null
          requested_at: string | null
          sessions_remaining: number | null
          sessions_total: number
          sessions_used: number
          status: Database["public"]["Enums"]["pt_assignment_status"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      find_profile_by_phone: {
        Args: { p_phone: string }
        Returns: {
          first_name_ar: string
          first_name_en: string
          first_name_fr: string
          id: string
          last_name_ar: string
          last_name_en: string
          last_name_fr: string
          phone: string
        }[]
      }
      freeze_membership: {
        Args: { p_days: number; p_membership_id: string }
        Returns: {
          auto_renew: boolean
          cancelled_at: string | null
          created_at: string
          end_date: string
          id: string
          lapsed_at: string | null
          pause_end_date: string | null
          pause_start_date: string | null
          pending_plan_id: string | null
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["membership_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "student_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_active_assignment: {
        Args: { p_package_id: string; p_student_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          coach_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          invoice_id: string | null
          is_active: boolean
          package_id: string
          purchased_at: string
          rejected_reason: string | null
          requested_at: string | null
          sessions_remaining: number | null
          sessions_total: number
          sessions_used: number
          status: Database["public"]["Enums"]["pt_assignment_status"]
          student_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pt_assignments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_all_gyms_for_admin: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          member_count: number
          name_en: string
          slug: string
        }[]
      }
      get_camp_spots_left: { Args: { p_camp_id: string }; Returns: number }
      get_coach_pt_roster: {
        Args: never
        Returns: {
          assignment_id: string
          package_name_ar: string
          package_name_en: string
          package_name_fr: string
          sessions_remaining: number
          sessions_total: number
          student_name: string
        }[]
      }
      get_coach_pt_sessions: {
        Args: never
        Returns: {
          assignment_id: string
          package_name_ar: string
          package_name_en: string
          package_name_fr: string
          scheduled_at: string
          session_id: string
          sessions_remaining: number
          sessions_total: number
          status: Database["public"]["Enums"]["pt_session_status_enum"]
          student_name: string
        }[]
      }
      get_coach_trials: {
        Args: never
        Returns: {
          feedback: string
          id: string
          lead_id: string
          lead_name: string
          lead_phone: string
          scheduled_date: string
          scheduled_time: string
          show_up: boolean
          status: Database["public"]["Enums"]["trial_status_enum"]
        }[]
      }
      get_gym_coaches: {
        Args: never
        Returns: {
          first_name_ar: string
          first_name_en: string
          first_name_fr: string
          id: string
        }[]
      }
      get_gym_primary_domain: { Args: { p_slug: string }; Returns: string }
      get_gym_slug_by_domain: { Args: { p_domain: string }; Returns: string }
      get_landing_camps: {
        Args: { p_gym_id: string }
        Returns: {
          end_date: string
          id: string
          max_age: number
          min_age: number
          name_ar: string
          name_en: string
          name_fr: string
          price_usd: number
          start_date: string
          status: string
        }[]
      }
      get_landing_class_fees: {
        Args: { p_gym_id: string }
        Returns: {
          id: string
          monthly_fee_lbp: number
          monthly_fee_usd: number
          name_ar: string
          name_en: string
          name_fr: string
        }[]
      }
      get_landing_coaches: {
        Args: { p_gym_id: string }
        Returns: {
          avatar_url: string
          bio_ar: string
          bio_en: string
          bio_fr: string
          first_name_ar: string
          first_name_en: string
          first_name_fr: string
          id: string
          landing_status: string
          last_name_ar: string
          last_name_en: string
          last_name_fr: string
          specialization_ar: string
          specialization_en: string
          specialization_fr: string
          updated_at: string
        }[]
      }
      get_landing_disciplines: {
        Args: { p_gym_id: string }
        Returns: {
          icon_url: string
          id: string
          name_ar: string
          name_en: string
          name_fr: string
          sort_order: number
        }[]
      }
      get_landing_images: {
        Args: { p_gym_id: string; p_section: string }
        Returns: {
          caption_ar: string
          caption_en: string
          caption_fr: string
          id: string
          image_url: string
          sort_order: number
        }[]
      }
      get_landing_plans: {
        Args: { p_gym_id: string }
        Returns: {
          duration_days: number
          includes_pt: boolean
          name_ar: string
          name_en: string
          name_fr: string
          price_lbp: number
          price_usd: number
        }[]
      }
      get_landing_pt: {
        Args: { p_gym_id: string }
        Returns: {
          id: string
          name_ar: string
          name_en: string
          name_fr: string
          price_usd: number
          session_count: number
          validity_days: number
        }[]
      }
      get_landing_schedule: {
        Args: { p_gym_id: string }
        Returns: {
          class_id: string
          color: string
          day_of_week: number
          end_time: string
          name_ar: string
          name_en: string
          name_fr: string
          start_time: string
        }[]
      }
      get_public_gym: {
        Args: { p_slug: string }
        Returns: {
          address_ar: string
          address_en: string
          address_fr: string
          brand_color: string
          contact_email: string
          contact_phone: string
          contact_whatsapp: string
          facebook_handle: string
          hero_image_url: string
          id: string
          instagram_followers: number
          instagram_handle: string
          logo_url: string
          map_lat: number
          map_lng: number
          name_ar: string
          name_en: string
          name_fr: string
          office_hours: Json
          slug: string
          tagline_ar: string
          tagline_en: string
          tagline_fr: string
          tiktok_handle: string
          youtube_handle: string
        }[]
      }
      get_setup_status: {
        Args: { p_gym_id: string }
        Returns: {
          brand_color: string
          email: string
          enabled_products: Json
          first_coach_id: string
          has_bookable_coach: boolean
          has_class_schedule: boolean
          has_coach: boolean
          has_discipline: boolean
          has_exchange_rate: boolean
          has_landing_class: boolean
          has_landing_coach: boolean
          has_membership_plan: boolean
          has_pt_package: boolean
          has_student: boolean
          has_upcoming_camp: boolean
          hero_image_url: string
          logo_url: string
          name_ar: string
          name_en: string
          name_fr: string
          phone: string
          slug: string
          tagline_ar: string
          tagline_en: string
          tagline_fr: string
        }[]
      }
      get_student_pt_sessions: {
        Args: never
        Returns: {
          assignment_id: string
          coach_name: string
          package_name_ar: string
          package_name_en: string
          package_name_fr: string
          scheduled_at: string
          session_id: string
          status: Database["public"]["Enums"]["pt_session_status_enum"]
        }[]
      }
      get_user_gym_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      get_whatsapp_status: {
        Args: { p_gym_id: string }
        Returns: {
          configured: boolean
          default_country_code: string
          phone_number_id: string
          status: string
        }[]
      }
      increment_sessions_used: {
        Args: { assignment_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          coach_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          invoice_id: string | null
          is_active: boolean
          package_id: string
          purchased_at: string
          rejected_reason: string | null
          requested_at: string | null
          sessions_remaining: number | null
          sessions_total: number
          sessions_used: number
          status: Database["public"]["Enums"]["pt_assignment_status"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_exchange_rate: {
        Args: {
          p_notes?: string
          p_rate: number
          p_rate_date?: string
          p_source?: string
        }
        Returns: {
          created_at: string
          entered_by: string | null
          gym_id: string
          id: string
          notes: string | null
          rate: number
          rate_date: string
          source: string | null
        }
        SetofOptions: {
          from: "*"
          to: "exchange_rates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_active_gym: { Args: { p_gym_id: string }; Returns: boolean }
      is_guardian_of: { Args: { p_student_id: string }; Returns: boolean }
      is_guardian_of_profile: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      is_gym_admin: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_public_class: { Args: { p_class_id: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      issue_invoice: {
        Args: {
          p_amount_lbp?: number
          p_amount_usd: number
          p_due_date?: string
          p_exchange_rate?: number
          p_gym_id: string
          p_invoice_type: Database["public"]["Enums"]["invoice_type_enum"]
          p_membership_id?: string
          p_notes_ar?: string
          p_notes_en?: string
          p_notes_fr?: string
          p_payer_profile_id?: string
          p_rate_date?: string
          p_student_id: string
        }
        Returns: {
          amount_lbp: number
          amount_usd: number
          created_at: string
          deleted_at: string | null
          due_date: string
          exchange_rate: number | null
          gym_id: string
          id: string
          invoice_number: string
          invoice_type: Database["public"]["Enums"]["invoice_type_enum"]
          membership_id: string | null
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          paid_at: string | null
          payer_profile_id: string | null
          rate_date: string | null
          rate_source: string | null
          status: Database["public"]["Enums"]["payment_status_enum"]
          student_id: string
          tax_amount_usd: number | null
          tax_rate: number | null
          total_lbp: number | null
          total_usd: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      member_phone_exists: { Args: { p_phone: string }; Returns: boolean }
      normalize_lb_phone: { Args: { p_phone: string }; Returns: string }
      process_renewals_now: { Args: never; Returns: Json }
      promote_student: {
        Args: {
          p_coach_id: string
          p_discipline_id: string
          p_notes?: string
          p_promotion_date?: string
          p_student_id: string
          p_to_hierarchy_id: string
        }
        Returns: {
          belt_hierarchy_id: string
          coach_id: string
          created_at: string
          discipline_id: string
          from_rank: Database["public"]["Enums"]["belt_rank_enum"] | null
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          promotion_date: string
          student_id: string
          to_rank: Database["public"]["Enums"]["belt_rank_enum"]
        }
        SetofOptions: {
          from: "*"
          to: "belt_promotions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pt_emit_approved_notifications: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      publish_coach_profile: {
        Args: { p_coach_id: string; p_live_avatar_url?: string }
        Returns: undefined
      }
      recipient_in_gym: {
        Args: { p_gym_id: string; p_user_id: string }
        Returns: boolean
      }
      record_payment: {
        Args: {
          p_amount_lbp?: number
          p_amount_usd: number
          p_client_uuid?: string
          p_discount_usd?: number
          p_exchange_rate?: number
          p_invoice_id: string
          p_method?: Database["public"]["Enums"]["payment_method_enum"]
          p_payment_date?: string
          p_reference?: string
        }
        Returns: {
          amount_lbp: number
          amount_usd: number
          created_at: string
          deleted_at: string | null
          due_date: string
          exchange_rate: number | null
          gym_id: string
          id: string
          invoice_number: string
          invoice_type: Database["public"]["Enums"]["invoice_type_enum"]
          membership_id: string | null
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          paid_at: string | null
          payer_profile_id: string | null
          rate_date: string | null
          rate_source: string | null
          status: Database["public"]["Enums"]["payment_status_enum"]
          student_id: string
          tax_amount_usd: number | null
          tax_rate: number | null
          total_lbp: number | null
          total_usd: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_trial_outcome: {
        Args: {
          p_feedback: string
          p_interested?: boolean
          p_show_up: boolean
          p_status: Database["public"]["Enums"]["trial_status_enum"]
          p_trial_id: string
        }
        Returns: {
          assigned_coach_id: string | null
          class_id: string | null
          created_at: string
          feedback: string | null
          id: string
          interested: boolean | null
          lead_id: string
          scheduled_date: string
          scheduled_time: string | null
          show_up: boolean | null
          status: Database["public"]["Enums"]["trial_status_enum"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trial_classes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refund_invoice: {
        Args: { p_invoice_id: string; p_reason?: string }
        Returns: {
          amount_lbp: number
          amount_usd: number
          created_at: string
          deleted_at: string | null
          due_date: string
          exchange_rate: number | null
          gym_id: string
          id: string
          invoice_number: string
          invoice_type: Database["public"]["Enums"]["invoice_type_enum"]
          membership_id: string | null
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          paid_at: string | null
          payer_profile_id: string | null
          rate_date: string | null
          rate_source: string | null
          status: Database["public"]["Enums"]["payment_status_enum"]
          student_id: string
          tax_amount_usd: number | null
          tax_rate: number | null
          total_lbp: number | null
          total_usd: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_camp: {
        Args: { p_camp_id: string; p_request_id?: string; p_student_id: string }
        Returns: {
          camp_id: string
          created_at: string
          dietary_restrictions: string | null
          guardian_id: string | null
          id: string
          invoice_id: string | null
          medical_notes: string | null
          pickup_authorized_persons: string | null
          price_lbp: number | null
          price_usd: number | null
          registration_date: string
          status: string
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "camp_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reinstate_membership: {
        Args: { p_membership_id: string }
        Returns: {
          auto_renew: boolean
          cancelled_at: string | null
          created_at: string
          end_date: string
          id: string
          lapsed_at: string | null
          pause_end_date: string | null
          pause_start_date: string | null
          pending_plan_id: string | null
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["membership_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "student_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_class_registration: {
        Args: { p_reason?: string; p_reg_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          class_id: string
          created_at: string
          discount_amount_usd: number | null
          discount_pct: number | null
          end_date: string | null
          gym_id: string
          id: string
          invoice_id: string | null
          monthly_fee_lbp: number | null
          monthly_fee_usd: number | null
          paid_until: string | null
          rejected_reason: string | null
          requested_at: string
          start_date: string | null
          status: Database["public"]["Enums"]["class_registration_status_enum"]
          student_id: string
          suspended_at: string | null
          updated_at: string
          waitlist_position: number | null
        }
        SetofOptions: {
          from: "*"
          to: "class_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      renew_now: { Args: { p_membership_id: string }; Returns: string }
      request_camp: {
        Args: { p_camp_id: string; p_student_id: string }
        Returns: {
          camp_id: string
          created_at: string
          dietary_restrictions: string | null
          guardian_id: string | null
          id: string
          invoice_id: string | null
          medical_notes: string | null
          pickup_authorized_persons: string | null
          price_lbp: number | null
          price_usd: number | null
          registration_date: string
          status: string
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "camp_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_class_registration: {
        Args: { p_class_id: string; p_student_id?: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          class_id: string
          created_at: string
          discount_amount_usd: number | null
          discount_pct: number | null
          end_date: string | null
          gym_id: string
          id: string
          invoice_id: string | null
          monthly_fee_lbp: number | null
          monthly_fee_usd: number | null
          paid_until: string | null
          rejected_reason: string | null
          requested_at: string
          start_date: string | null
          status: Database["public"]["Enums"]["class_registration_status_enum"]
          student_id: string
          suspended_at: string | null
          updated_at: string
          waitlist_position: number | null
        }
        SetofOptions: {
          from: "*"
          to: "class_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_membership_freeze: {
        Args: { p_days?: number; p_reason?: string; p_student_id: string }
        Returns: {
          created_at: string
          decline_reason: string | null
          gym_id: string
          id: string
          kind: Database["public"]["Enums"]["member_request_kind"]
          note: string | null
          payload: Json
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["member_request_status"]
          student_id: string
        }
        SetofOptions: {
          from: "*"
          to: "member_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_membership_renewal: {
        Args: { p_note?: string; p_student_id: string }
        Returns: {
          created_at: string
          decline_reason: string | null
          gym_id: string
          id: string
          kind: Database["public"]["Enums"]["member_request_kind"]
          note: string | null
          payload: Json
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["member_request_status"]
          student_id: string
        }
        SetofOptions: {
          from: "*"
          to: "member_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_profile_change: {
        Args: { p_note?: string; p_payload: Json; p_student_id: string }
        Returns: {
          created_at: string
          decline_reason: string | null
          gym_id: string
          id: string
          kind: Database["public"]["Enums"]["member_request_kind"]
          note: string | null
          payload: Json
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["member_request_status"]
          student_id: string
        }
        SetofOptions: {
          from: "*"
          to: "member_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_pt: {
        Args: { p_coach_id?: string; p_package_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          coach_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          invoice_id: string | null
          is_active: boolean
          package_id: string
          purchased_at: string
          rejected_reason: string | null
          requested_at: string | null
          sessions_remaining: number | null
          sessions_total: number
          sessions_used: number
          status: Database["public"]["Enums"]["pt_assignment_status"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reschedule_pt_session: {
        Args: {
          p_coach_id?: string
          p_scheduled_at: string
          p_session_id: string
        }
        Returns: {
          assignment_id: string | null
          coach_id: string
          created_at: string
          duration_minutes: number
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          package_id: string | null
          proposed_by: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["pt_session_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reseed_proline_demo: { Args: never; Returns: Json }
      reset_ml1_e2e: { Args: { p_slug: string }; Returns: undefined }
      respond_pt_proposal: {
        Args: { p_action: string; p_counter_at?: string; p_session_id: string }
        Returns: {
          assignment_id: string | null
          coach_id: string
          created_at: string
          duration_minutes: number
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          package_id: string | null
          proposed_by: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["pt_session_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_pt_credit: {
        Args: {
          p_assignment_id: string
          p_reason?: string
          p_session_id: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          coach_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          invoice_id: string | null
          is_active: boolean
          package_id: string
          purchased_at: string
          rejected_reason: string | null
          requested_at: string | null
          sessions_remaining: number | null
          sessions_total: number
          sessions_used: number
          status: Database["public"]["Enums"]["pt_assignment_status"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_lifecycle_tick: { Args: { p_gym_id?: string }; Returns: Json }
      schedule_pt_session: {
        Args: {
          p_assignment_id: string
          p_coach_id?: string
          p_duration?: number
          p_scheduled_at?: string
        }
        Returns: {
          assignment_id: string | null
          coach_id: string
          created_at: string
          duration_minutes: number
          id: string
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          package_id: string | null
          proposed_by: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["pt_session_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      schedule_trial: {
        Args: {
          p_coach_id: string
          p_lead_id: string
          p_scheduled_date: string
          p_scheduled_time: string
        }
        Returns: {
          assigned_coach_id: string | null
          class_id: string | null
          created_at: string
          feedback: string | null
          id: string
          interested: boolean | null
          lead_id: string
          scheduled_date: string
          scheduled_time: string | null
          show_up: boolean | null
          status: Database["public"]["Enums"]["trial_status_enum"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trial_classes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      seed_e2e_dunning: {
        Args: { p_opt_in: boolean; p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_adm1: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_b3: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_base: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_e1: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_fd1: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_fin1: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_g1: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_ml1: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_no_membership: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_on1: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_pre_coachlp: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_gym_pt1: {
        Args: { p_password?: string; p_slug: string }
        Returns: string
      }
      seed_e2e_wl_gym: {
        Args: {
          p_brand_color: string
          p_name: string
          p_password?: string
          p_slug: string
        }
        Returns: string
      }
      sell_membership: {
        Args: {
          p_auto_renew?: boolean
          p_plan_id: string
          p_start_date?: string
          p_student_id: string
        }
        Returns: {
          auto_renew: boolean
          cancelled_at: string | null
          created_at: string
          end_date: string
          id: string
          lapsed_at: string | null
          pause_end_date: string | null
          pause_start_date: string | null
          pending_plan_id: string | null
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["membership_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "student_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sell_pt_package: {
        Args: {
          p_coach_id: string
          p_discount_amount_usd?: number
          p_discount_pct?: number
          p_package_id: string
          p_request_id?: string
          p_student_id: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          coach_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          invoice_id: string | null
          is_active: boolean
          package_id: string
          purchased_at: string
          rejected_reason: string | null
          requested_at: string | null
          sessions_remaining: number | null
          sessions_total: number
          sessions_used: number
          status: Database["public"]["Enums"]["pt_assignment_status"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pt_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_coach_landing: {
        Args: { p_coach_id: string; p_status: string; p_visible: boolean }
        Returns: undefined
      }
      set_registration_anchor: {
        Args: { p_new_anchor: string; p_reg_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          billing_anchor: string | null
          cancelled_at: string | null
          class_id: string
          created_at: string
          discount_amount_usd: number | null
          discount_pct: number | null
          end_date: string | null
          first_cycle_prorated: boolean
          gym_id: string
          id: string
          invoice_id: string | null
          monthly_fee_lbp: number | null
          monthly_fee_usd: number | null
          paid_until: string | null
          rejected_reason: string | null
          requested_at: string
          start_date: string | null
          status: Database["public"]["Enums"]["class_registration_status_enum"]
          student_id: string
          suspended_at: string | null
          updated_at: string
          waitlist_position: number | null
        }
      }
      set_staff_active: {
        Args: { p_active: boolean; p_user_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_platform_lead: {
        Args: {
          p_activity_type?: string
          p_business_name?: string
          p_city?: string
          p_email?: string
          p_honeypot?: string
          p_message?: string
          p_name: string
          p_phone: string
          p_source?: string
        }
        Returns: string
      }
      submit_public_lead: {
        Args: {
          p_gym_slug: string
          p_honeypot?: string
          p_interests?: string[]
          p_name: string
          p_note?: string
          p_phone: string
        }
        Returns: string
      }
      submit_trial_inquiry: {
        Args: {
          p_campaign_code?: string
          p_discipline_id?: string
          p_gym_slug: string
          p_honeypot?: string
          p_name: string
          p_phone: string
        }
        Returns: string
      }
      sweep_stale_e2e_gyms: { Args: { p_hours?: number }; Returns: number }
      teardown_e2e_gym: { Args: { p_slug: string }; Returns: undefined }
      unfreeze_membership: {
        Args: { p_membership_id: string }
        Returns: {
          auto_renew: boolean
          cancelled_at: string | null
          created_at: string
          end_date: string
          id: string
          lapsed_at: string | null
          pause_end_date: string | null
          pause_start_date: string | null
          pending_plan_id: string | null
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["membership_status_enum"]
          student_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "student_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_student: {
        Args: {
          p_current_belt_rank: Database["public"]["Enums"]["belt_rank_enum"]
          p_date_of_birth: string
          p_emergency_contact_name: string
          p_emergency_contact_phone: string
          p_first_name_ar: string
          p_first_name_en: string
          p_first_name_fr: string
          p_gender: Database["public"]["Enums"]["gender_enum"]
          p_join_date: string
          p_last_name_ar: string
          p_last_name_en: string
          p_last_name_fr: string
          p_medical_notes: string
          p_phone: string
          p_student_id: string
        }
        Returns: {
          belt_promotion_date: string | null
          created_at: string
          current_belt_rank:
            | Database["public"]["Enums"]["belt_rank_enum"]
            | null
          deleted_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gym_id: string
          id: string
          is_active: boolean
          join_date: string
          medical_notes: string | null
          portal_login_override: boolean | null
          profile_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_invoice: {
        Args: { p_invoice_id: string; p_reason?: string }
        Returns: {
          amount_lbp: number
          amount_usd: number
          created_at: string
          deleted_at: string | null
          due_date: string
          exchange_rate: number | null
          gym_id: string
          id: string
          invoice_number: string
          invoice_type: Database["public"]["Enums"]["invoice_type_enum"]
          membership_id: string | null
          notes_ar: string | null
          notes_en: string | null
          notes_fr: string | null
          paid_at: string | null
          payer_profile_id: string | null
          rate_date: string | null
          rate_source: string | null
          status: Database["public"]["Enums"]["payment_status_enum"]
          student_id: string
          tax_amount_usd: number | null
          tax_rate: number | null
          total_lbp: number | null
          total_usd: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      attendance_status_enum: "present" | "absent" | "late" | "excused"
      audit_action_enum:
        | "create"
        | "update"
        | "delete"
        | "login"
        | "logout"
        | "payment"
        | "refund"
        | "export"
      belt_rank_enum:
        | "white"
        | "white_yellow"
        | "yellow"
        | "yellow_orange"
        | "orange"
        | "orange_green"
        | "green"
        | "green_blue"
        | "blue"
        | "blue_purple"
        | "purple"
        | "purple_brown"
        | "brown"
        | "brown_black"
        | "red"
        | "black_1"
        | "black_2"
        | "black_3"
        | "black_4"
        | "black_5"
      booking_status_enum: "confirmed" | "in_use" | "completed" | "cancelled"
      camp_status_enum:
        | "draft"
        | "open"
        | "full"
        | "in_progress"
        | "completed"
        | "cancelled"
      class_registration_status_enum:
        | "requested"
        | "active"
        | "waitlisted"
        | "cancelled"
        | "rejected"
        | "expired"
        | "suspended"
      class_status_enum: "scheduled" | "in_progress" | "completed" | "cancelled"
      document_type_enum:
        | "waiver"
        | "medical"
        | "id_card"
        | "certificate"
        | "contract"
        | "other"
      gender_enum: "male" | "female" | "other"
      invoice_type_enum:
        | "membership"
        | "pt_package"
        | "pt_session"
        | "camp"
        | "rental"
        | "event"
        | "other"
        | "class_registration"
      lead_status_enum:
        | "new"
        | "contacted"
        | "trial_scheduled"
        | "trial_completed"
        | "converted"
        | "lost"
      member_followup_outcome_enum:
        | "no_answer"
        | "not_interested"
        | "thinking"
        | "promised_visit"
        | "reactivated"
      member_request_kind: "profile_change" | "renewal" | "freeze"
      member_request_status: "pending" | "approved" | "declined"
      membership_status_enum:
        | "active"
        | "expired"
        | "cancelled"
        | "paused"
        | "pending"
        | "lapsed"
      message_channel_enum: "whatsapp" | "sms" | "email" | "push"
      message_status_enum: "pending" | "sent" | "delivered" | "read" | "failed"
      payment_method_enum:
        | "cash_usd"
        | "cash_lbp"
        | "omt"
        | "whish"
        | "bank_transfer"
        | "bob_finance"
      payment_status_enum:
        | "pending"
        | "paid"
        | "overdue"
        | "cancelled"
        | "refunded"
        | "partial"
      pt_assignment_status:
        | "requested"
        | "approved"
        | "rejected"
        | "active"
        | "completed"
        | "cancelled"
      pt_session_status_enum:
        | "scheduled"
        | "completed"
        | "cancelled"
        | "no_show"
        | "proposed"
      rental_status_enum: "available" | "booked" | "maintenance"
      trial_status_enum: "scheduled" | "completed" | "no_show" | "cancelled"
      user_role_enum:
        | "owner"
        | "head_coach"
        | "coach"
        | "receptionist"
        | "student"
        | "parent"
        | "external_coach"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      attendance_status_enum: ["present", "absent", "late", "excused"],
      audit_action_enum: [
        "create",
        "update",
        "delete",
        "login",
        "logout",
        "payment",
        "refund",
        "export",
      ],
      belt_rank_enum: [
        "white",
        "white_yellow",
        "yellow",
        "yellow_orange",
        "orange",
        "orange_green",
        "green",
        "green_blue",
        "blue",
        "blue_purple",
        "purple",
        "purple_brown",
        "brown",
        "brown_black",
        "red",
        "black_1",
        "black_2",
        "black_3",
        "black_4",
        "black_5",
      ],
      booking_status_enum: ["confirmed", "in_use", "completed", "cancelled"],
      camp_status_enum: [
        "draft",
        "open",
        "full",
        "in_progress",
        "completed",
        "cancelled",
      ],
      class_registration_status_enum: [
        "requested",
        "active",
        "waitlisted",
        "cancelled",
        "rejected",
        "expired",
        "suspended",
      ],
      class_status_enum: ["scheduled", "in_progress", "completed", "cancelled"],
      document_type_enum: [
        "waiver",
        "medical",
        "id_card",
        "certificate",
        "contract",
        "other",
      ],
      gender_enum: ["male", "female", "other"],
      invoice_type_enum: [
        "membership",
        "pt_package",
        "pt_session",
        "camp",
        "rental",
        "event",
        "other",
        "class_registration",
      ],
      lead_status_enum: [
        "new",
        "contacted",
        "trial_scheduled",
        "trial_completed",
        "converted",
        "lost",
      ],
      member_followup_outcome_enum: [
        "no_answer",
        "not_interested",
        "thinking",
        "promised_visit",
        "reactivated",
      ],
      member_request_kind: ["profile_change", "renewal", "freeze"],
      member_request_status: ["pending", "approved", "declined"],
      membership_status_enum: [
        "active",
        "expired",
        "cancelled",
        "paused",
        "pending",
        "lapsed",
      ],
      message_channel_enum: ["whatsapp", "sms", "email", "push"],
      message_status_enum: ["pending", "sent", "delivered", "read", "failed"],
      payment_method_enum: [
        "cash_usd",
        "cash_lbp",
        "omt",
        "whish",
        "bank_transfer",
        "bob_finance",
      ],
      payment_status_enum: [
        "pending",
        "paid",
        "overdue",
        "cancelled",
        "refunded",
        "partial",
      ],
      pt_assignment_status: [
        "requested",
        "approved",
        "rejected",
        "active",
        "completed",
        "cancelled",
      ],
      pt_session_status_enum: [
        "scheduled",
        "completed",
        "cancelled",
        "no_show",
        "proposed",
      ],
      rental_status_enum: ["available", "booked", "maintenance"],
      trial_status_enum: ["scheduled", "completed", "no_show", "cancelled"],
      user_role_enum: [
        "owner",
        "head_coach",
        "coach",
        "receptionist",
        "student",
        "parent",
        "external_coach",
      ],
    },
  },
} as const

