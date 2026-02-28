import { useDeals, useAuditLogs } from "@/hooks/use-deals";
import type { Deal } from "@/hooks/use-deals";
import { useState, useMemo } from "react";
import { History, Clock, CheckCircle2, AlertTriangle, ArrowLeftRight, Calendar, Search, ChevronDown, ChevronRight, Wallet, ArrowUpRight, ArrowDownLeft, Shield } from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/StatusBadge";
import DealDetailModal from "@/components/DealDetailModal";
import { cn } from "@/lib/utils";

const statusIcon: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-status-pending" />,
  funded: <ArrowLeftRight className="w-4 h-4 text-status-funded" />,
  completed: <CheckCircle2 className="w-4 h-4 text-status-completed" />,
  disputed: <AlertTriangle className="w-4 h-4 text-status-disputed" />,
};

const actionIcon: Record<string, { icon: React.ReactNode; color: string }> = {
  deal_created: { icon: <ArrowUpRight className="w-3.5 h-3.5" />, color: "bg-primary/10 text-primary" },
  delivery_confirmed: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "bg-status-completed/10 text-status-completed" },
  dispute_opened: { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "bg-status-disputed/10 text-status-disputed" },
  payment_confirmed: { icon: <Wallet className="w-3.5 h-3.5" />, color: "bg-status-funded/10 text-status-funded" },
  transfer_initiated: { icon: <ArrowLeftRight className="w-3.5 h-3.5" />, color: "bg-status-funded/10 text-status-funded" },
  transfer_completed: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "bg-status-completed/10 text-status-completed" },
  auto_released: { icon: <Clock className="w-3.5 h-3.5" />, color: "bg-status-pending/10 text-status-pending" },
  dispute_resolved_release_to_seller: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "bg-status-completed/10 text-status-completed" },
  dispute_resolved_refund_buyer: { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "bg-status-disputed/10 text-status-disputed" },
  chat_cleared: { icon: <Clock className="w-3.5 h-3.5" />, color: "bg-muted text-muted-foreground" },
  settings_updated: { icon: <Shield className="w-3.5 h-3.5" />, color: "bg-muted text-muted-foreground" },
};

function groupByDate(items: { created_at: string }[]): { label: string; items: typeof items }[] {
  const groups: Record<string, typeof items> = {};
  items.forEach((item) => {
    const date = new Date(item.created_at);
    let label = format(date, "MMMM d, yyyy");
    if (isToday(date)) label = "Today";
    else if (isYesterday(date)) label = "Yesterday";
    else if (isThisWeek(date)) label = format(date, "EEEE");
    else if (isThisMonth(date)) label = format(date, "MMMM d");
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  });
  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

type Tab = "deals" | "activity";

export default function HistoryPage() {
  const { data: deals = [], isLoading: dealsLoading } = useDeals();
  const { data: auditLogs = [], isLoading: logsLoading } = useAuditLogs();
  const [tab, setTab] = useState<Tab>("deals");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const filteredDeals = useMemo(() => {
    let list = deals;
    if (statusFilter !== "all") list = list.filter((d) => d.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.deal_id.toLowerCase().includes(q) ||
          d.buyer_telegram.toLowerCase().includes(q) ||
          d.seller_telegram.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [deals, statusFilter, search]);

  const dealGroups = useMemo(() => groupByDate(filteredDeals), [filteredDeals]);

  const filteredLogs = useMemo(() => {
    if (!search) return auditLogs;
    const q = search.toLowerCase();
    return auditLogs.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        l.actor.toLowerCase().includes(q) ||
        (l.deal_id && l.deal_id.toLowerCase().includes(q))
    );
  }, [auditLogs, search]);

  const logGroups = useMemo(() => groupByDate(filteredLogs), [filteredLogs]);

  // Stats
  const totalVolume = deals.reduce((s, d) => s + d.amount, 0);
  const completedCount = deals.filter((d) => d.status === "completed").length;
  const disputeCount = deals.filter((d) => d.status === "disputed").length;

  const isLoading = tab === "deals" ? dealsLoading : logsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <History className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">History</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Complete transaction history & activity log</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in">
        {[
          { label: "Total Deals", value: deals.length, icon: ArrowLeftRight, color: "text-primary" },
          { label: "Volume", value: `₦${totalVolume.toLocaleString()}`, icon: Wallet, color: "text-primary" },
          { label: "Completed", value: completedCount, icon: CheckCircle2, color: "text-status-completed" },
          { label: "Disputes", value: disputeCount, icon: AlertTriangle, color: "text-status-disputed" },
        ].map((stat) => (
          <div key={stat.label} className="glass-card p-4 stat-card-hover group">
            <stat.icon className={`w-4 h-4 ${stat.color} mb-2 transition-transform group-hover:scale-110`} />
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-border pb-0">
        {[
          { id: "deals" as Tab, label: "Deal History", count: deals.length },
          { id: "activity" as Tab, label: "Activity Log", count: auditLogs.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "pb-3 text-sm font-medium border-b-2 transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            <span className={cn(
              "ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold",
              tab === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 animate-fade-in">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={tab === "deals" ? "Search deals..." : "Search activity..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        {tab === "deals" && (
          <div className="flex gap-1.5 flex-wrap">
            {["all", "pending", "funded", "completed", "disputed"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-medium transition-colors capitalize",
                  statusFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="glass-card p-12 text-center">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Loading history...</p>
        </div>
      ) : tab === "deals" ? (
        /* ---- Deal Timeline ---- */
        <div className="space-y-4">
          {dealGroups.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <History className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No deals found</p>
              <p className="text-sm text-muted-foreground mt-1">Transactions will appear here</p>
            </div>
          ) : (
            dealGroups.map((group) => {
              const isCollapsed = expandedGroups.has(group.label);
              return (
                <div key={group.label} className="animate-fade-in">
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="flex items-center gap-2 mb-3 group w-full text-left"
                  >
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </span>
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                      {group.items.length}
                    </span>
                    <div className="flex-1 h-px bg-border ml-2" />
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </button>

                  {!isCollapsed && (
                    <div className="space-y-2 ml-1 border-l-2 border-border pl-4">
                      {(group.items as Deal[]).map((deal) => (
                        <button
                          key={deal.id}
                          onClick={() => setSelectedDeal(deal)}
                          className="glass-card w-full p-4 text-left stat-card-hover group/card"
                        >
                          <div className="flex items-start gap-3">
                            {/* Timeline dot */}
                            <div className="mt-1 -ml-[26px] w-3 h-3 rounded-full bg-card border-2 border-border flex-shrink-0 group-hover/card:border-primary transition-colors" />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-semibold text-sm truncate">{deal.description}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="font-mono text-[11px] text-muted-foreground">{deal.deal_id}</span>
                                    <span className="text-muted-foreground">·</span>
                                    <span className="text-[11px] text-muted-foreground">
                                      {formatDistanceToNow(new Date(deal.created_at), { addSuffix: true })}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <StatusBadge status={deal.status} />
                                </div>
                              </div>

                              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <ArrowUpRight className="w-3 h-3" />
                                    {deal.buyer_telegram}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <ArrowDownLeft className="w-3 h-3" />
                                    {deal.seller_telegram}
                                  </span>
                                </div>
                                <span className="font-bold text-sm">₦{deal.amount.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* ---- Activity Log ---- */
        <div className="space-y-4">
          {logGroups.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <History className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No activity yet</p>
              <p className="text-sm text-muted-foreground mt-1">Actions will be logged here</p>
            </div>
          ) : (
            logGroups.map((group) => (
              <div key={group.label} className="animate-fade-in">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                  <div className="flex-1 h-px bg-border ml-2" />
                </div>

                <div className="space-y-1.5 ml-1 border-l-2 border-border pl-4">
                  {group.items.map((log: any) => {
                    const ai = actionIcon[log.action] || { icon: <Clock className="w-3.5 h-3.5" />, color: "bg-muted text-muted-foreground" };
                    return (
                      <div
                        key={log.id}
                        className="glass-card p-3.5 flex items-center gap-3 stat-card-hover"
                      >
                        <div className="-ml-[22px] flex-shrink-0">
                          <div className={cn("w-7 h-7 rounded-full flex items-center justify-center", ai.color)}>
                            {ai.icon}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium capitalize">
                            {log.action.replace(/_/g, " ")}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-muted-foreground">{log.actor}</span>
                            {log.deal_id && (
                              <>
                                <span className="text-muted-foreground">·</span>
                                <span className="font-mono text-[11px] text-muted-foreground">{log.deal_id}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground flex-shrink-0">
                          {format(new Date(log.created_at), "HH:mm")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <DealDetailModal deal={selectedDeal} open={!!selectedDeal} onClose={() => setSelectedDeal(null)} />
    </div>
  );
}
