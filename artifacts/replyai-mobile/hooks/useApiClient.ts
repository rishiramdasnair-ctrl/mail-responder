import { useAuth } from "@clerk/clerk-expo";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

export function useApiClient() {
  const { getToken } = useAuth();

  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  return {
    apiBaseUrl: API_BASE,
    authHeaders,
    getToken: async () => getToken(),
  };
}
