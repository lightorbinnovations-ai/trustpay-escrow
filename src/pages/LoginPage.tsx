import { useState, useEffect } from "react";
import { Shield, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  onLogin: (username: string) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Check if opened from Telegram WebApp context
    const tgWebApp = (window as any).Telegram?.WebApp;
    if (tgWebApp?.initDataUnsafe?.user) {
      const user = tgWebApp.initDataUnsafe.user;
      verifyAdmin(user.id, user.username || "");
    } else {
      // Check URL params for admin token
      const params = new URLSearchParams(window.location.search);
      const adminToken = params.get("admin_token");
      if (adminToken) {
        verifyByToken(adminToken);
      } else {
        setChecking(false);
      }
    }
  }, []);

  async function verifyAdmin(telegramId: number, username: string) {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-admin", {
        body: { telegram_id: telegramId, username },
      });
      if (fnError) throw fnError;
      if (data?.authorized) {
        onLogin(username);
      } else {
        setError("You are not authorized to access this dashboard.");
        setChecking(false);
      }
    } catch {
      setError("Failed to verify admin access.");
      setChecking(false);
    }
  }

  async function verifyByToken(token: string) {
    // Token = base64(telegram_id:username)
    try {
      const decoded = atob(token);
      const [id, username] = decoded.split(":");
      if (id && username) {
        await verifyAdmin(parseInt(id), username);
      } else {
        setError("Invalid admin token.");
        setChecking(false);
      }
    } catch {
      setError("Invalid admin token.");
      setChecking(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground text-sm">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Shield className="w-8 h-8 text-accent-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-primary-foreground">TrustPay9ja Admin</h1>
          <p className="text-primary-foreground/60 text-sm mt-1">Secure admin access via Telegram</p>
        </div>

        <div className="bg-card rounded-2xl shadow-xl p-8">
          {error ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                <p className="text-destructive text-sm font-medium text-center">{error}</p>
              </div>
              <p className="text-muted-foreground text-sm text-center">
                Admin access is restricted to the authorized Telegram account only.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-foreground text-sm text-center">
                To access the admin dashboard, use the admin link from your Telegram bot, or open this page within Telegram.
              </p>
              <a href="https://t.me/TrustPay9jaBot" target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-colors">
                <ExternalLink className="w-4 h-4" />
                Open TrustPay9ja Bot
              </a>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-6">
            🔒 Protected admin panel · Telegram-verified access only
          </p>
        </div>
      </div>
    </div>
  );
}
