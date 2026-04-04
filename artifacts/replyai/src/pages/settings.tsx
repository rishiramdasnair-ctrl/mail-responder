import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Loader2, Mail, CheckCircle2, AlertCircle, Plus, Trash2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

interface GmailAccount {
  email: string;
  isPrimary: boolean;
}

const settingsSchema = z.object({
  defaultTone: z.enum(["pro", "casual", "fast"]),
  customInstructions: z.string().max(500).optional(),
  emailSignature: z.string().max(1000).optional(),
  darkMode: z.boolean(),
  notifications: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { toast } = useToast();
  const { setTheme } = useTheme();
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  
  const { data: settings, isLoading: isLoadingSettings } = useGetSettings();
  const updateSettings = useUpdateSettings();

  const { data: gmailAccountsData, isLoading: isLoadingAccounts, refetch: refetchAccounts } = useQuery({
    queryKey: ["gmail-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/gmail/accounts", { credentials: "include" });
      if (!res.ok) return { accounts: [] as GmailAccount[] };
      return res.json() as Promise<{ accounts: GmailAccount[] }>;
    },
  });
  const gmailAccounts = gmailAccountsData?.accounts ?? [];

  const removeAccount = async (email: string) => {
    setRemovingEmail(email);
    try {
      const res = await fetch(`/api/gmail/accounts/${encodeURIComponent(email)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      await refetchAccounts();
      toast({ title: "Account removed", description: `${email} has been disconnected.` });
    } catch {
      toast({ title: "Error", description: "Failed to remove account.", variant: "destructive" });
    } finally {
      setRemovingEmail(null);
    }
  };

  // Show error toast if redirected back from OAuth with error
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailError = params.get("gmail_error");
    if (gmailError) {
      const descriptions: Record<string, string> = {
        access_denied: "You denied Gmail access. Please try again and grant all permissions.",
        not_configured: "Google OAuth credentials are not yet configured on the server.",
        missing_params: "OAuth response was incomplete. Please try again.",
        callback_failed: "Something went wrong exchanging your Google token. Please try again.",
        start_failed: "Could not start the Gmail connection. Please try again.",
      };
      toast({
        title: "Gmail connection failed",
        description: descriptions[gmailError] || "Something went wrong connecting your Gmail.",
        variant: "destructive",
      });
      // Clean up the URL
      const url = new URL(window.location.href);
      url.searchParams.delete("gmail_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      defaultTone: "pro",
      customInstructions: "",
      emailSignature: "",
      darkMode: false,
      notifications: true,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        defaultTone: settings.defaultTone as "pro" | "casual" | "fast",
        customInstructions: settings.customInstructions || "",
        emailSignature: settings.emailSignature || "",
        darkMode: settings.darkMode || false,
        notifications: settings.notifications ?? true,
      });
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsFormValues) => {
    updateSettings.mutate(
      { data },
      {
        onSuccess: (updated) => {
          setTheme(updated.darkMode ? "dark" : "light");
          queryClient.setQueryData(getGetSettingsQueryKey(), updated);
          toast({
            title: "Settings saved",
            description: "Your preferences have been updated.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save settings.",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 md:p-10 pb-24 md:pb-10 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-8">Settings</h1>

        <div className="space-y-10">
          
          <section>
            <h2 className="text-xl font-semibold mb-1 pb-2 border-b">Gmail Accounts</h2>
            <p className="text-sm text-muted-foreground mb-4">Connect one or more Gmail accounts. You can switch between them in the inbox.</p>

            {isLoadingAccounts ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="space-y-3">
                {gmailAccounts.length === 0 && (
                  <div className="border rounded-lg p-6 flex flex-col items-center gap-3 text-center bg-card">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Mail className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">No Gmail accounts connected</p>
                      <p className="text-sm text-muted-foreground mt-1">Connect your Gmail to start using ReplyAI.</p>
                    </div>
                    <Button onClick={() => { window.location.href = "/api/auth/google/start"; }} className="mt-1">
                      <Mail className="w-4 h-4 mr-2" />
                      Connect Gmail
                    </Button>
                  </div>
                )}

                {gmailAccounts.map((account) => (
                  <div key={account.email} className="border rounded-lg bg-card overflow-hidden">
                    <div className="flex items-center gap-4 p-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-semibold text-primary">
                        {account.email[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{account.email}</p>
                          {account.isPrimary && (
                            <Badge variant="secondary" className="text-xs shrink-0">Primary</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-500" />
                          <span className="text-xs text-green-600 dark:text-green-500 font-medium">Connected</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeAccount(account.email)}
                        disabled={removingEmail === account.email}
                        className="shrink-0 text-destructive hover:text-destructive"
                      >
                        {removingEmail === account.email
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  className="w-full border-dashed gap-2 h-11"
                  onClick={() => { window.location.href = "/api/auth/google/start?addAccount=true"; }}
                >
                  <Plus className="w-4 h-4" />
                  Add another Gmail account
                </Button>

                {gmailAccounts.length === 0 && (
                  <p className="text-sm text-destructive flex items-center gap-2 mt-2">
                    <AlertCircle className="w-4 h-4" />
                    You must connect a Gmail account to use ReplyAI.
                  </p>
                )}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4 pb-2 border-b">Preferences</h2>
            {isLoadingSettings ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  
                  <FormField
                    control={form.control}
                    name="defaultTone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Reply Tone</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Select a tone" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pro">Professional</SelectItem>
                            <SelectItem value="casual">Casual</SelectItem>
                            <SelectItem value="fast">Fast & Direct</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          The tone the AI will default to when generating replies.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customInstructions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom AI Instructions</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="e.g. Always start with 'Hi,' and end with 'Best,'. Never commit to meetings on Fridays."
                            className="resize-none h-24"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Rules the AI will follow for every generated reply.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="emailSignature"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Signature</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder={"Best,\nYour Name\nCompany | yourwebsite.com"}
                            className="resize-none h-24 font-mono text-sm"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Appended to the end of sent replies.
                        </FormDescription>
                        {field.value && (
                          <div className="mt-2 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                            {field.value}
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="darkMode"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-card">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Dark Mode</FormLabel>
                          <FormDescription>
                            Enable dark theme for the application.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notifications"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-card">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">In-App Notifications</FormLabel>
                          <FormDescription>
                            Show alerts for trial expiry and usage limits.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={updateSettings.isPending}>
                    {updateSettings.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Preferences
                  </Button>
                </form>
              </Form>
            )}
          </section>

        </div>
      </div>
    </AppLayout>
  );
}
