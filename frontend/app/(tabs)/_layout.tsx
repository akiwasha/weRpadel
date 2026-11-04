import { useEffect, useState, useCallback } from "react";
import { Tabs, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppState } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/lib/theme";
import { api } from "@/src/lib/api";

export default function TabsLayout() {
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const refresh = useCallback(async () => {
    try {
      const r = await api.unreadCount();
      setUnread(r.count || 0);
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh, pathname]);

  useEffect(() => {
    const t = setInterval(refresh, 8000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") refresh(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [refresh]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          // Leave room for the iPhone home indicator below the labels.
          height: 56 + Math.max(insets.bottom, 8),
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Clubs",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "tennisball" : "tennisball-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Rechercher",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "search" : "search-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarBadge: unread > 0 ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.brandPrimary, color: colors.onBrandPrimary, fontSize: 11, fontWeight: "800" },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
