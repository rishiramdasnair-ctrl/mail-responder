import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";

const API_BASE = process.env.EXPO_PUBLIC_API_URL;
const API_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

function getApiBaseUrl(): string {
  if (API_BASE) {
    return API_BASE;
  }
  if (API_DOMAIN) {
    return `https://${API_DOMAIN}`;
  }
  if (__DEV__) {
    console.warn("[API] No EXPO_PUBLIC_API_URL set, using localhost");
    return "http://localhost:3000";
  }
  throw new Error(
    "EXPO_PUBLIC_API_URL or EXPO_PUBLIC_DOMAIN must be set in production",
  );
}

export const API_BASE_URL = getApiBaseUrl();

export function useApiClient() {
  const { getToken, signOut } = useAuth();

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    if (!token) {
      throw new Error(
        "Session unavailable. Please sign out and sign in again.",
      );
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, [getToken]);

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const headers = await authHeaders();
      const fullUrl = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
      const res = await fetch(fullUrl, {
        ...options,
        headers: {
          ...headers,
          ...((options.headers as Record<string, string>) ?? {}),
        },
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
    apiBaseUrl: API_BASE_URL,
    authHeaders,
    apiFetch,
    getToken: getTokenStable,
  };
}
