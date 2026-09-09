import { useEffect, useMemo, useState } from "react";
import { Image } from "expo-image";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Footer, GlassCard, PaymentMethodCard, SectionTitle, StateBlock, StatusBadge, TopBar, VthIcon, WalletCard } from "@/src/components/vth-ui";
import { Payment, PaymentMethod, PublicSettings, Wallet, WalletTransaction } from "@/src/models";
import { money, shortDate, useCommonStyles } from "@/src/screens/common";
import { ApiError, createPayment, submitPaymentReference, verifyPayment } from "@/src/services/api";
import { makeStyles, useTheme } from "@/src/theme";
import { telegram } from "@/src/telegram";

type Props = { wallet: Wallet; methods: PaymentMethod[]; transactions: WalletTransaction[]; payments: Payment[]; settings: PublicSettings; onRefresh: () => Promise<void>; onToast: (message: string, tone?: "success" | "error") => void; onCopy: (value: string) => void; onSupport: () => void };
type LedgerFilter = "all" | "deposits" | "purchases" | "refunds";
const PENDING = new Set(["awaiting_verification", "submitted"]);

export function WalletScreen({ wallet, methods, transactions, payments, settings, onRefresh, onToast, onCopy, onSupport }: Props) {
  const insets = useSafeAreaInsets();
  const common = useCommonStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const [selected, setSelected] = useState("auto-upi");
  const [amount, setAmount] = useState("100");
  const [intent, setIntent] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all");
  const method = methods.find((m) => m.id === selected);
  const pending = payments.filter((p) => PENDING.has(p.status));
  const minAmount = Math.max(settings.store.min_recharge, method?.min_amount ?? 0), maxAmount = Math.min(settings.store.max_recharge, method?.max_amount || Number.MAX_SAFE_INTEGER);

  useEffect(() => { if (method && (!method.enabled || method.maintenance)) { const next = methods.find((m) => m.enabled && !m.maintenance); if (next) setSelected(next.id); } }, [method, methods]);

  const submit = async () => {
    const numeric = Number(amount);
    if (!numeric || numeric < minAmount || numeric > maxAmount) { onToast(`Enter an amount between ${money(minAmount)} and ${money(maxAmount)}`, "error"); return; }
    setBusy(true);
    try { setIntent(await createPayment(selected, numeric)); await onRefresh(); } catch (error) { onToast((error as ApiError).message || "Payment service unavailable", "error"); } finally { setBusy(false); }
  };
  const refresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };
  const ledger = useMemo(() => transactions.filter((t) => ledgerFilter === "all" || (ledgerFilter === "deposits" ? t.type === "recharge" || t.type === "adjustment" : ledgerFilter === "purchases" ? t.type === "purchase" : t.type === "refund")), [transactions, ledgerFilter]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={common.flex}>
      <ScrollView testID="vth-wallet-screen" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[common.scrollContent, { paddingBottom: insets.bottom + 100 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brandSecondary} />}>
        <TopBar title="Wallet" subtitle="Balance and secure recharges" right={<View style={common.headerIcon}><VthIcon name="shield" color={colors.brandSecondary} /></View>} />
        <WalletCard balance={wallet.balance} onRecharge={() => setIntent(null)} />
        {!settings.store.feature_wallet ? <StateBlock icon="wrench" tone="warning" title="Recharges paused" description={settings.store.maintenance_message} /> : intent ? <PaymentPanel payment={intent} method={methods.find((m) => m.id === intent.method)} onUpdate={setIntent} onDone={() => setIntent(null)} onRefresh={onRefresh} onToast={onToast} onCopy={onCopy} /> : <>
          <SectionTitle title="Add funds" />
          <View style={common.chipRow}>{[100, 250, 500, 1000, 2000].map((value) => <Pressable key={value} testID={`amount-${value}`} onPress={() => setAmount(String(value))} style={[common.chip, amount === String(value) && common.chipActive]}><Text style={[common.chipText, amount === String(value) && common.chipTextActive]}>₹{value}</Text></Pressable>)}</View>
          <View style={styles.amountInput}><Text style={styles.rupee}>₹</Text><TextInput testID="amount-input" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.amountText} placeholder="Enter amount" placeholderTextColor={colors.muted} /><Text style={common.muted}>{money(minAmount)} – {money(maxAmount)}</Text></View>
          <SectionTitle title="Payment method" />
          <View>{methods.map((m) => <PaymentMethodCard key={m.id} method={m} selected={selected === m.id} onPress={() => setSelected(m.id)} />)}</View>
          {method && <GlassCard accent style={styles.panel}><View style={common.rowBetween}><View style={{ flex: 1 }}><Text style={common.sectionTitle}>{method.title}</Text><Text style={common.sectionText}>{method.kind === "manual" ? "You pay, then submit a reference for review." : method.mode === "unavailable" ? "Automatic gateway is not configured yet." : "Automatic verification happens server-side."}</Text></View><VthIcon name="bolt" size={21} color={colors.brandSecondary} /></View><View style={[common.rowBetween, common.box, { marginTop: 14 }]}><View><Text style={common.label}>YOU PAY</Text><Text style={common.value}>{money(Number(amount || 0))}</Text></View><View style={{ alignItems: "flex-end" }}><Text style={common.label}>WALLET CREDIT</Text><Text style={common.value}>{money(Number(amount || 0))}</Text></View></View><Pressable testID="create-payment" disabled={busy} onPress={submit} style={({ pressed }) => [common.primaryButton, pressed && common.pressed]}>{busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Text style={common.primaryButtonText}>{method.kind === "manual" ? "Get payment details" : "Create secure payment"}</Text><VthIcon name="arrow" size={17} color={colors.onBrandPrimary} /></>}</Pressable></GlassCard>}
        </>}
        {pending.length > 0 && !intent && <><SectionTitle title="Pending deposits" action={`${pending.length}`} />{pending.map((p) => <Pressable key={p.id} testID={`pending-${p.id}`} onPress={() => setIntent(p)} style={({ pressed }) => [styles.pendingRow, pressed && common.pressed]}><View style={styles.pendingIcon}><VthIcon name="clock" size={17} color={colors.warning} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{money(p.amount)} · {methods.find((m) => m.id === p.method)?.title ?? p.method}</Text><Text style={common.muted}>{p.id} · {shortDate(p.created_at)}</Text></View><StatusBadge status={p.status} compact /></Pressable>)}</>}
        <SectionTitle title="Transaction history" />
        <View style={common.chipRow}>{([["all", "All"], ["deposits", "Deposits"], ["purchases", "Purchases"], ["refunds", "Refunds"]] as [LedgerFilter, string][]).map(([id, label]) => <Pressable key={id} testID={`ledger-${id}`} onPress={() => setLedgerFilter(id)} style={[common.chip, ledgerFilter === id && common.chipActive]}><Text style={[common.chipText, ledgerFilter === id && common.chipTextActive]}>{label}</Text></Pressable>)}</View>
        <View>{ledger.length ? ledger.map((t, index) => <TransactionRow key={t.id} transaction={t} last={index === ledger.length - 1} />) : <StateBlock icon="wallet" title="No transactions yet" description="Your wallet activity will appear here." />}</View>
        {payments.some((p) => !PENDING.has(p.status) && !p.credited) && <><SectionTitle title="Closed deposits" />{payments.filter((p) => !PENDING.has(p.status) && !p.credited).slice(0, 5).map((p) => <View key={p.id} style={styles.pendingRow}><View style={styles.pendingIcon}><VthIcon name="alert" size={17} color={colors.muted} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{money(p.amount)} · {p.id}</Text><Text style={common.muted}>{p.message}</Text></View><StatusBadge status={p.status} compact /></View>)}</>}
        <Footer text={settings.branding.footer_text} storeName={settings.branding.store_name} onSupport={onSupport} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PaymentPanel({ payment, method, onUpdate, onDone, onRefresh, onToast, onCopy }: { payment: Payment; method?: PaymentMethod; onUpdate: (p: Payment) => void; onDone: () => void; onRefresh: () => Promise<void>; onToast: Props["onToast"]; onCopy: (v: string) => void }) {
  const common = useCommonStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const info = payment.instructions;
  const isManual = info.mode === "manual";
  const check = async () => { setBusy(true); try { const next = await verifyPayment(payment.id); onUpdate(next); if (next.credited) { onToast("Payment verified — wallet credited", "success"); await onRefresh(); } else onToast(next.status === "expired" ? "Payment window expired" : "Still pending — no payment received yet", next.status === "expired" ? "error" : "success"); } catch (error) { onToast((error as ApiError).message, "error"); } finally { setBusy(false); } };
  const submit = async () => { if (reference.trim().length < 4) { onToast("Enter a valid reference", "error"); return; } setBusy(true); try { onUpdate(await submitPaymentReference(payment.id, reference)); onToast("Reference submitted for review", "success"); await onRefresh(); } catch (error) { onToast((error as ApiError).message, "error"); } finally { setBusy(false); } };
  useEffect(() => { if (isManual || payment.credited || !PENDING.has(payment.status)) return; const timer = setInterval(() => { verifyPayment(payment.id).then((next) => { onUpdate(next); if (next.credited) { onToast("Payment verified — wallet credited", "success"); void onRefresh(); } }).catch(() => undefined); }, 15000); return () => clearInterval(timer); }, [payment.id, payment.status, payment.credited, isManual, onUpdate, onRefresh, onToast]);
  return (
    <GlassCard accent style={styles.panel} testID="payment-panel">
      <View style={common.rowBetween}><View style={{ flex: 1 }}><Text style={common.sectionTitle}>{payment.credited ? "Wallet credited" : payment.status === "submitted" ? "Under review" : "Payment pending verification"}</Text><Text style={common.sectionText}>{payment.message}</Text></View><StatusBadge status={payment.status} compact /></View>
      <View style={[common.box, { marginTop: 14 }]}><View style={common.rowBetween}><View><Text style={common.label}>PAYMENT ORDER</Text><Text style={styles.paymentId}>{payment.id}</Text></View><View style={{ alignItems: "flex-end" }}><Text style={common.label}>AMOUNT</Text><Text style={common.value}>{money(payment.amount, payment.currency)}</Text></View></View>{payment.expires_at && !payment.credited ? <Text style={[common.muted, { marginTop: 8 }]}>Valid until {shortDate(payment.expires_at)}</Text> : null}</View>
      {!payment.credited && <View style={styles.instructions}>
        {(info.type === "upi_qr" || info.type === "manual_upi") && <><View style={styles.qrRow}><View style={styles.qr}>{info.qr_url || info.qr_image_url ? <Image source={{ uri: info.qr_url || info.qr_image_url }} contentFit="contain" style={styles.qrImage} /> : <View style={styles.qrInner}><VthIcon name="qr" size={34} color={colors.onSurfaceInverse} /></View>}</View><View style={{ flex: 1 }}><Text style={common.label}>UPI ID</Text><Text style={common.value}>{info.upi_id || "Not configured yet"}</Text>{info.upi_id ? <Pressable onPress={() => onCopy(info.upi_id!)} style={common.copyButton}><VthIcon name="copy" size={15} color={colors.onSurfaceSecondary} /><Text style={common.copyText}>Copy UPI ID</Text></Pressable> : <Text style={[common.muted, { marginTop: 6 }]}>The store owner has not added UPI details yet.</Text>}</View></View>{info.note || info.instructions ? <Text style={[common.muted, { marginTop: 12 }]}>{info.instructions || info.note}</Text> : null}{info.invoice_url ? <Pressable onPress={() => telegram.openLink(info.invoice_url!)} style={common.copyButton}><Text style={common.copyText}>Open payment page</Text><VthIcon name="arrow" size={14} color={colors.onSurfaceSecondary} /></Pressable> : null}</>}
        {(info.type === "crypto_invoice" || info.type === "manual_crypto") && <><Text style={common.label}>SUPPORTED</Text><Text style={common.value}>{info.coins || "—"}{info.network ? ` · ${info.network}` : ""}</Text>{info.wallet_addresses?.length ? info.wallet_addresses.map((line) => <Pressable key={line} onPress={() => onCopy(line.split(" ").pop() ?? line)} style={[common.box, { marginTop: 8 }]}><Text style={common.body}>{line}</Text><View style={common.copyButton}><VthIcon name="copy" size={14} color={colors.onSurfaceSecondary} /><Text style={common.copyText}>Copy address</Text></View></Pressable>) : <Text style={[common.muted, { marginTop: 8 }]}>{info.note || "Payment address not configured yet."}</Text>}{info.instructions ? <Text style={[common.muted, { marginTop: 12 }]}>{info.instructions}</Text> : null}</>}
        
      </View>}
      {!payment.credited && isManual && payment.status !== "submitted" && <><Text style={[common.label, { marginTop: 16 }]}>{info.requires === "tx_hash" ? "TRANSACTION HASH" : "UPI REFERENCE (UTR)"}</Text><TextInput testID="payment-reference" value={reference} onChangeText={setReference} placeholder={info.requires === "tx_hash" ? "Paste transaction hash" : "12-digit UTR number"} placeholderTextColor={colors.muted} style={[common.input, { marginTop: 8 }]} autoCapitalize="none" /><Pressable testID="submit-reference" disabled={busy} onPress={submit} style={common.primaryButton}>{busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Text style={common.primaryButtonText}>Submit for verification</Text><VthIcon name="upload" size={17} color={colors.onBrandPrimary} /></>}</Pressable></>}
      {!payment.credited && !isManual && PENDING.has(payment.status) && <Pressable testID="check-payment" disabled={busy} onPress={check} style={common.primaryButton}>{busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <><Text style={common.primaryButtonText}>I have paid — check status</Text><VthIcon name="refresh" size={17} color={colors.onBrandPrimary} /></>}</Pressable>}
      <Pressable testID="payment-done" onPress={onDone} style={[common.secondaryButton, { marginTop: 10 }]}><Text style={common.secondaryButtonText}>{payment.credited ? "Done" : "Back to wallet"}</Text></Pressable>
    </GlassCard>
  );
}

function TransactionRow({ transaction, last }: { transaction: WalletTransaction; last: boolean }) {
  const styles = useStyles();
  const common = useCommonStyles();
  const { colors } = useTheme();
  const positive = transaction.amount > 0;
  const icon = transaction.type === "refund" ? "refresh" : positive ? "plus" : "orders";
  const title = transaction.type === "recharge" ? "Wallet recharge" : transaction.type === "refund" ? "Refund" : transaction.type === "adjustment" ? "Balance adjustment" : "Purchase";
  return <View style={styles.txRow}><View style={styles.txRail}><View style={[styles.txIcon, positive && styles.txIconPositive]}><VthIcon name={icon} size={16} color={positive ? colors.success : colors.brandSecondary} /></View>{!last && <View style={styles.txLine} />}</View><View style={styles.txCopy}><View style={common.rowBetween}><Text style={styles.rowTitle}>{title}</Text><Text style={[styles.txAmount, { color: positive ? colors.success : colors.onSurface }]}>{positive ? "+" : "−"}{money(Math.abs(transaction.amount))}</Text></View><Text style={common.muted}>{transaction.reference} · {shortDate(transaction.created_at)}</Text>{transaction.note ? <Text style={common.muted}>{transaction.note}</Text> : null}</View></View>;
}

const useStyles = makeStyles((colors) => ({
  amountInput: { height: 52, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", paddingHorizontal: 15, gap: 8 },
  rupee: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  amountText: { flex: 1, color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  panel: { padding: 16 },
  paymentId: { color: colors.onSurface, fontSize: 15, fontWeight: "800", letterSpacing: 0.5, marginTop: 6 },
  instructions: { marginTop: 14 },
  qrRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  qr: { width: 82, height: 82, padding: 8, backgroundColor: colors.surfaceInverse, borderRadius: 10 },
  qrImage: { width: "100%", height: "100%" },
  qrInner: { flex: 1, borderWidth: 3, borderColor: colors.onSurfaceInverse, alignItems: "center", justifyContent: "center" },
  pendingRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginBottom: 8 },
  pendingIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "800" },
  txRow: { flexDirection: "row", gap: 12, minHeight: 64 },
  txRail: { alignItems: "center", width: 36 },
  txIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  txIconPositive: { backgroundColor: `${colors.success}18` },
  txLine: { flex: 1, width: 2, backgroundColor: colors.divider, marginVertical: 4 },
  txCopy: { flex: 1, paddingBottom: 14, gap: 3 },
  txAmount: { fontSize: 13, fontWeight: "800" },
}));
