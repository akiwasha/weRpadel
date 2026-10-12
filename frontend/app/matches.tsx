import { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Modal, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, fullUrl } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, type } from "@/src/lib/theme";
import MatchDatePicker, { formatMatchRange } from "@/src/components/MatchDatePicker";

type Player = { id: string; pseudo: string; avatar_url: string | null; level: string };
type Match = {
  id: string;
  club_id: string;
  club_name: string | null;
  content: string;
  availability: string | null;
  match_date: string | null;
  match_end_date: string | null;
  status: string;
  created_at: string;
  players: Player[];
  offline_players: string[];
  total_players: number;
  slots_left: number;
  is_full: boolean;
  is_author: boolean;
  can_rate: boolean;
  has_rated: boolean;
  reminders_muted: boolean;
};

const GROUPS: { key: string; label: string }[] = [
  { key: "upcoming", label: "À venir" },
  { key: "ongoing", label: "En cours" },
  { key: "past", label: "Passés" },
];

function inGroup(m: Match, key: string): boolean {
  if (key === "upcoming") return m.status === "upcoming";
  if (key === "ongoing") return m.status === "ongoing";
  // Passés = matchs réellement joués -> 4 joueurs réunis
  return m.is_full && (m.status === "past" || m.status === "undated");
}

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
  const [group, setGroup] = useState("upcoming");
  const [replayFor, setReplayFor] = useState<Match | null>(null);
  const [replayDate, setReplayDate] = useState<string | null>(null);
  const [replayEndDate, setReplayEndDate] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [rateFor, setRateFor] = useState<Match | null>(null);
  const [ratingsMap, setRatingsMap] = useState<Record<string, number>>({});
  const [savingRating, setSavingRating] = useState(false);
  const [weeklyId, setWeeklyId] = useState<string | null>(null);
  const [weatherByClub, setWeatherByClub] = useState<Record<string, { outdoor: boolean; days: any[] }>>({});
  const autoOpenedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const m = await api.matchHistory();
      setMatches(m);
      // Fetch weather for outdoor clubs of upcoming dated matches
      const clubIds: string[] = Array.from(new Set<string>(
        m.filter((x: Match) => x.status === "upcoming" && x.match_date).map((x: Match) => x.club_id)
      ));
      setWeatherByClub((prev) => {
        clubIds.forEach((cid) => {
          if (prev[cid]) return;
          api.clubWeather(cid as string)
            .then((w) => setWeatherByClub((p) => ({ ...p, [cid as string]: w })))
            .catch(() => {});
        });
        return prev;
      });
      if (!autoOpenedRef.current) {
        const pending = m.find((x: Match) => x.can_rate);
        if (pending) {
          autoOpenedRef.current = true;
          setGroup("past");
          setRateFor(pending);
          setRatingsMap({});
        }
      }
    } catch (e) { console.log(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doReplay = async () => {
    if (!replayFor || !replayDate) return;
    setReplaying(true);
    try {
      await api.replayMatch(replayFor.id, replayDate, replayEndDate);
      setReplayFor(null);
      setReplayDate(null);
      setReplayEndDate(null);
      setGroup("upcoming");
      await load();
    } catch (e) { console.log(e); }
    finally { setReplaying(false); }
  };

  const openRate = (m: Match) => {
    setRatingsMap({});
    setRateFor(m);
  };

  const toggleMute = async (m: Match) => {
    setMatches((prev) => prev.map((x) => (x.id === m.id ? { ...x, reminders_muted: !x.reminders_muted } : x)));
    try {
      const updated = await api.toggleMute(m.id);
      setMatches((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    } catch (e) {
      console.log(e);
      setMatches((prev) => prev.map((x) => (x.id === m.id ? { ...x, reminders_muted: !x.reminders_muted } : x)));
    }
  };

  const proposeWeekly = (m: Match) => {
    if (!m.match_date) return;
    const start = new Date(m.match_date);
    start.setDate(start.getDate() + 7);
    let endIso: string | null = null;
    if (m.match_end_date) {
      const e = new Date(m.match_end_date);
      e.setDate(e.getDate() + 7);
      endIso = e.toISOString();
    }
    const label = formatMatchRange(start.toISOString(), endIso) || "";
    Alert.alert(
      "Reproposer la semaine prochaine",
      `Créer un nouveau match avec la même équipe le ${label} ? Chaque joueur recevra une invitation.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Reproposer",
          onPress: async () => {
            setWeeklyId(m.id);
            try {
              await api.replayMatch(m.id, start.toISOString(), endIso);
              setGroup("upcoming");
              await load();
            } catch (e) { console.log(e); }
            finally { setWeeklyId(null); }
          },
        },
      ]
    );
  };

  const rateCoPlayers = rateFor ? rateFor.players.filter((p) => p.id !== user?.id) : [];  const allRated = rateCoPlayers.length > 0 && rateCoPlayers.every((p) => ratingsMap[p.id] > 0);

  const matchWeather = (item: Match) => {
    const w = weatherByClub[item.club_id];
    if (!w || !w.outdoor || !item.match_date) return null;
    const d = new Date(item.match_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return (w.days || []).find((x: any) => x.date === key) || null;
  };

  const doRate = async () => {
    if (!rateFor || !allRated) return;
    setSavingRating(true);
    try {
      const ratings = rateCoPlayers.map((p) => ({ user_id: p.id, stars: ratingsMap[p.id] }));
      await api.rateMatch(rateFor.id, ratings);
      setRateFor(null);
      setRatingsMap({});
      await load();
    } catch (e) { console.log(e); }
    finally { setSavingRating(false); }
  };

  const activeGroup = GROUPS.find((g) => g.key === group)!;
  const visible = matches.filter((m) => inGroup(m, group));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="history-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Mes matchs</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.segment}>
        {GROUPS.map((g) => {
          const count = matches.filter((m) => inGroup(m, g.key)).length;
          return (
            <Pressable
              key={g.key}
              testID={`group-${g.key}`}
              onPress={() => setGroup(g.key)}
              style={[styles.segmentBtn, group === g.key && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, group === g.key && styles.segmentTextActive]}>{g.label} {count > 0 ? `(${count})` : ""}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="tennisball-outline" size={64} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>Aucun match {activeGroup.label.toLowerCase()}</Text>
          <Text style={styles.emptySub}>Rejoins ou crée un match dans un club pour le retrouver ici</Text>
          <Pressable style={styles.cta} onPress={() => router.push("/(tabs)")}>
            <Text style={styles.ctaText}>Explorer les clubs</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visible}
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
                  <Text style={styles.date}>{item.match_date ? formatMatchRange(item.match_date, item.match_end_date) : fmt(item.created_at)}</Text>
                </View>
                {item.is_full ? (
                  <View style={styles.confirmed}><Text style={styles.confirmedText}>4/4</Text></View>
                ) : (
                  <View style={styles.open}><Text style={styles.openText}>{item.total_players}/4</Text></View>
                )}
              </View>

              <Text style={styles.content} numberOfLines={2}>{item.content}</Text>

              {item.status === "upcoming" && (() => {
                const wd = matchWeather(item);
                return wd ? (
                  <View style={styles.weatherChip} testID={`match-weather-${item.id}`}>
                    <Ionicons name={wd.icon} size={16} color={colors.info} />
                    <Text style={styles.weatherChipText}>
                      {wd.label}{wd.temp_max != null ? ` · ${wd.temp_max}°` : ""}{wd.precipitation != null ? ` · 💧 ${wd.precipitation}%` : ""}
                    </Text>
                  </View>
                ) : null;
              })()}

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

              {item.status === "upcoming" && item.match_date && (
                <Pressable
                  testID={`mute-${item.id}`}
                  onPress={() => toggleMute(item)}
                  style={styles.muteBtn}
                >
                  <Ionicons
                    name={item.reminders_muted ? "notifications-off-outline" : "notifications-outline"}
                    size={17}
                    color={item.reminders_muted ? colors.onSurfaceTertiary : colors.brandPrimary}
                  />
                  <Text style={[styles.muteText, item.reminders_muted && { color: colors.onSurfaceTertiary }]}>
                    {item.reminders_muted ? "Rappels coupés · toucher pour réactiver" : "Rappels activés (24h + 2h avant)"}
                  </Text>
                </Pressable>
              )}

              {item.can_rate && (
                <Pressable
                  testID={`rate-match-${item.id}`}
                  onPress={() => openRate(item)}
                  style={styles.rateBtn}
                >
                  <Ionicons name="star" size={18} color={colors.onSurface} />
                  <Text style={styles.rateText}>Noter la fiabilité des joueurs</Text>
                </Pressable>
              )}
              {item.has_rated && item.is_full && (
                <View style={styles.ratedTag}>
                  <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                  <Text style={styles.ratedText}>Joueurs notés · merci !</Text>
                </View>
              )}

              {item.is_full && (
                <Pressable
                  testID={`replay-${item.id}`}
                  onPress={() => { setReplayFor(item); setReplayDate(null); setReplayEndDate(null); }}
                  style={styles.replayBtn}
                >
                  <Ionicons name="repeat" size={18} color={colors.onBrandPrimary} />
                  <Text style={styles.replayText}>Rejouer avec cette équipe</Text>
                </Pressable>
              )}
              {item.is_full && item.match_date && (
                <Pressable
                  testID={`weekly-${item.id}`}
                  onPress={() => proposeWeekly(item)}
                  disabled={weeklyId === item.id}
                  style={styles.weeklyBtn}
                >
                  {weeklyId === item.id ? <ActivityIndicator color={colors.brandPrimary} /> : (
                    <><Ionicons name="calendar" size={17} color={colors.brandPrimary} /><Text style={styles.weeklyText}>Reproposer la semaine prochaine</Text></>
                  )}
                </Pressable>
              )}
              <Text style={styles.hint}>Touche un joueur pour le recontacter</Text>
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!replayFor} transparent animationType="slide" onRequestClose={() => setReplayFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Rejouer ensemble</Text>
              <Pressable testID="replay-close" onPress={() => setReplayFor(null)}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            {replayFor && (
              <View style={styles.teamRow}>
                {replayFor.players.map((p) => (
                  <View key={p.id} style={styles.teamChip}>
                    <Ionicons name="person-circle" size={16} color={colors.brandPrimary} />
                    <Text style={styles.teamChipText}>{p.id === user?.id ? "Toi" : p.pseudo}</Text>
                  </View>
                ))}
                {replayFor.offline_players.map((n, i) => (
                  <View key={`o${i}`} style={styles.teamChip}>
                    <Ionicons name="person" size={14} color={colors.onBrandSecondary} />
                    <Text style={styles.teamChipText}>{n || "Invité"}</Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.modalSub}>
              Étape 2 : choisis la date et l’heure. Les 4 joueurs recevront une invitation par message.
            </Text>
            <MatchDatePicker value={replayDate} onChange={(s, e) => { setReplayDate(s); setReplayEndDate(e); }} testIDPrefix="replay" />
            <Pressable
              testID="replay-confirm"
              onPress={doReplay}
              disabled={!replayDate || replaying}
              style={[styles.replayConfirm, (!replayDate || replaying) && { opacity: 0.5 }]}
            >
              {replaying ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.replayConfirmText}>Proposer ce match</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!rateFor} transparent animationType="slide" onRequestClose={() => setRateFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Noter la fiabilité</Text>
              <Pressable testID="rate-close" onPress={() => setRateFor(null)}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            <Text style={styles.modalSub}>
              Le match à {rateFor?.club_name || "ce club"} est terminé. Note la fiabilité de tes partenaires
              (ponctualité, sympathie, pas d’annulation de dernière minute) — pas leur niveau de jeu.
            </Text>
            {rateCoPlayers.map((p) => (
              <View key={p.id} style={styles.rateRow} testID={`rate-player-${p.id}`}>
                <View style={styles.rateRowHead}>
                  {p.avatar_url ? (
                    <Image source={{ uri: fullUrl(p.avatar_url)! }} style={styles.rateAvatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.rateAvatar, styles.fallback]}>
                      <Text style={{ color: colors.brandPrimary, fontWeight: "800", fontSize: 13 }}>{p.pseudo[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.rateName} numberOfLines={1}>{p.pseudo}</Text>
                </View>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Pressable
                      key={s}
                      testID={`rate-${p.id}-star-${s}`}
                      onPress={() => setRatingsMap((prev) => ({ ...prev, [p.id]: s }))}
                    >
                      <Ionicons
                        name={(ratingsMap[p.id] || 0) >= s ? "star" : "star-outline"}
                        size={30}
                        color={colors.warning}
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            <Pressable
              testID="rate-confirm"
              onPress={doRate}
              disabled={!allRated || savingRating}
              style={[styles.replayConfirm, (!allRated || savingRating) && { opacity: 0.5 }]}
            >
              {savingRating ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.replayConfirmText}>Valider les notes</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
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
  segment: {
    flexDirection: "row", margin: spacing.lg, marginBottom: spacing.sm,
    padding: 4, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
  },
  segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: "center" },
  segmentActive: { backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  segmentText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: type.sm },
  segmentTextActive: { color: colors.onSurface },
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
  weatherChip: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: colors.infoMuted, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  weatherChipText: { color: colors.onInfoMuted, fontWeight: "700", fontSize: type.sm },
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
  replayBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 11, marginTop: spacing.xs,
  },
  replayText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.base },
  weeklyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderRadius: radius.pill, paddingVertical: 10, borderWidth: 1.5, borderColor: colors.brandPrimary,
  },
  weeklyText: { color: colors.brandPrimary, fontWeight: "800", fontSize: type.base },
  muteBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs,
    paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  muteText: { color: colors.brandPrimary, fontWeight: "700", fontSize: type.sm, flexShrink: 1 },
  rateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.warning, borderRadius: radius.pill, paddingVertical: 11, marginTop: spacing.xs,
  },
  rateText: { color: colors.onSurface, fontWeight: "800", fontSize: type.base },
  ratedTag: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.xs },
  ratedText: { color: colors.success, fontWeight: "700", fontSize: type.sm },
  rateRow: { gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rateRowHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rateAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceTertiary },
  rateName: { fontSize: type.base, fontWeight: "800", color: colors.onSurface, flex: 1 },
  starsRow: { flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md,
  },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: type.xl, fontWeight: "800", color: colors.onSurface },
  modalSub: { fontSize: type.base, color: colors.onSurfaceSecondary, lineHeight: 20 },
  teamRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  teamChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  teamChipText: { fontSize: type.sm, fontWeight: "700", color: colors.onSurface },
  replayConfirm: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 15, alignItems: "center", marginTop: spacing.sm },
  replayConfirmText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.lg },
});
