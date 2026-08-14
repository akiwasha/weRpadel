import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { api, fullUrl } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, type } from "@/src/lib/theme";
import { VerifiedTick } from "@/src/components/VerifiedBadge";

type Player = { id: string; pseudo: string; avatar_url: string | null; level: string };
type Announcement = {
  id: string;
  club_id: string;
  content: string;
  availability: string | null;
  created_at: string;
  author: { id: string; pseudo: string; avatar_url: string | null; level: string; reliability_avg: number; reliability_count: number; verified?: boolean };
  players: Player[];
  offline_count: number;
  total_players: number;
  max_players: number;
  slots_left: number;
  is_full: boolean;
  is_member: boolean;
  is_author: boolean;
};

const LEVEL_FILTERS = ["Tous", "Débutant", "Intermédiaire", "Confirmé", "Expert"];

export default function ClubDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  const [club, setClub] = useState<any>(null);
  const [tab, setTab] = useState<"info" | "chat">("chat");
  const [items, setItems] = useState<Announcement[]>([]);
  const [text, setText] = useState("");
  const [availability, setAvailability] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState("Tous");
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, a] = await Promise.all([api.getClub(id), api.announcements(id)]);
      setClub(c);
      setItems(a);
    } catch (e) { console.log(e); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const post = async () => {
    if (!text.trim() || !id) return;
    setPosting(true);
    try {
      const a = await api.postAnnouncement(id, text.trim(), availability.trim() || undefined, partySize);
      setItems([a, ...items]);
      setText("");
      setAvailability("");
      setPartySize(1);
    } catch (e: any) { console.log(e); }
    finally { setPosting(false); }
  };

  const toggleJoin = async (ann: Announcement) => {
    if (!isSubscribed) { router.push("/paywall"); return; }
    setJoiningId(ann.id);
    try {
      const updated = ann.is_member ? await api.leaveAnnouncement(ann.id) : await api.joinAnnouncement(ann.id);
      setItems((prev) => prev.map((i) => (i.id === ann.id ? updated : i)));
    } catch (e) { console.log(e); }
    finally { setJoiningId(null); }
  };

  if (loading || !club) {
    return <View style={styles.centerLoader}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>;
  }

  const isMine = (uid: string) => user?.id === uid;
  const filtered = levelFilter === "Tous" ? items : items.filter((i) => i.author.level === levelFilter);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top"]} style={styles.hero}>
        <Image
          source={{ uri: club.image_url || "https://images.unsplash.com/photo-1658723826297-fe4d1b1e6600?w=800" }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
        <LinearGradient colors={["rgba(26,29,31,0.4)", "rgba(26,29,31,0.9)"]} style={StyleSheet.absoluteFillObject} />
        <View style={styles.heroContent}>
          <Pressable testID="club-back" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.onSurfaceInverse} />
          </Pressable>
          <View>
            <Text style={styles.heroName}>{club.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="location" size={14} color={colors.onSurfaceInverse} />
              <Text style={styles.heroCity}>{club.city} · {club.region}</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.segment}>
        <Pressable
          testID="tab-chat"
          onPress={() => setTab("chat")}
          style={[styles.segmentBtn, tab === "chat" && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, tab === "chat" && styles.segmentTextActive]}>Annonces</Text>
        </Pressable>
        <Pressable
          testID="tab-info"
          onPress={() => setTab("info")}
          style={[styles.segmentBtn, tab === "info" && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, tab === "info" && styles.segmentTextActive]}>Infos</Text>
        </Pressable>
      </View>

      {tab === "info" ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={styles.infoCard}>
            <Ionicons name="location-outline" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Adresse</Text>
              <Text style={styles.infoValue}>{club.address || "Non renseignée"}</Text>
            </View>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="map-outline" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Région</Text>
              <Text style={styles.infoValue}>{club.region}</Text>
            </View>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="megaphone-outline" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Annonces actives</Text>
              <Text style={styles.infoValue}>{club.announcements_count}</Text>
            </View>
          </View>
        </ScrollView>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
          <View style={styles.filterRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" }}
            >
              {LEVEL_FILTERS.map((lv) => (
                <Pressable
                  key={lv}
                  testID={`level-filter-${lv}`}
                  onPress={() => setLevelFilter(lv)}
                  style={[styles.filterChip, levelFilter === lv && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, levelFilter === lv && styles.filterChipTextActive]}>{lv}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={{ flex: 1 }}>
            <FlatList
              data={filtered}
              keyExtractor={(i) => i.id}
              scrollEnabled={isSubscribed}
              contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: spacing.xxxl, gap: spacing.md }}>
                  <Ionicons name="megaphone-outline" size={56} color={colors.onSurfaceTertiary} />
                  <Text style={{ color: colors.onSurfaceSecondary, fontSize: type.base, textAlign: "center" }}>
                    {levelFilter === "Tous" ? "Sois le premier à créer un match !" : `Aucun match niveau ${levelFilter}`}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.ann}>
                  <Pressable
                    testID={`ann-author-${item.id}`}
                    onPress={() => !isMine(item.author.id) && router.push(`/player/${item.author.id}`)}
                    style={styles.annHead}
                  >
                    {item.author.avatar_url ? (
                      <Image source={{ uri: fullUrl(item.author.avatar_url)! }} style={styles.annAvatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.annAvatar, styles.annAvatarFallback]}>
                        <Text style={{ color: colors.brandPrimary, fontWeight: "800" }}>{item.author.pseudo[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={styles.annName}>{item.author.pseudo}</Text>
                        {item.author.verified && <VerifiedTick size={14} />}
                      </View>
                      <Text style={styles.annMeta}>{item.author.level} · ⭐ {item.author.reliability_avg.toFixed(1)}</Text>
                    </View>
                    {!isMine(item.author.id) && (
                      <Pressable
                        testID={`ann-msg-${item.id}`}
                        onPress={() => router.push(`/chat/${item.author.id}`)}
                        style={styles.msgIcon}
                      >
                        <Ionicons name="chatbubble" size={18} color={colors.onBrandPrimary} />
                      </Pressable>
                    )}
                  </Pressable>
                  <Text style={styles.annContent}>{item.content}</Text>
                  {item.availability && (
                    <View style={styles.availPill}>
                      <Ionicons name="time-outline" size={14} color={colors.onBrandSecondary} />
                      <Text style={styles.availTxt}>{item.availability}</Text>
                    </View>
                  )}

                  {/* Match panel — 4 joueurs */}
                  <View style={styles.matchPanel}>
                    <View style={styles.playersRow}>
                      {item.players.map((p, idx) => (
                        <View key={p.id} style={[styles.playerAvatar, idx > 0 && { marginLeft: -10 }]}>
                          {p.avatar_url ? (
                            <Image source={{ uri: fullUrl(p.avatar_url)! }} style={styles.playerImg} contentFit="cover" />
                          ) : (
                            <View style={[styles.playerImg, styles.playerFallback]}>
                              <Text style={{ color: colors.brandPrimary, fontWeight: "800", fontSize: 12 }}>{p.pseudo[0]?.toUpperCase()}</Text>
                            </View>
                          )}
                        </View>
                      ))}
                      {Array.from({ length: item.offline_count }).map((_, i) => (
                        <View key={`offline-${i}`} style={[styles.playerAvatar, styles.offlineSlot, { marginLeft: -10 }]}>
                          <Ionicons name="person" size={15} color={colors.onBrandSecondary} />
                        </View>
                      ))}
                      {Array.from({ length: item.slots_left }).map((_, i) => (
                        <View key={`empty-${i}`} style={[styles.playerAvatar, styles.emptySlot, { marginLeft: -10 }]}>
                          <Ionicons name="add" size={16} color={colors.onSurfaceTertiary} />
                        </View>
                      ))}
                    </View>

                    {item.is_full ? (
                      <View style={styles.confirmedBadge}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.onSuccess} />
                        <Text style={styles.confirmedText}>Match confirmé · 4/4</Text>
                      </View>
                    ) : (
                      <Text style={styles.slotsText}>
                        {item.total_players}/4 · {item.slots_left} place{item.slots_left > 1 ? "s" : ""}
                      </Text>
                    )}
                  </View>

                  {item.is_author ? (
                    <View style={[styles.joinBtn, styles.joinAuthor]}>
                      <Ionicons name="ribbon" size={16} color={colors.onSurfaceSecondary} />
                      <Text style={styles.joinAuthorText}>Ton match</Text>
                    </View>
                  ) : item.is_member ? (
                    <Pressable
                      testID={`ann-leave-${item.id}`}
                      onPress={() => toggleJoin(item)}
                      disabled={joiningId === item.id}
                      style={[styles.joinBtn, styles.leaveBtn]}
                    >
                      {joiningId === item.id ? <ActivityIndicator color={colors.error} /> : (
                        <><Ionicons name="exit-outline" size={16} color={colors.error} /><Text style={styles.leaveText}>Quitter le match</Text></>
                      )}
                    </Pressable>
                  ) : item.is_full ? (
                    <View style={[styles.joinBtn, styles.fullBtn]}>
                      <Text style={styles.fullText}>Match complet</Text>
                    </View>
                  ) : (
                    <Pressable
                      testID={`ann-join-${item.id}`}
                      onPress={() => toggleJoin(item)}
                      disabled={joiningId === item.id}
                      style={[styles.joinBtn, styles.joinActive]}
                    >
                      {joiningId === item.id ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                        <><Ionicons name="tennisball" size={16} color={colors.onBrandPrimary} /><Text style={styles.joinText}>Rejoindre le match</Text></>
                      )}
                    </Pressable>
                  )}
                </View>
              )}
            />

            {/* Aperçu flouté pour non-abonnés */}
            {!isSubscribed && filtered.length > 0 && (
              <BlurView intensity={22} tint="light" style={styles.blurOverlay}>
                <View style={styles.blurCard}>
                  <View style={styles.blurIcon}>
                    <Ionicons name="lock-closed" size={26} color={colors.onBrandPrimary} />
                  </View>
                  <Text style={styles.blurTitle}>{filtered.length} match{filtered.length > 1 ? "s" : ""} en attente de joueurs</Text>
                  <Text style={styles.blurSub}>Abonne-toi pour voir les annonces, rejoindre des matchs et contacter les joueurs</Text>
                  <Pressable testID="blur-premium-btn" onPress={() => router.push("/paywall")} style={styles.blurBtn}>
                    <Text style={styles.blurBtnText}>Abonne-toi · 9,90 €/an</Text>
                  </Pressable>
                </View>
              </BlurView>
            )}
          </View>

          <View style={styles.composer}>
            {isSubscribed ? (
              <>
                <View style={styles.partyRow}>
                  <Text style={styles.partyLabel}>Déjà réunis :</Text>
                  {[1, 2, 3].map((n) => (
                    <Pressable
                      key={n}
                      testID={`party-size-${n}`}
                      onPress={() => setPartySize(n)}
                      style={[styles.partyChip, partySize === n && styles.partyChipActive]}
                    >
                      <Text style={[styles.partyChipText, partySize === n && styles.partyChipTextActive]}>{n}/4</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  testID="ann-availability-input"
                  value={availability}
                  onChangeText={setAvailability}
                  placeholder="Disponibilités (ex: Sam 14h)"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={styles.availInput}
                />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <TextInput
                    testID="ann-content-input"
                    value={text}
                    onChangeText={setText}
                    placeholder="Je cherche un partenaire..."
                    placeholderTextColor={colors.onSurfaceTertiary}
                    style={styles.contentInput}
                    multiline
                  />
                  <Pressable
                    testID="ann-post-btn"
                    onPress={post}
                    disabled={posting || !text.trim()}
                    style={[styles.sendBtn, (!text.trim() || posting) && { opacity: 0.5 }]}
                  >
                    {posting ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="send" size={20} color={colors.onBrandPrimary} />}
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable testID="ann-premium-lock" onPress={() => router.push("/paywall")} style={styles.lockComposer}>
                <Ionicons name="lock-closed" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.lockText}>Abonne-toi pour poster une annonce</Text>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerLoader: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { height: 200 },
  heroContent: { flex: 1, justifyContent: "space-between", padding: spacing.lg },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center",
  },
  heroName: { fontSize: 28, fontWeight: "800", color: colors.onSurfaceInverse },
  heroCity: { color: colors.onSurfaceInverse, fontSize: type.base, opacity: 0.95 },
  segment: {
    flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.lg,
    padding: 4, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: "center" },
  segmentActive: { backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  segmentText: { color: colors.onSurfaceSecondary, fontWeight: "700" },
  segmentTextActive: { color: colors.onSurface },
  infoCard: {
    flexDirection: "row", gap: spacing.md, alignItems: "center",
    backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg,
  },
  infoLabel: { color: colors.onSurfaceTertiary, fontSize: type.sm, fontWeight: "700" },
  infoValue: { color: colors.onSurface, fontSize: type.lg, fontWeight: "700", marginTop: 2 },
  ann: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm,
  },
  annHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  annAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary },
  annAvatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSecondary },
  annName: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  annMeta: { fontSize: type.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  msgIcon: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  annContent: { fontSize: type.base, color: colors.onSurface, lineHeight: 20 },
  availPill: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.brandSecondary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
  },
  availTxt: { color: colors.onBrandSecondary, fontWeight: "700", fontSize: type.sm },
  filterRow: { height: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.divider },
  filterChip: {
    flexShrink: 0, height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  filterChipText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: type.base },
  filterChipTextActive: { color: colors.onSurfaceInverse },
  matchPanel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs },
  playersRow: { flexDirection: "row", alignItems: "center" },
  playerAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.surfaceSecondary },
  playerImg: { width: "100%", height: "100%", borderRadius: 17 },
  playerFallback: { backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  emptySlot: {
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center",
    borderStyle: "dashed", borderColor: colors.borderStrong,
  },
  offlineSlot: { backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  partyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  partyLabel: { fontSize: type.sm, color: colors.onSurfaceSecondary, fontWeight: "700" },
  partyChip: {
    height: 32, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  partyChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  partyChipText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: type.sm },
  partyChipTextActive: { color: colors.onBrandPrimary },
  confirmedBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.success, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  confirmedText: { color: colors.onSuccess, fontWeight: "800", fontSize: type.sm },
  slotsText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: type.base },
  joinBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderRadius: radius.pill, paddingVertical: 12, marginTop: spacing.xs, minHeight: 44,
  },
  joinActive: { backgroundColor: colors.brandPrimary },
  joinText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.base },
  leaveBtn: { borderWidth: 1.5, borderColor: colors.error },
  leaveText: { color: colors.error, fontWeight: "800", fontSize: type.base },
  fullBtn: { backgroundColor: colors.surfaceTertiary },
  fullText: { color: colors.onSurfaceTertiary, fontWeight: "800", fontSize: type.base },
  joinAuthor: { backgroundColor: colors.surfaceTertiary },
  joinAuthorText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: type.base },
  blurOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  blurCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: spacing.sm,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 8,
    maxWidth: 320,
  },
  blurIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  blurTitle: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  blurSub: { fontSize: type.base, color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
  blurBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 14, marginTop: spacing.sm },
  blurBtnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.base },
  composer: {
    padding: spacing.md, gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.md,
  },
  availInput: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: type.base, color: colors.onSurface,
  },
  contentInput: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: type.base, color: colors.onSurface,
    maxHeight: 100, minHeight: 44,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  lockComposer: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.brandPrimary,
  },
  lockText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.base },
});
