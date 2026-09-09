import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { PlatformLogo, VthIcon } from "@/src/components/vth-ui";
import { Product, PublicSettings, PurchasePreview, PurchaseResult, ServerOption } from "@/src/models";
import { money, useCommonStyles } from "@/src/screens/common";
import { ApiError, createPurchase, getPurchasePreview, getServers, validatePromo } from "@/src/services/api";
import { makeStyles, useTheme } from "@/src/theme";

export function PolicyContent({ product, onCancel, onContinue }: { product: Product; onCancel: () => void; onContinue: () => void }) {
  const common = useCommonStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  return <><Text style={styles.eyebrow}>PURCHASE POLICY</Text><Text style={styles.title}>Before you continue</Text><View style={[common.row, { marginTop: 9 }]}><PlatformLogo platform={product.platform} size={14} /><Text style={styles.productLine}>{product.flag} {product.country_name} · {product.product_name}</Text></View><View style={styles.list}>{["Check your selected product and country before purchasing.", "Availability and pricing can change in real time.", "Follow platform terms and applicable laws.", "Never use products for spam, fraud, abuse, or impersonation.", "Refund eligibility depends on the product policy."].map((line) => <View key={line} style={styles.listRow}><VthIcon name="check" size={16} color={colors.success} /><Text style={styles.listText}>{line}</Text></View>)}</View><View style={styles.actions}><Pressable testID="policy-cancel" onPress={onCancel} style={[common.secondaryButton, { flex: 1 }]}><Text style={common.secondaryButtonText}>Cancel</Text></Pressable><Pressable testID="policy-continue" onPress={onContinue} style={[common.primaryButton, { flex: 1.25, marginTop: 0 }]}><Text style={common.primaryButtonText}>Continue</Text><VthIcon name="arrow" size={16} color={colors.onBrandPrimary} /></Pressable></View></>;
}

type Stage = "loading" | "choose_server" | "ready" | "processing" | "insufficient_balance" | "out_of_stock" | "maintenance" | "created" | "failed_refunded" | "error";

export function ConfirmationContent({ product, settings, onRecharge, onViewOrder, onPurchased, onToast, onCopy }: { product: Product; settings: PublicSettings; onRecharge: () => void; onViewOrder: (orderId: string) => void; onPurchased: () => Promise<void>; onToast: (message: string, tone?: "success" | "error") => void; onCopy: (value: string) => void }) {
  const common = useCommonStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const [stage, setStage] = useState<Stage>("loading");
  const [preview, setPreview] = useState<PurchasePreview | null>(null);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [server, setServer] = useState<ServerOption | null>(null);
  const [promo, setPromo] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [message, setMessage] = useState("");

  const load = async (code?: string, serverId?: string) => {
    setStage("loading");
    try {
      const next = await getPurchasePreview(product.id, code, serverId);
      setPreview(next);
      setStage(next.status === "ready" ? "ready" : next.status);
    } catch (error) { setMessage((error as ApiError).message); setStage("error"); }
  };
  useEffect(() => {
    (async () => {
      const options = product.product_type === "number" ? await getServers(product.id).catch(() => [] as ServerOption[]) : [];
      setServers(options);
      if (options.length) { setStage("choose_server"); return; }
      await load();
    })();
  }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseServer = (option: ServerOption) => {
    if (!option.enabled) { onToast(option.message || "Currently unavailable. Please try again later.", "error"); return; }
    setServer(option);
    void load(appliedPromo, option.id);
  };
  const applyPromo = async () => {
    if (!promo.trim()) return;
    try { await validatePromo(promo.trim(), preview?.price ?? product.price); setAppliedPromo(promo.trim().toUpperCase()); onToast("Promo code applied", "success"); await load(promo.trim(), server?.id); } catch (error) { onToast((error as ApiError).message, "error"); }
  };
  const confirm = async () => {
    setStage("processing");
    try {
      const next = await createPurchase(product.id, appliedPromo, server?.id);
      setResult(next);
      setMessage(next.message ?? "");
      setStage(next.status);
      if (next.status === "created" || next.status === "failed_refunded") await onPurchased();
    } catch (error) { setMessage((error as ApiError).message); setStage("error"); }
  };

  const title = { loading: "Checking availability", choose_server: "Choose operator", ready: "Confirm purchase", processing: "Placing your order", insufficient_balance: "Insufficient balance", out_of_stock: "Unavailable", maintenance: "Temporarily unavailable", created: "Order placed", failed_refunded: "Order refunded", error: "Something went wrong" }[stage];
  const balance = preview?.wallet_balance ?? 0, finalAmount = preview?.final_amount ?? product.price;
  return <>
    <Text style={styles.eyebrow}>FINAL CHECK</Text><Text style={styles.title}>{title}</Text>
    <View style={styles.productBox}><Text style={styles.flag}>{product.flag}</Text><View style={{ flex: 1, marginLeft: 10 }}><View style={common.row}><PlatformLogo platform={product.platform} size={12} /><Text style={styles.productName}>{product.product_name}</Text></View><Text style={common.muted}>{product.country_name}</Text></View><View style={{ alignItems: "flex-end" }}>{preview && preview.discount > 0 && <Text style={styles.strike}>{money(preview.price)}</Text>}<Text style={styles.price}>{money(finalAmount)}</Text></View></View>
    {servers.length > 0 && stage !== "created" && stage !== "failed_refunded" && <View style={styles.serverList}>{servers.map((option) => <Pressable key={option.id} testID={`server-${option.id}`} onPress={() => chooseServer(option)} style={[styles.serverRow, server?.id === option.id && styles.serverRowActive, !option.enabled && styles.serverRowDisabled]}><View style={[styles.serverDot, { backgroundColor: option.enabled ? colors.success : colors.error }]} /><View style={{ flex: 1 }}><Text style={styles.serverName}>{option.name}</Text><Text style={common.muted}>{option.enabled ? "Available now" : "Currently unavailable"}</Text></View><Text style={styles.price}>{money(option.price)}</Text></Pressable>)}</View>}
    {stage === "choose_server" && <Text style={styles.note}>Select an available operator to continue. Prices are confirmed server-side.</Text>}
    {stage !== "created" && stage !== "failed_refunded" && stage !== "choose_server" && <View style={styles.balanceBox}><View><Text style={common.label}>CURRENT WALLET</Text><Text style={styles.balance}>{money(balance)}</Text></View><VthIcon name="arrow" color={colors.muted} /><View style={{ alignItems: "flex-end" }}><Text style={common.label}>AFTER PURCHASE</Text><Text style={[styles.balance, { color: balance - finalAmount < 0 ? colors.error : colors.success }]}>{money(balance - finalAmount)}</Text></View></View>}
    {stage === "ready" && settings.store.feature_promo && <View style={styles.promoRow}><TextInput testID="promo-input" value={promo} onChangeText={setPromo} placeholder="Promo code" placeholderTextColor={colors.muted} autoCapitalize="characters" style={[common.input, { flex: 1 }]} /><Pressable testID="promo-apply" onPress={applyPromo} style={[common.secondaryButton, { paddingHorizontal: 16 }]}><Text style={common.secondaryButtonText}>{appliedPromo ? "Applied" : "Apply"}</Text></Pressable></View>}
    {stage === "choose_server" ? null : stage === "loading" || stage === "processing" ? <View style={styles.processing}><ActivityIndicator color={colors.brandSecondary} /><Text style={styles.processingText}>{stage === "loading" ? "Verifying product, price and wallet…" : "Placing order securely. Do not close this screen."}</Text></View>
      : stage === "ready" ? <Pressable testID="confirm-purchase" onPress={confirm} style={common.primaryButton}><Text style={common.primaryButtonText}>Confirm & pay {money(finalAmount)}</Text><VthIcon name="shield" size={17} color={colors.onBrandPrimary} /></Pressable>
      : stage === "insufficient_balance" ? <><Text style={styles.note}>Your wallet needs {money(finalAmount - balance)} more before this order can continue. No purchase was made.</Text><Pressable testID="go-recharge" onPress={onRecharge} style={common.primaryButton}><Text style={common.primaryButtonText}>Recharge wallet</Text><VthIcon name="arrow" size={17} color={colors.onBrandPrimary} /></Pressable></>
      : stage === "created" ? <><View style={styles.receipt} testID="receipt"><Text style={styles.eyebrow}>{settings.branding.store_name} · RECEIPT</Text>{[["Order ID", result?.order_id ?? ""], ["Product", product.product_name], ["Country", product.country_name], ["Amount", money(finalAmount)], ["Date", new Date().toLocaleString("en-IN")], ["Status", "Processing"]].map(([k, v]) => <View key={k} style={styles.receiptRow}><Text style={common.muted}>{k}</Text><Text style={styles.receiptValue}>{v}</Text></View>)}</View><View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}><Pressable testID="copy-order-id" onPress={() => result?.order_id && onCopy(result.order_id)} style={[common.secondaryButton, { flex: 1 }]}><VthIcon name="copy" size={14} color={colors.onSurfaceSecondary} /><Text style={common.secondaryButtonText}>Copy Order ID</Text></Pressable><Pressable testID="view-order" onPress={() => result?.order_id && onViewOrder(result.order_id)} style={[common.primaryButton, { flex: 1, marginTop: 0 }]}><Text style={common.primaryButtonText}>View order</Text><VthIcon name="arrow" size={16} color={colors.onBrandPrimary} /></Pressable></View></>
      : <Text style={styles.note}>{stage === "out_of_stock" ? "This product is currently out of stock. Please choose another country." : stage === "maintenance" ? settings.store.maintenance_message : message || "Please try again shortly."}</Text>}
  </>;
}

const useStyles = makeStyles((colors) => ({
  eyebrow: { color: colors.brandSecondary, fontSize: 10, letterSpacing: 1.6, fontWeight: "800" },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "800", marginTop: 7, paddingRight: 32 },
  productLine: { color: colors.onSurfaceSecondary, fontSize: 13 },
  list: { marginTop: 20, gap: 13 },
  listRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  listText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", gap: 10, marginTop: 23 },
  productBox: { flexDirection: "row", alignItems: "center", marginTop: 20, padding: 13, borderRadius: 16, backgroundColor: colors.surfaceTertiary },
  flag: { fontSize: 25 },
  productName: { color: colors.onSurface, fontSize: 13, fontWeight: "800" },
  price: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  strike: { color: colors.muted, fontSize: 11, textDecorationLine: "line-through" },
  balanceBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, padding: 13, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
  balance: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginTop: 6 },
  promoRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  processing: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 17, padding: 14, borderRadius: 15, backgroundColor: colors.surfaceTertiary },
  processingText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 18 },
  serverList: { marginTop: 14, gap: 8 },
  serverRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  serverRowActive: { borderColor: colors.borderStrong, backgroundColor: colors.brandTertiary },
  serverRowDisabled: { opacity: 0.6 },
  serverDot: { width: 8, height: 8, borderRadius: 4 },
  serverName: { color: colors.onSurface, fontSize: 13, fontWeight: "800" },
  receipt: { marginTop: 16, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceTertiary, gap: 8 },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  receiptValue: { color: colors.onSurface, fontSize: 12, fontWeight: "800", flexShrink: 1, textAlign: "right" },
}));
