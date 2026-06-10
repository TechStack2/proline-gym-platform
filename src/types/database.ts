export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
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
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          operation?: Database["public"]["Enums"]["audit_action_enum"]
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      belt_hierarchies: {
        Row: {
          created_at: string
          discipline_id: string
          id: string
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
          name_ar: string
          name_en: string
          name_fr: string
          room: string | null
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
          name_ar: string
          name_en: string
          name_fr: string
          room?: string | null
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
          name_ar?: string
          name_en?: string
          name_fr?: string
          room?: string | null
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
      coaches: {
        Row: {
          belt_rank: Database["public"]["Enums"]["belt_rank_enum"] | null
          bio_ar: string | null
          bio_en: string | null
          bio_fr: string | null
          created_at: string
          deleted_at: string | null
          gym_id: string
          hourly_rate_lbp: number | null
          hourly_rate_usd: number | null
          id: string
          is_active: boolean
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
          hourly_rate_lbp?: number | null
          hourly_rate_usd?: number | null
          id?: string
          is_active?: boolean
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
          hourly_rate_lbp?: number | null
          hourly_rate_usd?: number | null
          id?: string
          is_active?: boolean
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
          id: string
          notes: string | null
          rate: number
          rate_date: string
          source: string | null
        }
        Insert: {
          created_at?: string
          entered_by?: string | null
          id?: string
          notes?: string | null
          rate: number
          rate_date: string
          source?: string | null
        }
        Update: {
          created_at?: string
          entered_by?: string | null
          id?: string
          notes?: string | null
          rate?: number
          rate_date?: string
          source?: string | null
        }
        Relationships: []
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
      gyms: {
        Row: {
          address_ar: string | null
          address_en: string | null
          address_fr: string | null
          city: string | null
          country: string | null
          created_at: string
          currency_preference: string
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name_ar: string
          name_en: string
          name_fr: string
          phone: string | null
          pt_late_cancel_window_hours: number
          pt_no_show_forfeits: boolean
          slug: string
          timezone: string | null
          tva_registration_number: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address_ar?: string | null
          address_en?: string | null
          address_fr?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency_preference?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name_ar: string
          name_en: string
          name_fr: string
          phone?: string | null
          pt_late_cancel_window_hours?: number
          pt_no_show_forfeits?: boolean
          slug: string
          timezone?: string | null
          tva_registration_number?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_ar?: string | null
          address_en?: string | null
          address_fr?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          currency_preference?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name_ar?: string
          name_en?: string
          name_fr?: string
          phone?: string | null
          pt_late_cancel_window_hours?: number
          pt_no_show_forfeits?: boolean
          slug?: string
          timezone?: string | null
          tva_registration_number?: string | null
          updated_at?: string
          website?: string | null
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
          converted_at: string | null
          converted_student_id: string | null
          created_at: string
          email: string | null
          first_name: string | null
          gym_id: string
          id: string
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
          converted_at?: string | null
          converted_student_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          gym_id: string
          id?: string
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
          converted_at?: string | null
          converted_student_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          gym_id?: string
          id?: string
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
        ]
      }
      payments: {
        Row: {
          amount_lbp: number
          amount_usd: number
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
      profiles: {
        Row: {
          avatar_url: string | null
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
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          first_name_ar?: string | null
          first_name_en?: string | null
          first_name_fr?: string | null
          gender?: Database["public"]["Enums"]["gender_enum"] | null
          gym_id: string
          id: string
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
      pt_packages: {
        Row: {
          coach_id: string | null
          created_at: string
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          description_fr: string | null
          gym_id: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          name_fr: string
          price_lbp: number | null
          price_usd: number
          session_count: number
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
          gym_id: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          name_fr: string
          price_lbp?: number | null
          price_usd: number
          session_count: number
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
          gym_id?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          name_fr?: string
          price_lbp?: number | null
          price_usd?: number
          session_count?: number
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
            foreignKeyName: "pt_packages_gym_id_fkey"
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
          sessions_remaining: number
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
          sessions_remaining?: number
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
          sessions_remaining?: number
          sessions_total?: number
          sessions_used?: number
          status?: Database["public"]["Enums"]["pt_assignment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pt_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
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
          scheduled_at?: string
          status?: Database["public"]["Enums"]["pt_session_status_enum"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
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
            foreignKeyName: "pt_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          created_at: string
          end_date: string
          id: string
          pause_end_date: string | null
          pause_start_date: string | null
          plan_id: string
          start_date: string
          status: Database["public"]["Enums"]["membership_status_enum"]
          student_id: string
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          created_at?: string
          end_date: string
          id?: string
          pause_end_date?: string | null
          pause_start_date?: string | null
          plan_id: string
          start_date: string
          status?: Database["public"]["Enums"]["membership_status_enum"]
          student_id: string
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          created_at?: string
          end_date?: string
          id?: string
          pause_end_date?: string | null
          pause_start_date?: string | null
          plan_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["membership_status_enum"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
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
          created_at: string
          deleted_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gym_id: string
          id: string
          is_active: boolean
          join_date: string
          medical_notes: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gym_id: string
          id?: string
          is_active?: boolean
          join_date?: string
          medical_notes?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gym_id?: string
          id?: string
          is_active?: boolean
          join_date?: string
          medical_notes?: string | null
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
      trial_classes: {
        Row: {
          assigned_coach_id: string | null
          class_id: string | null
          created_at: string
          feedback: string | null
          id: string
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
          is_primary: boolean
          role: Database["public"]["Enums"]["user_role_enum"]
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          is_primary?: boolean
          role: Database["public"]["Enums"]["user_role_enum"]
          user_id: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_student: {
        Args: {
          p_first_name_ar: string
          p_first_name_en: string
          p_first_name_fr: string
          p_last_name_ar: string
          p_last_name_en: string
          p_last_name_fr: string
          p_phone: string
          p_gender: Database["public"]["Enums"]["gender_enum"] | null
          p_date_of_birth: string | null
          p_emergency_contact_name: string | null
          p_emergency_contact_phone: string | null
          p_medical_notes: string | null
          p_join_date: string | null
          p_current_belt_rank: Database["public"]["Enums"]["belt_rank_enum"] | null
        }
        Returns: Database["public"]["Tables"]["students"]["Row"]
      }
      update_student: {
        Args: {
          p_student_id: string
          p_first_name_ar: string
          p_first_name_en: string
          p_first_name_fr: string
          p_last_name_ar: string
          p_last_name_en: string
          p_last_name_fr: string
          p_phone: string
          p_gender: Database["public"]["Enums"]["gender_enum"] | null
          p_date_of_birth: string | null
          p_emergency_contact_name: string | null
          p_emergency_contact_phone: string | null
          p_medical_notes: string | null
          p_join_date: string | null
          p_current_belt_rank: Database["public"]["Enums"]["belt_rank_enum"] | null
        }
        Returns: Database["public"]["Tables"]["students"]["Row"]
      }
      pt_emit_approved_notifications: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      get_gym_coaches: {
        Args: never
        Returns: {
          id: string
          first_name_ar: string | null
          first_name_en: string | null
          first_name_fr: string | null
        }[]
      }
      get_coach_pt_roster: {
        Args: never
        Returns: {
          assignment_id: string
          student_name: string
          package_name_ar: string
          package_name_en: string
          package_name_fr: string
          sessions_total: number
          sessions_remaining: number
        }[]
      }
      get_user_gym_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      increment_sessions_used: {
        Args: { assignment_id: string }
        Returns: Database["public"]["Tables"]["pt_assignments"]["Row"]
      }
      is_staff: { Args: never; Returns: boolean }
      schedule_pt_session: {
        Args: {
          p_assignment_id: string
          p_coach_id?: string | null
          p_scheduled_at?: string | null
          p_duration?: number | null
        }
        Returns: Database["public"]["Tables"]["pt_sessions"]["Row"]
      }
      complete_pt_session: {
        Args: { p_session_id: string }
        Returns: Database["public"]["Tables"]["pt_sessions"]["Row"]
      }
      cancel_or_no_show_pt_session: {
        Args: { p_session_id: string; p_outcome: string }
        Returns: Database["public"]["Tables"]["pt_sessions"]["Row"]
      }
      reschedule_pt_session: {
        Args: { p_session_id: string; p_scheduled_at: string; p_coach_id?: string | null }
        Returns: Database["public"]["Tables"]["pt_sessions"]["Row"]
      }
      restore_pt_credit: {
        Args: { p_assignment_id: string; p_session_id?: string | null; p_reason?: string | null }
        Returns: Database["public"]["Tables"]["pt_assignments"]["Row"]
      }
      get_coach_pt_sessions: {
        Args: never
        Returns: {
          session_id: string
          assignment_id: string | null
          student_name: string
          package_name_ar: string | null
          package_name_en: string | null
          package_name_fr: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["pt_session_status_enum"]
          sessions_total: number | null
          sessions_remaining: number | null
        }[]
      }
      get_student_pt_sessions: {
        Args: never
        Returns: {
          session_id: string
          assignment_id: string | null
          coach_name: string
          package_name_ar: string | null
          package_name_en: string | null
          package_name_fr: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["pt_session_status_enum"]
        }[]
      }
      request_pt: {
        Args: { p_package_id: string; p_coach_id?: string }
        Returns: Database["public"]["Tables"]["pt_assignments"]["Row"]
      }
      submit_public_lead: {
        Args: {
          p_first_name: string
          p_phone: string
          p_source?: string
          p_notes?: string
          p_last_name?: string
          p_email?: string
          p_program?: string
          p_gym_slug?: string | null
        }
        Returns: string
      }
      schedule_trial: {
        Args: {
          p_lead_id: string
          p_scheduled_date: string
          p_scheduled_time: string | null
          p_coach_id: string | null
        }
        Returns: Database["public"]["Tables"]["trial_classes"]["Row"]
      }
      record_trial_outcome: {
        Args: {
          p_trial_id: string
          p_status: Database["public"]["Enums"]["trial_status_enum"]
          p_show_up: boolean
          p_feedback: string | null
        }
        Returns: Database["public"]["Tables"]["trial_classes"]["Row"]
      }
      convert_lead_to_member: {
        Args: { p_lead_id: string; p_plan_id: string }
        Returns: {
          student_id: string
          profile_id: string
          membership_id: string
          invoice_id: string
          invoice_number: string
          total_usd: number
        }[]
      }
      get_coach_trials: {
        Args: never
        Returns: {
          id: string
          lead_id: string
          lead_name: string
          lead_phone: string | null
          scheduled_date: string
          scheduled_time: string | null
          status: Database["public"]["Enums"]["trial_status_enum"]
          show_up: boolean | null
          feedback: string | null
        }[]
      }
      member_phone_exists: {
        Args: { p_phone: string }
        Returns: boolean
      }
      promote_student: {
        Args: {
          p_student_id: string
          p_discipline_id: string
          p_to_hierarchy_id: string
          p_coach_id: string
          p_promotion_date?: string | null
          p_notes?: string | null
        }
        Returns: Database["public"]["Tables"]["belt_promotions"]["Row"]
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
        | "black_1"
        | "black_2"
        | "black_3"
        | "black_4"
        | "black_5"
        | "red"
      booking_status_enum: "confirmed" | "in_use" | "completed" | "cancelled"
      camp_status_enum:
        | "draft"
        | "open"
        | "full"
        | "in_progress"
        | "completed"
        | "cancelled"
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
      lead_status_enum:
        | "new"
        | "contacted"
        | "trial_scheduled"
        | "trial_completed"
        | "converted"
        | "lost"
      membership_status_enum:
        | "active"
        | "expired"
        | "cancelled"
        | "paused"
        | "pending"
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
        "black_1",
        "black_2",
        "black_3",
        "black_4",
        "black_5",
        "red",
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
      ],
      lead_status_enum: [
        "new",
        "contacted",
        "trial_scheduled",
        "trial_completed",
        "converted",
        "lost",
      ],
      membership_status_enum: [
        "active",
        "expired",
        "cancelled",
        "paused",
        "pending",
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
      pt_session_status_enum: [
        "scheduled",
        "completed",
        "cancelled",
        "no_show",
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
