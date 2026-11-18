import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

type MembershipRole = "owner" | "manager" | "staff";

type InviteInput = {
  barId?: string;
  email?: string;
  fullName?: string;
  role?: MembershipRole;
  linkStaffRecord?: boolean;
  jobTitle?: string;
};

const validRoles = new Set(["owner", "manager", "staff"]);

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeRole(role: unknown): MembershipRole | null {
  if (typeof role !== "string") {
    return null;
  }

  const cleanRole = role.trim().toLowerCase();
  return validRoles.has(cleanRole) ? (cleanRole as MembershipRole) : null;
}

async function getCaller(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) {
    return { user: null as User | null, error: "User not authenticated." };
  }

  const client = authClient();

  if (!client) {
    return { user: null, error: "Supabase client is not configured." };
  }

  const { data, error } = await client.auth.getUser(token);

  return {
    user: data.user,
    error: error?.message ?? "",
  };
}

async function getCallerPermission(
  admin: NonNullable<ReturnType<typeof adminClient>>,
  user: User,
  barId: string,
) {
  const { data: appUser } = await admin
    .from("users")
    .select("role")
    .or(`id.eq.${user.id},email.eq.${user.email ?? ""}`)
    .limit(1)
    .maybeSingle<{ role: string | null }>();

  const globalRole = (appUser?.role ?? "").toLowerCase().replace(/[\s-]+/g, "_");

  if (globalRole === "super_user" || globalRole === "superuser") {
    return { canView: true, canManage: true, isSuperUser: true };
  }

  const { data: membership } = await admin
    .from("bar_memberships")
    .select("role")
    .eq("bar_id", barId)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle<{ role: string | null }>();

  const barRole = membership?.role ?? "";

  return {
    canView: ["owner", "manager"].includes(barRole),
    canManage: barRole === "owner",
    isSuperUser: false,
  };
}

async function findAuthUserByEmail(
  admin: NonNullable<ReturnType<typeof adminClient>>,
  email: string,
) {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    return { user: null as User | null, error: error.message };
  }

  const user =
    data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    ) ?? null;

  return { user, error: "" };
}

async function ensureAuthUser(
  admin: NonNullable<ReturnType<typeof adminClient>>,
  email: string,
  fullName: string,
  redirectTo: string,
) {
  const existing = await findAuthUserByEmail(admin, email);

  if (existing.error) {
    return existing;
  }

  if (existing.user) {
    return { user: existing.user, error: "" };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      full_name: fullName || email.split("@")[0],
      invited_to: "Zentra",
    },
  });

  if (error) {
    const retry = await findAuthUserByEmail(admin, email);

    if (retry.user) {
      return { user: retry.user, error: "" };
    }

    return { user: null, error: error.message };
  }

  return { user: data.user, error: "" };
}

async function ensurePublicUser(
  admin: NonNullable<ReturnType<typeof adminClient>>,
  user: User,
) {
  const displayName =
    typeof user.user_metadata?.full_name === "string" &&
    user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : user.email?.split("@")[0] || "Zentra User";

  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("id", user.id)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existing) {
    await admin
      .from("users")
      .update({ email: user.email ?? null, name: displayName })
      .eq("id", user.id);
    return "";
  }

  const { error } = await admin.from("users").insert({
    id: user.id,
    name: displayName,
    email: user.email ?? null,
    role: "staff",
  });

  return error?.message ?? "";
}

async function ensureStaffRecord(
  admin: NonNullable<ReturnType<typeof adminClient>>,
  input: Required<Pick<InviteInput, "barId" | "email">> &
    Pick<InviteInput, "fullName" | "jobTitle">,
) {
  const { data: existing } = await admin
    .from("bar_staff")
    .select("id")
    .eq("bar_id", input.barId)
    .eq("email", input.email)
    .limit(1)
    .maybeSingle<{ id: string }>();

  const staffPayload = {
    name: input.fullName?.trim() || input.email.split("@")[0],
    email: input.email,
    role: input.jobTitle?.trim() || "Staff",
    is_active: true,
  };

  if (existing) {
    const { error } = await admin
      .from("bar_staff")
      .update({ ...staffPayload, updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    return error?.message ?? "";
  }

  const { error } = await admin.from("bar_staff").insert({
    bar_id: input.barId,
    ...staffPayload,
  });

  return error?.message ?? "";
}

export async function GET(request: NextRequest) {
  const admin = adminClient();

  if (!admin) {
    return jsonError("Service role is not configured.", 500);
  }

  const barId = request.nextUrl.searchParams.get("barId") ?? "";
  const { user, error: authError } = await getCaller(request);

  if (!user) {
    return jsonError(authError || "User not authenticated.", 401);
  }

  if (!barId) {
    return jsonError("No bar selected.");
  }

  const permission = await getCallerPermission(admin, user, barId);

  if (!permission.canView) {
    return jsonError("You do not have permission to view login users.", 403);
  }

  const { data: memberships, error } = await admin
    .from("bar_memberships")
    .select("user_id, role, created_at")
    .eq("bar_id", barId)
    .order("created_at", { ascending: true })
    .returns<Array<{ user_id: string; role: MembershipRole; created_at: string }>>();

  if (error) {
    return jsonError(error.message, 500);
  }

  const { data: staffRows } = await admin
    .from("bar_staff")
    .select("id, name, email")
    .eq("bar_id", barId)
    .returns<Array<{ id: string; name: string | null; email: string | null }>>();

  const authUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const usersById = new Map(
    (authUsers.data.users ?? []).map((authUser) => [authUser.id, authUser]),
  );
  const staffByEmail = new Map(
    (staffRows ?? [])
      .filter((staff) => staff.email)
      .map((staff) => [staff.email!.toLowerCase(), staff]),
  );

  return NextResponse.json({
    memberships: (memberships ?? []).map((membership) => {
      const authUser = usersById.get(membership.user_id);
      const email = authUser?.email ?? "";
      const staff = email ? staffByEmail.get(email.toLowerCase()) : null;

      return {
        userId: membership.user_id,
        email,
        role: membership.role,
        staffId: staff?.id ?? "",
        staffName: staff?.name ?? "",
        status: authUser?.confirmed_at ? "Active" : "Invited",
        createdAt: membership.created_at,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const admin = adminClient();

  if (!admin) {
    return jsonError("Service role is not configured.", 500);
  }

  const { user, error: authError } = await getCaller(request);

  if (!user) {
    return jsonError(authError || "User not authenticated.", 401);
  }

  const input = (await request.json().catch(() => ({}))) as InviteInput;
  const barId = input.barId ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const role = normalizeRole(input.role);

  if (!barId) {
    return jsonError("No bar selected.");
  }

  if (!email || !email.includes("@")) {
    return jsonError("Enter a valid email address.");
  }

  if (!role) {
    return jsonError("Choose owner, manager or staff.");
  }

  const permission = await getCallerPermission(admin, user, barId);

  if (!permission.canManage) {
    return jsonError("Only owners and super users can invite login users.", 403);
  }

  const invited = await ensureAuthUser(
    admin,
    email,
    input.fullName?.trim() ?? "",
    process.env.ZENTRA_INVITE_REDIRECT_URL || new URL("/accept-invite", request.nextUrl.origin).toString(),
  );

  if (!invited.user) {
    return jsonError(invited.error || "Supabase Auth invite failed.", 500);
  }

  const publicUserError = await ensurePublicUser(admin, invited.user);

  if (publicUserError) {
    return jsonError(publicUserError, 500);
  }

  const { data: existingMembership } = await admin
    .from("bar_memberships")
    .select("id")
    .eq("bar_id", barId)
    .eq("user_id", invited.user.id)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingMembership) {
    return jsonError("This user already has access to this bar.", 409);
  }

  const { error: membershipError } = await admin.from("bar_memberships").insert({
    bar_id: barId,
    user_id: invited.user.id,
    role,
  });

  if (membershipError) {
    return jsonError(membershipError.message, 500);
  }

  if (input.linkStaffRecord) {
    const staffError = await ensureStaffRecord(admin, {
      barId,
      email,
      fullName: input.fullName,
      jobTitle: input.jobTitle,
    });

    if (staffError) {
      return jsonError(staffError, 500);
    }
  }

  return NextResponse.json({
    message: `Invite/access created for ${email}.`,
  });
}

export async function PATCH(request: NextRequest) {
  const admin = adminClient();

  if (!admin) {
    return jsonError("Service role is not configured.", 500);
  }

  const { user, error: authError } = await getCaller(request);

  if (!user) {
    return jsonError(authError || "User not authenticated.", 401);
  }

  const input = (await request.json().catch(() => ({}))) as {
    barId?: string;
    userId?: string;
    role?: MembershipRole;
  };
  const role = normalizeRole(input.role);

  if (!input.barId || !input.userId || !role) {
    return jsonError("Membership update is incomplete.");
  }

  const permission = await getCallerPermission(admin, user, input.barId);

  if (!permission.canManage) {
    return jsonError("Only owners and super users can update access.", 403);
  }

  const { error } = await admin
    .from("bar_memberships")
    .update({ role })
    .eq("bar_id", input.barId)
    .eq("user_id", input.userId);

  if (error) {
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ message: "Access role updated." });
}

export async function DELETE(request: NextRequest) {
  const admin = adminClient();

  if (!admin) {
    return jsonError("Service role is not configured.", 500);
  }

  const { user, error: authError } = await getCaller(request);

  if (!user) {
    return jsonError(authError || "User not authenticated.", 401);
  }

  const input = (await request.json().catch(() => ({}))) as {
    barId?: string;
    userId?: string;
  };

  if (!input.barId || !input.userId) {
    return jsonError("Membership removal is incomplete.");
  }

  const permission = await getCallerPermission(admin, user, input.barId);

  if (!permission.canManage) {
    return jsonError("Only owners and super users can remove access.", 403);
  }

  const { error } = await admin
    .from("bar_memberships")
    .delete()
    .eq("bar_id", input.barId)
    .eq("user_id", input.userId);

  if (error) {
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ message: "Login access removed." });
}
