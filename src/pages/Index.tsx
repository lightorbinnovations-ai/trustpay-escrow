import { useState, useEffect, useCallback } from "react";
import DashboardSidebar from "@/components/DashboardSidebar";
import LoginPage from "./LoginPage";
import MobileNav from "@/components/MobileNav";
import NotificationsPanel from "@/components/NotificationsPanel";
import PoweredByFooter from "@/components/PoweredByFooter";
import OverviewPage from "./OverviewPage";
import DealsPage from "./DealsPage";
import DisputesPage from "./DisputesPage";
import AnalyticsPage from "./AnalyticsPage";
import HistoryPage from "./HistoryPage";
import SettingsPage from "./SettingsPage";
import TransactionsPage from "./TransactionsPage";
import ListingsPage from "./ListingsPage";
import UsersPage from "./UsersPage";
import { supabase } from "@/integrations/supabase/client";

const pages: Record<string, React.FC> = {
  overview: OverviewPage,
  deals: DealsPage,
  transactions: TransactionsPage,
  listings: ListingsPage,
  users: UsersPage,
  disputes: DisputesPage,
  analytics: AnalyticsPage,
  history: HistoryPage,
  settings: SettingsPage,
};

const Index = () => {
  const [active, setActive] = useState("overview");
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [adminAuth, setAdminAuth] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string>(() => {
    return localStorage.getItem("notif_last_seen") || new Date(0).toISOString();
  });

  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    setLastSeenAt(now);
    localStorage.setItem("notif_last_seen", now);
    setUnreadCount(0);
  }, []);

  // Fetch unread count (audit logs created after last seen)
  useEffect(() => {
    async function fetchCount() {
      const { count } = await supabase
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .gt("created_at", lastSeenAt);
      setUnreadCount(count || 0);
    }
    fetchCount();

    const channel = supabase
      .channel("notif-count")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, () => {
        setUnreadCount((c) => c + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lastSeenAt]);

  const Page = pages[active] || OverviewPage;

  if (!adminAuth) {
    return <LoginPage onLogin={() => setAdminAuth(true)} />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar active={active} onNavigate={setActive} unreadCount={unreadCount} onNotifications={() => setNotifOpen(true)} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileNav active={active} onNavigate={setActive} unreadCount={unreadCount} onNotifications={() => setNotifOpen(true)} />
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full">
          <Page />
        </main>
        <PoweredByFooter />
      </div>
      <NotificationsPanel open={notifOpen} onClose={() => { setNotifOpen(false); markSeen(); }} />
    </div>
  );
};

export default Index;
