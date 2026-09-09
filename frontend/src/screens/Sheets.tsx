import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { StateBlock, VthIcon } from "@/src/components/vth-ui";
import { NotificationItem, PublicSettings } from "@/src/models";
import { shortDate, useCommonStyles } from "@/src/screens/common";
import { makeStyles, useTheme } from "@/src/theme";

type MenuId = "support" | "updates" | "services" | "guide" | "policies" | "faq" | "about" | "currency";
const MENU: { id: MenuId; icon: string; title: string; subtitle: string }[] = [
  { id: "support", icon: "support", title: "Contact Support", subtitle: "Get help with an order or payment" },
  { id: "updates", icon: "megaphone", title: "Updates Channel", subtitle: "Announcements & new inventory" },
  { id: "services", icon: "link", title: "Other VTH Services", subtitle: "More from VTH NETWORK" },
  { id: "guide", icon: "info", title: "Quick Guide", subtitle: "How buying and wallet work" },
  { id: "policies", icon: "shield", title: "Policies", subtitle: "Terms, refunds, privacy" },
  { id: "faq", icon: "history", title: "FAQ", subtitle: "Common questions" },
  { id: "about", icon: "storefront", title: "About VTH NETWORK", subtitle: "Premium digital services platform" },
  { id: "currency", icon: "tune", title: "Currency", subtitle: "Display prices in INR or USD" },
];

const parseLines = (raw: string | undefined, sep = "::") => (raw ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split(sep).map((x) => x.trim()));

export function ProfileMenuSheet({ settings, currency, onCurrency, onOpenLink }: { settings: PublicSettings; currency: string; onCurrency: (code: string) => void; onOpenLink: (url: string) => void }) {
  const common = useCommonStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState<MenuId | null>(null);
  const b = settings.branding, c = settings.content;
  const visible = new Set((c.menu_items ?? MENU.map((m) => m.id).join(",")).split(",").map((x) => x.trim()));
  const supportUrl = b.support_link || (b.support_username ? `https://t.me/${b.support_username.replace(/^@/, "")}` : "");
  const services = parseLines(c.other_services, "|");
  const guide = parseLines(c.quick_guide);
  const faq = parseLines(c.faq);
  const policies = [["Terms of service", c.policy_terms], ["Purchase policy", c.policy_purchase], ["Refund policy", c.policy_refund], ["Privacy policy", c.policy_privacy], ["Acceptable use", c.policy_acceptable_use]].filter(([, v]) => v);
  const detail = (id: MenuId) => {
    if (id === "support") return <View style={styles.detail}><Text style={common.body}>{c.support_message}</Text><Text style={[common.muted, { marginTop: 4 }]}>{c.support_availability}</Text><Pressable testID="menu-support-button" onPress={() => supportUrl && onOpenLink(supportUrl)} style={[common.primaryButton, { marginTop: 12 }]}><VthIcon name="support" size={15} color={colors.onBrandPrimary} /><Text style={common.primaryButtonText}>Contact @{b.support_username.replace(/^@/, "")}</Text></Pressable></View>;
    if (id === "updates") return <View style={styles.detail}><Pressable onPress={() => onOpenLink(c.updates_channel || b.support_channel)} style={common.primaryButton}><VthIcon name="megaphone" size={15} color={colors.onBrandPrimary} /><Text style={common.primaryButtonText}>Open updates channel</Text></Pressable></View>;
    if (id === "services") return <View style={styles.detail}>{services.length ? services.map(([name, url, desc]) => <Pressable key={name} onPress={() => url && onOpenLink(url)} style={styles.serviceRow}><View style={{ flex: 1 }}><Text style={styles.itemTitle}>{name}</Text>{desc ? <Text style={common.muted}>{desc}</Text> : null}</View><VthIcon name="link" size={15} color={colors.muted} /></Pressable>) : <Text style={common.muted}>No additional services yet.</Text>}</View>;
    if (id === "guide") return <View style={styles.detail}>{guide.map(([t, body]) => <View key={t} style={styles.block}><Text style={styles.itemTitle}>{t}</Text><Text style={common.body}>{body}</Text></View>)}</View>;
    if (id === "faq") return <View style={styles.detail}>{faq.map(([q, a]) => <View key={q} style={styles.block}><Text style={styles.itemTitle}>{q}</Text><Text style={common.body}>{a}</Text></View>)}</View>;
    if (id === "policies") return <View style={styles.detail}>{policies.map(([t, body]) => <View key={t} style={styles.block}><Text style={styles.itemTitle}>{t}</Text><Text style={common.body}>{body}</Text></View>)}</View>;
    if (id === "about") return <View style={styles.detail}><Text style={common.body}>{b.about_text}</Text><Text style={[common.muted, { marginTop: 8 }]}>{b.footer_text}</Text></View>;
    return <View style={[styles.detail, common.chipRow]}>{settings.currency.supported.map((code) => <Pressable key={code} testID={`currency-${code}`} onPress={() => onCurrency(code)} style={[common.chip, currency === code && common.chipActive]}><Text style={[common.chipText, currency === code && common.chipTextActive]}>{code === "INR" ? "🇮🇳 INR ₹" : "🇺🇸 USD $"}</Text></Pressable>)}</View>;
  };
  return <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll} testID="profile-menu">
    <View style={styles.owner}>{b.owner_photo_url ? <Image source={{ uri: b.owner_photo_url }} style={styles.ownerPhoto} /> : <View style={styles.ownerOrb}><Text style={styles.ownerOrbText}>{b.owner_name?.[0] ?? "V"}</Text></View>}<View style={{ flex: 1 }}><Text style={styles.ownerName}>{b.owner_name}</Text><Text style={common.muted}>{b.store_name} · Official Store</Text></View></View>
    {MENU.filter((m) => visible.has(m.id) && (m.id !== "currency" || settings.currency.show_selector)).map((item) => <View key={item.id}><Pressable testID={`menu-${item.id}`} onPress={() => setOpen(open === item.id ? null : item.id)} style={({ pressed }) => [styles.menuRow, pressed && common.pressed]}><View style={styles.menuIcon}><VthIcon name={item.icon} size={18} color={colors.onSurface} /></View><View style={{ flex: 1 }}><Text style={styles.itemTitle}>{item.title}</Text><Text style={common.muted}>{item.id === "currency" ? `Currently ${currency}` : item.subtitle}</Text></View><VthIcon name={open === item.id ? "chevron-up" : "chevron"} size={18} color={colors.muted} /></Pressable>{open === item.id && detail(item.id)}</View>)}
    <Text style={styles.footer}>{b.footer_text}</Text>
  </ScrollView>;
}

export function NotificationsSheet({ items, onOpenLink }: { items: NotificationItem[]; onOpenLink: (url: string) => void }) {
  const common = useCommonStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const tone = (type: string) => type === "success" ? colors.success : type === "warning" || type === "maintenance" ? colors.warning : type === "error" ? colors.error : colors.onSurface;
  return <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll} testID="notification-center">
    <Text style={styles.sheetTitle}>Notifications</Text>
    {items.length === 0 ? <StateBlock icon="info" title="You're all caught up" description="Announcements, order and wallet updates will appear here." /> : items.map((n) => <View key={n.id} style={[styles.notification, !n.read && styles.notificationUnread]}><View style={[styles.notifDot, { backgroundColor: tone(n.type) }]} /><View style={{ flex: 1 }}><Text style={styles.itemTitle}>{n.title}</Text><Text style={common.body}>{n.message}</Text><Text style={[common.muted, { marginTop: 4 }]}>{shortDate(n.created_at)}</Text>{n.button_label && n.button_link ? <Pressable onPress={() => onOpenLink(n.button_link!)} hitSlop={6}><Text style={styles.link}>{n.button_label} →</Text></Pressable> : null}</View></View>)}
  </ScrollView>;
}

const useStyles = makeStyles((colors) => ({
  sheetScroll: { maxHeight: 560 },
  sheetTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800", marginBottom: 12 },
  owner: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: 6 },
  ownerOrb: { width: 48, height: 48, borderRadius: 17, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  ownerPhoto: { width: 48, height: 48, borderRadius: 17 },
  ownerOrbText: { color: colors.onBrandPrimary, fontSize: 20, fontWeight: "900" },
  ownerName: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  menuRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  menuIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  itemTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "800", marginBottom: 2 },
  detail: { padding: 14, borderRadius: 16, backgroundColor: colors.surfaceTertiary, marginBottom: 8 },
  block: { marginBottom: 12 },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  footer: { color: colors.muted, fontSize: 10, letterSpacing: 1.2, textAlign: "center", marginTop: 16, marginBottom: 8, fontWeight: "700", textTransform: "uppercase" },
  notification: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginBottom: 8 },
  notificationUnread: { borderColor: colors.borderStrong, backgroundColor: colors.brandTertiary },
  notifDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  link: { color: colors.onSurface, fontSize: 12, fontWeight: "800", marginTop: 6 },
}));
