import { usePlatformSettings, useUpdateSetting, useAuditLog } from "@/hooks/use-deals";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Settings, Save, Shield, Percent, Banknote, Moon, Sun, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: settings, isLoading } = usePlatformSettings();
  const updateSetting = useUpdateSetting();
  const auditLog = useAuditLog();
  const { theme, toggle } = useTheme();

  const [maxAmount, setMaxAmount] = useState("");
  const [feePercent, setFeePercent] = useState("");
  const [minFee, setMinFee] = useState("");
  const [autoReleaseHours, setAutoReleaseHours] = useState("");
  const [webhookValidation, setWebhookValidation] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  useEffect(() => {
    if (settings) {
      setMaxAmount(settings.max_deal_amount || "20000");
      setFeePercent(settings.platform_fee_percent || "5");
      setMinFee(settings.min_platform_fee || "300");
      setAutoReleaseHours(settings.auto_release_hours || "48");
      setWebhookValidation(settings.webhook_validation === "true");
      setAdminName(settings.admin_name || "Admin");
      setAdminEmail(settings.admin_email || "admin@trustpay9ja.ng");
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      // Upsert admin_name and admin_email (they may not exist yet)
      for (const { key, value } of [
        { key: "admin_name", value: adminName },
        { key: "admin_email", value: adminEmail },
      ]) {
        const { data: existing } = await supabase
          .from("platform_settings")
          .select("id")
          .eq("key", key)
          .limit(1);
        if (existing && existing.length > 0) {
          await updateSetting.mutateAsync({ key, value });
        } else {
          await supabase.from("platform_settings").insert({ key, value });
        }
      }

      await Promise.all([
        updateSetting.mutateAsync({ key: "max_deal_amount", value: maxAmount }),
        updateSetting.mutateAsync({ key: "platform_fee_percent", value: feePercent }),
        updateSetting.mutateAsync({ key: "min_platform_fee", value: minFee }),
        updateSetting.mutateAsync({ key: "auto_release_hours", value: autoReleaseHours }),
        updateSetting.mutateAsync({ key: "webhook_validation", value: webhookValidation ? "true" : "false" }),
      ]);
      await auditLog.mutateAsync({ action: "settings_updated", actor: adminName, details: { maxAmount, feePercent, minFee, autoReleaseHours, webhookValidation, adminName, adminEmail } });
      toast({ title: "Settings saved", description: "Your configuration has been updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    }
  };

  if (isLoading) return <div className="glass-card p-8 text-center text-muted-foreground">Loading settings...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Configure your escrow platform</p>
        </div>
      </div>

      {/* Theme Toggle */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === "dark" ? <Moon className="w-4 h-4 text-accent" /> : <Sun className="w-4 h-4 text-accent" />}
            <div>
              <p className="text-sm font-medium">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Toggle between light and dark theme</p>
            </div>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={toggle} />
        </div>
      </div>

      {/* Admin Profile */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <User className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Admin Profile</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Display Name</label>
            <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} className="h-10" placeholder="Admin" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Email Address</label>
            <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="h-10" placeholder="admin@trustpay9ja.ng" />
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Banknote className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Transaction Limits</h3>
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">Max Deal Amount (₦)</label>
          <Input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="h-10" />
        </div>
      </div>

      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Percent className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-sm">Fee Configuration</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Platform Fee (%)</label>
            <Input value={feePercent} onChange={(e) => setFeePercent(e.target.value)} className="h-10" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Minimum Fee (₦)</label>
            <Input value={minFee} onChange={(e) => setMinFee(e.target.value)} className="h-10" />
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Security & Automation</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Validate Paystack Webhooks</p>
              <p className="text-xs text-muted-foreground">Verify webhook signatures for security</p>
            </div>
            <Switch checked={webhookValidation} onCheckedChange={setWebhookValidation} />
          </div>
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-Release Timer</p>
                <p className="text-xs text-muted-foreground">Hours before auto-releasing funds</p>
              </div>
            </div>
            <div className="mt-3 max-w-[200px]">
              <Input value={autoReleaseHours} onChange={(e) => setAutoReleaseHours(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-11 px-8" disabled={updateSetting.isPending}>
        <Save className="w-4 h-4 mr-2" />
        {updateSetting.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
