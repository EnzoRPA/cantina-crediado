// ============================================
// Shared Types — Sistema Cantina Escolar
// ============================================

// ---- Enums ----

export type UserRole = 'admin' | 'operator' | 'student' | 'guardian';

export type CardType = 'nfc' | 'qrcode';

export type StockMovementType = 'in' | 'out' | 'adjust' | 'loss';

export type CashRegisterStatus = 'open' | 'closed';

export type CashRegisterMovementType = 'sale' | 'refund' | 'sangria' | 'suprimento';

export type TransactionStatus = 'pending' | 'completed' | 'cancelled' | 'refunded';

export type IdentificationMethod = 'facial' | 'card' | 'manual' | 'app';

export type SyncStatus = 'synced' | 'pending' | 'conflict';

export type PaymentMethod = 'cash' | 'debit_card' | 'credit_card' | 'pix' | 'school_balance';

export type WhatsAppMessageType = 'low_balance' | 'purchase_summary' | 'monthly_report' | 'debt_collection';

export type WhatsAppStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

// ---- Base Interfaces ----

export interface Timestamps {
  created_at: Date;
  updated_at: Date;
}

export interface School extends Timestamps {
  id: string;
  name: string;
  cnpj: string | null;
  address: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  settings: Record<string, unknown>;
  is_active: boolean;
}

export interface User extends Timestamps {
  id: string;
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

export interface Student extends Timestamps {
  id: string;
  user_id: string;
  school_id: string;
  enrollment_number: string;
  grade: string | null;
  balance: number;
  photo_url: string | null;
  birth_date: Date | null;
  is_active: boolean;
}

export interface Guardian extends Timestamps {
  id: string;
  user_id: string;
  cpf: string | null;
}

export interface StudentGuardian {
  student_id: string;
  guardian_id: string;
  relationship: string;
  is_primary: boolean;
}

export interface Card extends Timestamps {
  id: string;
  student_id: string;
  card_number: string;
  card_type: CardType;
  is_active: boolean;
  is_blocked: boolean;
  blocked_reason: string | null;
  blocked_at: Date | null;
}

export interface FacialDescriptor extends Timestamps {
  id: string;
  student_id: string;
  descriptor_encrypted: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
  consent_given_by: string;
  consent_given_at: Date;
  consent_document_url: string | null;
  model_version: string;
}

export interface Category extends Timestamps {
  id: string;
  school_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Product extends Timestamps {
  id: string;
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

export interface StockMovement {
  id: string;
  product_id: string;
  school_id: string;
  type: StockMovementType;
  quantity: number;
  unit_cost: number | null;
  reason: string | null;
  batch_number: string | null;
  expiry_date: Date | null;
  reference_id: string | null;
  created_by: string;
  created_at: Date;
}

export interface CashRegister {
  id: string;
  school_id: string;
  operator_id: string;
  terminal_name: string | null;
  opening_balance: number;
  closing_balance: number | null;
  status: CashRegisterStatus;
  opened_at: Date;
  closed_at: Date | null;
  notes: string | null;
}

export interface CashRegisterMovement {
  id: string;
  cash_register_id: string;
  type: CashRegisterMovementType;
  amount: number;
  payment_method: string | null;
  description: string | null;
  created_at: Date;
}

export interface Transaction extends Timestamps {
  id: string;
  school_id: string;
  student_id: string | null;
  cash_register_id: string | null;
  operator_id: string | null;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  status: TransactionStatus;
  identification_method: IdentificationMethod | null;
  is_offline: boolean;
  offline_id: string | null;
  sync_status: SyncStatus;
  receipt_url: string | null;
  notes: string | null;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: Date;
}

export interface TransactionPayment {
  id: string;
  transaction_id: string;
  payment_method: PaymentMethod;
  amount: number;
  external_id: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface DailyLimit extends Timestamps {
  id: string;
  student_id: string;
  max_daily_amount: number | null;
  allowed_start_time: string | null;
  allowed_end_time: string | null;
  blocked_product_ids: string[];
  blocked_category_ids: string[];
  is_purchase_blocked: boolean;
  configured_by: string;
}

export interface WhatsAppLog {
  id: string;
  school_id: string;
  recipient_phone: string;
  recipient_user_id: string | null;
  message_type: WhatsAppMessageType;
  message_content: string | null;
  status: WhatsAppStatus;
  external_id: string | null;
  error_message: string | null;
  sent_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  device_info: Record<string, unknown> | null;
  expires_at: Date;
  is_revoked: boolean;
  created_at: Date;
}

// ---- API Response Types ----

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface LoginResponse {
  user: Omit<User, 'password_hash' | 'two_factor_secret'>;
  accessToken: string;
  refreshToken: string;
  requiresTwoFactor?: boolean;
}

export interface StudentIdentification {
  student: Pick<Student, 'id' | 'enrollment_number' | 'grade' | 'balance' | 'photo_url'> & {
    user: Pick<User, 'name'>;
  };
  dailyLimit: DailyLimit | null;
  todaySpent: number;
  canPurchase: boolean;
  blockReason: string | null;
}
