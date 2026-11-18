"use client";

import { supabase } from "@/lib/supabaseClient";
import { getBarContextForUser } from "@/services/dashboardService";
import type { User } from "@supabase/supabase-js";

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  return {
    user: data.user,
    error,
  };
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return { user: data.user, error };
}

export async function getSignedInPath(user: User) {
  const { barContext } = await getBarContextForUser(user.id, user.email);
  return barContext && barContext.role !== "staff" ? "/dashboard" : "/orders";
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  return { error };
}
