import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, TextInput, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Keyboard, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius, type } from "@/src/lib/theme";
import MatchDatePicker from "@/src/components/MatchDatePicker";

type Props = {
  visible: boolean;
  clubId: string;
  clubName?: string;
  onClose: () => void;
  onPosted: (announcement: any) => void;
};

function parsePrice(raw: string): number | null {
  const s = raw.replace(",", ".").trim();
  if (s === "") return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export default function CreateMatchSheet({ visible, clubId, clubName, onClose, onPosted }: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [text, setText] = useState("");
  const [matchDate, setMatchDate] = useState<string | null>(null);
  const [matchEndDate, setMatchEndDate] = useState<string | null>(null);
  const [courtPrice, setCourtPrice] = useState("");
  const [offlineNames, setOfflineNames] = useState<string[]>([]);
  const [offlineInput, setOfflineInput] = useState("");
  const [posting, setPosting] = useState(false);
  const [postErr, setPostErr] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const reset = () => {
    setText("");
    setMatchDate(null);
    setMatchEndDate(null);
    setCourtPrice("");
    setOfflineNames([]);
    setOfflineInput("");
    setPostErr(null);
  };

  // Closing keeps the draft so an accidental dismiss doesn't lose what was typed.
  const close = () => { Keyboard.dismiss(); onClose(); };

  const addOffline = () => {
    const n = offlineInput.trim();
    if (!n || offlineNames.length >= 3) return;
    setOfflineNames([...offlineNames, n]);
    setOfflineInput("");
  };

  const post = async () => {
    if (!text.trim()) return;
    Keyboard.dismiss();
    setPosting(true);
    setPostErr(null);
    try {
      const a = await api.postAnnouncement(clubId, text.trim(), matchDate, offlineNames, matchEndDate, parsePrice(courtPrice));
      onPosted(a);
      reset();
      onClose();
    } catch (e: any) {
      setPostErr(e?.message || "Publication impossible");
    } finally {
      setPosting(false);
    }
  };

  // The price field sits low in the form: bring it above the keyboard once it has opened.
  const revealBottom = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);

  const price = parsePrice(courtPrice);
  const canPost = !!text.trim() && !posting;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.sheetWrap, { paddingTop: insets.top + spacing.xl }]}
        pointerEvents="box-none"
      >
        <View style={styles.sheet} testID="create-match-sheet">
          <Pressable onPress={Keyboard.dismiss} style={styles.header}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Nouveau match</Text>
                {clubName ? <Text style={styles.subtitle} numberOfLines={1}>{clubName}</Text> : null}
              </View>
              <Pressable testID="create-match-close" onPress={close} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Fermer">
                <Ionicons name="close" size={22} color={colors.onSurfaceSecondary} />
              </Pressable>
            </View>
          </Pressable>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          >
            {/* keyboardShouldPersistTaps="handled": a tap on an empty area closes the keyboard, buttons still work. */}
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Ton annonce</Text>
                <TextInput
                  testID="ann-content-input"
                  value={text}
                  onChangeText={setText}
                  placeholder="Je cherche un partenaire..."
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={styles.contentInput}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Joueurs déjà réunis (hors app)</Text>
                <View style={styles.offlineChipsRow}>
                  {offlineNames.map((n, i) => (
                    <Pressable
                      key={`${n}-${i}`}
                      testID={`offline-name-${i}`}
                      onPress={() => setOfflineNames(offlineNames.filter((_, idx) => idx !== i))}
                      style={styles.offlineNameChip}
                    >
                      <Ionicons name="person" size={13} color={colors.onBrandSecondary} />
                      <Text style={styles.offlineNameText}>{n}</Text>
                      <Ionicons name="close-circle" size={15} color={colors.onBrandSecondary} />
                    </Pressable>
                  ))}
                  {offlineNames.length < 3 && (
                    <View style={styles.offlineInputWrap}>
                      <TextInput
                        testID="offline-name-input"
                        value={offlineInput}
                        onChangeText={setOfflineInput}
                        onSubmitEditing={addOffline}
                        submitBehavior="submit"
                        placeholder="Prénom"
                        placeholderTextColor={colors.onSurfaceTertiary}
                        style={styles.offlineInput}
                        returnKeyType="done"
                      />
                      <Pressable testID="offline-add-btn" onPress={addOffline} style={styles.offlineAddBtn} accessibilityLabel="Ajouter le joueur">
                        <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>

              <MatchDatePicker value={matchDate} onChange={(s, e) => { setMatchDate(s); setMatchEndDate(e); }} testIDPrefix="compose" />

              <View style={styles.priceInputCard}>
                <View style={styles.priceInputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.priceInputLabel}>Tarif terrain (€)</Text>
                    <TextInput
                      testID="ann-court-price-input"
                      value={courtPrice}
                      onChangeText={setCourtPrice}
                      onFocus={revealBottom}
                      placeholder="ex : 32"
                      placeholderTextColor={colors.onSurfaceTertiary}
                      keyboardType="decimal-pad"
                      style={styles.priceInput}
                    />
                  </View>
                  <Ionicons name="arrow-forward" size={18} color={colors.onSurfaceTertiary} style={{ marginTop: 18 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.priceInputLabel}>Par joueur (÷4)</Text>
                    <View style={[styles.priceInput, styles.priceInputReadonly]}>
                      <Text style={styles.priceInputReadonlyText}>{price != null ? `${(price / 4).toFixed(2)} €` : "—"}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: keyboardOpen ? spacing.md : Math.max(insets.bottom, spacing.md) }]}>
            {postErr && (
              <View style={styles.postErrBanner} testID="ann-post-error">
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.postErrText}>{postErr}</Text>
                <Pressable onPress={() => setPostErr(null)} hitSlop={8}><Ionicons name="close" size={18} color={colors.onSurfaceSecondary} /></Pressable>
              </View>
            )}
            <Pressable
              testID="ann-post-btn"
              onPress={post}
              disabled={!canPost}
              style={[styles.postBtn, !canPost && { opacity: 0.5 }]}
            >
              {posting ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                <><Ionicons name="send" size={18} color={colors.onBrandPrimary} /><Text style={styles.postBtnText}>Publier l&apos;annonce</Text></>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surfaceInverse, opacity: 0.45 },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.surface, borderTopLeftRadius: radius.lg + 8, borderTopRightRadius: radius.lg + 8,
  },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { fontSize: type.xl, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: type.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  form: { gap: spacing.lg },
  field: { gap: spacing.xs },
  label: { fontSize: type.sm, color: colors.onSurfaceSecondary, fontWeight: "700" },
  contentInput: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 12, fontSize: type.base, color: colors.onSurface,
    minHeight: 88, maxHeight: 160,
  },
  offlineChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  offlineNameChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: colors.brandSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7,
  },
  offlineNameText: { fontSize: type.sm, fontWeight: "700", color: colors.onBrandSecondary },
  offlineInputWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  offlineInput: {
    minWidth: 120, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 7, fontSize: type.sm, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.border,
  },
  offlineAddBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  priceInputCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  priceInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  priceInputLabel: { fontSize: type.sm, color: colors.onSurfaceSecondary, fontWeight: "700", marginBottom: 4 },
  priceInput: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: type.base, color: colors.onSurface, borderWidth: 1, borderColor: colors.border },
  priceInputReadonly: { justifyContent: "center" },
  priceInputReadonlyText: { fontSize: type.base, color: colors.brandPrimary, fontWeight: "800" },
  footer: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  postBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 14, minHeight: 48,
  },
  postBtnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.base },
  postErrBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.error,
  },
  postErrText: { flex: 1, color: colors.error, fontSize: type.sm, lineHeight: 18 },
});
