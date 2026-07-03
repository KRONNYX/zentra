"use client";

import { supabase } from "@/lib/supabaseClient";

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  return {
    user: data.user,
    error,
  };
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return { error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  return { error };
}
