import { FontAwesome, MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { ReactNode, useEffect, useRef } from "react";
import { Animated, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";

import { Category, Order, PaymentMethod, Platform as ProductPlatform, Product, Screen } from "@/src/models";
import { money } from "@/src/screens/common";
import { makeStyles, useTheme } from "@/src/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

// Official brand colors — identical in every theme.
export const PLATFORM_BRAND: Record<ProductPlatform, { color: string; label: string; icon: "telegram" | "whatsapp" }> = {
  telegram: { color: "#229ED9", label: "Telegram", icon: "telegram" },
  whatsapp: { color: "#25D366", label: "WhatsApp", icon: "whatsapp" },
};

const iconMap: Record<string, IconName> = {
  "shield-check": "shield-check",
  tag: "tag-outline",
  repeat: "repeat",
  whatsapp: "whatsapp",
  "message-circle": "message-text-outline",
  home: "home-variant-outline",
  orders: "clipboard-text-outline",
  wallet: "wallet-outline",
  profile: "account-circle-outline",
  search: "magnify",
  filter: "filter-variant",
  sort: "sort",
  arrow: "arrow-right",
  plus: "plus",
  close: "close",
  check: "check-circle-outline",
  clock: "clock-outline",
  copy: "content-copy",
  bolt: "lightning-bolt-outline",
  qr: "qrcode-scan",
  bitcoin: "bitcoin",
  upload: "cloud-upload-outline",
  cards: "wallet-plus-outline",
  back: "arrow-left",
  info: "information-outline",
  refresh: "refresh",
  support: "headset",
  shield: "shield-lock-outline",
  settings: "tune-variant",
  chevron: "chevron-right",
  server: "server-outline",
  robot: "robot-outline",
  storefront: "storefront-outline",
  bullhorn: "bullhorn-outline",
  tune: "tune",
  "text-box-multiple": "text-box-multiple-outline",
  "message-text": "message-text-outline",
  qrcode: "qrcode",
  "cloud-upload": "cloud-upload-outline",
  users: "account-group-outline",
  pulse: "pulse",
  logout: "logout",
  eye: "eye-outline",
  "eye-off": "eye-off-outline",
  trash: "trash-can-outline",
  star: "star",
  alert: "alert-circle-outline",
  ticket: "ticket-percent-outline",
  history: "history",
  "chevron-down": "chevron-down",
  "chevron-up": "chevron-up",
  wrench: "wrench-outline",
  link: "open-in-new",
  megaphone: "bullhorn-outline",
  telegram: "send-circle-outline",
  bell: "bell-outline",
};

export function VthIcon({ name, size = 20, color, ...props }: { name: string; size?: number; color?: string } & Omit<React.ComponentProps<typeof MaterialCommunityIcons>, "name" | "size" | "color">) {
  return <MaterialCommunityIcons {...props} name={iconMap[name] ?? "circle-outline"} size={size} color={color} />;
}

export function PlatformLogo({ platform, size = 22, badge = false }: { platform: ProductPlatform; size?: number; badge?: boolean }) {
  const styles = useStyles();
  const brand = PLATFORM_BRAND[platform];
  if (!badge) return <FontAwesome name={brand.icon} size={size} color={brand.color} />;
  return <View style={[styles.platformBadge, { borderColor: `${brand.color}55`, backgroundColor: `${brand.color}1A` }]}><FontAwesome name={brand.icon} size={12} color={brand.color} /><Text style={[styles.platformBadgeText, { color: brand.color }]}>{brand.label}</Text></View>;
}

export function Footer({ text = "Powered by VTH NETWORK", storeName = "VTH NETWORK", onSupport }: { text?: string; storeName?: string; onSupport?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return <View style={styles.footer} testID="vth-footer"><View style={styles.footerRow}><View style={styles.footerOrb}><Text style={styles.footerOrbText}>V</Text></View><View style={styles.footerCopy}><Text style={styles.footerStore}>{storeName}</Text><Text style={styles.footerMeta}>Official Store</Text></View>{onSupport && <Pressable onPress={onSupport} style={({ pressed }) => [styles.footerSupport, pressed && styles.pressed]}><VthIcon name="support" size={14} color={colors.onSurfaceSecondary} /><Text style={styles.footerSupportText}>Support</Text></Pressable>}</View><Text style={styles.footerText}>{text}</Text></View>;
}

export function AnnouncementBanner({ message, buttonLabel, onPress, onDismiss }: { message: string; buttonLabel?: string; onPress?: () => void; onDismiss: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return <View style={styles.announcement} testID="vth-announcement"><VthIcon name="megaphone" size={18} color={colors.brandSecondary} /><View style={styles.announcementCopy}><Text style={styles.announcementText}>{message}</Text>{buttonLabel && onPress ? <Pressable onPress={onPress} hitSlop={6}><Text style={styles.announcementAction}>{buttonLabel} →</Text></Pressable> : null}</View><Pressable onPress={onDismiss} style={styles.announcementClose} hitSlop={8}><VthIcon name="close" size={16} color={colors.muted} /></Pressable></View>;
}

export function Skeleton({ height = 72, radius = 18, style }: { height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[styles.skeleton, { height, borderRadius: radius, opacity: pulse }, style]} />;
}

export function StateBlock({ icon, title, description, actionLabel, onAction, tone = "muted" }: { icon: string; title: string; description: string; actionLabel?: string; onAction?: () => void; tone?: "muted" | "error" | "warning" }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = tone === "error" ? colors.error : tone === "warning" ? colors.warning : colors.muted;
  return <View style={styles.stateBlock}><View style={[styles.stateIcon, { backgroundColor: `${color}1A` }]}><VthIcon name={icon} size={22} color={color} /></View><Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateText}>{description}</Text>{actionLabel && onAction ? <Pressable onPress={onAction} style={({ pressed }) => [styles.stateAction, pressed && styles.pressed]}><VthIcon name="refresh" size={15} color={colors.onSurface} /><Text style={styles.stateActionText}>{actionLabel}</Text></Pressable> : null}</View>;
}

export function GlassCard({ children, style, accent = false, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; accent?: boolean; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.glassWrap, accent && styles.accentWrap, style]}>
      <BlurView intensity={22} tint="dark" style={styles.blur}>
        <View style={styles.glassInner}>{children}</View>
      </BlurView>
      {accent && <View style={[styles.accentLine, { backgroundColor: colors.brandPrimary }]} />}
    </View>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.brandRow}>
      <View style={styles.logoOrb}><Text style={styles.logoText}>V</Text></View>
      <View>
        <Text style={styles.brandName}>VTH {compact ? "STORE" : "NETWORK"}</Text>
        {!compact && <Text style={styles.brandCaption}>PRIVATE DIGITAL MARKETPLACE</Text>}
      </View>
    </View>
  );
}

export function TopBar({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.topBar}>
      {onBack ? <Pressable onPress={onBack} style={styles.iconButton}><VthIcon name="back" color={colors.onSurface} /></Pressable> : <BrandMark compact />}
      <View style={styles.topTitleWrap}>
        <Text style={styles.topTitle}>{title}</Text>
        {subtitle ? <Text style={styles.topSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? <View style={styles.iconButton} />}
    </View>
  );
}

export function WalletCard({ balance, onRecharge }: { balance: number; onRecharge: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <LinearGradient colors={[colors.surfaceTertiary, colors.surfaceSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.walletCard}>
      <View style={styles.walletGlow} />
      <View style={styles.walletHeader}><Text style={styles.walletLabel}>AVAILABLE BALANCE</Text><VthIcon name="wallet" size={18} color={colors.onBrandTertiary} /></View>
      <Text style={styles.balance}>{money(balance)}</Text>
      <View style={styles.walletFooter}><Text style={styles.walletHint}>Ready for your next order</Text><Pressable onPress={onRecharge} style={({ pressed }) => [styles.rechargeButton, pressed && styles.pressed]}><VthIcon name="plus" size={16} color={colors.onBrandPrimary} /><Text style={styles.rechargeText}>Recharge</Text></Pressable></View>
    </LinearGradient>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return <View style={styles.sectionTitle}><Text style={styles.sectionText}>{title}</Text>{action ? <Pressable onPress={onAction} hitSlop={8}><Text style={styles.sectionAction}>{action}<VthIcon name="chevron" size={14} color={colors.brandSecondary} /></Text></Pressable> : null}</View>;
}

export function CategoryCard({ category, onPress }: { category: Category; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const brand = PLATFORM_BRAND[category.platform];
  return (
    <Pressable testID={`category-${category.id}`} onPress={() => { Haptics.selectionAsync(); onPress(); }} style={({ pressed }) => [styles.categoryCard, { borderColor: `${brand.color}33` }, pressed && styles.pressed]}>
      <View style={[styles.categoryGlow, { backgroundColor: `${brand.color}22` }]} />
      <View style={styles.categoryTop}><View style={[styles.categoryIcon, { backgroundColor: `${brand.color}1F` }]}><PlatformLogo platform={category.platform} size={24} /></View>{category.maintenance ? <VthIcon name="wrench" size={16} color={colors.warning} /> : <VthIcon name="arrow" size={18} color={colors.onSurfaceTertiary} />}</View>
      <Text style={[styles.categoryPlatform, { color: brand.color }]}>{brand.label}</Text>
      <Text style={styles.categoryTitle} numberOfLines={2}>{category.title.replace("Telegram Account — ", "").replace("Telegram ", "").replace("WhatsApp ", "")}</Text>
      <Text style={styles.categoryDescription} numberOfLines={2}>{category.description}</Text>
      <View style={styles.categoryBadge}><Text style={styles.categoryBadgeText}>{category.maintenance ? "MAINTENANCE" : category.badge}</Text></View>
    </Pressable>
  );
}

export function SearchField({ value, onChangeText, placeholder = "Search countries" }: Pick<TextInputProps, "value" | "onChangeText" | "placeholder">) {
  const styles = useStyles();
  const { colors } = useTheme();
  return <View style={styles.searchField}><VthIcon name="search" size={20} color={colors.muted} /><TextInput testID="country-search" value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} style={styles.searchInput} autoCapitalize="none" /></View>;
}

export function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const statusInfo: Record<string, { label: string; color: string; icon: string }> = {
    completed: { label: "Completed", color: colors.success, icon: "check" },
    credited: { label: "Credited", color: colors.success, icon: "check" },
    awaiting_otp: { label: "Waiting for OTP", color: colors.warning, icon: "clock" },
    awaiting_verification: { label: "Pending verification", color: colors.warning, icon: "clock" },
    submitted: { label: "Under review", color: colors.info, icon: "clock" },
    pending: { label: "Pending", color: colors.warning, icon: "clock" },
    processing: { label: "Processing", color: colors.info, icon: "clock" },
    cancelled: { label: "Cancelled", color: colors.muted, icon: "close" },
    refunded: { label: "Refunded", color: colors.brandSecondary, icon: "refresh" },
    failed: { label: "Failed", color: colors.error, icon: "alert" },
    rejected: { label: "Rejected", color: colors.error, icon: "alert" },
    expired: { label: "Expired", color: colors.muted, icon: "clock" },
    amount_mismatch: { label: "Amount mismatch", color: colors.error, icon: "alert" },
    online: { label: "Online", color: colors.success, icon: "check" },
    offline: { label: "Offline", color: colors.muted, icon: "close" },
    error: { label: "Error", color: colors.error, icon: "alert" },
    not_configured: { label: "Not configured", color: colors.warning, icon: "info" },
  };
  const info = statusInfo[status] ?? { label: status, color: colors.muted, icon: "info" };
  return <View style={[styles.statusBadge, compact && styles.statusBadgeCompact, { borderColor: `${info.color}55`, backgroundColor: `${info.color}18` }]}><VthIcon name={info.icon} size={compact ? 11 : 13} color={info.color} /><Text style={[styles.statusText, { color: info.color }]}>{info.label}</Text></View>;
}

export function ProductRow({ product, onBuy }: { product: Product; onBuy: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const disabled = !product.available;
  const stockColor = product.maintenance ? colors.warning : product.stock === 0 ? colors.error : (product.stock ?? 99) < 30 ? colors.warning : colors.success;
  return <GlassCard style={styles.productRow}><View style={styles.productRowInner}>
    <View style={styles.countryFlag}><Text style={styles.flag}>{product.flag}</Text></View>
    <View style={styles.productInfo}>
      <View style={styles.productTitleRow}><Text style={styles.productName} numberOfLines={1}>{product.country_name}</Text>{product.popular && <View style={styles.popularTag}><VthIcon name="star" size={9} color={colors.warning} /><Text style={styles.popularText}>Popular</Text></View>}</View>
      <View style={styles.productMetaRow}><PlatformLogo platform={product.platform} size={11} /><Text style={styles.productMeta}>{product.product_name}</Text></View>
      <View style={styles.stockRow}><View style={[styles.stockDot, { backgroundColor: stockColor }]} /><Text style={[styles.stockText, { color: stockColor }]}>{product.maintenance ? "Temporarily unavailable" : product.stock === null ? product.stock_label : `${product.stock_label} · ${product.stock} available`}</Text></View>
    </View>
    <View style={styles.productAction}><Text style={styles.productPrice}>{money(product.price)}</Text><Pressable testID={`buy-${product.id}`} disabled={disabled} onPress={onBuy} style={({ pressed }) => [styles.buyButton, disabled && styles.disabledButton, pressed && styles.pressed]}><Text style={[styles.buyText, disabled && styles.disabledText]}>{disabled ? "Unavailable" : "Buy Now"}</Text></Pressable></View>
  </View></GlassCard>;
}

export function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return <Pressable testID={`order-${order.id}`} onPress={onPress} style={({ pressed }) => [styles.orderCard, pressed && styles.pressed]}><View style={styles.orderTop}><View style={styles.orderFlag}><Text style={styles.flag}>{order.flag}</Text></View><View style={styles.orderMain}><View style={styles.orderTitleRow}><Text style={styles.orderTitle}>{order.product}</Text><Text style={styles.orderAmount}>{money(order.amount)}</Text></View><View style={styles.productMetaRow}><PlatformLogo platform={order.platform} size={11} /><Text style={styles.orderMeta}>{order.country}</Text></View><Text style={styles.orderId}>{order.id}</Text></View></View><View style={styles.orderBottom}><StatusBadge status={order.status} /><Text style={styles.orderDate}>{new Date(order.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Text><VthIcon name="chevron" size={18} color={colors.muted} /></View></Pressable>;
}

export function PaymentMethodCard({ method, selected, onPress }: { method: PaymentMethod; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const iconName = method.icon === "qr-code" ? "qr" : method.icon === "upload-cloud" ? "upload" : method.icon === "wallet-cards" ? "cards" : method.icon;
  const unavailable = !method.enabled || method.maintenance;
  return <Pressable testID={`method-${method.id}`} onPress={onPress} disabled={unavailable} style={({ pressed }) => [styles.paymentCard, selected && styles.paymentSelected, unavailable && styles.paymentDisabled, pressed && styles.pressed]}><View style={styles.paymentIcon}><VthIcon name={iconName} size={21} color={selected ? colors.onBrandPrimary : colors.brandSecondary} /></View><View style={styles.paymentInfo}><View style={styles.paymentTitleRow}><Text style={styles.paymentTitle}>{method.title}</Text>{method.mode === "unavailable" && <Text style={styles.statusTag}>UNAVAILABLE</Text>}{method.maintenance && <Text style={styles.statusTag}>MAINTENANCE</Text>}</View><Text style={styles.paymentSubtitle}>{method.subtitle}</Text></View>{selected && <VthIcon name="check" size={19} color={colors.brandSecondary} />}</Pressable>;
}

export function BottomNav({ active, onChange }: { active: Screen; onChange: (screen: Screen) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const items: { id: Screen; label: string; icon: string }[] = [{ id: "home", label: "Home", icon: "home" }, { id: "orders", label: "Orders", icon: "orders" }, { id: "wallet", label: "Wallet", icon: "wallet" }, { id: "profile", label: "Profile", icon: "profile" }];
  return <View style={styles.navWrap}><BlurView intensity={30} tint="dark" style={styles.navBlur}>{items.map((item) => { const selected = active === item.id; return <Pressable key={item.id} testID={`tab-${item.id}`} onPress={() => { Haptics.selectionAsync(); onChange(item.id); }} style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}><View style={[styles.navIcon, selected && styles.navIconActive]}><VthIcon name={item.icon} size={21} color={selected ? colors.onBrandPrimary : colors.muted} /></View><Text style={[styles.navLabel, selected && styles.navLabelActive]}>{item.label}</Text></Pressable>; })}</BlurView></View>;
}

export function ModalSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return <View style={styles.modalOverlay}><Pressable onPress={onClose} style={StyleSheet.absoluteFill} /><View style={styles.modalSheet}><View style={styles.modalHandle} /><Pressable onPress={onClose} style={styles.modalClose}><VthIcon name="close" color={colors.muted} /></Pressable>{children}</View></View>;
}

const useStyles = makeStyles((colors) => ({
  glassWrap: { overflow: "hidden", borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  accentWrap: { borderColor: colors.borderStrong },
  blur: { overflow: "hidden" },
  glassInner: { padding: 16 },
  accentLine: { position: "absolute", left: 0, top: 18, bottom: 18, width: 2, borderRadius: 2 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  logoOrb: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  logoText: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: "800" },
  brandName: { color: colors.onSurface, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  brandCaption: { color: colors.muted, fontSize: 8, letterSpacing: 1.1, marginTop: 2 },
  topBar: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  topTitleWrap: { flex: 1, alignItems: "center" },
  topTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  topSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  walletCard: { minHeight: 164, borderRadius: 22, padding: 20, overflow: "hidden", borderWidth: 1, borderColor: colors.borderStrong },
  walletGlow: { position: "absolute", width: 140, height: 140, borderRadius: 70, backgroundColor: colors.brandTertiary, right: -34, top: -30 },
  walletHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  walletLabel: { color: colors.onSurfaceTertiary, fontSize: 11, letterSpacing: 1.5, fontWeight: "700" },
  balance: { color: colors.onSurface, fontSize: 35, fontWeight: "800", letterSpacing: -1, marginTop: 12 },
  walletFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
  walletHint: { color: colors.muted, fontSize: 12 },
  rechargeButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 13, backgroundColor: colors.brandPrimary, flexDirection: "row", alignItems: "center", gap: 6 },
  rechargeText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.72 },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionText: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  sectionAction: { color: colors.brandSecondary, fontSize: 12, fontWeight: "700" },
  categoryCard: { width: "48.5%", minHeight: 204, padding: 15, borderRadius: 20, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, justifyContent: "space-between", overflow: "hidden" },
  categoryGlow: { position: "absolute", width: 110, height: 110, borderRadius: 55, right: -40, top: -40 },
  categoryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  categoryIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  categoryPlatform: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 14, textTransform: "uppercase" },
  categoryTitle: { color: colors.onSurface, fontSize: 15, lineHeight: 19, fontWeight: "800", marginTop: 4 },
  categoryDescription: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  categoryBadge: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 5 },
  categoryBadgeText: { color: colors.onBrandTertiary, fontSize: 9, fontWeight: "800", letterSpacing: 0.5, flexShrink: 1 },
  platformBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  platformBadgeText: { fontSize: 10, fontWeight: "800" },
  footer: { marginTop: 8, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.divider, alignItems: "center", gap: 12 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch" },
  footerOrb: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  footerOrbText: { color: colors.onBrandPrimary, fontSize: 17, fontWeight: "900" },
  footerCopy: { flex: 1 },
  footerStore: { color: colors.onSurface, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  footerMeta: { color: colors.muted, fontSize: 10, marginTop: 2 },
  footerSupport: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 36, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  footerSupportText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  footerText: { color: colors.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: "700", textTransform: "uppercase" },
  announcement: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.brandTertiary },
  announcementCopy: { flex: 1 },
  announcementText: { color: colors.onSurface, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  announcementAction: { color: colors.brandSecondary, fontSize: 11, fontWeight: "800", marginTop: 5 },
  announcementClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  skeleton: { backgroundColor: colors.surfaceTertiary, marginBottom: 10 },
  stateBlock: { alignItems: "center", paddingVertical: 34, paddingHorizontal: 24 },
  stateIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  stateTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginTop: 13 },
  stateText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 5 },
  stateAction: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 42, paddingHorizontal: 16, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginTop: 16 },
  stateActionText: { color: colors.onSurface, fontSize: 12, fontWeight: "800" },
  searchField: { height: 48, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 14 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  statusBadgeCompact: { paddingHorizontal: 6, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "700" },
  productRow: { marginBottom: 10 },
  productRowInner: { flexDirection: "row", alignItems: "center" },
  countryFlag: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  flag: { fontSize: 23 },
  productInfo: { flex: 1, marginLeft: 11 },
  productTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  productName: { color: colors.onSurface, fontSize: 15, fontWeight: "800", flexShrink: 1 },
  popularTag: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: `${colors.warning}1F` },
  popularText: { color: colors.warning, fontSize: 9, fontWeight: "800" },
  productMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  productMeta: { color: colors.muted, fontSize: 11 },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7 },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockText: { fontSize: 10, fontWeight: "700" },
  productAction: { alignItems: "flex-end", gap: 8 },
  productPrice: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  buyButton: { minHeight: 36, paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  buyText: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: "800" },
  disabledButton: { backgroundColor: colors.surfaceTertiary },
  disabledText: { color: colors.muted },
  orderCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: 15, borderRadius: 18, marginBottom: 11 },
  orderTop: { flexDirection: "row" },
  orderFlag: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  orderMain: { flex: 1, marginLeft: 11 },
  orderTitleRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  orderTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  orderAmount: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  orderMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  orderId: { color: colors.onSurfaceTertiary, fontSize: 10, marginTop: 6, letterSpacing: 0.4 },
  orderBottom: { flexDirection: "row", alignItems: "center", marginTop: 14, gap: 9 },
  orderDate: { flex: 1, color: colors.muted, fontSize: 10, textAlign: "right" },
  paymentCard: { minHeight: 72, padding: 12, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 9 },
  paymentSelected: { borderColor: colors.borderStrong, backgroundColor: colors.brandTertiary },
  paymentDisabled: { opacity: 0.5 },
  paymentIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  paymentInfo: { flex: 1 },
  paymentTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  paymentTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  statusTag: { color: colors.warning, fontSize: 8, fontWeight: "900", letterSpacing: 0.8, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, backgroundColor: `${colors.warning}1F` },
  paymentSubtitle: { color: colors.muted, fontSize: 11, marginTop: 4 },
  navWrap: { position: "absolute", left: 12, right: 12, bottom: 10, overflow: "hidden", borderRadius: 24, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceSecondary },
  navBlur: { flexDirection: "row", minHeight: 70, paddingHorizontal: 8, paddingTop: 7 },
  navItem: { flex: 1, alignItems: "center", minHeight: 58, gap: 2 },
  navIcon: { width: 38, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  navIconActive: { backgroundColor: colors.brandPrimary },
  navLabel: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  navLabelActive: { color: colors.onSurface, fontWeight: "800" },
  modalOverlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0, 0, 0, 0.7)", justifyContent: "flex-end", zIndex: 20 },
  modalSheet: { minHeight: "51%", backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 18, borderWidth: 1, borderColor: colors.borderStrong },
  modalHandle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, marginBottom: 10 },
  modalClose: { position: "absolute", right: 16, top: 16, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
}));
