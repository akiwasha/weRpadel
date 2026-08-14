import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, type } from "@/src/lib/theme";

type Club = {
  id: string;
  name: string;
  city: string;
  region?: string;
  latitude?: number | null;
  longitude?: number | null;
  announcements_count: number;
};

// Web fallback: react-native-maps is native-only. Show a location-style list.
export default function ClubsMap({ clubs, onSelect }: { clubs: Club[]; onSelect: (id: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.banner}>
        <Ionicons name="information-circle" size={18} color={colors.onBrandSecondary} />
        <Text style={styles.bannerText}>La carte interactive s'affiche sur l'app mobile (Expo Go)</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {clubs.map((c) => (
          <Pressable key={c.id} testID={`map-list-${c.id}`} onPress={() => onSelect(c.id)} style={styles.row}>
            <View style={styles.pin}>
              <Ionicons name="location" size={20} color={colors.onBrandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.city}>{c.city}{c.region ? ` · ${c.region}` : ""}</Text>
            </View>
            {c.announcements_count > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{c.announcements_count}</Text></View>
            )}
            <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.brandSecondary, marginHorizontal: spacing.lg, marginTop: spacing.sm,
    borderRadius: radius.md, padding: spacing.md,
  },
  bannerText: { flex: 1, color: colors.onBrandSecondary, fontSize: type.sm, fontWeight: "700" },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md,
  },
  pin: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  city: { fontSize: type.base, color: colors.onSurfaceSecondary, marginTop: 2 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.sm },
});
