import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, fullUrl } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, type } from "@/src/lib/theme";

type Blocked = { id: string; pseudo: string; avatar_url: string | null; level: string };

export default function BlockedUsers() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [items, setItems] = useState<Blocked[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setItems(await api.blockedUsers()); }
    catch (e) { console.log(e); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unblock = (u: Blocked) => {
    Alert.alert(`Débloquer ${u.pseudo} ?`, "Il pourra à nouveau t'écrire et voir tes annonces.", [
      { text: "Annuler", style: "cancel" },
      { text: "Débloquer", onPress: async () => {
        try {
          await api.unblockUser(u.id);
          setItems((prev) => prev.filter((x) => x.id !== u.id));
          refresh().catch(() => {});
        } catch (e: any) { Alert.alert("Erreur", e.message); }
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="blocked-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Joueurs bloqués</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="shield-checkmark-outline" size={64} color={colors.brandPrimary} />
          <Text style={styles.emptyTitle}>Aucun joueur bloqué</Text>
          <Text style={styles.emptySub}>Depuis le profil d'un joueur ou une conversation, touche ⋮ puis « Bloquer » pour ne plus le voir.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`blocked-${item.id}`}>
              <Pressable onPress={() => router.push(`/player/${item.id}`)} style={styles.rowMain}>
                {item.avatar_url ? (
                  <Image source={{ uri: fullUrl(item.avatar_url)! }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.fallback]}>
                    <Text style={styles.letter}>{item.pseudo[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.pseudo}>{item.pseudo}</Text>
                  <Text style={styles.sub}>{item.level}</Text>
                </View>
              </Pressable>
              <Pressable testID={`unblock-${item.id}`} onPress={() => unblock(item)} style={styles.unblockBtn}>
                <Text style={styles.unblockText}>Débloquer</Text>
              </Pressable>
            </View>
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
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: type.xl, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  emptySub: { fontSize: type.base, color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md,
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceTertiary },
  fallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSecondary },
  letter: { fontSize: 20, fontWeight: "800", color: colors.brandPrimary },
  pseudo: { fontSize: type.base, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: type.sm, color: colors.onSurfaceTertiary },
  unblockBtn: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.brandPrimary, minHeight: 40, justifyContent: "center" },
  unblockText: { color: colors.brandPrimary, fontWeight: "800", fontSize: type.sm },
});
