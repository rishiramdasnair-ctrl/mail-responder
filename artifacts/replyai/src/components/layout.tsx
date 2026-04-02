import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { Inbox, Clock, Settings, CreditCard, LogOut, Mail, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetMe, useGetSubscription, useGetGmailStatus } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  
  const { data: user } = useGetMe();
  const { data: subscription } = useGetSubscription();
  const { data: gmailStatus } = useGetGmailStatus();

  const isTrial = subscription?.plan === "trial";
  const daysLeft = subscription?.trialEndsAt 
    ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  
  const showTrialBanner = isTrial && daysLeft <= 3;

  const NavItems = () => (
    <>
      <div className="px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 tracking-wider uppercase">
        Inbox
      </div>
      <Link href="/dashboard" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${location === "/dashboard" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"}`}>
        <Inbox className="w-4 h-4" />
        Dashboard
      </Link>
      <Link href="/history" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${location === "/history" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"}`}>
        <Clock className="w-4 h-4" />
        History
      </Link>
      
      <div className="mt-6 px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 tracking-wider uppercase">
        Account
      </div>
      <Link href="/settings" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${location === "/settings" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"}`}>
        <Settings className="w-4 h-4" />
        Settings
      </Link>
      <Link href="/pricing" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${location === "/pricing" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"}`}>
        <CreditCard className="w-4 h-4" />
        Billing
      </Link>

      <div className="mt-auto pt-6">
        <button onClick={() => signOut()} className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors">
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      {showTrialBanner && (
        <div className="bg-primary text-primary-foreground px-4 py-2 text-sm font-medium flex items-center justify-center gap-2">
          <span>Your trial expires in {daysLeft} days.</span>
          <Link href="/pricing" className="underline underline-offset-2 hover:text-primary-foreground/80">Upgrade now</Link>
        </div>
      )}
      
      {gmailStatus !== undefined && !gmailStatus?.connected && location !== "/settings" && (
        <div className="bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400 px-4 py-2 text-sm font-medium flex items-center justify-center gap-2 border-b border-amber-200 dark:border-amber-800">
          <span>Gmail connection unavailable. Please refresh the page or check your settings.</span>
          <Link href="/settings" className="underline underline-offset-2">View Settings</Link>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar p-4 h-[calc(100dvh-auto)] overflow-y-auto">
          <div className="flex items-center gap-2 mb-8 px-2">
            <Mail className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg tracking-tight">ReplyAI</span>
          </div>
          
          <nav className="flex flex-col flex-1 gap-1">
            <NavItems />
          </nav>

          {user && (
            <div className="mt-6 pt-4 border-t border-sidebar-border">
              <div className="flex items-center justify-between text-sm mb-2 px-2">
                <span className="text-sidebar-foreground/70 font-medium">Replies Used</span>
                <span className="font-medium">
                  {user.plan === "pro" ? "Unlimited" : `${user.repliesUsed} / ${user.repliesLimit}`}
                </span>
              </div>
              {user.plan !== "pro" && (
                <div className="h-2 w-full bg-sidebar-accent rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, (user.repliesUsed / user.repliesLimit) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Mobile Header & Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="md:hidden flex items-center justify-between p-4 border-b bg-background">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              <span className="font-bold">ReplyAI</span>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="-mr-2">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-4 flex flex-col bg-sidebar border-r-0">
                <nav className="flex flex-col flex-1 gap-1 mt-6">
                  <NavItems />
                </nav>
              </SheetContent>
            </Sheet>
          </header>
          
          <main className="flex-1 overflow-hidden relative">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
