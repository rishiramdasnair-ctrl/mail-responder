import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "replyai_session";
const EMAIL_KEY = "replyai_email";
const USER_ID_KEY = "replyai_user_id";

const ONBOARDING_KEYS = [
  SESSION_KEY,
  EMAIL_KEY,
  USER_ID_KEY,
  "onboarding_complete",
  "gmail_connected",
];

const getApiBase = () =>
  process.env.EXPO_PUBLIC_API_URL ||
  (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "");

interface AuthContextValue {
  isSignedIn: boolean;
  isLoaded: boolean;
  userId: string | null;
  email: string | null;
  getToken: () => Promise<string | null>;
  signIn: (token: string, email: string, userId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [t, e, u] = await Promise.all([
          SecureStore.getItemAsync(SESSION_KEY),
          SecureStore.getItemAsync(EMAIL_KEY),
          SecureStore.getItemAsync(USER_ID_KEY),
        ]);

        if (t) {
          const isValid = await validateToken(t);
          if (!isValid) {
            await Promise.all(ONBOARDING_KEYS.map((k) => SecureStore.deleteItemAsync(k)));
            return;
          }
          setToken(t);
          setEmail(e);
          setUserId(u);
        }
      } catch {
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const signIn = useCallback(async (newToken: string, newEmail: string, newUserId: string) => {
    await Promise.all([
      SecureStore.setItemAsync(SESSION_KEY, newToken),
      SecureStore.setItemAsync(EMAIL_KEY, newEmail),
      SecureStore.setItemAsync(USER_ID_KEY, newUserId),
    ]);
    setToken(newToken);
    setEmail(newEmail);
    setUserId(newUserId);
  }, []);

  const signOut = useCallback(async () => {
    await Promise.all(ONBOARDING_KEYS.map((k) => SecureStore.deleteItemAsync(k)));
    setToken(null);
    setEmail(null);
    setUserId(null);
  }, []);

  const getToken = useCallback(async () => token, [token]);

  return (
    <AuthContext.Provider
      value={{ isSignedIn: !!token, isLoaded, userId, email, getToken, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}

async function validateToken(token: string): Promise<boolean> {
  try {
    const base = getApiBase();
    if (!base) return true;
    const res = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return false;
    return true;
  } catch {
    return true;
  }
}
