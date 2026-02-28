import { Zap } from "lucide-react";
import { Link } from "react-router-dom";

export default function PoweredByFooter() {
  return (
    <footer className="border-t border-border bg-card/50 py-4 px-6 mt-auto">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 max-w-7xl mx-auto">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Zap className="w-3.5 h-3.5 text-accent" />
          <span>
            Powered by <strong className="text-foreground font-semibold">LightOrb Innovations</strong>
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <span className="text-border">|</span>
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
