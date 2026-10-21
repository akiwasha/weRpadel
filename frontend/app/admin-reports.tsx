import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { colors, spacing, radius, type } from "@/src/lib/theme";

type Report = {
  id: string; reason: string; reason_label: string; details: string | null; status: string;
  context_type: string | null; context_text: string | null; created_at: string;
  reporter: { id: string; pseudo: string } | null;
  reported: { id: string; pseudo: string; email: string; warnings: number; suspended: boolean } | null;
};

const FILTERS = [
  { key: "open", label: "À traiter" },
  { key: "resolved", label: "Traités" },
  { key: "dismissed", label: "Ignorés" },
  { key: "", label: "Tous" },
];

export default function AdminReports() {
  const router = useRouter();
  const [filter, setFilter] = useState("open");
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.adminReports(filter || undefined)); }
    catch (e: any) { Alert.alert("Erreur", e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const patch = (r: Report) => (updated: Partial<Report>) =>
    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...updated } : x)));

  const setStatus = async (r: Report, status: string) => {
    try {
      const u = await api.adminSetReportStatus(r.id, status);
      if (filter && u.status !== filter) setItems((prev) => prev.filter((x) => x.id !== r.id));
      else patch(r)(u);
    }
    catch (e: any) { Alert.alert("Erreur", e.message); }
  };

  const toggleSuspend = (r: Report) => {
    if (!r.reported) return;
    const { id, pseudo, suspended } = r.reported;
    Alert.alert(
      suspended ? `Réactiver ${pseudo} ?` : `Suspendre ${pseudo} ?`,
      suspended ? "Le compte pourra à nouveau se connecter ; ses avertissements sont remis à zéro." : "Le compte ne pourra plus se connecter jusqu'à réactivation.",
      [
        { text: "Annuler", style: "cancel" },
        { text: suspended ? "Réactiver" : "Suspendre", style: suspended ? "default" : "destructive", onPress: async () => {
          try {
            if (suspended) await api.adminUnsuspendUser(id); else await api.adminSuspendUser(id);
            setItems((prev) => prev.map((x) => x.reported?.id === id ? { ...x, reported: { ...x.reported!, suspended: !suspended, warnings: suspended ? 0 : x.reported!.warnings } } : x));
          } catch (e: any) { Alert.alert("Erreur", e.message); }
        } },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="admin-reports-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Modération</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable key={f.key} testID={`reports-filter-${f.key || "all"}`} onPress={() => setFilter(f.key)} style={[styles.chip, filter === f.key && styles.chipActive]}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="shield-checkmark-outline" size={64} color={colors.success} />
          <Text style={styles.emptyTitle}>Rien à signaler</Text>
          <Text style={styles.emptySub}>Aucun signalement dans cette catégorie.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`report-${item.id}`}>
              <View style={styles.cardHead}>
                <View style={[styles.badge, item.status === "open" ? styles.badgeOpen : styles.badgeDone]}>
                  <Text style={styles.badgeText}>{item.reason_label}</Text>
                </View>
                <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</Text>
              </View>

              <Pressable onPress={() => item.reported && router.push(`/player/${item.reported.id}`)} style={styles.userRow}>
                <Ionicons name="person-circle-outline" size={22} color={colors.onSurfaceSecondary} />
                <Text style={styles.userText}>
                  <Text style={{ fontWeight: "800" }}>{item.reported?.pseudo ?? "Compte supprimé"}</Text>
                  {item.reported ? ` · ${item.reported.email}` : ""}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
              </Pressable>
              {item.reported && (
                <View style={styles.metaRow}>
                  <Text style={[styles.meta, item.reported.warnings > 0 && { color: colors.warning }]}>⚠️ {item.reported.warnings}/3 avertissements</Text>
                  {item.reported.suspended && <Text style={[styles.meta, { color: colors.error, fontWeight: "800" }]}>SUSPENDU</Text>}
                </View>
              )}
              <Text style={styles.meta}>Signalé par {item.reporter?.pseudo ?? "—"} · contexte : {item.context_type ?? "profil"}</Text>
              {item.context_text && (
                <View style={styles.quote}><Text style={styles.quoteText}>« {item.context_text} »</Text></View>
              )}
              {item.details && <Text style={styles.details}>{item.details}</Text>}

              <View style={styles.actions}>
                {item.reported && (
                  <Pressable testID={`suspend-${item.id}`} onPress={() => toggleSuspend(item)} style={[styles.actionBtn, item.reported.suspended ? styles.actionOk : styles.actionDanger]}>
                    <Ionicons name={item.reported.suspended ? "lock-open-outline" : "lock-closed-outline"} size={16} color={colors.onBrandPrimary} />
                    <Text style={styles.actionText}>{item.reported.suspended ? "Réactiver" : "Suspendre"}</Text>
                  </Pressable>
                )}
                {item.status === "open" ? (
                  <>
                    <Pressable testID={`resolve-${item.id}`} onPress={() => setStatus(item, "resolved")} style={[styles.actionBtn, styles.actionOk]}>
                      <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} />
                      <Text style={styles.actionText}>Traité</Text>
                    </Pressable>
                    <Pressable testID={`dismiss-${item.id}`} onPress={() => setStatus(item, "dismissed")} style={[styles.actionBtn, styles.actionNeutral]}>
                      <Text style={[styles.actionText, { color: colors.onSurface }]}>Ignorer</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable testID={`reopen-${item.id}`} onPress={() => setStatus(item, "open")} style={[styles.actionBtn, styles.actionNeutral]}>
                    <Text style={[styles.actionText, { color: colors.onSurface }]}>Rouvrir</Text>
                  </Pressable>
                )}
              </View>
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
  filters: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, minHeight: 36, justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: type.sm },
  chipTextActive: { color: colors.onBrandPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: type.xl, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  emptySub: { fontSize: type.base, color: colors.onSurfaceSecondary, textAlign: "center" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  badge: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  badgeOpen: { backgroundColor: colors.error },
  badgeDone: { backgroundColor: colors.onSurfaceTertiary },
  badgeText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.sm },
  date: { color: colors.onSurfaceTertiary, fontSize: type.sm },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  userText: { flex: 1, color: colors.onSurface, fontSize: type.base },
  metaRow: { flexDirection: "row", gap: spacing.md },
  meta: { color: colors.onSurfaceSecondary, fontSize: type.sm },
  quote: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.error },
  quoteText: { color: colors.onSurface, fontStyle: "italic", lineHeight: 20 },
  details: { color: colors.onSurface, fontSize: type.base, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, minHeight: 40 },
  actionDanger: { backgroundColor: colors.error },
  actionOk: { backgroundColor: colors.success },
  actionNeutral: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.sm },
});
