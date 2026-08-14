import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";
import { getToken, setToken, getStoredUser, setStoredUser } from "./storage";

export type User = {
  id: string;
  email: string;
  pseudo: string;
  avatar_url: string | null;
  level: string;
  reliability_avg: number;
  reliability_count: number;
  bio: string | null;
};

type Ctx = {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, pseudo: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  updateUser: (u: User) => void;
};

const AuthCtx = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getStoredUser();
      const token = await getToken();
      if (stored && token) {
        setUser(stored);
        // silently refresh
        try {
          const fresh = await api.me();
          setUser(fresh);
          await setStoredUser(fresh);
        } catch {
          await setToken(null);
          await setStoredUser(null);
          setUser(null);
        }
      }
      setReady(true);
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    await setToken(res.token);
    await setStoredUser(res.user);
    setUser(res.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string, pseudo: string) => {
    const res = await api.register(email, password, pseudo);
    await setToken(res.token);
    await setStoredUser(res.user);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    await setToken(null);
    await setStoredUser(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const fresh = await api.me();
    setUser(fresh);
    await setStoredUser(fresh);
  }, []);

  const updateUser = useCallback((u: User) => {
    setUser(u);
    setStoredUser(u);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, ready, signIn, signUp, signOut, refresh, updateUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
