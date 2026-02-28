import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";

export type Deal = Tables<"deals">;
export type DealStatus = "pending" | "accepted" | "funded" | "completed" | "disputed" | "refunded";

export function useDeals() {
  const queryClient = useQueryClient();

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("deals-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => {
        queryClient.invalidateQueries({ queryKey: ["deals"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Deal[];
    },
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, updates }: { dealId: string; updates: Partial<Deal> }) => {
      const { error } = await supabase
        .from("deals")
        .update(updates)
        .eq("deal_id", dealId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
  });
}

export function useAuditLog() {
  return useMutation({
    mutationFn: async (log: { deal_id?: string; action: string; actor?: string; details?: Record<string, unknown> }) => {
      const { error } = await supabase.from("audit_logs").insert([{
        deal_id: log.deal_id || null,
        action: log.action,
        actor: log.actor || "admin",
        details: (log.details || {}) as unknown as import("@/integrations/supabase/types").Json,
      }]);
      if (error) throw error;
    },
  });
}

export function useAuditLogs(dealId?: string) {
  return useQuery({
    queryKey: ["audit_logs", dealId],
    queryFn: async () => {
      let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false });
      if (dealId) query = query.eq("deal_id", dealId);
      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data;
    },
  });
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: ["platform_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("*");
      if (error) throw error;
      const settings: Record<string, string> = {};
      data.forEach((s) => { settings[s.key] = s.value; });
      return settings;
    },
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from("platform_settings")
        .update({ value })
        .eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform_settings"] }),
  });
}

export function getAnalytics(deals: Deal[]) {
  const totalVolume = deals.reduce((s, d) => s + d.amount, 0);
  const totalFees = deals.filter(d => d.status === "completed").reduce((s, d) => s + d.fee, 0);
  const completed = deals.filter(d => d.status === "completed").length;
  const disputed = deals.filter(d => d.status === "disputed").length;
  const funded = deals.filter(d => d.status === "funded").length;
  const pending = deals.filter(d => d.status === "pending").length;
  const accepted = deals.filter(d => d.status === "accepted").length;
  return { totalVolume, totalFees, completed, disputed, funded, pending, accepted, total: deals.length };
}
