import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import {
  Sparkles, Mail, Calendar, Building2, Shield, Zap,
  CheckCircle2, ChevronDown,
} from "lucide-react";
import { useState } from "react";

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI-Powered Replies",
    desc: "Three tones — Professional, Casual, and Fast — generated in seconds from the full email thread context.",
  },
  {
    icon: Calendar,
    title: "Calendar Awareness",
    desc: "ReplyAI reads your upcoming events and automatically suggests times that don't conflict with your schedule.",
  },
  {
    icon: Building2,
    title: "HubSpot Integration",
    desc: "See deal stage and contact history right next to each email. Create new contacts without leaving your inbox.",
  },
  {
    icon: Mail,
    title: "Full Gmail Support",
    desc: "Inbox, Starred, Sent, Drafts, Spam, and Trash — plus labels and search across your entire mailbox.",
  },
  {
    icon: Zap,
    title: "Autonomous Agent",
    desc: "Ask the agent to summarize threads, schedule meetings, or draft follow-ups. It works in steps and waits for your approval before sending anything.",
  },
  {
    icon: Shield,
    title: "Human in the Loop",
    desc: "The AI never sends without your review. Every suggestion is a draft — you always have the final word.",
  },
];

const TESTIMONIALS = [
  {
    quote: "I was spending two hours a day just on email. ReplyAI cut that to twenty minutes. The calendar-aware replies are uncanny.",
    name: "Alex Rivera",
    title: "Founder, Meridian Labs",
  },
  {
    quote: "The HubSpot panel is what sold me. I can see a deal's stage and write a follow-up without switching tabs once.",
    name: "Priya Nair",
    title: "Head of Sales, CloudBridge",
  },
  {
    quote: "Our whole team uses it. The 'Fast' tone is my go-to — it gets to the point while still sounding like me.",
    name: "Tom Keane",
    title: "CTO, Stackform",
  },
];

const FAQS = [
  {
    q: "Does ReplyAI ever send emails automatically?",
    a: "No. Every AI-generated reply is shown to you as a draft. You choose what to send. The agent also waits for your explicit confirmation before sending anything.",
  },
  {
    q: "Which Gmail scopes does ReplyAI request?",
    a: "We request read and send access to your Gmail, and optionally read access to Google Calendar, Contacts, and Drive. You can revoke access at any time from your Google account settings.",
  },
  {
    q: "What happens after my 14-day trial?",
    a: "You can upgrade to Pro for $99/year to keep unlimited AI replies. If you don't upgrade, your account is paused — your data stays safe and you can resume any time.",
  },
  {
    q: "Does it work with Google Workspace accounts?",
    a: "Yes. ReplyAI works with both personal Gmail and Google Workspace (G Suite) accounts.",
  },
  {
    q: "Is my email data stored on your servers?",
    a: "Email content is sent to the AI model to generate a reply and is never stored permanently. We store only the reply history you explicitly generate.",
  },
];

const PLANS = [
  {
    name: "Free Trial",
    price: "Free",
    period: "14 days",
    features: ["50 AI-generated replies", "Gmail + Calendar", "All 3 reply tones", "AI Agent (limited)"],
    cta: "Start Free Trial",
    href: "/sign-up",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$99",
    period: "per year",
    features: ["Unlimited replies", "HubSpot integration", "Google Drive & Contacts", "Autonomous agent", "Priority support"],
    cta: "Get Pro",
    href: "/sign-up",
    highlighted: true,
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-b-0">
      <button
        className="w-full flex items-center justify-between py-4 text-left text-sm font-medium hover:text-foreground/80 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {q}
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="pb-4 text-sm text-muted-foreground leading-relaxed">{a}</p>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={36} className="text-foreground" />
            <span className="font-bold text-lg tracking-tight">ReplyAI</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link href="/sign-up">
              <Button size="sm" className="font-medium rounded-full px-4">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-4 py-24 md:py-36 bg-gradient-to-b from-background to-muted/20">
        <div className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold bg-secondary text-secondary-foreground mb-8">
          The ultimate email cockpit
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tighter max-w-4xl leading-[1.08] mb-6">
          Write perfect replies in seconds, not minutes.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
          ReplyAI is your AI-powered email assistant. It reads your inbox, knows your calendar, and drafts flawless responses that sound exactly like you.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/sign-up">
            <Button size="lg" className="h-12 px-8 text-base font-medium rounded-full shadow-lg hover:shadow-xl transition-all w-full sm:w-auto">
              Start your 14-day free trial
            </Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="outline" className="h-12 px-8 text-base font-medium rounded-full w-full sm:w-auto">
              View Pricing
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">No credit card required. Cancel anytime.</p>
      </section>

      {/* Features */}
      <section id="features" className="py-20 md:py-28 container mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Everything your inbox needs</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            ReplyAI sits directly inside your Gmail workflow — no tabs to switch, no copy-pasting, no friction.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border bg-card p-6 flex flex-col gap-3 hover:shadow-md transition-shadow">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-4.5 h-4.5 text-primary" />
              </div>
              <h3 className="font-semibold text-base">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 md:py-28 bg-muted/30 border-y">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Loved by people who live in email</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {TESTIMONIALS.map(({ quote, name, title }) => (
              <div key={name} className="bg-background rounded-xl border p-6 flex flex-col gap-4">
                <p className="text-sm leading-relaxed text-foreground/80 flex-1">"{quote}"</p>
                <div>
                  <p className="font-semibold text-sm">{name}</p>
                  <p className="text-xs text-muted-foreground">{title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 md:py-28 container mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Simple, honest pricing</h2>
          <p className="text-muted-foreground">Start free. Upgrade when you're ready.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl border p-8 flex flex-col gap-6 ${
                plan.highlighted
                  ? "bg-foreground text-background border-foreground shadow-xl"
                  : "bg-card"
              }`}
            >
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${plan.highlighted ? "text-background/60" : "text-muted-foreground"}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                  <span className={`text-sm pb-1 ${plan.highlighted ? "text-background/70" : "text-muted-foreground"}`}>/{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <CheckCircle2 className={`w-4 h-4 shrink-0 ${plan.highlighted ? "text-background/70" : "text-primary"}`} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href={plan.href} className="mt-auto">
                <Button
                  className={`w-full rounded-full font-medium ${plan.highlighted ? "bg-background text-foreground hover:bg-background/90" : ""}`}
                  variant={plan.highlighted ? "outline" : "default"}
                >
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 md:py-28 bg-muted/30 border-t">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Frequently asked questions</h2>
          </div>
          <div className="rounded-xl border bg-background divide-y overflow-hidden px-6">
            {FAQS.map((f) => (
              <FAQItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-20 text-center container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          Ready to take back your time?
        </h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Join thousands of professionals who reply faster, smarter, and stress-free.
        </p>
        <Link href="/sign-up">
          <Button size="lg" className="h-12 px-10 text-base font-medium rounded-full shadow-lg hover:shadow-xl transition-all">
            Start your free trial
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Logo size={24} className="text-foreground" />
            <span>ReplyAI © {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            <Link href="/sign-in" className="hover:text-foreground transition-colors">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
