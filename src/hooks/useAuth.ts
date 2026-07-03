"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getCurrentUser } from "@/services/authService";
import { useRouter } from "next/navigation";

export function useAuth() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { user: currentUser } = await getCurrentUser();

      if (!currentUser) {
        router.push("/login");
        setLoading(false);
        return;
      }

      setUser(currentUser);
      setLoading(false);
    };

    checkUser();
  }, [router]);

  return { loading, user };
}
