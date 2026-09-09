import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { AdminButton, AdminCard, EmptyRow, FieldInput, HealthRow, SelectRow, ToggleRow, confirmAction, useAdminStyles } from "@/src/admin/ui";
import { VthIcon } from "@/src/components/vth-ui";
import { ApiError, admin, adminDelete, adminPost, adminPut } from "@/src/services/api";
import { useTheme } from "@/src/theme";

export type SettingsField = { key: string; label: string; type: "text" | "textarea" | "number" | "boolean" | "secret" | "select" | "url"; default: unknown; help?: string; options?: string[] };
export type SettingsView = { section: { id: string; title: string; description: string; group: string; icon: string; fields: SettingsField[] }; values: Record<string, unknown>; secrets: Record<string, { configured: boolean; masked: string }>; updated_at?: string | null; updated_by?: string | null };

const TEST_TARGETS: Record<string, string> = { bot: "bot", logging: "notifications", provider_telegram_1: "provider_telegram_1", provider_telegram_2: "provider_telegram_2", provider_numbers: "provider_numbers", pay_auto_upi: "auto-upi", pay_auto_crypto: "auto-crypto", pay_manual_upi: "manual-upi", pay_manual_crypto: "manual-crypto" };

export function SettingsForm({ sectionId, onToast, initial }: { sectionId: string; onToast: (m: string, tone?: "success" | "error") => void; initial?: SettingsView }) {
  const styles = useAdminStyles();
  const { colors } = useTheme();
  const [view, setView] = useState<SettingsView | null>(initial ?? null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<{ status: string; detail?: string } | null>(null);

  const load = useCallback(async () => {
    try { const next = await admin<SettingsView>(`/settings/${sectionId}`); setView(next); setDraft(next.values); setSecretDrafts({}); setRevealed({}); } catch (error) { onToast((error as ApiError).message, "error"); }
  }, [sectionId, onToast]);
  useEffect(() => { void load(); }, [load]);

  if (!view) return <ActivityIndicator color={colors.brandSecondary} style={{ marginTop: 24 }} />;

  const save = async () => {
    setSaving(true);
    try {
      const values: Record<string, unknown> = { ...draft };
      for (const [key, value] of Object.entries(secretDrafts)) if (value.trim()) values[key] = value.trim();
      for (const field of view.section.fields) if (field.type === "secret" && !secretDrafts[field.key]) delete values[field.key];
      const next = await adminPut<SettingsView>(`/settings/${sectionId}`, { values });
      setView(next); setDraft(next.values); setSecretDrafts({}); setRevealed({});
      onToast("Settings saved", "success");
    } catch (error) { onToast((error as ApiError).message, "error"); } finally { setSaving(false); }
  };
  const reveal = async (key: string) => {
    try { const result = await adminPost<{ value: string }>(`/settings/${sectionId}/secrets/${key}/reveal`); setRevealed((r) => ({ ...r, [key]: result.value })); setTimeout(() => setRevealed((r) => { const next = { ...r }; delete next[key]; return next; }), 15000); } catch (error) { onToast((error as ApiError).message, "error"); }
  };
  const clear = (key: string) => confirmAction("Remove secret", "The stored credential will be deleted from the server.", async () => { try { const next = await adminDelete<SettingsView>(`/settings/${sectionId}/secrets/${key}`); setView(next); setDraft(next.values); onToast("Secret removed"); } catch (error) { onToast((error as ApiError).message, "error"); } });
  const runTest = async () => { setTest({ status: "testing" }); try { setTest(await adminPost(`/health/test/${TEST_TARGETS[sectionId]}`)); } catch (error) { setTest({ status: "error", detail: (error as ApiError).message }); } };

  return <AdminCard title={view.section.title} subtitle={view.section.description} testID={`settings-${sectionId}`}>
    {view.section.fields.map((field) => {
      if (field.type === "boolean") return <ToggleRow key={field.key} testID={`toggle-${field.key}`} label={field.label} help={field.help} value={Boolean(draft[field.key])} onChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))} />;
      if (field.type === "select") return <SelectRow key={field.key} label={field.label} value={String(draft[field.key] ?? field.default)} options={field.options ?? []} onChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))} />;
      if (field.type === "secret") {
        const state = view.secrets[field.key];
        return <View key={field.key} style={styles.field}><Text style={styles.fieldLabel}>{field.label}</Text>{state?.configured && secretDrafts[field.key] === undefined ? <View style={styles.secretRow}><VthIcon name="shield" size={15} color={colors.success} /><Text style={styles.secretText} numberOfLines={1}>{revealed[field.key] ?? state.masked}</Text><Pressable testID={`reveal-${field.key}`} onPress={() => revealed[field.key] ? setRevealed((r) => { const n = { ...r }; delete n[field.key]; return n; }) : reveal(field.key)} hitSlop={6}><VthIcon name={revealed[field.key] ? "eye-off" : "eye"} size={17} color={colors.onSurfaceSecondary} /></Pressable><Pressable testID={`replace-${field.key}`} onPress={() => setSecretDrafts((s) => ({ ...s, [field.key]: "" }))} hitSlop={6}><VthIcon name="refresh" size={17} color={colors.onSurfaceSecondary} /></Pressable><Pressable onPress={() => clear(field.key)} hitSlop={6}><VthIcon name="trash" size={17} color={colors.error} /></Pressable></View> : <FieldInput testID={`secret-${field.key}`} label="" value={secretDrafts[field.key] ?? ""} onChange={(v) => setSecretDrafts((s) => ({ ...s, [field.key]: v }))} placeholder={state?.configured ? "Enter new value to replace" : "Not configured — paste value"} secure />}<Text style={styles.fieldHelp}>{field.help || "Stored encrypted server-side. Never shown in full after saving."}{state?.configured ? " · Show is temporary (15s) and audited." : ""}</Text></View>;
      }
      return <FieldInput key={field.key} testID={`field-${field.key}`} label={field.label} help={field.help} value={draft[field.key] === undefined || draft[field.key] === null ? "" : String(draft[field.key])} onChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))} multiline={field.type === "textarea"} keyboardType={field.type === "number" ? "decimal-pad" : field.type === "url" ? "url" : "default"} placeholder={field.type === "url" ? "https://" : undefined} />;
    })}
    {test && <View style={styles.warn}><VthIcon name={test.status === "online" ? "check" : "info"} size={14} color={colors.warning} /><Text style={styles.warnText}>Connection test: {test.status}{test.detail ? ` — ${test.detail}` : ""}</Text></View>}
    <View style={styles.buttonRow}><AdminButton testID={`save-${sectionId}`} label="Save changes" icon="check" busy={saving} onPress={save} />{TEST_TARGETS[sectionId] && <AdminButton tone="secondary" icon="pulse" label="Test connection" busy={test?.status === "testing"} onPress={runTest} />}</View>
    {view.updated_at ? <Text style={[styles.fieldHelp, { marginTop: 10 }]}>Last updated {new Date(view.updated_at).toLocaleString("en-IN")} by {view.updated_by}</Text> : null}
  </AdminCard>;
}

export function SettingsGroup({ sectionIds, onToast }: { sectionIds: string[]; onToast: (m: string, tone?: "success" | "error") => void }) {
  const styles = useAdminStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState<string>(sectionIds[0]);
  const [meta, setMeta] = useState<SettingsView[]>([]);
  useEffect(() => { admin<SettingsView[]>("/settings").then(setMeta).catch(() => undefined); }, []);
  if (sectionIds.length === 1) return <SettingsForm sectionId={sectionIds[0]} onToast={onToast} />;
  return <View>{sectionIds.map((id) => { const info = meta.find((m) => m.section.id === id); const active = open === id; return <View key={id}><Pressable testID={`section-${id}`} onPress={() => setOpen(active ? "" : id)} style={[styles.card, { marginBottom: active ? 4 : 12, flexDirection: "row", alignItems: "center", gap: 10 }]}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{info?.section.title ?? id}</Text>{info && <Text style={styles.cardSubtitle}>{info.values.enabled === undefined ? info.section.description : info.values.enabled ? "Enabled" : "Disabled"}{info.secrets && Object.values(info.secrets).some((s) => !s.configured) ? " · credentials missing" : ""}</Text>}</View><VthIcon name={active ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} /></Pressable>{active && <SettingsForm sectionId={id} onToast={onToast} />}</View>; })}{!meta.length && <EmptyRow text="Loading sections…" />}<HealthHint /></View>;
}

function HealthHint() {
  const styles = useAdminStyles();
  const { colors } = useTheme();
  return <View style={styles.warn}><VthIcon name="shield" size={14} color={colors.warning} /><Text style={styles.warnText}>Credentials are encrypted at rest and only handled server-side. Customers never see provider or gateway names.</Text></View>;
}

export { HealthRow };
