import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "replyai_session";
const EMAIL_KEY = "replyai_email";
const USER_ID_KEY = "replyai_user_id";

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
        setToken(t);
        setEmail(e);
        setUserId(u);
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
    await Promise.all([
      SecureStore.deleteItemAsync(SESSION_KEY),
      SecureStore.deleteItemAsync(EMAIL_KEY),
      SecureStore.deleteItemAsync(USER_ID_KEY),
      SecureStore.deleteItemAsync("onboarding_complete"),
      SecureStore.deleteItemAsync("gmail_connected"),
    ]);
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
