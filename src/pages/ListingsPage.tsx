import { useListings } from "@/hooks/use-transactions";
import { useState } from "react";
import { Package, Tag, MapPin, ImageIcon, Search, ShoppingBag, CheckCircle2, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  active: { label: "Active", icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  sold: { label: "Sold", icon: ShoppingBag, className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  inactive: { label: "Inactive", icon: XCircle, className: "bg-muted text-muted-foreground border-border" },
  pending: { label: "Pending", icon: Clock, className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
};

export default function ListingsPage() {
  const { data: listings = [], isLoading } = useListings();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = listings.filter((l) => {
    if (filter !== "all" && l.status !== filter) return false;
    if (search && !l.title.toLowerCase().includes(search.toLowerCase()) && !l.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeCount = listings.filter((l) => l.status === "active").length;
  const soldCount = listings.filter((l) => l.status === "sold").length;
  const totalValue = listings.reduce((s, l) => s + Number(l.price), 0);
  const selected = listings.find((l) => l.id === selectedId) || null;

  const filters = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "sold", label: "Sold" },
    { value: "inactive", label: "Inactive" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Marketplace Listings</h2>
        <p className="text-muted-foreground text-sm mt-1">View and manage all TrustMarket listings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold">{listings.length}</p>
          <p className="text-xs text-muted-foreground">Total Listings</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{soldCount}</p>
          <p className="text-xs text-muted-foreground">Sold</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold">₦{totalValue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Total Value</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Search listings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Listings Grid */}
      {isLoading ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Loading listings...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">No listings found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((listing) => {
            const sc = statusConfig[listing.status] || statusConfig.pending;
            const StatusIcon = sc.icon;
            return (
              <div
                key={listing.id}
                onClick={() => setSelectedId(listing.id)}
                className="glass-card p-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{listing.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{listing.description || "No description"}</p>
                  </div>
                  <Badge variant="outline" className={`ml-2 shrink-0 text-[10px] ${sc.className}`}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {sc.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-bold text-foreground text-base">₦{Number(listing.price).toLocaleString()}</span>
                  {listing.category && (
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{listing.category}</span>
                  )}
                  {listing.city && (
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{listing.city}</span>
                  )}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Seller: {listing.seller_telegram_id} · {format(new Date(listing.created_at), "MMM d, yyyy")}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelectedId(null)}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  {selected.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant="outline" className={statusConfig[selected.status]?.className}>
                    {statusConfig[selected.status]?.label || selected.status}
                  </Badge>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Price</span>
                  <span className="text-sm font-semibold">₦{Number(selected.price).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Category</span>
                  <span className="text-sm font-medium">{selected.category || "—"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">City</span>
                  <span className="text-sm font-medium">{selected.city || "—"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Seller ID</span>
                  <span className="text-sm font-mono">{selected.seller_telegram_id}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-sm text-muted-foreground">Created</span>
                  <span className="text-sm font-medium">{format(new Date(selected.created_at), "MMM d, yyyy HH:mm")}</span>
                </div>
                {selected.description && (
                  <div className="py-2">
                    <span className="text-sm text-muted-foreground block mb-1">Description</span>
                    <p className="text-sm">{selected.description}</p>
                  </div>
                )}
                {selected.image_url && (
                  <div className="py-2">
                    <span className="text-sm text-muted-foreground block mb-1">Image</span>
                    <img src={selected.image_url} alt={selected.title} className="rounded-lg max-h-48 object-cover w-full" />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}