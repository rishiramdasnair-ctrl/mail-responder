import { useAuthContext } from "@/contexts/AuthContext";

export function useAuth() {
  const { isSignedIn, isLoaded, signOut, getToken, userId, email } = useAuthContext();
  const user = userId
    ? {
        id: userId,
        primaryEmailAddress: { emailAddress: email ?? "" },
        firstName: null as string | null,
        lastName: null as string | null,
        username: null as string | null,
        imageUrl: null as string | null,
        update: undefined as undefined,
      }
    : null;
  return {
    isSignedIn,
    isLoaded,
    signOut,
    getToken,
    userId,
    email,
    user,
    firstName: null as string | null,
    lastName: null as string | null,
    imageUrl: null as string | null,
  };
}
