import { createClerkClient } from "@clerk/backend"

import { FEATURES, UpgradeRequiredError, type Feature } from "@/lib/billing"

// For code with no request session, like the Trigger.dev chat agent. It reads
// the user's subscription from the Clerk Backend API instead of the session.
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

export type PaidItem = {
  features: Set<string>
  planPeriod: "month" | "annual"
  // Unix ms, from Clerk
  periodStart: number
  periodEnd: number | null
}

// Subscriptions change rarely, and the sandbox meter asks once a minute per
// user, so answers are reused briefly
const CACHE_MS = 60_000
const cache = new Map<string, { at: number; item: PaidItem | null }>()

// Feature slugs of every user plan, by plan id. The subscription endpoint
// returns each item's plan with an empty features list, so features have to
// come from the plan list instead.
let planFeatures: { at: number; byPlan: Map<string, Set<string>> } | null = null

async function getPlanFeatures() {
  if (planFeatures && Date.now() - planFeatures.at < CACHE_MS) {
    return planFeatures.byPlan
  }
  const { data } = await clerk.billing.getPlanList({ payerType: "user" })
  const byPlan = new Map(
    data.map((plan) => [plan.id, new Set(plan.features.map((f) => f.slug))])
  )
  planFeatures = { at: Date.now(), byPlan }
  return byPlan
}

// The user's active subscription item that carries the paid features, or null
// on the free plan
export async function getPaidItem(userId: string): Promise<PaidItem | null> {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.item

  let item: PaidItem | null = null
  try {
    const [subscription, byPlan] = await Promise.all([
      clerk.billing.getUserBillingSubscription(userId),
      getPlanFeatures(),
    ])
    for (const i of subscription.subscriptionItems) {
      if (i.status !== "active") continue
      const planId = i.planId ?? i.plan?.id
      const features = (planId && byPlan.get(planId)) || new Set<string>()
      if (!features.has(FEATURES.bots)) continue
      item = {
        features,
        planPeriod: i.planPeriod,
        periodStart: i.periodStart,
        periodEnd: i.periodEnd,
      }
      break
    }
  } catch (error) {
    // No subscription at all means no paid features
    if ((error as { status?: number }).status !== 404) throw error
  }

  cache.set(userId, { at: Date.now(), item })
  return item
}

export async function assertUserFeatures(userId: string, features: Feature[]) {
  const item = await getPaidItem(userId)
  const missing = features.filter((feature) => !item?.features.has(feature))
  if (missing.length > 0) throw new UpgradeRequiredError(missing)
}
