import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { colors, spacing, radius, type } from "@/src/lib/theme";

type Club = { id: string; name: string; city: string; region: string; price_per_hour: number | null };

export default function AdminClubs() {
  const router = useRouter();
  const { user } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await api.listClubs();
      setClubs(c);
      const map: Record<string, string> = {};
      c.forEach((x: Club) => { map[x.id] = x.price_per_hour != null ? String(x.price_per_hour) : ""; });
      setPrices(map);
    } catch (e) { console.log(e); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async (club: Club) => {
    const raw = (prices[club.id] || "").replace(",", ".").trim();
    const val = raw === "" ? null : Number(raw);
    if (val != null && (isNaN(val) || val < 0 || val > 200)) return;
    setSavingId(club.id);
    try {
      const updated = await api.adminSetClubPrice(club.id, val);
      setClubs((prev) => prev.map((x) => (x.id === club.id ? { ...x, price_per_hour: updated.price_per_hour } : x)));
    } catch (e) { console.log(e); }
    finally { setSavingId(null); }
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="admin-back"><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
          <Text style={styles.title}>Admin</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.center}><Text style={styles.denied}>Accès réservé aux administrateurs.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="admin-back"><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Tarifs des clubs</Text>
        <View style={{ width: 26 }} />
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : (
        <FlatList
          data={clubs}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`admin-club-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.city}>{item.city} · {item.region}</Text>
              </View>
              <View style={styles.priceWrap}>
                <TextInput
                  testID={`admin-price-input-${item.id}`}
                  value={prices[item.id] ?? ""}
                  onChangeText={(t) => setPrices((p) => ({ ...p, [item.id]: t }))}
                  placeholder="€/h"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <Pressable testID={`admin-save-${item.id}`} onPress={() => save(item)} style={styles.saveBtn} disabled={savingId === item.id}>
                  {savingId === item.id ? <ActivityIndicator color={colors.onBrandPrimary} size="small" /> : <Ionicons name="checkmark" size={18} color={colors.onBrandPrimary} />}
                </Pressable>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: type.xl, fontWeight: "800", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  denied: { color: colors.onSurfaceSecondary, fontSize: type.base },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: type.base, fontWeight: "800", color: colors.onSurface },
  city: { fontSize: type.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  priceWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: { width: 72, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 8, fontSize: type.base, color: colors.onSurface, textAlign: "center", borderWidth: 1, borderColor: colors.border },
  saveBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
});
