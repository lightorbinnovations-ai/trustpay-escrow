import { forwardRef } from "react";
import type { Deal } from "@/hooks/use-deals";
import StatusBadge from "./StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props { deal: Deal | null; open: boolean; onClose: () => void; }

const Row = forwardRef<HTMLDivElement, { label: string; value: string }>(({ label, value }, ref) => (
  <div ref={ref} className="flex justify-between py-2.5 border-b border-border last:border-0">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-right max-w-[200px] truncate">{value}</span>
  </div>
));
Row.displayName = "Row";

export default function DealDetailModal({ deal, open, onClose }: Props) {
  const { toast } = useToast();
  const [resolving, setResolving] = useState(false);

  if (!deal) return null;

  const handleResolve = async (resolution: "release_to_seller" | "refund_buyer") => {
    try {
      setResolving(true);

      // Call the backend function which handles refunds/transfers + Telegram notifications
      const { data, error } = await supabase.functions.invoke("resolve-dispute", {
        body: { deal_id: deal.deal_id, resolution },
      });

      if (error) throw error;

      const sellerAmount = deal.amount - deal.fee;
      toast({
        title: "Dispute resolved",
        description: `Deal ${deal.deal_id} — ${resolution === "refund_buyer" ? "Refunded to buyer" : "Released to seller (₦" + sellerAmount.toLocaleString() + ")"}`,
      });
      setResolving(false);
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to resolve dispute.", variant: "destructive" });
      setResolving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-base">{deal.deal_id}</span>
            <StatusBadge status={deal.status} />
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <Row label="Description" value={deal.description} />
          <Row label="Buyer" value={deal.buyer_telegram} />
          <Row label="Seller" value={deal.seller_telegram} />
          <Row label="Amount" value={`₦${deal.amount.toLocaleString()}`} />
          <Row label="Platform Fee" value={`₦${deal.fee.toLocaleString()}`} />
          <Row label="Seller Receives" value={`₦${(deal.amount - deal.fee).toLocaleString()}`} />
          {deal.payment_ref && <Row label="Payment Ref" value={deal.payment_ref} />}
          {deal.transfer_ref && <Row label="Transfer Ref" value={deal.transfer_ref} />}
          <Row label="Created" value={format(new Date(deal.created_at), "MMM d, yyyy HH:mm")} />
          <Row label="Last Updated" value={format(new Date(deal.updated_at), "MMM d, yyyy HH:mm")} />
          {deal.funded_at && <Row label="Funded At" value={format(new Date(deal.funded_at), "MMM d, yyyy HH:mm")} />}
          {deal.completed_at && <Row label="Completed At" value={format(new Date(deal.completed_at), "MMM d, yyyy HH:mm")} />}
          {deal.dispute_reason && <Row label="Dispute Reason" value={deal.dispute_reason} />}
          {deal.dispute_resolution && <Row label="Resolution" value={deal.dispute_resolution.replace(/_/g, " ")} />}
          {(deal as any).refund_status && <Row label="Refund Status" value={(deal as any).refund_status.charAt(0).toUpperCase() + (deal as any).refund_status.slice(1)} />}
          {deal.dispute_resolved_at && <Row label="Resolved At" value={format(new Date(deal.dispute_resolved_at), "MMM d, yyyy HH:mm")} />}
        </div>

        {deal.status === "disputed" && (
          <div className="flex gap-3 mt-4">
            <Button
              onClick={() => handleResolve("release_to_seller")}
              className="flex-1 bg-status-completed hover:bg-status-completed/90 text-primary-foreground"
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
        )}
      </DialogContent>
    </Dialog>
  );
}
