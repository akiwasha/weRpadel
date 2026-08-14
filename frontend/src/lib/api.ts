import { getToken } from "./storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as any) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.detail || data?.message || `Erreur ${res.status}`;
    throw new ApiError(typeof msg === "string" ? msg : JSON.stringify(msg), res.status);
  }
  return data as T;
}

export const api = {
  register: (email: string, password: string, pseudo: string) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ email, password, pseudo }) }, false),
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }, false),
  me: () => request("/auth/me"),
  updateMe: (body: any) => request("/auth/me", { method: "PUT", body: JSON.stringify(body) }),
  getUser: (id: string) => request(`/users/${id}`),
  rateUser: (id: string, stars: number) => request(`/users/${id}/rate`, { method: "POST", body: JSON.stringify({ stars }) }),
  listClubs: (search?: string, region?: string) => {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (region) q.set("region", region);
    const qs = q.toString();
    return request(`/clubs${qs ? "?" + qs : ""}`);
  },
  regions: () => request("/clubs/regions"),
  getClub: (id: string) => request(`/clubs/${id}`),
  createClub: (body: any) => request("/clubs", { method: "POST", body: JSON.stringify(body) }),
  announcements: (clubId: string) => request(`/clubs/${clubId}/announcements`),
  postAnnouncement: (clubId: string, content: string, availability?: string, offlineNames?: string[]) =>
    request(`/clubs/${clubId}/announcements`, { method: "POST", body: JSON.stringify({ content, availability, offline_names: offlineNames ?? [] }) }),
  matchHistory: () => request("/matches/history"),
  joinAnnouncement: (annId: string) => request(`/announcements/${annId}/join`, { method: "POST" }),
  leaveAnnouncement: (annId: string) => request(`/announcements/${annId}/leave`, { method: "POST" }),
  conversations: () => request("/messages/conversations"),
  unreadCount: () => request("/messages/unread_count"),
  conversation: (otherId: string) => request(`/messages/${otherId}`),
  sendMessage: (toId: string, content: string) =>
    request("/messages", { method: "POST", body: JSON.stringify({ to_user_id: toId, content }) }),
  uploadAvatar: async (uri: string) => {
    const token = await getToken();
    const form = new FormData();
    const name = `avatar-${Date.now()}.jpg`;
    // React Native native shape
    // @ts-ignore
    form.append("file", { uri, name, type: "image/jpeg" });
    const res = await fetch(`${BASE}/api/upload/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form as any,
    });
    if (!res.ok) throw new ApiError("Upload échoué", res.status);
    return res.json();
  },
};

export const fullUrl = (path?: string | null) => (path ? `${BASE}${path}` : null);
