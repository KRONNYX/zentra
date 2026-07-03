"use client";

import { supabase } from "@/lib/supabaseClient";
import { hasPermission } from "@/lib/permissions";

export const staffPermissionOptions = [
  "close_day",
  "inventory",
  "staff",
  "analytics",
] as const;

export type StaffPermission = (typeof staffPermissionOptions)[number];

export type BarProfile = {
  name: string;
  address: string;
  phone: string;
  email: string;
  imageUrl: string;
};

export type StaffForm = {
  name: string;
  email: string;
  staffCode: string;
  role: string;
  phone: string;
  isActive: boolean;
  permissions: StaffPermission[];
};

export type StaffMember = StaffForm & {
  id: string;
};

export type ShiftForm = {
  staffId: string;
  staffName: string;
  role: string;
  startsAt: string;
  endsAt: string;
  notes: string;
};

export type Shift = ShiftForm & {
  id: string;
};

type BarRow = {
  name: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  image_url?: string | null;
};

type StaffRow = {
  id: string;
  name: string | null;
  email?: string | null;
  staff_code: string | null;
  role: string | null;
  phone: string | null;
  is_active: boolean | null;
  permissions?: StaffPermission[] | null;
};

type ShiftRow = {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  role?: string | null;
  shift_start: string | null;
  shift_end: string | null;
  notes?: string | null;
};

const defaultPermissions: StaffPermission[] = ["close_day"];

function cleanPermissions(permissions: StaffPermission[]) {
  return staffPermissionOptions.filter((permission) =>
    permissions.includes(permission),
  );
}

function cleanStaff(input: StaffForm) {
  return {
    name: input.name.trim(),
    email: input.email.trim(),
    staffCode: input.staffCode.trim(),
    role: input.role.trim() || "Staff",
    phone: input.phone.trim(),
    isActive: input.isActive,
    permissions: cleanPermissions(input.permissions),
  };
}

function mapStaff(row: StaffRow): StaffMember {
  return {
    id: row.id,
    name: row.name ?? "Unnamed staff",
    email: row.email ?? "",
    staffCode: row.staff_code ?? "",
    role: row.role ?? "Staff",
    phone: row.phone ?? "",
    isActive: row.is_active ?? true,
    permissions: row.permissions?.length ? row.permissions : defaultPermissions,
  };
}

function mapBar(row: BarRow | null | undefined): BarProfile {
  return {
    name: row?.name ?? "Your bar",
    address: row?.address ?? "",
    phone: row?.phone ?? "",
    email: row?.email ?? "",
    imageUrl: row?.image_url ?? "",
  };
}

function mapShift(row: ShiftRow): Shift {
  return {
    id: row.id,
    staffId: row.staff_id ?? "",
    staffName: row.staff_name ?? "Unassigned",
    role: row.role ?? "",
    startsAt: row.shift_start ?? "",
    endsAt: row.shift_end ?? "",
    notes: row.notes ?? "",
  };
}

export async function getBarStaff(barId: string) {
  if (!barId) {
    return {
      barProfile: mapBar(null),
      barName: "",
      staff: [] as StaffMember[],
      shifts: [] as Shift[],
      error: "No bar selected.",
    };
  }

  const [barResult, staffResult, shiftsResult] = await Promise.all([
    supabase
      .from("bars")
      .select("name, address, phone, email, image_url")
      .eq("id", barId)
      .maybeSingle<BarRow>(),
    supabase
      .from("bar_staff")
      .select("id, name, email, staff_code, role, phone, is_active, permissions")
      .eq("bar_id", barId)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true })
      .returns<StaffRow[]>(),
    supabase
      .from("shifts")
      .select("id, staff_id, staff_name, role, shift_start, shift_end, notes")
      .eq("bar_id", barId)
      .order("shift_start", { ascending: false })
      .limit(12)
      .returns<ShiftRow[]>(),
  ]);

  const error = barResult.error ?? staffResult.error ?? shiftsResult.error;

  if (error) {
    return {
      barProfile: mapBar(null),
      barName: "",
      staff: [] as StaffMember[],
      shifts: [] as Shift[],
      error: error.message.includes("bar_staff")
        ? "The staff table is not available in Supabase yet. Run the bar_staff SQL migration, then refresh this page."
        : error.message,
    };
  }

  const barProfile = mapBar(barResult.data);

  return {
    barProfile,
    barName: barProfile.name,
    staff: (staffResult.data ?? []).map(mapStaff),
    shifts: (shiftsResult.data ?? []).map(mapShift),
    error: "",
  };
}

export async function getActiveStaffForBar(barId: string) {
  if (!barId) {
    return { staff: [] as StaffMember[], error: "" };
  }

  const { data, error } = await supabase
    .from("bar_staff")
    .select("id, name, email, staff_code, role, phone, is_active, permissions")
    .eq("bar_id", barId)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .returns<StaffRow[]>();

  return {
    staff: (data ?? []).map(mapStaff),
    error: error?.message ?? "",
  };
}

function canManageStaffForRole(role: string | null | undefined) {
  return role === undefined || hasPermission(role, "manage_staff");
}

function permissionError() {
  return { error: "Only owners and super users can manage staff and bar details." };
}

export async function updateBarProfile(
  barId: string,
  profile: BarProfile,
  role?: string | null,
) {
  if (!canManageStaffForRole(role)) {
    return permissionError();
  }

  const cleanName = profile.name.trim();

  if (!barId) {
    return { error: "No bar selected." };
  }

  if (!cleanName) {
    return { error: "Bar name is required." };
  }

  const { error } = await supabase
    .from("bars")
    .update({
      name: cleanName,
      address: profile.address.trim() || null,
      phone: profile.phone.trim() || null,
      email: profile.email.trim() || null,
      image_url: profile.imageUrl.trim() || null,
    })
    .eq("id", barId);

  return { error: error?.message ?? "" };
}

export async function updateBarName(
  barId: string,
  name: string,
  role?: string | null,
) {
  if (!canManageStaffForRole(role)) {
    return permissionError();
  }

  const cleanName = name.trim();

  if (!barId) {
    return { error: "No bar selected." };
  }

  if (!cleanName) {
    return { error: "Bar name is required." };
  }

  const { error } = await supabase
    .from("bars")
    .update({ name: cleanName })
    .eq("id", barId);

  return { error: error?.message ?? "" };
}

export async function createStaffMember(
  barId: string,
  input: StaffForm,
  role?: string | null,
) {
  if (!canManageStaffForRole(role)) {
    return permissionError();
  }

  const staff = cleanStaff(input);

  if (!barId) {
    return { error: "No bar selected." };
  }

  if (!staff.name) {
    return { error: "Staff name is required." };
  }

  const { error } = await supabase.from("bar_staff").insert({
    bar_id: barId,
    name: staff.name,
    email: staff.email || null,
    staff_code: staff.staffCode || null,
    role: staff.role,
    phone: staff.phone || null,
    is_active: staff.isActive,
    permissions: staff.permissions,
  });

  return { error: error?.message ?? "" };
}

export async function updateStaffMember(
  barId: string,
  staffId: string,
  input: StaffForm,
  role?: string | null,
) {
  if (!canManageStaffForRole(role)) {
    return permissionError();
  }

  const staff = cleanStaff(input);

  if (!barId || !staffId) {
    return { error: "Staff member could not be found." };
  }

  if (!staff.name) {
    return { error: "Staff name is required." };
  }

  const { error } = await supabase
    .from("bar_staff")
    .update({
      name: staff.name,
      email: staff.email || null,
      staff_code: staff.staffCode || null,
      role: staff.role,
      phone: staff.phone || null,
      is_active: staff.isActive,
      permissions: staff.permissions,
      updated_at: new Date().toISOString(),
    })
    .eq("bar_id", barId)
    .eq("id", staffId);

  return { error: error?.message ?? "" };
}

export async function deleteStaffMember(
  barId: string,
  staffId: string,
  role?: string | null,
) {
  if (!canManageStaffForRole(role)) {
    return permissionError();
  }

  if (!barId || !staffId) {
    return { error: "Staff member could not be found." };
  }

  const { error } = await supabase
    .from("bar_staff")
    .delete()
    .eq("bar_id", barId)
    .eq("id", staffId);

  return { error: error?.message ?? "" };
}

export async function disableStaffMember(
  barId: string,
  staffId: string,
  disabled: boolean,
  role?: string | null,
) {
  if (!canManageStaffForRole(role)) {
    return permissionError();
  }

  if (!barId || !staffId) {
    return { error: "Staff member could not be found." };
  }

  const { error } = await supabase
    .from("bar_staff")
    .update({
      is_active: !disabled,
      updated_at: new Date().toISOString(),
    })
    .eq("bar_id", barId)
    .eq("id", staffId);

  return { error: error?.message ?? "" };
}

export async function createShift(
  barId: string,
  input: ShiftForm,
  role?: string | null,
) {
  if (!canManageStaffForRole(role)) {
    return permissionError();
  }

  if (!barId) {
    return { error: "No bar selected." };
  }

  if (!input.staffName.trim()) {
    return { error: "Choose a staff member for the shift." };
  }

  const { error } = await supabase.from("shifts").insert({
    bar_id: barId,
    staff_id: input.staffId || null,
    staff_name: input.staffName.trim(),
    role: input.role.trim() || null,
    shift_start: input.startsAt || null,
    shift_end: input.endsAt || null,
    notes: input.notes.trim() || null,
  });

  return { error: error?.message ?? "" };
}

export async function deleteShift(
  barId: string,
  shiftId: string,
  role?: string | null,
) {
  if (!canManageStaffForRole(role)) {
    return permissionError();
  }

  if (!barId || !shiftId) {
    return { error: "Shift could not be found." };
  }

  const { error } = await supabase
    .from("shifts")
    .delete()
    .eq("bar_id", barId)
    .eq("id", shiftId);

  return { error: error?.message ?? "" };
}
