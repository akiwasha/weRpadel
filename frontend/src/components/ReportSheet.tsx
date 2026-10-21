import { useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius, type } from "@/src/lib/theme";

export const REPORT_REASONS: { key: string; label: string }[] = [
  { key: "hate", label: "Haine ou discrimination" },
  { key: "harassment", label: "Harcèlement ou insultes" },
  { key: "violence", label: "Violence ou menaces" },
  { key: "sexual", label: "Contenu sexuel" },
  { key: "spam", label: "Spam ou arnaque" },
  { key: "fake", label: "Faux profil / usurpation" },
  { key: "other", label: "Autre" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  reportedUserId: string;
  reportedPseudo: string;
  contextType?: "message" | "announcement" | "profile";
  contextId?: string;
  onReported?: () => void;
};

export function ReportSheet({ visible, onClose, reportedUserId, reportedPseudo, contextType = "profile", contextId, onReported }: Props) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setReason(null); setDetails(""); setErr(null); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!reason) { setErr("Choisis un motif"); return; }
    setErr(null); setSending(true);
    try {
      await api.reportUser({ reported_user_id: reportedUserId, reason, details: details.trim() || undefined, context_type: contextType, context_id: contextId });
      close();
      onReported?.();
      Alert.alert("Merci pour ton signalement", "Notre équipe va l'examiner rapidement. Tu peux aussi bloquer ce joueur pour ne plus le voir.");
    } catch (e: any) {
      setErr(e.message || "Envoi impossible");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.sheet} testID="report-sheet">
          <View style={styles.handle} />
          <Text style={styles.title}>Signaler {reportedPseudo}</Text>
          <Text style={styles.subtitle}>Pourquoi signales-tu ce joueur ? Le signalement est confidentiel.</Text>
          <View style={styles.reasons}>
            {REPORT_REASONS.map((r) => {
              const active = reason === r.key;
              return (
                <Pressable key={r.key} testID={`report-reason-${r.key}`} onPress={() => setReason(r.key)} style={[styles.reason, active && styles.reasonActive]}>
                  <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? colors.brandPrimary : colors.onSurfaceTertiary} />
                  <Text style={[styles.reasonText, active && { color: colors.onSurface, fontWeight: "700" }]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            testID="report-details-input"
            style={styles.input}
            value={details}
            onChangeText={setDetails}
            placeholder="Précisions (facultatif)"
            placeholderTextColor={colors.onSurfaceTertiary}
            multiline
            maxLength={1000}
          />
          {err && <Text style={styles.error} testID="report-error">{err}</Text>}
          <Pressable testID="report-submit" onPress={submit} disabled={sending} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
            {sending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Envoyer le signalement</Text>}
          </Pressable>
          <Pressable testID="report-cancel" onPress={close} style={styles.cancel} hitSlop={8}>
            <Text style={styles.cancelText}>Annuler</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surfaceInverse, opacity: 0.45 },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.lg + 8, borderTopRightRadius: radius.lg + 8,
    padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.xs },
  title: { fontSize: type.xl, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: type.base, color: colors.onSurfaceSecondary, lineHeight: 20 },
  reasons: { gap: 2 },
  reason: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 10, minHeight: 44 },
  reasonActive: {},
  reasonText: { fontSize: type.base, color: colors.onSurfaceSecondary },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: type.base, color: colors.onSurface, minHeight: 64, maxHeight: 120,
  },
  error: { color: colors.error, fontSize: type.base, textAlign: "center" },
  btn: { backgroundColor: colors.error, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", minHeight: 48, justifyContent: "center" },
  btnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.base },
  cancel: { alignItems: "center", paddingVertical: spacing.sm },
  cancelText: { color: colors.onSurfaceSecondary, fontWeight: "600" },
});
