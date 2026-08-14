import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, fullUrl } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, type } from "@/src/lib/theme";

type Player = { id: string; pseudo: string; avatar_url: string | null; level: string };
type Match = {
  id: string;
  club_id: string;
  club_name: string | null;
  content: string;
  availability: string | null;
  created_at: string;
  players: Player[];
  offline_players: string[];
  total_players: number;
  slots_left: number;
  is_full: boolean;
  is_author: boolean;
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export default function MatchHistory() {
  const router = useRouter();
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const m = await api.matchHistory();
      setMatches(m);
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="history-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Mes matchs</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : matches.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="tennisball-outline" size={64} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>Aucun match pour l’instant</Text>
          <Text style={styles.emptySub}>Rejoins ou crée un match dans un club pour le retrouver ici</Text>
          <Pressable style={styles.cta} onPress={() => router.push("/(tabs)")}>
            <Text style={styles.ctaText}>Explorer les clubs</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`history-match-${item.id}`}
              onPress={() => router.push(`/club/${item.club_id}`)}
              style={styles.card}
            >
              <View style={styles.cardTop}>
                <View style={styles.clubBadge}>
                  <Ionicons name="location" size={14} color={colors.onBrandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clubName} numberOfLines={1}>{item.club_name || "Club"}</Text>
                  <Text style={styles.date}>{fmt(item.created_at)}{item.availability ? ` · ${item.availability}` : ""}</Text>
                </View>
                {item.is_full ? (
                  <View style={styles.confirmed}><Text style={styles.confirmedText}>4/4</Text></View>
                ) : (
                  <View style={styles.open}><Text style={styles.openText}>{item.total_players}/4</Text></View>
                )}
              </View>

              <Text style={styles.content} numberOfLines={2}>{item.content}</Text>

              <Text style={styles.playersLabel}>Joueurs présents</Text>
              <View style={styles.playersWrap}>
                {item.players.map((p) => (
                  <Pressable
                    key={p.id}
                    testID={`history-player-${item.id}-${p.id}`}
                    onPress={() => (p.id === user?.id ? null : router.push(`/player/${p.id}`))}
                    style={styles.playerChip}
                  >
                    {p.avatar_url ? (
                      <Image source={{ uri: fullUrl(p.avatar_url)! }} style={styles.chipAvatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.chipAvatar, styles.fallback]}>
                        <Text style={{ color: colors.brandPrimary, fontWeight: "800", fontSize: 11 }}>{p.pseudo[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.playerChipText} numberOfLines={1}>{p.id === user?.id ? "Toi" : p.pseudo}</Text>
                    {p.id !== user?.id && <Ionicons name="chatbubble-ellipses" size={13} color={colors.brandPrimary} />}
                  </Pressable>
                ))}
                {item.offline_players.map((name, i) => (
                  <View key={`off-${i}`} style={styles.offlineChip}>
                    <Ionicons name="person" size={13} color={colors.onBrandSecondary} />
                    <Text style={styles.offlineChipText} numberOfLines={1}>{name || "Invité"}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.hint}>Touche un joueur pour lui proposer de rejouer</Text>
            </Pressable>
          )}
        />
      )}
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
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: type.lg, color: colors.onSurface, fontWeight: "700" },
  emptySub: { fontSize: type.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  cta: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 12, marginTop: spacing.sm },
  ctaText: { color: colors.onBrandPrimary, fontWeight: "800" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  clubBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  clubName: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  date: { fontSize: type.sm, color: colors.onSurfaceTertiary, marginTop: 1 },
  confirmed: { backgroundColor: colors.success, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  confirmedText: { color: colors.onSuccess, fontWeight: "800", fontSize: type.sm },
  open: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  openText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: type.sm },
  content: { fontSize: type.base, color: colors.onSurface, lineHeight: 20 },
  playersLabel: { fontSize: type.sm, color: colors.onSurfaceSecondary, fontWeight: "700", marginTop: spacing.xs },
  playersWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  playerChip: {
    flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 160,
    backgroundColor: colors.surface, borderRadius: radius.pill, paddingLeft: 3, paddingRight: spacing.md, paddingVertical: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  chipAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceTertiary },
  fallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSecondary },
  playerChipText: { fontSize: type.sm, fontWeight: "700", color: colors.onSurface, flexShrink: 1 },
  offlineChip: {
    flexDirection: "row", alignItems: "center", gap: 5, maxWidth: 160,
    backgroundColor: colors.brandSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 7,
  },
  offlineChipText: { fontSize: type.sm, fontWeight: "700", color: colors.onBrandSecondary, flexShrink: 1 },
  hint: { fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 2 },
});
