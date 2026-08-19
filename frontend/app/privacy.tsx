import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, type } from "@/src/lib/theme";
import { PRIVACY_POLICY, SUPPORT_EMAIL, PRIVACY_POLICY_URL } from "@/src/lib/legal";

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="privacy-back" onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Confidentialité</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.body}>{PRIVACY_POLICY}</Text>
        {!!PRIVACY_POLICY_URL && (
          <Pressable
            testID="privacy-online"
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
            style={styles.onlineBtn}
          >
            <Ionicons name="open-outline" size={16} color={colors.info} />
            <Text style={styles.onlineText}>Voir la version en ligne</Text>
          </Pressable>
        )}
        <Pressable
          testID="privacy-contact"
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          style={styles.contactBtn}
        >
          <Ionicons name="mail-outline" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.contactText}>Nous contacter</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.appBg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  container: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  body: { fontSize: type.base, color: colors.onSurface, lineHeight: 22 },
  contactBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 13, minHeight: 44,
  },
  contactText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.base },
  onlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6 },
  onlineText: { color: colors.info, fontWeight: "700", fontSize: type.sm, textDecorationLine: "underline" },
});
