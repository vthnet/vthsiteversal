import { ReactNode, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Switch, Text, TextInput, View } from "react-native";

import { StatusBadge, VthIcon } from "@/src/components/vth-ui";
import { makeStyles, useTheme } from "@/src/theme";

export function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web") { if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) onConfirm(); return; }
  Alert.alert(title, message, [{ text: "Cancel", style: "cancel" }, { text: "Confirm", style: "destructive", onPress: onConfirm }]);
}

export function AdminCard({ title, subtitle, children, right, testID }: { title?: string; subtitle?: string; children?: ReactNode; right?: ReactNode; testID?: string }) {
  const styles = useAdminStyles();
  return <View style={styles.card} testID={testID}>{(title || right) && <View style={styles.cardHeader}><View style={{ flex: 1 }}>{title && <Text style={styles.cardTitle}>{title}</Text>}{subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}</View>{right}</View>}{children}</View>;
}

export function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "warning" | "error" }) {
  const styles = useAdminStyles();
  const { colors } = useTheme();
  const color = tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "error" ? colors.error : colors.onSurface;
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={[styles.statValue, { color }]}>{value}</Text></View>;
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  const styles = useAdminStyles();
  return <View style={styles.kv}><Text style={styles.kvLabel}>{label}</Text>{typeof value === "string" || typeof value === "number" ? <Text style={styles.kvValue} numberOfLines={2}>{value}</Text> : value}</View>;
}

export function AdminButton({ label, onPress, tone = "primary", icon, busy, disabled, small, testID }: { label: string; onPress: () => void; tone?: "primary" | "secondary" | "danger"; icon?: string; busy?: boolean; disabled?: boolean; small?: boolean; testID?: string }) {
  const styles = useAdminStyles();
  const { colors } = useTheme();
  const textColor = tone === "primary" ? colors.onBrandPrimary : tone === "danger" ? colors.error : colors.onSurfaceSecondary;
  return <Pressable testID={testID} disabled={busy || disabled} onPress={onPress} style={({ pressed }) => [styles.button, small && styles.buttonSmall, tone === "primary" && styles.buttonPrimary, tone === "danger" && styles.buttonDanger, (pressed || disabled) && styles.pressed]}>{busy ? <ActivityIndicator color={textColor} size="small" /> : <>{icon && <VthIcon name={icon} size={small ? 13 : 15} color={textColor} />}<Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: textColor }]}>{label}</Text></>}</Pressable>;
}

export function FieldInput({ label, value, onChange, placeholder, multiline, keyboardType, secure, help, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: "default" | "numeric" | "decimal-pad" | "url"; secure?: boolean; help?: string; testID?: string }) {
  const styles = useAdminStyles();
  const { colors } = useTheme();
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} multiline={multiline} secureTextEntry={secure} keyboardType={keyboardType} autoCapitalize="none" style={[styles.input, multiline && styles.inputMultiline]} />{help ? <Text style={styles.fieldHelp}>{help}</Text> : null}</View>;
}

export function ToggleRow({ label, value, onChange, help, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; help?: string; testID?: string }) {
  const styles = useAdminStyles();
  const { colors } = useTheme();
  return <View style={styles.toggleRow}><View style={{ flex: 1 }}><Text style={styles.fieldLabel}>{label}</Text>{help ? <Text style={styles.fieldHelp}>{help}</Text> : null}</View><Switch testID={testID} value={value} onValueChange={onChange} trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }} thumbColor={colors.onSurface} /></View>;
}

export function SelectRow({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const styles = useAdminStyles();
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.selectRow}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.selectChip, value === option && styles.selectChipActive]}><Text style={[styles.selectText, value === option && styles.selectTextActive]}>{option}</Text></Pressable>)}</View></View>;
}

export function HealthRow({ item, onTest }: { item: { id: string; label: string; status: string; detail?: string }; onTest?: (id: string) => Promise<void> }) {
  const styles = useAdminStyles();
  const [busy, setBusy] = useState(false);
  return <View style={styles.healthRow}><View style={{ flex: 1 }}><Text style={styles.kvValue}>{item.label}</Text>{item.detail ? <Text style={styles.fieldHelp}>{item.detail}</Text> : null}</View><StatusBadge status={item.status} compact />{onTest && <AdminButton small tone="secondary" label="Test" busy={busy} onPress={async () => { setBusy(true); await onTest(item.id); setBusy(false); }} />}</View>;
}

export function EmptyRow({ text }: { text: string }) {
  const styles = useAdminStyles();
  return <Text style={styles.empty}>{text}</Text>;
}

export const useAdminStyles = makeStyles((colors) => ({
  card: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginBottom: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  cardTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  cardSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { width: "48%", padding: 12, borderRadius: 14, backgroundColor: colors.surfaceTertiary, minHeight: 66 },
  statLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "800", textTransform: "uppercase" },
  statValue: { fontSize: 19, fontWeight: "800", marginTop: 6 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  kvLabel: { color: colors.muted, fontSize: 11 },
  kvValue: { color: colors.onSurface, fontSize: 12, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  buttonSmall: { minHeight: 34, paddingHorizontal: 11, borderRadius: 10 },
  buttonPrimary: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  buttonDanger: { borderColor: `${colors.error}66`, backgroundColor: `${colors.error}14` },
  buttonText: { fontSize: 12, fontWeight: "800" },
  buttonTextSmall: { fontSize: 11 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  pressed: { opacity: 0.7 },
  field: { marginBottom: 12 },
  fieldLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", marginBottom: 6 },
  fieldHelp: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 4 },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, paddingHorizontal: 12, fontSize: 13 },
  inputMultiline: { minHeight: 84, paddingTop: 10, textAlignVertical: "top" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: 6 },
  selectRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  selectChip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, justifyContent: "center" },
  selectChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  selectText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  selectTextActive: { color: colors.onBrandPrimary },
  healthRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  secretRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 12 },
  secretText: { flex: 1, color: colors.onSurface, fontSize: 13, letterSpacing: 1 },
  listRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 6 },
  listTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  listTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "800", flexShrink: 1 },
  listMeta: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  empty: { color: colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 20 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  warn: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 12, backgroundColor: `${colors.warning}14`, marginBottom: 12 },
  warnText: { flex: 1, color: colors.warning, fontSize: 10, lineHeight: 15, fontWeight: "600" },
}));
