import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { api, storeUser, clearUser, getMe, type StoredUser } from "../api.js";

interface AuthContextValue {
  user: StoredUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (handle: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(() => getMe());

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.login(email, password);
    storeUser(u);
    setUser(u);
  }, []);

  const register = useCallback(async (handle: string, email: string, password: string) => {
    const u = await api.register(handle, email, password);
    storeUser(u);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearUser();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
