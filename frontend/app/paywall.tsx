import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { PurchasesPackage } from "react-native-purchases";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, type } from "@/src/lib/theme";

const BENEFITS = [
  { icon: "chatbubbles", text: "Messagerie privée illimitée avec les autres joueurs" },
  { icon: "megaphone", text: "Poste tes annonces « je cherche un partenaire »" },
  { icon: "people", text: "Réponds aux annonces et organise tes matchs" },
  { icon: "shield-checkmark", text: "Deviens un joueur vérifié et fiable" },
];

export default function Paywall() {
  const router = useRouter();
  const {
    offerings, purchase, restore, isPurchasing, isRestoring,
    identityReady, isSubscribed, rcEnabled, isLoading,
  } = useSubscription();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentOffering = offerings?.current;
  const pkg: PurchasesPackage | undefined = currentOffering?.availablePackages?.[0];
  const price = pkg?.product?.priceString || "9,90 €";

  const noProducts = !isLoading && (!pkg || !currentOffering);

  const doPurchase = async () => {
    setConfirmOpen(false);
    setErrorMsg(null);
    if (!pkg) return;
    try {
      const info = await purchase(pkg);
      if (info?.entitlements?.active?.["pro"]) {
        router.back();
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (e?.userCancelled || /cancel/i.test(msg)) return; // silent
      if (msg.includes("identity_not_ready")) {
        setErrorMsg("Connexion en cours, réessaie dans un instant.");
      } else {
        setErrorMsg("Le paiement n'a pas abouti. Réessaie plus tard.");
      }
    }
  };

  const doRestore = async () => {
    setErrorMsg(null);
    try {
      await restore();
    } catch {
      setErrorMsg("Impossible de restaurer les achats.");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Pressable testID="paywall-close" onPress={() => router.back()} style={styles.closeBtn}>
        <Ionicons name="close" size={26} color={colors.onSurface} />
      </Pressable>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.brandPrimary, colors.brand]} style={styles.hero}>
          <View style={styles.crown}>
            <Ionicons name="star" size={40} color={colors.brandPrimary} />
          </View>
          <Text style={styles.heroTitle}>weRpadel Premium</Text>
          <Text style={styles.heroSub}>Débloque toute la mise en relation entre joueurs</Text>
        </LinearGradient>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b.text} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name={b.icon as any} size={20} color={colors.onBrandPrimary} />
              </View>
              <Text style={styles.benefitText}>{b.text}</Text>
            </View>
          ))}
        </View>

        {isSubscribed ? (
          <View style={styles.activeCard}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <Text style={styles.activeText}>Ton abonnement Premium est actif 🎉</Text>
          </View>
        ) : noProducts ? (
          <View style={styles.unavailableCard} testID="paywall-unavailable">
            <Text style={styles.unavailableText}>
              Les options d’abonnement ne sont pas disponibles pour le moment. Réessaie plus tard.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.priceCard}>
              <View style={styles.bestBadge}><Text style={styles.bestBadgeText}>MEILLEURE OFFRE</Text></View>
              <Text style={styles.priceLabel}>Abonnement annuel</Text>
              <Text style={styles.priceValue}>{price}<Text style={styles.pricePeriod}> / an</Text></Text>
              <Text style={styles.priceHint}>Renouvellement automatique chaque année · Résiliable à tout moment</Text>
            </View>

            {errorMsg && <Text testID="paywall-error" style={styles.error}>{errorMsg}</Text>}

            <Pressable
              testID="paywall-subscribe-btn"
              onPress={() => setConfirmOpen(true)}
              disabled={isPurchasing || !identityReady}
              style={[styles.subscribeBtn, (isPurchasing || !identityReady) && { opacity: 0.6 }]}
            >
              {isPurchasing ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.subscribeText}>S’abonner pour {price}/an</Text>
              )}
            </Pressable>

            {!identityReady && rcEnabled && (
              <Text style={styles.identityHint}>Préparation de ton compte…</Text>
            )}

            <Pressable testID="paywall-restore-btn" onPress={doRestore} disabled={isRestoring} style={styles.restoreBtn}>
              <Text style={styles.restoreText}>{isRestoring ? "Restauration…" : "Restaurer mes achats"}</Text>
            </Pressable>

            <Text style={styles.legal}>
              Le paiement sera débité via ton compte App Store / Google Play. L’abonnement se renouvelle
              automatiquement sauf annulation au moins 24 h avant la fin de la période.
            </Text>
          </>
        )}
      </ScrollView>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirmer l’abonnement</Text>
            <Text style={styles.modalBody}>
              Tu vas t’abonner à weRpadel Premium pour {price} par an.
            </Text>
            <View style={styles.modalActions}>
              <Pressable testID="paywall-confirm-cancel" onPress={() => setConfirmOpen(false)} style={[styles.modalBtn, styles.modalCancel]}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </Pressable>
              <Pressable testID="paywall-confirm-ok" onPress={doPurchase} style={[styles.modalBtn, styles.modalOk]}>
                <Text style={styles.modalOkText}>Confirmer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.appBg },
  closeBtn: { position: "absolute", top: 50, right: spacing.lg, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  container: { paddingBottom: spacing.xxxl },
  hero: { alignItems: "center", paddingTop: spacing.xxxl, paddingBottom: spacing.xl, paddingHorizontal: spacing.lg, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  crown: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  heroTitle: { fontSize: 26, fontWeight: "800", color: colors.onBrandPrimary },
  heroSub: { fontSize: type.base, color: colors.onBrandPrimary, opacity: 0.95, textAlign: "center", marginTop: spacing.xs },
  benefits: { padding: spacing.lg, gap: spacing.md },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  benefitIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  benefitText: { flex: 1, fontSize: type.base, color: colors.onSurface, lineHeight: 20 },
  priceCard: { marginHorizontal: spacing.lg, backgroundColor: colors.brandSecondary, borderRadius: radius.lg, padding: spacing.lg, alignItems: "center", borderWidth: 2, borderColor: colors.brandPrimary },
  bestBadge: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, marginBottom: spacing.sm },
  bestBadgeText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 11, letterSpacing: 0.5 },
  priceLabel: { fontSize: type.base, color: colors.onBrandSecondary, fontWeight: "700" },
  priceValue: { fontSize: 40, fontWeight: "800", color: colors.onSurface, marginTop: spacing.xs },
  pricePeriod: { fontSize: type.lg, fontWeight: "700", color: colors.onSurfaceSecondary },
  priceHint: { fontSize: type.sm, color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.xs },
  subscribeBtn: { marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 16, alignItems: "center", minHeight: 54, justifyContent: "center" },
  subscribeText: { color: colors.onBrandPrimary, fontSize: type.lg, fontWeight: "800" },
  identityHint: { textAlign: "center", color: colors.onSurfaceTertiary, fontSize: type.sm, marginTop: spacing.sm },
  restoreBtn: { alignItems: "center", paddingVertical: spacing.lg },
  restoreText: { color: colors.brandPrimary, fontWeight: "700", fontSize: type.base },
  legal: { fontSize: 11, color: colors.onSurfaceTertiary, textAlign: "center", paddingHorizontal: spacing.xl, lineHeight: 16 },
  error: { color: colors.error, textAlign: "center", marginTop: spacing.md, paddingHorizontal: spacing.lg },
  activeCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, margin: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg },
  activeText: { flex: 1, fontSize: type.lg, fontWeight: "700", color: colors.onSurface },
  unavailableCard: { margin: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg },
  unavailableText: { fontSize: type.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalCard: { width: "100%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  modalTitle: { fontSize: type.xl, fontWeight: "800", color: colors.onSurface },
  modalBody: { fontSize: type.base, color: colors.onSurfaceSecondary, lineHeight: 20 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.pill, alignItems: "center" },
  modalCancel: { backgroundColor: colors.surfaceSecondary },
  modalCancelText: { color: colors.onSurface, fontWeight: "700" },
  modalOk: { backgroundColor: colors.brandPrimary },
  modalOkText: { color: colors.onBrandPrimary, fontWeight: "800" },
});
