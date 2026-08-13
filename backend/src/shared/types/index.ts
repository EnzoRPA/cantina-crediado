/**
 * Shared type definitions for the Cantina Escolar backend.
 */

// ---- Pagination ----

export interface PaginationQuery {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  summary?: Record<string, any>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ---- User Roles ----

export type UserRole = 'admin' | 'operator' | 'student' | 'guardian';

// ---- Common Database Record ----

export interface BaseRecord {
  id: string;
  created_at: Date;
  updated_at: Date;
}

// ---- School ----

export interface School extends BaseRecord {
  name: string;
  cnpj: string | null;
  address: Record<string, any> | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  settings: Record<string, any>;
  is_active: boolean;
}

// ---- User ----

export interface User extends BaseRecord {
  school_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  two_factor_secret: string | null;
  two_factor_enabled: boolean;
  last_login_at: Date | null;
}

export type SafeUser = Omit<User, 'password_hash' | 'two_factor_secret'>;

// ---- Student ----

export interface Student extends BaseRecord {
  user_id: string;
  school_id: string;
  enrollment_number: string;
  grade: string | null;
  balance: number;
  photo_url: string | null;
  birth_date: Date | null;
  is_active: boolean;
}

// ---- Guardian ----

export interface Guardian extends BaseRecord {
  user_id: string;
  cpf: string | null;
}

export interface StudentGuardian {
  student_id: string;
  guardian_id: string;
  relationship: string;
  is_primary: boolean;
}

// ---- Card ----

export interface Card extends BaseRecord {
  student_id: string;
  card_number: string;
  card_type: 'nfc' | 'qrcode';
  is_active: boolean;
  is_blocked: boolean;
  blocked_reason: string | null;
  blocked_at: Date | null;
}

// ---- Category ----

export interface Category extends BaseRecord {
  school_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

// ---- Product ----

export interface Product extends BaseRecord {
  school_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  barcode: string | null;
  image_url: string | null;
  cost_price: number | null;
  sale_price: number;
  current_stock: number;
  min_stock: number;
  unit: string;
  is_active: boolean;
  is_promotional: boolean;
  promotional_price: number | null;
  promotion_start: Date | null;
  promotion_end: Date | null;
  expiry_alert_days: number;
}

// ---- Stock Movement ----

export interface StockMovement {
  id: string;
  product_id: string;
  school_id: string;
  type: 'in' | 'out' | 'adjust' | 'loss';
  quantity: number;
  unit_cost: number | null;
  reason: string | null;
  batch_number: string | null;
  expiry_date: Date | null;
  reference_id: string | null;
  created_by: string;
  created_at: Date;
}

// ---- Daily Limit ----

export interface DailyLimit extends BaseRecord {
  student_id: string;
  max_daily_amount: number | null;
  allowed_start_time: string | null;
  allowed_end_time: string | null;
  blocked_product_ids: string[];
  blocked_category_ids: string[];
  is_purchase_blocked: boolean;
  configured_by: string | null;
}

// ---- Transaction ----

export type TransactionStatus = 'pending' | 'completed' | 'cancelled' | 'refunded';
export type IdentificationMethod = 'facial' | 'card' | 'manual' | 'app';
export type SyncStatus = 'synced' | 'pending' | 'conflict';
export type PaymentMethod = 'cash' | 'debit_card' | 'credit_card' | 'pix' | 'school_balance' | 'on_credit';

// ---- API Response ----

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
