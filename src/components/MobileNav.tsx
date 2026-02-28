import { LayoutDashboard, ArrowLeftRight, AlertTriangle, BarChart3, Shield, Menu, X, Settings, Bell, History, ShoppingBag, Store, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  active: string;
  onNavigate: (page: string) => void;
  unreadCount: number;
  onNotifications: () => void;
}

const navItems = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "deals", label: "Deals", icon: ArrowLeftRight },
  { id: "transactions", label: "Transactions", icon: ShoppingBag },
  { id: "listings", label: "Listings", icon: Store },
  { id: "users", label: "Users", icon: Users },
  { id: "disputes", label: "Disputes", icon: AlertTriangle },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function MobileNav({ active, onNavigate, unreadCount, onNotifications }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-sidebar-primary" />
          <span className="font-bold text-sm text-sidebar-accent-foreground">TrustPay9ja</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onNotifications} className="relative p-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors">
            <Bell className="w-5 h-5 text-sidebar-foreground" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-accent text-accent-foreground text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse-gold">
                {unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => setOpen(!open)} className="p-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>
      {open && (
        <div className="md:hidden bg-sidebar border-b border-sidebar-border px-3 pb-3 space-y-0.5 animate-fade-in">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                active === item.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
          <button
            onClick={() => { navigate("/miniapp"); setOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 border-t border-sidebar-border/50 mt-1 pt-2"
          >
            <ShoppingBag className="w-4 h-4" />
            User View
          </button>
        </div>
      )}
    </>
  );
}
