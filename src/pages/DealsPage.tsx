import { useDeals } from "@/hooks/use-deals";
import DealsTable from "@/components/DealsTable";

export default function DealsPage() {
  const { data: deals = [], isLoading } = useDeals();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">All Deals</h2>
        <p className="text-muted-foreground text-sm mt-1">View and manage all escrow transactions</p>
      </div>
      {isLoading ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Loading deals...</div>
      ) : (
        <DealsTable deals={deals} />
      )}
    </div>
  );
}
