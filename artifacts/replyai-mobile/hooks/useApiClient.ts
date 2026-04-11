import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";

export const API_BASE = (() => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (url) return url;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  if (__DEV__) return "";
  throw new Error("EXPO_PUBLIC_API_URL is required in production");
})();

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function useApiClient() {
  const { getToken, signOut } = useAuth();

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    let token = await getToken();
    if (!token) {
      await sleep(600);
      token = await getToken();
    }
    if (!token) {
      throw new Error("Session unavailable. Please sign out and sign in again.");
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, [getToken]);

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const headers = await authHeaders();
      const res = await fetch(url, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string> ?? {}) },
      });
      if (res.status === 401) {
        await signOut();
        throw new Error("Session expired. Please sign in again.");
      }
      return res;
    },
    [authHeaders, signOut],
  );

  const getTokenStable = useCallback(async () => getToken(), [getToken]);

  return {
    apiBaseUrl: API_BASE,
    authHeaders,
    apiFetch,
    getToken: getTokenStable,
  };
}
