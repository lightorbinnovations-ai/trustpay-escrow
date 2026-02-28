import { Shield, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TermsPage() {
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
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
            <p className="text-muted-foreground text-sm">Last updated: February 2026</p>
          </div>
        </div>

        <div className="glass-card p-6 md:p-8 space-y-6 text-sm leading-relaxed text-foreground/80">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing and using TrustPay9ja ("the Service"), you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, please do not use the Service. The Service is operated by 
              <strong> LightOrb Innovations</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Service Description</h2>
            <p>
              TrustPay9ja is an escrow platform integrated with Telegram that facilitates secure transactions 
              between buyers and sellers. The Service holds funds in escrow until both parties confirm 
              the successful completion of a transaction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Eligibility</h2>
            <p>
              You must be at least 18 years old and have a valid Telegram account to use this Service. 
              By using the Service, you represent that you meet these requirements and have the legal 
              capacity to enter into binding agreements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Transaction Limits & Fees</h2>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li>Maximum transaction amount: ₦20,000 per deal</li>
              <li>Minimum transaction amount: ₦100 per deal</li>
              <li>Platform fee: 5% of transaction amount (minimum ₦300)</li>
              <li>Fees are non-refundable once a transaction is completed</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Escrow Process</h2>
            <p className="mb-2">The escrow process works as follows:</p>
            <ol className="list-decimal list-inside space-y-1.5 ml-2">
              <li>Buyer creates a deal specifying the seller, amount, and description</li>
              <li>Buyer makes payment through our secure payment partner (Paystack)</li>
              <li>Funds are held securely in escrow</li>
              <li>Seller delivers the goods or services</li>
              <li>Buyer confirms receipt, and funds are released to the seller</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Disputes</h2>
            <p>
              If a buyer is not satisfied with the delivery, they may open a dispute. Our team will 
              review the dispute and make a determination. Funds remain in escrow during the dispute 
              resolution process. We reserve the right to make final decisions on all disputes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Auto-Release</h2>
            <p>
              If the buyer does not confirm receipt or open a dispute within 48 hours of the seller 
              marking delivery, funds will be automatically released to the seller.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Prohibited Activities</h2>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li>Using the Service for illegal transactions</li>
              <li>Attempting to defraud other users</li>
              <li>Creating multiple accounts to circumvent limits</li>
              <li>Interfering with the Service's operation</li>
              <li>Engaging in money laundering or terrorist financing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Limitation of Liability</h2>
            <p>
              TrustPay9ja and LightOrb Innovations shall not be liable for any indirect, incidental, special, 
              or consequential damages arising out of or in connection with your use of the Service. 
              Our total liability shall not exceed the fees collected on your transactions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. Continued use of the Service 
              after changes constitutes acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Contact</h2>
            <p>
              For questions about these Terms, contact us through the TrustPay9ja Telegram bot 
              or reach out to <strong>LightOrb Innovations</strong>.
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
