import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient";

export interface GmailAccount {
  email: string;
  isPrimary: boolean;
  signature?: string | null;
}

const STALE_MS = 5 * 60_000;

export function useGmailAccounts() {
  const { apiBaseUrl, authHeaders } = useApiClient();

  const { data, isLoading } = useQuery<{ accounts: GmailAccount[] }>({
    queryKey: ["gmail-accounts"],
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch(`${apiBaseUrl}/api/gmail/accounts`, { headers });
      if (!res.ok) return { accounts: [] };
      return res.json() as Promise<{ accounts: GmailAccount[] }>;
    },
    staleTime: STALE_MS,
  });

  return {
    accounts: data?.accounts ?? [],
    isLoading,
  };
}
