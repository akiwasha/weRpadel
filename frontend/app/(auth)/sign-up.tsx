import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, type } from "@/src/lib/theme";

// "JJ/MM/AAAA" -> "AAAA-MM-JJ" (returns null if invalid)
function toIsoDate(input: string): string | null {
  const m = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = +dd, month = +mm, year = +yyyy;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  const now = new Date();
  if (year < 1900 || d > now) return null;
  return `${yyyy}-${mm}-${dd}`;
}

export default function SignUp() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (firstName.trim().length < 1) return setErr("Indique ton prénom");
    if (lastName.trim().length < 1) return setErr("Indique ton nom");
    if (pseudo.trim().length < 2) return setErr("Pseudo trop court (2 caractères min)");
    if (!email.includes("@")) return setErr("Email invalide");
    if (phone.trim().length < 6) return setErr("Numéro de téléphone invalide");
    const iso = toIsoDate(birth);
    if (!iso) return setErr("Date de naissance invalide (JJ/MM/AAAA)");
    if (city.trim().length < 1) return setErr("Indique ta ville de résidence");
    if (password.length < 6) return setErr("Mot de passe : 6 caractères min");
    setLoading(true);
    try {
      await signUp({
        email: email.trim().toLowerCase(),
        password,
        pseudo: pseudo.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        birth_date: iso,
        city: city.trim(),
      });
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e.message || "Inscription impossible");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Image source={require("../../assets/images/logo-mark.png")} style={styles.logo} contentFit="contain" />
            <Text style={styles.title}>Créer un compte</Text>
            <Text style={styles.subtitle}>Rejoins la communauté padel</Text>
          </View>

          <View style={styles.privacyBanner}>
            <Ionicons name="shield-checkmark" size={18} color={colors.brandPrimary} />
            <Text style={styles.privacyText}>
              Seul ton <Text style={{ fontWeight: "800" }}>pseudonyme</Text> est visible par les autres joueurs. Prénom, nom, email, téléphone, date de naissance et ville restent privés.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Prénom</Text>
                <TextInput
                  testID="signup-firstname-input"
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Marc"
                  placeholderTextColor={colors.onSurfaceTertiary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Nom</Text>
                <TextInput
                  testID="signup-lastname-input"
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Dupont"
                  placeholderTextColor={colors.onSurfaceTertiary}
                />
              </View>
            </View>

            <Text style={styles.label}>Pseudonyme <Text style={styles.publicTag}>public</Text></Text>
            <TextInput
              testID="signup-pseudo-input"
              style={styles.input}
              value={pseudo}
              onChangeText={setPseudo}
              placeholder="TonPseudo"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="signup-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="ton@email.fr"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Téléphone</Text>
            <TextInput
              testID="signup-phone-input"
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="06 12 34 56 78"
              placeholderTextColor={colors.onSurfaceTertiary}
              keyboardType="phone-pad"
            />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Date de naissance</Text>
                <TextInput
                  testID="signup-birth-input"
                  style={styles.input}
                  value={birth}
                  onChangeText={setBirth}
                  placeholder="JJ/MM/AAAA"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Ville</Text>
                <TextInput
                  testID="signup-city-input"
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="Paris"
                  placeholderTextColor={colors.onSurfaceTertiary}
                />
              </View>
            </View>

            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              testID="signup-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Min. 6 caractères"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
            />

            {err && <Text style={styles.error} testID="signup-error">{err}</Text>}
            <Text style={styles.rules} testID="signup-rules">
              En t'inscrivant, tu acceptes nos règles de communauté : aucune tolérance pour les propos haineux, violents, racistes ou le harcèlement. Les messages sont filtrés automatiquement et tout manquement peut entraîner la suspension du compte.
            </Text>
            <Pressable
              testID="signup-submit-button"
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>S'inscrire</Text>}
            </Pressable>

            <Link href="/(auth)/sign-in" asChild>
              <Pressable testID="signup-goto-signin" style={styles.linkWrap}>
                <Text style={styles.linkText}>
                  Déjà un compte ? <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Connecte-toi</Text>
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.appBg },
  container: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  header: { alignItems: "center", marginBottom: spacing.lg },
  logo: { width: 80, height: 80, borderRadius: 20 },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface, marginTop: spacing.lg },
  subtitle: { fontSize: type.base, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  privacyBanner: {
    flexDirection: "row", gap: spacing.sm, alignItems: "flex-start",
    backgroundColor: colors.brandSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  privacyText: { flex: 1, fontSize: type.sm, color: colors.onBrandSecondary, lineHeight: 18 },
  form: { gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.md },
  label: { fontSize: type.base, fontWeight: "700", color: colors.onSurface, marginTop: spacing.sm },
  publicTag: {
    fontSize: 11, color: colors.brandPrimary, fontWeight: "800",
  },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: type.lg, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.border,
  },
  btn: {
    marginTop: spacing.lg, backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: "center", minHeight: 52, justifyContent: "center",
  },
  btnText: { color: colors.onBrandPrimary, fontSize: type.lg, fontWeight: "800" },
  linkWrap: { alignItems: "center", paddingVertical: spacing.lg },
  linkText: { color: colors.onSurfaceSecondary, fontSize: type.base },
  error: { color: colors.error, fontSize: type.base, textAlign: "center", marginTop: spacing.sm },
  rules: { color: colors.onSurfaceTertiary, fontSize: type.sm, textAlign: "center", lineHeight: 18, marginTop: spacing.md },
});
