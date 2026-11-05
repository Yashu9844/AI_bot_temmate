import { logger, schedules } from "@trigger.dev/sdk"
import { inArray } from "drizzle-orm"

import { FEATURES } from "@/lib/billing"
import { assertUserFeatures } from "@/lib/billing-backend"
import { listRunningSandboxes, stopSandbox } from "@/lib/daytona"
import { db } from "@/lib/db"
import { sandboxMeters } from "@/lib/db/schema"
import { assertWithinLimits, recordUsage } from "@/lib/usage-server"

const TICK_SECONDS = 60

// Daytona bills a sandbox for every second it runs, whatever keeps it running:
// the agent's tools, a connected screen, or idle time before auto-stop. So
// running time is metered from Daytona's own view of each sandbox, once a
// minute, instead of from our calls into it.
//
// Each tick charges every running sandbox for the time since the last tick
// and stops the sandboxes of users who are over their limit or off the paid
// plan. A sandbox first seen running is charged at most one tick, since it
// started at some point after the last one.
export const meterSandboxes = schedules.task({
  id: "meter-sandboxes",
  cron: "* * * * *",
  // Ticks must not overlap, or the same interval is charged twice
  queue: { concurrencyLimit: 1 },
  maxDuration: 120,
  run: async () => {
    const now = new Date()
    const running = await listRunningSandboxes()
    const runningIds = new Set(running.map((s) => s.id))
    const meters = new Map(
      (await db.select().from(sandboxMeters)).map((m) => [m.sandboxId, m])
    )

    const owners = new Map<string, typeof running>()
    for (const sandbox of running) {
      const userId = sandbox.labels.userId
      if (!userId) continue
      owners.set(userId, [...(owners.get(userId) ?? []), sandbox])

      const last = meters.get(sandbox.id)
      const elapsed = last
        ? (now.getTime() - last.lastSeenAt.getTime()) / 1000
        : TICK_SECONDS
      const seconds = Math.round(elapsed)

      await recordUsage({
        userId,
        meter: "sandbox_seconds",
        quantity: seconds,
        sandboxId: sandbox.id,
        botId: sandbox.labels.botId ?? null,
      })
      await db
        .insert(sandboxMeters)
        .values({ sandboxId: sandbox.id, userId, lastSeenAt: now })
        .onConflictDoUpdate({
          target: sandboxMeters.sandboxId,
          set: { lastSeenAt: now },
        })
    }

    // Stopped (or deleted) since the last tick. Dropping the row means the
    // next start is charged from scratch, as a first sighting.
    const stopped = [...meters.keys()].filter((id) => !runningIds.has(id))
    if (stopped.length > 0) {
      await db
        .delete(sandboxMeters)
        .where(inArray(sandboxMeters.sandboxId, stopped))
    }

    // Enforce after charging, so this tick's time counts against the limit
    for (const [userId, sandboxes] of owners) {
      try {
        await assertUserFeatures(userId, [FEATURES.sandboxes])
        await assertWithinLimits(userId, ["sandbox_seconds"])
      } catch (error) {
        logger.info("Stopping sandboxes over the limit", {
          userId,
          reason: error instanceof Error ? error.message : String(error),
        })
        await Promise.all(sandboxes.map(stopSandbox))
      }
    }

    return { running: running.length, stopped: stopped.length }
  },
})
