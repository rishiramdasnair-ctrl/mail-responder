import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { useGetSettings, useUpdateSettings, useGetGmailStatus, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Loader2, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

const settingsSchema = z.object({
  defaultTone: z.enum(["pro", "casual", "fast"]),
  customInstructions: z.string().max(500).optional(),
  emailSignature: z.string().max(1000).optional(),
  darkMode: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { toast } = useToast();
  const { setTheme } = useTheme();
  
  const { data: settings, isLoading: isLoadingSettings } = useGetSettings();
  const { data: gmailStatus, isLoading: isLoadingGmail } = useGetGmailStatus();
  const updateSettings = useUpdateSettings();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      defaultTone: "pro",
      customInstructions: "",
      emailSignature: "",
      darkMode: false,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        defaultTone: settings.defaultTone as any,
        customInstructions: settings.customInstructions || "",
        emailSignature: settings.emailSignature || "",
        darkMode: settings.darkMode || false,
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

  const handleConnectGmail = () => {
    toast({
      title: "Gmail is managed server-side",
      description: "Your Gmail account is connected via the platform integration. If you're seeing issues, try refreshing the page.",
    });
  };

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 md:p-10 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-8">Settings</h1>

        <div className="space-y-10">
          
          <section>
            <h2 className="text-xl font-semibold mb-4 pb-2 border-b">Integrations</h2>
            {isLoadingGmail ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">Google Workspace</h3>
                    <p className="text-sm text-muted-foreground">
                      {gmailStatus?.connected ? `Connected as ${gmailStatus.email}` : "Not connected"}
                    </p>
                  </div>
                </div>
                {gmailStatus?.connected ? (
                  <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-500">
                    <CheckCircle2 className="w-4 h-4" /> Connected
                  </div>
                ) : (
                  <Button onClick={handleConnectGmail}>
                    Connect Gmail
                  </Button>
                )}
              </div>
            )}
            {!gmailStatus?.connected && !isLoadingGmail && (
              <p className="mt-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                You must connect your Gmail account to use ReplyAI.
              </p>
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
                            placeholder="Your signature..."
                            className="resize-none h-24 font-mono text-sm"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Appended to the end of sent replies.
                        </FormDescription>
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
