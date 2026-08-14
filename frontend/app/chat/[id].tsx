import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, fullUrl } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, type } from "@/src/lib/theme";
import { VerifiedTick } from "@/src/components/VerifiedBadge";

type Msg = { id: string; from_user_id: string; to_user_id: string; content: string; created_at: string };

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  const [other, setOther] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [u, m] = await Promise.all([api.getUser(id), api.conversation(id)]);
      setOther(u);
      setMsgs(m);
    } catch (e) { console.log(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Poll for new messages every 5s
  useEffect(() => {
    if (!id) return;
    const t = setInterval(async () => {
      try {
        const m = await api.conversation(id);
        setMsgs(m);
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [id]);

  const send = async () => {
    if (!text.trim() || !id) return;
    setSending(true);
    const content = text.trim();
    setText("");
    try {
      const m = await api.sendMessage(id, content);
      setMsgs((prev) => [...prev, m]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e) { console.log(e); setText(content); }
    finally { setSending(false); }
  };

  if (loading || !other) {
    return <View style={styles.centerLoader}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="chat-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Pressable onPress={() => router.push(`/player/${other.id}`)} style={styles.headTitle}>
          {other.avatar_url ? (
            <Image source={{ uri: fullUrl(other.avatar_url)! }} style={styles.headAvatar} contentFit="cover" />
          ) : (
            <View style={[styles.headAvatar, styles.headAvatarFallback]}>
              <Text style={{ color: colors.brandPrimary, fontWeight: "800" }}>{other.pseudo[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={styles.headName}>{other.pseudo}</Text>
              {other.verified && <VerifiedTick size={14} />}
            </View>
            <Text style={styles.headSub}>{other.level} · ⭐ {other.reliability_avg.toFixed(1)}</Text>
          </View>
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: spacing.xxxl }}>
              <Ionicons name="chatbubbles-outline" size={56} color={colors.onSurfaceTertiary} />
              <Text style={{ color: colors.onSurfaceSecondary, marginTop: spacing.md }}>Envoie ton premier message !</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.from_user_id === user?.id;
            return (
              <View style={[styles.bubbleWrap, { alignItems: mine ? "flex-end" : "flex-start" }]}>
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={[styles.bubbleText, mine && { color: colors.onBrandPrimary }]}>{item.content}</Text>
                </View>
                <Text style={styles.bubbleTime}>
                  {new Date(item.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            );
          }}
        />

        {isSubscribed ? (
          <View style={styles.composer}>
            <TextInput
              testID="chat-input"
              value={text}
              onChangeText={setText}
              placeholder="Écris un message..."
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
              multiline
            />
            <Pressable
              testID="chat-send-btn"
              onPress={send}
              disabled={sending || !text.trim()}
              style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
            >
              {sending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="send" size={20} color={colors.onBrandPrimary} />}
            </Pressable>
          </View>
        ) : (
          <Pressable testID="chat-premium-lock" onPress={() => router.push("/paywall")} style={styles.lockComposer}>
            <Ionicons name="lock-closed" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.lockText}>Abonne-toi pour envoyer des messages</Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.appBg },
  centerLoader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.appBg },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  headAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary },
  headAvatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandSecondary },
  headName: { fontSize: type.lg, fontWeight: "800", color: colors.onSurface },
  headSub: { fontSize: type.sm, color: colors.onSurfaceTertiary },
  bubbleWrap: { gap: 2 },
  bubble: { maxWidth: "80%", paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: radius.lg },
  mine: { backgroundColor: colors.brandPrimary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: type.base, color: colors.onSurface, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: colors.onSurfaceTertiary },
  composer: {
    flexDirection: "row", gap: spacing.sm, padding: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
    alignItems: "flex-end",
  },
  input: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    paddingHorizontal: spacing.lg, paddingVertical: 10, fontSize: type.base, color: colors.onSurface,
    maxHeight: 100, minHeight: 44,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  lockComposer: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    margin: spacing.md, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.brandPrimary,
  },
  lockText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: type.base },
});
