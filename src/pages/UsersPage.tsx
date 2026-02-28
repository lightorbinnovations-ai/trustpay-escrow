import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, UserCheck, Search, CreditCard, Star } from "lucide-react";
import StatCard from "@/components/StatCard";

interface BotUser {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  created_at: string;
}

interface UserProfile {
  telegram_username: string;
  telegram_chat_id: number | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  paystack_recipient_code: string | null;
  created_at: string;
}

interface DealStats {
  total: number;
  completed: number;
  avgRating: number | null;
  totalVolume: number;
}

export default function UsersPage() {
  const [botUsers, setBotUsers] = useState<BotUser[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<BotUser | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [dealStats, setDealStats] = useState<DealStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: users }, { data: profs }] = await Promise.all([
        supabase.from("bot_users").select("*").order("created_at", { ascending: false }),
        supabase.from("user_profiles").select("*"),
      ]);
      setBotUsers(users || []);
      setProfiles(profs || []);
      setLoading(false);
    }
    load();
  }, []);

  const profileMap = new Map(profiles.map((p) => [p.telegram_username?.toLowerCase(), p]));

  const filtered = botUsers.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.username?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      String(u.telegram_id).includes(q)
    );
  });

  const withProfile = botUsers.filter((u) => u.username && profileMap.has(u.username.toLowerCase()));
  const withBank = profiles.filter((p) => p.bank_name && p.account_number);

  async function openUser(user: BotUser) {
    setSelected(user);
    const prof = user.username ? profileMap.get(user.username.toLowerCase()) || null : null;
    setSelectedProfile(prof);

    if (user.username) {
      const handle = user.username;
      const [{ data: deals }, { data: ratings }] = await Promise.all([
        supabase.from("deals").select("amount, status").or(`buyer_telegram.eq.${handle},seller_telegram.eq.${handle}`),
        supabase.from("deal_ratings").select("rating").eq("rated_telegram", handle),
      ]);
      const completed = (deals || []).filter((d) => d.status === "completed").length;
      const totalVolume = (deals || []).reduce((s, d) => s + (d.amount || 0), 0);
      const avg = ratings?.length ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length : null;
      setDealStats({ total: deals?.length || 0, completed, avgRating: avg, totalVolume });
    } else {
      setDealStats(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Users</h2>
        <p className="text-muted-foreground text-sm">All registered bot users and profiles</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Users" value={String(botUsers.length)} icon={Users} />
        <StatCard title="With Profile" value={String(withProfile.length)} icon={UserCheck} />
        <StatCard title="Bank Linked" value={String(withBank.length)} icon={CreditCard} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-lg">Bot Users</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">Telegram ID</th>
                    <th className="pb-2 font-medium">Profile</th>
                    <th className="pb-2 font-medium">Bank</th>
                    <th className="pb-2 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((u) => {
                    const prof = u.username ? profileMap.get(u.username.toLowerCase()) : null;
                    return (
                      <tr
                        key={u.id}
                        onClick={() => openUser(u)}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-3">
                          <div>
                            <span className="font-medium text-foreground">{u.first_name || "—"}</span>
                            {u.username && (
                              <span className="ml-1.5 text-muted-foreground">@{u.username}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 font-mono text-xs text-muted-foreground">{u.telegram_id}</td>
                        <td className="py-3">
                          <Badge variant={prof ? "default" : "secondary"} className="text-xs">
                            {prof ? "Yes" : "No"}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {prof?.bank_name ? (
                            <span className="text-xs text-foreground">{prof.bank_name}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selected?.first_name || "User"}{" "}
              {selected?.username && <span className="text-muted-foreground font-normal">@{selected.username}</span>}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Telegram ID</p>
                  <p className="font-mono">{selected.telegram_id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Joined</p>
                  <p>{new Date(selected.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {selectedProfile && (
                <>
                  <div className="border-t border-border pt-3">
                    <p className="font-medium text-foreground mb-2">Bank Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-muted-foreground text-xs">Bank</p>
                        <p>{selectedProfile.bank_name || "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Account #</p>
                        <p className="font-mono">{selectedProfile.account_number || "—"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-xs">Account Name</p>
                        <p>{selectedProfile.account_name || "—"}</p>
                      </div>
                    </div>
                  </div>
                  {selectedProfile.paystack_recipient_code && (
                    <div>
                      <p className="text-muted-foreground text-xs">Paystack Recipient</p>
                      <p className="font-mono text-xs">{selectedProfile.paystack_recipient_code}</p>
                    </div>
                  )}
                </>
              )}

              {dealStats && (
                <div className="border-t border-border pt-3">
                  <p className="font-medium text-foreground mb-2">Deal Activity</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-muted-foreground text-xs">Total Deals</p>
                      <p>{dealStats.total}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Completed</p>
                      <p>{dealStats.completed}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Volume</p>
                      <p>₦{dealStats.totalVolume.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs flex items-center gap-1">
                        Rating <Star className="w-3 h-3" />
                      </p>
                      <p>{dealStats.avgRating ? dealStats.avgRating.toFixed(1) + " / 5" : "No ratings"}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
