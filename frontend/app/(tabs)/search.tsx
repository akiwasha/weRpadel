import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, ScrollView, TextInput, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, fullUrl } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, type, LEVELS } from "@/src/lib/theme";
import { formatMatchRange } from "@/src/components/MatchDatePicker";

type Player = { id: string; pseudo: string; avatar_url: string | null; level: string };
type Match = {
  id: string;
  club_id: string;
  club_name: string | null;
  club_city?: string | null;
  club_region?: string | null;
  club_is_outdoor?: boolean;
  distance_km?: number | null;
  content: string;
  author: { id: string; pseudo: string; avatar_url: string | null; level: string; reliability_avg: number; verified?: boolean };
  match_date: string | null;
  match_end_date: string | null;
  court_price?: number | null;
  players: Player[];
  offline_players: string[];
  total_players: number;
  slots_left: number;
  is_full: boolean;
  is_member: boolean;
  is_author: boolean;
};

const LEVEL_FILTERS = ["Tous", ...LEVELS];

function dateChips() {
  const mk = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T12:00:00`;
    return iso;
  };
  return [
    { key: "", label: "Toutes dates" },
    { key: mk(0), label: "Aujourd'hui" },
    { key: mk(1), label: "Demain" },
    { key: mk(2), label: "Après-demain" },
  ];
}

export default function SearchMatches() {
  const router = useRouter();
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  const [matches, setMatches] = useState<Match[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [level, setLevel] = useState("Tous");
  const [region, setRegion] = useState("");
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [sortByDistance, setSortByDistance] = useState(false);
  const [weatherByClub, setWeatherByClub] = useState<Record<string, { outdoor: boolean; days: any[] }>>({});
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const chips = useMemo(dateChips, []);

  const load = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([
        api.openMatches({ level, region, date, search: search.trim() || undefined, sort: sortByDistance ? "distance" : undefined }),
        regions.length ? Promise.resolve(regions) : api.regions(),
      ]);
      setMatches(m);
      if (!regions.length) setRegions(r);
      // Fetch weather for outdoor clubs of dated matches
      const clubIds = Array.from(new Set(
        m.filter((x: Match) => x.club_is_outdoor && x.match_date).map((x: Match) => x.club_id)
      ));
      setWeatherByClub((prev) => {
        clubIds.forEach((cid) => {
          if (prev[cid as string]) return;
          api.clubWeather(cid as string)
            .then((w) => setWeatherByClub((p) => ({ ...p, [cid as string]: w })))
            .catch(() => {});
        });
        return prev;
      });
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [level, region, date, search, sortByDistance, regions]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isMine = (uid: string) => user?.id === uid;

  const matchWeather = (item: Match) => {
    const w = weatherByClub[item.club_id];
    if (!w || !w.outdoor || !item.match_date) return null;
    const d = new Date(item.match_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return (w.days || []).find((x: any) => x.date === key) || null;
  };

  const join = async (m: Match) => {
    if (!isSubscribed) { router.push("/paywall"); return; }
    setJoiningId(m.id);
    try {
      await api.joinAnnouncement(m.id);
      await load();
    } catch (e) { console.log(e); }
    finally { setJoiningId(null); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Rechercher un match</Text>
        <Text style={styles.subtitle}>Trouve une partie à rejoindre partout en France</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.onInfoMuted} />
        <TextInput
          testID="search-input"
          value={search}
          onChangeText={setSearch}
          placeholder="Club ou ville..."
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable testID="search-clear" onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        )}
      </View>

      <View style={styles.filterBlock}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {LEVEL_FILTERS.map((lv) => (
            <Pressable key={lv} testID={`filter-level-${lv}`} onPress={() => setLevel(lv)} style={[styles.chip, level === lv && styles.chipActive]}>
              <Text style={[styles.chipText, level === lv && styles.chipTextActive]}>{lv}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {chips.map((c) => (
            <Pressable key={c.label} testID={`filter-date-${c.label}`} onPress={() => setDate(c.key)} style={[styles.chip, date === c.key && styles.chipActive]}>
              <Ionicons name="calendar-outline" size={13} color={date === c.key ? colors.onSurfaceInverse : colors.onSurfaceSecondary} />
              <Text style={[styles.chipText, date === c.key && styles.chipTextActive]}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <Pressable testID="filter-region-Toutes" onPress={() => setRegion("")} style={[styles.chip, region === "" && styles.chipActive]}>
            <Text style={[styles.chipText, region === "" && styles.chipTextActive]}>Toutes régions</Text>
          </Pressable>
          {regions.map((r) => (
            <Pressable key={r} testID={`filter-region-${r}`} onPress={() => setRegion(r)} style={[styles.chip, region === r && styles.chipActive]}>
              <Text style={[styles.chipText, region === r && styles.chipTextActive]}>{r}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.sortRow}>
          <Pressable testID="sort-distance-toggle" onPress={() => setSortByDistance((v) => !v)} style={[styles.sortChip, sortByDistance && styles.sortChipActive]}>
            <Ionicons name="navigate" size={14} color={sortByDistance ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
            <Text style={[styles.sortText, sortByDistance && styles.sortTextActive]}>
              {sortByDistance ? "Trié par distance" : "Trier par distance"}
            </Text>
          </Pressable>
          {sortByDistance && !user?.city && (
            <Text style={styles.sortHint}>Ajoute ta ville dans ton profil</Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : matches.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={60} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>Aucun match trouvé</Text>
          <Text style={styles.emptySub}>Élargis tes filtres ou crée ton propre match dans un club</Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <Pressable testID={`search-match-${item.id}`} onPress={() => router.push(`/club/${item.club_id}`)} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.clubBadge}><Ionicons name="location" size={14} color={colors.onBrandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clubName} numberOfLines={1}>{item.club_name || "Club"}</Text>
                  <View style={styles.cityRow}>
                    <Text style={styles.clubCity} numberOfLines={1}>{item.club_city}{item.club_region ? ` · ${item.club_region}` : ""}</Text>
                    {item.distance_km != null && (
                      <View style={styles.distancePill}>
                        <Ionicons name="navigate" size={10} color={colors.onInfoMuted} />
                        <Text style={styles.distanceText}>~{item.distance_km} km</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.slotsPill}>
                  <Text style={styles.slotsPillText}>{item.total_players}/4</Text>
                </View>
              </View>

              <Pressable testID={`search-author-${item.id}`} onPress={() => !isMine(item.author.id) && router.push(`/player/${item.author.id}`)} style={styles.authorRow}>
                {item.author.avatar_url ? (
                  <Image source={{ uri: fullUrl(item.author.avatar_url)! }} style={styles.authorAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.authorAvatar, styles.fallback]}>
                    <Text style={{ color: colors.brandPrimary, fontWeight: "800", fontSize: 12 }}>{item.author.pseudo[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.authorName}>{item.author.pseudo}</Text>
                <Text style={styles.authorMeta}>· {item.author.level} · ⭐ {item.author.reliability_avg.toFixed(1)}</Text>
              </Pressable>

              <Text style={styles.content} numberOfLines={2}>{item.content}</Text>

              <View style={styles.metaRow}>
                {item.match_date ? (
                  <View style={styles.datePill}>
                    <Ionicons name="calendar" size={13} color={colors.onBrandSecondary} />
                    <Text style={styles.datePillText}>{formatMatchRange(item.match_date, item.match_end_date)}</Text>
                  </View>
                ) : (
                  <View style={styles.undatedPill}>
                    <Ionicons name="time-outline" size={13} color={colors.onSurfaceTertiary} />
                    <Text style={styles.undatedText}>Date à définir</Text>
                  </View>
                )}
                {item.court_price != null && (
                  <View style={styles.pricePill}>
                    <Ionicons name="pricetag" size={12} color={colors.onInfoMuted} />
                    <Text style={styles.priceText}>{(item.court_price / 4).toFixed(2)} €/joueur</Text>
                  </View>
                )}
                {(() => {
                  const wd = matchWeather(item);
                  return wd ? (
                    <View style={styles.weatherPill} testID={`search-weather-${item.id}`}>
                      <Ionicons name={wd.icon} size={13} color={colors.info} />
                      <Text style={styles.weatherText}>
                        {wd.temp_max != null ? `${wd.temp_max}°` : wd.label}{wd.precipitation != null ? ` · 💧${wd.precipitation}%` : ""}
                      </Text>
                    </View>
                  ) : null;
                })()}
              </View>

              {item.is_author ? (
                <View style={[styles.joinBtn, styles.joinAuthor]}>
                  <Ionicons name="ribbon" size={16} color={colors.onSurfaceSecondary} />
                  <Text style={styles.joinAuthorText}>Ton match</Text>
                </View>
              ) : item.is_member ? (
                <View style={[styles.joinBtn, styles.joinAuthor]}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={[styles.joinAuthorText, { color: colors.success }]}>Tu participes</Text>
                </View>
              ) : (
                <Pressable testID={`search-join-${item.id}`} onPress={() => join(item)} disabled={joiningId === item.id} style={[styles.joinBtn, styles.joinActive]}>
                  {joiningId === item.id ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                    <><Ionicons name="tennisball" size={16} color={colors.onBrandPrimary} /><Text style={styles.joinText}>Rejoindre le match</Text></>
                  )}
                </Pressable>
              )}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.appBg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  title: { fontSize: type.xxl, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: type.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.infoMuted, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: type.base, color: colors.onSurface },
  filterBlock: { gap: spacing.xs, paddingVertical: spacing.sm },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0,
    height: 34, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: type.sm },
  chipTextActive: { color: colors.onSurfaceInverse },
  sortRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  sortChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    height: 32, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  sortChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  sortText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: type.sm },
  sortTextActive: { color: colors.onBrandPrimary },
  sortHint: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: "600", flexShrink: 1 },
  cityRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 1 },
  distancePill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.infoMuted, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  distanceText: { color: colors.onInfoMuted, fontWeight: "800", fontSize: 11 },
  weatherPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.infoMuted, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  weatherText: { color: colors.onInfoMuted, fontWeight: "700", fontSize: type.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: type.lg, color: colors.onSurface, fontWeight: "700" },
  emptySub: { fontSize: type.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  clubBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  clubName: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  clubCity: { fontSize: type.sm, color: colors.onSurfaceTertiary, marginTop: 1 },
  slotsPill: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  slotsPillText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: type.sm },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  authorAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  fallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSecondary },
  authorName: { fontSize: type.sm, fontWeight: "800", color: colors.onSurface },
  authorMeta: { fontSize: type.sm, color: colors.onSurfaceTertiary, flexShrink: 1 },
  content: { fontSize: type.base, color: colors.onSurface, lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  datePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brandSecondary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  datePillText: { color: colors.onBrandSecondary, fontWeight: "700", fontSize: type.sm },
  undatedPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  undatedText: { color: colors.onSurfaceTertiary, fontWeight: "700", fontSize: type.sm },
  pricePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.infoMuted, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  priceText: { color: colors.onInfoMuted, fontWeight: "700", fontSize: type.sm },
  joinBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.pill, paddingVertical: 11, marginTop: spacing.xs, minHeight: 44 },
  joinActive: { backgroundColor: colors.brandPrimary },
  joinText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.base },
  joinAuthor: { backgroundColor: colors.surfaceTertiary },
  joinAuthorText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: type.base },
});
