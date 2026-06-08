export interface Class {
  id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  discipline_id: string;
  coach_id: string;
  description: string;
  capacity: number;
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
  updated_at: string;
  discipline?: {
    id: string;
    name_ar: string;
    name_en: string;
    name_fr: string;
  };
  coach?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  schedules?: ClassSchedule[];
  enrollments_count?: number;
}

export interface ClassSchedule {
  id: string;
  class_id: string;
  day_of_week: number; // 0=Sunday, 1=Monday, etc.
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  room: string;
  created_at: string;
}

export interface ClassEnrollment {
  id: string;
  class_id: string;
  student_id: string;
  enrolled_at: string;
  status: 'active' | 'cancelled' | 'completed';
  student?: {
    id: string;
    first_name: string;
    last_name: string;
    belt_rank: string;
    email: string;
    phone: string;
  };
}

export interface Discipline {
  id: string;
  name_ar: string;
  name_en: string;
  name_fr: string;
  description: string;
  status: 'active' | 'inactive';
}

export interface Coach {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  specialties: string[];
  status: 'active' | 'inactive';
}

export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  belt_rank: string;
  email: string;
  phone: string;
  status: 'active' | 'inactive' | 'suspended';
}