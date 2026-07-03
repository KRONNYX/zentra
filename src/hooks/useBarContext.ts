"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { activeBarChangedEvent } from "@/lib/activeBar";
import {
  type BarContext,
  getBarContextForUser,
} from "@/services/dashboardService";

export function useBarContext() {
  const { loading: authLoading, user } = useAuth();
  const [barContext, setBarContext] = useState<BarContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    function handleActiveBarChanged() {
      setRefreshKey((key) => key + 1);
    }

    window.addEventListener(activeBarChangedEvent, handleActiveBarChanged);

    return () => {
      window.removeEventListener(activeBarChangedEvent, handleActiveBarChanged);
    };
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const loadContext = async () => {
      if (!user) {
        return;
      }

      setLoading(true);
      const { barContext: nextContext, error: contextError } =
        await getBarContextForUser(user.id, user.email);

      setBarContext(nextContext);
      setError(contextError);
      setLoading(false);
    };

    loadContext();
  }, [authLoading, refreshKey, user]);

  return {
    barContext,
    error,
    loading: authLoading || (Boolean(user) && loading),
    user,
  };
}
