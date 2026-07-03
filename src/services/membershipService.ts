"use client";

import { supabase } from "@/lib/supabaseClient";

export type BarMembershipRole = "owner" | "manager" | "staff";

export type BarMembership = {
  userId: string;
  email: string;
  role: BarMembershipRole;
  staffId: string;
  staffName: string;
  status: string;
  createdAt: string;
};

export type InviteBarUserInput = {
  barId: string;
  email: string;
  fullName: string;
  role: BarMembershipRole;
  linkStaffRecord: boolean;
  jobTitle: string;
};

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    return { error: "User not authenticated.", headers: null };
  }

  return {
    error: "",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };
}

async function parseResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    memberships?: BarMembership[];
  };

  if (!response.ok) {
    return {
      ...payload,
      error: payload.error ?? "Membership request failed.",
    };
  }

  return {
    ...payload,
    error: payload.error ?? "",
  };
}

export async function inviteBarUser(input: InviteBarUserInput) {
  const { headers, error } = await authHeaders();

  if (!headers) {
    return { error };
  }

  const response = await fetch("/api/invite-bar-user", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  return parseResponse(response);
}

export async function listBarMemberships(barId: string) {
  const { headers, error } = await authHeaders();

  if (!headers) {
    return { memberships: [] as BarMembership[], error };
  }

  const params = new URLSearchParams({ barId });
  const response = await fetch(`/api/invite-bar-user?${params.toString()}`, {
    headers,
  });
  const payload = await parseResponse(response);

  return {
    memberships: payload.memberships ?? [],
    error: payload.error,
  };
}

export async function updateMembershipRole(
  barId: string,
  userId: string,
  role: BarMembershipRole,
) {
  const { headers, error } = await authHeaders();

  if (!headers) {
    return { error };
  }

  const response = await fetch("/api/invite-bar-user", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ barId, userId, role }),
  });

  return parseResponse(response);
}

export async function removeBarMembership(barId: string, userId: string) {
  const { headers, error } = await authHeaders();

  if (!headers) {
    return { error };
  }

  const response = await fetch("/api/invite-bar-user", {
    method: "DELETE",
    headers,
    body: JSON.stringify({ barId, userId }),
  });

  return parseResponse(response);
}
