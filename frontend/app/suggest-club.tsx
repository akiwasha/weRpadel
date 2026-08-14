import { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius, type } from "@/src/lib/theme";

const REGIONS_FR = [
  "Île-de-France", "Auvergne-Rhône-Alpes", "Provence-Alpes-Côte d'Azur",
  "Occitanie", "Nouvelle-Aquitaine", "Pays de la Loire", "Grand Est",
  "Hauts-de-France", "Bretagne", "Normandie", "Bourgogne-Franche-Comté",
  "Centre-Val de Loire", "Corse",
];

export default function SuggestClub() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    setErr(null);
    if (name.length < 2 || city.length < 2 || !region) {
      return setErr("Merci de remplir le nom, la ville et la région");
    }
    setLoading(true);
    try {
      await api.createClub({ name, city, region, address: address || undefined });
      setSuccess(true);
      setTimeout(() => router.back(), 1500);
    } catch (e: any) {
      setErr(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="suggest-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Suggérer un club</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>Aide la communauté en ajoutant un nouveau club. Il sera visible dès validation.</Text>

          <Text style={styles.label}>Nom du club *</Text>
          <TextInput testID="suggest-name" value={name} onChangeText={setName} style={styles.input} placeholder="Ex: Padel Horizon" placeholderTextColor={colors.onSurfaceTertiary} />

          <Text style={styles.label}>Ville *</Text>
          <TextInput testID="suggest-city" value={city} onChangeText={setCity} style={styles.input} placeholder="Ex: Paris" placeholderTextColor={colors.onSurfaceTertiary} />

          <Text style={styles.label}>Région *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
            {REGIONS_FR.map((r) => (
              <Pressable key={r} testID={`suggest-region-${r}`} onPress={() => setRegion(r)} style={[styles.chip, region === r && styles.chipActive]}>
                <Text style={[styles.chipText, region === r && styles.chipTextActive]}>{r}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>Adresse (optionnel)</Text>
          <TextInput testID="suggest-address" value={address} onChangeText={setAddress} style={styles.input} placeholder="12 rue du Padel" placeholderTextColor={colors.onSurfaceTertiary} />

          {err && <Text style={styles.err}>{err}</Text>}
          {success && <Text style={styles.success}>✅ Suggestion envoyée !</Text>}

          <Pressable testID="suggest-submit" onPress={submit} disabled={loading} style={[styles.btn, loading && { opacity: 0.6 }]}>
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Envoyer la suggestion</Text>}
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
  hint: { fontSize: type.base, color: colors.onSurfaceSecondary, marginBottom: spacing.sm },
  label: { fontSize: type.base, fontWeight: "700", color: colors.onSurface, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: 12, fontSize: type.lg, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.border,
  },
  chip: {
    height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: type.base },
  chipTextActive: { color: colors.onBrandPrimary },
  err: { color: colors.error, textAlign: "center", marginTop: spacing.sm },
  success: { color: colors.success, textAlign: "center", marginTop: spacing.sm, fontWeight: "700" },
  btn: {
    marginTop: spacing.xl, backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: "center",
  },
  btnText: { color: colors.onBrandPrimary, fontSize: type.lg, fontWeight: "800" },
});
