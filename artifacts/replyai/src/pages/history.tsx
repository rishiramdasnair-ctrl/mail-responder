import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { useGetHistory } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, Mail, Clock } from "lucide-react";
import { format } from "date-fns";

export default function History() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useGetHistory(
    { limit: 50, offset: 0, q: debouncedSearch || undefined },
  );

  return (
    <AppLayout>
      <div className="h-full flex flex-col">
        <div className="p-6 border-b shrink-0">
          <h1 className="text-2xl font-bold tracking-tight mb-4">Reply History</h1>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search past replies..." 
              className="pl-9 bg-secondary/50 border-transparent focus-visible:bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && !data ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : data?.items.length === 0 ? (
            <div className="text-center py-20">
              <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium">No history found</h3>
              <p className="text-muted-foreground mt-1">
                {debouncedSearch ? "Try adjusting your search." : "Replies you send will appear here."}
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-w-4xl">
              {data?.items.map((item) => (
                <Card key={item.id} className="overflow-hidden border-border/50 shadow-sm">
                  <div className="bg-secondary/30 px-4 py-3 flex items-start justify-between gap-4 border-b border-border/50">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="bg-background capitalize font-medium">
                          {item.tone}
                        </Badge>
                        <span className="text-sm font-medium truncate">{item.subject}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" />
                        <span className="truncate">{item.fromEmail}</span>
                        <span>•</span>
                        <span>{format(new Date(item.sentAt), "MMM d, yyyy h:mm a")}</span>
                      </div>
                    </div>
                  </div>
                  <CardContent className="p-4 text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">
                    {item.replySent}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
