import { View, Text, StyleSheet, Pressable, ScrollView, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, type } from "@/src/lib/theme";

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return "—";
  }
}

export default function ManageSubscription() {
  const router = useRouter();
  const { customerInfo, isSubscribed, restore, isRestoring } = useSubscription();

  const entitlement = customerInfo?.entitlements?.active?.["pro"];
  const expiration = entitlement?.expirationDate as string | undefined;
  const willRenew = entitlement?.willRenew;
  const store = entitlement?.store;

  const openManage = async () => {
    const mgmtUrl = customerInfo?.managementURL;
    if (mgmtUrl) {
      Linking.openURL(mgmtUrl);
      return;
    }
    // Fallback to store subscription settings
    if (Platform.OS === "ios") {
      Linking.openURL("https://apps.apple.com/account/subscriptions");
    } else {
      Linking.openURL("https://play.google.com/store/account/subscriptions");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="manage-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Mon abonnement</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={[styles.statusCard, isSubscribed ? styles.active : styles.inactive]}>
          <Ionicons name={isSubscribed ? "star" : "star-outline"} size={28} color={colors.onBrandPrimary} />
          <Text style={styles.statusTitle}>{isSubscribed ? "Premium actif" : "Aucun abonnement actif"}</Text>
          <Text style={styles.statusSub}>weRpadel Premium · 9,90 €/an</Text>
        </View>

        {isSubscribed ? (
          <>
            <View style={styles.row}>
              <Ionicons name="calendar-outline" size={20} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{willRenew ? "Prochain renouvellement" : "Expire le"}</Text>
                <Text testID="renewal-date" style={styles.rowValue}>{fmtDate(expiration)}</Text>
              </View>
            </View>
            <View style={styles.row}>
              <Ionicons name="sync-outline" size={20} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Renouvellement automatique</Text>
                <Text style={styles.rowValue}>{willRenew ? "Activé" : "Désactivé"}</Text>
              </View>
            </View>
            {store && (
              <View style={styles.row}>
                <Ionicons name="storefront-outline" size={20} color={colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Géré via</Text>
                  <Text style={styles.rowValue}>{String(store).replace("APP_STORE", "App Store").replace("PLAY_STORE", "Google Play").replace("RC_BILLING", "Web")}</Text>
                </View>
              </View>
            )}

            <Pressable testID="manage-cancel-btn" onPress={openManage} style={styles.manageBtn}>
              <Ionicons name="open-outline" size={18} color={colors.onSurface} />
              <Text style={styles.manageText}>Gérer / Résilier l’abonnement</Text>
            </Pressable>
            <Text style={styles.hint}>
              La résiliation se fait dans les réglages de ton compte App Store / Google Play. Tu gardes l’accès
              Premium jusqu’à la date d’expiration.
            </Text>
          </>
        ) : (
          <>
            <Pressable testID="manage-subscribe-btn" onPress={() => router.replace("/paywall")} style={styles.subscribeBtn}>
              <Text style={styles.subscribeText}>Abonne-toi · 9,90 €/an</Text>
            </Pressable>
            <Pressable testID="manage-restore-btn" onPress={() => restore()} disabled={isRestoring} style={styles.restoreBtn}>
              <Text style={styles.restoreText}>{isRestoring ? "Restauration…" : "Restaurer mes achats"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
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
  statusCard: { alignItems: "center", gap: spacing.xs, borderRadius: radius.lg, padding: spacing.xl },
  active: { backgroundColor: colors.success },
  inactive: { backgroundColor: colors.surfaceInverse },
  statusTitle: { fontSize: type.xl, fontWeight: "800", color: colors.onBrandPrimary, marginTop: spacing.sm },
  statusSub: { fontSize: type.base, color: colors.onBrandPrimary, opacity: 0.9 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg,
  },
  rowLabel: { fontSize: type.sm, color: colors.onSurfaceTertiary, fontWeight: "700" },
  rowValue: { fontSize: type.lg, color: colors.onSurface, fontWeight: "700", marginTop: 2 },
  manageBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingVertical: 14, marginTop: spacing.sm,
  },
  manageText: { color: colors.onSurface, fontWeight: "800", fontSize: type.base },
  hint: { fontSize: type.sm, color: colors.onSurfaceTertiary, textAlign: "center", lineHeight: 18 },
  subscribeBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center" },
  subscribeText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.lg },
  restoreBtn: { alignItems: "center", paddingVertical: spacing.md },
  restoreText: { color: colors.brandPrimary, fontWeight: "700" },
});
