import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, type } from "@/src/lib/theme";

export function VerifiedTick({ size = 16 }: { size?: number }) {
  return (
    <View testID="verified-tick" style={[styles.tick, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }]}>
      <Ionicons name="checkmark" size={size - 2} color={colors.onSuccess} />
    </View>
  );
}

export function VerifiedPill() {
  return (
    <View testID="verified-pill" style={styles.pill}>
      <Ionicons name="shield-checkmark" size={14} color={colors.onSuccess} />
      <Text style={styles.pillText}>Joueur vérifié</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tick: {
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  pillText: { color: colors.onSuccess, fontWeight: "800", fontSize: type.sm },
});
