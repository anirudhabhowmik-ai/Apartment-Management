import { useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";

export interface AuthUser {
  id: string;
  phone: string;
  name?: string;
}

export function useAuth() {
  const { user, setUser, isLoading, setIsLoading } = useAuthStore();

  useEffect(() => {
    // TODO: check persisted session (SecureStore/AsyncStorage) on mount
    const checkSession = async () => {
      setIsLoading(true);
      try {
        // const savedUser = await getStoredSession();
        // if (savedUser) setUser(savedUser);
      } finally {
        setIsLoading(false);
      }
    };
    checkSession();
  }, []);

  return { user, isLoading, setUser };
}
