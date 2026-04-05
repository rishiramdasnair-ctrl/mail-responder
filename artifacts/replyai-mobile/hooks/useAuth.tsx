import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-expo";

export function useAuth() {
  const { isSignedIn, isLoaded, signOut, getToken } = useClerkAuth();
  const { user } = useUser();

  return {
    isSignedIn,
    isLoaded,
    signOut,
    getToken,
    user,
    userId: user?.id,
    email: user?.primaryEmailAddress?.emailAddress,
    firstName: user?.firstName,
    lastName: user?.lastName,
    imageUrl: user?.imageUrl,
  };
}
