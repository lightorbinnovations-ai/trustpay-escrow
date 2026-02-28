import { LayoutDashboard, ArrowLeftRight, AlertTriangle, BarChart3, Shield, Settings, Bell, History, ShoppingBag, Store, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlatformSettings } from "@/hooks/use-deals";

interface Props {
  active: string;
  onNavigate: (page: string) => void;
  unreadCount: number;
  onNotifications: () => void;
}

const navItems = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "deals", label: "All Deals", icon: ArrowLeftRight },
  { id: "transactions", label: "Transactions", icon: ShoppingBag },
  { id: "listings", label: "Listings", icon: Store },
  { id: "users", label: "Users", icon: Users },
  { id: "disputes", label: "Disputes", icon: AlertTriangle },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function DashboardSidebar({ active, onNavigate, unreadCount, onNotifications }: Props) {
  const { data: settings } = usePlatformSettings();
  const adminName = settings?.admin_name || "Admin";
  const adminEmail = settings?.admin_email || "admin@trustpay9ja.ng";
  const initials = adminName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <aside className="hidden md:flex flex-col w-64 bg-sidebar text-sidebar-foreground min-h-screen border-r border-sidebar-border">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-6 py-5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center shadow-md shadow-sidebar-primary/20 transition-transform duration-300 hover:scale-105">
          <Shield className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        <div>
          <h1 className="text-base font-bold text-sidebar-accent-foreground tracking-tight">TrustPay9ja</h1>
          <p className="text-[11px] text-sidebar-muted">Powered by LightOrb</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item, i) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
              active === item.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <item.icon className={cn(
              "w-[18px] h-[18px] transition-transform duration-200",
              active === item.id ? "" : "group-hover:scale-110"
            )} />
            {item.label}
            {item.id === "disputes" && (
              <span className="ml-auto bg-status-disputed/15 text-status-disputed text-[10px] font-bold px-1.5 py-0.5 rounded-md">!</span>
            )}
          </button>
        ))}
      </nav>

      {/* Notifications */}
      <div className="px-3 pb-2">
        <button
          onClick={onNotifications}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-all duration-200 group"
        >
          <div className="relative">
            <Bell className="w-[18px] h-[18px] group-hover:animate-bounce-subtle transition-transform" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-accent text-accent-foreground text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse-gold shadow-sm">
                {unreadCount}
              </span>
            )}
          </div>
          Notifications
        </button>
      </div>

      {/* User */}
      <div className="px-4 py-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sidebar-primary to-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-primary-foreground shadow-sm">
            {initials}
          </div>
          <div>
            <p className="text-xs font-medium text-sidebar-accent-foreground">{adminName}</p>
            <p className="text-[11px] text-sidebar-muted">{adminEmail}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
