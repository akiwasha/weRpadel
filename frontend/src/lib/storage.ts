import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "padelconnect_token";
const USER_KEY = "padelconnect_user";

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(KEY);
  return SecureStore.getItemAsync(KEY);
}
export async function setToken(v: string | null) {
  if (Platform.OS === "web") {
    if (v) await AsyncStorage.setItem(KEY, v);
    else await AsyncStorage.removeItem(KEY);
    return;
  }
  if (v) await SecureStore.setItemAsync(KEY, v);
  else await SecureStore.deleteItemAsync(KEY);
}
export async function getStoredUser(): Promise<any | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}
export async function setStoredUser(u: any | null) {
  if (u) await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
  else await AsyncStorage.removeItem(USER_KEY);
}
