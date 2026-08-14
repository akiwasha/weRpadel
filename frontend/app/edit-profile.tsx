import { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { api, fullUrl } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, type, LEVELS } from "@/src/lib/theme";

const AVATARS = [
  "https://images.unsplash.com/photo-1637071692126-d0ee7df18271?w=300",
  "https://images.unsplash.com/photo-1595435742656-5272d0b3fa82?w=300",
];

export default function EditProfile() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [pseudo, setPseudo] = useState(user?.pseudo || "");
  const [level, setLevel] = useState(user?.level || "Débutant");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar_url || null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as any,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!r.canceled && r.assets[0]) {
      setPendingUri(r.assets[0].uri);
      setAvatarPreview(r.assets[0].uri);
    }
  };

  const chooseAvatar = (url: string) => {
    setAvatarUrl(url);
    setAvatarPreview(url);
    setPendingUri(null);
  };

  const save = async () => {
    setErr(null);
    setLoading(true);
    try {
      let finalAvatar = avatarUrl;
      if (pendingUri) {
        const res = await api.uploadAvatar(pendingUri);
        finalAvatar = res.avatar_url;
      }
      const updated = await api.updateMe({
        pseudo: pseudo.trim(),
        level,
        bio: bio.trim() || null,
        avatar_url: finalAvatar,
      });
      updateUser(updated);
      router.back();
    } catch (e: any) {
      setErr(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const previewSrc = avatarPreview
    ? (pendingUri ? avatarPreview : (avatarPreview.startsWith("http") ? avatarPreview : fullUrl(avatarPreview)!))
    : (avatarUrl ? (avatarUrl.startsWith("http") ? avatarUrl : fullUrl(avatarUrl)!) : null);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="edit-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Modifier le profil</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", gap: spacing.md }}>
            <Pressable testID="pick-avatar" onPress={pick}>
              {previewSrc ? (
                <Image source={{ uri: previewSrc }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.letter}>{pseudo[0]?.toUpperCase() || "?"}</Text>
                </View>
              )}
              <View style={styles.cameraDot}>
                <Ionicons name="camera" size={16} color={colors.onBrandPrimary} />
              </View>
            </Pressable>
            <Text style={styles.hint}>Touche pour importer une photo</Text>
          </View>

          <Text style={styles.label}>Avatars proposés</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {AVATARS.map((a) => (
              <Pressable key={a} testID={`preset-avatar-${a}`} onPress={() => chooseAvatar(a)}>
                <Image source={{ uri: a }} style={[styles.presetAvatar, avatarUrl === a && styles.presetSelected]} contentFit="cover" />
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Pseudo</Text>
          <TextInput testID="edit-pseudo" value={pseudo} onChangeText={setPseudo} style={styles.input} autoCapitalize="none" />

          <Text style={styles.label}>Niveau</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {LEVELS.map((l) => (
              <Pressable key={l} testID={`level-${l}`} onPress={() => setLevel(l)} style={[styles.chip, level === l && styles.chipActive]}>
                <Text style={[styles.chipText, level === l && styles.chipTextActive]}>{l}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Bio (optionnel)</Text>
          <TextInput
            testID="edit-bio"
            value={bio}
            onChangeText={setBio}
            style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            multiline
            placeholder="Décris-toi en quelques mots..."
            placeholderTextColor={colors.onSurfaceTertiary}
          />

          {err && <Text style={styles.err}>{err}</Text>}

          <Pressable testID="edit-save" onPress={save} disabled={loading} style={[styles.btn, loading && { opacity: 0.6 }]}>
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Enregistrer</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSecondary },
  letter: { fontSize: 48, fontWeight: "800", color: colors.brandPrimary },
  cameraDot: {
    position: "absolute", bottom: 0, right: 0,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: colors.surface,
  },
  hint: { fontSize: type.sm, color: colors.onSurfaceTertiary },
  label: { fontSize: type.base, fontWeight: "700", color: colors.onSurface, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: 12, fontSize: type.lg, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.border,
  },
  chip: {
    height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: type.base },
  chipTextActive: { color: colors.onBrandPrimary },
  presetAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: "transparent" },
  presetSelected: { borderColor: colors.brandPrimary },
  err: { color: colors.error, textAlign: "center", marginTop: spacing.sm },
  btn: {
    marginTop: spacing.xl, backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: "center",
  },
  btnText: { color: colors.onBrandPrimary, fontSize: type.lg, fontWeight: "800" },
});
