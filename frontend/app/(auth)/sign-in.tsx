import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, type } from "@/src/lib/theme";

export default function SignIn() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Ionicons name="tennisball" size={44} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.title}>weRpadel</Text>
            <Text style={styles.subtitle}>Trouve tes partenaires de padel</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="signin-email-input"
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
              testID="signin-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
            />
            {err && <Text style={styles.error} testID="signin-error">{err}</Text>}
            <Pressable
              testID="signin-submit-button"
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Se connecter</Text>}
            </Pressable>

            <Link href="/(auth)/sign-up" asChild>
              <Pressable testID="signin-goto-signup" style={styles.linkWrap}>
                <Text style={styles.linkText}>
                  Pas encore de compte ? <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Inscris-toi</Text>
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
  logoWrap: { alignItems: "center", marginBottom: spacing.xxxl },
  logoCircle: {
    width: 88, height: 88, borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
  },
  title: { fontSize: 32, fontWeight: "800", color: colors.onSurface, marginTop: spacing.lg },
  subtitle: { fontSize: type.lg, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
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
