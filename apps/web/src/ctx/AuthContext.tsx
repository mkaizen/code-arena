import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { api, storeUser, clearUser, getMe, type StoredUser } from "../api.js";

interface AuthContextValue {
  user: StoredUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (handle: string, email: string, password: string, ref?: string) => Promise<void>;
  loginWithOAuth: (provider: "github" | "google", code: string) => Promise<void>;
  /** Mint (once) a throwaway guest session so a logged-out visitor can play. */
  ensureGuest: () => Promise<StoredUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(() => getMe());

  // Tokens expire (7d server-side). Renew on boot so active users slide
  // forward; if the stored token is expired/revoked, drop the session.
  useEffect(() => {
    if (!getMe()) return;
    api.refresh()
      .then((u) => { storeUser(u); setUser(u); })
      .catch(() => { clearUser(); setUser(null); });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.login(email, password);
    storeUser(u);
    setUser(u);
  }, []);

  const register = useCallback(async (handle: string, email: string, password: string, ref?: string) => {
    const u = await api.register(handle, email, password, ref);
    storeUser(u);
    setUser(u);
  }, []);

  const loginWithOAuth = useCallback(async (provider: "github" | "google", code: string) => {
    const u = await api.oauth(provider, code);
    storeUser(u);
    setUser(u);
  }, []);

  const ensureGuest = useCallback(async (): Promise<StoredUser> => {
    const existing = getMe();
    if (existing) return existing;
    const u = await api.guestSession();
    storeUser(u);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    clearUser();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, loginWithOAuth, ensureGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
