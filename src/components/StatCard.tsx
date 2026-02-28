import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  iconClassName?: string;
  delay?: number;
}

export default function StatCard({ title, value, subtitle, icon: Icon, iconClassName, delay = 0 }: Props) {
  return (
    <div
      className="glass-card p-5 stat-card-hover animate-fade-in-up opacity-0 group cursor-default"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-[26px] font-bold tracking-tight mt-1.5 animate-count-up">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110",
          iconClassName || "bg-primary/10"
        )}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
