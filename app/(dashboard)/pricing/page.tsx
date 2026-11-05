import { PricingTable } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"

// Reached from the upgrade toast; deliberately not linked in the sidebar
export default async function PricingPage() {
  await auth.protect()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 md:px-8 md:py-16">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Pick your plan
        </h1>
        <p className="text-muted-foreground">
          The paid plan unlocks everything: create bots, chat with them, and let
          them work in their own sandboxes.
        </p>
      </header>
      <PricingTable newSubscriptionRedirectUrl="/" />
    </div>
  )
}
