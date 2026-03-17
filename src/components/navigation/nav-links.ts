import {
  LayoutDashboard,
  ArrowLeftRight,
  PiggyBank,
  Landmark,
  TrendingUp,
  BarChart3,
  Settings,
  Upload,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Links shown in the desktop sidebar */
export const sidebarLinks: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/net-worth", label: "Net Worth", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/import", label: "Import", icon: Upload },
];

/** Primary tabs shown in the mobile bottom bar */
export const mobileTabLinks: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/accounts", label: "Accounts", icon: Landmark },
];

/** Links accessible through the More menu on mobile */
export const moreMenuLinks: NavLink[] = [
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/net-worth", label: "Net Worth", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/import", label: "Import", icon: Upload },
];

/** Special "More" tab item for mobile bottom bar */
export const moreTab = {
  label: "More",
  icon: MoreHorizontal,
};
