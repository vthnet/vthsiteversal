export type Screen = "home" | "orders" | "wallet" | "profile";
export type ProductCategory = "tg-good" | "tg-cheap" | "number-change" | "whatsapp";
export type Platform = "telegram" | "whatsapp";

export interface Category {
  id: ProductCategory;
  title: string;
  short_title: string;
  description: string;
  platform: Platform;
  badge: string;
  icon: string;
  accent: string;
  product_type: "account" | "number";
  visible?: boolean;
  maintenance?: boolean;
}

export interface Product {
  id: string;
  category_id: ProductCategory;
  country_code: string;
  country_name: string;
  flag: string;
  product_name: string;
  platform: Platform;
  product_type: "account" | "number";
  price: number;
  currency: string;
  stock: number | null;
  stock_label: string;
  available: boolean;
  maintenance: boolean;
  popular: boolean;
  details: string[];
}

export type OrderStatus = "pending" | "processing" | "awaiting_otp" | "completed" | "cancelled" | "refunded" | "failed";

export interface Order {
  id: string;
  product_id: string;
  product: string;
  country: string;
  flag: string;
  platform: Platform;
  product_type: "account" | "number";
  amount: number;
  discount?: number;
  promo_code?: string | null;
  status: OrderStatus;
  payment_status: string;
  fulfillment_status: string;
  created_at: string;
  updated_at?: string;
  expires_at?: string | null;
  failure_reason?: string | null;
  delivery_masked?: string | null;
  delivery?: unknown;
}

export interface UserProfile {
  id: string;
  telegram_id: string;
  first_name: string;
  last_name?: string | null;
  username: string;
  language: string;
  avatar_url?: string | null;
  source?: string;
}

export interface WalletTransaction {
  id: string;
  type: "purchase" | "recharge" | "refund" | "adjustment";
  amount: number;
  status: string;
  reference: string;
  note?: string;
  created_at: string;
}

export interface Wallet {
  user_id: string;
  balance: number;
  currency: string;
}

export interface PaymentMethod {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  tone: string;
  kind: "auto" | "manual";
  enabled: boolean;
  maintenance: boolean;
  min_amount: number;
  max_amount: number;
  mode: "live" | "manual" | "unavailable" | "error";
}

export interface PaymentInstructions {
  type: string;
  mode: string;
  note?: string;
  upi_id?: string;
  qr_payload?: string;
  qr_image_url?: string;
  qr_url?: string;
  invoice_url?: string;
  instructions?: string;
  coins?: string;
  network?: string;
  wallet_addresses?: string[];
  requires?: "utr" | "tx_hash";
}

export interface Payment {
  id: string;
  method: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at?: string;
  expires_at?: string | null;
  instructions: PaymentInstructions;
  reference?: string | null;
  credited: boolean;
  message: string;
}

export interface PublicSettings {
  branding: {
    store_name: string;
    tagline: string;
    logo_url: string;
    owner_name: string;
    owner_photo_url: string;
    owner_telegram_username: string;
    support_username: string;
    support_link: string;
    support_channel: string;
    community_link: string;
    about_text: string;
    footer_text: string;
  };
  announcement: { message: string; button_label: string; button_link: string; active: boolean };
  store: {
    maintenance_mode: boolean;
    maintenance_message: string;
    currency: string;
    min_recharge: number;
    max_recharge: number;
    otp_timer_minutes: number;
    feature_promo: boolean;
    feature_wallet: boolean;
    feature_orders: boolean;
    feature_recent_countries: boolean;
  };
  currency: { default: string; supported: string[]; usd_rate: number; show_selector: boolean };
  content: Record<string, string>;
  payment_methods: { id: string; enabled: boolean; maintenance: boolean; min_amount: number; max_amount: number }[];
}

export interface ServerOption {
  id: string;
  name: string;
  price: number;
  enabled: boolean;
  status: "available" | "unavailable";
  message: string;
}

export interface NotificationItem {
  id: string;
  kind: "broadcast" | "order" | "wallet";
  type: string;
  title: string;
  message: string;
  button_label?: string | null;
  button_link?: string | null;
  created_at: string;
  read: boolean;
}

export interface LiveUpdate {
  id: string;
  title: string;
  message: string;
  type: string;
  button_label?: string;
  button_link?: string;
  created_at: string;
}

export interface PurchasePreview {
  server?: { id: string; name: string } | null;
  price: number;
  discount: number;
  final_amount: number;
  wallet_balance: number;
  balance_after: number;
  can_purchase: boolean;
  status: "ready" | "insufficient_balance" | "out_of_stock" | "maintenance";
}

export interface PurchaseResult {
  status: "created" | "insufficient_balance" | "out_of_stock" | "maintenance" | "failed_refunded";
  order_id?: string;
  message?: string;
  order?: Order;
}
