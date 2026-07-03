import { BarChart3, LineChart, Package, Settings, UsersRound } from "lucide-react";
import { canViewRoute } from "@/lib/permissions";

export const navItems = [
  { href: "/dashboard", label: "Home", icon: BarChart3 },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/products", label: "Products", icon: Package },
  { href: "/bar-staff", label: "Staff", icon: UsersRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function visibleNavItems(role: string | null | undefined) {
  return navItems.filter((item) => canViewRoute(role, item.href));
}
