import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, type } from "@/src/lib/theme";

export default function ForgotPassword() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes("@")) { setErr("Saisis un email valide"); return; }
    setErr(null); setInfo(null); setLoading(true);
    try {
      await api.forgotPassword(e);
      setStep("code");
      setInfo(`Si un compte existe pour ${e}, un code à 6 chiffres vient d'être envoyé. Pense à vérifier tes spams.`);
    } catch (ex: any) {
      setErr(ex.message || "Impossible d'envoyer le code");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setErr(null);
    if (code.trim().length !== 6) { setErr("Le code doit contenir 6 chiffres"); return; }
    if (password.length < 6) { setErr("Le mot de passe doit faire au moins 6 caractères"); return; }
    if (password !== confirm) { setErr("Les deux mots de passe ne correspondent pas"); return; }
    setLoading(true);
    try {
      await api.resetPassword(email.trim().toLowerCase(), code.trim(), password);
      await signIn(email.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (ex: any) {
      setErr(ex.message || "Réinitialisation impossible");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable testID="forgot-back" onPress={() => router.back()} style={styles.back} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
          </Pressable>

          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name={step === "email" ? "mail-outline" : "key-outline"} size={32} color={colors.brandPrimary} />
            </View>
            <Text style={styles.title}>{step === "email" ? "Mot de passe oublié ?" : "Saisis ton code"}</Text>
            <Text style={styles.subtitle}>
              {step === "email"
                ? "Indique ton email, on t'envoie un code pour choisir un nouveau mot de passe."
                : "Le code est valable 15 minutes."}
            </Text>
          </View>

          <View style={styles.form}>
            {step === "email" ? (
              <>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  testID="forgot-email-input"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="ton@email.fr"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  returnKeyType="send"
                  onSubmitEditing={sendCode}
                />
                {err && <Text style={styles.error} testID="forgot-error">{err}</Text>}
                <Pressable testID="forgot-send-button" style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]} onPress={sendCode} disabled={loading}>
                  {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Envoyer le code</Text>}
                </Pressable>
              </>
            ) : (
              <>
                {info && <Text style={styles.info} testID="forgot-info">{info}</Text>}
                <Text style={styles.label}>Code reçu par email</Text>
                <TextInput
                  testID="forgot-code-input"
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
                  placeholder="123456"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={6}
                />
                <Text style={styles.label}>Nouveau mot de passe</Text>
                <TextInput
                  testID="forgot-password-input"
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="6 caractères minimum"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  secureTextEntry
                  autoComplete="new-password"
                />
                <Text style={styles.label}>Confirme le mot de passe</Text>
                <TextInput
                  testID="forgot-confirm-input"
                  style={styles.input}
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="••••••••"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={resetPassword}
                />
                {err && <Text style={styles.error} testID="forgot-error">{err}</Text>}
                <Pressable testID="forgot-reset-button" style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]} onPress={resetPassword} disabled={loading}>
                  {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Changer le mot de passe</Text>}
                </Pressable>
                <Pressable testID="forgot-resend" style={styles.linkWrap} onPress={sendCode} disabled={loading}>
                  <Text style={styles.linkText}>
                    Pas reçu ? <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Renvoyer un code</Text>
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.appBg },
  container: { flexGrow: 1, padding: spacing.xl },
  back: { width: 44, height: 44, justifyContent: "center" },
  header: { alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.xxl },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.lg,
  },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  subtitle: { fontSize: type.base, color: colors.onSurfaceSecondary, marginTop: spacing.sm, textAlign: "center", lineHeight: 22 },
  form: { gap: spacing.md },
  label: { fontSize: type.base, fontWeight: "700", color: colors.onSurface, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: type.lg, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.border,
  },
  codeInput: { textAlign: "center", letterSpacing: 8, fontSize: 24, fontWeight: "700" },
  btn: {
    marginTop: spacing.xl, backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: "center", minHeight: 52, justifyContent: "center",
  },
  btnText: { color: colors.onBrandPrimary, fontSize: type.lg, fontWeight: "800" },
  linkWrap: { alignItems: "center", paddingVertical: spacing.lg },
  linkText: { color: colors.onSurfaceSecondary, fontSize: type.base },
  error: { color: colors.error, fontSize: type.base, textAlign: "center", marginTop: spacing.sm },
  info: {
    color: colors.onSurfaceSecondary, fontSize: type.base, textAlign: "center", lineHeight: 20,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
  },
});
