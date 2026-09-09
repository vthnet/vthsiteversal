import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BroadcastsSection, CatalogSection, HealthSection, LogsSection, OrdersSection, OverviewSection, PaymentsSection, PromoSection, SecuritySection, ServersSection, UsersSection } from "@/src/admin/sections";
import { SettingsGroup } from "@/src/admin/SettingsForm";
import { AdminButton, useAdminStyles } from "@/src/admin/ui";
import { BrandMark, VthIcon } from "@/src/components/vth-ui";
import { ApiError, admin, adminLogin, adminLogout, adminTelegramLogin, loadAdminToken } from "@/src/services/api";
import { telegram } from "@/src/telegram";
import { makeStyles, useTheme } from "@/src/theme";

const SECTIONS: { id: string; label: string; icon: string }[] = [
  { id: "overview", label: "Dashboard", icon: "pulse" }, { id: "providers", label: "Providers", icon: "server" }, { id: "catalog", label: "Products & Countries", icon: "tag" }, { id: "servers", label: "Servers / Operators", icon: "pulse" }, { id: "orders", label: "Orders", icon: "orders" }, { id: "users", label: "Users", icon: "users" },
  { id: "payments", label: "Wallet & Payments", icon: "wallet" }, { id: "methods", label: "Recharge Methods", icon: "qrcode" }, { id: "promo", label: "Coupons", icon: "ticket" }, { id: "broadcasts", label: "Broadcasts", icon: "megaphone" }, { id: "bot", label: "Telegram Bot", icon: "robot" }, { id: "logging", label: "Logs & Notifications", icon: "text-box-multiple" },
  { id: "store", label: "Store Settings", icon: "storefront" }, { id: "logs", label: "Audit Logs", icon: "history" }, { id: "health", label: "System Health", icon: "wrench" }, { id: "security", label: "Security", icon: "shield" },
];

export default function AdminRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [section, setSection] = useState("overview");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => { setToast({ message, tone }); telegram.haptic(tone); setTimeout(() => setToast(null), 2600); }, []);

  useEffect(() => { (async () => { const token = await loadAdminToken(); if (token) { try { await admin("/auth/me"); setAuthed(true); } catch { setAuthed(false); } } setChecking(false); })(); }, []);
  const goHome = useCallback(() => { if (router.canGoBack()) router.back(); else router.replace("/"); }, [router]);
  useEffect(() => telegram.setBackButton(true, goHome), [goHome]);

  const logout = async () => { await adminLogout(); setAuthed(false); setSection("overview"); showToast("Signed out"); };
  const handleUnauthorized = (error: unknown) => { if ((error as ApiError).status === 401) { setAuthed(false); showToast("Session expired — sign in again", "error"); } else showToast((error as ApiError).message, "error"); };

  if (checking) return <View style={[styles.root, styles.center]}><ActivityIndicator color={colors.brandSecondary} /></View>;
  if (!authed) return <AdminLogin onBack={goHome} onSuccess={() => { setAuthed(true); showToast("Welcome back, owner"); }} />;

  const content = section === "overview" ? <OverviewSection onNavigate={setSection} /> : section === "providers" ? <SettingsGroup sectionIds={["provider_telegram_1", "provider_telegram_2", "provider_numbers"]} onToast={showToast} /> : section === "catalog" ? <CatalogSection onToast={showToast} /> : section === "servers" ? <ServersSection onToast={showToast} /> : section === "broadcasts" ? <BroadcastsSection onToast={showToast} /> : section === "orders" ? <OrdersSection onToast={showToast} /> : section === "users" ? <UsersSection onToast={showToast} /> : section === "payments" ? <PaymentsSection onToast={showToast} /> : section === "methods" ? <SettingsGroup sectionIds={["pay_auto_upi", "pay_auto_crypto", "pay_manual_upi", "pay_manual_crypto"]} onToast={showToast} /> : section === "promo" ? <PromoSection onToast={showToast} /> : section === "bot" ? <SettingsGroup sectionIds={["bot"]} onToast={showToast} /> : section === "logging" ? <SettingsGroup sectionIds={["logging", "templates"]} onToast={showToast} /> : section === "store" ? <SettingsGroup sectionIds={["branding", "content", "currency", "announcement", "store"]} onToast={showToast} /> : section === "logs" ? <LogsSection onToast={showToast} /> : section === "health" ? <HealthSection onToast={(m, t) => t === "error" ? handleUnauthorized(new ApiError(0, m)) : showToast(m, t)} /> : <SecuritySection onLogout={logout} />;
  const active = SECTIONS.find((s) => s.id === section)!;

  return <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="admin-shell">
    <View style={styles.header}><Pressable testID="admin-back" onPress={goHome} style={styles.iconButton}><VthIcon name="back" color={colors.onSurface} /></Pressable><View style={{ flex: 1, alignItems: "center" }}><Text style={styles.headerTitle}>Admin Panel</Text><Text style={styles.headerSub}>{active.label}</Text></View><Pressable testID="admin-logout" onPress={() => setSection("security")} style={styles.iconButton}><VthIcon name="shield" color={colors.brandSecondary} /></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nav} style={styles.navScroll}>{SECTIONS.map((s) => <Pressable key={s.id} testID={`admin-nav-${s.id}`} onPress={() => setSection(s.id)} style={[styles.navChip, section === s.id && styles.navChipActive]}><VthIcon name={s.icon} size={14} color={section === s.id ? colors.onBrandPrimary : colors.onSurfaceSecondary} /><Text style={[styles.navText, section === s.id && styles.navTextActive]}>{s.label}</Text></Pressable>)}</ScrollView>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">{content}<Text style={styles.footer}>VTH NETWORK · ADMIN · SECRETS STAY SERVER-SIDE</Text></ScrollView>
    {toast && <View style={[styles.toast, { bottom: insets.bottom + 24, backgroundColor: toast.tone === "error" ? colors.error : colors.success }]}><VthIcon name={toast.tone === "error" ? "alert" : "check"} size={17} color={colors.onSuccess} /><Text style={styles.toastText}>{toast.message}</Text></View>}
  </View>;
}

function AdminLogin({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const adminStyles = useAdminStyles();
  const { colors } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => { if (!username || !password) { setError("Enter username and password"); return; } setBusy(true); setError(null); try { await adminLogin(username.trim(), password); onSuccess(); } catch (e) { setError((e as ApiError).message || "Sign-in failed"); } finally { setBusy(false); } };
  const viaTelegram = async () => { setBusy(true); setError(null); try { await adminTelegramLogin(); onSuccess(); } catch (e) { setError((e as ApiError).message || "Telegram owner login unavailable"); } finally { setBusy(false); } };
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View style={styles.header}><Pressable testID="admin-back" onPress={onBack} style={styles.iconButton}><VthIcon name="back" color={colors.onSurface} /></Pressable><BrandMark compact /><View style={styles.iconButton} /></View>
    <ScrollView contentContainerStyle={styles.loginBody} keyboardShouldPersistTaps="handled">
      <View style={styles.lockOrb}><VthIcon name="shield" size={30} color={colors.onBrandPrimary} /></View>
      <Text style={styles.loginTitle}>Owner sign-in</Text>
      <Text style={styles.loginSub}>The admin panel is protected server-side. Customers never see this area.</Text>
      <View style={styles.loginCard}>
        <Text style={adminStyles.fieldLabel}>Username</Text><TextInput testID="admin-username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="owner" placeholderTextColor={colors.muted} style={adminStyles.input} />
        <Text style={[adminStyles.fieldLabel, { marginTop: 12 }]}>Password</Text><TextInput testID="admin-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.muted} style={adminStyles.input} onSubmitEditing={submit} />
        {error && <View style={[adminStyles.warn, { marginTop: 12, marginBottom: 0 }]}><VthIcon name="alert" size={14} color={colors.warning} /><Text style={adminStyles.warnText}>{error}</Text></View>}
        <View style={{ marginTop: 16 }}><AdminButton testID="admin-login" label="Sign in" icon="shield" busy={busy} onPress={submit} /></View>
        {telegram.isInsideTelegram() && <View style={{ marginTop: 8 }}><AdminButton tone="secondary" label="Continue as Telegram owner" icon="telegram" busy={busy} onPress={viaTelegram} /></View>}
      </View>
      <Text style={styles.footer}>Failed attempts are rate-limited and audited.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center" },
  header: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 },
  headerTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  headerSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  navScroll: { flexGrow: 0 },
  nav: { paddingHorizontal: 14, gap: 6, paddingVertical: 8 },
  navChip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", gap: 6 },
  navChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  navText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  navTextActive: { color: colors.onBrandPrimary },
  body: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 40 },
  footer: { color: colors.muted, fontSize: 9, letterSpacing: 1.2, textAlign: "center", marginTop: 20, fontWeight: "700" },
  toast: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 16, minHeight: 42, borderRadius: 15, zIndex: 50, maxWidth: "90%" },
  toastText: { color: colors.onSuccess, fontSize: 12, fontWeight: "800", flexShrink: 1 },
  loginBody: { paddingHorizontal: 24, paddingTop: 30, alignItems: "center" },
  lockOrb: { width: 74, height: 74, borderRadius: 26, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  loginTitle: { color: colors.onSurface, fontSize: 24, fontWeight: "800", marginTop: 20 },
  loginSub: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 8, maxWidth: 300 },
  loginCard: { alignSelf: "stretch", marginTop: 24, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary },
}));
