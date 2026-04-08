import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient";

export interface GmailCategory {
  category: string;
  enabled: boolean;
}

const STALE_MS = 5 * 60_000;

export function useGmailCategories() {
  const { apiBaseUrl, authHeaders } = useApiClient();

  const { data, isLoading } = useQuery<{ categories: GmailCategory[] }>({
    queryKey: ["gmail-categories"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/gmail/categories`, { headers });
      if (!res.ok) return { categories: [] };
      return res.json() as Promise<{ categories: GmailCategory[] }>;
    },
    staleTime: STALE_MS,
  });

  return {
    categories: data?.categories ?? [],
    isLoading,
  };
}
