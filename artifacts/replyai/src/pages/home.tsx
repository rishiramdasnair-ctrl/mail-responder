import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <header className="container mx-auto px-4 h-16 flex items-center justify-between border-b">
        <div className="font-bold text-xl tracking-tight">ReplyAI</div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Log in
          </Link>
          <Link href="/sign-up">
            <Button size="sm" className="font-medium rounded-full">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mb-8">
          The ultimate email cockpit
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter max-w-4xl leading-[1.1] mb-6">
          Write perfect replies in seconds, not minutes.
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
          ReplyAI is your brilliant EA inside Gmail. It reads your inbox and drafts flawless responses instantly, adapting to your tone. Take back your time.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/sign-up">
            <Button size="lg" className="h-12 px-8 text-base font-medium rounded-full shadow-lg hover:shadow-xl transition-all">
              Start your 14-day free trial
            </Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="outline" className="h-12 px-8 text-base font-medium rounded-full">
              View Pricing
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
