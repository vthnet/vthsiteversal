import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnnouncementBanner, BrandMark, CategoryCard, Footer, GlassCard, SectionTitle, Skeleton, VthIcon, WalletCard } from "@/src/components/vth-ui";
import { Image } from "expo-image";
import { Category, LiveUpdate, PublicSettings, UserProfile, Wallet } from "@/src/models";
import { money, useCommonStyles } from "@/src/screens/common";
import { makeStyles, useTheme } from "@/src/theme";

type Props = {
  categories: Category[];
  wallet: Wallet;
  profile: UserProfile | null;
  settings: PublicSettings;
  loading: boolean;
  announcementDismissed: boolean;
  onDismissAnnouncement: () => void;
  onCategory: (category: Category) => void;
  onRecharge: () => void;
  onOrders: () => void;
  onSupport: () => void;
  onOpenLink: (url: string) => void;
  onMenu: () => void;
  onBell: () => void;
  unread: number;
  liveUpdates: LiveUpdate[];
};

export function HomeScreen({ categories, wallet, profile, settings, loading, announcementDismissed, onDismissAnnouncement, onCategory, onRecharge, onOrders, onSupport, onOpenLink, onMenu, onBell, unread, liveUpdates }: Props) {
  const insets = useSafeAreaInsets();
  const common = useCommonStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const telegramCategories = categories.filter((c) => c.platform === "telegram");
  const whatsappCategories = categories.filter((c) => c.platform === "whatsapp");
  return (
    <ScrollView testID="vth-home-screen" showsVerticalScrollIndicator={false} contentContainerStyle={[common.scrollContent, { paddingBottom: insets.bottom + 100 }]}>
      <View style={styles.header}><Pressable testID="owner-avatar" onPress={onMenu} style={({ pressed }) => [styles.headerLeft, pressed && { opacity: 0.8 }]}>{settings.branding.owner_photo_url || settings.branding.logo_url ? <Image source={{ uri: settings.branding.owner_photo_url || settings.branding.logo_url }} style={styles.ownerAvatar} /> : <BrandMark />}{(settings.branding.owner_photo_url || settings.branding.logo_url) ? <View><Text style={styles.brandName}>{settings.branding.store_name}</Text><Text style={styles.brandCaption}>OFFICIAL STORE</Text></View> : null}</Pressable><View style={styles.headerRight}><Pressable testID="notification-bell" onPress={onBell} style={styles.bell}><VthIcon name="bell" size={20} color={colors.onSurface} />{unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text></View>}</Pressable><Pressable testID="profile-menu-button" onPress={onMenu} style={styles.avatar}>{profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{profile?.first_name?.[0]?.toUpperCase() ?? "V"}</Text>}</Pressable></View></View>
      {settings.announcement.active && !announcementDismissed && <AnnouncementBanner message={settings.announcement.message} buttonLabel={settings.announcement.button_label || undefined} onPress={settings.announcement.button_link ? () => onOpenLink(settings.announcement.button_link) : undefined} onDismiss={onDismissAnnouncement} />}
      <View><Text style={common.eyebrow}>{settings.branding.store_name.toUpperCase()} · MINI APP</Text><Text style={styles.greetingTitle}>Welcome back{profile ? `, ${profile.first_name}` : ""} 👋</Text><Text style={styles.greetingSub}>{settings.branding.tagline}</Text></View>
      <WalletCard balance={wallet.balance} onRecharge={onRecharge} />
      {liveUpdates.length > 0 && <GlassCard accent testID="live-updates"><View style={common.rowBetween}><View style={common.row}><View style={styles.liveDot} /><Text style={common.eyebrow}>LIVE UPDATE</Text></View><Text style={common.muted}>Updated {timeAgo(liveUpdates[0].created_at)}</Text></View><Text style={styles.liveTitle}>{liveUpdates[0].title}</Text><Text style={common.body}>{liveUpdates[0].message}</Text>{liveUpdates[0].button_label && liveUpdates[0].button_link ? <Pressable onPress={() => onOpenLink(liveUpdates[0].button_link!)} hitSlop={6}><Text style={styles.liveAction}>{liveUpdates[0].button_label} →</Text></Pressable> : null}</GlassCard>}
      <View style={styles.quickRow}><QuickStat icon="shield" title="Protected" value="Server verified" /><QuickStat icon="bolt" title="Fast access" value="Instant delivery" /><Pressable testID="home-orders" onPress={onOrders} style={styles.quickStat}><VthIcon name="orders" size={17} color={colors.brandSecondary} /><Text style={styles.quickStatTitle}>Orders</Text><Text style={styles.quickStatValue}>View all</Text></Pressable></View>
      <SectionTitle title="Telegram" action="View orders" onAction={onOrders} />
      <View style={styles.grid}>{loading ? [0, 1, 2].map((i) => <Skeleton key={i} height={204} style={styles.gridSkeleton} />) : telegramCategories.map((category) => <CategoryCard key={category.id} category={category} onPress={() => onCategory(category)} />)}</View>
      {!loading && whatsappCategories.length > 0 && <><SectionTitle title="WhatsApp" /><View style={styles.grid}>{whatsappCategories.map((category) => <CategoryCard key={category.id} category={category} onPress={() => onCategory(category)} />)}</View></>}
      <GlassCard accent><View style={styles.trustCard}><View style={styles.trustIcon}><VthIcon name="shield" size={20} color={colors.brandSecondary} /></View><View style={styles.trustCopy}><Text style={styles.trustTitle}>Built for responsible access</Text><Text style={styles.trustText}>Every purchase is verified server-side. Wallet balance {money(wallet.balance, wallet.currency)} is protected.</Text></View></View></GlassCard>
      <Footer text={settings.branding.footer_text} storeName={settings.branding.store_name} onSupport={onSupport} />
    </ScrollView>
  );
}

function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} d ago`;
}

function QuickStat({ icon, title, value }: { icon: string; title: string; value: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return <View style={styles.quickStat}><VthIcon name={icon} size={17} color={colors.brandSecondary} /><Text style={styles.quickStatTitle}>{title}</Text><Text style={styles.quickStatValue}>{value}</Text></View>;
}

const useStyles = makeStyles((colors) => ({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 9 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  ownerAvatar: { width: 34, height: 34, borderRadius: 12 },
  brandName: { color: colors.onSurface, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  brandCaption: { color: colors.muted, fontSize: 8, letterSpacing: 1.1, marginTop: 2 },
  bell: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: colors.onError, fontSize: 9, fontWeight: "900" },
  avatarImage: { width: 42, height: 42, borderRadius: 15 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginTop: 10, marginBottom: 4 },
  liveAction: { color: colors.onSurface, fontSize: 12, fontWeight: "800", marginTop: 8 },
  avatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandTertiary, fontSize: 18, fontWeight: "800" },
  greetingTitle: { color: colors.onSurface, fontSize: 28, lineHeight: 33, fontWeight: "800", marginTop: 6 },
  greetingSub: { color: colors.muted, fontSize: 13, marginTop: 5 },
  quickRow: { flexDirection: "row", gap: 8 },
  quickStat: { flex: 1, minHeight: 77, padding: 11, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  quickStatTitle: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", marginTop: 9 },
  quickStatValue: { color: colors.muted, fontSize: 10, marginTop: 3 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  gridSkeleton: { width: "48.5%", marginBottom: 0 },
  trustCard: { flexDirection: "row", alignItems: "center" },
  trustIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  trustCopy: { flex: 1, marginLeft: 12 },
  trustTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "800" },
  trustText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
}));
