import { useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, type } from "@/src/lib/theme";

type Club = {
  id: string;
  name: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  announcements_count: number;
};

const FRANCE_REGION = { latitude: 46.6, longitude: 2.5, latitudeDelta: 9, longitudeDelta: 9 };

export default function ClubsMap({ clubs, onSelect }: { clubs: Club[]; onSelect: (id: string) => void }) {
  const mapRef = useRef<MapView>(null);
  const [permState, setPermState] = useState<"idle" | "granted" | "denied" | "blocked">("idle");
  const [locating, setLocating] = useState(false);

  const withCoords = clubs.filter((c) => c.latitude != null && c.longitude != null);

  const askLocation = async () => {
    setLocating(true);
    try {
      const current = await Location.getForegroundPermissionsAsync();
      let status = current.status;
      let canAskAgain = current.canAskAgain;
      if (status !== "granted") {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
        canAskAgain = req.canAskAgain;
      }
      if (status === "granted") {
        setPermState("granted");
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        mapRef.current?.animateToRegion({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        }, 800);
      } else {
        setPermState(canAskAgain ? "denied" : "blocked");
      }
    } catch {
      setPermState("denied");
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        testID="clubs-map"
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFillObject}
        initialRegion={FRANCE_REGION}
        showsUserLocation={permState === "granted"}
      >
        {withCoords.map((c) => (
          <Marker
            key={c.id}
            testID={`map-marker-${c.id}`}
            coordinate={{ latitude: c.latitude!, longitude: c.longitude! }}
            title={c.name}
            description={`${c.city}${c.announcements_count > 0 ? ` · ${c.announcements_count} annonce(s)` : ""}`}
            onCalloutPress={() => onSelect(c.id)}
            pinColor={colors.brandPrimary}
          />
        ))}
      </MapView>

      <Pressable
        testID="locate-me-btn"
        onPress={askLocation}
        style={styles.locateBtn}
      >
        {locating ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : (
          <Ionicons name="locate" size={22} color={colors.brandPrimary} />
        )}
      </Pressable>

      {(permState === "denied" || permState === "blocked") && (
        <View style={styles.permBanner}>
          <Ionicons name="location-outline" size={18} color={colors.onSurface} />
          <Text style={styles.permText}>
            {permState === "blocked"
              ? "Localisation bloquée. Active-la dans les réglages pour te centrer sur les clubs proches."
              : "Autorise la localisation pour voir les clubs autour de toi."}
          </Text>
          {permState === "blocked" ? (
            <Pressable testID="open-settings-btn" onPress={() => Linking.openSettings()} style={styles.permAction}>
              <Text style={styles.permActionText}>Réglages</Text>
            </Pressable>
          ) : (
            <Pressable testID="retry-location-btn" onPress={askLocation} style={styles.permAction}>
              <Text style={styles.permActionText}>Autoriser</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.hint} pointerEvents="none">
        <Text style={styles.hintText}>Touche un repère puis l&apos;info-bulle pour ouvrir le club</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  locateBtn: {
    position: "absolute", right: spacing.lg, bottom: 90,
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  permBanner: {
    position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  permText: { flex: 1, fontSize: type.sm, color: colors.onSurface },
  permAction: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  permActionText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.sm },
  hint: {
    position: "absolute", top: spacing.md, alignSelf: "center",
    backgroundColor: "rgba(26,29,31,0.8)", borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  hintText: { color: colors.onSurfaceInverse, fontSize: type.sm },
});
