import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface Transaction {
  id: string;
  listing_id: string | null;
  buyer_telegram_id: number;
  seller_telegram_id: number;
  amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string | null;
  city: string | null;
  seller_telegram_id: number;
  status: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  recipient_telegram_id: number;
  sender_telegram_id: number | null;
  title: string;
  message: string;
  type: string;
  listing_id: string | null;
  is_read: boolean;
  created_at: string;
}

export function useTransactions() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("transactions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Transaction[];
    },
  });
}

export function useListings() {
  return useQuery({
    queryKey: ["listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Listing[];
    },
  });
}

export function useMarketNotifications() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("notifications-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        queryClient.invalidateQueries({ queryKey: ["market_notifications"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ["market_notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Notification[];
    },
  });
}

export function getTransactionAnalytics(transactions: Transaction[]) {
  const totalVolume = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const paid = transactions.filter(t => t.status === "paid").length;
  const released = transactions.filter(t => t.status === "released").length;
  const disputed = transactions.filter(t => t.status === "disputed").length;
  const pending = transactions.filter(t => t.status === "pending").length;
  const refunded = transactions.filter(t => t.status === "refunded").length;
  return { totalVolume, paid, released, disputed, pending, refunded, total: transactions.length };
}
