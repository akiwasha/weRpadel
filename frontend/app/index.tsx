import { Redirect } from "expo-router";
import { useAuth } from "@/src/lib/auth";

export default function Index() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return <Redirect href={user ? "/(tabs)" : "/(auth)/sign-in"} />;
}
