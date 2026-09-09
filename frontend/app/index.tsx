import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, BackHandler, Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomNav, ModalSheet, StateBlock, VthIcon } from "@/src/components/vth-ui";
import { Category, LiveUpdate, NotificationItem, Order, Payment, PaymentMethod, Product, PublicSettings, Screen, UserProfile, Wallet, WalletTransaction } from "@/src/models";
import { CatalogScreen } from "@/src/screens/CatalogScreen";
import { HomeScreen } from "@/src/screens/HomeScreen";
import { OrderDetail, OrdersScreen } from "@/src/screens/OrdersScreen";
import { ProfileScreen } from "@/src/screens/ProfileScreen";
import { setDisplayCurrency } from "@/src/screens/common";
import { ConfirmationContent, PolicyContent } from "@/src/screens/PurchaseModals";
import { NotificationsSheet, ProfileMenuSheet } from "@/src/screens/Sheets";
import { WalletScreen } from "@/src/screens/WalletScreen";
import { ApiError, cancelOrder, ensureCustomerSession, getCategories, getLiveUpdates, getNotifications, getOrders, getPaymentMethods, getPayments, getPublicSettings, getTransactions, getWallet, markNotificationsRead } from "@/src/services/api";
import { telegram } from "@/src/telegram";
import { makeStyles, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

type Toast = { message: string; tone: "success" | "error" };

export default function Index() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const [introVisible, setIntroVisible] = useState(true);
  const [introStep, setIntroStep] = useState(0);
  const [activeScreen, setActiveScreen] = useState<Screen>("home");
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [verified, setVerified] = useState(false);
  const [wallet, setWallet] = useState<Wallet>({ user_id: "", balance: 0, currency: "INR" });
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Category | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [liveUpdates, setLiveUpdates] = useState<LiveUpdate[]>([]);
  const [currency, setCurrency] = useState("INR");

  // Intro: short for returning users, never blocks the app.
  useEffect(() => {
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    (async () => {
      const seen = Boolean(await storage.getItem("vth-intro-seen", false));
      timers.push(setTimeout(() => active && setIntroStep(1), seen ? 300 : 1250));
      timers.push(setTimeout(() => active && setIntroStep(2), seen ? 650 : 2350));
      timers.push(setTimeout(async () => { if (active) { await storage.setItem("vth-intro-seen", true); setIntroVisible(false); } }, seen ? 1100 : 3500));
    })().catch(() => setIntroVisible(false));
    const failSafe = setTimeout(() => active && setIntroVisible(false), 5000);
    return () => { active = false; timers.forEach(clearTimeout); clearTimeout(failSafe); };
  }, []);

  useEffect(() => { telegram.init(colors.surface); }, [colors.surface]);

  const refreshAccount = useCallback(async () => {
    const [nextWallet, nextOrders, nextTransactions, nextPayments] = await Promise.all([getWallet(), getOrders(), getTransactions(), getPayments()]);
    setWallet(nextWallet); setOrders(nextOrders); setTransactions(nextTransactions); setPayments(nextPayments);
    setSelectedOrder((current) => current ? nextOrders.find((o) => o.id === current.id) ?? current : current);
    getNotifications().then((n) => { setNotifications(n.items); setUnread(n.unread); }).catch(() => undefined);
    getLiveUpdates().then(setLiveUpdates);
  }, []);
  const changeCurrency = useCallback(
  async (code: string) => {
    setCurrency(code);

    setDisplayCurrency(
      code,
      settings?.currency?.usd_rate ?? 85
    );

    await storage.setItem("vth-currency", code);
  },
  [settings?.currency?.usd_rate]
);

  const bootstrap = useCallback(async () => {
    setDataLoading(true); setLoadError(null);
    try {
      const [nextSettings, nextCategories, nextMethods] = await Promise.all([getPublicSettings(), getCategories(), getPaymentMethods().catch(() => [] as PaymentMethod[])]);
      setSettings(nextSettings); setCategories(nextCategories); setPaymentMethods(nextMethods);
      const savedCurrency = String((await storage.getItem("vth-currency", nextSettings.currency.default)) ?? nextSettings.currency.default);
      const code = nextSettings.currency.supported.includes(savedCurrency) ? savedCurrency : nextSettings.currency.default;
      setCurrency(code); setDisplayCurrency(code, nextSettings.currency.usd_rate);
      const session = await ensureCustomerSession();
      setProfile(session.user); setVerified(session.verified);
      await refreshAccount();
    } catch (error) {
      setLoadError((error as ApiError).message || "We couldn't reach the store.");
    } finally { setDataLoading(false); }
  }, [refreshAccount]);
  useEffect(() => { void bootstrap(); }, [bootstrap]);

  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => { setToast({ message, tone }); telegram.haptic(tone); setTimeout(() => setToast(null), 2600); }, []);
  const copyValue = async (value: string) => { await Clipboard.setStringAsync(value); showToast("Copied to clipboard"); };
  const openLink = (url: string) => telegram.openLink(url);
  const supportUrl =
  settings?.branding?.support_link ||
  (settings?.branding?.support_username
    ? `https://t.me/${settings.branding.support_username.replace(
        /^@/,
        ""
      )}`
    : "");
  const openSupport = () => supportUrl ? openLink(supportUrl) : showToast("Support contact not configured yet", "error");

  const openBell = () => { setBellOpen(true); const ids = notifications.filter((n) => !n.read).map((n) => n.id); if (ids.length) { void markNotificationsRead(ids).then(() => { setUnread(0); setNotifications((items) => items.map((n) => ({ ...n, read: true }))); }); } };
  const goBack = useCallback(() => {
    if (menuOpen) { setMenuOpen(false); return true; }
    if (bellOpen) { setBellOpen(false); return true; }
    if (confirmOpen) { setConfirmOpen(false); setSelectedProduct(null); return true; }
    if (policyOpen) { setPolicyOpen(false); return true; }
    if (selectedOrder) { setSelectedOrder(null); return true; }
    if (catalog) { setCatalog(null); return true; }
    if (activeScreen !== "home") { setActiveScreen("home"); return true; }
    return false;
  }, [menuOpen, bellOpen, confirmOpen, policyOpen, selectedOrder, catalog, activeScreen]);
  const canGoBack = Boolean(menuOpen || bellOpen || confirmOpen || policyOpen || selectedOrder || catalog || activeScreen !== "home");
  useEffect(() => telegram.setBackButton(canGoBack, () => { goBack(); }), [canGoBack, goBack]);
  useEffect(() => { const sub = BackHandler.addEventListener("hardwareBackPress", goBack); return () => sub.remove(); }, [goBack]);

  const openBuy = (product: Product) => { telegram.haptic("light"); setSelectedProduct(product); setPolicyOpen(true); };
  const handleCancelOrder = async (order: Order) => { try { const result = await cancelOrder(order.id); showToast(result.message); await refreshAccount(); setSelectedOrder(null); } catch (error) { showToast((error as ApiError).message, "error"); } };
  const goToWallet = () => { setConfirmOpen(false); setSelectedProduct(null); setCatalog(null); setActiveScreen("wallet"); };
  const viewOrder = async (orderId: string) => { setConfirmOpen(false); setSelectedProduct(null); setCatalog(null); setActiveScreen("orders"); const order = orders.find((o) => o.id === orderId) ?? (await getOrders()).find((o) => o.id === orderId); if (order) setSelectedOrder(order); };

  if (introVisible) return <IntroScreen step={introStep} storeName={settings?.branding.store_name ?? "VTH NETWORK"} />;
  if (!settings) return <View style={[styles.root, styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><StateBlock icon="alert" tone="error" title="Store unavailable" description={loadError ?? "Unable to load store configuration."} actionLabel="Retry" onAction={bootstrap} /></View>;

  if (settings.store.maintenance_mode) return <View style={[styles.root, styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><StateBlock icon="wrench" tone="warning" title="Temporarily unavailable" description={settings.store.maintenance_message} actionLabel="Try again" onAction={bootstrap} /><Text style={styles.footerMini}>{settings.branding.footer_text}</Text></View>;
  if (loadError && !profile) return <View style={[styles.root, styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><StateBlock icon="alert" tone="error" title="Connection problem" description={loadError} actionLabel="Retry" onAction={bootstrap} /></View>;

  const content = selectedOrder ? <OrderDetail order={selectedOrder} settings={settings} onBack={() => setSelectedOrder(null)} onCopy={copyValue} onCancel={handleCancelOrder} onRefresh={refreshAccount} onSupport={openSupport} />
    : catalog ? <CatalogScreen category={catalog} settings={settings} onBack={() => setCatalog(null)} onBuy={openBuy} />
    : activeScreen === "home" ? <HomeScreen categories={categories} wallet={wallet} profile={profile} settings={settings} loading={dataLoading} announcementDismissed={announcementDismissed} onDismissAnnouncement={() => setAnnouncementDismissed(true)} onCategory={setCatalog} onRecharge={() => setActiveScreen("wallet")} onOrders={() => setActiveScreen("orders")} onSupport={openSupport} onOpenLink={openLink} onMenu={() => setMenuOpen(true)} onBell={openBell} unread={unread} liveUpdates={liveUpdates} />
    : activeScreen === "orders" ? <OrdersScreen orders={orders} loading={dataLoading} settings={settings} onRefresh={refreshAccount} onSelect={setSelectedOrder} onSupport={openSupport} />
    : activeScreen === "wallet" ? <WalletScreen wallet={wallet} methods={paymentMethods} transactions={transactions} payments={payments} settings={settings} onRefresh={refreshAccount} onToast={showToast} onCopy={copyValue} onSupport={openSupport} />
    : <ProfileScreen profile={profile} verified={verified} wallet={wallet} orders={orders} settings={settings} onAdmin={() => router.push("/admin")} onOrders={() => setActiveScreen("orders")} onWallet={() => setActiveScreen("wallet")} onOpenLink={openLink} onToast={showToast} onMenu={() => setMenuOpen(true)} />;

  return <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View style={styles.content}>{content}</View>
    {!catalog && !selectedOrder && <BottomNav active={activeScreen} onChange={setActiveScreen} />}
    {toast && <View style={[styles.toast, { bottom: insets.bottom + 92, backgroundColor: toast.tone === "error" ? colors.error : colors.success }]}><VthIcon name={toast.tone === "error" ? "alert" : "check"} size={17} color={colors.onSuccess} /><Text style={styles.toastText}>{toast.message}</Text></View>}
    {selectedProduct && policyOpen && <Modal visible transparent animationType="fade" onRequestClose={() => setPolicyOpen(false)}><ModalSheet onClose={() => setPolicyOpen(false)}><PolicyContent product={selectedProduct} onCancel={() => setPolicyOpen(false)} onContinue={() => { setPolicyOpen(false); setConfirmOpen(true); }} /></ModalSheet></Modal>}
    {selectedProduct && confirmOpen && <Modal visible transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}><ModalSheet onClose={() => { setConfirmOpen(false); setSelectedProduct(null); }}><ConfirmationContent product={selectedProduct} settings={settings} onRecharge={goToWallet} onViewOrder={viewOrder} onPurchased={refreshAccount} onToast={showToast} onCopy={copyValue} /></ModalSheet></Modal>}
    {menuOpen && <Modal visible transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}><ModalSheet onClose={() => setMenuOpen(false)}><ProfileMenuSheet settings={settings} currency={currency} onCurrency={changeCurrency} onOpenLink={openLink} /></ModalSheet></Modal>}
    {bellOpen && <Modal visible transparent animationType="fade" onRequestClose={() => setBellOpen(false)}><ModalSheet onClose={() => setBellOpen(false)}><NotificationsSheet items={notifications} onOpenLink={openLink} /></ModalSheet></Modal>}
  </View>;
}

function IntroScreen({ step, storeName }: { step: number; storeName: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  useEffect(() => { fade.setValue(0); scale.setValue(0.94); Animated.parallel([Animated.timing(fade, { toValue: 1, duration: 550, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, friction: 8, useNativeDriver: true })]).start(); }, [step, fade, scale]);
  const copy = step === 0 ? { title: storeName, subtitle: "Premium digital services platform" } : step === 1 ? { title: `Welcome to ${storeName.replace("NETWORK", "Network")} 👋`, subtitle: "A better way to access quality digital products." } : { title: "All-in-One Account Store", subtitle: "Telegram & WhatsApp products with secure wallet payments." };
  return <LinearGradient colors={[colors.surface, colors.surfaceSecondary]} style={styles.intro} testID="vth-intro"><View style={styles.introRing}><View style={styles.introOrb}><Text style={styles.introLogo}>V</Text></View></View><Animated.View style={[styles.introCopy, { opacity: fade, transform: [{ scale }] }]}><Text style={styles.introTitle}>{copy.title}</Text><Text style={styles.introSubtitle}>{copy.subtitle}</Text></Animated.View><View style={styles.introFooter}><View style={styles.introDots}>{[0, 1, 2].map((item) => <View key={item} style={[styles.introDot, item === step && styles.introDotActive]} />)}</View><Text style={styles.introMeta}>POWERED BY {storeName.toUpperCase()}</Text></View></LinearGradient>;
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  footerMini: { color: colors.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: "700", textTransform: "uppercase", marginTop: 24 },
  toast: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 16, minHeight: 42, borderRadius: 15, zIndex: 50, maxWidth: "90%" },
  toastText: { color: colors.onSuccess, fontSize: 12, fontWeight: "800", flexShrink: 1 },
  intro: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  introRing: { width: 142, height: 142, borderRadius: 71, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  introOrb: {
  width: 86,
  height: 86,
  borderRadius: 29,
  backgroundColor: colors.brandPrimary,
  alignItems: "center",
  justifyContent: "center",
  shadowColor: colors.brandPrimary,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.4,
  shadowRadius: 20,
  elevation: 10,
},
  introLogo: { color: colors.onBrandPrimary, fontSize: 50, fontWeight: "900", letterSpacing: -4 },
  introCopy: { alignItems: "center", marginTop: 35 },
  introTitle: { color: colors.onSurface, fontSize: 26, fontWeight: "800", textAlign: "center", letterSpacing: -0.4 },
  introSubtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 300 },
  introFooter: { position: "absolute", bottom: 45, alignItems: "center" },
  introDots: { flexDirection: "row", gap: 5 },
  introDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.surfaceTertiary },
  introDotActive: { width: 18, backgroundColor: colors.brandSecondary },
  introMeta: { color: colors.muted, fontSize: 9, letterSpacing: 1.8, marginTop: 15 },
}));
