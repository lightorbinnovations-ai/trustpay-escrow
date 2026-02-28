import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { marketSupabase } from "@/integrations/supabase/market-client";
import { Shield, Plus, List, AlertTriangle, CheckCircle, Clock, Loader2, ArrowLeft, Send, ChevronRight, Sparkles, Package, Bell, ShoppingCart, Store, TrendingUp, Wallet, ArrowDownLeft, ArrowUpRight, Settings, CreditCard, User, Menu, X, Home, FileText, Phone, HelpCircle, History, Star, MessageCircle, Mail, Upload, Camera, Zap, Search } from "lucide-react";

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            username?: string;
            first_name?: string;
            last_name?: string;
            photo_url?: string;
          };
          query_id?: string;
        };
        ready: () => void; close: () => void; expand: () => void;
        MainButton: { text: string; show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void; enable: () => void; disable: () => void; showProgress: (leaveActive?: boolean) => void; hideProgress: () => void };
        BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
        themeParams: { bg_color?: string; text_color?: string; hint_color?: string; button_color?: string; button_text_color?: string; secondary_bg_color?: string };
        colorScheme: "light" | "dark";
        HapticFeedback: { impactOccurred: (style: string) => void; notificationOccurred: (type: string) => void };
      };
    };
  }
}

type Deal = { id: string; deal_id: string; buyer_telegram: string; seller_telegram: string; amount: number; fee: number; description: string; status: string; created_at: string; paystack_payment_link: string | null; delivered_at: string | null; refund_status: string | null; dispute_reason: string | null; dispute_resolution: string | null; completed_at: string | null };
type View = "home" | "new-deal" | "my-deals" | "deal-detail" | "settings" | "raise-dispute" | "contact" | "faq" | "history";
type TelegramUser = { id: number; username: string; firstName: string; lastName?: string; photoUrl?: string };
type UserProfile = { bank_name: string | null; account_number: string | null; account_name: string | null; telegram_username: string };
type Rating = { id: string; deal_id: string; rater_telegram: string; rated_telegram: string; rating: number; comment: string; created_at: string };

function usernameMatch(a: string, b: string): boolean {
  return a.toLowerCase().replace(/^@/, "") === b.toLowerCase().replace(/^@/, "");
}

function PageTransition({ children, direction = "forward" }: { children: React.ReactNode; direction?: "forward" | "back" }) {
  return <div className={direction === "forward" ? "animate-slide-in-page" : "animate-slide-in-back"} style={{ animationFillMode: "both" }}>{children}</div>;
}

function StaggerItem({ children, index }: { children: React.ReactNode; index: number }) {
  return <div className="animate-fade-in-up opacity-0" style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}>{children}</div>;
}

export default function MiniAppPage() {
  const [view, setView] = useState<View>("home");
  const [tgUser, setTgUser] = useState<TelegramUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [sellerUsername, setSellerUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [successDeal, setSuccessDeal] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [homeDeals, setHomeDeals] = useState<Deal[]>([]);
  const [allUserDeals, setAllUserDeals] = useState<Deal[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Dispute form
  const [disputeDealId, setDisputeDealId] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeFile, setDisputeFile] = useState<File | null>(null);
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeSuccess, setDisputeSuccess] = useState(false);
  // Ratings
  const [ratingDealId, setRatingDealId] = useState("");
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [userRatings, setUserRatings] = useState<Rating[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; message: string; time: string; type: string; isRead: boolean }[]>([]);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [activeListingId, setActiveListingId] = useState<string | null>(null);

  const webApp = window.Telegram?.WebApp;
  const isDark = webApp?.colorScheme === "dark" || document.documentElement.classList.contains("dark");

  useEffect(() => {
    if (webApp) {
      webApp.ready();
      webApp.expand();
      const user = webApp.initDataUnsafe.user;
      if (user) {
        setTgUser({
          id: user.id,
          username: user.username || `user_${user.id}`,
          firstName: user.first_name || "User",
          lastName: user.last_name,
          photoUrl: user.photo_url,
        });

        // Handle deep link (start_param)
        const startParam = webApp.initDataUnsafe.start_param;
        if (startParam && startParam.startsWith('escrow_')) {
          const listingId = startParam.replace('escrow_', '');
          fetchMarketListing(listingId);
        }
      }
    }
  }, []);

  const fetchMarketListing = async (listingId: string) => {
    setLoading(true);
    try {
      // Fetch listing details from Market DB
      const { data: listing, error: listingError } = await marketSupabase
        .from("listings")
        .select("*")
        .eq("id", listingId)
        .single();

      if (listingError || !listing) {
        console.error("Error fetching listing:", listingError);
        setLoading(false);
        return;
      }

      // Fetch seller username from Market DB
      const { data: seller, error: sellerError } = await marketSupabase
        .from("bot_users")
        .select("username, first_name")
        .eq("telegram_id", listing.seller_telegram_id)
        .single();

      if (sellerError || !seller) {
        console.error("Error fetching seller:", sellerError);
      }

      // Auto-populate the New Deal form
      setSellerUsername(seller?.username ? `@${seller.username}` : (seller?.first_name || ""));
      setAmount(listing.price?.toString() || "");
      setDescription(`Order for ${listing.title}`);
      setActiveListingId(listingId);

      // Navigate to New Deal view
      setView("new-deal");
      webApp?.HapticFeedback?.notificationOccurred("success");
    } catch (err) {
      console.error("Failed to handle deep link:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const ADMIN_USERNAMES = ["lightorbinnovations"];
    if (tgUser?.username && ADMIN_USERNAMES.includes(tgUser.username.toLowerCase())) {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }
  }, [tgUser]);

  const navigate = useCallback((to: View, dir: "forward" | "back" = "forward") => {
    setDirection(dir);
    setView(to);
    setError("");
    setProfileSuccess(false);
    setDisputeSuccess(false);
    setSidebarOpen(false);
    webApp?.HapticFeedback?.impactOccurred("light");
  }, [webApp]);

  const openAdminDashboard = useCallback(() => {
    if (!tgUser) return;
    const token = btoa(`${tgUser.id}:${tgUser.username}`);
    window.location.href = `/?admin_token=${encodeURIComponent(token)}`;
  }, [tgUser]);

  useEffect(() => {
    if (!webApp) return;
    const goBack = () => {
      if (view === "deal-detail") navigate("my-deals", "back");
      else if (view !== "home") navigate("home", "back");
    };
    if (view !== "home") { webApp.BackButton.show(); webApp.BackButton.onClick(goBack); }
    else webApp.BackButton.hide();
    return () => webApp.BackButton.offClick(goBack);
  }, [view, navigate]);

  const fetchDeals = useCallback(async () => {
    if (!tgUser) return;
    setLoading(true);
    const uname = `@${tgUser.username}`;
    const { data } = await supabase.from("deals").select("*")
      .or(`buyer_telegram.ilike.${uname},seller_telegram.ilike.${uname}`)
      .order("created_at", { ascending: false }).limit(50);
    setDeals((data as Deal[]) || []);
    setLoading(false);
  }, [tgUser]);

  const fetchHomeDeals = useCallback(async () => {
    if (!tgUser) return;
    const uname = `@${tgUser.username}`;
    const { data } = await supabase.from("deals").select("*")
      .or(`buyer_telegram.ilike.${uname},seller_telegram.ilike.${uname}`)
      .not("status", "in", '("completed","refunded")')
      .order("created_at", { ascending: false }).limit(20);
    setHomeDeals((data as Deal[]) || []);
  }, [tgUser]);

  const fetchAllUserDeals = useCallback(async () => {
    if (!tgUser) return;
    const uname = `@${tgUser.username}`;
    const { data } = await supabase.from("deals").select("*")
      .or(`buyer_telegram.ilike.${uname},seller_telegram.ilike.${uname}`)
      .order("created_at", { ascending: false });
    setAllUserDeals((data as Deal[]) || []);
  }, [tgUser]);

  const fetchProfile = useCallback(async () => {
    if (!tgUser) return;
    setProfileLoading(true);
    const { data } = await supabase.from("user_profiles")
      .select("*")
      .or(`telegram_id.eq.${tgUser.id},telegram_username.ilike.@${tgUser.username}`)
      .maybeSingle();
    if (data) {
      setProfile(data as UserProfile);
      setBankName(data.bank_name || "");
      setAccountNumber(data.account_number || "");
      setAccountName(data.account_name || "");
    }
    setProfileLoading(false);
  }, [tgUser]);

  const fetchUserRatings = useCallback(async () => {
    if (!tgUser) return;
    const uname = `@${tgUser.username}`;
    const { data } = await supabase.from("deal_ratings").select("*")
      .or(`rater_telegram.ilike.${uname},rated_telegram.ilike.${uname}`)
      .order("created_at", { ascending: false }).limit(50);
    setUserRatings((data as Rating[]) || []);
  }, [tgUser]);

  useEffect(() => { if (view === "my-deals") fetchDeals(); }, [view, fetchDeals]);
  useEffect(() => { if (view === "home" && tgUser) { fetchHomeDeals(); fetchAllUserDeals(); fetchUserRatings(); } }, [view, tgUser, fetchHomeDeals, fetchAllUserDeals, fetchUserRatings]);

  // Fetch notifications from audit_logs relevant to this user
  const fetchNotifications = useCallback(async () => {
    if (!tgUser) return;
    setNotifLoading(true);
    const uname = `@${tgUser.username}`;
    const { data } = await supabase.from("audit_logs").select("*")
      .or(`actor.ilike.${uname},details->>seller.ilike.${uname},details->>buyer.ilike.${uname}`)
      .order("created_at", { ascending: false }).limit(30);
    const readIds: string[] = JSON.parse(localStorage.getItem(`tp9ja_read_notifs_${tgUser.id}`) || "[]");
    const mapped = (data || []).map(log => ({
      id: log.id,
      message: formatNotifMessage(log.action, log.details as Record<string, unknown> | null, log.deal_id),
      time: log.created_at,
      type: log.action,
      isRead: readIds.includes(log.id),
    }));
    setNotifications(mapped);
    setNotifLoading(false);
  }, [tgUser]);

  function formatNotifMessage(action: string, details: Record<string, unknown> | null, dealId: string | null): string {
    const id = dealId || "";
    switch (action) {
      case "deal_created": return `You created deal ${id} for ₦${((details?.amount as number) || 0).toLocaleString()}`;
      case "deal_accepted": return `Deal ${id} was accepted`;
      case "deal_declined": return `Deal ${id} was declined by seller`;
      case "delivery_marked": return `Seller marked deal ${id} as delivered`;
      case "delivery_confirmed": return `Delivery confirmed for deal ${id}`;
      case "dispute_opened": return `Dispute opened on deal ${id}`;
      case "payment_received": return `Payment received for deal ${id}`;
      case "welcome": return "Welcome to TrustPay9ja! 🎉 Your secure escrow service.";
      default: return `${action.replace(/_/g, " ")} — ${id}`;
    }
  }

  // Welcome notification on first launch
  useEffect(() => {
    if (!tgUser) return;
    const welcomed = localStorage.getItem(`tp9ja_welcomed_${tgUser.id}`);
    if (!welcomed) {
      localStorage.setItem(`tp9ja_welcomed_${tgUser.id}`, "true");
      supabase.from("audit_logs").insert({
        action: "welcome",
        actor: `@${tgUser.username}`,
        details: { message: "New user joined TrustPay9ja" },
      }).then(() => { });
    }
  }, [tgUser]);

  // Fetch notifications on mount
  useEffect(() => { if (tgUser) fetchNotifications(); }, [tgUser, fetchNotifications]);
  useEffect(() => { if (view === "settings" && tgUser) fetchProfile(); }, [view, tgUser, fetchProfile]);
  useEffect(() => { if (view === "history" && tgUser) fetchDeals(); }, [view, tgUser, fetchDeals]);
  useEffect(() => { if (view === "raise-dispute" && tgUser) fetchDeals(); }, [view, tgUser, fetchDeals]);

  const refreshAfterAction = useCallback(async (dealId: string) => {
    const { data } = await supabase.from("deals").select("*").eq("deal_id", dealId).single();
    if (data) setSelectedDeal(data as Deal);
    await fetchDeals();
  }, [fetchDeals]);

  const handleSaveProfile = async () => {
    if (!tgUser) return;
    setError("");
    if (!bankName.trim()) { setError("Select a bank"); return; }
    if (!/^\d{10}$/.test(accountNumber)) { setError("Account number must be 10 digits"); return; }
    if (!accountName.trim() || accountName.trim().length < 3) { setError("Enter your account name (min 3 chars)"); return; }

    setSavingProfile(true);

    try {
      const initData = webApp?.initData;
      if (!initData) throw new Error("Telegram authentication missing");

      const { data, error } = await supabase.functions.invoke('user-profiles', {
        body: {
          action: 'update_profile',
          payload: {
            bank_name: bankName.trim(),
            account_number: accountNumber,
            account_name: accountName.trim(),
          }
        },
        headers: {
          'x-telegram-init-data': initData
        }
      });

      if (error) throw error;

      webApp?.HapticFeedback?.notificationOccurred("success");
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
      fetchProfile(); // Re-fetch to get updated paystack_recipient_code if added
    } catch (err: any) {
      console.error("Profile saving error:", err);
      setError(err.message || "Failed to save profile. Try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateDeal = async () => {
    setError("");
    const seller = sellerUsername.replace("@", "").trim();
    const amt = parseInt(amount);
    if (!seller || seller.length < 3 || !/^[a-zA-Z0-9_]{3,32}$/.test(seller)) { setError("Enter a valid seller username (3-32 chars)"); return; }
    if (isNaN(amt) || amt < 100 || amt > 20000) { setError("Amount: ₦100 – ₦20,000"); return; }
    if (!description.trim() || description.trim().length < 3) { setError("Description too short (min 3 chars)"); return; }
    if (tgUser && seller.toLowerCase() === tgUser.username.toLowerCase()) { setError("Can't trade with yourself"); return; }

    setCreating(true);
    webApp?.HapticFeedback?.impactOccurred("medium");

    try {
      const initData = webApp?.initData;
      if (!initData) throw new Error("Telegram authentication missing");

      const { data, error } = await supabase.functions.invoke('escrow-actions', {
        body: {
          action: 'create_deal',
          payload: {
            seller,
            amount: amt,
            description: description.trim(),
            market_listing_id: activeListingId
          }
        },
        headers: {
          'x-telegram-init-data': initData
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Extract dealId from response
      const dealId = data?.deal?.deal_id;

      supabase.functions.invoke("deal-notify", { body: { deal_id: dealId, action: "deal_created" } }).catch(console.error);
      webApp?.HapticFeedback?.notificationOccurred("success");
      setSuccessDeal(dealId);
      setTimeout(() => {
        setSellerUsername(""); setAmount(""); setDescription("");
        setCreating(false); setSuccessDeal(null);
        navigate("my-deals");
      }, 1500);

    } catch (err: any) {
      console.error("Deal creation error:", err);
      setError(err.message || "Failed to create deal. Try again.");
      setCreating(false);
    }
  };

  const handleAcceptDeal = async (deal: Deal) => {
    if (actionLoading) return;
    setActionLoading(true); setError("");

    try {
      const initData = webApp?.initData;
      if (!initData) throw new Error("Telegram authentication missing");

      const { data, error } = await supabase.functions.invoke('escrow-actions', {
        body: {
          action: 'accept_deal',
          payload: { deal_id: deal.deal_id }
        },
        headers: {
          'x-telegram-init-data': initData
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      supabase.functions.invoke("deal-notify", { body: { deal_id: deal.deal_id, action: "deal_accepted" } }).catch(console.error);
      webApp?.HapticFeedback?.notificationOccurred("success");
      await refreshAfterAction(deal.deal_id);
    } catch (err: any) {
      console.error("Deal accept error:", err);
      setError(err.message || "Failed to accept deal. Try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeclineDeal = async (deal: Deal) => {
    if (actionLoading) return;
    setActionLoading(true); setError("");

    try {
      const initData = webApp?.initData;
      if (!initData) throw new Error("Telegram authentication missing");

      const { data, error } = await supabase.functions.invoke('escrow-actions', {
        body: {
          action: 'decline_deal',
          payload: { deal_id: deal.deal_id }
        },
        headers: {
          'x-telegram-init-data': initData
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      supabase.functions.invoke("deal-notify", { body: { deal_id: deal.deal_id, action: "deal_declined" } }).catch(console.error);
      webApp?.HapticFeedback?.notificationOccurred("warning");
      fetchDeals();
      navigate("my-deals", "back");
    } catch (err: any) {
      console.error("Deal decline error:", err);
      setError(err.message || "Failed to decline deal. Try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkDelivered = async (deal: Deal) => {
    if (actionLoading) return;
    setActionLoading(true); setError("");

    try {
      const initData = webApp?.initData;
      if (!initData) throw new Error("Telegram authentication missing");

      const { data, error } = await supabase.functions.invoke('escrow-actions', {
        body: {
          action: 'mark_delivered',
          payload: { deal_id: deal.deal_id }
        },
        headers: {
          'x-telegram-init-data': initData
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      supabase.functions.invoke("deal-notify", { body: { deal_id: deal.deal_id, action: "delivery_marked" } }).catch(console.error);
      webApp?.HapticFeedback?.notificationOccurred("success");
      await refreshAfterAction(deal.deal_id);
    } catch (err: any) {
      console.error("Delivery mark error:", err);
      setError(err.message || "Failed to update. Try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReceived = async (deal: Deal) => {
    if (actionLoading) return;
    setActionLoading(true); setError("");

    try {
      const initData = webApp?.initData;
      if (!initData) throw new Error("Telegram authentication missing");

      const { data, error } = await supabase.functions.invoke('escrow-actions', {
        body: {
          action: 'confirm_received',
          payload: { deal_id: deal.deal_id }
        },
        headers: {
          'x-telegram-init-data': initData
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      supabase.functions.invoke("deal-notify", { body: { deal_id: deal.deal_id, action: "delivery_confirmed" } }).catch(console.error);
      webApp?.HapticFeedback?.notificationOccurred("success");
      await refreshAfterAction(deal.deal_id);

      // Show rating modal
      setRatingDealId(deal.deal_id);
      setRatingValue(0);
      setRatingComment("");
      setShowRatingModal(true);
    } catch (err: any) {
      console.error("Confirm received error:", err);
      setError(err.message || "Failed to confirm. Try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDispute = async (deal: Deal) => {
    if (actionLoading) return;
    setActionLoading(true); setError("");

    try {
      const initData = webApp?.initData;
      if (!initData) throw new Error("Telegram authentication missing");

      const { data, error } = await supabase.functions.invoke('escrow-actions', {
        body: {
          action: 'open_dispute',
          payload: {
            deal_id: deal.deal_id,
            reason: "Buyer opened dispute via Mini App"
          }
        },
        headers: {
          'x-telegram-init-data': initData
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      webApp?.HapticFeedback?.notificationOccurred("warning");
      await refreshAfterAction(deal.deal_id);
    } catch (err: any) {
      console.error("Open dispute error:", err);
      setError(err.message || "Failed to open dispute. Try again.");
    } finally {
      setActionLoading(false);
    }
  };

  // Dispute form submit with evidence upload
  const handleSubmitDispute = async () => {
    setError("");
    if (!disputeDealId) { setError("Select a deal to dispute"); return; }
    if (!disputeReason.trim() || disputeReason.trim().length < 10) { setError("Describe your issue in detail (min 10 chars)"); return; }
    setDisputeSubmitting(true);

    const deal = deals.find(d => d.deal_id === disputeDealId);
    if (!deal) { setError("Deal not found"); setDisputeSubmitting(false); return; }
    if (deal.status !== "funded") { setError("Only funded deals can be disputed"); setDisputeSubmitting(false); return; }

    try {
      const initData = webApp?.initData;
      if (!initData) throw new Error("Telegram authentication missing");

      let evidenceUrl = "";
      if (disputeFile) {
        const ext = disputeFile.name.split(".").pop();
        const path = `${disputeDealId}/${Date.now()}.${ext}`;
        // Storage operations stay client-side but must be allowed by RLS policies if restricted
        const { error: uploadError } = await supabase.storage.from("dispute-evidence").upload(path, disputeFile);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("dispute-evidence").getPublicUrl(path);
          evidenceUrl = urlData?.publicUrl || "";
        }
      }

      const { data, error } = await supabase.functions.invoke('escrow-actions', {
        body: {
          action: 'open_dispute',
          payload: {
            deal_id: disputeDealId,
            reason: disputeReason.trim().replace(/[<>&]/g, "").substring(0, 500),
            evidence_url: evidenceUrl
          }
        },
        headers: {
          'x-telegram-init-data': initData
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      webApp?.HapticFeedback?.notificationOccurred("warning");
      setDisputeSuccess(true);
      setDisputeDealId(""); setDisputeReason(""); setDisputeFile(null);
    } catch (err: any) {
      console.error("Submit dispute error:", err);
      setError(err.message || "Failed to submit dispute");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  // Rating submit
  const handleSubmitRating = async () => {
    if (ratingValue < 1 || ratingValue > 5) return;
    setRatingSubmitting(true);
    const deal = allUserDeals.find(d => d.deal_id === ratingDealId);
    if (!deal) { setRatingSubmitting(false); return; }
    const isBuyer = usernameMatch(deal.buyer_telegram, `@${tgUser?.username || ""}`);
    const ratedUser = isBuyer ? deal.seller_telegram : deal.buyer_telegram;

    await supabase.from("deal_ratings").insert({
      deal_id: ratingDealId,
      rater_telegram: `@${tgUser?.username}`,
      rated_telegram: ratedUser,
      rating: ratingValue,
      comment: ratingComment.trim().replace(/[<>&]/g, "").substring(0, 200),
    });

    webApp?.HapticFeedback?.notificationOccurred("success");
    setShowRatingModal(false);
    setRatingSubmitting(false);
  };

  // Shared styles
  const bg = isDark ? "bg-[#0a0a0f]" : "bg-[#f5f5f7]";
  const cardBg = isDark ? "bg-[#1c1c1e]" : "bg-white";
  const cardBorder = isDark ? "border-white/5" : "border-black/[0.04]";
  const textSecondary = isDark ? "text-white/50" : "text-black/45";
  const textPrimary = isDark ? "text-white" : "text-[#1c1c1e]";
  const inputBg = isDark ? "bg-white/5 text-white placeholder-white/25 border-white/10" : "bg-black/[0.03] text-[#1c1c1e] placeholder-black/30 border-black/[0.06]";

  const statusConfig: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    pending: { bg: isDark ? "bg-amber-500/10" : "bg-amber-50", text: isDark ? "text-amber-400" : "text-amber-600", icon: <Clock className="w-3 h-3" />, label: "Awaiting Seller" },
    accepted: { bg: isDark ? "bg-orange-500/10" : "bg-orange-50", text: isDark ? "text-orange-400" : "text-orange-600", icon: <CheckCircle className="w-3 h-3" />, label: "Awaiting Payment" },
    funded: { bg: isDark ? "bg-blue-500/10" : "bg-blue-50", text: isDark ? "text-blue-400" : "text-blue-600", icon: <CheckCircle className="w-3 h-3" />, label: "Funded" },
    completed: { bg: isDark ? "bg-emerald-500/10" : "bg-emerald-50", text: isDark ? "text-emerald-400" : "text-emerald-600", icon: <CheckCircle className="w-3 h-3" />, label: "Completed" },
    disputed: { bg: isDark ? "bg-red-500/10" : "bg-red-50", text: isDark ? "text-red-400" : "text-red-600", icon: <AlertTriangle className="w-3 h-3" />, label: "Disputed" },
    refunded: { bg: isDark ? "bg-orange-500/10" : "bg-orange-50", text: isDark ? "text-orange-400" : "text-orange-600", icon: <AlertTriangle className="w-3 h-3" />, label: "Refunded" },
  };

  const BANKS = ["Access Bank", "GTBank", "First Bank", "UBA", "Zenith Bank", "Kuda", "OPay", "PalmPay", "Moniepoint", "Wema Bank", "Sterling Bank", "Fidelity Bank", "FCMB", "Union Bank", "Polaris Bank", "Stanbic IBTC"];

  const uname = `@${tgUser?.username || ""}`;
  const pendingSellerActions = homeDeals.filter(d => d.status === "pending" && usernameMatch(d.seller_telegram, uname)).length;
  const pendingBuyerActions = homeDeals.filter(d => {
    const isBuyer = usernameMatch(d.buyer_telegram, uname);
    return isBuyer && (d.status === "accepted" || (d.status === "funded" && d.delivered_at));
  }).length;
  const totalPendingActions = pendingSellerActions + pendingBuyerActions;

  const buyDeals = allUserDeals.filter(d => usernameMatch(d.buyer_telegram, uname));
  const sellDeals = allUserDeals.filter(d => usernameMatch(d.seller_telegram, uname));
  const completedBuys = buyDeals.filter(d => d.status === "completed").length;
  const completedSells = sellDeals.filter(d => d.status === "completed").length;
  const totalSpent = buyDeals.filter(d => d.status === "completed").reduce((s, d) => s + d.amount, 0);
  const totalEarned = sellDeals.filter(d => d.status === "completed").reduce((s, d) => s + (d.amount - d.fee), 0);
  const activeBuyDeals = buyDeals.filter(d => !["completed", "refunded"].includes(d.status)).length;
  const activeSellDeals = sellDeals.filter(d => !["completed", "refunded"].includes(d.status)).length;
  const disputedDeals = allUserDeals.filter(d => d.status === "disputed").length;

  // Avg rating received
  const ratingsReceived = userRatings.filter(r => usernameMatch(r.rated_telegram, uname));
  const avgRating = ratingsReceived.length > 0 ? (ratingsReceived.reduce((s, r) => s + r.rating, 0) / ratingsReceived.length).toFixed(1) : "—";

  // Disputable deals (funded, user is buyer)
  const disputableDeals = deals.filter(d => d.status === "funded" && usernameMatch(d.buyer_telegram, uname));

  // Global styles
  const globalStyles = `
    @keyframes slide-in-page { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes slide-in-back { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
    .animate-slide-in-page { animation: slide-in-page 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
    .animate-slide-in-back { animation: slide-in-back 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
    .press-effect { transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s ease; }
    .press-effect:active { transform: scale(0.97); }
    .input-focus { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
    .input-focus:focus { border-color: hsl(224 71% 50%); box-shadow: 0 0 0 3px hsl(224 71% 50% / 0.12); }
    @keyframes pulse-badge { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
    .badge-pulse { animation: pulse-badge 2s ease-in-out infinite; }
    @keyframes fade-in-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    .animate-fade-in-up { animation: fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes sidebar-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }
    .sidebar-animate { animation: sidebar-in 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
  `;

  const MiniFooter = () => (
    <div className="py-4 mt-6 pb-24 text-center">
      <div className={`flex items-center justify-center gap-1.5 text-[11px] ${textSecondary}`}>
        <Zap className="w-3 h-3" style={{ color: isDark ? "hsl(224,71%,60%)" : "hsl(224,71%,50%)" }} />
        <span>Powered by <strong className={textPrimary} style={{ fontWeight: 600 }}>LightOrb Innovations</strong></span>
      </div>
    </div>
  );

  // Bottom Navigation Bar — styled like TrustPay Markets
  const BottomNav = () => {
    const navTabs = [
      { id: "home" as View, label: "Home", icon: Home },
      { id: "my-deals" as View, label: "Deals", icon: List },
      { id: "new-deal" as View, label: "New", icon: Plus, isCenter: true },
      { id: "history" as View, label: "History", icon: History },
      { id: "settings" as View, label: "Profile", icon: User },
    ];
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-[env(safe-area-inset-bottom)] pointer-events-none">
        <div className={`mx-4 mb-3 w-full max-w-[440px] pointer-events-auto rounded-[1.25rem] ${isDark ? "bg-[#1c1c1e]/90 border-white/10" : "bg-white/90 border-black/[0.06]"} backdrop-blur-xl border shadow-[0_4px_24px_rgba(0,0,0,0.08)] px-1 py-2`}>
          <div className="flex items-center justify-around">
            {navTabs.map((tab) => {
              const active = view === tab.id;
              if (tab.isCenter) {
                return (
                  <button key={tab.id} onClick={() => navigate(tab.id)} className="relative flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-colors">
                    {active && <div className={`absolute inset-0 rounded-xl ${isDark ? "bg-white/10" : "bg-black/5"}`} />}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)] flex items-center justify-center shadow-md relative z-10 -mt-2">
                      <Plus className="w-5 h-5 text-white" />
                    </div>
                    <span className={`relative z-10 text-[10px] font-semibold transition-colors mt-0.5 ${active ? (isDark ? "text-[hsl(224,71%,60%)]" : "text-[hsl(224,71%,50%)]") : (isDark ? "text-white/35" : "text-black/35")}`}>{tab.label}</span>
                  </button>
                );
              }
              return (
                <button key={tab.id} onClick={() => navigate(tab.id)} className="relative flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-colors">
                  {active && <div className={`absolute inset-0 rounded-xl ${isDark ? "bg-[hsl(224,71%,60%)]/20" : "bg-[hsl(224,71%,50%)]/10"}`} />}
                  <tab.icon className={`relative z-10 w-5 h-5 transition-colors ${active ? (isDark ? "text-[hsl(224,71%,60%)]" : "text-[hsl(224,71%,50%)]") : (isDark ? "text-white/35" : "text-black/35")}`} />
                  <span className={`relative z-10 text-[10px] font-semibold transition-colors ${active ? (isDark ? "text-[hsl(224,71%,60%)]" : "text-[hsl(224,71%,50%)]") : (isDark ? "text-white/35" : "text-black/35")}`}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Delete a notification (mark as read / dismiss)
  const deleteNotification = async (id: string) => {
    // Mark single as read
    if (!tgUser) return;
    const readIds: string[] = JSON.parse(localStorage.getItem(`tp9ja_read_notifs_${tgUser.id}`) || "[]");
    if (!readIds.includes(id)) {
      readIds.push(id);
      localStorage.setItem(`tp9ja_read_notifs_${tgUser.id}`, JSON.stringify(readIds));
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    webApp?.HapticFeedback?.impactOccurred("light");
  };

  const markAllAsRead = () => {
    if (!tgUser || notifications.length === 0) return;
    const readIds: string[] = JSON.parse(localStorage.getItem(`tp9ja_read_notifs_${tgUser.id}`) || "[]");
    const allIds = [...new Set([...readIds, ...notifications.map(n => n.id)])];
    localStorage.setItem(`tp9ja_read_notifs_${tgUser.id}`, JSON.stringify(allIds));
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    webApp?.HapticFeedback?.notificationOccurred("success");
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Notifications Panel overlay — fullscreen
  const NotificationsOverlay = () => notifPanelOpen ? (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ overflow: "hidden" }}>
      <div className={`relative w-full h-full ${isDark ? "bg-[#0a0a0f]" : "bg-[#f5f5f7]"} flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${cardBorder} ${isDark ? "bg-[#1c1c1e]" : "bg-white"}`}>
          <div className="flex items-center gap-2">
            <Bell className={`w-5 h-5 ${isDark ? "text-[hsl(224,71%,60%)]" : "text-[hsl(224,71%,50%)]"}`} />
            <h3 className="font-bold text-[16px]">Notifications</h3>
            {notifications.length > 0 && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${isDark ? "bg-white/10 text-white/50" : "bg-black/[0.06] text-black/40"}`}>{notifications.length}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className={`press-effect text-[12px] font-semibold px-3 py-1.5 rounded-lg ${isDark ? "text-[hsl(224,71%,60%)] bg-[hsl(224,71%,50%)]/10" : "text-[hsl(224,71%,50%)] bg-[hsl(224,71%,50%)]/10"}`}>
                Mark all as read
              </button>
            )}
            <button onClick={() => setNotifPanelOpen(false)} className="press-effect p-1.5">
              <X className={`w-5 h-5 ${textSecondary}`} />
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {notifLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[hsl(224,71%,50%)]" /></div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16">
              <Bell className={`w-10 h-10 mx-auto mb-3 ${textSecondary}`} />
              <p className={`text-[14px] font-medium ${textSecondary}`}>No notifications yet</p>
              <p className={`text-[12px] mt-1 ${textSecondary}`}>You'll see deal updates here</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`${cardBg} border ${cardBorder} rounded-xl p-3.5 flex items-start gap-3 animate-fade-in-up`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${n.type === "welcome" ? "bg-emerald-500/10" :
                  n.type.includes("dispute") ? "bg-red-500/10" :
                    n.type.includes("confirm") || n.type.includes("completed") ? "bg-emerald-500/10" :
                      "bg-[hsl(224,71%,50%)]/10"
                  }`}>
                  {n.type === "welcome" ? <Sparkles className="w-4 h-4 text-emerald-500" /> :
                    n.type.includes("dispute") ? <AlertTriangle className="w-4 h-4 text-red-500" /> :
                      n.type.includes("confirm") || n.type.includes("completed") ? <CheckCircle className="w-4 h-4 text-emerald-500" /> :
                        <Bell className="w-4 h-4" style={{ color: isDark ? "hsl(224,71%,60%)" : "hsl(224,71%,50%)" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] leading-snug">{n.message}</p>
                  <p className={`text-[11px] mt-1 ${textSecondary}`}>{new Date(n.time).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <button onClick={() => deleteNotification(n.id)} className={`press-effect p-1.5 rounded-lg flex-shrink-0 ${isDark ? "hover:bg-white/10" : "hover:bg-black/[0.06]"}`}>
                  <X className={`w-4 h-4 ${isDark ? "text-red-400" : "text-red-500"}`} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  ) : null;

  // Sidebar navigation items
  const sidebarItems = [
    { id: "home" as View, label: "Dashboard", subtitle: "Overview & stats", icon: Home, color: "from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)]" },
    { id: "my-deals" as View, label: "My Deals", subtitle: "Active & pending deals", icon: List, color: "from-emerald-500 to-emerald-600", badge: totalPendingActions },
    { id: "new-deal" as View, label: "New Deal", subtitle: "Create escrow transaction", icon: Plus, color: "from-blue-500 to-blue-600" },
    { id: "raise-dispute" as View, label: "Raise Dispute", subtitle: "Report an issue", icon: AlertTriangle, color: "from-red-400 to-red-500", badge: disputedDeals },
    { id: "history" as View, label: "History", subtitle: "Past transactions", icon: History, color: "from-purple-500 to-purple-600" },
    { id: "contact" as View, label: "Contact Support", subtitle: "Get help from us", icon: Phone, color: "from-teal-500 to-teal-600" },
    { id: "faq" as View, label: "How It Works", subtitle: "Learn about escrow", icon: HelpCircle, color: "from-amber-500 to-amber-600" },
    { id: "settings" as View, label: "Settings", subtitle: "Account preferences", icon: Settings, color: "from-gray-500 to-gray-600" },
  ];

  // ===== NOT IN TELEGRAM =====
  if (!tgUser) {
    return (
      <div className={`min-h-screen ${bg} ${textPrimary} flex items-center justify-center p-6`}>
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 mx-auto opacity-40" />
          <h1 className="text-xl font-bold">Open in Telegram</h1>
          <p className={`text-sm ${textSecondary}`}>This app must be opened from the TrustPay9ja Telegram bot.</p>
          <p className={`text-xs ${textSecondary}`}>Start @TrustPay9jaBot on Telegram, then tap "Open App".</p>
        </div>
      </div>
    );
  }

  // ===== SIDEBAR OVERLAY =====
  const Sidebar = () => sidebarOpen ? (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
      <div className={`relative w-72 min-h-screen sidebar-animate ${isDark ? "bg-[#1c1c1e]" : "bg-white"} shadow-2xl flex flex-col`}>
        {/* Sidebar header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${cardBorder}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)] flex items-center justify-center shadow-md">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-[15px]">TrustPay9ja</p>
              <p className={`text-[11px] ${textSecondary}`}>Secure Escrow</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="press-effect p-1">
            <X className={`w-5 h-5 ${textSecondary}`} />
          </button>
        </div>

        {/* User info */}
        <div className={`px-5 py-3 border-b ${cardBorder}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)] flex items-center justify-center text-white font-bold text-sm">
              {tgUser.photoUrl ? (
                <img src={tgUser.photoUrl} alt={`${tgUser.firstName} profile`} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                tgUser.firstName.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <p className="font-semibold text-[14px]">{tgUser.firstName}{tgUser.lastName ? ` ${tgUser.lastName}` : ""}</p>
              <div className="flex items-center gap-1.5">
                <span className={`text-[12px] ${textSecondary}`}>@{tgUser.username}</span>
                {avgRating !== "—" && (
                  <span className="flex items-center gap-0.5 text-[11px] text-amber-500">
                    <Star className="w-3 h-3 fill-amber-500" />{avgRating}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {/* Admin Panel Card */}
          {isAdmin && (
            <button
              onClick={openAdminDashboard}
              className={`w-full mb-3 p-3.5 rounded-2xl flex items-center gap-3 press-effect transition-all border ${isDark ? "border-[hsl(224,71%,40%)]/40 bg-[hsl(224,71%,40%)]/10" : "border-[hsl(224,71%,50%)]/30 bg-[hsl(224,71%,50%)]/5"
                }`}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)] flex items-center justify-center shadow-md">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className={`font-semibold text-[14px] ${isDark ? "text-[hsl(224,71%,65%)]" : "text-[hsl(224,71%,45%)]"}`}>Admin Panel</p>
                <p className={`text-[11px] ${isDark ? "text-[hsl(224,71%,55%)]" : "text-[hsl(224,71%,55%)]"}`}>Manage marketplace</p>
              </div>
              <ChevronRight className={`w-4 h-4 ${isDark ? "text-[hsl(224,71%,55%)]" : "text-[hsl(224,71%,50%)]"}`} />
            </button>
          )}

          {sidebarItems.map((item) => (
            <button key={item.id} onClick={() => navigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] font-medium press-effect transition-all ${view === item.id
                ? (isDark ? "bg-white/10 text-white" : "bg-black/[0.06] text-[#1c1c1e]")
                : (isDark ? "text-white/60 hover:bg-white/5" : "text-black/50 hover:bg-black/[0.03]")
                }`}>
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center flex-shrink-0`}>
                <item.icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 text-left">
                <span className="block leading-tight">{item.label}</span>
                <span className={`block text-[11px] font-normal ${isDark ? "text-white/35" : "text-black/35"}`}>{item.subtitle}</span>
              </div>
              {item.badge && item.badge > 0 && (
                <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center badge-pulse">{item.badge}</span>
              )}
              <ChevronRight className={`w-4 h-4 ${isDark ? "text-white/20" : "text-black/15"}`} />
            </button>
          ))}

          {/* Other Bots */}
          <div className={`mt-3 pt-3 border-t ${cardBorder}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider px-3 mb-2 ${textSecondary}`}>Our Bots</p>
            <a href="https://t.me/TrustPayMarketsBot" target="_blank" rel="noopener noreferrer"
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] font-medium press-effect transition-all ${isDark ? "text-white/60 hover:bg-white/5" : "text-black/50 hover:bg-black/[0.03]"}`}>
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                <Store className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 text-left">
                <span className="block leading-tight">TrustPay Markets</span>
                <span className={`block text-[11px] font-normal ${isDark ? "text-white/35" : "text-black/35"}`}>Buy & sell on Telegram</span>
              </div>
              <ChevronRight className={`w-4 h-4 ${isDark ? "text-white/20" : "text-black/15"}`} />
            </a>
          </div>
        </nav>

        {/* Footer */}
        <div className={`px-5 py-3 border-t ${cardBorder}`}>
          <p className={`text-[10px] text-center ${textSecondary}`}>Powered by LightOrb Innovations</p>
        </div>
      </div>
    </div>
  ) : null;

  // ===== RATING MODAL =====
  const RatingModal = () => showRatingModal ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowRatingModal(false)} />
      <div className={`relative ${cardBg} border ${cardBorder} rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-fade-in-up`}>
        <h3 className="text-[18px] font-bold text-center mb-1">Rate Your Experience</h3>
        <p className={`text-[13px] text-center ${textSecondary} mb-4`}>How was this transaction?</p>
        <div className="flex justify-center gap-2 mb-4">
          {[1, 2, 3, 4, 5].map(v => (
            <button key={v} onClick={() => { setRatingValue(v); webApp?.HapticFeedback?.impactOccurred("light"); }}
              className="press-effect p-1">
              <Star className={`w-8 h-8 transition-colors ${v <= ratingValue ? "fill-amber-400 text-amber-400" : (isDark ? "text-white/20" : "text-black/15")}`} />
            </button>
          ))}
        </div>
        <input value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Leave a comment (optional)"
          className={`w-full p-3 rounded-xl text-[14px] border outline-none input-focus ${inputBg} mb-3`} maxLength={200} />
        <button onClick={handleSubmitRating} disabled={ratingValue < 1 || ratingSubmitting}
          className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold py-3 rounded-xl text-[14px] press-effect disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25">
          {ratingSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
          Submit Rating
        </button>
        <button onClick={() => setShowRatingModal(false)} className={`w-full mt-2 py-2 text-[13px] font-medium ${textSecondary}`}>Skip</button>
      </div>
    </div>
  ) : null;

  // Fixed Header — styled like TrustPay Markets
  const Header = ({ title, showBack = true, backTo = "home" as View }: { title?: string; showBack?: boolean; backTo?: View }) => (
    <div className="sticky top-0 z-30 flex justify-center">
      <div className={`w-full ${isDark ? "bg-[#0a0a0f]/90 border-white/5" : "bg-[#f5f5f7]/90 border-black/[0.04]"} backdrop-blur-xl border-b shadow-sm`}>
        <div className="flex items-center gap-3 px-5 py-3 pt-[calc(env(safe-area-inset-top)+12px)]">
          {showBack && view !== "home" ? (
            <button onClick={() => navigate(backTo, "back")} className={`w-9 h-9 rounded-full flex items-center justify-center press-effect ${cardBg} border ${cardBorder}`}>
              <ArrowLeft className={`w-5 h-5 ${isDark ? "text-white/70" : "text-black/70"}`} />
            </button>
          ) : (
            <button onClick={() => setSidebarOpen(true)} className="press-effect">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)] flex items-center justify-center shadow-sm">
                {tgUser?.photoUrl ? (
                  <img src={tgUser.photoUrl} alt="Profile" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <span className="text-white font-bold text-sm">{tgUser?.firstName?.charAt(0).toUpperCase()}</span>
                )}
              </div>
            </button>
          )}
          {title ? (
            <h2 className="text-[17px] font-bold flex-1 text-center pr-9">{title}</h2>
          ) : (
            <div className="flex-1" />
          )}
          {!title && (
            <button onClick={() => { setNotifPanelOpen(true); fetchNotifications(); }} className={`relative w-9 h-9 rounded-full flex items-center justify-center press-effect ${cardBg} border ${cardBorder}`}>
              <Bell className={`w-4 h-4 ${textSecondary}`} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[hsl(224,71%,50%)] text-white text-[9px] font-bold flex items-center justify-center badge-pulse">{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ===== HOME (DASHBOARD) =====
  if (view === "home") {
    const statCards = [
      { label: "Total Bought", value: completedBuys, icon: <ShoppingCart className="w-4 h-4" />, color: "from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)]" },
      { label: "Total Sold", value: completedSells, icon: <Store className="w-4 h-4" />, color: "from-emerald-500 to-emerald-600" },
      { label: "Spent", value: `₦${totalSpent.toLocaleString()}`, icon: <ArrowUpRight className="w-4 h-4" />, color: "from-red-400 to-red-500" },
      { label: "Earned", value: `₦${totalEarned.toLocaleString()}`, icon: <ArrowDownLeft className="w-4 h-4" />, color: "from-emerald-400 to-teal-500" },
    ];

    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <RatingModal />
        <PageTransition direction={direction}>
          <Header />
          {/* Greeting */}
          <div className="pt-4 pb-2 px-5">
            <StaggerItem index={0}>
              <h1 className="text-[22px] font-bold tracking-tight">Hi, {tgUser?.firstName} 👋</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[13px] ${textSecondary}`}>@{tgUser?.username}</span>
                {avgRating !== "—" && (
                  <span className="flex items-center gap-0.5 text-[11px] text-amber-500">
                    <Star className="w-3 h-3 fill-amber-500" />{avgRating}
                  </span>
                )}
              </div>
            </StaggerItem>
          </div>

          {/* What do you need? + Search */}
          <div className="px-5 mb-4">
            <StaggerItem index={0}>
              <p className={`text-[14px] mb-2.5 ${textSecondary}`}>What do you need today?</p>
              <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${isDark ? "bg-white/5 border border-white/5" : "bg-black/[0.03] border border-black/[0.04]"}`}>
                <Search className={`w-4 h-4 ${textSecondary}`} />
                <span className={`text-[14px] ${isDark ? "text-white/25" : "text-black/30"}`}>Search deals or users</span>
              </div>
            </StaggerItem>
          </div>

          {/* Pending actions */}
          {totalPendingActions > 0 && (
            <div className="px-4 mb-3">
              <StaggerItem index={1}>
                <button onClick={() => navigate("my-deals")} className={`w-full p-3.5 rounded-2xl flex items-center gap-3 press-effect ${isDark ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"}`}>
                  <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center badge-pulse">
                    <Bell className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left flex-1">
                    <p className={`font-semibold text-[14px] ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                      {totalPendingActions} deal{totalPendingActions > 1 ? "s" : ""} need{totalPendingActions === 1 ? "s" : ""} your attention
                    </p>
                    <p className={`text-[12px] ${isDark ? "text-amber-400/60" : "text-amber-600/70"}`}>
                      {pendingSellerActions > 0 && `${pendingSellerActions} to accept`}
                      {pendingSellerActions > 0 && pendingBuyerActions > 0 && " · "}
                      {pendingBuyerActions > 0 && `${pendingBuyerActions} to act on`}
                    </p>
                  </div>
                  <ChevronRight className={`w-5 h-5 ${isDark ? "text-amber-400/50" : "text-amber-500"}`} />
                </button>
              </StaggerItem>
            </div>
          )}

          {/* Stats Grid */}
          <div className="px-4 mb-4">
            <StaggerItem index={2}>
              <div className="grid grid-cols-2 gap-2.5">
                {statCards.map((stat, i) => (
                  <div key={i} className={`${cardBg} border ${cardBorder} rounded-2xl p-4 shadow-sm`}>
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white mb-2.5 shadow-sm`}>
                      {stat.icon}
                    </div>
                    <p className="text-[18px] font-bold tracking-tight">{stat.value}</p>
                    <p className={`text-[11px] font-medium uppercase tracking-wider mt-0.5 ${textSecondary}`}>{stat.label}</p>
                  </div>
                ))}
              </div>
            </StaggerItem>
          </div>

          {/* Active Overview */}
          <div className="px-4 mb-4">
            <StaggerItem index={3}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-4 shadow-sm`}>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className={`w-4 h-4 ${isDark ? "text-blue-400" : "text-blue-500"}`} />
                  <h3 className="font-semibold text-[14px]">Active Overview</h3>
                </div>
                <div className="space-y-2.5">
                  {[
                    { label: "Active as buyer", value: activeBuyDeals },
                    { label: "Active as seller", value: activeSellDeals },
                    { label: "Disputes", value: disputedDeals },
                    { label: "Total transactions", value: allUserDeals.length },
                  ].map((row, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[13px] ${textSecondary}`}>{row.label}</span>
                        <span className="text-[14px] font-semibold">{row.value}</span>
                      </div>
                      {i < 3 && <div className={`h-px mt-2.5 ${isDark ? "bg-white/5" : "bg-black/[0.04]"}`} />}
                    </div>
                  ))}
                </div>
              </div>
            </StaggerItem>
          </div>

          {/* Quick Actions */}
          <div className="px-4 space-y-2.5 mb-4">
            <StaggerItem index={4}>
              <button onClick={() => navigate("new-deal")} className={`${cardBg} border ${cardBorder} w-full p-4 rounded-2xl flex items-center gap-4 press-effect shadow-sm`}>
                <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)] flex items-center justify-center shadow-md shadow-[hsl(224,71%,40%)/0.2]">
                  <Plus className="w-6 h-6 text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-[15px]">New Deal</p>
                  <p className={`text-[13px] mt-0.5 ${textSecondary}`}>Create a secure escrow transaction</p>
                </div>
                <ChevronRight className={`w-5 h-5 ${textSecondary}`} />
              </button>
            </StaggerItem>
            <StaggerItem index={5}>
              <button onClick={() => navigate("my-deals")} className={`${cardBg} border ${cardBorder} w-full p-4 rounded-2xl flex items-center gap-4 press-effect shadow-sm relative`}>
                <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
                  <List className="w-6 h-6 text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-[15px]">My Deals</p>
                  <p className={`text-[13px] mt-0.5 ${textSecondary}`}>View deals as buyer or seller</p>
                </div>
                {totalPendingActions > 0 && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center badge-pulse">{totalPendingActions}</span>
                )}
                <ChevronRight className={`w-5 h-5 ${textSecondary}`} />
              </button>
            </StaggerItem>
          </div>

          {/* How it works mini */}
          <div className="px-4 pb-8">
            <StaggerItem index={6}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-4 shadow-sm`}>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className={`w-4 h-4 ${isDark ? "text-amber-400" : "text-amber-500"}`} />
                  <h3 className="font-semibold text-[14px]">How it works</h3>
                </div>
                <div className="space-y-2.5">
                  {[
                    { step: "1", text: "Buyer creates deal → Seller accepts", color: "from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)]" },
                    { step: "2", text: "Buyer pays → Funds held in escrow", color: "from-amber-500 to-amber-600" },
                    { step: "3", text: "Seller delivers → Buyer confirms → Payout!", color: "from-emerald-500 to-emerald-600" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>{item.step}</div>
                      <p className={`text-[12px] leading-snug ${isDark ? "text-white/60" : "text-black/50"}`}>{item.text}</p>
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate("faq")} className={`text-[12px] font-medium mt-3 ${isDark ? "text-[hsl(224,71%,60%)]" : "text-[hsl(224,71%,50%)]"}`}>
                  Learn more →
                </button>
              </div>
            </StaggerItem>
          </div>
          <MiniFooter />
        </PageTransition>
        <BottomNav />
      </div>
    );
  }

  // ===== RAISE DISPUTE =====
  if (view === "raise-dispute") {
    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <PageTransition direction={direction}>
          <Header title="Raise Dispute" />
          <div className="px-4 pb-8">
            {disputeSuccess ? (
              <StaggerItem index={0}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-8 text-center shadow-sm mt-4`}>
                  <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-8 h-8 text-amber-500" />
                  </div>
                  <p className="text-lg font-bold">Dispute Submitted!</p>
                  <p className={`text-sm mt-2 ${textSecondary}`}>Our team will review your dispute within 24 hours. You'll be notified of the resolution via Telegram.</p>
                  <button onClick={() => { setDisputeSuccess(false); navigate("my-deals"); }} className="mt-4 text-[hsl(224,71%,50%)] text-[14px] font-semibold press-effect">
                    View My Deals →
                  </button>
                </div>
              </StaggerItem>
            ) : (
              <StaggerItem index={0}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5 shadow-sm mt-2 space-y-4`}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className={`w-5 h-5 ${isDark ? "text-red-400" : "text-red-500"}`} />
                    <h3 className="font-semibold text-[16px]">Report an Issue</h3>
                  </div>
                  <p className={`text-[13px] ${textSecondary}`}>If you've been scammed, didn't receive your item, or there's a problem with a deal, file a dispute here.</p>

                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-1.5 block ${textSecondary}`}>Select Deal</label>
                    <select value={disputeDealId} onChange={e => setDisputeDealId(e.target.value)}
                      className={`w-full p-3 rounded-xl text-[14px] border outline-none input-focus ${inputBg} appearance-none`}>
                      <option value="">Choose a deal...</option>
                      {disputableDeals.map(d => (
                        <option key={d.deal_id} value={d.deal_id}>{d.deal_id} — ₦{d.amount.toLocaleString()} ({d.description.substring(0, 30)})</option>
                      ))}
                    </select>
                    {disputableDeals.length === 0 && (
                      <p className={`text-[11px] mt-1 ${textSecondary}`}>No active funded deals to dispute. Only funded deals can be disputed.</p>
                    )}
                  </div>

                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-1.5 block ${textSecondary}`}>Describe the Issue</label>
                    <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)} placeholder="Explain what went wrong in detail..."
                      className={`w-full p-3 rounded-xl text-[14px] border outline-none input-focus ${inputBg} min-h-[120px] resize-none`} maxLength={500} />
                    <p className={`text-[11px] mt-1 ${textSecondary}`}>{disputeReason.length}/500 characters</p>
                  </div>

                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-1.5 block ${textSecondary}`}>Upload Evidence (Optional)</label>
                    <label className={`w-full p-4 rounded-xl border-2 border-dashed ${isDark ? "border-white/10" : "border-black/10"} flex flex-col items-center gap-2 cursor-pointer press-effect`}>
                      <Upload className={`w-6 h-6 ${textSecondary}`} />
                      <span className={`text-[13px] ${textSecondary}`}>{disputeFile ? disputeFile.name : "Tap to upload screenshot"}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={e => setDisputeFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-red-500 text-[13px] font-medium">{error}</p>
                    </div>
                  )}

                  <button onClick={handleSubmitDispute} disabled={disputeSubmitting}
                    className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold py-3.5 rounded-xl text-[15px] press-effect disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-500/25">
                    {disputeSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                    {disputeSubmitting ? "Submitting..." : "Submit Dispute"}
                  </button>
                </div>
              </StaggerItem>
            )}

            {/* Active disputes tracker */}
            {allUserDeals.filter(d => d.status === "disputed").length > 0 && !disputeSuccess && (
              <StaggerItem index={1}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-4 shadow-sm mt-4`}>
                  <h3 className="font-semibold text-[14px] mb-3">Active Disputes</h3>
                  <div className="space-y-2.5">
                    {allUserDeals.filter(d => d.status === "disputed").map((d, i) => (
                      <div key={d.deal_id} className={`p-3 rounded-xl ${isDark ? "bg-red-500/10 border border-red-500/20" : "bg-red-50 border border-red-200"}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[12px]">{d.deal_id}</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"}`}>
                            {d.dispute_resolution ? "Resolved" : "Under Review"}
                          </span>
                        </div>
                        <p className={`text-[12px] ${textSecondary}`}>₦{d.amount.toLocaleString()} — {d.description.substring(0, 40)}</p>
                        {d.dispute_reason && <p className={`text-[11px] mt-1 ${isDark ? "text-red-400/70" : "text-red-500/70"}`}>Reason: {d.dispute_reason.substring(0, 60)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </StaggerItem>
            )}
          </div>
          <MiniFooter />
        </PageTransition>
        <BottomNav />
      </div>
    );
  }

  // ===== CONTACT SUPPORT =====
  if (view === "contact") {
    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <PageTransition direction={direction}>
          <Header title="Contact Support" />
          <div className="px-4 pb-8">
            <StaggerItem index={0}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5 shadow-sm mt-2`}>
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Phone className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-[18px] font-bold text-center mb-1">Need Help?</h3>
                <p className={`text-[13px] text-center ${textSecondary} mb-6`}>We're here to help! Reach out to us via any of the channels below.</p>

                <div className="space-y-3">
                  <a href="https://t.me/olafemiseyi" target="_blank" rel="noopener noreferrer"
                    className={`${isDark ? "bg-white/5 hover:bg-white/10" : "bg-black/[0.03] hover:bg-black/[0.06]"} w-full p-4 rounded-xl flex items-center gap-4 press-effect transition-colors`}>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-[14px]">Telegram</p>
                      <p className={`text-[12px] ${textSecondary}`}>@olafemiseyi</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 ${textSecondary}`} />
                  </a>

                  <a href="mailto:lightorbinnovations@gmail.com"
                    className={`${isDark ? "bg-white/5 hover:bg-white/10" : "bg-black/[0.03] hover:bg-black/[0.06]"} w-full p-4 rounded-xl flex items-center gap-4 press-effect transition-colors`}>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-400 to-red-500 flex items-center justify-center">
                      <Mail className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-[14px]">Email</p>
                      <p className={`text-[12px] ${textSecondary}`}>lightorbinnovations@gmail.com</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 ${textSecondary}`} />
                  </a>

                  <a href="tel:08025100844"
                    className={`${isDark ? "bg-white/5 hover:bg-white/10" : "bg-black/[0.03] hover:bg-black/[0.06]"} w-full p-4 rounded-xl flex items-center gap-4 press-effect transition-colors`}>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                      <Phone className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-[14px]">Phone / WhatsApp</p>
                      <p className={`text-[12px] ${textSecondary}`}>08025100844</p>
                    </div>
                    <ChevronRight className={`w-4 h-4 ${textSecondary}`} />
                  </a>
                </div>
              </div>
            </StaggerItem>

            <StaggerItem index={1}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-4 shadow-sm mt-3`}>
                <p className={`text-[12px] ${textSecondary} text-center`}>
                  ⏰ Support hours: Mon—Sat, 9 AM — 6 PM WAT<br />
                  Average response time: Under 1 hour
                </p>
              </div>
            </StaggerItem>
          </div>
          <MiniFooter />
        </PageTransition>
        <BottomNav />
      </div>
    );
  }

  // ===== FAQ / HOW IT WORKS =====
  if (view === "faq") {
    const faqItems = [
      { q: "How does escrow work?", a: "The buyer creates a deal, the seller accepts it, the buyer pays into escrow, the seller delivers, and the buyer confirms receipt. Once confirmed, the seller receives 95% of the amount automatically." },
      { q: "How much is the platform fee?", a: "5% of the deal amount, with a minimum fee of ₦300. For example: a ₦5,000 deal has a ₦300 fee, and the seller receives ₦4,700." },
      { q: "What is the maximum deal amount?", a: "₦20,000 per transaction. The minimum is ₦100." },
      { q: "Can I cancel a deal?", a: "Before payment: Yes, either party can cancel freely. Within 1 hour of payment: The buyer gets an automatic refund. After 1 hour: Open a dispute for admin review." },
      { q: "What happens if there's a problem?", a: "Open a dispute! Your funds are safely held in escrow until an admin reviews and resolves the issue. You can dispute from the deal detail page or the 'Raise Dispute' section." },
      { q: "How do I receive payment as a seller?", a: "Register your bank account in Settings. When a deal completes, 95% of the amount is automatically transferred to your bank. If you haven't registered, the admin will process it manually." },
      { q: "What if the seller doesn't deliver?", a: "If the seller doesn't mark delivery within a reasonable time, you can open a dispute. Additionally, funds auto-release 48 hours after delivery is marked if the buyer doesn't confirm." },
      { q: "Is my money safe?", a: "Absolutely! Funds are held securely in escrow and are only released when the buyer confirms receipt, or after admin dispute resolution. No one can access the funds without proper authorization." },
    ];

    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <PageTransition direction={direction}>
          <Header title="How It Works" />
          <div className="px-4 pb-8">
            {/* Flow diagram */}
            <StaggerItem index={0}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5 shadow-sm mt-2 mb-4`}>
                <h3 className="font-semibold text-[16px] mb-4">Transaction Flow</h3>
                <div className="space-y-3">
                  {[
                    { step: "1", title: "Create Deal", desc: "Buyer enters seller username, amount & description", color: "from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)]", emoji: "📝" },
                    { step: "2", title: "Seller Accepts", desc: "Seller reviews and accepts the deal terms", color: "from-orange-500 to-orange-600", emoji: "✅" },
                    { step: "3", title: "Buyer Pays", desc: "Buyer pays securely — funds held in escrow", color: "from-blue-500 to-blue-600", emoji: "💳" },
                    { step: "4", title: "Seller Delivers", desc: "Seller delivers product/service and marks it", color: "from-purple-500 to-purple-600", emoji: "📦" },
                    { step: "5", title: "Buyer Confirms", desc: "Buyer confirms receipt → funds released!", color: "from-emerald-500 to-emerald-600", emoji: "🎉" },
                  ].map((item, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0`}>{item.step}</div>
                        {i < 4 && <div className={`w-0.5 flex-1 mt-1 ${isDark ? "bg-white/10" : "bg-black/10"}`} />}
                      </div>
                      <div className="pb-3">
                        <p className="font-semibold text-[14px]">{item.emoji} {item.title}</p>
                        <p className={`text-[12px] ${textSecondary}`}>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </StaggerItem>

            {/* FAQ */}
            <StaggerItem index={1}>
              <h3 className="font-semibold text-[16px] mb-3 px-1">Frequently Asked Questions</h3>
            </StaggerItem>
            <div className="space-y-2">
              {faqItems.map((item, i) => (
                <StaggerItem key={i} index={i + 2}>
                  <details className={`${cardBg} border ${cardBorder} rounded-2xl shadow-sm group`}>
                    <summary className="px-4 py-3.5 cursor-pointer flex items-center gap-3 press-effect">
                      <HelpCircle className={`w-4 h-4 flex-shrink-0 ${isDark ? "text-amber-400" : "text-amber-500"}`} />
                      <span className="font-medium text-[14px] flex-1">{item.q}</span>
                      <ChevronRight className={`w-4 h-4 ${textSecondary} transition-transform group-open:rotate-90`} />
                    </summary>
                    <div className={`px-4 pb-4 pt-0`}>
                      <p className={`text-[13px] leading-relaxed ${textSecondary}`}>{item.a}</p>
                    </div>
                  </details>
                </StaggerItem>
              ))}
            </div>
          </div>
          <MiniFooter />
        </PageTransition>
        <BottomNav />
      </div>
    );
  }

  // ===== HISTORY =====
  if (view === "history") {
    const completedDeals = deals.filter(d => ["completed", "refunded"].includes(d.status));
    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <PageTransition direction={direction}>
          <Header title="Transaction History" />
          <div className="px-4 pb-8">
            <p className={`text-[14px] mb-4 ${textSecondary}`}>{completedDeals.length} completed transaction{completedDeals.length !== 1 ? "s" : ""}</p>
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[hsl(224,71%,50%)]" /></div>
            ) : completedDeals.length === 0 ? (
              <StaggerItem index={0}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-10 text-center shadow-sm`}>
                  <History className={`w-12 h-12 mx-auto mb-3 ${textSecondary}`} />
                  <p className="font-semibold text-[15px]">No history yet</p>
                  <p className={`text-[13px] mt-1 ${textSecondary}`}>Completed deals will appear here</p>
                </div>
              </StaggerItem>
            ) : (
              <div className="space-y-2">
                {completedDeals.map((deal, i) => {
                  const isBuyer = usernameMatch(deal.buyer_telegram, uname);
                  const st = statusConfig[deal.status] || statusConfig.completed;
                  return (
                    <StaggerItem key={deal.id} index={i}>
                      <button onClick={() => { setSelectedDeal(deal); navigate("deal-detail"); }}
                        className={`${cardBg} border ${cardBorder} w-full p-4 rounded-2xl text-left press-effect shadow-sm`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="font-semibold text-[14px] leading-tight line-clamp-1">{deal.description}</p>
                            <p className={`text-[11px] mt-0.5 ${textSecondary}`}>{isBuyer ? "🛒 Bought" : "📦 Sold"} · {new Date(deal.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</p>
                          </div>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 font-medium ${st.bg} ${st.text}`}>
                            {st.icon} {st.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className={`text-[12px] ${textSecondary}`}>{isBuyer ? `→ ${deal.seller_telegram}` : `← ${deal.buyer_telegram}`}</p>
                          <p className="font-bold text-[15px]">{isBuyer ? "-" : "+"}₦{deal.amount.toLocaleString()}</p>
                        </div>
                      </button>
                    </StaggerItem>
                  );
                })}
              </div>
            )}
          </div>
          <MiniFooter />
        </PageTransition>
        <BottomNav />
      </div>
    );
  }

  // ===== SETTINGS =====
  if (view === "settings") {
    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <PageTransition direction={direction}>
          <Header title="Settings" />
          <div className="px-4 pb-8">
            {/* Profile Card */}
            <StaggerItem index={0}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5 shadow-sm mb-4 mt-2`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden bg-gradient-to-br from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)] flex items-center justify-center">
                    {tgUser?.photoUrl ? (
                      <img src={tgUser.photoUrl} alt={`${tgUser.firstName} profile`} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <User className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-[15px]">{tgUser?.firstName}{tgUser?.lastName ? ` ${tgUser.lastName}` : ""}</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-[13px] ${textSecondary}`}>@{tgUser?.username}</p>
                      {avgRating !== "—" && (
                        <span className="flex items-center gap-0.5 text-[11px] text-amber-500">
                          <Star className="w-3 h-3 fill-amber-500" />{avgRating} ({ratingsReceived.length})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`h-px ${isDark ? "bg-white/5" : "bg-black/[0.04]"} mb-4`} />
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className={`text-[13px] ${textSecondary}`}>Total deals</span>
                    <span className="text-[13px] font-medium">{allUserDeals.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`text-[13px] ${textSecondary}`}>Completed</span>
                    <span className="text-[13px] font-medium">{completedBuys + completedSells}</span>
                  </div>
                </div>
              </div>
            </StaggerItem>

            {/* Bank Details */}
            <StaggerItem index={1}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5 shadow-sm`}>
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className={`w-4 h-4 ${isDark ? "text-emerald-400" : "text-emerald-500"}`} />
                  <h3 className="font-semibold text-[14px]">Bank Account</h3>
                </div>
                <p className={`text-[12px] mb-4 ${textSecondary}`}>Add your bank details to receive payouts</p>

                {profileLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-[hsl(224,71%,50%)]" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className={`text-[12px] font-semibold uppercase tracking-wider mb-1.5 block ${textSecondary}`}>Bank Name</label>
                      <select value={bankName} onChange={(e) => setBankName(e.target.value)}
                        className={`w-full p-3 rounded-xl text-[14px] border outline-none input-focus ${inputBg} appearance-none`}>
                        <option value="">Select bank...</option>
                        {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={`text-[12px] font-semibold uppercase tracking-wider mb-1.5 block ${textSecondary}`}>Account Number</label>
                      <input type="text" inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="0123456789"
                        className={`w-full p-3 rounded-xl text-[14px] border outline-none input-focus ${inputBg}`} maxLength={10} />
                    </div>
                    <div>
                      <label className={`text-[12px] font-semibold uppercase tracking-wider mb-1.5 block ${textSecondary}`}>Account Name</label>
                      <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="John Doe"
                        className={`w-full p-3 rounded-xl text-[14px] border outline-none input-focus ${inputBg}`} maxLength={100} />
                    </div>

                    {error && (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <p className="text-red-500 text-[13px] font-medium">{error}</p>
                      </div>
                    )}

                    {profileSuccess && (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        <p className="text-emerald-500 text-[13px] font-medium">Bank details saved!</p>
                      </div>
                    )}

                    <button onClick={handleSaveProfile} disabled={savingProfile}
                      className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold py-3 rounded-xl text-[14px] press-effect disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 mt-1">
                      {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                      {savingProfile ? "Saving..." : "Save Bank Details"}
                    </button>
                  </div>
                )}
              </div>
            </StaggerItem>
          </div>
          <MiniFooter />
        </PageTransition>
        <BottomNav />
      </div>
    );
  }

  // ===== NEW DEAL =====
  if (view === "new-deal") {
    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <PageTransition direction={direction}>
          <Header title="New Deal" />
          <div className="px-4 pb-8">
            <p className={`text-[14px] mb-4 ${textSecondary}`}>You're the buyer — enter the seller's details</p>

            {successDeal ? (
              <StaggerItem index={0}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-8 text-center shadow-sm`}>
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="text-lg font-bold">Deal Created!</p>
                  <p className={`text-sm mt-1 font-mono ${textSecondary}`}>{successDeal}</p>
                  <p className={`text-xs mt-2 ${textSecondary}`}>Waiting for seller to accept.</p>
                </div>
              </StaggerItem>
            ) : (
              <StaggerItem index={0}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5 shadow-sm space-y-4`}>
                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-2 block ${textSecondary}`}>Seller Username</label>
                    <input value={sellerUsername} onChange={(e) => setSellerUsername(e.target.value)} placeholder="@username"
                      className={`w-full p-3.5 rounded-xl text-[15px] border outline-none input-focus ${inputBg}`} />
                  </div>
                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-2 block ${textSecondary}`}>Amount (₦)</label>
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100 – 20,000"
                      className={`w-full p-3.5 rounded-xl text-[15px] border outline-none input-focus ${inputBg}`} />
                  </div>
                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-2 block ${textSecondary}`}>Description</label>
                    <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you buying?"
                      className={`w-full p-3.5 rounded-xl text-[15px] border outline-none input-focus ${inputBg}`} maxLength={200} />
                  </div>

                  {amount && parseInt(amount) >= 100 && parseInt(amount) <= 20000 && (
                    <div className={`p-3.5 rounded-xl text-[13px] border ${cardBorder} ${isDark ? "bg-white/[0.02]" : "bg-black/[0.015]"}`}>
                      <div className="flex justify-between mb-1">
                        <span className={textSecondary}>Platform fee (5%)</span>
                        <span className="font-medium">₦{Math.max(300, Math.round(parseInt(amount) * 0.05)).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={textSecondary}>Seller receives</span>
                        <span className="font-semibold text-emerald-500">₦{(parseInt(amount) - Math.max(300, Math.round(parseInt(amount) * 0.05))).toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-red-500 text-[13px] font-medium">{error}</p>
                    </div>
                  )}

                  <button onClick={handleCreateDeal} disabled={creating}
                    className="w-full bg-gradient-to-r from-[hsl(224,71%,40%)] to-[hsl(224,71%,52%)] text-white font-semibold py-3.5 rounded-xl text-[15px] press-effect disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[hsl(224,71%,40%)/0.25] mt-2">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {creating ? "Creating Deal..." : "Create Deal"}
                  </button>
                </div>
              </StaggerItem>
            )}
          </div>
          <MiniFooter />
        </PageTransition>
        <BottomNav />
      </div>
    );
  }

  // ===== MY DEALS =====
  if (view === "my-deals") {
    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <RatingModal />
        <PageTransition direction={direction}>
          <Header title="My Deals" />
          <div className="px-4 pb-8">
            <p className={`text-[14px] mb-4 ${textSecondary}`}>{deals.length} transaction{deals.length !== 1 ? "s" : ""}</p>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-[hsl(224,71%,50%)]" />
                <p className={`text-[13px] ${textSecondary}`}>Loading deals...</p>
              </div>
            ) : deals.length === 0 ? (
              <StaggerItem index={0}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-10 text-center shadow-sm`}>
                  <List className={`w-12 h-12 mx-auto mb-3 ${textSecondary}`} />
                  <p className="font-semibold text-[15px]">No deals yet</p>
                  <p className={`text-[13px] mt-1 ${textSecondary}`}>Create your first secure transaction</p>
                  <button onClick={() => navigate("new-deal")} className="mt-4 text-[hsl(224,71%,50%)] text-[14px] font-semibold press-effect">Create Deal →</button>
                </div>
              </StaggerItem>
            ) : (
              <div className="space-y-2">
                {deals.map((deal, i) => {
                  const st = statusConfig[deal.status] || statusConfig.pending;
                  const isBuyer = usernameMatch(deal.buyer_telegram, `@${tgUser?.username}`);
                  const isSeller = usernameMatch(deal.seller_telegram, `@${tgUser?.username}`);
                  const statusLabel = deal.status === "funded" && deal.delivered_at ? "Delivered" : st.label;
                  const needsAction = (isSeller && deal.status === "pending") ||
                    (isBuyer && deal.status === "accepted") ||
                    (isBuyer && deal.status === "funded" && deal.delivered_at);
                  return (
                    <StaggerItem key={deal.id} index={i}>
                      <button onClick={() => { setSelectedDeal(deal); navigate("deal-detail"); }}
                        className={`${cardBg} border ${needsAction ? (isDark ? "border-amber-500/30" : "border-amber-300") : cardBorder} w-full p-4 rounded-2xl text-left press-effect shadow-sm ${needsAction ? "ring-1 ring-amber-500/20" : ""}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="font-semibold text-[14px] leading-tight line-clamp-1">{deal.description}</p>
                            <p className={`text-[11px] mt-0.5 ${textSecondary}`}>{isBuyer ? "🛒 You're buying" : "📦 You're selling"}</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {needsAction && <span className="w-2 h-2 rounded-full bg-amber-500 badge-pulse" />}
                            <span className={`text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 font-medium ${st.bg} ${st.text}`}>
                              {deal.status === "funded" && deal.delivered_at ? <Package className="w-3 h-3" /> : st.icon} {statusLabel}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className={`text-[12px] ${textSecondary}`}>{isBuyer ? `→ ${deal.seller_telegram}` : `← ${deal.buyer_telegram}`}</p>
                          <p className="font-bold text-[15px]">₦{deal.amount.toLocaleString()}</p>
                        </div>
                      </button>
                    </StaggerItem>
                  );
                })}
              </div>
            )}
          </div>
          <MiniFooter />
        </PageTransition>
        <BottomNav />
      </div>
    );
  }

  // ===== DEAL DETAIL =====
  if (view === "deal-detail" && selectedDeal) {
    const st = statusConfig[selectedDeal.status] || statusConfig.pending;
    const isBuyer = usernameMatch(selectedDeal.buyer_telegram, `@${tgUser?.username}`);
    const isSeller = usernameMatch(selectedDeal.seller_telegram, `@${tgUser?.username}`);

    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <RatingModal />
        <PageTransition direction={direction}>
          <Header title="Deal Details" backTo="my-deals" />
          <div className="px-4 pb-8">
            <StaggerItem index={0}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl overflow-hidden shadow-sm`}>
                <div className={`px-5 py-3 flex items-center justify-between border-b ${cardBorder}`}>
                  <div>
                    <span className="font-mono text-[12px] text-muted-foreground">{selectedDeal.deal_id}</span>
                    <p className={`text-[11px] mt-0.5 ${textSecondary}`}>{isBuyer ? "🛒 You're the buyer" : isSeller ? "📦 You're the seller" : "Participant"}</p>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1 font-semibold ${st.bg} ${st.text}`}>
                    {st.icon} {selectedDeal.status === "funded" && selectedDeal.delivered_at ? "Delivered" : st.label}
                  </span>
                </div>

                <div className="text-center py-6">
                  <p className={`text-[12px] ${textSecondary} mb-1`}>Amount</p>
                  <p className="text-[32px] font-bold tracking-tight">₦{selectedDeal.amount.toLocaleString()}</p>
                  <p className={`text-[12px] mt-1 ${textSecondary}`}>
                    Fee: ₦{selectedDeal.fee.toLocaleString()} · Seller gets: ₦{(selectedDeal.amount - selectedDeal.fee).toLocaleString()}
                  </p>
                </div>

                {/* Progress tracker */}
                <div className={`border-t ${cardBorder} px-5 py-4`}>
                  <p className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${textSecondary}`}>Progress</p>
                  <div className="flex items-center gap-1">
                    {[
                      { label: "Created", done: true },
                      { label: "Accepted", done: ["accepted", "funded", "completed"].includes(selectedDeal.status) },
                      { label: "Paid", done: ["funded", "completed"].includes(selectedDeal.status) },
                      { label: "Delivered", done: !!selectedDeal.delivered_at || selectedDeal.status === "completed" },
                      { label: "Confirmed", done: selectedDeal.status === "completed" },
                    ].map((step, i) => (
                      <div key={i} className="flex items-center gap-1 flex-1">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${step.done ? "bg-emerald-500 text-white" : (isDark ? "bg-white/10 text-white/30" : "bg-black/5 text-black/20")}`}>
                          {step.done ? "✓" : i + 1}
                        </div>
                        {i < 4 && <div className={`h-0.5 flex-1 rounded ${step.done ? "bg-emerald-500" : (isDark ? "bg-white/10" : "bg-black/5")}`} />}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-1">
                    {["Created", "Accepted", "Paid", "Delivered", "Done"].map((l, i) => (
                      <span key={i} className={`text-[8px] ${textSecondary} flex-1 text-center`}>{l}</span>
                    ))}
                  </div>
                </div>

                <div className={`border-t ${cardBorder} px-5 py-4 space-y-3`}>
                  {[
                    { label: "Description", value: selectedDeal.description },
                    { label: "Buyer", value: selectedDeal.buyer_telegram },
                    { label: "Seller", value: selectedDeal.seller_telegram },
                    { label: "Created", value: new Date(selectedDeal.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between items-center">
                      <span className={`text-[13px] ${textSecondary}`}>{row.label}</span>
                      <span className="text-[13px] font-medium text-right max-w-[55%] truncate">{row.value}</span>
                    </div>
                  ))}
                </div>

                {/* SELLER: Accept/Decline pending */}
                {isSeller && selectedDeal.status === "pending" && (
                  <div className={`border-t ${cardBorder} p-4 space-y-2`}>
                    <button onClick={() => handleAcceptDeal(selectedDeal)} disabled={actionLoading}
                      className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold py-3.5 rounded-xl text-[15px] press-effect shadow-lg shadow-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      ✅ Accept Deal
                    </button>
                    <button onClick={() => handleDeclineDeal(selectedDeal)} disabled={actionLoading}
                      className={`w-full font-semibold py-3.5 rounded-xl text-[15px] press-effect disabled:opacity-50 ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"} flex items-center justify-center gap-2`}>
                      🚫 Decline Deal
                    </button>
                    <p className={`text-[11px] mt-2 text-center ${textSecondary}`}>Accept to let the buyer proceed with payment</p>
                  </div>
                )}

                {/* BUYER: Waiting for seller */}
                {isBuyer && selectedDeal.status === "pending" && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                        ⏳ Waiting for seller to accept. You'll be notified once they accept.
                      </p>
                    </div>
                  </div>
                )}

                {/* BUYER: Pay accepted deal */}
                {isBuyer && selectedDeal.status === "accepted" && selectedDeal.paystack_payment_link && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <a href={selectedDeal.paystack_payment_link} target="_blank" rel="noopener noreferrer"
                      className="block w-full bg-gradient-to-r from-[hsl(224,71%,40%)] to-[hsl(224,71%,52%)] text-white text-center font-semibold py-3.5 rounded-xl text-[15px] press-effect shadow-lg shadow-[hsl(224,71%,40%)/0.25]">
                      💳 Pay ₦{selectedDeal.amount.toLocaleString()}
                    </a>
                    <p className={`text-[11px] mt-2 text-center ${textSecondary}`}>Seller has accepted! Tap to pay securely.</p>
                  </div>
                )}

                {isBuyer && selectedDeal.status === "accepted" && !selectedDeal.paystack_payment_link && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-orange-500/10 border border-orange-500/20" : "bg-orange-50 border border-orange-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-orange-400" : "text-orange-600"}`}>
                        🎉 Seller accepted! Use the Telegram chat to tap "💳 Pay" to generate your payment link.
                      </p>
                    </div>
                  </div>
                )}

                {/* SELLER: Waiting for payment */}
                {isSeller && selectedDeal.status === "accepted" && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-orange-500/10 border border-orange-500/20" : "bg-orange-50 border border-orange-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-orange-400" : "text-orange-600"}`}>
                        ✅ You accepted! Waiting for buyer to pay.
                      </p>
                    </div>
                  </div>
                )}

                {/* SELLER: Mark Delivered */}
                {isSeller && selectedDeal.status === "funded" && !selectedDeal.delivered_at && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <button onClick={() => handleMarkDelivered(selectedDeal)} disabled={actionLoading}
                      className="w-full bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold py-3.5 rounded-xl text-[15px] press-effect shadow-lg shadow-purple-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                      📦 Mark as Delivered
                    </button>
                    <p className={`text-[11px] mt-2 text-center ${textSecondary}`}>Tap once you've delivered to the buyer</p>
                  </div>
                )}

                {/* SELLER: Delivered, waiting */}
                {isSeller && selectedDeal.status === "funded" && selectedDeal.delivered_at && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                        ✅ Delivered! Waiting for buyer to confirm. ₦{(selectedDeal.amount - selectedDeal.fee).toLocaleString()} will be sent to your bank.
                      </p>
                    </div>
                  </div>
                )}

                {/* BUYER: Confirm receipt */}
                {isBuyer && selectedDeal.status === "funded" && selectedDeal.delivered_at && (
                  <div className={`border-t ${cardBorder} p-4 space-y-2`}>
                    <div className={`p-3 rounded-xl mb-2 ${isDark ? "bg-purple-500/10 border border-purple-500/20" : "bg-purple-50 border border-purple-200"}`}>
                      <p className={`text-[12px] font-medium ${isDark ? "text-purple-400" : "text-purple-600"}`}>📦 Seller has marked this as delivered!</p>
                    </div>
                    <button onClick={() => handleConfirmReceived(selectedDeal)} disabled={actionLoading}
                      className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold py-3.5 rounded-xl text-[15px] press-effect shadow-lg shadow-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      ✅ Confirm Received — Release Funds
                    </button>
                    <button onClick={() => handleOpenDispute(selectedDeal)} disabled={actionLoading}
                      className={`w-full font-semibold py-3.5 rounded-xl text-[15px] press-effect disabled:opacity-50 ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                      ⚠️ Open Dispute
                    </button>
                  </div>
                )}

                {/* BUYER: Funded, no delivery */}
                {isBuyer && selectedDeal.status === "funded" && !selectedDeal.delivered_at && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                        💰 Payment confirmed! Waiting for seller to deliver.
                      </p>
                    </div>
                    <button onClick={() => handleOpenDispute(selectedDeal)} disabled={actionLoading}
                      className={`w-full mt-2 font-semibold py-3.5 rounded-xl text-[15px] press-effect disabled:opacity-50 ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                      ⚠️ Open Dispute
                    </button>
                  </div>
                )}

                {/* Refund status */}
                {selectedDeal.refund_status && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-orange-500/10 border border-orange-500/20" : "bg-orange-50 border border-orange-200"}`}>
                      <p className={`text-[12px] font-semibold mb-2 ${isDark ? "text-orange-400" : "text-orange-600"}`}>💸 Refund Status</p>
                      <div className="flex items-center gap-2">
                        {["initiated", "processing", "completed"].map((step, i) => {
                          const stages = ["initiated", "processing", "completed"];
                          const currentIdx = stages.indexOf(selectedDeal.refund_status || "");
                          const done = i <= currentIdx;
                          return (
                            <div key={step} className="flex items-center gap-2 flex-1">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${done ? "bg-orange-500 text-white" : (isDark ? "bg-white/10 text-white/30" : "bg-black/5 text-black/20")}`}>
                                {done ? "✓" : i + 1}
                              </div>
                              <span className={`text-[11px] capitalize ${done ? (isDark ? "text-orange-400" : "text-orange-600") : textSecondary}`}>{step}</span>
                              {i < 2 && <div className={`h-0.5 flex-1 rounded ${i < currentIdx ? "bg-orange-500" : (isDark ? "bg-white/10" : "bg-black/5")}`} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Completed */}
                {selectedDeal.status === "completed" && !selectedDeal.dispute_resolution?.includes("declined") && !selectedDeal.dispute_resolution?.includes("cancelled") && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-emerald-50 border border-emerald-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                        🎉 Deal complete! {isSeller ? `₦${(selectedDeal.amount - selectedDeal.fee).toLocaleString()} released to you.` : "Funds released to seller."}
                      </p>
                    </div>
                    {/* Rate button for completed deals */}
                    <button onClick={() => { setRatingDealId(selectedDeal.deal_id); setRatingValue(0); setRatingComment(""); setShowRatingModal(true); }}
                      className={`w-full mt-2 font-semibold py-3 rounded-xl text-[14px] press-effect ${isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-amber-50 text-amber-600 border border-amber-200"} flex items-center justify-center gap-2`}>
                      <Star className="w-4 h-4" /> Rate This Deal
                    </button>
                  </div>
                )}

                {/* Disputed */}
                {selectedDeal.status === "disputed" && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-red-500/10 border border-red-500/20" : "bg-red-50 border border-red-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-red-400" : "text-red-600"}`}>
                        ⚠️ Under dispute. Admin will review and resolve. Funds are safely held.
                      </p>
                      {selectedDeal.dispute_reason && (
                        <p className={`text-[12px] mt-1 ${isDark ? "text-red-400/60" : "text-red-500/60"}`}>Reason: {selectedDeal.dispute_reason}</p>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-red-500 text-[13px] font-medium">{error}</p>
                    </div>
                  </div>
                )}
              </div>
            </StaggerItem>
          </div>
          <MiniFooter />
        </PageTransition>
        <BottomNav />
      </div>
    );
  }

  return null;
}
