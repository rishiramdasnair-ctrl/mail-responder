import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout";
import { 
  useGetInbox, 
  useGetThread, 
  useGenerateReplies, 
  useSendReply,
  getGetInboxQueryKey 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { 
  Search, 
  RefreshCw, 
  Mail, 
  ChevronRight, 
  Sparkles, 
  Send,
  User,
  Clock,
  Loader2
} from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { toast } = useToast();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Show success toast if redirected here after Gmail OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail_connected") === "true") {
      toast({ title: "Gmail connected!", description: "Your inbox is now loading." });
      const url = new URL(window.location.href);
      url.searchParams.delete("gmail_connected");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const { data: inboxData, isLoading: isLoadingInbox, refetch: refetchInbox } = useGetInbox(
    { maxResults: 20, q: debouncedSearch || undefined },
  );

  const { data: threadData, isLoading: isLoadingThread } = useGetThread(
    selectedThreadId || "",
    { query: { enabled: !!selectedThreadId, queryKey: [selectedThreadId] } }
  );

  const generateReplies = useGenerateReplies();
  const sendReply = useSendReply();

  // Automatically generate replies when a thread is selected and loaded
  useEffect(() => {
    if (threadData && threadData.messages.length > 0) {
      const lastMessage = threadData.messages[threadData.messages.length - 1];
      
      // Prevent regenerating if we already generated for this thread recently
      // Simple cache check could go here, but for now we just fire it
      generateReplies.mutate({
        data: {
          threadId: threadData.id,
          emailBody: lastMessage.body || lastMessage.snippet,
          emailFrom: lastMessage.from,
          emailSubject: lastMessage.subject,
        }
      });
    }
  }, [threadData?.id]); // Only run when thread ID changes

  const handleSend = (content: string, tone: string) => {
    if (!threadData || !selectedThreadId) return;
    
    const lastMessage = threadData.messages[threadData.messages.length - 1];
    
    sendReply.mutate(
      {
        data: {
          threadId: selectedThreadId,
          to: lastMessage.from, // simplified
          subject: lastMessage.subject.startsWith("Re:") ? lastMessage.subject : `Re: ${lastMessage.subject}`,
          body: content,
          inReplyTo: lastMessage.id,
        }
      },
      {
        onSuccess: () => {
          toast({
            title: "Reply sent",
            description: `Sent ${tone} reply successfully.`,
          });
          // Remove from list or mark read
          queryClient.invalidateQueries({ queryKey: getGetInboxQueryKey() });
          setSelectedThreadId(null);
        },
        onError: () => {
          toast({
            title: "Failed to send",
            description: "An error occurred while sending the reply.",
            variant: "destructive",
          });
        }
      }
    );
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (!inboxData?.threads.length) return;
      
      const currentIndex = inboxData.threads.findIndex(t => t.threadId === selectedThreadId);
      
      if (e.key === "j") {
        const nextIndex = currentIndex < inboxData.threads.length - 1 ? currentIndex + 1 : 0;
        setSelectedThreadId(inboxData.threads[nextIndex].threadId);
      } else if (e.key === "k") {
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : inboxData.threads.length - 1;
        setSelectedThreadId(inboxData.threads[prevIndex].threadId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inboxData, selectedThreadId]);


  return (
    <AppLayout>
      <div className="flex h-full overflow-hidden bg-background">
        
        {/* Inbox List Pane */}
        <div className="w-full md:w-[400px] flex-shrink-0 flex flex-col border-r bg-background z-10">
          <div className="p-4 border-b flex flex-col gap-3 shrink-0 bg-sidebar/30">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Inbox</h2>
              <Button variant="ghost" size="icon" onClick={() => refetchInbox()} className="h-8 w-8 text-muted-foreground">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search emails..." 
                className="pl-9 h-9 bg-background shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <ScrollArea className="flex-1">
            {isLoadingInbox ? (
              <div className="p-4 space-y-4">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                    </div>
                  </div>
                ))}
              </div>
            ) : inboxData?.threads.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                <Mail className="w-8 h-8 mb-3 opacity-20" />
                <p>No emails found</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {inboxData?.threads.map((thread) => (
                  <button
                    key={thread.threadId}
                    onClick={() => setSelectedThreadId(thread.threadId)}
                    className={`w-full text-left p-4 transition-colors hover:bg-secondary/50 focus:outline-none flex flex-col gap-1
                      ${selectedThreadId === thread.threadId ? "bg-secondary border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}`}
                  >
                    <div className="flex justify-between items-baseline mb-1 w-full">
                      <span className={`font-medium truncate pr-2 ${thread.isUnread ? "text-foreground" : "text-foreground/80"}`}>
                        {thread.fromName || thread.from.split("<")[0].replace(/"/g, "")}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {format(new Date(Number(thread.date)), "MMM d")}
                      </span>
                    </div>
                    <span className={`text-sm truncate w-full ${thread.isUnread ? "font-semibold text-foreground" : "text-foreground/70"}`}>
                      {thread.subject || "(No subject)"}
                    </span>
                    <span className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                      {thread.snippet}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Thread & Reply Pane */}
        <div className="flex-1 flex flex-col hidden md:flex min-w-0 bg-secondary/10">
          {!selectedThreadId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                <Mail className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-lg font-medium text-foreground/70">Select an email to view</p>
              <p className="text-sm mt-1">Use J/K keys to navigate quickly</p>
            </div>
          ) : isLoadingThread ? (
            <div className="flex-1 p-8 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">Loading thread...</p>
            </div>
          ) : threadData ? (
            <>
              {/* Thread Header */}
              <div className="p-6 border-b bg-background shrink-0 shadow-sm z-10">
                <h1 className="text-xl font-bold tracking-tight mb-4">{threadData.subject}</h1>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold truncate">
                      {threadData.messages[threadData.messages.length - 1].from}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(Number(threadData.messages[threadData.messages.length - 1].date)), "PPP 'at' p")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Email Content */}
                <ScrollArea className="flex-1 p-6">
                  <div className="prose dark:prose-invert max-w-none text-sm">
                    {/* Basic rendering of body snippet since we don't have full HTML parsing setup in this simple version */}
                    <div className="whitespace-pre-wrap font-sans leading-relaxed text-foreground/90">
                      {threadData.messages[threadData.messages.length - 1].body || threadData.messages[threadData.messages.length - 1].snippet}
                    </div>
                  </div>
                </ScrollArea>

                {/* AI Reply Section */}
                <div className="shrink-0 border-t bg-sidebar/30 p-6 flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-sm uppercase tracking-wider text-sidebar-foreground/70">AI Suggestions</h3>
                  </div>

                  {generateReplies.isPending ? (
                    <div className="grid grid-cols-3 gap-4">
                      {[1,2,3].map(i => (
                        <Card key={i} className="bg-background/50 border-border/50">
                          <CardContent className="p-4 space-y-3">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-8 w-full mt-4" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : generateReplies.data?.suggestions ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {generateReplies.data.suggestions.map((suggestion, idx) => (
                        <Card key={idx} className="flex flex-col border-border/50 hover:border-primary/50 transition-colors shadow-sm bg-background">
                          <div className="px-4 py-2 border-b bg-secondary/30 flex justify-between items-center">
                            <span className="text-xs font-semibold uppercase tracking-wider">{suggestion.tone}</span>
                          </div>
                          <CardContent className="p-4 flex-1 flex flex-col">
                            <div className="text-sm flex-1 whitespace-pre-wrap mb-4 text-foreground/90 leading-relaxed font-sans">
                              {suggestion.content}
                            </div>
                            <div className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded mb-4 italic">
                              "{suggestion.reasoning}"
                            </div>
                            <Button 
                              className="w-full mt-auto" 
                              size="sm"
                              onClick={() => handleSend(suggestion.content, suggestion.tone)}
                              disabled={sendReply.isPending}
                            >
                              {sendReply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3 h-3 mr-2" /> Send Reply</>}
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Button variant="outline" onClick={() => generateReplies.mutate({
                        data: {
                          threadId: threadData.id,
                          emailBody: threadData.messages[threadData.messages.length - 1].body || "",
                          emailFrom: threadData.messages[threadData.messages.length - 1].from,
                          emailSubject: threadData.subject,
                        }
                      })}>
                        Regenerate Suggestions
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

      </div>
    </AppLayout>
  );
}
