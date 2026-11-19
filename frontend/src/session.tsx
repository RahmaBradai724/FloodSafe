import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, getStoredUser, getToken, storeSession, type User } from "./api";

interface Session {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [ready, setReady] = useState(false);

  // A stored token may have expired: check it once at start-up
  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then((u) => {
        setUser(u);
        storeSession(getToken(), u);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          storeSession(null, null);
          setUser(null);
        }
      })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    storeSession(r.token, r.user);
    setUser(r.user);
    return r.user;
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const r = await api.register(email, password);
    storeSession(r.token, r.user);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      storeSession(null, null);
      setUser(null);
    }
  }, []);

  return <SessionContext.Provider value={{ user, ready, login, register, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
