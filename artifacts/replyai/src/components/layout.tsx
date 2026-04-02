import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { Clock, Settings, CreditCard, LogOut, Menu, Bot, Mail, Star, Send, FileText, AlertTriangle, Trash2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useGetMe, useGetSubscription, useGetGmailStatus } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useMailFolder, FolderId } from "@/contexts/mail-folder";

const FOLDERS = [
  { id: "INBOX" as FolderId,   label: "Inbox",   icon: Mail },
  { id: "STARRED" as FolderId, label: "Starred", icon: Star },
  { id: "SENT" as FolderId,    label: "Sent",    icon: Send },
  { id: "DRAFTS" as FolderId,  label: "Drafts",  icon: FileText },
  { id: "SPAM" as FolderId,    label: "Spam",    icon: AlertTriangle },
  { id: "TRASH" as FolderId,   label: "Trash",   icon: Trash2 },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { signOut } = useClerk();
  const { activeLabel, setActiveLabel } = useMailFolder();
  
  const { data: user } = useGetMe();
  const { data: subscription } = useGetSubscription();
  const { data: gmailStatus } = useGetGmailStatus();

  const isTrial = subscription?.plan === "trial";
  const daysLeft = subscription?.trialEndsAt 
    ? Math.max(0, Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  
  const showTrialBanner = isTrial && daysLeft <= 3;

  const handleFolderClick = (folderId: FolderId) => {
    setActiveLabel(folderId);
    if (location !== "/dashboard") setLocation("/dashboard");
  };

  const isOnDashboard = location === "/dashboard";

  const NavItems = () => (
    <>
      <div className="px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/50 tracking-wider uppercase">
        Mail
      </div>
      {FOLDERS.map(folder => {
        const Icon = folder.icon;
        const isActive = isOnDashboard && activeLabel === folder.id;
        return (
          <button
            key={folder.id}
            onClick={() => handleFolderClick(folder.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left ${
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {folder.label}
          </button>
        );
      })}

      <div className="mt-5 px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/50 tracking-wider uppercase">
        Tools
      </div>
      <Link href="/agent" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${location === "/agent" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"}`}>
        <Bot className="w-4 h-4" />
        Agent
      </Link>
      <Link href="/history" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${location === "/history" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"}`}>
        <Clock className="w-4 h-4" />
        History
      </Link>
      
      <div className="mt-5 px-3 py-1.5 text-xs font-semibold text-sidebar-foreground/50 tracking-wider uppercase">
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
        <aside className="hidden md:flex w-56 flex-col border-r bg-sidebar p-3 h-[calc(100dvh-auto)] overflow-y-auto">
          <div className="flex items-center gap-2 mb-6 px-2 pt-1">
            <Logo size={44} className="text-primary" />
            <span className="font-bold text-base tracking-tight">ReplyAI</span>
          </div>
          
          <nav className="flex flex-col flex-1 gap-0.5">
            <NavItems />
          </nav>

          {user && (
            <div className="mt-4 pt-3 border-t border-sidebar-border">
              <div className="flex items-center justify-between text-xs mb-1.5 px-2">
                <span className="text-sidebar-foreground/70 font-medium">Replies Used</span>
                <span className="font-medium">
                  {user.plan === "pro" ? "Unlimited" : `${user.repliesUsed} / ${user.repliesLimit}`}
                </span>
              </div>
              {user.plan !== "pro" && (
                <div className="h-1.5 w-full bg-sidebar-accent rounded-full overflow-hidden">
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
              <Logo size={40} className="text-primary" />
              <span className="font-bold">ReplyAI</span>
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="-mr-2">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-56 p-3 flex flex-col bg-sidebar border-r-0">
                <div className="flex items-center gap-2 mb-6 px-2 pt-1">
                  <Logo size={44} className="text-primary" />
                  <span className="font-bold text-base tracking-tight">ReplyAI</span>
                </div>
                <nav className="flex flex-col flex-1 gap-0.5">
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
