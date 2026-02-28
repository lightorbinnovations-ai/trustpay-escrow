import { useState, useEffect } from "react";
import { Bell, X, DollarSign, AlertTriangle, CheckCircle2, Trash2, Plus, Shield, ArrowRightLeft, ShoppingBag, Package, CreditCard, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Notification {
  id: string;
  type: "funded" | "dispute" | "completed" | "created" | "cleared" | "transfer" | "other";
  title: string;
  message: string;
  time: string;
  read: boolean;
}

interface MarketNotification {
  id: string;
  recipient_telegram_id: number;
  sender_telegram_id: number | null;
  title: string;
  message: string;
  type: string;
  listing_id: string | null;
  is_read: boolean;
  created_at: string;
}

function mapAuditToNotification(log: any): Notification {
  const details = log.details || {};
  switch (log.action) {
    case "deal_created":
      return {
        id: log.id, type: "created", title: "New Deal Created",
        message: `${log.actor} created deal ${log.deal_id || ""} for ₦${(details.amount || 0).toLocaleString()} with ${details.seller || "unknown"}`,
        time: log.created_at, read: false,
      };
    case "payment_confirmed":
      return {
        id: log.id, type: "funded", title: "Payment Confirmed",
        message: `${log.deal_id || "A deal"} was funded — ₦${(details.amount || 0).toLocaleString()} received via Paystack`,
        time: log.created_at, read: false,
      };
    case "delivery_confirmed":
      return {
        id: log.id, type: "completed", title: "Deal Completed",
        message: `${log.actor} confirmed receipt for ${log.deal_id || "a deal"}. ₦${((details.amount || 0) - (details.fee || 0)).toLocaleString()} released.`,
        time: log.created_at, read: false,
      };
    case "dispute_opened":
      return {
        id: log.id, type: "dispute", title: "Dispute Opened",
        message: `${log.actor} opened a dispute for ${log.deal_id || "a deal"} (₦${(details.amount || 0).toLocaleString()})`,
        time: log.created_at, read: false,
      };
    case "transfer_initiated":
    case "transfer_completed":
      return {
        id: log.id, type: "transfer", title: log.action === "transfer_initiated" ? "Transfer Initiated" : "Transfer Completed",
        message: `₦${(details.amount || 0).toLocaleString()} ${log.action === "transfer_initiated" ? "sent" : "deposited"} to ${details.seller || log.actor}`,
        time: log.created_at, read: false,
      };
    case "auto_released":
      return {
        id: log.id, type: "completed", title: "Auto-Released (48h)",
        message: `${log.deal_id} auto-released ₦${((details.amount || 0) - (details.fee || 0)).toLocaleString()} to ${details.seller || "seller"}`,
        time: log.created_at, read: false,
      };
    case "chat_cleared":
      return {
        id: log.id, type: "cleared", title: "Chat Cleared",
        message: `${log.actor} cleared their Telegram chat (${details.messages_deleted || 0} messages removed)`,
        time: log.created_at, read: false,
      };
    case "deal_cancelled":
    case "deal_cancelled_refund":
      return {
        id: log.id, type: "other", title: log.action === "deal_cancelled" ? "Deal Cancelled" : "Deal Cancelled + Refund",
        message: `${log.actor} cancelled ${log.deal_id || "a deal"} — ₦${(details.amount || 0).toLocaleString()}${details.refund_success ? " (refunded)" : ""}`,
        time: log.created_at, read: false,
      };
    case "settings_updated":
      return {
        id: log.id, type: "other", title: "Settings Updated",
        message: `Platform settings were updated by ${log.actor}`,
        time: log.created_at, read: false,
      };
    case "dispute_resolved_release_to_seller":
    case "dispute_resolved_refund_buyer":
      return {
        id: log.id, type: "completed", title: "Dispute Resolved",
        message: `${log.deal_id} — ${log.action.includes("refund") ? "Refunded to buyer" : "Released to seller"}`,
        time: log.created_at, read: false,
      };
    case "marketplace_payment":
      return {
        id: log.id, type: "funded", title: "Marketplace Payment",
        message: `${log.actor} paid ₦${(details.amount || 0).toLocaleString()} for ${details.listing || "an item"}`,
        time: log.created_at, read: false,
      };
    case "marketplace_released":
      return {
        id: log.id, type: "completed", title: "Marketplace Released",
        message: `₦${(details.amount || 0).toLocaleString()} released for ${details.listing || "an item"}`,
        time: log.created_at, read: false,
      };
    case "marketplace_dispute":
      return {
        id: log.id, type: "dispute", title: "Marketplace Dispute",
        message: `Dispute raised on ${details.listing || "an item"} — ₦${(details.amount || 0).toLocaleString()}`,
        time: log.created_at, read: false,
      };
    default:
      return {
        id: log.id, type: "other",
        title: log.action.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
        message: `${log.actor}${log.deal_id ? ` on ${log.deal_id}` : ""}`,
        time: log.created_at, read: false,
      };
  }
}

const icons: Record<Notification["type"], any> = {
  funded: DollarSign, dispute: AlertTriangle, completed: CheckCircle2,
  created: Plus, cleared: Trash2, transfer: ArrowRightLeft, other: Shield,
};

const iconColors: Record<Notification["type"], string> = {
  funded: "bg-status-funded/10 text-status-funded",
  dispute: "bg-status-disputed/10 text-status-disputed",
  completed: "bg-status-completed/10 text-status-completed",
  created: "bg-primary/10 text-primary",
  cleared: "bg-accent/10 text-accent",
  transfer: "bg-status-funded/10 text-status-funded",
  other: "bg-muted text-muted-foreground",
};

const marketTypeIcons: Record<string, any> = {
  escrow_paid: CreditCard,
  delivery_marked: Package,
  payment_released: CheckCircle2,
  transaction_complete: CheckCircle2,
  dispute_opened: AlertTriangle,
};

const marketTypeColors: Record<string, string> = {
  escrow_paid: "bg-status-funded/10 text-status-funded",
  delivery_marked: "bg-primary/10 text-primary",
  payment_released: "bg-status-completed/10 text-status-completed",
  transaction_complete: "bg-status-completed/10 text-status-completed",
  dispute_opened: "bg-status-disputed/10 text-status-disputed",
};

interface Props { open: boolean; onClose: () => void; }

type Tab = "escrow" | "market";

export default function NotificationsPanel({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("escrow");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [marketNotifs, setMarketNotifs] = useState<MarketNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [marketLoading, setMarketLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      const { data } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(50);
      if (data) setNotifications(data.map(mapAuditToNotification));
      setLoading(false);
    }
    async function fetchMarket() {
      setMarketLoading(true);
      const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
      if (data) setMarketNotifs(data as MarketNotification[]);
      setMarketLoading(false);
    }
    if (open) {
      fetchLogs();
      fetchMarket();
    }
  }, [open]);

  useEffect(() => {
    const channel1 = supabase.channel("admin-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, (payload) => {
        const newNotif = mapAuditToNotification(payload.new);
        setNotifications((prev) => [newNotif, ...prev].slice(0, 50));
      }).subscribe();

    const channel2 = supabase.channel("market-notifications-panel")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        setMarketNotifs((prev) => [payload.new as MarketNotification, ...prev].slice(0, 50));
      }).subscribe();

    return () => {
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, []);

  const markAllRead = () => setReadIds(new Set(notifications.map((n) => n.id)));
  const unreadCount = notifications.filter((n) => !n.read && !readIds.has(n.id)).length;
  const marketUnread = marketNotifs.filter((n) => !n.is_read).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card shadow-2xl border-l border-border animate-slide-in-right flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-sm">Notifications</h3>
          </div>
          <div className="flex items-center gap-2">
            {tab === "escrow" && unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary font-medium hover:underline transition-colors">Mark all read</button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-border">
          <button
            onClick={() => setTab("escrow")}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium text-center transition-colors relative",
              tab === "escrow" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="flex items-center justify-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Escrow Bot
              {unreadCount > 0 && (
                <span className="bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </div>
            {tab === "escrow" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </button>
          <button
            onClick={() => setTab("market")}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium text-center transition-colors relative",
              tab === "market" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="flex items-center justify-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5" />
              Marketplace
              {marketUnread > 0 && (
                <span className="bg-status-funded text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{marketUnread}</span>
              )}
            </div>
            {tab === "market" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "escrow" ? (
            loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-muted-foreground">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Bell className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n, i) => {
                const Icon = icons[n.type];
                const isRead = n.read || readIds.has(n.id);
                return (
                  <div key={n.id}
                    className={cn("px-5 py-4 border-b border-border/50 transition-all duration-200 hover:bg-muted/30 animate-fade-in-up opacity-0", !isRead && "bg-primary/[0.03]")}
                    style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
                  >
                    <div className="flex gap-3">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", iconColors[n.type])}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{n.title}</p>
                          {!isRead && <div className="w-2 h-2 rounded-full bg-accent animate-pulse-gold" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                        <p className="text-[11px] text-muted-foreground mt-1.5">{formatDistanceToNow(new Date(n.time), { addSuffix: true })}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            marketLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-muted-foreground">Loading marketplace notifications...</p>
              </div>
            ) : marketNotifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <ShoppingBag className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No marketplace notifications yet</p>
                <p className="text-xs text-muted-foreground">Notifications will appear here when users transact via the TrustMarket bot</p>
              </div>
            ) : (
              marketNotifs.map((n, i) => {
                const Icon = marketTypeIcons[n.type] || MessageSquare;
                const colorClass = marketTypeColors[n.type] || "bg-muted text-muted-foreground";
                return (
                  <div key={n.id}
                    className={cn("px-5 py-4 border-b border-border/50 transition-all duration-200 hover:bg-muted/30 animate-fade-in-up opacity-0", !n.is_read && "bg-primary/[0.03]")}
                    style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
                  >
                    <div className="flex gap-3">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", colorClass)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{n.title}</p>
                          {!n.is_read && <div className="w-2 h-2 rounded-full bg-status-funded animate-pulse" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{n.type.replace(/_/g, " ")}</span>
                          <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>
    </div>
  );
}
