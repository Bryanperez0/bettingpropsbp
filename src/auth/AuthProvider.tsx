import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** True after the user opens a password-reset link, until they save a new password. */
  recovery: boolean;
  endRecovery: () => void;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, recovery: false, endRecovery: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    // Fires once on load (INITIAL_SESSION) and on every sign-in / sign-out.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") queryClient.clear();
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ user, loading, recovery, endRecovery: () => setRecovery(false) }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
