"use server"

import { auth } from "@clerk/nextjs/server"

import { UpgradeRequiredError } from "@/lib/billing"
import type { UsageCheck, UsageMeter } from "@/lib/usage"
import { UsageLimitError } from "@/lib/usage"
import { assertWithinLimits } from "@/lib/usage-server"

// Lets the browser warn before a metered action. The actions and the agent
// enforce the same limits themselves; this only shapes the message.
export async function checkUsage(meters: UsageMeter[]): Promise<UsageCheck> {
  const { userId } = await auth.protect()
  try {
    await assertWithinLimits(userId, meters)
    return { ok: true }
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return { ok: false, reason: "no_plan" }
    }
    if (error instanceof UsageLimitError) {
      return {
        ok: false,
        reason: "limit",
        meter: error.meter,
        resetsAt: error.resetsAt?.toISOString() ?? null,
      }
    }
    throw error
  }
}
