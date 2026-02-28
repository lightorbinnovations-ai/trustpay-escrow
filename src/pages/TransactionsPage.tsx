import { useTransactions, useListings, getTransactionAnalytics } from "@/hooks/use-transactions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeftRight, Clock, CheckCircle2, AlertTriangle, Wallet, RefreshCw, Loader2 } from "lucide-react";
import { useState } from "react";

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "status-badge-pending" },
  paid: { label: "Paid", className: "status-badge-funded" },
  released: { label: "Released", className: "status-badge-completed" },
  disputed: { label: "Disputed", className: "status-badge-disputed" },
  refunded: { label: "Refunded", className: "status-badge-disputed" },
};

export default function TransactionsPage() {
  const { data: transactions = [], isLoading } = useTransactions();
  const { data: listings = [] } = useListings();
  const [filter, setFilter] = useState<string>("all");
  const stats = getTransactionAnalytics(transactions);

  const listingsMap = new Map(listings.map(l => [l.id, l]));

  const filtered = filter === "all" ? transactions : transactions.filter(t => t.status === filter);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Marketplace Transactions</h2>
        <p className="text-muted-foreground text-sm mt-1">Track escrow transactions from the TrustMarket bot</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Wallet, value: `₦${stats.totalVolume.toLocaleString()}`, label: "Volume", color: "text-primary" },
          { icon: Clock, value: stats.pending, label: "Pending", color: "text-status-pending" },
          { icon: ArrowLeftRight, value: stats.paid, label: "Paid", color: "text-status-funded" },
          { icon: CheckCircle2, value: stats.released, label: "Released", color: "text-status-completed" },
          { icon: AlertTriangle, value: stats.disputed, label: "Disputed", color: "text-status-disputed" },
          { icon: RefreshCw, value: stats.refunded, label: "Refunded", color: "text-muted-foreground" },
        ].map((item) => (
          <div key={item.label} className="glass-card p-3 text-center">
            <item.icon className={`w-4 h-4 ${item.color} mx-auto mb-1`} />
            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
            <p className="text-[10px] text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "pending", "paid", "released", "disputed", "refunded"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="glass-card p-8 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading transactions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground text-sm">No transactions found</div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Listing</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Buyer ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Seller ID</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filtered.map((tx) => {
                const listing = tx.listing_id ? listingsMap.get(tx.listing_id) : null;
                const sc = statusConfig[tx.status] || { label: tx.status, className: "status-badge-pending" };
                return (
                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-xs truncate max-w-[200px]">{listing?.title || "Unknown"}</p>
                      {listing?.category && <p className="text-[10px] text-muted-foreground">{listing.category}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{tx.buyer_telegram_id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{tx.seller_telegram_id}</td>
                    <td className="px-4 py-3 text-right font-semibold text-xs">₦{Number(tx.amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${sc.className}`}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
