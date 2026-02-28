import { Shield, ArrowLeft, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-16">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
            <p className="text-muted-foreground text-sm">Last updated: February 2026</p>
          </div>
        </div>

        <div className="glass-card p-6 md:p-8 space-y-6 text-sm leading-relaxed text-foreground/80">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Introduction</h2>
            <p>
              This Privacy Policy explains how TrustPay9ja, operated by <strong>LightOrb Innovations</strong>, 
              collects, uses, and protects your information when you use our escrow service. We are 
              committed to safeguarding your privacy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Information We Collect</h2>
            <p className="mb-2">We collect the following types of information:</p>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li><strong>Telegram Information:</strong> Username, user ID, and first name from your Telegram account</li>
              <li><strong>Transaction Data:</strong> Deal amounts, descriptions, payment references, and transaction history</li>
              <li><strong>Payment Information:</strong> Payment references and confirmation data (processed securely by Paystack)</li>
              <li><strong>Activity Logs:</strong> Actions taken on the platform for security and audit purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li>To facilitate and process escrow transactions</li>
              <li>To verify user identities and prevent fraud</li>
              <li>To resolve disputes between buyers and sellers</li>
              <li>To send transaction notifications and updates</li>
              <li>To improve our Service and user experience</li>
              <li>To comply with legal and regulatory requirements</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Data Storage & Security</h2>
            <p>
              Your data is stored securely using industry-standard encryption and security practices. 
              We use secure cloud infrastructure to protect your information. Payment processing is 
              handled by Paystack, a PCI-DSS compliant payment processor, and we never store your 
              full card details.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Data Sharing</h2>
            <p className="mb-2">We do not sell your data. We may share information with:</p>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li><strong>Transaction Counterparties:</strong> Your Telegram username is shared with the other party in a deal</li>
              <li><strong>Payment Processors:</strong> Paystack processes payments on our behalf</li>
              <li><strong>Law Enforcement:</strong> When required by law or to prevent fraud</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Data Retention</h2>
            <p>
              Transaction records are retained for a minimum of 12 months for compliance and dispute 
              resolution purposes. Audit logs are retained for security monitoring. You may request 
              deletion of your non-essential data by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Your Rights</h2>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li>Request access to your personal data</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data (subject to legal requirements)</li>
              <li>Opt out of non-essential communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Cookies & Tracking</h2>
            <p>
              Our web application may use local storage and session data to maintain your login state 
              and preferences. We do not use third-party tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Children's Privacy</h2>
            <p>
              The Service is not intended for users under 18 years of age. We do not knowingly collect 
              information from children.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify users of material 
              changes through the Telegram bot. Continued use of the Service constitutes acceptance 
              of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Contact Us</h2>
            <p>
              For questions or concerns about this Privacy Policy, contact us through the 
              TrustPay9ja Telegram bot or reach out to <strong>LightOrb Innovations</strong>.
            </p>
          </section>
        </div>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          <p>Powered by <strong className="text-foreground">LightOrb Innovations</strong></p>
        </div>
      </div>
    </div>
  );
}
