import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, fullUrl } from "@/src/lib/api";
import { colors, spacing, radius, type } from "@/src/lib/theme";
import { VerifiedTick } from "@/src/components/VerifiedBadge";

type Conv = {
  other_user: { id: string; pseudo: string; avatar_url: string | null; level: string; verified?: boolean };
  last_message: string;
  last_at: string;
  unread: number;
};

function fmt(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export default function MessagesScreen() {
  const router = useRouter();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await api.conversations();
      setConvs(c);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : convs.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={64} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>Aucune conversation</Text>
          <Text style={styles.emptySub}>Trouve un club et connecte-toi avec d'autres joueurs</Text>
          <Pressable style={styles.cta} onPress={() => router.push("/(tabs)")}>
            <Text style={styles.ctaText}>Explorer les clubs</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={convs}
          keyExtractor={(item) => item.other_user.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`conv-${item.other_user.id}`}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              onPress={() => router.push(`/chat/${item.other_user.id}`)}
            >
              {item.other_user.avatar_url ? (
                <Image source={{ uri: fullUrl(item.other_user.avatar_url)! }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{item.other_user.pseudo[0]?.toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.rowTop}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
                    <Text style={[styles.name, item.unread > 0 && { fontWeight: "800" }]} numberOfLines={1}>{item.other_user.pseudo}</Text>
                    {item.other_user.verified && <VerifiedTick size={13} />}
                  </View>
                  <Text style={styles.time}>{fmt(item.last_at)}</Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={[styles.snippet, item.unread > 0 && styles.snippetUnread]} numberOfLines={1}>{item.last_message}</Text>
                  {item.unread > 0 && <View style={styles.unreadDot}><Text style={styles.unreadTxt}>{item.unread}</Text></View>}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: type.lg, color: colors.onSurface, fontWeight: "700" },
  emptySub: { fontSize: type.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  cta: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: 12, marginTop: spacing.sm },
  ctaText: { color: colors.onBrandPrimary, fontWeight: "800" },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    backgroundColor: colors.infoMuted, borderRadius: radius.lg,
    minHeight: 72,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSecondary },
  avatarLetter: { fontSize: 22, fontWeight: "800", color: colors.brandPrimary },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  name: { color: colors.onSurface, fontSize: type.lg, fontWeight: "700", flex: 1 },
  time: { color: colors.onSurfaceTertiary, fontSize: type.sm, marginLeft: spacing.sm },
  snippet: { color: colors.onSurfaceSecondary, fontSize: type.base, flex: 1 },
  snippetUnread: { color: colors.onSurface, fontWeight: "700" },
  unreadDot: {
    minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brandPrimary,
    paddingHorizontal: 6, alignItems: "center", justifyContent: "center", marginLeft: spacing.sm,
  },
  unreadTxt: { color: colors.onBrandPrimary, fontSize: type.sm, fontWeight: "800" },
});
