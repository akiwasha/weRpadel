import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, fullUrl } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, type } from "@/src/lib/theme";
import { VerifiedPill } from "@/src/components/VerifiedBadge";

export default function PlayerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(false);
  const [selectedStars, setSelectedStars] = useState<number | null>(null);
  const [isFav, setIsFav] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const p = await api.getUser(id);
      setPlayer(p);
      setIsFav(!!p.is_favorite);
    } catch (e) { console.log(e); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleFav = async () => {
    if (!id) return;
    setIsFav((v) => !v);
    try {
      const r = await api.toggleFavorite(id);
      setIsFav(r.is_favorite);
    } catch (e) { console.log(e); setIsFav((v) => !v); }
  };

  const rate = async (stars: number) => {
    if (!id) return;
    setSelectedStars(stars);
    setRating(true);
    try {
      const updated = await api.rateUser(id, stars);
      setPlayer(updated);
    } catch (e) { console.log(e); }
    finally { setRating(false); }
  };

  if (loading || !player) {
    return <View style={styles.centerLoader}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>;
  }

  const isMe = player.id === user?.id;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="player-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Profil joueur</Text>
        {isMe ? (
          <View style={{ width: 40 }} />
        ) : (
          <Pressable testID="favorite-btn" onPress={toggleFav} style={styles.favBtn}>
            <Ionicons name={isFav ? "heart" : "heart-outline"} size={24} color={isFav ? colors.error : colors.onSurfaceSecondary} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, gap: spacing.lg }}>
        <View style={styles.top}>
          {player.avatar_url ? (
            <Image source={{ uri: fullUrl(player.avatar_url)! }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{player.pseudo[0]?.toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.pseudo}>{player.pseudo}</Text>
          {player.verified && <VerifiedPill />}
          <View style={styles.levelPill}>
            <Ionicons name="trophy" size={14} color={colors.onBrandSecondary} />
            <Text style={styles.levelText}>{player.level}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Fiabilité</Text>
          <Text style={styles.criteria}>Ponctualité · sympathie · pas d’annulation de dernière minute · participe au règlement du terrain</Text>
          <View style={{ flexDirection: "row", gap: 4, marginTop: spacing.sm }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Ionicons
                key={i}
                name={player.reliability_avg >= i ? "star" : player.reliability_avg >= i - 0.5 ? "star-half" : "star-outline"}
                size={28}
                color={colors.warning}
              />
            ))}
          </View>
          <Text style={styles.cardValue}>{player.reliability_avg.toFixed(1)} / 5</Text>
          <Text style={styles.cardHint}>
            {player.reliability_count > 0 ? `${player.reliability_count} avis` : "Aucun avis pour l'instant"}
          </Text>
        </View>

        {player.bio && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>À propos</Text>
            <Text style={styles.bio}>{player.bio}</Text>
          </View>
        )}

        {!isMe && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Noter la fiabilité</Text>
            <Text style={styles.criteria}>Note uniquement la fiabilité (ponctualité, sympathie, pas d’annulation de dernière minute, règlement du terrain) — pas le niveau de jeu.</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, justifyContent: "center" }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Pressable
                  key={i}
                  testID={`rate-star-${i}`}
                  onPress={() => rate(i)}
                  disabled={rating}
                >
                  <Ionicons
                    name={selectedStars && selectedStars >= i ? "star" : "star-outline"}
                    size={36}
                    color={colors.warning}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {!isMe && (
        <View style={styles.footer}>
          <Pressable
            testID="msg-player-btn"
            onPress={() => router.push(`/chat/${player.id}`)}
            style={styles.msgBtn}
          >
            <Ionicons name="chatbubble" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.msgBtnText}>Envoyer un message</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  centerLoader: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  favBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  criteria: { fontSize: 11, color: colors.onSurfaceTertiary, lineHeight: 15, marginTop: 2 },
  headerTitle: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  top: { alignItems: "center", gap: spacing.sm, paddingTop: spacing.md },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSecondary },
  avatarLetter: { fontSize: 48, fontWeight: "800", color: colors.brandPrimary },
  pseudo: { fontSize: 26, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  levelPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, backgroundColor: colors.brandSecondary,
  },
  levelText: { color: colors.onBrandSecondary, fontWeight: "700" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: 4 },
  cardLabel: { fontSize: type.base, color: colors.onSurfaceSecondary, fontWeight: "700" },
  cardValue: { fontSize: type.xxl, fontWeight: "800", color: colors.onSurface },
  cardHint: { fontSize: type.sm, color: colors.onSurfaceTertiary },
  bio: { fontSize: type.base, color: colors.onSurface, lineHeight: 22, marginTop: spacing.xs },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: spacing.lg, paddingBottom: spacing.xl,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  msgBtn: {
    flexDirection: "row", gap: spacing.sm, justifyContent: "center", alignItems: "center",
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 16,
  },
  msgBtnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.lg },
});
