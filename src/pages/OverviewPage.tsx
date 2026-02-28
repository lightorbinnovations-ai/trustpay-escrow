import { useDeals, getAnalytics, usePlatformSettings, useAuditLogs } from "@/hooks/use-deals";
import StatCard from "@/components/StatCard";
import DealsTable from "@/components/DealsTable";
import { TrendingUp, AlertTriangle, Wallet, ArrowLeftRight, Clock, CheckCircle2, Activity, ArrowUpRight, Shield, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const actionConfig: Record<string, { label: string; color: string }> = {
  deal_created: { label: "Deal Created", color: "text-primary" },
  deal_accepted: { label: "Deal Accepted", color: "text-status-pending" },
  payment_confirmed: { label: "Payment Confirmed", color: "text-status-funded" },
  delivery_marked: { label: "Delivery Marked", color: "text-status-funded" },
  delivery_confirmed: { label: "Receipt Confirmed", color: "text-status-completed" },
  transfer_initiated: { label: "Transfer Initiated", color: "text-status-funded" },
  transfer_completed: { label: "Transfer Complete", color: "text-status-completed" },
  dispute_opened: { label: "Dispute Opened", color: "text-status-disputed" },
  dispute_resolved_release_to_seller: { label: "Dispute → Released", color: "text-status-completed" },
  dispute_resolved_refund_buyer: { label: "Dispute → Refunded", color: "text-status-disputed" },
  auto_released: { label: "Auto-Released (48h)", color: "text-status-pending" },
  deal_cancelled: { label: "Deal Cancelled", color: "text-muted-foreground" },
  deal_cancelled_refund: { label: "Cancelled + Refund", color: "text-status-disputed" },
  deal_declined: { label: "Deal Declined", color: "text-muted-foreground" },
  admin_note: { label: "Admin Note", color: "text-primary" },
  settings_updated: { label: "Settings Updated", color: "text-muted-foreground" },
};

export default function OverviewPage() {
  const { data: deals = [], isLoading } = useDeals();
  const { data: settings } = usePlatformSettings();
  const { data: recentLogs = [], isLoading: logsLoading } = useAuditLogs();
  const stats = getAnalytics(deals);
  const adminName = settings?.admin_name || "Admin";

  // Top traders
  const traderCounts: Record<string, number> = {};
  deals.forEach(d => {
    traderCounts[d.buyer_telegram] = (traderCounts[d.buyer_telegram] || 0) + 1;
    traderCounts[d.seller_telegram] = (traderCounts[d.seller_telegram] || 0) + 1;
  });
  const topTraders = Object.entries(traderCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Success rate
  const successRate = stats.total > 0 ? Math.round(((stats.completed) / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="animate-fade-in">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground text-sm mt-1">Welcome back, {adminName}. Here's what's happening.</p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Volume" value={`₦${stats.totalVolume.toLocaleString()}`} subtitle={`${stats.total} deal${stats.total !== 1 ? "s" : ""}`} icon={Wallet} iconClassName="bg-primary/10 text-primary" delay={0} />
        <StatCard title="Fees Earned" value={`₦${stats.totalFees.toLocaleString()}`} subtitle={`From ${stats.completed} completed`} icon={TrendingUp} iconClassName="bg-[hsl(var(--status-completed)/0.1)] text-status-completed" delay={80} />
        <StatCard title="Success Rate" value={`${successRate}%`} subtitle={`${stats.completed}/${stats.total} deals`} icon={CheckCircle2} iconClassName="bg-[hsl(var(--status-completed)/0.1)] text-status-completed" delay={160} />
        <StatCard title="Active Disputes" value={String(stats.disputed)} subtitle={stats.disputed > 0 ? "⚡ Needs attention" : "All clear"} icon={AlertTriangle} iconClassName="bg-[hsl(var(--status-disputed)/0.1)] text-status-disputed" delay={240} />
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { icon: Clock, value: stats.pending, label: "Pending", color: "text-status-pending" },
          { icon: ArrowUpRight, value: stats.accepted, label: "Accepted", color: "text-status-pending" },
          { icon: ArrowLeftRight, value: stats.funded, label: "Funded", color: "text-status-funded" },
          { icon: CheckCircle2, value: stats.completed, label: "Completed", color: "text-status-completed" },
          { icon: AlertTriangle, value: stats.disputed, label: "Disputed", color: "text-status-disputed" },
        ].map((item, i) => (
          <div
            key={item.label}
            className="glass-card p-4 text-center stat-card-hover animate-fade-in-up opacity-0 group"
            style={{ animationDelay: `${320 + i * 60}ms`, animationFillMode: "both" }}
          >
            <item.icon className={`w-5 h-5 ${item.color} mx-auto mb-2 transition-transform duration-300 group-hover:scale-110`} />
            <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Real-time Activity Feed */}
        <div className="lg:col-span-3 animate-fade-in-up opacity-0" style={{ animationDelay: "600ms", animationFillMode: "both" }}>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Live Activity Feed</h3>
            <div className="w-2 h-2 rounded-full bg-[hsl(var(--status-completed))] animate-pulse ml-1" />
          </div>
          <div className="glass-card divide-y divide-border/50 max-h-[400px] overflow-y-auto">
            {logsLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading...
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No activity yet</div>
            ) : (
              recentLogs.slice(0, 20).map((log: any, i: number) => {
                const config = actionConfig[log.action] || { label: log.action.replace(/_/g, " "), color: "text-muted-foreground" };
                const details = log.details || {};
                return (
                  <div key={log.id} className="px-4 py-3 hover:bg-muted/30 transition-colors animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-semibold capitalize", config.color)}>{config.label}</span>
                          {log.deal_id && <span className="font-mono text-[10px] text-muted-foreground">{log.deal_id}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">{log.actor}</span>
                          {details.amount && <span className="text-[11px] text-muted-foreground">· ₦{Number(details.amount).toLocaleString()}</span>}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Quick Info Panel */}
        <div className="lg:col-span-2 space-y-4 animate-fade-in-up opacity-0" style={{ animationDelay: "700ms", animationFillMode: "both" }}>
          {/* Top Traders */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Top Traders
            </h3>
            <div className="glass-card divide-y divide-border/50">
              {topTraders.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">No traders yet</div>
              ) : (
                topTraders.map(([name, count], i) => (
                  <div key={name} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="text-xs font-medium flex-1 truncate">{name}</span>
                    <span className="text-xs text-muted-foreground">{count} deals</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {deals.filter(d => d.status === "disputed").length > 0 && (
                <div className="glass-card p-3 border-l-2 border-[hsl(var(--status-disputed))]">
                  <p className="text-xs font-semibold text-status-disputed">⚠️ {deals.filter(d => d.status === "disputed").length} dispute(s) need resolution</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Go to Disputes page to review</p>
                </div>
              )}
              {deals.filter(d => d.status === "completed" && !d.transfer_ref && d.dispute_resolution !== "declined_by_seller" && d.dispute_resolution !== "cancelled_by_buyer").length > 0 && (
                <div className="glass-card p-3 border-l-2 border-[hsl(var(--status-funded))]">
                  <p className="text-xs font-semibold text-status-funded">💰 {deals.filter(d => d.status === "completed" && !d.transfer_ref && d.dispute_resolution !== "declined_by_seller" && d.dispute_resolution !== "cancelled_by_buyer").length} deal(s) may need manual payout</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Sellers without registered bank accounts</p>
                </div>
              )}
              {deals.filter(d => d.status === "funded").length > 0 && (
                <div className="glass-card p-3 border-l-2 border-primary">
                  <p className="text-xs font-semibold text-primary">🔵 {deals.filter(d => d.status === "funded").length} funded deal(s) in progress</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Waiting for delivery or confirmation</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Deals Table */}
      <div className="animate-fade-in-up opacity-0" style={{ animationDelay: "800ms", animationFillMode: "both" }}>
        <h3 className="text-lg font-semibold mb-3">Recent Deals</h3>
        {isLoading ? (
          <div className="glass-card p-8 text-center text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2" />
            Loading deals...
          </div>
        ) : (
          <DealsTable deals={deals.slice(0, 10)} />
        )}
      </div>
    </div>
  );
}
