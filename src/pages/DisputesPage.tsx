import { useDeals, useAuditLogs } from "@/hooks/use-deals";
import type { Deal } from "@/hooks/use-deals";
import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, XCircle, Loader2, Eye, Clock, MessageSquare, Image, ChevronRight, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import StatusBadge from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-medium text-right max-w-[200px] truncate", mono && "font-mono")}>{value}</span>
    </div>
  );
}

export default function DisputesPage() {
  const { data: deals = [], isLoading } = useDeals();
  const { toast } = useToast();
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [resolving, setResolving] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [dealLogs, setDealLogs] = useState<any[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  const disputes = deals.filter((d) => d.status === "disputed");
  const resolved = deals.filter((d) => d.dispute_resolution && d.status === "completed");

  // Load evidence and logs when a deal is selected
  useEffect(() => {
    if (!selectedDeal) return;
    setLoadingEvidence(true);
    setEvidenceUrls([]);
    setDealLogs([]);

    // Fetch evidence files
    supabase.storage.from("dispute-evidence").list(selectedDeal.deal_id).then(({ data }) => {
      if (data && data.length > 0) {
        const urls = data.map(f => {
          const { data: urlData } = supabase.storage.from("dispute-evidence").getPublicUrl(`${selectedDeal.deal_id}/${f.name}`);
          return urlData.publicUrl;
        });
        setEvidenceUrls(urls);
      }
      setLoadingEvidence(false);
    });

    // Fetch audit logs for this deal
    supabase.from("audit_logs").select("*").eq("deal_id", selectedDeal.deal_id).order("created_at", { ascending: true }).then(({ data }) => {
      setDealLogs(data || []);
    });
  }, [selectedDeal]);

  const handleResolve = async (resolution: "release_to_seller" | "refund_buyer") => {
    if (!selectedDeal) return;
    try {
      setResolving(true);
      const { error } = await supabase.functions.invoke("resolve-dispute", {
        body: { deal_id: selectedDeal.deal_id, resolution },
      });
      if (error) throw error;

      // Log admin note if provided
      if (adminNote.trim()) {
        await supabase.from("audit_logs").insert([{
          deal_id: selectedDeal.deal_id,
          action: "admin_note",
          actor: "admin",
          details: { note: adminNote.trim(), resolution },
        }]);
      }

      const sellerAmount = selectedDeal.amount - selectedDeal.fee;
      toast({
        title: "Dispute resolved",
        description: `${selectedDeal.deal_id} — ${resolution === "refund_buyer" ? "Refunded to buyer" : "Released ₦" + sellerAmount.toLocaleString() + " to seller"}`,
      });
      setSelectedDeal(null);
      setAdminNote("");
    } catch {
      toast({ title: "Error", description: "Failed to resolve dispute.", variant: "destructive" });
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[hsl(var(--status-disputed)/0.1)] flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-status-disputed" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dispute Center</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {disputes.length} active dispute{disputes.length !== 1 ? "s" : ""} · {resolved.length} resolved
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active", value: disputes.length, color: "text-status-disputed", bg: "bg-[hsl(var(--status-disputed)/0.1)]" },
          { label: "Resolved", value: resolved.length, color: "text-status-completed", bg: "bg-[hsl(var(--status-completed)/0.1)]" },
          { label: "Refunded", value: resolved.filter(d => d.dispute_resolution === "refund_buyer").length, color: "text-status-funded", bg: "bg-[hsl(var(--status-funded)/0.1)]" },
          { label: "Released", value: resolved.filter(d => d.dispute_resolution === "release_to_seller").length, color: "text-status-completed", bg: "bg-[hsl(var(--status-completed)/0.1)]" },
        ].map(s => (
          <div key={s.label} className="glass-card p-4 text-center stat-card-hover group">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Active Disputes */}
      {isLoading ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading disputes...
        </div>
      ) : disputes.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Shield className="w-10 h-10 text-status-completed mx-auto mb-3" />
          <p className="font-semibold text-lg">All Clear</p>
          <p className="text-sm text-muted-foreground mt-1">No active disputes. Everything is running smoothly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Disputes</h3>
          {disputes.map((deal, i) => (
            <button
              key={deal.id}
              onClick={() => setSelectedDeal(deal)}
              className="glass-card w-full p-5 text-left stat-card-hover group animate-fade-in-up opacity-0"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-status-disputed flex-shrink-0" />
                    <span className="font-mono text-sm font-semibold">{deal.deal_id}</span>
                    <StatusBadge status={deal.status} />
                  </div>
                  <p className="text-sm truncate mt-1">{deal.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>Buyer: {deal.buyer_telegram}</span>
                    <span>Seller: {deal.seller_telegram}</span>
                  </div>
                  {deal.dispute_reason && (
                    <div className="mt-2 p-2 rounded-lg bg-[hsl(var(--status-disputed)/0.05)] border border-[hsl(var(--status-disputed)/0.1)]">
                      <p className="text-xs text-status-disputed"><MessageSquare className="w-3 h-3 inline mr-1" />{deal.dispute_reason}</p>
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-lg">₦{deal.amount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(deal.created_at), { addSuffix: true })}
                  </p>
                  <ChevronRight className="w-4 h-4 text-muted-foreground mt-2 ml-auto group-hover:text-foreground transition-colors" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Recently Resolved */}
      {resolved.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recently Resolved</h3>
          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Deal</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Parties</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Resolution</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">When</th>
                </tr>
              </thead>
              <tbody>
                {resolved.slice(0, 10).map(d => (
                  <tr key={d.id} onClick={() => setSelectedDeal(d)} className="border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs">{d.deal_id}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">{d.buyer_telegram} ↔ {d.seller_telegram}</td>
                    <td className="px-4 py-2.5 text-right font-medium">₦{d.amount.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full",
                        d.dispute_resolution === "refund_buyer" ? "status-badge-disputed" : "status-badge-completed"
                      )}>
                        {d.dispute_resolution === "refund_buyer" ? "Refunded" : "Released"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground hidden md:table-cell">
                      {d.dispute_resolved_at ? format(new Date(d.dispute_resolved_at), "MMM d") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedDeal} onOpenChange={() => { setSelectedDeal(null); setAdminNote(""); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedDeal && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <span className="font-mono text-base">{selectedDeal.deal_id}</span>
                  <StatusBadge status={selectedDeal.status} />
                </DialogTitle>
              </DialogHeader>

              {/* Deal Info */}
              <div className="mt-2">
                <Row label="Description" value={selectedDeal.description} />
                <Row label="Buyer" value={selectedDeal.buyer_telegram} mono />
                <Row label="Seller" value={selectedDeal.seller_telegram} mono />
                <Row label="Amount" value={`₦${selectedDeal.amount.toLocaleString()}`} />
                <Row label="Fee" value={`₦${selectedDeal.fee.toLocaleString()}`} />
                <Row label="Seller Receives" value={`₦${(selectedDeal.amount - selectedDeal.fee).toLocaleString()}`} />
                {selectedDeal.payment_ref && <Row label="Payment Ref" value={selectedDeal.payment_ref} mono />}
                <Row label="Created" value={format(new Date(selectedDeal.created_at), "MMM d, yyyy HH:mm")} />
                {selectedDeal.funded_at && <Row label="Funded" value={format(new Date(selectedDeal.funded_at), "MMM d, yyyy HH:mm")} />}
                {selectedDeal.dispute_reason && <Row label="Dispute Reason" value={selectedDeal.dispute_reason} />}
                {selectedDeal.dispute_resolution && <Row label="Resolution" value={selectedDeal.dispute_resolution.replace(/_/g, " ")} />}
              </div>

              {/* Evidence */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5" /> Evidence ({evidenceUrls.length})
                </h4>
                {loadingEvidence ? (
                  <div className="text-xs text-muted-foreground">Loading evidence...</div>
                ) : evidenceUrls.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {evidenceUrls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-border hover:border-primary transition-colors">
                        <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-24 object-cover" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No evidence uploaded</p>
                )}
              </div>

              {/* Timeline */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Deal Timeline
                </h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {dealLogs.map(log => (
                    <div key={log.id} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      <span className="text-xs capitalize flex-1">{log.action.replace(/_/g, " ")}</span>
                      <span className="text-[10px] text-muted-foreground">{log.actor}</span>
                      <span className="text-[10px] text-muted-foreground">{format(new Date(log.created_at), "HH:mm")}</span>
                    </div>
                  ))}
                  {dealLogs.length === 0 && <p className="text-xs text-muted-foreground">No activity logged</p>}
                </div>
              </div>

              {/* Admin Note + Actions */}
              {selectedDeal.status === "disputed" && (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin Note (optional)</label>
                    <Textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      placeholder="Internal note about this resolution..."
                      className="mt-1.5 h-20 text-sm"
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => handleResolve("release_to_seller")}
                      className="flex-1 bg-[hsl(var(--status-completed))] hover:bg-[hsl(var(--status-completed)/0.9)] text-primary-foreground"
                      disabled={resolving}
                    >
                      {resolving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                      Release to Seller
                    </Button>
                    <Button
                      onClick={() => handleResolve("refund_buyer")}
                      variant="destructive"
                      className="flex-1"
                      disabled={resolving}
                    >
                      {resolving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <XCircle className="w-4 h-4 mr-1.5" />}
                      Refund Buyer
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
