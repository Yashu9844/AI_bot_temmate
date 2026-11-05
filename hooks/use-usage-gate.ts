"use client"

import * as React from "react"
import { formatDistanceToNowStrict } from "date-fns"
import { useRouter } from "next/navigation"

import { checkUsage } from "@/actions/usage"
import { toast } from "@/components/ui/toast"
import { PRICING_PATH } from "@/lib/billing"
import { METER_LABELS, type UsageMeter } from "@/lib/usage"

const USAGE_PATH = "/usage"

// Returns an async check to run before a metered action. When a meter is used
// up it shows an error toast linking to the usage page and resolves false.
// The server enforces the limits regardless; this is only for the message.
export function useUsageGate() {
  const router = useRouter()

  return React.useCallback(
    async (...meters: UsageMeter[]) => {
      let check
      try {
        check = await checkUsage(meters)
      } catch {
        // Let the action itself fail with its own message
        return true
      }
      if (check.ok) return true

      if (check.reason === "no_plan") {
        toast.add({
          type: "error",
          title: "This needs the paid plan",
          description:
            "Upgrade to create bots, chat with them, and use their sandboxes.",
          actionProps: {
            children: "View plans",
            onClick: () => router.push(PRICING_PATH),
          },
        })
        return false
      }

      const resets = check.resetsAt
        ? `It resets in ${formatDistanceToNowStrict(new Date(check.resetsAt))}.`
        : ""
      toast.add({
        type: "error",
        title:
          check.meter === "bots"
            ? "You've reached your bot limit"
            : `You've used this period's ${METER_LABELS[check.meter].toLowerCase()}`,
        description:
          check.meter === "bots"
            ? "Delete a bot to make room for a new one."
            : resets,
        actionProps: {
          children: "View usage",
          onClick: () => router.push(USAGE_PATH),
        },
      })
      return false
    },
    [router]
  )
}
