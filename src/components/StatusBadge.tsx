import type { DealStatus } from "@/hooks/use-deals";
import { cn } from "@/lib/utils";

const config: Record<string, { label: string; className: string }> = {
  pending: { label: "Awaiting Seller", className: "status-badge-pending" },
  accepted: { label: "Awaiting Payment", className: "status-badge-pending" },
  funded: { label: "Funded", className: "status-badge-funded" },
  completed: { label: "Completed", className: "status-badge-completed" },
  disputed: { label: "Disputed", className: "status-badge-disputed" },
  refunded: { label: "Refunded", className: "status-badge-disputed" },
};

export default function StatusBadge({ status }: { status: string }) {
  const { label, className } = config[status] || { label: status, className: "status-badge-pending" };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold", className)}>
      {label}
    </span>
  );
}
