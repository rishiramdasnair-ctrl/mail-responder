import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useGetPlans, useGetSubscription, useCreateCheckout, useCreateBillingPortal } from "@workspace/api-client-react";

export default function Pricing() {
  const { data: plansData, isLoading: isLoadingPlans } = useGetPlans();
  const { data: subscription, isLoading: isLoadingSub } = useGetSubscription();
  const createCheckout = useCreateCheckout();
  const createBillingPortal = useCreateBillingPortal();

  const handleCheckout = (priceId: string, interval: "month" | "year") => {
    createCheckout.mutate(
      { data: { priceId, interval } },
      {
        onSuccess: (data) => {
          window.location.href = data.url;
        }
      }
    );
  };

  const handleManageBilling = () => {
    createBillingPortal.mutate(
      undefined,
      {
        onSuccess: (data) => {
          window.location.href = data.url;
        }
      }
    );
  };

  const proPlan = plansData?.plans.find(p => p.name.toLowerCase().includes("pro"));

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto p-6 md:p-10 max-w-4xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight mb-3">Simple, transparent pricing</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Upgrade to Pro to unlock unlimited AI replies and power up your inbox workflow.
          </p>
        </div>

        {isLoadingPlans || isLoadingSub ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8 items-start">
            
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-2xl">Trial</CardTitle>
                <CardDescription>Get started for free</CardDescription>
                <div className="mt-4 text-4xl font-bold">$0</div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                    <span>14-day free trial</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                    <span>50 AI replies</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                    <span>No credit card required</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant="outline" disabled>
                  {subscription?.plan === "trial" ? "Current Plan" : "Included"}
                </Button>
              </CardFooter>
            </Card>

            {proPlan && (
              <Card className="border-primary shadow-lg relative border-2">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Popular
                </div>
                <CardHeader>
                  <CardTitle className="text-2xl">{proPlan.name}</CardTitle>
                  <CardDescription>{proPlan.description}</CardDescription>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-4xl font-bold">${proPlan.priceMonthly}</span>
                    <span className="text-muted-foreground font-medium">/mo</span>
                  </div>
                  {proPlan.priceAnnual && (
                    <div className="text-sm text-muted-foreground mt-1">
                      or ${proPlan.priceAnnual}/yr (save 41%)
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {proPlan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        <span className="font-medium">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="flex-col gap-3">
                  {subscription?.plan === "pro" ? (
                    <Button className="w-full" onClick={handleManageBilling} disabled={createBillingPortal.isPending}>
                      {createBillingPortal.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Manage Billing
                    </Button>
                  ) : (
                    <>
                      {proPlan.stripePriceIdAnnual && (
                        <Button 
                          className="w-full" 
                          onClick={() => handleCheckout(proPlan.stripePriceIdAnnual!, "year")}
                          disabled={createCheckout.isPending}
                        >
                          Get Pro Annual
                        </Button>
                      )}
                      {proPlan.stripePriceIdMonthly && (
                        <Button 
                          className="w-full" 
                          variant="outline"
                          onClick={() => handleCheckout(proPlan.stripePriceIdMonthly!, "month")}
                          disabled={createCheckout.isPending}
                        >
                          Get Pro Monthly
                        </Button>
                      )}
                    </>
                  )}
                </CardFooter>
              </Card>
            )}

          </div>
        )}
      </div>
    </AppLayout>
  );
}
