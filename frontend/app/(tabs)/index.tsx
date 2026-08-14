import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius, type } from "@/src/lib/theme";

type Club = {
  id: string;
  name: string;
  city: string;
  region: string;
  image_url: string | null;
  announcements_count: number;
};

export default function ClubsScreen() {
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([
        api.listClubs(search || undefined, selectedRegion || undefined),
        api.regions(),
      ]);
      setClubs(c);
      setRegions(r);
    } catch (e) {
      console.log("clubs err", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, selectedRegion]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderCard = ({ item }: { item: Club }) => (
    <Pressable
      testID={`club-card-${item.id}`}
      onPress={() => router.push(`/club/${item.id}`)}
      style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <Image
        source={{ uri: item.image_url || "https://images.unsplash.com/photo-1658723826297-fe4d1b1e6600?w=800" }}
        style={styles.cardImage}
        contentFit="cover"
        transition={200}
      />
      <LinearGradient
        colors={["transparent", "rgba(26,29,31,0.85)"]}
        style={styles.scrim}
      />
      <View style={styles.cardContent}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.cardMeta}>
          <Ionicons name="location" size={14} color={colors.onBrandPrimary} />
          <Text style={styles.cardCity}>{item.city} · {item.region}</Text>
        </View>
        {item.announcements_count > 0 && (
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>
              {item.announcements_count} annonce{item.announcements_count > 1 ? "s" : ""}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hi}>Bienvenue 👋</Text>
          <Text style={styles.title}>Clubs de Padel</Text>
        </View>
        <Pressable
          testID="suggest-club-button"
          onPress={() => router.push("/suggest-club")}
          style={styles.plusBtn}
        >
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
        <TextInput
          testID="clubs-search-input"
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un club ou ville"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" }}
        >
          <Pressable
            testID="region-chip-all"
            onPress={() => setSelectedRegion(null)}
            style={[styles.chip, !selectedRegion && styles.chipActive]}
          >
            <Text style={[styles.chipText, !selectedRegion && styles.chipTextActive]}>Toutes régions</Text>
          </Pressable>
          {regions.map((r) => (
            <Pressable
              key={r}
              testID={`region-chip-${r}`}
              onPress={() => setSelectedRegion(selectedRegion === r ? null : r)}
              style={[styles.chip, selectedRegion === r && styles.chipActive]}
            >
              <Text style={[styles.chipText, selectedRegion === r && styles.chipTextActive]}>{r}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : clubs.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="tennisball-outline" size={64} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>Aucun club trouvé</Text>
          <Pressable style={styles.suggestBtn} onPress={() => router.push("/suggest-club")}>
            <Text style={styles.suggestBtnText}>Suggérer un club</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={clubs}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  hi: { fontSize: type.base, color: colors.onSurfaceSecondary },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  plusBtn: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: type.base, color: colors.onSurface, paddingVertical: 4 },
  chipsWrap: { height: 56, justifyContent: "center", marginBottom: spacing.sm },
  chip: {
    flexShrink: 0, height: 36,
    paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: type.base },
  chipTextActive: { color: colors.onBrandPrimary },
  card: {
    height: 180, borderRadius: radius.lg, overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  cardImage: { ...StyleSheet.absoluteFillObject },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "70%" },
  cardContent: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: spacing.xs },
  cardName: { color: colors.onSurfaceInverse, fontSize: type.xl, fontWeight: "800" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  cardCity: { color: colors.onSurfaceInverse, fontSize: type.base, opacity: 0.95 },
  badge: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: spacing.xs,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.onBrandPrimary },
  badgeText: { color: colors.onBrandPrimary, fontSize: type.sm, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: type.lg, color: colors.onSurfaceSecondary, fontWeight: "700" },
  suggestBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 12 },
  suggestBtnText: { color: colors.onBrandPrimary, fontWeight: "800" },
});
