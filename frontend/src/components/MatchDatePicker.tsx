import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, type } from "@/src/lib/theme";

const DAY_LABELS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const HOURS = [8, 9, 10, 12, 14, 16, 18, 19, 20, 21];
const DURATIONS = [
  { label: "1h", mins: 60 },
  { label: "1h30", mins: 90 },
  { label: "2h", mins: 120 },
];
const DEFAULT_DURATION = 90;

function dayLabel(d: Date, i: number) {
  if (i === 0) return "Auj";
  if (i === 1) return "Dem";
  return `${DAY_LABELS[d.getDay()]} ${d.getDate()}`;
}

function hourLabel(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${h}h${m ? String(m).padStart(2, "0") : ""}`;
}

export default function MatchDatePicker({
  value,
  onChange,
  testIDPrefix = "date",
}: {
  value: string | null;
  onChange: (startIso: string | null, endIso: string | null) => void;
  testIDPrefix?: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const parsed = value ? new Date(value) : null;
  const [dayIdx, setDayIdx] = useState<number | null>(
    parsed ? days.findIndex((d) => d.toDateString() === parsed.toDateString()) : null
  );
  const [hour, setHour] = useState<number | null>(parsed ? parsed.getHours() : null);
  const [duration, setDuration] = useState<number>(DEFAULT_DURATION);

  const commit = (di: number | null, h: number | null, dur: number) => {
    if (di == null || h == null) {
      onChange(null, null);
      return;
    }
    const start = new Date(days[di]);
    start.setHours(h, 0, 0, 0);
    const end = new Date(start.getTime() + dur * 60000);
    onChange(start.toISOString(), end.toISOString());
  };

  const endLabel = hour != null ? `${hour}h → ${hourLabel(hour * 60 + duration)}` : null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.label}>Date du match</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {days.map((d, i) => (
          <Pressable
            key={i}
            testID={`${testIDPrefix}-day-${i}`}
            onPress={() => { setDayIdx(i); commit(i, hour, duration); }}
            style={[styles.chip, dayIdx === i && styles.chipActive]}
          >
            <Text style={[styles.chipText, dayIdx === i && styles.chipTextActive]}>{dayLabel(d, i)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.label}>Heure de début</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {HOURS.map((h) => (
          <Pressable
            key={h}
            testID={`${testIDPrefix}-hour-${h}`}
            onPress={() => { setHour(h); commit(dayIdx, h, duration); }}
            style={[styles.chip, hour === h && styles.chipActive]}
          >
            <Text style={[styles.chipText, hour === h && styles.chipTextActive]}>{h}h</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.label}>Durée</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {DURATIONS.map((dur) => (
          <Pressable
            key={dur.mins}
            testID={`${testIDPrefix}-dur-${dur.mins}`}
            onPress={() => { setDuration(dur.mins); commit(dayIdx, hour, dur.mins); }}
            style={[styles.chip, duration === dur.mins && styles.chipActive]}
          >
            <Text style={[styles.chipText, duration === dur.mins && styles.chipTextActive]}>{dur.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {endLabel && (
        <View style={styles.endRow} testID={`${testIDPrefix}-endinfo`}>
          <Ionicons name="time-outline" size={15} color={colors.brandPrimary} />
          <Text style={styles.endText}>Créneau : {endLabel}</Text>
        </View>
      )}
    </View>
  );
}

export function formatMatchDate(iso?: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" }) +
      ` · ${d.getHours()}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""}`;
  } catch {
    return null;
  }
}

function hm(iso: string) {
  const d = new Date(iso);
  return `${d.getHours()}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""}`;
}

export function formatMatchRange(startIso?: string | null, endIso?: string | null) {
  const start = formatMatchDate(startIso);
  if (!start) return null;
  if (!endIso) return start;
  try {
    return `${start} → ${hm(endIso)}`;
  } catch {
    return start;
  }
}

const styles = StyleSheet.create({
  label: { fontSize: type.sm, color: colors.onSurfaceSecondary, fontWeight: "700" },
  row: { gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: type.sm },
  chipTextActive: { color: colors.onBrandPrimary },
  endRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  endText: { fontSize: type.sm, color: colors.brandPrimary, fontWeight: "700" },
});
