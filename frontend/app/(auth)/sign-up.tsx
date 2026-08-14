import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, type } from "@/src/lib/theme";

export default function SignUp() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (pseudo.trim().length < 2) return setErr("Pseudo trop court");
    if (password.length < 6) return setErr("Mot de passe: 6 caractères min");
    setLoading(true);
    try {
      await signUp(email.trim(), password, pseudo.trim());
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
            <View style={styles.logoCircle}>
              <Ionicons name="tennisball" size={40} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.title}>Créer un compte</Text>
            <Text style={styles.subtitle}>Rejoins la communauté padel</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Pseudo</Text>
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
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  header: { alignItems: "center", marginBottom: spacing.xxl },
  logoCircle: {
    width: 72, height: 72, borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface, marginTop: spacing.lg },
  subtitle: { fontSize: type.base, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  form: { gap: spacing.md },
  label: { fontSize: type.base, fontWeight: "700", color: colors.onSurface, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: type.lg, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.border,
  },
  btn: {
    marginTop: spacing.xl, backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: "center", minHeight: 52, justifyContent: "center",
  },
  btnText: { color: colors.onBrandPrimary, fontSize: type.lg, fontWeight: "800" },
  linkWrap: { alignItems: "center", paddingVertical: spacing.lg },
  linkText: { color: colors.onSurfaceSecondary, fontSize: type.base },
  error: { color: colors.error, fontSize: type.base, textAlign: "center", marginTop: spacing.sm },
});
