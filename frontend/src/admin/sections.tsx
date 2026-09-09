import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { AdminButton, AdminCard, EmptyRow, FieldInput, HealthRow, KeyValue, SelectRow, Stat, ToggleRow, confirmAction, useAdminStyles } from "@/src/admin/ui";
import { StatusBadge, VthIcon } from "@/src/components/vth-ui";
import { money, shortDate } from "@/src/screens/common";
import { ApiError, admin, adminDelete, adminPost, adminPut } from "@/src/services/api";
import { useTheme } from "@/src/theme";

type Toast = (m: string, tone?: "success" | "error") => void;

function useLoader<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { setError(null); try { setData(await admin<T>(path)); } catch (e) { setError((e as ApiError).message); } }, [path]);
  useEffect(() => { void reload(); }, [reload, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload };
}

function Loading({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { colors } = useTheme();
  return error ? <AdminCard title="Couldn't load" subtitle={error}><AdminButton tone="secondary" label="Retry" icon="refresh" onPress={onRetry} /></AdminCard> : <ActivityIndicator color={colors.brandSecondary} style={{ marginTop: 24 }} />;
}

// ------------------------------------------------------------------ overview
type Overview = { users: { total: number; today: number }; orders: { total: number; today: number; successful: number; failed: number; pending: number; refunded: number }; revenue: { total: number; cost: number; profit: number }; wallet: { total_balance: number; recharges_total: number; recharges_count: number; refunds_total: number; refunds_count: number }; payments: { pending_review: number; awaiting: number }; services: { id: string; label: string; status: string; detail?: string }[] };

export function OverviewSection({ onNavigate }: { onNavigate: (section: string) => void }) {
  const styles = useAdminStyles();
  const { data, error, reload } = useLoader<Overview>("/overview");
  if (!data) return <Loading error={error} onRetry={reload} />;
  return <View>
    <AdminCard title="Overview" subtitle="Live store metrics" right={<AdminButton small tone="secondary" icon="refresh" label="Refresh" onPress={reload} />}>
      <View style={styles.statGrid}><Stat label="Total users" value={data.users.total} /><Stat label="Today's users" value={data.users.today} /><Stat label="Orders" value={data.orders.total} /><Stat label="Successful" value={data.orders.successful} tone="success" /><Stat label="Pending" value={data.orders.pending} tone="warning" /><Stat label="Failed / cancelled" value={data.orders.failed} tone="error" /><Stat label="Revenue" value={money(data.revenue.total)} tone="success" /><Stat label="Profit (after cost)" value={money(data.revenue.profit)} /></View>
    </AdminCard>
    <AdminCard title="Wallet & payments">
      <View style={styles.statGrid}><Stat label="Customer balances" value={money(data.wallet.total_balance)} /><Stat label="Recharges" value={`${money(data.wallet.recharges_total)} · ${data.wallet.recharges_count}`} tone="success" /><Stat label="Refunds" value={`${money(data.wallet.refunds_total)} · ${data.wallet.refunds_count}`} /><Stat label="Payments to review" value={data.payments.pending_review} tone={data.payments.pending_review ? "warning" : undefined} /></View>
      {data.payments.pending_review > 0 && <View style={styles.buttonRow}><AdminButton label="Review payments" icon="arrow" onPress={() => onNavigate("payments")} /></View>}
    </AdminCard>
    <AdminCard title="Service status" right={<AdminButton small tone="secondary" label="System health" onPress={() => onNavigate("health")} />}>{data.services.map((s) => <HealthRow key={s.id} item={s} />)}</AdminCard>
  </View>;
}

// -------------------------------------------------------------------- health
export function HealthSection({ onToast }: { onToast: Toast }) {
  const styles = useAdminStyles();
  const { data, error, reload } = useLoader<{ id: string; label: string; status: string; detail?: string }[]>("/health");
  const [busy, setBusy] = useState(false);
  const testOne = async (id: string) => { try { await adminPost(`/health/test/${id}`); await reload(); } catch (e) { onToast((e as ApiError).message, "error"); } };
  if (!data) return <Loading error={error} onRetry={reload} />;
  const groups = [["Core", ["database", "bot", "notifications"]], ["Provider services", ["provider_telegram_1", "provider_telegram_2", "provider_numbers"]], ["Payment services", ["auto-upi", "auto-crypto", "manual-upi", "manual-crypto"]]] as [string, string[]][];
  return <View>
    <AdminCard title="System health" subtitle="Results never include secrets." right={<AdminButton small icon="pulse" label="Test all" busy={busy} onPress={async () => { setBusy(true); await reload(); setBusy(false); onToast("All connections tested"); }} />}>
      <View style={styles.statGrid}>{["online", "offline", "error", "not_configured"].map((s) => <Stat key={s} label={s.replace("_", " ")} value={data.filter((d) => d.status === s).length} tone={s === "online" ? "success" : s === "error" ? "error" : s === "not_configured" ? "warning" : undefined} />)}</View>
    </AdminCard>
    {groups.map(([title, ids]) => <AdminCard key={title} title={title}>{data.filter((d) => ids.includes(d.id)).map((item) => <HealthRow key={item.id} item={item} onTest={testOne} />)}</AdminCard>)}
  </View>;
}

// ------------------------------------------------------------------- catalog
type AdminProduct = { id: string; country_name: string; flag: string; country_code: string; product_name: string; price: number; stock: number | null; visible: boolean; popular: boolean; maintenance: boolean; provider_name: string; pricing: { cost: number; price: number; markup: number; level: string; markup_type: string; markup_value: number }; override: { markup_type?: string | null; markup_value?: number | null; cost_override?: number | null } };
type AdminCategory = { id: string; title: string; description: string; platform: string; visible: boolean; maintenance: boolean; provider_name: string; provider_enabled: boolean; markup_type?: string | null; markup_value?: number | null; products: AdminProduct[]; error: string | null };

export function CatalogSection({ onToast }: { onToast: Toast }) {
  const styles = useAdminStyles();
  const { colors } = useTheme();
  const { data, error, reload } = useLoader<{ categories: AdminCategory[] }>("/catalog");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [countryCode, setCountryCode] = useState("");
  const [countryMarkup, setCountryMarkup] = useState("");
  const saveCategory = async (id: string, values: Record<string, unknown>) => { try { await adminPut(`/catalog/categories/${id}`, { values }); await reload(); onToast("Category updated"); } catch (e) { onToast((e as ApiError).message, "error"); } };
  const saveProduct = async (id: string, values: Record<string, unknown>) => { try { await adminPut(`/catalog/products/${id}`, { values }); await reload(); onToast("Product updated"); } catch (e) { onToast((e as ApiError).message, "error"); } };
  if (!data) return <Loading error={error} onRetry={reload} />;
  return <View>
    <View style={styles.warn}><VthIcon name="shield" size={14} color={colors.warning} /><Text style={styles.warnText}>Provider names shown here are internal. Customers only see {`"VTH NETWORK"`} branding and clean product names.</Text></View>
    {data.categories.map((category) => <AdminCard key={category.id} title={category.title} subtitle={`${category.platform === "telegram" ? "Telegram" : "WhatsApp"} · supplier: ${category.provider_name} (${category.provider_enabled ? "enabled" : "disabled"}) · ${category.products.length} countries`} right={<Pressable onPress={() => setOpen(open === category.id ? null : category.id)} hitSlop={8}><VthIcon name={open === category.id ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} /></Pressable>}>
      <View style={[styles.filterRow, { marginBottom: 0 }]}><AdminButton small tone="secondary" label={category.visible ? "Visible" : "Hidden"} icon={category.visible ? "eye" : "eye-off"} onPress={() => saveCategory(category.id, { visible: !category.visible })} /><AdminButton small tone={category.maintenance ? "danger" : "secondary"} label={category.maintenance ? "Maintenance ON" : "Maintenance off"} icon="wrench" onPress={() => saveCategory(category.id, { maintenance: !category.maintenance })} /><Text style={[styles.listMeta, { alignSelf: "center" }]}>Category markup: {category.markup_value != null ? `${category.markup_value}${category.markup_type === "fixed" ? " ₹" : "%"}` : "inherit"}</Text></View>
      {open === category.id && <View style={{ marginTop: 10 }}>
        <CategoryMarkupEditor category={category} onSave={(values) => saveCategory(category.id, values)} />
        {category.products.map((p) => <View key={p.id} style={styles.listRow}><View style={styles.listTitleRow}><Text style={styles.listTitle}>{p.flag} {p.country_name} · {p.product_name}</Text><Text style={styles.listTitle}>{money(p.price)}</Text></View><Text style={styles.listMeta}>Cost {money(p.pricing.cost)} → markup {money(p.pricing.markup)} ({p.pricing.level}: {p.pricing.markup_value}{p.pricing.markup_type === "fixed" ? "₹" : "%"}) · stock {p.stock ?? "hidden"}</Text><View style={[styles.filterRow, { marginBottom: 0 }]}><AdminButton small tone="secondary" label={p.visible ? "Visible" : "Hidden"} icon={p.visible ? "eye" : "eye-off"} onPress={() => saveProduct(p.id, { visible: !p.visible })} /><AdminButton small tone="secondary" label={p.popular ? "Popular ★" : "Mark popular"} onPress={() => saveProduct(p.id, { popular: !p.popular })} /><AdminButton small tone={p.maintenance ? "danger" : "secondary"} label={p.maintenance ? "Maintenance ON" : "Maintenance"} onPress={() => saveProduct(p.id, { maintenance: !p.maintenance })} /><AdminButton small tone="secondary" label="Pricing" icon="tune" onPress={() => setEditing(editing?.id === p.id ? null : p)} /></View>{editing?.id === p.id && <ProductPricingEditor product={p} onSave={(values) => { saveProduct(p.id, values); setEditing(null); }} />}</View>)}
      </View>}
    </AdminCard>)}
    <AdminCard title="Country markup" subtitle="Applies to every product of a country (overrides category & provider markup)."><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><FieldInput label="Country code" value={countryCode} onChange={setCountryCode} placeholder="IN" /></View><View style={{ flex: 1 }}><FieldInput label="Markup %" value={countryMarkup} onChange={setCountryMarkup} keyboardType="decimal-pad" placeholder="10" /></View></View><AdminButton label="Save country markup" onPress={async () => { if (!countryCode.trim()) return; try { await adminPut(`/catalog/countries/${countryCode.trim()}`, { values: { markup_type: "percent", markup_value: countryMarkup === "" ? null : Number(countryMarkup) } }); await reload(); onToast("Country markup saved"); } catch (e) { onToast((e as ApiError).message, "error"); } }} /></AdminCard>
  </View>;
}

function CategoryMarkupEditor({ category, onSave }: { category: AdminCategory; onSave: (values: Record<string, unknown>) => void }) {
  const styles = useAdminStyles();
  const [type, setType] = useState(category.markup_type ?? "percent");
  const [value, setValue] = useState(category.markup_value == null ? "" : String(category.markup_value));
  const [title, setTitle] = useState(category.title);
  const [description, setDescription] = useState(category.description);
  return <View style={[styles.card, { backgroundColor: "transparent" }]}><FieldInput label="Customer title" value={title} onChange={setTitle} /><FieldInput label="Customer description" value={description} onChange={setDescription} /><SelectRow label="Category markup type" value={type} options={["percent", "fixed"]} onChange={setType} /><FieldInput label="Category markup value (empty = inherit provider/global)" value={value} onChange={setValue} keyboardType="decimal-pad" /><AdminButton label="Save category" onPress={() => onSave({ title, description, markup_type: type, markup_value: value === "" ? null : Number(value) })} /></View>;
}

function ProductPricingEditor({ product, onSave }: { product: AdminProduct; onSave: (values: Record<string, unknown>) => void }) {
  const styles = useAdminStyles();
  const [type, setType] = useState(product.override.markup_type ?? "percent");
  const [value, setValue] = useState(product.override.markup_value == null ? "" : String(product.override.markup_value));
  const [cost, setCost] = useState(product.override.cost_override == null ? "" : String(product.override.cost_override));
  return <View style={[styles.card, { backgroundColor: "transparent", marginTop: 8 }]}><SelectRow label="Product markup type" value={type} options={["percent", "fixed"]} onChange={setType} /><FieldInput label="Product markup value (empty = inherit)" value={value} onChange={setValue} keyboardType="decimal-pad" /><FieldInput label="Cost override (empty = supplier cost)" value={cost} onChange={setCost} keyboardType="decimal-pad" help="Final customer price is always calculated server-side." /><AdminButton label="Save pricing" onPress={() => onSave({ markup_type: type, markup_value: value === "" ? null : Number(value), cost_override: cost === "" ? null : Number(cost) })} /></View>;
}

// -------------------------------------------------------------------- orders
type AdminOrder = { id: string; user_label: string; product: string; country: string; flag: string; amount: number; cost: number; status: string; payment_status: string; fulfillment_status: string; provider_key: string; created_at: string; failure_reason?: string | null; promo_code?: string | null };
const ORDER_FILTERS = ["all", "processing", "awaiting_otp", "completed", "failed", "refunded"];

export function OrdersSection({ onToast }: { onToast: Toast }) {
  const styles = useAdminStyles();
  const [filter, setFilter] = useState("all");
  const { data, error, reload } = useLoader<AdminOrder[]>(filter === "all" ? "/orders" : `/orders?status=${filter}`, [filter]);
  const act = (order: AdminOrder, status: string) => confirmAction(`Mark ${status}`, `${order.id} · ${order.product} · ${money(order.amount)}${status === "refunded" ? "\nThe customer wallet will be credited exactly once." : ""}`, async () => { try { await adminPost(`/orders/${order.id}/status`, { status, note: `Set by admin` }); await reload(); onToast(`Order ${status}`); } catch (e) { onToast((e as ApiError).message, "error"); } });
  return <View>
    <View style={styles.filterRow}>{ORDER_FILTERS.map((f) => <AdminButton key={f} small tone={filter === f ? "primary" : "secondary"} label={f.replace("_", " ")} onPress={() => setFilter(f)} />)}</View>
    {!data ? <Loading error={error} onRetry={reload} /> : <AdminCard title={`${data.length} orders`} right={<AdminButton small tone="secondary" icon="refresh" label="Refresh" onPress={reload} />}>{data.length === 0 && <EmptyRow text="No orders in this state." />}{data.map((o) => <View key={o.id} style={styles.listRow}><View style={styles.listTitleRow}><Text style={styles.listTitle}>{o.flag} {o.product} · {o.country}</Text><StatusBadge status={o.status} compact /></View><Text style={styles.listMeta}>{o.id} · {o.user_label} · {shortDate(o.created_at)}</Text><Text style={styles.listMeta}>Paid {money(o.amount)} · cost {money(o.cost)} · supplier {o.provider_key.replace("provider_", "").replace("_", " ")} · payment {o.payment_status} · fulfillment {o.fulfillment_status}{o.promo_code ? ` · promo ${o.promo_code}` : ""}</Text>{o.failure_reason ? <Text style={styles.listMeta}>Note: {o.failure_reason}</Text> : null}{["processing", "awaiting_otp", "pending", "failed"].includes(o.status) && <View style={[styles.filterRow, { marginBottom: 0 }]}>{o.status !== "failed" && <AdminButton small label="Mark completed" icon="check" onPress={() => act(o, "completed")} />}<AdminButton small tone="danger" label="Refund" icon="refresh" onPress={() => act(o, "refunded")} />{o.status !== "failed" && <AdminButton small tone="secondary" label="Mark failed" onPress={() => act(o, "failed")} />}</View>}</View>)}</AdminCard>}
  </View>;
}

// --------------------------------------------------------------------- users
type AdminUser = { id: string; telegram_id: string; first_name: string; last_name?: string; username: string; source?: string; created_at: string; last_seen?: string; balance: number; orders: number };

export function UsersSection({ onToast }: { onToast: Toast }) {
  const styles = useAdminStyles();
  const { data, error, reload } = useLoader<AdminUser[]>("/users");
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  if (!data) return <Loading error={error} onRetry={reload} />;
  const adjust = (user: AdminUser) => { const n = Number(amount); if (!n || note.trim().length < 2) { onToast("Enter amount and a note", "error"); return; } confirmAction("Adjust wallet", `${n > 0 ? "Credit" : "Debit"} ${money(Math.abs(n))} for @${user.username}?`, async () => { try { await adminPost(`/users/${user.id}/wallet`, { amount: n, note }); setAdjusting(null); setAmount(""); setNote(""); await reload(); onToast("Wallet adjusted"); } catch (e) { onToast((e as ApiError).message, "error"); } }); };
  return <AdminCard title={`${data.length} users`} right={<AdminButton small tone="secondary" icon="refresh" label="Refresh" onPress={reload} />}>{data.map((u) => <View key={u.id} style={styles.listRow}><View style={styles.listTitleRow}><Text style={styles.listTitle}>{u.first_name} {u.last_name ?? ""} · @{u.username}</Text><Text style={styles.listTitle}>{money(u.balance)}</Text></View><Text style={styles.listMeta}>Telegram ID {u.telegram_id} · {u.orders} orders · joined {shortDate(u.created_at)}{u.source === "development-fallback" ? " · dev fallback" : ""}</Text><View style={[styles.filterRow, { marginBottom: 0 }]}><AdminButton small tone="secondary" label={adjusting === u.id ? "Close" : "Adjust wallet"} icon="wallet" onPress={() => setAdjusting(adjusting === u.id ? null : u.id)} /></View>{adjusting === u.id && <View style={{ marginTop: 6 }}><FieldInput label="Amount (negative to debit)" value={amount} onChange={setAmount} keyboardType="decimal-pad" placeholder="100" /><FieldInput label="Reason (audited)" value={note} onChange={setNote} placeholder="Manual correction" /><AdminButton label="Apply adjustment" onPress={() => adjust(u)} /></View>}</View>)}</AdminCard>;
}

// ------------------------------------------------------------------ payments
type AdminPayment = { id: string; user_label: string; method: string; amount: number; status: string; credited: boolean; reference?: string | null; received_amount?: number | null; created_at: string; verified_by?: string; verification_note?: string };
const PAYMENT_FILTERS = ["submitted", "awaiting_verification", "credited", "rejected", "all"];

export function PaymentsSection({ onToast }: { onToast: Toast }) {
  const styles = useAdminStyles();
  const [filter, setFilter] = useState("submitted");
  const { data, error, reload } = useLoader<AdminPayment[]>(filter === "all" ? "/payments" : `/payments?status=${filter}`, [filter]);
  const [received, setReceived] = useState<Record<string, string>>({});
  const approve = (p: AdminPayment) => { const amt = received[p.id] ? Number(received[p.id]) : p.amount; confirmAction("Approve & credit wallet", `${p.id} · credit ${money(Math.min(amt, p.amount))} to ${p.user_label}. This is idempotent — repeated approvals never double-credit.`, async () => { try { const r = await adminPost<{ duplicate: boolean; message: string }>(`/payments/${p.id}/approve`, { received_amount: amt, note: "Manually verified" }); await reload(); onToast(r.duplicate ? "Already credited — no duplicate credit" : "Wallet credited"); } catch (e) { onToast((e as ApiError).message, "error"); } }); };
  const reject = (p: AdminPayment) => confirmAction("Reject payment", `${p.id} will be marked rejected.`, async () => { try { await adminPost(`/payments/${p.id}/reject`, { note: "Could not verify" }); await reload(); onToast("Payment rejected"); } catch (e) { onToast((e as ApiError).message, "error"); } });
  return <View>
    <View style={styles.filterRow}>{PAYMENT_FILTERS.map((f) => <AdminButton key={f} small tone={filter === f ? "primary" : "secondary"} label={f.replace("_", " ")} onPress={() => setFilter(f)} />)}</View>
    {!data ? <Loading error={error} onRetry={reload} /> : <AdminCard title={`${data.length} payments`} subtitle="Wallet credits happen only here or via verified gateway callbacks." right={<AdminButton small tone="secondary" icon="refresh" label="Refresh" onPress={reload} />}>{data.length === 0 && <EmptyRow text="Nothing to review." />}{data.map((p) => <View key={p.id} style={styles.listRow}><View style={styles.listTitleRow}><Text style={styles.listTitle}>{money(p.amount)} · {p.method}</Text><StatusBadge status={p.status} compact /></View><Text style={styles.listMeta}>{p.id} · {p.user_label} · {shortDate(p.created_at)}{p.reference ? ` · ref ${p.reference}` : ""}{p.credited ? ` · credited ${money(p.received_amount ?? p.amount)} by ${p.verified_by}` : ""}</Text>{!p.credited && !["rejected", "expired"].includes(p.status) && <View style={{ marginTop: 6 }}><FieldInput label="Received amount (verify against your bank/wallet)" value={received[p.id] ?? String(p.amount)} onChange={(v) => setReceived((r) => ({ ...r, [p.id]: v }))} keyboardType="decimal-pad" /><View style={[styles.filterRow, { marginBottom: 0 }]}><AdminButton small label="Approve & credit" icon="check" onPress={() => approve(p)} /><AdminButton small tone="danger" label="Reject" onPress={() => reject(p)} /></View></View>}</View>)}</AdminCard>}
  </View>;
}

// --------------------------------------------------------------------- promo
type Promo = { code: string; type: string; value: number; min_order: number; max_discount: number; usage_limit: number; per_user_limit: number; expires_at?: string | null; enabled: boolean; used: number };

export function PromoSection({ onToast }: { onToast: Toast }) {
  const styles = useAdminStyles();
  const { data, error, reload } = useLoader<Promo[]>("/promo");
  const [form, setForm] = useState({ code: "", type: "percent", value: "10", min_order: "0", max_discount: "0", usage_limit: "0", per_user_limit: "1", expires_at: "", enabled: true });
  const save = async () => { if (form.code.trim().length < 2 || !Number(form.value)) { onToast("Code and value required", "error"); return; } try { await adminPost("/promo", { ...form, value: Number(form.value), min_order: Number(form.min_order), max_discount: Number(form.max_discount), usage_limit: Number(form.usage_limit), per_user_limit: Number(form.per_user_limit), expires_at: form.expires_at || null }); setForm((f) => ({ ...f, code: "" })); await reload(); onToast("Promo saved"); } catch (e) { onToast((e as ApiError).message, "error"); } };
  const remove = (code: string) => confirmAction("Delete promo", `${code} will stop working immediately.`, async () => { try { await adminDelete(`/promo/${code}`); await reload(); onToast("Promo deleted"); } catch (e) { onToast((e as ApiError).message, "error"); } });
  return <View>
    <AdminCard title="Create promo code" subtitle="Validated server-side at checkout."><FieldInput testID="promo-code" label="Code" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))} placeholder="VTH10" /><SelectRow label="Type" value={form.type} options={["percent", "fixed"]} onChange={(v) => setForm((f) => ({ ...f, type: v }))} /><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><FieldInput label="Value" value={form.value} onChange={(v) => setForm((f) => ({ ...f, value: v }))} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><FieldInput label="Min order ₹" value={form.min_order} onChange={(v) => setForm((f) => ({ ...f, min_order: v }))} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><FieldInput label="Max discount ₹" value={form.max_discount} onChange={(v) => setForm((f) => ({ ...f, max_discount: v }))} keyboardType="decimal-pad" /></View></View><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><FieldInput label="Usage limit (0 = ∞)" value={form.usage_limit} onChange={(v) => setForm((f) => ({ ...f, usage_limit: v }))} keyboardType="numeric" /></View><View style={{ flex: 1 }}><FieldInput label="Per-user limit" value={form.per_user_limit} onChange={(v) => setForm((f) => ({ ...f, per_user_limit: v }))} keyboardType="numeric" /></View></View><FieldInput label="Expiry (ISO, optional)" value={form.expires_at} onChange={(v) => setForm((f) => ({ ...f, expires_at: v }))} placeholder="2026-12-31T23:59:59Z" /><ToggleRow label="Enabled" value={form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} /><AdminButton testID="promo-save" label="Save promo" icon="ticket" onPress={save} /></AdminCard>
    {!data ? <Loading error={error} onRetry={reload} /> : <AdminCard title={`${data.length} promo codes`}>{data.length === 0 && <EmptyRow text="No promo codes yet." />}{data.map((p) => <View key={p.code} style={styles.listRow}><View style={styles.listTitleRow}><Text style={styles.listTitle}>{p.code} · {p.type === "percent" ? `${p.value}%` : money(p.value)}</Text><StatusBadge status={p.enabled ? "online" : "offline"} compact /></View><Text style={styles.listMeta}>Used {p.used}{p.usage_limit ? `/${p.usage_limit}` : ""} · per user {p.per_user_limit} · min {money(p.min_order)}{p.max_discount ? ` · max ${money(p.max_discount)}` : ""}{p.expires_at ? ` · expires ${shortDate(p.expires_at)}` : ""}</Text><View style={[styles.filterRow, { marginBottom: 0 }]}><AdminButton small tone="danger" icon="trash" label="Delete" onPress={() => remove(p.code)} /></View></View>)}</AdminCard>}
  </View>;
}

// ---------------------------------------------------------------------- logs
type AuditLog = { id: string; action: string; actor: string; detail: Record<string, unknown>; created_at: string };
type NotificationLog = { id: string; event: string; destination: string; status: string; text: string; detail?: string; created_at: string };

export function LogsSection({ onToast }: { onToast: Toast }) {
  const styles = useAdminStyles();
  const [tab, setTab] = useState<"audit" | "notifications">("audit");
  const audit = useLoader<AuditLog[]>("/logs/audit");
  const notifications = useLoader<NotificationLog[]>("/logs/notifications");
  return <View>
    <View style={styles.filterRow}><AdminButton small tone={tab === "audit" ? "primary" : "secondary"} label="Admin audit" onPress={() => setTab("audit")} /><AdminButton small tone={tab === "notifications" ? "primary" : "secondary"} label="Telegram logs" onPress={() => setTab("notifications")} /><AdminButton small tone="secondary" icon="bolt" label="Send test" onPress={async () => { try { await adminPost("/logs/test"); setTimeout(() => notifications.reload(), 800); onToast("Test notification queued"); } catch (e) { onToast((e as ApiError).message, "error"); } }} /></View>
    {tab === "audit" ? (!audit.data ? <Loading error={audit.error} onRetry={audit.reload} /> : <AdminCard title="Admin actions history" subtitle="Who did what, when. Secrets are never logged." right={<AdminButton small tone="secondary" icon="refresh" label="Refresh" onPress={audit.reload} />}>{audit.data.map((l) => <View key={l.id} style={styles.listRow}><View style={styles.listTitleRow}><Text style={styles.listTitle}>{l.action.replace(/_/g, " ")}</Text><Text style={styles.listMeta}>{shortDate(l.created_at)}</Text></View><Text style={styles.listMeta}>{l.actor} · {JSON.stringify(l.detail)}</Text></View>)}</AdminCard>)
      : (!notifications.data ? <Loading error={notifications.error} onRetry={notifications.reload} /> : <AdminCard title="Notification deliveries" subtitle="Owner / admin / public destinations. Sanitized before sending." right={<AdminButton small tone="secondary" icon="refresh" label="Refresh" onPress={notifications.reload} />}>{notifications.data.length === 0 && <EmptyRow text="No notifications yet." />}{notifications.data.map((n) => <View key={n.id} style={styles.listRow}><View style={styles.listTitleRow}><Text style={styles.listTitle}>{n.event.replace(/_/g, " ")} → {n.destination}</Text><StatusBadge status={n.status === "sent" ? "completed" : n.status === "failed" ? "failed" : "not_configured"} compact /></View><Text style={styles.listMeta}>{n.text}</Text><Text style={styles.listMeta}>{shortDate(n.created_at)}{n.detail ? ` · ${n.detail}` : ""}</Text></View>)}</AdminCard>)}
  </View>;
}

// ------------------------------------------------------------------ security
export function SecuritySection({ onLogout }: { onLogout: () => void }) {
  const { data, error, reload } = useLoader<{ username: string; role: string; expires_at: number; last_login?: { created_at: string; method: string; ip?: string } | null }>("/auth/me");
  if (!data) return <Loading error={error} onRetry={reload} />;
  return <View>
    <AdminCard title="Session" subtitle="Server-side sessions; tokens are revocable and expire automatically."><KeyValue label="Signed in as" value={`${data.username} (${data.role})`} /><KeyValue label="Session expires" value={new Date(data.expires_at * 1000).toLocaleString("en-IN")} /><KeyValue label="Previous login" value={data.last_login ? `${shortDate(data.last_login.created_at)} · ${data.last_login.method}${data.last_login.ip ? ` · ${data.last_login.ip}` : ""}` : "First login"} /><View style={{ marginTop: 12 }}><AdminButton testID="admin-signout" tone="danger" icon="logout" label="Sign out" onPress={() => confirmAction("Sign out", "Your admin session will be revoked on the server.", onLogout)} /></View></AdminCard>
    <AdminCard title="Access model"><KeyValue label="Roles" value="Owner/Admin · Customer" /><KeyValue label="Admin route" value="Server-verified JWT + session record" /><KeyValue label="Password" value="bcrypt hash in backend environment" /><KeyValue label="Telegram owner login" value="Enabled once bot token + owner ID are configured" /><KeyValue label="Secrets" value="Encrypted at rest, masked in UI, never in customer APIs" /></AdminCard>
  </View>;
}

// ------------------------------------------------------------------- servers
type Server = { id: string; product_id: string; name: string; provider_key: string; provider_cost: number; customer_price: number; enabled: boolean; priority: number; maintenance_message: string };

export function ServersSection({ onToast }: { onToast: Toast }) {
  const styles = useAdminStyles();
  const { colors } = useTheme();
  const { data, error, reload } = useLoader<Server[]>("/servers");
  const [form, setForm] = useState({ product_id: "number-change-us", name: "", provider_key: "provider_numbers", provider_cost: "", customer_price: "", priority: "1", maintenance_message: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ customer_price: "", provider_cost: "", maintenance_message: "" });
  const save = async (id: string, values: Record<string, unknown>, label: string) => { try { await adminPut(`/servers/${id}`, { values }); await reload(); onToast(label); } catch (e) { onToast((e as ApiError).message, "error"); } };
  const create = async () => { if (!form.name.trim() || !form.customer_price) { onToast("Name and customer price required", "error"); return; } try { await adminPost("/servers", { values: { ...form, provider_cost: Number(form.provider_cost || 0), customer_price: Number(form.customer_price), priority: Number(form.priority || 1) } }); setForm((f) => ({ ...f, name: "", provider_cost: "", customer_price: "" })); await reload(); onToast("Server added"); } catch (e) { onToast((e as ApiError).message, "error"); } };
  const remove = (s: Server) => confirmAction("Delete server", `${s.product_id} → ${s.name} will be removed.`, async () => { try { await adminDelete(`/servers/${s.id}`); await reload(); onToast("Server deleted"); } catch (e) { onToast((e as ApiError).message, "error"); } });
  if (!data) return <Loading error={error} onRetry={reload} />;
  const grouped = data.reduce<Record<string, Server[]>>((acc, s) => { (acc[s.product_id] ??= []).push(s); return acc; }, {});
  return <View>
    <View style={styles.warn}><VthIcon name="server" size={14} color={colors.warning} /><Text style={styles.warnText}>Country → Service → Operator/Server → Provider cost → Customer price. Disabled servers never receive purchase requests; customers see &quot;Currently unavailable&quot;.</Text></View>
    {Object.entries(grouped).map(([productId, list]) => <AdminCard key={productId} title={productId.replace("number-change-", "Telegram Number Change · ").replace("whatsapp-", "WhatsApp · ").toUpperCase()} subtitle={`${list.length} operator(s)`}>{list.map((s) => <View key={s.id} style={styles.listRow}><View style={styles.listTitleRow}><Text style={styles.listTitle}>{s.enabled ? "🟢" : "🔴"} {s.name}</Text><Text style={styles.listTitle}>{money(s.customer_price)}</Text></View><Text style={styles.listMeta}>Provider cost ₹{Number(s.provider_cost).toFixed(4)} · margin {money(s.customer_price - s.provider_cost)} · priority {s.priority} · supplier {s.provider_key.replace("provider_", "")}{s.maintenance_message ? ` · msg: ${s.maintenance_message}` : ""}</Text><View style={[styles.filterRow, { marginBottom: 0 }]}><AdminButton small testID={`server-toggle-${s.id}`} tone={s.enabled ? "danger" : "primary"} label={s.enabled ? "Disable" : "Enable"} onPress={() => confirmAction(s.enabled ? "Disable server" : "Enable server", `${s.product_id} → ${s.name}`, () => save(s.id, { enabled: !s.enabled }, s.enabled ? "Server disabled" : "Server enabled"))} /><AdminButton small tone="secondary" label="Edit" icon="tune" onPress={() => { setEditing(editing === s.id ? null : s.id); setEdit({ customer_price: String(s.customer_price), provider_cost: String(s.provider_cost), maintenance_message: s.maintenance_message ?? "" }); }} /><AdminButton small tone="secondary" icon="trash" label="Delete" onPress={() => remove(s)} /></View>{editing === s.id && <View style={{ marginTop: 6 }}><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><FieldInput label="Provider cost ₹" value={edit.provider_cost} onChange={(v) => setEdit((e) => ({ ...e, provider_cost: v }))} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><FieldInput label="Customer price ₹" value={edit.customer_price} onChange={(v) => setEdit((e) => ({ ...e, customer_price: v }))} keyboardType="decimal-pad" /></View></View><FieldInput label="Maintenance message (shown when disabled)" value={edit.maintenance_message} onChange={(v) => setEdit((e) => ({ ...e, maintenance_message: v }))} /><AdminButton label="Save server" onPress={() => { save(s.id, { customer_price: Number(edit.customer_price), provider_cost: Number(edit.provider_cost), maintenance_message: edit.maintenance_message }, "Server updated"); setEditing(null); }} /></View>}</View>)}</AdminCard>)}
    <AdminCard title="Add operator / server" subtitle="Product ID = category-countrycode, e.g. number-change-uk, whatsapp-vn"><FieldInput label="Product ID" value={form.product_id} onChange={(v) => setForm((f) => ({ ...f, product_id: v }))} placeholder="number-change-us" /><FieldInput label="Operator / server name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Operator 1" /><SelectRow label="Supplier (internal)" value={form.provider_key} options={["provider_numbers", "provider_telegram_1", "provider_telegram_2"]} onChange={(v) => setForm((f) => ({ ...f, provider_key: v }))} /><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><FieldInput label="Provider cost ₹" value={form.provider_cost} onChange={(v) => setForm((f) => ({ ...f, provider_cost: v }))} keyboardType="decimal-pad" placeholder="49.6283" /></View><View style={{ flex: 1 }}><FieldInput label="Customer price ₹" value={form.customer_price} onChange={(v) => setForm((f) => ({ ...f, customer_price: v }))} keyboardType="decimal-pad" placeholder="79" /></View><View style={{ flex: 1 }}><FieldInput label="Priority" value={form.priority} onChange={(v) => setForm((f) => ({ ...f, priority: v }))} keyboardType="numeric" /></View></View><AdminButton testID="server-create" label="Add server" icon="plus" onPress={create} /></AdminCard>
  </View>;
}

// ---------------------------------------------------------------- broadcasts
type Broadcast = { id: string; title: string; message: string; type: string; button_label?: string; button_link?: string; start_at?: string; end_at?: string; show_home: boolean; show_notifications: boolean; enabled: boolean; active: boolean; created_at: string; telegram_status?: string; telegram_sent?: number };

export function BroadcastsSection({ onToast }: { onToast: Toast }) {
  const styles = useAdminStyles();
  const { data, error, reload } = useLoader<Broadcast[]>("/broadcasts");
  const [form, setForm] = useState({ title: "", message: "", type: "info", button_label: "", button_link: "", start_at: "", end_at: "", show_home: true, show_notifications: true, enabled: true });
  const expiryPreset = (hours: number) => setForm((f) => ({ ...f, end_at: new Date(Date.now() + hours * 3600000).toISOString() }));
  const create = async () => { if (!form.title.trim() || !form.message.trim()) { onToast("Title and message required", "error"); return; } try { await adminPost("/broadcasts", { values: form }); setForm((f) => ({ ...f, title: "", message: "", end_at: "" })); await reload(); onToast("Broadcast published"); } catch (e) { onToast((e as ApiError).message, "error"); } };
  const remove = (b: Broadcast) => confirmAction("Delete broadcast", b.title, async () => { try { await adminDelete(`/broadcasts/${b.id}`); await reload(); onToast("Broadcast deleted"); } catch (e) { onToast((e as ApiError).message, "error"); } });
  const sendTelegram = async (b: Broadcast) => { try { const result = await adminPost<{ status: string; sent: number; attempted?: number; remaining?: number }>(`/broadcasts/${b.id}/send-telegram`, {}); await reload(); onToast(result.remaining ? `Sent ${result.sent}; ${result.remaining} remaining` : `Telegram broadcast complete: ${result.sent} sent`); } catch (e) { onToast((e as ApiError).message, "error"); } };
  return <View>
    <AdminCard title="New broadcast" subtitle="Shown as a Live Update on Home and/or in the notification bell. Expired items hide automatically."><FieldInput testID="broadcast-title" label="Title" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="New inventory available" /><FieldInput testID="broadcast-message" label="Message" value={form.message} onChange={(v) => setForm((f) => ({ ...f, message: v }))} multiline /><SelectRow label="Type" value={form.type} options={["info", "update", "warning", "maintenance", "promotion"]} onChange={(v) => setForm((f) => ({ ...f, type: v }))} /><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><FieldInput label="Button label" value={form.button_label} onChange={(v) => setForm((f) => ({ ...f, button_label: v }))} /></View><View style={{ flex: 1 }}><FieldInput label="Button URL" value={form.button_link} onChange={(v) => setForm((f) => ({ ...f, button_link: v }))} placeholder="https://" /></View></View><Text style={styles.fieldLabel}>Expiry</Text><View style={styles.filterRow}>{[["1h", 1], ["6h", 6], ["12h", 12], ["24h", 24], ["3d", 72]].map(([l, h]) => <AdminButton key={String(l)} small tone="secondary" label={String(l)} onPress={() => expiryPreset(Number(h))} />)}<AdminButton small tone="secondary" label="No expiry" onPress={() => setForm((f) => ({ ...f, end_at: "" }))} /></View><FieldInput label="Custom end (ISO)" value={form.end_at} onChange={(v) => setForm((f) => ({ ...f, end_at: v }))} placeholder="2026-12-31T23:59:59Z" /><ToggleRow label="Show on Home (Live Update)" value={form.show_home} onChange={(v) => setForm((f) => ({ ...f, show_home: v }))} /><ToggleRow label="Show in notification bell" value={form.show_notifications} onChange={(v) => setForm((f) => ({ ...f, show_notifications: v }))} /><AdminButton testID="broadcast-publish" label="Publish broadcast" icon="megaphone" onPress={create} /></AdminCard>
    {!data ? <Loading error={error} onRetry={reload} /> : <AdminCard title={`${data.length} broadcasts`}>{data.length === 0 && <EmptyRow text="No broadcasts yet." />}{data.map((b) => <View key={b.id} style={styles.listRow}><View style={styles.listTitleRow}><Text style={styles.listTitle}>{b.title}</Text><StatusBadge status={b.active ? "online" : "expired"} compact /></View><Text style={styles.listMeta}>{b.message}</Text><Text style={styles.listMeta}>{b.type} · {shortDate(b.created_at)}{b.end_at ? ` · until ${shortDate(b.end_at)}` : ""} · {b.show_home ? "home" : ""} {b.show_notifications ? "bell" : ""}</Text><View style={[styles.filterRow, { marginBottom: 0 }]}><AdminButton small tone="secondary" icon="megaphone" label={b.telegram_status === "completed" ? "Sent" : "Send Telegram"} onPress={() => sendTelegram(b)} /><AdminButton small tone="danger" icon="trash" label="Delete" onPress={() => remove(b)} /></View></View>)}</AdminCard>}
  </View>;
}
