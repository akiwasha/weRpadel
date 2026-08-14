import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, fullUrl } from "@/src/lib/api";
import { colors, spacing, radius, type } from "@/src/lib/theme";

type Fav = { id: string; pseudo: string; avatar_url: string | null; level: string; reliability_avg: number; verified?: boolean };

export default function Favorites() {
  const router = useRouter();
  const [favs, setFavs] = useState<Fav[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const f = await api.favorites();
      setFavs(f);
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="fav-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Mes favoris</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : favs.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="heart-outline" size={64} color={colors.info} />
          <Text style={styles.emptyTitle}>Aucun favori</Text>
          <Text style={styles.emptySub}>Touche le ❤️ sur le profil d’un joueur pour le retrouver ici</Text>
        </View>
      ) : (
        <FlatList
          data={favs}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <Pressable testID={`fav-${item.id}`} onPress={() => router.push(`/player/${item.id}`)} style={styles.row}>
              {item.avatar_url ? (
                <Image source={{ uri: fullUrl(item.avatar_url)! }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.fallback]}>
                  <Text style={styles.letter}>{item.pseudo[0]?.toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.pseudo}</Text>
                <Text style={styles.meta}>{item.level} · ⭐ {item.reliability_avg.toFixed(1)}</Text>
              </View>
              <Ionicons name="heart" size={20} color={colors.info} />
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.appBg },
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
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceTertiary },
  fallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSecondary },
  letter: { fontSize: 22, fontWeight: "800", color: colors.brandPrimary },
  name: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  meta: { fontSize: type.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
});
