import { addMonths } from "date-fns"
import { and, count, eq, gte, lt, sql } from "drizzle-orm"

import { FEATURES, UpgradeRequiredError } from "@/lib/billing"
import { getPaidItem, type PaidItem } from "@/lib/billing-backend"
import { db } from "@/lib/db"
import { bots, usageEvents, type NewUsageEvent } from "@/lib/db/schema"
import {
  PLAN_LIMITS,
  UsageLimitError,
  type UsageMeter,
  type UsageSummary,
} from "@/lib/usage"

// Server-only usage ledger: reads and writes usage_events. Used by the server
// actions, the usage page, and the Trigger.dev tasks (no Next.js imports).

export type UsagePeriod = { start: Date; end: Date }

// The allowance resets monthly, starting from the subscription's period
// start. A monthly plan's window is its billing period; an annual plan gets
// twelve monthly windows inside its year.
export function usagePeriod(item: PaidItem, now = new Date()): UsagePeriod {
  // Months are counted from the original start each time, so a period that
  // began on the 31st doesn't drift to the 30th after a short month
  const base = new Date(item.periodStart)
  let n = 0
  while (addMonths(base, n + 1) <= now) n++
  const start = addMonths(base, n)
  let end = addMonths(base, n + 1)
  // A period Clerk ends early (a shorter first period, say) ends the window
  if (item.periodEnd && item.periodEnd > start.getTime()) {
    end = new Date(Math.min(end.getTime(), item.periodEnd))
  }
  return { start, end }
}

export async function getUsagePeriod(userId: string) {
  const item = await getPaidItem(userId)
  return item ? usagePeriod(item) : null
}

async function usedInPeriod(userId: string, period: UsagePeriod) {
  const [rows, [botCount]] = await Promise.all([
    db
      .select({
        meter: usageEvents.meter,
        total: sql<string>`coalesce(sum(${usageEvents.quantity}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          gte(usageEvents.createdAt, period.start),
          lt(usageEvents.createdAt, period.end)
        )
      )
      .groupBy(usageEvents.meter),
    db.select({ n: count() }).from(bots).where(eq(bots.userId, userId)),
  ])

  const used: Record<UsageMeter, number> = {
    ai_tokens: 0,
    sandbox_seconds: 0,
    bots: botCount?.n ?? 0,
  }
  for (const row of rows) used[row.meter] = Number(row.total)
  return used
}

export const LIMITS: Record<UsageMeter, number> = {
  ai_tokens: PLAN_LIMITS.aiTokens,
  sandbox_seconds: PLAN_LIMITS.sandboxSeconds,
  bots: PLAN_LIMITS.bots,
}

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const period = await getUsagePeriod(userId)
  if (!period) {
    return {
      period: null,
      used: { ai_tokens: 0, sandbox_seconds: 0, bots: 0 },
      limits: LIMITS,
    }
  }
  return {
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    },
    used: await usedInPeriod(userId, period),
    limits: LIMITS,
  }
}

// What is left of each meter this period, or null on the free plan
export async function getRemaining(userId: string) {
  const period = await getUsagePeriod(userId)
  if (!period) return null
  const used = await usedInPeriod(userId, period)
  const remaining = {} as Record<UsageMeter, number>
  for (const meter of Object.keys(LIMITS) as UsageMeter[]) {
    remaining[meter] = Math.max(0, LIMITS[meter] - used[meter])
  }
  return { period, remaining }
}

// Throws UsageLimitError unless every meter has room left, or
// UpgradeRequiredError when the user has no paid plan at all
export async function assertWithinLimits(userId: string, meters: UsageMeter[]) {
  const status = await getRemaining(userId)
  if (!status) throw new UpgradeRequiredError([FEATURES.bots])
  for (const meter of meters) {
    if (status.remaining[meter] <= 0) {
      throw new UsageLimitError(meter, status.period.end)
    }
  }
  return status
}

export async function recordUsage(event: Omit<NewUsageEvent, "id">) {
  if (event.quantity <= 0) return
  await db.insert(usageEvents).values(event)
}
