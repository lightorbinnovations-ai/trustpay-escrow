import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { marketSupabase } from "@/integrations/supabase/market-client";
import { Globe, Shield, Plus, List, AlertTriangle, CheckCircle, Clock, Loader2, ArrowLeft, Send, ChevronRight, Sparkles, Package, Bell, ShoppingCart, Store, TrendingUp, Wallet, ArrowDownLeft, ArrowUpRight, Settings, CreditCard, User, Menu, X, Home, FileText, Phone, HelpCircle, History as HistoryIcon, Star, MessageCircle, Mail, Upload, Camera, Zap, Search, Headset, ExternalLink, ShieldCheck, Archive } from "lucide-react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
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
          start_param?: string;
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

function usernameMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase().replace(/^@/, "") === b.toLowerCase().replace(/^@/, "");
}

const translations = {
  en: {
    common: {
      loading: "Loading TrustPay9ja...",
      error: "Error",
      success: "Success",
      back: "Back",
      save: "Save",
      submit: "Submit",
      cancel: "Cancel",
      search: "Search deals or users",
      confirm: "Confirm",
      view_details: "View Details",
      amount: "Amount",
      description: "Description",
      status: "Status",
      date: "Date"
    },
    home: {
      greeting: "Hi",
      what_need: "What do you need today?",
      stats: "Recent Stats",
      buys: "Deals as Buyer",
      sells: "Deals as Seller",
      active_deals: "Active Transactions",
      view_all: "View All",
      no_deals: "No active deals",
      create_btn: "New Deal",
      pending_attention: "deals need your attention",
      pending_attention_single: "deal needs your attention",
      active_overview: "Active Overview",
      how_it_works: "How it works",
      learn_more: "Learn more",
      active_as_buyer: "Active as buyer",
      active_as_seller: "Active as seller",
      disputes: "Disputes",
      total_transactions: "Total transactions"
    },
    deals: {
      header: "My Deals",
      tab_all: "All",
      tab_buying: "Buying",
      tab_selling: "Selling",
      no_deals: "No deals yet",
      create_first: "Create your first secure transaction",
      buying_label: "You're buying",
      selling_label: "You're selling",
      delivered: "Delivered",
      needs_action: "Needs action",
      loading_deals: "Loading deals..."
    },
    details: {
      header: "Deal Details",
      participants: {
        buyer: "You're the buyer",
        seller: "You're the seller",
        participant: "Participant"
      },
      fee_info: "Fee: ₦{fee} · Seller gets: ₦{payout}",
      progress: {
        header: "Progress",
        created: "Created",
        accepted: "Accepted",
        paid: "Paid",
        delivered: "Delivered",
        confirmed: "Confirmed",
        done: "Done"
      },
      fields: {
        description: "Description",
        buyer: "Buyer",
        seller: "Seller",
        created: "Created"
      },
      actions: {
        accept: "Accept Deal",
        decline: "Decline Deal",
        accept_hint: "Accept to let the buyer proceed with payment",
        waiting_seller: "Waiting for seller to accept. You'll be notified once they accept.",
        pay_btn: "Pay ₦{amount}",
        pay_hint: "Seller has accepted! Tap to pay securely.",
        pay_telegram_hint: "Seller accepted! Use the Telegram chat to tap \"Pay\" to generate your payment link.",
        waiting_payment: "You accepted! Waiting for buyer to pay.",
        mark_delivered: "Mark as Delivered",
        delivered_hint: "Tap once you've delivered to the buyer",
        waiting_confirmation: "Delivered! Waiting for buyer to confirm. Payout will be sent to your bank.",
        confirm_received: "Confirm Received — Release Funds",
        open_dispute: "Open Dispute",
        seller_marked: "Seller has marked this as delivered!",
        payment_confirmed: "Payment confirmed! Waiting for seller to deliver.",
        refund_status: "Refund Status",
        deal_complete: "Deal complete!",
        payout_released: "₦{amount} released to you.",
        funds_released: "Funds released to seller.",
        rate_deal: "Rate This Deal",
        under_dispute: "Under dispute. Admin will review and resolve. Funds are safely held."
      }
    },
    new_deal: {
      header: "New Deal",
      buyer_hint: "You're the buyer — enter the seller's details",
      created: "Deal Created!",
      waiting: "Waiting for seller to accept.",
      form: {
        seller: "Seller Username",
        amount: "Amount (₦)",
        description: "Description",
        placeholder_user: "@username",
        placeholder_amount: "100 – 20,000",
        placeholder_desc: "What are you buying?",
        fee_label: "Platform fee (5%)",
        seller_receives: "Seller receives"
      }
    },
    dispute: {
      header: "Raise Dispute",
      submitted: "Dispute Submitted!",
      desc: "Our team will review your dispute within 24 hours. You'll be notified of the resolution via Telegram.",
      view_deals: "View My Deals",
      report_issue: "Report an Issue",
      how_it_works: "If you've been scammed, didn't receive your item, or there's a problem with a deal, file a dispute here.",
      select_deal: "Select Deal",
      choose_deal: "Choose a deal...",
      no_funded_deals: "No active funded deals to dispute. Only funded deals can be disputed.",
      describe_issue: "Describe the Issue",
      placeholder_issue: "Explain what went wrong in detail...",
      upload_evidence: "Upload Evidence (Optional)",
      tap_upload: "Tap to upload screenshot",
      submit_btn: "Submit Dispute",
      active_header: "Active Disputes"
    },
    settings: {
      header: "Settings",
      profile: {
        total_deals: "Total deals",
        completed: "Completed"
      },
      bank: {
        header: "Bank Account",
        bank_name: "Bank Name",
        select_bank: "Select bank...",
        account_number: "Account Number",
        account_name: "Account Name",
        save_btn: "Save Bank Details",
        saving: "Saving..."
      },
      language: "Language",
      notifications: {
        header: "Notifications",
        desc: "Manage alert preferences",
        transactions: "Transaction Updates",
        disputes: "Dispute Alerts",
        promotions: "Promotions & Tips",
        mark_all: "Mark all as read"
      }
    },
    contact: {
      header: "Contact Support",
      support_hours: "Support hours: Mon—Sat, 9 AM — 6 PM WAT",
      response_time: "Average response time: Under 1 hour",
      desc: "Need immediate help? Reach us through any of these channels:",
      hours_label: "Support hours",
      hours: "Mon—Sat, 9 AM — 6 PM WAT"
    },
    faq: {
      header: "How It Works",
      how_it_works: "Transaction Flow",
      steps: {
        create_title: "Create Deal",
        create_desc: "Buyer enters seller username, amount & description",
        accept_title: "Seller Accepts",
        accept_desc: "Seller reviews and accepts the deal terms",
        pay_title: "Buyer Pays",
        pay_desc: "Buyer pays securely — funds held in escrow",
        deliver_title: "Seller Delivers",
        deliver_desc: "Seller delivers product/service and marks it",
        confirm_title: "Buyer Confirms",
        confirm_desc: "Buyer confirms receipt → funds released!"
      },
      questions_header: "Frequently Asked Questions",
      q1: { q: "Is it secure?", a: "Yes! Funds are held until the buyer confirms receipt. If anything goes wrong, you can open a dispute." },
      q2: { q: "How much does it cost?", a: "We charge a 5% platform fee per transaction to ensure a safe and secure service." },
      q3: { q: "What if the seller doesn't deliver?", a: "If the seller fails to deliver, you can open a dispute and our team will refund you after verification." }
    },
    history: {
      header: "Transaction History",
      transactions: "Transactions",
      empty: "No history yet",
      bought: "Bought",
      sold: "Sold"
    },
    sidebar: {
      dashboard: "Dashboard",
      dashboard_sub: "Overview & stats",
      my_deals: "My Deals",
      my_deals_sub: "Active & pending deals",
      new_deal: "New Deal",
      new_deal_sub: "Create escrow transaction",
      dispute: "Raise Dispute",
      dispute_sub: "Report an issue",
      history: "History",
      history_sub: "Past transactions",
      support: "Contact Support",
      support_sub: "Get help from us",
      how_it_works: "How It Works",
      how_it_works_sub: "Learn about escrow",
      settings: "Settings",
      settings_sub: "Account preferences",
      our_bots: "Our Bots",
      market_sub: "Buy & sell on Telegram"
    },
    rating: {
      header: "Rate Your Experience",
      desc: "How was this transaction?",
      placeholder: "Leave a comment (optional)",
      submit: "Submit Rating",
      skip: "Skip"
    },
    footer: {
      powered: "Powered by"
    },
    notifications: {
      header: "Notifications",
      mark_all: "Mark all as read",
      empty: "No notifications yet",
      empty_desc: "You'll see deal updates here"
    }
  },
  fr: {
    common: {
      loading: "Chargement de TrustPay9ja...",
      error: "Erreur",
      success: "Succès",
      back: "Retour",
      save: "Enregistrer",
      submit: "Envoyer",
      cancel: "Annuler",
      search: "Rechercher des transactions",
      confirm: "Confirmer",
      view_details: "Voir les détails",
      amount: "Montant",
      description: "Description",
      status: "Statut",
      date: "Date"
    },
    home: {
      greeting: "Salut",
      what_need: "De quoi avez-vous besoin ?",
      stats: "Stats Récentes",
      buys: "Achats",
      sells: "Ventes",
      active_deals: "Transactions Actives",
      view_all: "Voir Tout",
      no_deals: "Aucune transaction",
      create_btn: "Nouveau Deal",
      pending_attention: "nécessitent votre attention",
      pending_attention_single: "nécessite votre attention",
      active_overview: "Aperçu Actif",
      how_it_works: "Comment ça marche",
      learn_more: "En savoir plus",
      active_as_buyer: "Actif comme acheteur",
      active_as_seller: "Actif comme vendeur",
      disputes: "Litiges",
      total_transactions: "Total transactions"
    },
    deals: {
      header: "Mes Deals",
      tab_all: "Tout",
      tab_buying: "Achats",
      tab_selling: "Ventes",
      no_deals: "Aucun deal pour le moment",
      create_first: "Créez votre première transaction sécurisée",
      buying_label: "Vous achetez",
      selling_label: "Vous vendez",
      delivered: "Livré",
      needs_action: "Action requise",
      loading_deals: "Chargement des deals..."
    },
    details: {
      header: "Détails du Deal",
      participants: {
        buyer: "Vous êtes l'acheteur",
        seller: "Vous êtes le vendeur",
        participant: "Participant"
      },
      fee_info: "Frais: ₦{fee} · Vendeur reçoit: ₦{payout}",
      progress: {
        header: "Progression",
        created: "Créé",
        accepted: "Accepté",
        paid: "Payé",
        delivered: "Livré",
        confirmed: "Confirmé",
        done: "Terminé"
      },
      fields: {
        description: "Description",
        buyer: "Acheteur",
        seller: "Vendeur",
        created: "Créé le"
      },
      actions: {
        accept: "Accepter le Deal",
        decline: "Refuser le Deal",
        accept_hint: "Accepter pour permettre à l'acheteur de payer",
        waiting_seller: "En attente de l'acceptation du vendeur.",
        pay_btn: "Payer ₦{amount}",
        pay_hint: "Vendeur a accepté ! Payez en toute sécurité.",
        pay_telegram_hint: "Vendeur a accepté ! Utilisez Telegram pour générer le lien de paiement.",
        waiting_payment: "Accepté ! En attente du paiement de l'acheteur.",
        mark_delivered: "Marquer comme Livré",
        delivered_hint: "Appuyez une fois livré à l'acheteur",
        waiting_confirmation: "Livré ! En attente de confirmation de l'acheteur.",
        confirm_received: "Confirmer la Réception — Libérer les Fonds",
        open_dispute: "Ouvrir un Litige",
        seller_marked: "Le vendeur a marqué comme livré !",
        payment_confirmed: "Paiement confirmé ! En attente de livraison.",
        refund_status: "Statut du Remboursement",
        deal_complete: "Deal terminé !",
        payout_released: "₦{amount} vous ont été versés.",
        funds_released: "Fonds libérés pour le vendeur.",
        rate_deal: "Évaluer ce Deal",
        under_dispute: "En litige. Un admin va examiner. Fonds sécurisés."
      }
    },
    new_deal: {
      header: "Nouveau Deal",
      buyer_hint: "Vous êtes l'acheteur — entrez les détails du vendeur",
      created: "Deal Créé !",
      waiting: "En attente de l'acceptation du vendeur.",
      form: {
        seller: "Nom d'utilisateur du vendeur",
        amount: "Montant (₦)",
        description: "Description",
        placeholder_user: "@username",
        placeholder_amount: "100 – 20 000",
        placeholder_desc: "Qu'achetez-vous ?",
        fee_label: "Frais de plateforme (5%)",
        seller_receives: "Le vendeur reçoit"
      }
    },
    dispute: {
      header: "Ouvrir un Litige",
      submitted: "Litige Envoyé !",
      desc: "Notre équipe examinera sous 24h. Notification par Telegram.",
      view_deals: "Voir mes deals",
      report_issue: "Signaler un Problème",
      how_it_works: "Si vous avez été arnaqué ou s'il y a un problème, remplissez ce formulaire.",
      select_deal: "Sélectionner le Deal",
      choose_deal: "Choisir un deal...",
      no_funded_deals: "Aucun deal financé disponible pour litige.",
      describe_issue: "Décrire le Problème",
      placeholder_issue: "Expliquez en détail ce qui ne va pas...",
      upload_evidence: "Preuve (Optionnel)",
      tap_upload: "Appuyez pour uploader une capture",
      submit_btn: "Envoyer le Litige",
      active_header: "Litiges Actifs"
    },
    settings: {
      header: "Paramètres",
      profile: {
        total_deals: "Total des deals",
        completed: "Terminés"
      },
      bank: {
        header: "Compte Bancaire",
        bank_name: "Nom de la Banque",
        select_bank: "Sélectionner une banque...",
        account_number: "Numéro de Compte",
        account_name: "Nom du Compte",
        save_btn: "Enregistrer les Infos",
        saving: "Enregistrement..."
      },
      language: "Langue",
      notifications: {
        header: "Notifications",
        desc: "Gérer vos alertes",
        transactions: "Mises à jour des deals",
        disputes: "Alertes de litige",
        promotions: "Promotions et Astuces",
        mark_all: "Tout marquer comme lu"
      }
    },
    contact: {
      header: "Support",
      support_hours: "Heures: Lun—Sam, 9h — 18h WAT",
      response_time: "Réponse en moins d'une heure",
      desc: "Besoin d'aide immédiate ? Contactez-nous par l'un de ces canaux :",
      hours_label: "Heures de support",
      hours: "Lun—Sam, 9h — 18h WAT"
    },
    faq: {
      header: "Comment ça marche",
      how_it_works: "Flux de Transaction",
      steps: {
        create_title: "Créer Deal",
        create_desc: "L'acheteur entre le nom d'utilisateur du vendeur, le montant et la description",
        accept_title: "Le vendeur accepte",
        accept_desc: "Le vendeur examine et accepte les conditions de la transaction",
        pay_title: "L'acheteur paye",
        pay_desc: "L'acheteur paye en toute sécurité - les fonds sont bloqués en séquestre",
        deliver_title: "Le vendeur livre",
        deliver_desc: "Le vendeur livre le produit/service et le marque comme livré",
        confirm_title: "L'acheteur confirme",
        confirm_desc: "L'acheteur confirme la réception → les fonds sont libérés!"
      },
      questions_header: "Questions Fréquemment Posées",
      q1: { q: "Est-ce sécurisé ?", a: "Oui ! Les fonds sont bloqués jusqu'à ce que l'acheteur confirme la réception. Si un problème survient, vous pouvez ouvrir un litige." },
      q2: { q: "Combien ça coûte ?", a: "Nous prélevons des frais de plateforme de 5% par transaction pour assurer un service sécurisé." },
      q3: { q: "Et si le vendeur ne livre pas ?", a: "Si le vendeur ne livre pas, vous pouvez ouvrir un litige et notre équipe vous remboursera après vérification." }
    },
    history: {
      header: "Historique",
      transactions: "Transactions",
      empty: "Aucun historique pour le moment",
      bought: "Acheté",
      sold: "Vendu"
    },
    sidebar: {
      dashboard: "Tableau de Bord",
      dashboard_sub: "Aperçu & stats",
      my_deals: "Mes Deals",
      my_deals_sub: "Deals actifs & en attente",
      new_deal: "Nouveau Deal",
      new_deal_sub: "Créer une transaction",
      dispute: "Litiges",
      dispute_sub: "Signaler un problème",
      history: "Historique",
      history_sub: "Transactions passées",
      support: "Support",
      support_sub: "Aide & Contact",
      how_it_works: "Comment ça marche",
      how_it_works_sub: "Apprendre sur le séquestre",
      settings: "Paramètres",
      settings_sub: "Préférences du compte",
      our_bots: "Nos Bots",
      market_sub: "Acheter & vendre sur Telegram"
    },
    footer: {
      powered: "Propulsé par"
    },
    rating: {
      header: "Votre Avis",
      desc: "Comment s'est passée la transaction ?",
      placeholder: "Laissez un commentaire (optionnel)",
      submit: "Envoyer",
      skip: "Passer"
    },
    notifications: {
      header: "Notifications",
      mark_all: "Tout marquer comme lu",
      empty: "Aucune notification",
      empty_desc: "Les mises à jour s'afficheront ici"
    }
  }
};

type Language = "en" | "fr";

function PageTransition({ children, direction = "forward" }: { children: React.ReactNode; direction?: "forward" | "back" }) {
  return <div className={direction === "forward" ? "animate-slide-in-page" : "animate-slide-in-back"} style={{ animationFillMode: "both" }}>{children}</div>;
}

function StaggerItem({ children, index }: { children: React.ReactNode; index: number }) {
  return <div className="animate-fade-in-up opacity-0" style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}>{children}</div>;
}

export default function MiniAppPage() {
  const [view, setViewOriginal] = useState<View>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("listing_id") || params.get("token")) {
      return "loading";
    }
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (startParam?.startsWith("escrow_")) {
      return "loading";
    }
    return "home";
  });

  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  // Instrumented setView
  const setView = (v: View) => {
    console.log("setView called with:", v);
    setViewOriginal(v);
  };

  console.log("CURRENT VIEW STATE:", view);
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
  const [marketAds, setMarketAds] = useState<{ id: string; title: string; description: string | null; image_path: string | null; video_path: string | null; link_url: string | null; image_paths?: string[] | null }[]>([]);
  const [activeAdImageIdx, setActiveAdImageIdx] = useState(0);
  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [showAdModal, setShowAdModal] = useState(false);
  const [language, setLanguageState] = useState<Language>((localStorage.getItem("escrow_lang") as Language) || "en");
  const [notifSettings, setNotifSettings] = useState({
    transactions: localStorage.getItem("escrow_notif_transactions") !== "false",
    disputes: localStorage.getItem("escrow_notif_disputes") !== "false",
    promotions: localStorage.getItem("escrow_notif_promotions") !== "false",
  });

  const webApp = window.Telegram?.WebApp;
  const isDark = webApp?.colorScheme === "dark" || document.documentElement.classList.contains("dark");

  const t = translations[language];

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("escrow_lang", lang);
    webApp?.HapticFeedback?.impactOccurred("light");
  };

  const toggleNotif = (key: keyof typeof notifSettings) => {
    const newVal = !notifSettings[key];
    setNotifSettings(prev => ({ ...prev, [key]: newVal }));
    localStorage.setItem(`escrow_notif_${key}`, newVal.toString());
    webApp?.HapticFeedback?.impactOccurred("light");
  };

  useEffect(() => {
    console.log("MiniAppPage Mount. URL:", window.location.href);
    console.log("InitDataUnsafe Params:", webApp?.initDataUnsafe);
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
      }
    }
  }, []);
  // Handle deep link (start_param) or token-based link
  useEffect(() => {
    if (deepLinkHandled) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const directListingId = params.get('listing_id');

    if (token) {
      console.log("Token detected in URL:", token);
      setDeepLinkHandled(true);
      validateEscrowToken(token);
      return;
    }

    if (directListingId) {
      console.log("Direct listing_id detected in URL:", directListingId);
      setDeepLinkHandled(true);
      fetchMarketListing(directListingId).then(() => {
        console.log("Navigating to new-deal via direct URL");
        setDirection("forward");
        setView("new-deal");
      });
      return;
    }

    const startParam = (webApp.initDataUnsafe as any).start_param;
    if (startParam && startParam.startsWith('escrow_')) {
      const listingId = startParam.replace('escrow_', '');
      console.log("Deep link detected via start_param:", listingId);
      setDeepLinkHandled(true);
      fetchMarketListing(listingId).then(() => {
        console.log("Navigating to new-deal via start_param");
        setDirection("forward");
        setView("new-deal");
      });
    }
  }, [tgUser, webApp, deepLinkHandled]);

  const validateEscrowToken = async (token: string) => {
    setLoading(true);
    try {
      // 1. Fetch token record from Market DB
      const { data: tokenData, error: tokenError } = await marketSupabase
        .from("escrow_tokens")
        .select("*")
        .eq("token", token)
        .eq("used", false)
        .single();

      if (tokenError || !tokenData) {
        console.error("Invalid or used token:", tokenError);
        setError("This deal link is invalid or has already been used.");
        setLoading(false);
        return;
      }

      // 2. Check expiration (5 mins)
      const isExpired = new Date(tokenData.expires_at).getTime() < Date.now();
      if (isExpired) {
        console.error("Token expired");
        setError("This deal link has expired. Please start the purchase again in the Market app.");
        setLoading(false);
        return;
      }

      // 3. Mark as used immediately to prevent race conditions or double-processing
      await marketSupabase.from("escrow_tokens").update({ used: true }).eq("id", tokenData.id);

      // 4. Fetch the listing
      await fetchMarketListing(tokenData.listing_id);

      console.log("Token validation success. Navigating to new-deal");
      setDirection("forward");
      setView("new-deal");
    } catch (err) {
      console.error("Token validation error:", err);
      setError("Failed to validate deal token. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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

      // 1. Set form data
      setSellerUsername(seller?.username ? `@${seller.username}` : (seller?.first_name || ""));
      setAmount(listing.price?.toString() || "");
      setDescription(`Order for ${listing.title}`);
      setActiveListingId(listingId);

      // 2. Clear flags and navigate
      setSuccessDeal(null);
      setError("");
      setDirection("forward");
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
    try {
      const initData = webApp?.initData;
      if (!initData) throw new Error("Missing auth");

      const { data, error } = await supabase.functions.invoke('escrow-actions', {
        body: { action: 'get_user_deals', payload: { limit: 50 } },
        headers: { 'x-telegram-init-data': initData }
      });

      if (error) throw error;
      setDeals((data?.deals as Deal[]) || []);
    } catch (err) {
      console.error("fetchDeals error:", err);
    } finally {
      setLoading(false);
    }
  }, [tgUser, webApp]);

  const fetchHomeDeals = useCallback(async () => {
    if (!tgUser) return;
    try {
      const initData = webApp?.initData;
      if (!initData) return;

      const { data } = await supabase.functions.invoke('escrow-actions', {
        body: { action: 'get_user_deals', payload: { limit: 20, active_only: true } },
        headers: { 'x-telegram-init-data': initData }
      });
      setHomeDeals((data?.deals as Deal[]) || []);
    } catch (err) {
      console.error("fetchHomeDeals error:", err);
    }
  }, [tgUser, webApp]);

  const fetchAllUserDeals = useCallback(async () => {
    if (!tgUser) return;
    try {
      const initData = webApp?.initData;
      if (!initData) return;

      const { data } = await supabase.functions.invoke('escrow-actions', {
        body: { action: 'get_user_deals', payload: { limit: 200 } },
        headers: { 'x-telegram-init-data': initData }
      });
      setAllUserDeals((data?.deals as Deal[]) || []);
    } catch (err) {
      console.error("fetchAllUserDeals error:", err);
    }
  }, [tgUser, webApp]);

  const fetchProfile = useCallback(async () => {
    if (!tgUser) return;
    setProfileLoading(true);
    try {
      const initData = webApp?.initData;
      if (!initData) return;

      const { data, error } = await supabase.functions.invoke('user-profiles', {
        body: { action: 'get_profile' },
        headers: { 'x-telegram-init-data': initData }
      });

      if (error) throw error;
      const profileData = data?.profile;
      if (profileData) {
        setProfile(profileData as UserProfile);
        setBankName(profileData.bank_name || "");
        setAccountNumber(profileData.account_number || "");
        setAccountName(profileData.account_name || "");
      }
    } catch (err) {
      console.error("fetchProfile error:", err);
    } finally {
      setProfileLoading(false);
    }
  }, [tgUser, webApp]);

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

  const fetchNotifications = useCallback(async () => {
    if (!tgUser) return;
    setNotifLoading(true);
    try {
      const initData = webApp?.initData;
      if (!initData) return;

      const { data, error } = await supabase.functions.invoke('escrow-actions', {
        body: { action: 'get_notifications', payload: { limit: 30 } },
        headers: { 'x-telegram-init-data': initData }
      });

      if (error) throw error;
      const readIds: string[] = JSON.parse(localStorage.getItem(`tp9ja_read_notifs_${tgUser.id}`) || "[]");
      const mapped = (data?.notifications || []).map((log: any) => ({
        id: log.id,
        message: formatNotifMessage(log.action, log.details as Record<string, unknown> | null, log.deal_id),
        time: log.created_at,
        type: log.action,
        isRead: readIds.includes(log.id),
      }));
      setNotifications(mapped);
    } catch (err) {
      console.error("fetchNotifications error:", err);
    } finally {
      setNotifLoading(false);
    }
  }, [tgUser, webApp]);

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
      const initData = webApp?.initData;
      if (initData) {
        supabase.functions.invoke('escrow-actions', {
          body: { action: 'log_audit', payload: { audit_action: 'welcome', details: { message: 'New user joined TrustPay9ja' } } },
          headers: { 'x-telegram-init-data': initData }
        }).catch(() => { });
      }
    }
  }, [tgUser]);

  const fetchMarketAds = async () => {
    try {
      const now = new Date().toISOString();
      const { data } = await marketSupabase
        .from("ads")
        .select("id, title, description, image_path, video_path, link_url, stars_paid, image_paths")
        .eq("status", "active")
        .gte("expires_at", now)
        .limit(20);
      if (data && data.length > 0) {
        // Weighted random shuffle
        const weighted = data.map((ad: any) => ({ ...ad, _w: Math.random() * Math.sqrt(ad.stars_paid || 1) }));
        weighted.sort((a: any, b: any) => b._w - a._w);
        setMarketAds(weighted.slice(0, 5));
      }
    } catch (e) {
      // Silently fail — ads are non-critical
    }
  };

  // Carousel timer for ads with multiple images
  useEffect(() => {
    const ad = marketAds[0];
    const images = ad?.image_paths || (ad?.image_path ? [ad.image_path] : []);
    if (images.length > 1) {
      const timer = setInterval(() => {
        setActiveAdImageIdx((prev) => (prev + 1) % images.length);
      }, 4000);
      return () => clearInterval(timer);
    }
  }, [marketAds]);

  // Fetch notifications on mount
  useEffect(() => { if (tgUser) { fetchNotifications(); fetchMarketAds(); } }, [tgUser, fetchNotifications]);
  useEffect(() => { if (view === "settings" && tgUser) fetchProfile(); }, [view, tgUser, fetchProfile]);
  useEffect(() => { if (view === "history" && tgUser) fetchDeals(); }, [view, tgUser, fetchDeals]);
  useEffect(() => { if (view === "raise-dispute" && tgUser) fetchDeals(); }, [view, tgUser, fetchDeals]);

  const refreshAfterAction = useCallback(async (dealId: string) => {
    try {
      const initData = webApp?.initData;
      if (initData) {
        const { data } = await supabase.functions.invoke('escrow-actions', {
          body: { action: 'get_deal', payload: { deal_id: dealId } },
          headers: { 'x-telegram-init-data': initData }
        });
        if (data?.deal) setSelectedDeal(data.deal as Deal);
      }
    } catch (err) {
      console.error("refreshAfterAction error:", err);
    }
    await fetchDeals();
  }, [fetchDeals, webApp]);

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
  const pendingSellerActions = (homeDeals || []).filter(d => d.status === "pending" && usernameMatch(d.seller_telegram, uname)).length;
  const pendingBuyerActions = (homeDeals || []).filter(d => {
    const isBuyer = usernameMatch(d.buyer_telegram, uname);
    return isBuyer && (d.status === "accepted" || (d.status === "funded" && d.delivered_at));
  }).length;
  const totalPendingActions = pendingSellerActions + pendingBuyerActions;

  const buyDeals = (allUserDeals || []).filter(d => usernameMatch(d.buyer_telegram, uname));
  const sellDeals = (allUserDeals || []).filter(d => usernameMatch(d.seller_telegram, uname));
  const completedBuys = buyDeals.filter(d => d.status === "completed").length;
  const completedSells = sellDeals.filter(d => d.status === "completed").length;
  const totalSpent = buyDeals.filter(d => d.status === "completed").reduce((s, d) => s + (d.amount || 0), 0);
  const totalEarned = sellDeals.filter(d => d.status === "completed").reduce((s, d) => s + ((d.amount || 0) - (d.fee || 0)), 0);
  const activeBuyDeals = buyDeals.filter(d => !["completed", "refunded"].includes(d.status)).length;
  const activeSellDeals = sellDeals.filter(d => !["completed", "refunded"].includes(d.status)).length;
  const disputedDeals = (allUserDeals || []).filter(d => d.status === "disputed").length;

  // Avg rating received
  const ratingsReceived = (userRatings || []).filter(r => usernameMatch(r.rated_telegram, uname));
  const avgRating = ratingsReceived.length > 0 ? (ratingsReceived.reduce((s, r) => s + (r.rating || 0), 0) / ratingsReceived.length).toFixed(1) : "—";

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
        <span>{t.footer.powered} <strong className={textPrimary} style={{ fontWeight: 600 }}>LightOrb Innovations</strong></span>
      </div>
    </div>
  );

  // Bottom Navigation Bar — Premium "Floating Island" Design
  const BottomNav = () => {
    const navTabs = [
      { id: "home" as View, label: t.home.nav_home || "Home", icon: Home },
      { id: "my-deals" as View, label: t.deals.tab_all || "Deals", icon: List },
      { id: "new-deal" as View, label: t.home.create_btn || "New", icon: Plus },
      { id: "history" as View, label: t.history.header || "History", icon: HistoryIcon },
      { id: "settings" as View, label: t.sidebar.settings || "Profile", icon: User },
    ];
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-6 pointer-events-none">
        <div className={`mx-4 w-full max-w-[420px] pointer-events-auto rounded-[2rem] ${isDark ? "bg-[#1c1c1e]/85 border-white/5" : "bg-white/80 border-black/[0.04]"} backdrop-blur-2xl border shadow-[0_8px_32px_rgba(0,0,0,0.15)] px-2 py-2`}>
          <div className="flex items-center justify-around w-full">
            {navTabs.map((tab) => {
              const active = view === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => navigate(tab.id)}
                  className={`relative flex flex-col items-center justify-center flex-1 transition-all duration-300 h-12`}
                >
                  <div className={`flex items-center justify-center transition-all duration-300 ${active ? "opacity-100 scale-110" : "opacity-40 scale-100 hover:opacity-75"}`}>
                    <tab.icon className={`w-[22px] h-[22px] ${active ? (isDark ? "text-[hsl(224,71%,60%)]" : "text-[hsl(224,71%,50%)]") : (isDark ? "text-white" : "text-black")}`} />
                  </div>
                  {active && (
                    <div className={`absolute bottom-1 w-1 h-1 rounded-full ${isDark ? "bg-[hsl(224,71%,60%)]" : "bg-[hsl(224,71%,50%)]"}`} />
                  )}
                  <span className={`text-[9px] font-bold mt-1 transition-all duration-300 ${active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 block h-0 overflow-hidden"}`}>
                    {tab.label}
                  </span>
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
            <h3 className="font-bold text-[16px]">{t.notifications.header}</h3>
            {notifications.length > 0 && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${isDark ? "bg-white/10 text-white/50" : "bg-black/[0.06] text-black/40"}`}>{notifications.length}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className={`press-effect text-[12px] font-semibold px-3 py-1.5 rounded-lg ${isDark ? "text-[hsl(224,71%,60%)] bg-[hsl(224,71%,50%)]/10" : "text-[hsl(224,71%,50%)] bg-[hsl(224,71%,50%)]/10"}`}>
                {t.notifications.mark_all}
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
              <p className={`text-[14px] font-medium ${textSecondary}`}>{t.notifications.empty}</p>
              <p className={`text-[12px] mt-1 ${textSecondary}`}>{t.notifications.empty_desc}</p>
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
    { id: "home" as View, label: t.sidebar.dashboard, subtitle: t.sidebar.dashboard_sub, icon: Home, color: "from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)]" },
    { id: "my-deals" as View, label: t.sidebar.my_deals, subtitle: t.sidebar.my_deals_sub, icon: List, color: "from-emerald-500 to-emerald-600", badge: deals.filter(d => d.status === 'pending').length },
    { id: "new-deal" as View, label: t.sidebar.new_deal, subtitle: t.sidebar.new_deal_sub, icon: Plus, color: "from-blue-500 to-blue-600" },
    { id: "raise-dispute" as View, label: t.sidebar.dispute, subtitle: t.sidebar.dispute_sub, icon: AlertTriangle, color: "from-red-400 to-red-500", badge: deals.filter(d => d.status === 'disputed').length },
    { id: "history" as View, label: t.sidebar.history, subtitle: t.sidebar.history_sub, icon: HistoryIcon, color: "from-purple-500 to-purple-600" },
    { id: "contact" as View, label: t.sidebar.support, subtitle: t.sidebar.support_sub, icon: Phone, color: "from-teal-500 to-teal-600" },
    { id: "faq" as View, label: t.sidebar.how_it_works, subtitle: t.sidebar.how_it_works_sub, icon: HelpCircle, color: "from-amber-500 to-amber-600" },
    { id: "settings" as View, label: t.sidebar.settings, subtitle: t.sidebar.settings_sub, icon: Settings, color: "from-gray-500 to-gray-600" },
  ];

  // ===== LOADING STATE (GLOBAL) =====
  if (view === "loading" || (loading && view !== "home")) {
    return (
      <div className={`min-h-screen ${bg} ${textPrimary} flex flex-col items-center justify-center p-6 gap-4`}>
        <div className="relative">
          <Loader2 className="w-12 h-12 animate-spin text-[hsl(224,71%,50%)]" />
          <Shield className="w-6 h-6 text-white absolute inset-0 m-auto opacity-20" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-bold text-lg">TrustPay Escrow</p>
          <p className={`text-sm ${textSecondary} animate-pulse`}>Initializing secure transaction...</p>
        </div>
      </div>
    );
  }

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
                <p className={`font-semibold text-[14px] ${isDark ? "text-[hsl(224,71%,65%)]" : "text-[hsl(224,71%,45%)]"}`}>{language === 'fr' ? "Panneau Admin" : "Admin Panel"}</p>
                <p className={`text-[11px] ${isDark ? "text-[hsl(224,71%,55%)]" : "text-[hsl(224,71%,55%)]"}`}>{language === 'fr' ? "Gérer le marché" : "Manage marketplace"}</p>
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
            <p className={`text-[10px] font-semibold uppercase tracking-wider px-3 mb-2 ${textSecondary}`}>{t.sidebar.our_bots}</p>
            <a href="https://t.me/TrustPayMarketsBot" target="_blank" rel="noopener noreferrer"
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] font-medium press-effect transition-all ${isDark ? "text-white/60 hover:bg-white/5" : "text-black/50 hover:bg-black/[0.03]"}`}>
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                <Store className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 text-left">
                <span className="block leading-tight">TrustPay Markets</span>
                <span className={`block text-[11px] font-normal ${isDark ? "text-white/35" : "text-black/35"}`}>{t.sidebar.market_sub}</span>
              </div>
              <ChevronRight className={`w-4 h-4 ${isDark ? "text-white/20" : "text-black/15"}`} />
            </a>
          </div>
        </nav>

        {/* Footer */}
        <div className={`px-5 py-3 border-t ${cardBorder}`}>
          <p className={`text-[10px] text-center ${textSecondary}`}>{t.footer.powered} LightOrb Innovations</p>
        </div>
      </div>
    </div>
  ) : null;

  // ===== RATING MODAL =====
  const RatingModal = () => showRatingModal ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowRatingModal(false)} />
      <div className={`relative ${cardBg} border ${cardBorder} rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-fade-in-up`}>
        <h3 className="text-[18px] font-bold text-center mb-1">{t.rating.header}</h3>
        <p className={`text-[13px] text-center ${textSecondary} mb-4`}>{t.rating.desc}</p>
        <div className="flex justify-center gap-2 mb-4">
          {[1, 2, 3, 4, 5].map(v => (
            <button key={v} onClick={() => { setRatingValue(v); webApp?.HapticFeedback?.impactOccurred("light"); }}
              className="press-effect p-1">
              <Star className={`w-8 h-8 transition-colors ${v <= ratingValue ? "fill-amber-400 text-amber-400" : (isDark ? "text-white/20" : "text-black/15")}`} />
            </button>
          ))}
        </div>
        <input value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder={t.rating.placeholder}
          className={`w-full p-3 rounded-xl text-[14px] border outline-none input-focus ${inputBg} mb-3`} maxLength={200} />
        <button onClick={handleSubmitRating} disabled={ratingValue < 1 || ratingSubmitting}
          className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white font-semibold py-3 rounded-xl text-[14px] press-effect disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25">
          {ratingSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
          {t.rating.submit}
        </button>
        <button onClick={() => setShowRatingModal(false)} className={`w-full mt-2 py-2 text-[13px] font-medium ${textSecondary}`}>{t.rating.skip}</button>
      </div>
    </div>
  ) : null;

  // Ad Modal Component
  const AdModal = () => {
    if (!showAdModal || !selectedAd) return null;

    const displayImage = selectedAd.image_paths?.[0] || selectedAd.image_path || (selectedAd.image_paths && selectedAd.image_paths.length > 0 ? selectedAd.image_paths[0] : null);

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowAdModal(false)}>
        <div className={`${cardBg} w-full max-w-sm rounded-[28px] overflow-hidden shadow-2xl animate-scale-in border ${cardBorder}`} onClick={e => e.stopPropagation()}>
          <div className="relative h-56 bg-black/5">
            {displayImage ? (
              <img src={displayImage} alt={selectedAd.title} className="w-full h-full object-cover" />
            ) : selectedAd.video_path ? (
              <video src={selectedAd.video_path} className="w-full h-full object-cover" autoPlay muted loop playsInline />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Sparkles className={`w-12 h-12 ${isDark ? "text-white/10" : "text-black/5"}`} />
              </div>
            )}
            <button onClick={() => setShowAdModal(false)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-md press-effect">
              <X className="w-5 h-5" />
            </button>
            <div className="absolute top-3 left-3 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest shadow-lg">Sponsored</div>
          </div>

          <div className="p-5">
            <h3 className="text-lg font-bold leading-tight">{selectedAd.title}</h3>
            {selectedAd.description && (
              <p className={`mt-2 text-[13px] leading-relaxed ${textSecondary}`}>{selectedAd.description}</p>
            )}

            <div className={`mt-5 p-3 rounded-2xl flex items-center gap-3 ${isDark ? "bg-white/5" : "bg-black/5"}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-600"}`}>
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ADVERTISER</p>
                <p className="text-[13px] font-medium">Verified Partner</p>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-500 ml-auto" />
            </div>

            <button
              onClick={() => {
                const initData = webApp?.initData;
                marketSupabase.functions.invoke('market-actions', {
                  body: { action: 'track_ad_click', payload: { id: selectedAd.id } },
                  headers: initData ? { 'x-telegram-init-data': initData } : {}
                }).catch(() => { });
                if (selectedAd.link_url) window.open(selectedAd.link_url, "_blank");
                setShowAdModal(false);
              }}
              className="w-full mt-6 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold py-4 rounded-2xl text-[15px] shadow-lg shadow-amber-500/25 press-effect flex items-center justify-center gap-2"
            >
              Open Link <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

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
      { label: t.home.buys, value: completedBuys, icon: <ShoppingCart className="w-4 h-4" />, color: "from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)]" },
      { label: t.home.sells, value: completedSells, icon: <Store className="w-4 h-4" />, color: "from-emerald-500 to-emerald-600" },
      { label: language === 'fr' ? "Dépensé" : "Spent", value: `₦${totalSpent.toLocaleString()}`, icon: <ArrowUpRight className="w-4 h-4" />, color: "from-red-400 to-red-500" },
      { label: language === 'fr' ? "Gagné" : "Earned", value: `₦${totalEarned.toLocaleString()}`, icon: <ArrowDownLeft className="w-4 h-4" />, color: "from-emerald-400 to-teal-500" },
      { label: t.home.total_transactions, value: allUserDeals.length, icon: <Package className="w-4 h-4" />, color: "from-blue-500 to-blue-600" },
      { label: t.home.active_deals, value: homeDeals.length, icon: <Clock className="w-4 h-4" />, color: "from-amber-500 to-amber-600" }
    ];

    // AVG Rating
    const statCards_ext = [
      ...statCards,
      { label: "Rating", value: avgRating, icon: <Star className="w-4 h-4" />, color: "from-emerald-500 to-emerald-600" }
    ];

    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <PageTransition direction={direction}>
          <RatingModal />
          <AdModal />
          <Header />
          {/* Greeting */}
          <div className="pt-4 pb-2 px-5">
            <StaggerItem index={0}>
              <h1 className="text-[22px] font-bold tracking-tight">{t.home.greeting}, {tgUser?.firstName} 👋</h1>
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
              <p className={`text-[14px] mb-2.5 ${textSecondary}`}>{t.home.what_need}</p>
              <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${isDark ? "bg-white/5 border border-white/5" : "bg-black/[0.03] border border-black/[0.04]"}`}>
                <Search className={`w-4 h-4 ${textSecondary}`} />
                <span className={`text-[14px] ${isDark ? "text-white/25" : "text-black/30"}`}>{t.common.search}</span>
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
                      {totalPendingActions} {totalPendingActions > 1 ? t.home.pending_attention : t.home.pending_attention_single}
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

            {/* Dashboard Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6 mt-4">
              {[
                { label: t.home.buys, value: completedBuys, icon: <ShoppingCart className="w-5 h-5 text-blue-500" />, bg: "bg-blue-500/10", border: "border-blue-500/20" },
                { label: t.home.sells, value: completedSells, icon: <Store className="w-5 h-5 text-emerald-500" />, bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
                { label: t.home.active_deals, value: activeBuyDeals + activeSellDeals, icon: <Clock className="w-5 h-5 text-amber-500" />, bg: "bg-amber-500/10", border: "border-amber-500/20" },
                { label: t.home.disputes, value: disputedDeals, icon: <AlertTriangle className="w-5 h-5 text-red-500" />, bg: "bg-red-500/10", border: "border-red-500/20" },
              ].map((stat, i) => (
                <StaggerItem key={i} index={i + 1}>
                  <div className={`${cardBg} border ${cardBorder} p-4 rounded-2xl shadow-sm relative overflow-hidden group`}>
                    <div className="absolute -right-2 -top-2 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                      {stat.icon}
                    </div>
                    <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.border} border flex items-center justify-center mb-3`}>
                      {stat.icon}
                    </div>
                    <p className={`text-[11px] font-bold uppercase tracking-wider mb-0.5 ${textSecondary}`}>{stat.label}</p>
                    <p className="text-2xl font-black tabular-nums">{stat.value}</p>
                  </div>
                </StaggerItem>
              ))}
            </div>

            {/* Pending Attention */}
            {totalPendingActions > 0 && (
              <StaggerItem index={5}>
                <button onClick={() => navigate("my-deals")}
                  className={`w-full mb-6 p-4 rounded-2xl border flex items-center gap-4 press-effect shadow-sm transition-all ${isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700"
                    }`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-amber-500/20" : "bg-amber-500/10"}`}>
                    <Bell className="w-6 h-6 badge-pulse" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="font-bold text-[15px] leading-tight">{totalPendingActions} {totalPendingActions === 1 ? t.home.pending_attention_single : t.home.pending_attention}</p>
                    <p className="text-[12px] opacity-80 mt-0.5 truncate">{t.home.view_all} →</p>
                  </div>
                  <ChevronRight className="w-5 h-5 opacity-40" />
                </button>
              </StaggerItem>
            )}
          </div>

          {/* Quick Actions */}
          <div className="px-4 space-y-2.5 mb-4">
            <StaggerItem index={4}>
              <button onClick={() => navigate("new-deal")} className={`${cardBg} border ${cardBorder} w-full p-4 rounded-2xl flex items-center gap-4 press-effect shadow-sm`}>
                <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-[hsl(224,71%,40%)] to-[hsl(224,71%,55%)] flex items-center justify-center shadow-md shadow-[hsl(224,71%,40%)/0.2]">
                  <Plus className="w-6 h-6 text-white" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-semibold text-[15px]">{t.home.create_btn}</p>
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

          {/* Market Sponsored Ad */}
          {marketAds.length > 0 && (() => {
            const ad = marketAds[0];
            const images = ad.image_paths && ad.image_paths.length > 0 ? ad.image_paths : ad.image_path ? [ad.image_path] : [];
            const displayImage = images[activeAdImageIdx % images.length];

            // Analytics Tracking Hooks (within component)
            // We use a simple ref-based check to track impression once
            return <AdSection ad={ad} displayImage={displayImage} isDark={isDark} cardBg={cardBg} cardBorder={cardBorder} textSecondary={textSecondary} setSelectedAd={setSelectedAd} setShowAdModal={setShowAdModal} />;
          })()}

          {/* How it works mini */}
          <div className="px-4 pb-8">
            <StaggerItem index={6}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-4 shadow-sm`}>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className={`w-4 h-4 ${isDark ? "text-amber-400" : "text-amber-500"}`} />
                  <h3 className="font-semibold text-[14px]">{t.home.how_it_works}</h3>
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
                  {t.home.learn_more} →
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
    const fundedDeals = deals.filter(d => (["funded", "completed"].includes(d.status)) || (d.status === "funded" && d.delivered_at));
    const activeDisputes = deals.filter(d => d.status === "disputed");

    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <PageTransition direction={direction}>
          <RatingModal />
          <AdModal />
          <Header title={t.dispute.header} />
          <div className="px-4 pb-8">
            {disputeSuccess ? (
              <StaggerItem index={0}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-8 text-center shadow-sm`}>
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="text-lg font-bold">{t.dispute.submitted}</p>
                  <p className={`text-[13px] mt-2 ${textSecondary}`}>
                    {t.dispute.desc}
                  </p>
                  <button onClick={() => navigate("my-deals")} className="mt-6 text-[hsl(224,71%,50%)] text-[14px] font-semibold press-effect">
                    {t.dispute.view_deals} →
                  </button>
                </div>
              </StaggerItem>
            ) : (
              <StaggerItem index={0}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5 shadow-sm space-y-4`}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className={`w-5 h-5 ${isDark ? "text-red-400" : "text-red-500"}`} />
                    <h3 className="font-semibold text-[16px]">{t.dispute.report_issue}</h3>
                  </div>
                  <p className={`text-[13px] ${textSecondary}`}>{t.dispute.how_it_works}</p>

                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-2 block ${textSecondary}`}>{t.dispute.select_deal}</label>
                    <select value={disputeDealId} onChange={(e) => setDisputeDealId(e.target.value)}
                      className={`w-full p-3.5 rounded-xl text-[15px] border outline-none input-focus appearance-none ${inputBg}`}>
                      <option value="">{t.dispute.choose_deal}</option>
                      {fundedDeals.map(d => (
                        <option key={d.id} value={d.id}>₦{d.amount.toLocaleString()} — {d.description || d.deal_id}</option>
                      ))}
                    </select>
                    {fundedDeals.length === 0 && <p className="text-[11px] text-red-500 mt-1">{t.dispute.no_funded_deals}</p>}
                  </div>

                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-2 block ${textSecondary}`}>{t.dispute.describe_issue}</label>
                    <textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder={t.dispute.placeholder_issue}
                      className={`w-full p-3.5 rounded-xl text-[14px] border outline-none input-focus ${inputBg} min-h-[100px]`} />
                  </div>

                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-2 block ${textSecondary}`}>{t.dispute.upload_evidence}</label>
                    <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${cardBorder} ${isDark ? "hover:bg-white/5" : "hover:bg-black/5"}`}>
                      <Upload className={`w-6 h-6 mx-auto mb-2 ${textSecondary}`} />
                      <p className={`text-[13px] ${textSecondary}`}>{t.dispute.tap_upload}</p>
                    </div>
                  </div>

                  <button onClick={handleSubmitDispute} disabled={disputeSubmitting || !disputeDealId || !disputeReason}
                    className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold py-3.5 rounded-xl text-[15px] press-effect disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-500/25">
                    {disputeSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                    {t.dispute.submit_btn}
                  </button>
                </div>
              </StaggerItem>
            )}

            {activeDisputes.length > 0 && (
              <div className="mt-8">
                <h3 className={`text-[12px] font-semibold uppercase tracking-wider mb-3 px-1 ${textSecondary}`}>{t.dispute.active_header}</h3>
                <div className="space-y-3">
                  {activeDisputes.map(d => (
                    <button key={d.id} onClick={() => { setSelectedDeal(d); navigate("deal-detail"); }}
                      className={`${cardBg} border ${cardBorder} w-full p-4 rounded-2xl text-left press-effect shadow-sm flex items-center justify-between`}>
                      <div className="min-w-0">
                        <p className="font-semibold text-[14px] truncate">{d.description || d.deal_id}</p>
                        <p className={`text-[12px] font-bold text-red-500`}>₦{d.amount.toLocaleString()}</p>
                      </div>
                      <ChevronRight className={`w-5 h-5 ${textSecondary}`} />
                    </button>
                  ))}
                </div>
              </div>
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
          <RatingModal />
          <AdModal />
          <Header title={t.contact.header} />
          <div className="px-5 py-6">
            <StaggerItem index={0}>
              <div className={`${cardBg} border ${cardBorder} rounded-3xl p-6 text-center shadow-sm mb-6`}>
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <Headset className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold mb-2">{t.contact.header}</h3>
                <p className={`text-[14px] leading-relaxed ${textSecondary}`}>
                  {t.contact.desc}
                </p>
              </div>
            </StaggerItem>

            <StaggerItem index={1}>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: "Telegram Support", value: "@lightorbinnovations", icon: <Send className="w-5 h-5" />, color: "bg-blue-500", url: "https://t.me/lightorbinnovations" },
                  { label: "WhatsApp / Call", value: "+2348025100844", icon: <Phone className="w-5 h-5" />, color: "bg-emerald-500", url: "tel:+2348025100844" },
                  { label: "Email Address", value: "lightorbinnovations@gmail.com", icon: <Mail className="w-5 h-5" />, color: "bg-red-500", url: "mailto:lightorbinnovations@gmail.com" },
                ].map((item, i) => (
                  <button key={i} onClick={() => window.open(item.url, "_blank")}
                    className={`${cardBg} border ${cardBorder} p-4 rounded-2xl flex items-center gap-4 press-effect shadow-sm text-left group`}>
                    <div className={`w-12 h-12 rounded-xl ${item.color} flex items-center justify-center text-white shadow-lg shadow-${item.color.split('-')[1]}-500/20 group-hover:scale-110 transition-transform`}>
                      {item.icon}
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-[12px] font-bold uppercase tracking-wider mb-0.5 ${textSecondary}`}>{item.label}</p>
                      <p className="font-bold text-[15px] truncate">{item.value}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 opacity-30" />
                  </button>
                ))}
              </div>
            </StaggerItem>

            <StaggerItem index={2}>
              <div className={`p-5 rounded-2xl border ${isDark ? "bg-white/5 border-white/10" : "bg-black/5 border-black/10"} text-center`}>
                <p className={`text-[13px] font-medium ${textSecondary}`}>
                  {t.contact.hours_label}: <span className={textPrimary}>{t.contact.hours}</span>
                </p>
                <p className={`text-[12px] mt-1 opacity-70 ${textSecondary}`}>
                  {t.contact.response_time}
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
    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <PageTransition direction={direction}>
          <RatingModal />
          <AdModal />
          <Header title={t.faq.header} />
          <div className="px-5 py-6">
            <StaggerItem index={0}>
              <div className={`${cardBg} border ${cardBorder} rounded-3xl p-6 shadow-sm mb-6`}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold">{t.faq.how_it_works}</h3>
                </div>
                <div className="space-y-6">
                  {[
                    { step: "1", title: t.faq.steps.create_title, desc: t.faq.steps.create_desc },
                    { step: "2", title: t.faq.steps.accept_title, desc: t.faq.steps.accept_desc },
                    { step: "3", title: t.faq.steps.pay_title, desc: t.faq.steps.pay_desc },
                    { step: "4", title: t.faq.steps.deliver_title, desc: t.faq.steps.deliver_desc },
                    { step: "5", title: t.faq.steps.confirm_title, desc: t.faq.steps.confirm_desc },
                  ].map((s, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {s.step}
                      </div>
                      <div>
                        <h4 className="font-bold text-[15px] mb-1">{s.title}</h4>
                        <p className={`text-[13px] leading-relaxed ${textSecondary}`}>{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </StaggerItem>

            {/* FAQ List */}
            <div className="space-y-4">
              <h3 className={`text-[12px] font-bold uppercase tracking-wider px-1 mb-3 ${textSecondary}`}>{t.faq.questions_header}</h3>

              {[
                { q: t.faq.q1.q, a: t.faq.q1.a },
                { q: t.faq.q2.q, a: t.faq.q2.a },
                { q: t.faq.q3.q, a: t.faq.q3.a },
              ].map((faq, i) => (
                <StaggerItem key={i} index={i + 1}>
                  <div className={`${cardBg} border ${cardBorder} rounded-2xl p-4 shadow-sm`}>
                    <h4 className="font-bold text-[14px] mb-2">{faq.q}</h4>
                    <p className={`text-[13px] leading-relaxed ${textSecondary}`}>{faq.a}</p>
                  </div>
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

  // ===== HISTORY VIEW =====
  if (view === "history") {
    const completedDeals = deals.filter(d => d.status === "completed" || d.status === "cancelled" || d.status === "declined");

    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <PageTransition direction={direction}>
          <RatingModal />
          <AdModal />
          <Header title={t.history.header} />
          <div className="px-4 pb-8">
            <StaggerItem index={0}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-4 mb-6 shadow-sm flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${isDark ? "bg-white/5" : "bg-black/5"} flex items-center justify-center text-blue-500`}>
                    <HistoryIcon className="w-5 h-5" />
                  </div>
                  <p className="font-bold text-[15px]">{t.history.transactions}</p>
                </div>
                <span className="text-xl font-black">{completedDeals.length}</span>
              </div>
            </StaggerItem>

            {completedDeals.length === 0 ? (
              <StaggerItem index={1}>
                <div className="py-16 text-center">
                  <div className={`w-16 h-16 rounded-full ${isDark ? "bg-white/5" : "bg-black/5"} flex items-center justify-center mx-auto mb-4 opacity-30`}>
                    <Archive className="w-8 h-8" />
                  </div>
                  <p className={`${textSecondary}`}>{t.history.empty}</p>
                </div>
              </StaggerItem>
            ) : (
              <div className="space-y-3">
                <h3 className={`text-[12px] font-bold uppercase tracking-wider mb-3 px-1 ${textSecondary}`}>{t.history.header}</h3>
                {completedDeals.map((d, i) => {
                  const isBuyer = usernameMatch(d.buyer_telegram, uname);
                  const statusColors = {
                    completed: "text-emerald-500",
                    cancelled: "text-gray-500",
                    declined: "text-red-500",
                    disputed: "text-amber-500"
                  };

                  return (
                    <StaggerItem key={d.id} index={i + 1}>
                      <button onClick={() => { setSelectedDeal(d); navigate("deal-detail"); }}
                        className={`${cardBg} border ${cardBorder} w-full p-4 rounded-2xl text-left press-effect shadow-sm flex items-center justify-between`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${isBuyer ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500"
                              }`}>
                              {isBuyer ? t.history.bought : t.history.sold}
                            </span>
                            <p className="font-bold text-[14px] truncate">{d.description || d.deal_id}</p>
                          </div>
                          <p className={`text-[12px] font-bold ${statusColors[d.status as keyof typeof statusColors] || "text-gray-500"} uppercase tracking-tight`}>
                            {d.status} • ₦{d.amount.toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={`text-[10px] ${textSecondary}`}>
                              {new Date(d.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <ChevronRight className={`w-5 h-5 ${textSecondary} opacity-40`} />
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
          <RatingModal />
          <AdModal />
          <Header title={t.settings.header} />
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
                    <span className={`text-[13px] ${textSecondary}`}>{t.settings.profile.total_deals}</span>
                    <span className="text-[13px] font-medium">{allUserDeals.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`text-[13px] ${textSecondary}`}>{t.settings.profile.completed}</span>
                    <span className="text-[13px] font-medium">{completedBuys + completedSells}</span>
                  </div>
                </div>
              </div>
            </StaggerItem>

            {/* Bank Details */}
            <StaggerItem index={1}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5 shadow-sm mb-4`}>
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className={`w-4 h-4 ${isDark ? "text-emerald-400" : "text-emerald-500"}`} />
                  <h3 className="font-semibold text-[14px]">{t.settings.bank.header}</h3>
                </div>
                {/* ... existing bank details fields ... */}
                {profileLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-[hsl(224,71%,50%)]" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className={`text-[12px] font-semibold uppercase tracking-wider mb-1.5 block ${textSecondary}`}>{t.settings.bank.bank_name}</label>
                      <select value={bankName} onChange={(e) => setBankName(e.target.value)}
                        className={`w-full p-3 rounded-xl text-[14px] border outline-none input-focus ${inputBg} appearance-none`}>
                        <option value="">{t.settings.bank.select_bank}</option>
                        {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={`text-[12px] font-semibold uppercase tracking-wider mb-1.5 block ${textSecondary}`}>{t.settings.bank.account_number}</label>
                      <input type="text" inputMode="numeric" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="0123456789"
                        className={`w-full p-3 rounded-xl text-[14px] border outline-none input-focus ${inputBg}`} maxLength={10} />
                    </div>
                    <div>
                      <label className={`text-[12px] font-semibold uppercase tracking-wider mb-1.5 block ${textSecondary}`}>{t.settings.bank.account_name}</label>
                      <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="John Doe"
                        className={`w-full p-3 rounded-xl text-[14px] border outline-none input-focus ${inputBg}`} maxLength={100} />
                    </div>
                    <button onClick={handleSaveProfile} disabled={savingProfile}
                      className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold py-3 rounded-xl text-[14px] press-effect disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 mt-1">
                      {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                      {savingProfile ? t.common.loading : t.settings.bank.save_btn}
                    </button>
                  </div>
                )}
              </div>
            </StaggerItem>

            {/* Language Selection */}
            <StaggerItem index={2}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5 shadow-sm mb-4`}>
                <div className="flex items-center gap-2 mb-4">
                  <Globe className={`w-4 h-4 ${isDark ? "text-amber-400" : "text-amber-500"}`} />
                  <h3 className="font-semibold text-[14px]">{t.settings.language}</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { code: "en" as const, label: "English", flag: "🇬🇧" },
                    { code: "fr" as const, label: "Français", flag: "🇫🇷" }
                  ].map((lang) => (
                    <button key={lang.code} onClick={() => setLanguage(lang.code)}
                      className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${language === lang.code ? "bg-amber-500/10 border-amber-500 text-amber-500" : `border-transparent ${isDark ? "bg-white/5" : "bg-black/5"} ${textSecondary}`
                        }`}>
                      <span className="text-[16px]">{lang.flag}</span>
                      <span className="text-[14px] font-bold">{lang.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </StaggerItem>

            {/* Notifications */}
            <StaggerItem index={3}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5 shadow-sm`}>
                <div className="flex items-center gap-2 mb-4">
                  <Bell className={`w-4 h-4 ${isDark ? "text-blue-400" : "text-blue-500"}`} />
                  <h3 className="font-semibold text-[14px]">{t.settings.notifications.header}</h3>
                </div>
                <div className="space-y-4">
                  {[
                    { key: "transactions" as const, label: t.settings.notifications.transactions },
                    { key: "disputes" as const, label: t.settings.notifications.disputes },
                    { key: "promotions" as const, label: t.settings.notifications.promotions }
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between">
                      <span className={`text-[14px] ${textSecondary}`}>{item.label}</span>
                      <button onClick={() => toggleNotif(item.key)}
                        className={`w-10 h-6 rounded-full relative transition-colors ${notifSettings[item.key] ? "bg-blue-500" : (isDark ? "bg-white/10" : "bg-black/10")}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${notifSettings[item.key] ? "left-5" : "left-1"}`} />
                      </button>
                    </div>
                  ))}
                </div>
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
          <RatingModal />
          <AdModal />
          <Header title={t.new_deal.header} />
          <div className="px-4 pb-8">
            <p className={`text-[14px] mb-4 ${textSecondary}`}>{t.new_deal.buyer_hint}</p>

            {successDeal ? (
              <StaggerItem index={0}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-8 text-center shadow-sm`}>
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="text-lg font-bold">{t.new_deal.created}</p>
                  <p className={`text-sm mt-1 font-mono ${textSecondary}`}>{successDeal}</p>
                  <p className={`text-xs mt-2 ${textSecondary}`}>{t.new_deal.waiting}</p>
                </div>
              </StaggerItem>
            ) : (
              <StaggerItem index={0}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-5 shadow-sm space-y-4`}>
                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-2 block ${textSecondary}`}>{t.new_deal.form.seller}</label>
                    <input value={sellerUsername} onChange={(e) => setSellerUsername(e.target.value)} placeholder={t.new_deal.form.placeholder_user}
                      className={`w-full p-3.5 rounded-xl text-[15px] border outline-none input-focus ${inputBg}`} />
                  </div>
                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-2 block ${textSecondary}`}>{t.new_deal.form.amount}</label>
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t.new_deal.form.placeholder_amount}
                      className={`w-full p-3.5 rounded-xl text-[15px] border outline-none input-focus ${inputBg}`} />
                  </div>
                  <div>
                    <label className={`text-[12px] font-semibold uppercase tracking-wider mb-2 block ${textSecondary}`}>{t.new_deal.form.description}</label>
                    <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.new_deal.form.placeholder_desc}
                      className={`w-full p-3.5 rounded-xl text-[15px] border outline-none input-focus ${inputBg}`} maxLength={200} />
                  </div>

                  {amount && parseInt(amount) >= 100 && parseInt(amount) <= 20000 && (
                    <div className={`p-3.5 rounded-xl text-[13px] border ${cardBorder} ${isDark ? "bg-white/[0.02]" : "bg-black/[0.015]"}`}>
                      <div className="flex justify-between mb-1">
                        <span className={textSecondary}>{t.new_deal.form.fee_label}</span>
                        <span className="font-medium">₦{Math.max(300, Math.round(parseInt(amount) * 0.05)).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={textSecondary}>{t.new_deal.form.seller_receives}</span>
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
                    {creating ? `${t.common.loading}...` : t.home.create_btn}
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
        <PageTransition direction={direction}>
          <RatingModal />
          <AdModal />
          <Header title={t.deals.header} />
          <div className="px-4 pb-8">
            <p className={`text-[14px] mb-4 ${textSecondary}`}>{deals.length} {deals.length !== 1 ? t.deals.header.toLowerCase() : t.deals.header.toLowerCase().replace(/s$/, "")}</p>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-[hsl(224,71%,50%)]" />
                <p className={`text-[13px] ${textSecondary}`}>{t.deals.loading_deals}</p>
              </div>
            ) : deals.length === 0 ? (
              <StaggerItem index={0}>
                <div className={`${cardBg} border ${cardBorder} rounded-2xl p-10 text-center shadow-sm`}>
                  <List className={`w-12 h-12 mx-auto mb-3 ${textSecondary}`} />
                  <p className="font-semibold text-[15px]">{t.deals.no_deals}</p>
                  <p className={`text-[13px] mt-1 ${textSecondary}`}>{t.deals.create_first}</p>
                  <button onClick={() => navigate("new-deal")} className="mt-4 text-[hsl(224,71%,50%)] text-[14px] font-semibold press-effect">{t.home.create_btn} →</button>
                </div>
              </StaggerItem>
            ) : (
              <div className="space-y-2">
                {deals.map((deal, i) => {
                  const st = statusConfig[deal.status] || statusConfig.pending;
                  const isBuyer = usernameMatch(deal.buyer_telegram, `@${tgUser?.username}`);
                  const isSeller = usernameMatch(deal.seller_telegram, `@${tgUser?.username}`);
                  const statusLabel = deal.status === "funded" && deal.delivered_at ? t.deals.delivered : (st.label === "Accepted" ? t.details.progress.accepted : st.label === "Funded" ? t.details.progress.paid : st.label);
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
                            <p className={`text-[11px] mt-0.5 ${textSecondary}`}>{isBuyer ? `🛒 ${t.deals.buying_label}` : `📦 ${t.deals.selling_label}`}</p>
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
    const statusLabel = selectedDeal.status === "funded" && selectedDeal.delivered_at ? t.deals.delivered : (st.label === "Accepted" ? t.details.progress.accepted : st.label === "Funded" ? t.details.progress.paid : st.label);

    return (
      <div className={`min-h-screen ${bg} ${textPrimary} overflow-x-hidden`}>
        <style>{globalStyles}</style>
        <Sidebar />
        <NotificationsOverlay />
        <PageTransition direction={direction}>
          <RatingModal />
          <AdModal />
          <Header title={t.details.header} backTo="my-deals" />
          <div className="px-4 pb-8">
            <StaggerItem index={0}>
              <div className={`${cardBg} border ${cardBorder} rounded-2xl overflow-hidden shadow-sm`}>
                <div className={`px-5 py-3 flex items-center justify-between border-b ${cardBorder}`}>
                  <div>
                    <span className="font-mono text-[12px] text-muted-foreground">{selectedDeal.deal_id}</span>
                    <p className={`text-[11px] mt-0.5 ${textSecondary}`}>
                      {isBuyer ? t.details.participants.buyer : isSeller ? t.details.participants.seller : t.details.participants.participant}
                    </p>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1 font-semibold ${st.bg} ${st.text}`}>
                    {st.icon} {statusLabel}
                  </span>
                </div>

                <div className="text-center py-6">
                  <p className={`text-[12px] ${textSecondary} mb-1`}>{t.common.amount}</p>
                  <p className="text-[32px] font-bold tracking-tight">₦{selectedDeal.amount.toLocaleString()}</p>
                  <p className={`text-[12px] mt-1 ${textSecondary}`}>
                    {t.details.fee_info.replace("{fee}", selectedDeal.fee.toLocaleString()).replace("{payout}", (selectedDeal.amount - selectedDeal.fee).toLocaleString())}
                  </p>
                </div>

                {/* Progress tracker */}
                <div className={`border-t ${cardBorder} px-5 py-4`}>
                  <p className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${textSecondary}`}>{t.details.progress.header}</p>
                  <div className="flex items-center gap-1">
                    {[
                      { label: t.details.progress.created, done: true },
                      { label: t.details.progress.accepted, done: ["accepted", "funded", "completed"].includes(selectedDeal.status) },
                      { label: t.details.progress.paid, done: ["funded", "completed"].includes(selectedDeal.status) },
                      { label: t.details.progress.delivered, done: !!selectedDeal.delivered_at || selectedDeal.status === "completed" },
                      { label: t.details.progress.confirmed, done: selectedDeal.status === "completed" },
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
                    {[t.details.progress.created, t.details.progress.accepted, t.details.progress.paid, t.details.progress.delivered, t.details.progress.done].map((l, i) => (
                      <span key={i} className={`text-[8px] ${textSecondary} flex-1 text-center`}>{l}</span>
                    ))}
                  </div>
                </div>

                <div className={`border-t ${cardBorder} px-5 py-4 space-y-3`}>
                  {[
                    { label: t.details.fields.description, value: selectedDeal.description },
                    { label: t.details.fields.buyer, value: selectedDeal.buyer_telegram },
                    { label: t.details.fields.seller, value: selectedDeal.seller_telegram },
                    { label: t.details.fields.created, value: new Date(selectedDeal.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) },
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
                      ✅ {t.details.actions.accept}
                    </button>
                    <button onClick={() => handleDeclineDeal(selectedDeal)} disabled={actionLoading}
                      className={`w-full font-semibold py-3.5 rounded-xl text-[15px] press-effect disabled:opacity-50 ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"} flex items-center justify-center gap-2`}>
                      🚫 {t.details.actions.decline}
                    </button>
                    <p className={`text-[11px] mt-2 text-center ${textSecondary}`}>{t.details.actions.accept_hint}</p>
                  </div>
                )}

                {/* BUYER: Waiting for seller */}
                {isBuyer && selectedDeal.status === "pending" && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                        ⏳ {t.details.actions.waiting_seller}
                      </p>
                    </div>
                  </div>
                )}

                {/* BUYER: Pay accepted deal */}
                {isBuyer && selectedDeal.status === "accepted" && selectedDeal.paystack_payment_link && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <a href={selectedDeal.paystack_payment_link} target="_blank" rel="noopener noreferrer"
                      className="block w-full bg-gradient-to-r from-[hsl(224,71%,40%)] to-[hsl(224,71%,52%)] text-white text-center font-semibold py-3.5 rounded-xl text-[15px] press-effect shadow-lg shadow-[hsl(224,71%,40%)/0.25]">
                      💳 {t.details.actions.pay_btn.replace("{amount}", selectedDeal.amount.toLocaleString())}
                    </a>
                    <p className={`text-[11px] mt-2 text-center ${textSecondary}`}>{t.details.actions.pay_hint}</p>
                  </div>
                )}

                {isBuyer && selectedDeal.status === "accepted" && !selectedDeal.paystack_payment_link && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-orange-500/10 border border-orange-500/20" : "bg-orange-50 border border-orange-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-orange-400" : "text-orange-600"}`}>
                        🎉 {t.details.actions.pay_telegram_hint}
                      </p>
                    </div>
                  </div>
                )}

                {/* SELLER: Waiting for payment */}
                {isSeller && selectedDeal.status === "accepted" && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-orange-500/10 border border-orange-500/20" : "bg-orange-50 border border-orange-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-orange-400" : "text-orange-600"}`}>
                        ✅ {t.details.actions.waiting_payment}
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
                      📦 {t.details.actions.mark_delivered}
                    </button>
                    <p className={`text-[11px] mt-2 text-center ${textSecondary}`}>{t.details.actions.delivered_hint}</p>
                  </div>
                )}

                {/* SELLER: Delivered, waiting */}
                {isSeller && selectedDeal.status === "funded" && selectedDeal.delivered_at && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                        ✅ {t.details.actions.waiting_confirmation.replace("{payout}", (selectedDeal.amount - selectedDeal.fee).toLocaleString())}
                      </p>
                    </div>
                  </div>
                )}

                {/* BUYER: Confirm receipt */}
                {isBuyer && selectedDeal.status === "funded" && selectedDeal.delivered_at && (
                  <div className={`border-t ${cardBorder} p-4 space-y-2`}>
                    <div className={`p-3 rounded-xl mb-2 ${isDark ? "bg-purple-500/10 border border-purple-500/20" : "bg-purple-50 border border-purple-200"}`}>
                      <p className={`text-[12px] font-medium ${isDark ? "text-purple-400" : "text-purple-600"}`}>📦 {t.details.actions.seller_marked}</p>
                    </div>
                    <button onClick={() => handleConfirmReceived(selectedDeal)} disabled={actionLoading}
                      className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold py-3.5 rounded-xl text-[15px] press-effect shadow-lg shadow-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      ✅ {t.details.actions.confirm_received}
                    </button>
                    <button onClick={() => handleOpenDispute(selectedDeal)} disabled={actionLoading}
                      className={`w-full font-semibold py-3.5 rounded-xl text-[15px] press-effect disabled:opacity-50 ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                      ⚠️ {t.details.actions.open_dispute}
                    </button>
                  </div>
                )}

                {/* BUYER: Funded, no delivery */}
                {isBuyer && selectedDeal.status === "funded" && !selectedDeal.delivered_at && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-blue-500/10 border border-blue-500/20" : "bg-blue-50 border border-blue-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                        💰 {t.details.actions.payment_confirmed}
                      </p>
                    </div>
                    <button onClick={() => handleOpenDispute(selectedDeal)} disabled={actionLoading}
                      className={`w-full mt-2 font-semibold py-3.5 rounded-xl text-[15px] press-effect disabled:opacity-50 ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                      ⚠️ {t.details.actions.open_dispute}
                    </button>
                  </div>
                )}

                {/* Refund status */}
                {selectedDeal.refund_status && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-orange-500/10 border border-orange-500/20" : "bg-orange-50 border border-orange-200"}`}>
                      <p className={`text-[12px] font-semibold mb-2 ${isDark ? "text-orange-400" : "text-orange-600"}`}>💸 {t.details.actions.refund_status}</p>
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
                        🎉 {t.details.actions.deal_complete} {isSeller ? t.details.actions.payout_released.replace("{amount}", (selectedDeal.amount - selectedDeal.fee).toLocaleString()) : t.details.actions.funds_released}
                      </p>
                    </div>
                    {/* Rate button for completed deals */}
                    <button onClick={() => { setRatingDealId(selectedDeal.deal_id); setRatingValue(0); setRatingComment(""); setShowRatingModal(true); }}
                      className={`w-full mt-2 font-semibold py-3 rounded-xl text-[14px] press-effect ${isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-amber-50 text-amber-600 border border-amber-200"} flex items-center justify-center gap-2`}>
                      <Star className="w-4 h-4" /> {t.details.actions.rate_deal}
                    </button>
                  </div>
                )}

                {/* Disputed */}
                {selectedDeal.status === "disputed" && (
                  <div className={`border-t ${cardBorder} p-4`}>
                    <div className={`p-3.5 rounded-xl ${isDark ? "bg-red-500/10 border border-red-500/20" : "bg-red-50 border border-red-200"}`}>
                      <p className={`text-[13px] font-medium ${isDark ? "text-red-400" : "text-red-600"}`}>
                        ⚠️ {t.details.actions.under_dispute}
                      </p>
                      {selectedDeal.dispute_reason && (
                        <p className={`text-[12px] mt-1 ${isDark ? "text-red-400/60" : "text-red-500/60"}`}>{t.common.description}: {selectedDeal.dispute_reason}</p>
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
function AdSection({ ad, displayImage, isDark, cardBg, cardBorder, textSecondary, setSelectedAd, setShowAdModal }: any) {
  const tracked = useRef(false);

  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true;
      const initData = window.Telegram?.WebApp?.initData;
      marketSupabase.functions.invoke('market-actions', {
        body: { action: 'track_ad_view', payload: { id: ad.id } },
        headers: initData ? { 'x-telegram-init-data': initData } : {}
      }).catch(() => { });
    }
  }, [ad.id]);

  const onAdClick = () => {
    setSelectedAd(ad);
    setShowAdModal(true);
  };

  const AdIcon = Sparkles;

  return (
    <div className="px-4 mb-3">
      <StaggerItem index={6}>
        <div
          className={`${cardBg} border-2 animate-pulse-border ${cardBorder} rounded-2xl overflow-hidden shadow-md press-effect cursor-pointer group transition-all duration-300 hover:scale-[1.02]`}
          onClick={onAdClick}
        >
          {displayImage ? (
            <img src={displayImage} alt={ad.title} className="w-full h-32 object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
          ) : ad.video_path ? (
            <video src={ad.video_path} className="w-full h-32 object-cover" muted autoPlay loop playsInline />
          ) : null}
          <div className="p-3 flex items-start gap-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-1 opacity-10">
              <AdIcon className="w-12 h-12" />
            </div>
            <div className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tighter ${isDark ? "bg-gradient-to-br from-amber-400 to-orange-500 text-black" : "bg-gradient-to-br from-amber-500 to-orange-600 text-white"}`}>Ad</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-[14px] truncate leading-none">{ad.title}</p>
                <div className="w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                <span className={`text-[10px] font-medium ${isDark ? "text-amber-400/70" : "text-amber-600/70"}`}>Sponsored</span>
              </div>
              {ad.description && <p className={`text-[12px] mt-1 ${textSecondary} line-clamp-2 leading-snug`}>{ad.description}</p>}
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark ? "bg-white/5" : "bg-black/5"} opacity-0 group-hover:opacity-100 transition-opacity`}>
              <ExternalLink className="w-4 h-4" />
            </div>
          </div>
        </div>
      </StaggerItem>
    </div>
  );
}
