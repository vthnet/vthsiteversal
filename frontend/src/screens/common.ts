import { makeStyles } from "@/src/theme";

// Display currency is a customer preference; backend amounts remain in INR (source of truth).
let displayCurrency = "INR";
let usdRate = 84;
export const setDisplayCurrency = (code: string, rate: number) => { displayCurrency = code; usdRate = rate || 84; };
export const getDisplayCurrency = () => displayCurrency;
export const money = (value: number, _base = "INR") => displayCurrency === "USD" ? `$${(Number(value || 0) / usdRate).toFixed(2)}` : `₹${Number(value || 0).toFixed(2)}`;
export const shortDate = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const useCommonStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 12, gap: 18 },
  eyebrow: { color: colors.brandSecondary, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  pageTitle: { color: colors.onSurface, fontSize: 25, fontWeight: "800", marginTop: 6 },
  pageSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  headerIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  sectionTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  sectionText: { color: colors.muted, fontSize: 11, marginTop: 5 },
  label: { color: colors.muted, fontSize: 9, letterSpacing: 1.2, fontWeight: "800" },
  value: { color: colors.onSurface, fontSize: 16, fontWeight: "800", marginTop: 6 },
  body: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17 },
  muted: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  box: { padding: 14, borderRadius: 15, backgroundColor: colors.surfaceTertiary },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  chipTextActive: { color: colors.onBrandPrimary },
  primaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: colors.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
  primaryButtonText: { color: colors.onBrandPrimary, fontSize: 13, fontWeight: "800" },
  secondaryButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.surfaceSecondary },
  secondaryButtonText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "800" },
  dangerText: { color: colors.error, fontSize: 12, fontWeight: "800" },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, paddingHorizontal: 14, fontSize: 14 },
  copyButton: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, minHeight: 34 },
  copyText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  pressed: { opacity: 0.72 },
  divider: { height: 1, backgroundColor: colors.divider },
}));
