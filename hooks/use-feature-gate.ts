"use client"

import * as React from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"

import { toast } from "@/components/ui/toast"
import { PRICING_PATH, type Feature } from "@/lib/billing"

const titles: Record<Feature, string> = {
  bots: "Bots are on the paid plan",
  sandboxes: "Sandboxes are on the paid plan",
}

// Returns a check to run before a billable action. When the user's plan lacks
// a feature it shows an error toast that links to the pricing page and returns
// false. The server actions check again, so this is only for the UX.
export function useFeatureGate() {
  const { has, isLoaded } = useAuth()
  const router = useRouter()

  return React.useCallback(
    (...features: Feature[]) => {
      // Not loaded yet: let the server decide
      if (!isLoaded || !has) return true
      const missing = features.find((feature) => !has({ feature }))
      if (!missing) return true

      toast.add({
        type: "error",
        title: titles[missing],
        description:
          "Upgrade to create bots, chat with them, and use their sandboxes.",
        actionProps: {
          children: "View plans",
          onClick: () => router.push(PRICING_PATH),
        },
      })
      return false
    },
    [has, isLoaded, router]
  )
}
