import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-expo";

const API_BASE = (() => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (url) return url;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  if (__DEV__) return "";
  throw new Error("EXPO_PUBLIC_API_URL is required in production");
})();

export function useApiClient() {
  const { getToken } = useAuth();

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getToken]);

  const getTokenStable = useCallback(async () => getToken(), [getToken]);

  return {
    apiBaseUrl: API_BASE,
    authHeaders,
    getToken: getTokenStable,
  };
}
