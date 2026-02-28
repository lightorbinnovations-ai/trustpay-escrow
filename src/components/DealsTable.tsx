import { useState, useMemo } from "react";
import type { Deal } from "@/hooks/use-deals";
import StatusBadge from "./StatusBadge";
import DealDetailModal from "./DealDetailModal";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DealStatus } from "@/hooks/use-deals";

interface Props {
  deals: Deal[];
  defaultFilter?: DealStatus;
}

const filters: { label: string; value: DealStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Funded", value: "funded" },
  { label: "Completed", value: "completed" },
  { label: "Disputed", value: "disputed" },
];

export default function DealsTable({ deals, defaultFilter }: Props) {
  const [filter, setFilter] = useState<DealStatus | "all">(defaultFilter || "all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Deal | null>(null);

  const filtered = useMemo(() => {
    let list = deals;
    if (filter !== "all") list = list.filter((d) => d.status === filter);
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
  }, [deals, filter, search]);

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search deals..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Deal ID</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Buyer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Seller</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((deal) => (
                <tr key={deal.id} onClick={() => setSelected(deal)} className="border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-xs">{deal.deal_id}</td>
                  <td className="px-4 py-3 max-w-[180px] truncate">{deal.description}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{deal.buyer_telegram}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{deal.seller_telegram}</td>
                  <td className="px-4 py-3 text-right font-medium">₦{deal.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={deal.status} /></td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">{format(new Date(deal.created_at), "MMM d")}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No deals found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DealDetailModal deal={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
