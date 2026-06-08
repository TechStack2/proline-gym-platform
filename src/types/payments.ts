export interface Payment {
  id: string;
  student_id: string;
  amount: number;
  currency: 'USD' | 'LBP';
  payment_method: 'cash' | 'card' | 'transfer' | 'check';
  reference_number?: string;
  notes?: string;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  payment_date: string;
  created_at: string;
  updated_at: string;
  students?: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
  };
}

export interface Invoice {
  id: string;
  invoice_number: string;
  student_id: string;
  membership_plan_id?: string;
  amount: number;
  currency: 'USD' | 'LBP';
  issue_date: string;
  due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  notes?: string;
  created_at: string;
  updated_at: string;
  students?: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
  };
  membership_plans?: {
    id: string;
    name: string;
    price_usd: number;
    price_lbp: number;
    duration_days: number;
    max_classes_per_week: number;
  };
  invoice_items?: InvoiceItem[];
  payments?: Payment[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  currency: 'USD' | 'LBP';
  total: number;
}

export interface MembershipPlan {
  id: string;
  name: string;
  description?: string;
  price_usd: number;
  price_lbp: number;
  duration_days: number;
  max_classes_per_week: number;
  features?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentFormData {
  student_id: string;
  amount: number;
  currency: 'USD' | 'LBP';
  payment_method: 'cash' | 'card' | 'transfer' | 'check';
  reference_number?: string;
  notes?: string;
  payment_date?: string;
}

export interface InvoiceFormData {
  student_id: string;
  membership_plan_id?: string;
  amount: number;
  currency: 'USD' | 'LBP';
  issue_date: string;
  due_date: string;
  notes?: string;
  items?: {
    description: string;
    quantity: number;
    unit_price: number;
    currency: 'USD' | 'LBP';
  }[];
}

export interface PaymentFilters {
  search?: string;
  student_id?: string;
  status?: string;
  payment_method?: string;
  currency?: string;
  date_from?: string;
  date_to?: string;
}

export interface InvoiceFilters {
  search?: string;
  student_id?: string;
  status?: string;
  currency?: string;
  date_from?: string;
  date_to?: string;
}