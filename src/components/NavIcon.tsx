/**
 * NavIcon — maps AppNavItemId → Lucide icon components.
 * Used by BottomNav, DesktopSidebar, and SlideMenu to render
 * proper vector icons instead of emoji.
 */

import {
  Home,
  Calendar,
  TrendingUp,
  Target,
  BarChart2,
  DollarSign,
  Flag,
  Layers,
  Bookmark,
  Search,
  Users,
  FlaskConical,
  Settings,
  Shield,
  type LucideProps,
} from "lucide-react";
import type { AppNavItemId } from "@/lib/app-nav";

const ICON_MAP: Record<AppNavItemId, React.ComponentType<LucideProps>> = {
  home: Home,
  schedule: Calendar,
  props: TrendingUp,
  picks: Target,
  trends: BarChart2,
  odds: DollarSign,
  golf: Flag,
  parlays: Layers,
  "my-picks": Bookmark,
  search: Search,
  teams: Users,
  systems: FlaskConical,
  settings: Settings,
  admin: Shield,
};

export function NavIcon({
  id,
  className,
  size = 18,
}: {
  id: AppNavItemId;
  className?: string;
  size?: number;
}) {
  const Icon = ICON_MAP[id] ?? Home;
  return <Icon size={size} className={className} />;
}
