import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api, fullUrl } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, type } from "@/src/lib/theme";

type Announcement = {
  id: string;
  club_id: string;
  content: string;
  availability: string | null;
  created_at: string;
  author: { id: string; pseudo: string; avatar_url: string | null; level: string; reliability_avg: number; reliability_count: number };
};

export default function ClubDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [club, setClub] = useState<any>(null);
  const [tab, setTab] = useState<"info" | "chat">("chat");
  const [items, setItems] = useState<Announcement[]>([]);
  const [text, setText] = useState("");
  const [availability, setAvailability] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

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
      const a = await api.postAnnouncement(id, text.trim(), availability.trim() || undefined);
      setItems([a, ...items]);
      setText("");
      setAvailability("");
    } catch (e: any) { console.log(e); }
    finally { setPosting(false); }
  };

  if (loading || !club) {
    return <View style={styles.centerLoader}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>;
  }

  const isMine = (uid: string) => user?.id === uid;

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
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingVertical: spacing.xxxl, gap: spacing.md }}>
                <Ionicons name="megaphone-outline" size={56} color={colors.onSurfaceTertiary} />
                <Text style={{ color: colors.onSurfaceSecondary, fontSize: type.base, textAlign: "center" }}>
                  Sois le premier à poster une annonce !
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
                    <Text style={styles.annName}>{item.author.pseudo}</Text>
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
              </View>
            )}
          />

          <View style={styles.composer}>
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
});
