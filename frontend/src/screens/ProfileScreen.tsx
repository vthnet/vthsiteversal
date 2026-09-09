import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Footer, GlassCard, SectionTitle, TopBar, VthIcon } from "@/src/components/vth-ui";
import { Order, PublicSettings, UserProfile, Wallet } from "@/src/models";
import { money, useCommonStyles } from "@/src/screens/common";
import { makeStyles, useTheme } from "@/src/theme";

type Props = { profile: UserProfile | null; verified: boolean; wallet: Wallet; orders: Order[]; settings: PublicSettings; onAdmin: () => void; onOrders: () => void; onWallet: () => void; onOpenLink: (url: string) => void; onToast: (message: string) => void; onMenu: () => void };

export function ProfileScreen({ profile, verified, wallet, orders, settings, onAdmin, onOrders, onWallet, onOpenLink, onToast, onMenu }: Props) {
  const insets = useSafeAreaInsets();
  const common = useCommonStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const b = settings.branding;
  const tme = (username: string) => `https://t.me/${username.replace(/^@/, "")}`;
  const supportUrl = b.support_link || (b.support_username ? tme(b.support_username) : "");
  const rows = [
    { icon: "orders", title: "Order history", subtitle: `${orders.length} orders`, action: onOrders },
    { icon: "wallet", title: "Wallet & transactions", subtitle: `Balance ${money(wallet.balance, wallet.currency)}`, action: onWallet },
    { icon: "support", title: "Support", subtitle: supportUrl ? `@${b.support_username.replace(/^@/, "")}` : "Contact support", action: () => supportUrl ? onOpenLink(supportUrl) : onToast("Support contact will be configured by the store owner") },
    { icon: "info", title: "Quick Guide, Policies & FAQ", subtitle: "Updates, other services, currency", action: onMenu },
  ];
  return (
    <ScrollView testID="vth-profile-screen" showsVerticalScrollIndicator={false} contentContainerStyle={[common.scrollContent, { paddingBottom: insets.bottom + 100 }]}>
      <TopBar title="Profile" subtitle="Telegram identity" right={<View style={common.headerIcon}><VthIcon name="settings" color={colors.brandSecondary} /></View>} />
      <LinearGradient colors={[colors.surfaceTertiary, colors.surfaceSecondary]} style={styles.hero}>
        {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{profile?.first_name?.[0]?.toUpperCase() ?? "V"}</Text></View>}
        <Text style={styles.name}>{profile ? `${profile.first_name} ${profile.last_name ?? ""}`.trim() : "Loading profile"}</Text>
        <Text style={styles.username}>@{profile?.username ?? "—"}</Text>
        <View style={[styles.badge, { backgroundColor: verified ? `${colors.success}18` : `${colors.warning}18` }]}><VthIcon name={verified ? "check" : "info"} size={13} color={verified ? colors.success : colors.warning} /><Text style={[styles.badgeText, { color: verified ? colors.success : colors.warning }]}>{verified ? "Telegram verified" : "Development session"}</Text></View>
      </LinearGradient>
      <View style={styles.stats}><View style={styles.stat}><Text style={styles.statValue}>{money(wallet.balance, wallet.currency)}</Text><Text style={styles.statLabel}>Balance</Text></View><View style={styles.stat}><Text style={styles.statValue}>{orders.length}</Text><Text style={styles.statLabel}>Orders</Text></View><View style={styles.stat}><Text style={styles.statValue}>{profile?.telegram_id ?? "—"}</Text><Text style={styles.statLabel}>Telegram ID</Text></View></View>
      <SectionTitle title="Account" />
      <View>{rows.map((item) => <Pressable key={item.title} testID={`profile-${item.title.split(" ")[0].toLowerCase()}`} onPress={item.action} style={({ pressed }) => [styles.row, pressed && common.pressed]}><View style={styles.rowIcon}><VthIcon name={item.icon} size={19} color={colors.brandSecondary} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowSubtitle}>{item.subtitle}</Text></View><VthIcon name="chevron" color={colors.muted} /></Pressable>)}</View>
      <SectionTitle title={`About ${b.store_name}`} />
      <GlassCard accent style={styles.ownerCard} testID="owner-card">
        <View style={common.row}>{b.owner_photo_url ? <Image source={{ uri: b.owner_photo_url }} style={styles.ownerPhoto} /> : <View style={styles.ownerOrb}><Text style={styles.ownerOrbText}>{b.owner_name?.[0]?.toUpperCase() ?? "V"}</Text></View>}<View style={{ flex: 1 }}><Text style={styles.ownerName}>{b.owner_name}</Text><Text style={common.muted}>{b.store_name} · Official Store</Text></View><View style={styles.officialTag}><VthIcon name="check" size={11} color={colors.success} /><Text style={styles.officialText}>Official</Text></View></View>
        <Text style={[common.body, { marginTop: 14 }]}>{b.about_text}</Text>
        <Text style={[common.muted, { marginTop: 8 }]}>Premium digital services platform</Text>
        <View style={styles.contactRow}>
          {supportUrl ? <Pressable testID="support-button" onPress={() => onOpenLink(supportUrl)} style={({ pressed }) => [styles.contactButton, styles.contactPrimary, pressed && common.pressed]}><VthIcon name="support" size={15} color={colors.onBrandPrimary} /><Text style={[styles.contactText, { color: colors.onBrandPrimary }]}>Support</Text></Pressable> : null}
          {b.support_channel ? <Pressable onPress={() => onOpenLink(b.support_channel)} style={({ pressed }) => [styles.contactButton, pressed && common.pressed]}><VthIcon name="megaphone" size={15} color={colors.onSurfaceSecondary} /><Text style={styles.contactText}>Channel</Text></Pressable> : null}
          {b.owner_telegram_username ? <Pressable onPress={() => onOpenLink(tme(b.owner_telegram_username))} style={({ pressed }) => [styles.contactButton, pressed && common.pressed]}><VthIcon name="telegram" size={15} color={colors.onSurfaceSecondary} /><Text style={styles.contactText}>Owner</Text></Pressable> : null}
          {b.community_link ? <Pressable onPress={() => onOpenLink(b.community_link)} style={({ pressed }) => [styles.contactButton, pressed && common.pressed]}><VthIcon name="users" size={15} color={colors.onSurfaceSecondary} /><Text style={styles.contactText}>Community</Text></Pressable> : null}
        </View>
      </GlassCard>
      <Pressable testID="admin-entry" onPress={onAdmin} style={styles.adminEntry}><VthIcon name="settings" size={17} color={colors.onBrandTertiary} /><Text style={styles.adminEntryText}>Admin portal</Text><Text style={common.muted}>Owner sign-in required</Text></Pressable>
      <Footer text={b.footer_text} storeName={b.store_name} onSupport={supportUrl ? () => onOpenLink(supportUrl) : undefined} />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  hero: { borderRadius: 22, padding: 22, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong },
  avatar: { width: 70, height: 70, borderRadius: 24, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarImage: { width: 70, height: 70, borderRadius: 24 },
  avatarText: { color: colors.onBrandPrimary, fontSize: 30, fontWeight: "900" },
  name: { color: colors.onSurface, fontSize: 21, fontWeight: "800", marginTop: 12 },
  username: { color: colors.muted, fontSize: 12, marginTop: 4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 13, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  stats: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.divider },
  stat: { alignItems: "center", flex: 1 },
  statValue: { color: colors.onSurface, fontSize: 15, fontWeight: "800", textAlign: "center" },
  statLabel: { color: colors.muted, fontSize: 10, marginTop: 5 },
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: 11 },
  rowTitle: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "800" },
  rowSubtitle: { color: colors.muted, fontSize: 10, marginTop: 4 },
  ownerCard: { padding: 18 },
  ownerOrb: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  ownerPhoto: { width: 46, height: 46, borderRadius: 16 },
  ownerOrbText: { color: colors.onBrandPrimary, fontSize: 20, fontWeight: "900" },
  ownerName: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  officialTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: `${colors.success}18` },
  officialText: { color: colors.success, fontSize: 10, fontWeight: "800" },
  contactRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  contactButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", gap: 6 },
  contactPrimary: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  contactText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "800" },
  adminEntry: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, borderRadius: 14, backgroundColor: colors.brandTertiary },
  adminEntryText: { flex: 1, color: colors.onBrandTertiary, fontSize: 12, fontWeight: "800" },
}));
