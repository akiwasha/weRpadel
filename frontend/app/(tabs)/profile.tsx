import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { fullUrl } from "@/src/lib/api";
import { colors, spacing, radius, type } from "@/src/lib/theme";
import { VerifiedPill } from "@/src/components/VerifiedBadge";

function StarRow({ value }: { value: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={value >= i ? "star" : value >= i - 0.5 ? "star-half" : "star-outline"}
          size={22}
          color={colors.warning}
        />
      ))}
    </View>
  );
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { isSubscribed } = useSubscription();
  const router = useRouter();

  if (!user) return null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Mon profil</Text>
          <Pressable testID="edit-profile-btn" onPress={() => router.push("/edit-profile")} style={styles.editBtn}>
            <Ionicons name="pencil" size={18} color={colors.brandPrimary} />
          </Pressable>
        </View>

        <View style={styles.avatarWrap}>
          {user.avatar_url ? (
            <Image source={{ uri: fullUrl(user.avatar_url)! }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{user.pseudo[0]?.toUpperCase()}</Text>
            </View>
          )}
          <Text testID="my-pseudo" style={styles.pseudo}>{user.pseudo}</Text>
          <Text style={styles.email}>{user.email}</Text>

          {user.verified && <VerifiedPill />}

          <View style={styles.levelPill}>
            <Ionicons name="trophy" size={14} color={colors.onBrandSecondary} />
            <Text style={styles.levelText}>{user.level}</Text>
          </View>
        </View>

        <Pressable
          testID="premium-card"
          onPress={() => router.push("/paywall")}
          style={[styles.premiumCard, isSubscribed && styles.premiumActive]}
        >
          <View style={styles.premiumIcon}>
            <Ionicons name={isSubscribed ? "star" : "star-outline"} size={22} color={colors.onBrandPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.premiumTitle}>{isSubscribed ? "Premium actif" : "Passe Premium"}</Text>
            <Text style={styles.premiumSub}>
              {isSubscribed ? "Messagerie et annonces débloquées 🎾" : "Messagerie + annonces · 9,90 €/an"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Fiabilité</Text>
          <View style={styles.reliabilityRow}>
            <StarRow value={user.reliability_avg} />
            <Text style={styles.reliabilityValue}>
              {user.reliability_avg.toFixed(1)} / 5
            </Text>
          </View>
          <Text style={styles.cardHint}>
            {user.reliability_count > 0
              ? `${user.reliability_count} avis reçu${user.reliability_count > 1 ? "s" : ""}`
              : "Aucun avis pour l'instant"}
          </Text>
        </View>

        {user.bio ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Bio</Text>
            <Text style={styles.bioText}>{user.bio}</Text>
          </View>
        ) : null}

        <Pressable
          testID="signout-btn"
          onPress={async () => { await signOut(); router.replace("/(auth)/sign-in"); }}
          style={styles.signOut}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  editBtn: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center",
  },
  avatarWrap: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSecondary },
  avatarLetter: { fontSize: 48, fontWeight: "800", color: colors.brandPrimary },
  pseudo: { fontSize: 24, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  email: { fontSize: type.base, color: colors.onSurfaceSecondary },
  levelPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 6, marginTop: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.brandSecondary,
  },
  levelText: { color: colors.onBrandSecondary, fontWeight: "700", fontSize: type.base },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm,
  },
  premiumCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceInverse, borderRadius: radius.lg, padding: spacing.lg,
  },
  premiumActive: { backgroundColor: colors.success },
  premiumIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  premiumTitle: { fontSize: type.lg, fontWeight: "800", color: colors.onSurfaceInverse },
  premiumSub: { fontSize: type.sm, color: colors.onSurfaceInverse, opacity: 0.85, marginTop: 2 },
  cardLabel: { fontSize: type.base, color: colors.onSurfaceSecondary, fontWeight: "700" },
  reliabilityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: 4 },
  reliabilityValue: { fontSize: type.xl, fontWeight: "800", color: colors.onSurface },
  cardHint: { fontSize: type.sm, color: colors.onSurfaceTertiary },
  bioText: { fontSize: type.base, color: colors.onSurface, lineHeight: 22 },
  signOut: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    paddingVertical: 14, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.error,
    marginTop: spacing.md,
  },
  signOutText: { color: colors.error, fontWeight: "800", fontSize: type.lg },
});
