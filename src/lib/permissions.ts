export type AppRole = "owner" | "manager" | "staff" | "super_user";

export type PermissionAction =
  | "view_home"
  | "view_analytics"
  | "view_products"
  | "view_staff"
  | "view_settings"
  | "close_day"
  | "update_inventory"
  | "create_record"
  | "edit_record"
  | "delete_record"
  | "contribute"
  | "manage_staff"
  | "manage_bars"
  | "administer_system";

const rolePermissions: Record<AppRole, PermissionAction[]> = {
  owner: [
    "view_home",
    "view_analytics",
    "view_products",
    "view_staff",
    "close_day",
    "update_inventory",
    "create_record",
    "edit_record",
    "delete_record",
    "contribute",
    "manage_staff",
    "manage_bars",
  ],
  manager: [
    "view_home",
    "view_analytics",
    "view_products",
    "view_staff",
    "close_day",
    "update_inventory",
    "create_record",
    "contribute",
  ],
  staff: [],
  super_user: [
    "view_home",
    "view_analytics",
    "view_products",
    "view_staff",
    "view_settings",
    "close_day",
    "update_inventory",
    "create_record",
    "edit_record",
    "delete_record",
    "contribute",
    "manage_staff",
    "manage_bars",
    "administer_system",
  ],
};

export function normalizeRole(role: string | null | undefined): AppRole {
  const value = (role ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (value === "super_user" || value === "superuser" || value === "admin") {
    return "super_user";
  }

  if (value === "owner") {
    return "owner";
  }

  if (value === "manager") {
    return "manager";
  }

  return "staff";
}

export function hasPermission(
  role: string | null | undefined,
  action: PermissionAction,
) {
  return rolePermissions[normalizeRole(role)].includes(action);
}

export function canViewRoute(role: string | null | undefined, route: string) {
  if (route.startsWith("/dashboard")) {
    return hasPermission(role, "view_home");
  }

  if (route.startsWith("/analytics")) {
    return hasPermission(role, "view_analytics");
  }

  if (route.startsWith("/products")) {
    return hasPermission(role, "view_products");
  }

  if (route.startsWith("/bar-staff") || route.startsWith("/staff")) {
    return hasPermission(role, "view_staff");
  }

  if (route.startsWith("/settings")) {
    return hasPermission(role, "view_settings");
  }

  return false;
}

export function canEdit(role: string | null | undefined) {
  return hasPermission(role, "edit_record");
}

export function canDelete(role: string | null | undefined) {
  return hasPermission(role, "delete_record");
}

export function canContribute(role: string | null | undefined) {
  return hasPermission(role, "contribute");
}

export function isSuperUser(role: string | null | undefined) {
  return normalizeRole(role) === "super_user";
}
