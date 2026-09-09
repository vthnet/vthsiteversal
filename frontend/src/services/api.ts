import Constants from "expo-constants";

import { Category, LiveUpdate, NotificationItem, Order, Payment, PaymentMethod, Product, PublicSettings, PurchasePreview, PurchaseResult, ServerOption, UserProfile, Wallet, WalletTransaction } from "@/src/models";
import { telegram } from "@/src/telegram";
import { storage } from "@/src/utils/storage";

const baseUrl = String(Constants.expoConfig?.extra?.backendUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
const CUSTOMER_TOKEN_KEY = "vth-customer-token";
const ADMIN_TOKEN_KEY = "vth-admin-token";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let customerToken: string | null = null;
let adminToken: string | null = null;

async function request<T>(path: string, init: RequestInit = {}, token?: string | null, timeoutMs = 8000): Promise<T> {

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = baseUrl ? `${baseUrl}/api${path}` : `/api${path}`;
    const response = await fetch(endpoint, { ...init, signal: controller.signal, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
    const text = await response.text();
    let data: any = {};
    if (text) { try { data = JSON.parse(text); } catch { data = { detail: text.slice(0, 300) }; } }
    if (!response.ok) throw new ApiError(response.status, typeof data?.detail === "string" ? data.detail : `Request failed (${response.status})`);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, (error as Error)?.name === "AbortError" ? "Request timed out" : "Network unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------- customer auth
export async function ensureCustomerSession(): Promise<{ user: UserProfile; verified: boolean }> {
  customerToken = await storage.secureGet<string | null>(CUSTOMER_TOKEN_KEY, null);
  if (customerToken) {
    try {
      const user = await request<UserProfile>("/profile", {}, customerToken);
      return { user, verified: user.source === "telegram" };
    } catch (error) {
      if ((error as ApiError).status !== 401) throw error;
    }
  }
  const result = await request<{ token: string; user: UserProfile; verified: boolean }>("/auth/telegram", { method: "POST", body: JSON.stringify({ init_data: telegram.getInitData() || null }) });
  customerToken = result.token;
  await storage.secureSet(CUSTOMER_TOKEN_KEY, result.token);
  return { user: result.user, verified: result.verified };
}

const customer = <T,>(path: string, init?: RequestInit) => request<T>(path, init, customerToken);

// ------------------------------------------------------------------- public
export async function getPublicSettings(): Promise<PublicSettings> { return request<PublicSettings>("/settings/public"); }

export async function getCategories(): Promise<Category[]> { return request<Category[]>("/catalog/categories"); }

export const getProducts = (categoryId: string, refresh = false) => request<{ products: Product[]; error: string | null; source: string }>(`/catalog/categories/${categoryId}${refresh ? "?refresh=true" : ""}`);
export const getRecentProducts = () => customer<Product[]>("/catalog/recent");
export const markProductViewed = (productId: string) => customer<{ status: string }>(`/catalog/products/${productId}/viewed`, { method: "POST" }).catch(() => undefined);
export const getWallet = () => customer<Wallet>("/wallet");
export const getTransactions = () => customer<WalletTransaction[]>("/wallet/transactions");
export const getOrders = () => customer<Order[]>("/orders");
export const getOrder = (orderId: string) => customer<Order>(`/orders/${orderId}`);
export const cancelOrder = (orderId: string) => customer<{ status: string; message: string }>(`/orders/${orderId}/cancel`, { method: "POST" });
export const getPaymentMethods = () => request<PaymentMethod[]>("/payments/methods");
export const getPayments = () => customer<Payment[]>("/payments");
export const createPayment = (method: string, amount: number) => customer<Payment>("/payments", { method: "POST", body: JSON.stringify({ method, amount }) });
export const verifyPayment = (paymentId: string) => customer<Payment>(`/payments/${paymentId}/verify`, { method: "POST" });
export const submitPaymentReference = (paymentId: string, reference: string) => customer<Payment>(`/payments/${paymentId}/submit`, { method: "POST", body: JSON.stringify({ reference }) });
export const getPurchasePreview = (productId: string, promoCode?: string, serverId?: string) => customer<PurchasePreview>("/purchases/preview", { method: "POST", body: JSON.stringify({ product_id: productId, promo_code: promoCode || null, server_id: serverId || null }) });
export const createPurchase = (productId: string, promoCode?: string, serverId?: string) => customer<PurchaseResult>("/purchases", { method: "POST", body: JSON.stringify({ product_id: productId, promo_code: promoCode || null, server_id: serverId || null }) });
export const getServers = (productId: string) => request<ServerOption[]>(`/catalog/products/${productId}/servers`);
export const getNotifications = () => customer<{ items: NotificationItem[]; unread: number }>("/notifications");
export const markNotificationsRead = (ids: string[]) => customer<{ status: string }>("/notifications/read", { method: "POST", body: JSON.stringify({ ids }) });
export const getLiveUpdates = () => request<LiveUpdate[]>("/live-updates").catch(() => [] as LiveUpdate[]);
export const validatePromo = (code: string, amount: number) => customer<{ code: string; discount: number; final_amount: number }>("/promo/validate", { method: "POST", body: JSON.stringify({ code, amount }) });

// -------------------------------------------------------------------- admin
export async function loadAdminToken(): Promise<string | null> {
  adminToken = await storage.secureGet<string | null>(ADMIN_TOKEN_KEY, null);
  return adminToken;
}

export async function adminLogin(username: string, password: string) {
  const result = await request<{ access_token: string; username: string; expires_in: number }>("/admin/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
  adminToken = result.access_token;
  await storage.secureSet(ADMIN_TOKEN_KEY, result.access_token);
  return result;
}

export async function adminTelegramLogin() {
  const result = await request<{ access_token: string; username: string }>("/admin/auth/telegram", { method: "POST", body: JSON.stringify({ init_data: telegram.getInitData() }) });
  adminToken = result.access_token;
  await storage.secureSet(ADMIN_TOKEN_KEY, result.access_token);
  return result;
}

export async function adminLogout() {
  try { await request("/admin/auth/logout", { method: "POST" }, adminToken); } catch { /* session may already be gone */ }
  adminToken = null;
  await storage.secureRemove(ADMIN_TOKEN_KEY);
}

export async function admin<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await request<T>(`/admin${path}`, init, adminToken, 15000);
  } catch (error) {
    if ((error as ApiError).status === 401) {
      adminToken = null;
      await storage.secureRemove(ADMIN_TOKEN_KEY);
    }
    throw error;
  }
}

export const adminPut = <T,>(path: string, body: unknown) => admin<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const adminPost = <T,>(path: string, body: unknown = {}) => admin<T>(path, { method: "POST", body: JSON.stringify(body) });
export const adminDelete = <T,>(path: string) => admin<T>(path, { method: "DELETE" });
