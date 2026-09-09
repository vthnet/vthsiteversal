import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Footer, GlassCard, OrderCard, PlatformLogo, StateBlock, StatusBadge, TopBar, VthIcon } from "@/src/components/vth-ui";
import { Order, PublicSettings } from "@/src/models";
import { money, shortDate, useCommonStyles } from "@/src/screens/common";
import { makeStyles, useTheme } from "@/src/theme";

type OrderFilter = "all" | "active" | "completed" | "refunded";
const FILTERS: { id: OrderFilter; label: string }[] = [{ id: "all", label: "All" }, { id: "active", label: "Active" }, { id: "completed", label: "Completed" }, { id: "refunded", label: "Refunded" }];
const ACTIVE = new Set(["pending", "processing", "awaiting_otp"]);

export function OrdersScreen({ orders, loading, settings, onRefresh, onSelect, onSupport }: { orders: Order[]; loading: boolean; settings: PublicSettings; onRefresh: () => Promise<void>; onSelect: (order: Order) => void; onSupport: () => void }) {
  const insets = useSafeAreaInsets();
  const common = useCommonStyles();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const visible = orders.filter((o) => filter === "all" || (filter === "active" ? ACTIVE.has(o.status) : filter === "refunded" ? o.status === "refunded" || o.status === "cancelled" || o.status === "failed" : o.status === "completed"));
  const refresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };
  return (
    <ScrollView testID="vth-orders-screen" showsVerticalScrollIndicator={false} contentContainerStyle={[common.scrollContent, { paddingBottom: insets.bottom + 100 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brandSecondary} />}>
      <TopBar title="Orders" subtitle="Your purchase activity" right={<View style={common.headerIcon}><VthIcon name="receipt" color={colors.brandSecondary} /></View>} />
      <View><Text style={common.eyebrow}>ORDER HISTORY</Text><Text style={common.pageTitle}>Keep everything in view.</Text><Text style={common.pageSubtitle}>Track payment and delivery status for every order.</Text></View>
      <View style={common.chipRow}>{FILTERS.map((item) => <Pressable key={item.id} testID={`orders-filter-${item.id}`} onPress={() => setFilter(item.id)} style={[common.chip, filter === item.id && common.chipActive]}><Text style={[common.chipText, filter === item.id && common.chipTextActive]}>{item.label}</Text></Pressable>)}</View>
      {loading ? <ActivityIndicator color={colors.brandSecondary} /> : visible.length ? visible.map((order) => <OrderCard key={order.id} order={order} onPress={() => onSelect(order)} />) : <StateBlock icon="orders" title="No orders here yet" description={filter === "all" ? "Explore the store to make your first purchase." : "Nothing matches this filter."} />}
      <Footer text={settings.branding.footer_text} storeName={settings.branding.store_name} onSupport={onSupport} />
    </ScrollView>
  );
}

export function OrderDetail({ order, settings, onBack, onCopy, onCancel, onRefresh, onSupport }: { order: Order; settings: PublicSettings; onBack: () => void; onCopy: (value: string) => void; onCancel: (order: Order) => Promise<void>; onRefresh: () => Promise<void>; onSupport: () => void }) {
  const insets = useSafeAreaInsets();
  const common = useCommonStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const isOtp = order.status === "awaiting_otp";
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor(((order.expires_at ? new Date(order.expires_at).getTime() : Date.now()) - Date.now()) / 1000)));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!isOtp) return; const timer = setInterval(() => setSeconds((v) => Math.max(0, v - 1)), 1000); return () => clearInterval(timer); }, [isOtp]);
  useEffect(() => { if (isOtp && seconds === 0) void onRefresh(); }, [isOtp, seconds, onRefresh]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0"), ss = String(seconds % 60).padStart(2, "0");
  const confirmCancel = () => {
    const run = async () => { setBusy(true); await onCancel(order); setBusy(false); };
    if (Platform.OS === "web") { if (typeof window !== "undefined" && window.confirm("Cancel this order? The amount will be refunded to your wallet.")) void run(); return; }
    Alert.alert("Cancel order", "The amount will be refunded to your wallet.", [{ text: "Keep", style: "cancel" }, { text: "Cancel order", style: "destructive", onPress: () => void run() }]);
  };
  const timeline = [
    { label: "Order placed", done: true, at: order.created_at },
    { label: order.payment_status === "refunded" ? "Payment refunded" : "Payment confirmed", done: true, at: order.created_at },
    { label: order.status === "completed" ? "Delivered" : order.status === "refunded" || order.status === "cancelled" ? "Cancelled & refunded" : order.status === "failed" ? "Failed" : isOtp ? "Waiting for OTP" : "Processing", done: order.status !== "processing" && order.status !== "pending" && !isOtp, at: order.updated_at ?? order.created_at },
  ];
  return (
    <ScrollView testID="vth-order-detail" showsVerticalScrollIndicator={false} contentContainerStyle={[common.scrollContent, { paddingBottom: insets.bottom + 30 }]}>
      <TopBar title="Order details" subtitle={order.id} onBack={onBack} />
      <GlassCard accent style={styles.hero}><View style={styles.heroFlag}><Text style={styles.heroFlagText}>{order.flag}</Text></View><PlatformLogo platform={order.platform} badge /><Text style={styles.heroProduct}>{order.product}</Text><Text style={styles.heroCountry}>{order.country}</Text><Text style={styles.heroAmount}>{money(order.amount, settings.store.currency)}</Text><StatusBadge status={order.status} /></GlassCard>
      <View style={styles.metaGrid}><Meta label="ORDER ID" value={order.id} onCopy={() => onCopy(order.id)} /><Meta label="DATE" value={shortDate(order.created_at)} /><Meta label="PAYMENT" value={order.payment_status} /><Meta label="FULFILLMENT" value={order.fulfillment_status} /></View>
      {isOtp ? <GlassCard style={styles.card}><View style={common.rowBetween}><View><Text style={common.sectionTitle}>Waiting for OTP</Text><Text style={common.sectionText}>Listening for incoming SMS</Text></View><View style={styles.pulse}><VthIcon name="bolt" size={20} color={colors.warning} /></View></View><View style={[common.box, { marginTop: 16 }]}><Text style={common.label}>RESERVED NUMBER</Text><Text style={styles.protected}>{order.delivery_masked ?? "+XX XXXXX XXXXX"}</Text><Pressable onPress={() => onCopy(typeof order.delivery === "string" ? order.delivery : order.delivery ? JSON.stringify(order.delivery) : (order.delivery_masked ?? ""))} style={common.copyButton}><VthIcon name="copy" size={15} color={colors.onSurfaceSecondary} /><Text style={common.copyText}>Copy number</Text></Pressable></View><View style={[common.rowBetween, { marginTop: 16 }]}><Text style={common.muted}>Reservation expires in</Text><Text style={styles.countdown}>{mm}:{ss}</Text></View><Pressable testID="cancel-order" disabled={busy} onPress={confirmCancel} style={[common.secondaryButton, { marginTop: 16 }]}>{busy ? <ActivityIndicator color={colors.error} /> : <Text style={common.dangerText}>Cancel order & refund</Text>}</Pressable></GlassCard>
        : order.status === "completed" ? <GlassCard style={styles.card}><View style={common.row}><VthIcon name="check" size={22} color={colors.success} /><View style={{ flex: 1 }}><Text style={common.sectionTitle}>Purchase successful</Text><Text style={common.sectionText}>Delivery details are protected until you reveal them.</Text></View></View><View style={[common.box, { marginTop: 16 }]}><Text style={common.label}>DELIVERY DETAILS</Text><Text selectable style={styles.protected}>{order.delivery ? (typeof order.delivery === "string" ? order.delivery : JSON.stringify(order.delivery, null, 2)) : (order.delivery_masked ?? "••••••••••••")}</Text>{order.delivery ? <Pressable onPress={() => onCopy(typeof order.delivery === "string" ? order.delivery : JSON.stringify(order.delivery))} style={common.copyButton}><VthIcon name="copy" size={15} color={colors.onSurfaceSecondary} /><Text style={common.copyText}>Copy delivery</Text></Pressable> : <Text style={[common.muted, { marginTop: 6 }]}>Delivery will appear here after the supplier completes the order.</Text>}</View></GlassCard>
        : <GlassCard style={styles.card}><View style={common.row}><VthIcon name={order.status === "refunded" ? "refresh" : order.status === "failed" ? "alert" : "clock"} size={22} color={order.status === "failed" ? colors.error : colors.brandSecondary} /><View style={{ flex: 1 }}><Text style={common.sectionTitle}>{order.status === "refunded" ? "Refunded to wallet" : order.status === "failed" ? "Order failed" : order.status === "cancelled" ? "Order cancelled" : "Processing your order"}</Text><Text style={common.sectionText}>{order.failure_reason ?? "We'll update this page automatically."}</Text></View></View></GlassCard>}
      <GlassCard style={styles.card}><Text style={common.sectionTitle}>Timeline</Text>{timeline.map((step, index) => <View key={step.label} style={styles.timelineRow}><View style={styles.timelineRail}><View style={[styles.timelineDot, step.done && styles.timelineDotDone]} />{index < timeline.length - 1 && <View style={styles.timelineLine} />}</View><View style={styles.timelineCopy}><Text style={styles.timelineLabel}>{step.label}</Text><Text style={common.muted}>{shortDate(step.at)}</Text></View></View>)}</GlassCard>
      <GlassCard style={styles.card}><Text style={common.sectionTitle}>Need help?</Text><Text style={[common.muted, { marginTop: 6 }]}>Refund eligibility follows the product policy. Our support team can review any order.</Text><Pressable testID="order-support" onPress={onSupport} style={[common.secondaryButton, { marginTop: 14 }]}><VthIcon name="support" size={15} color={colors.onSurfaceSecondary} /><Text style={common.secondaryButtonText}>Contact {settings.branding.store_name} support</Text></Pressable></GlassCard>
      <Footer text={settings.branding.footer_text} storeName={settings.branding.store_name} />
    </ScrollView>
  );
}

function Meta({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  const styles = useStyles();
  const common = useCommonStyles();
  const { colors } = useTheme();
  return <View style={styles.meta}><Text style={common.label}>{label}</Text><View style={common.row}><Text style={styles.metaValue} numberOfLines={1}>{value}</Text>{onCopy && <Pressable onPress={onCopy} hitSlop={8}><VthIcon name="copy" size={13} color={colors.muted} /></Pressable>}</View></View>;
}

const useStyles = makeStyles((colors) => ({
  hero: { alignItems: "center", paddingVertical: 22, gap: 8 },
  heroFlag: { width: 66, height: 66, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  heroFlagText: { fontSize: 34 },
  heroProduct: { color: colors.onSurface, fontSize: 21, fontWeight: "800" },
  heroCountry: { color: colors.muted, fontSize: 12 },
  heroAmount: { color: colors.onSurface, fontSize: 26, fontWeight: "800", marginTop: 6 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  meta: { width: "48%", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, gap: 6 },
  metaValue: { color: colors.onSurface, fontSize: 12, fontWeight: "800", textTransform: "capitalize", flexShrink: 1 },
  card: { padding: 18 },
  pulse: { width: 43, height: 43, borderRadius: 15, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  protected: { color: colors.onSurface, fontSize: 20, letterSpacing: 1.4, fontWeight: "800", marginTop: 8 },
  countdown: { color: colors.warning, fontSize: 20, fontWeight: "800", letterSpacing: 1 },
  timelineRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  timelineRail: { alignItems: "center", width: 14 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  timelineDotDone: { borderColor: colors.success, backgroundColor: colors.success },
  timelineLine: { flex: 1, width: 2, backgroundColor: colors.divider, marginTop: 4 },
  timelineCopy: { flex: 1, paddingBottom: 4 },
  timelineLabel: { color: colors.onSurface, fontSize: 12, fontWeight: "800", marginBottom: 3 },
}));
