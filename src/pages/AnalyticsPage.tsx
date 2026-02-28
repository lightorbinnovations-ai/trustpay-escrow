import { useDeals, getAnalytics } from "@/hooks/use-deals";
import StatCard from "@/components/StatCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Wallet, TrendingUp, CheckCircle2, AlertTriangle } from "lucide-react";

const PIE_COLORS = [
  "hsl(38, 92%, 50%)",
  "hsl(217, 91%, 60%)",
  "hsl(160, 84%, 39%)",
  "hsl(0, 72%, 51%)",
];

const tooltipStyle = {
  backgroundColor: "hsl(0,0%,100%)",
  border: "1px solid hsl(220,13%,90%)",
  borderRadius: 10,
  fontSize: 12,
  fontFamily: "Poppins",
};

export default function AnalyticsPage() {
  const { data: deals = [] } = useDeals();
  const stats = getAnalytics(deals);

  const pieData = [
    { name: "Pending", value: stats.pending },
    { name: "Funded", value: stats.funded },
    { name: "Completed", value: stats.completed },
    { name: "Disputed", value: stats.disputed },
  ];

  const dailyMap = new Map<string, number>();
  const feeMap = new Map<string, number>();
  deals.filter(d => d.status === "completed").forEach(d => {
    const day = d.created_at.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    feeMap.set(day, (feeMap.get(day) || 0) + d.fee);
  });

  const lineData = Array.from(dailyMap.entries()).sort().slice(-7).map(([date, count]) => ({ date: date.slice(5), deals: count }));
  const barData = Array.from(feeMap.entries()).sort().slice(-7).map(([date, fee]) => ({ date: date.slice(5), fees: fee }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <p className="text-muted-foreground text-sm mt-1">Performance metrics and insights</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Volume" value={`₦${stats.totalVolume.toLocaleString()}`} icon={Wallet} iconClassName="bg-primary/10 text-primary" />
        <StatCard title="Fees Earned" value={`₦${stats.totalFees.toLocaleString()}`} icon={TrendingUp} iconClassName="bg-status-completed/10 text-status-completed" />
        <StatCard title="Completed" value={String(stats.completed)} icon={CheckCircle2} iconClassName="bg-status-completed/10 text-status-completed" />
        <StatCard title="Disputes" value={String(stats.disputed)} icon={AlertTriangle} iconClassName="bg-status-disputed/10 text-status-disputed" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5 animate-fade-in">
          <h3 className="text-sm font-semibold mb-4">Daily Completed Deals</h3>
          {lineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,90%)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(220,9%,44%)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(220,9%,44%)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="deals" stroke="hsl(224,71%,40%)" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(224,71%,40%)" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No completed deals yet</div>
          )}
        </div>

        <div className="glass-card p-5 animate-fade-in">
          <h3 className="text-sm font-semibold mb-4">Deal Status Distribution</h3>
          {stats.total > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No deals yet</div>
          )}
        </div>
      </div>

      <div className="glass-card p-5 animate-fade-in">
        <h3 className="text-sm font-semibold mb-4">Fees Earned (Last 7 Days)</h3>
        {barData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,90%)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(220,9%,44%)" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(220,9%,44%)" />
              <Tooltip contentStyle={tooltipStyle} formatter={(val: number) => [`₦${val.toLocaleString()}`, "Fees"]} />
              <Bar dataKey="fees" fill="hsl(38,92%,50%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No fee data yet</div>
        )}
      </div>
    </div>
  );
}
