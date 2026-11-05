"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"

import { assertFeatures, FEATURES } from "@/lib/billing"
import { getVncUrl } from "@/lib/daytona"
import { db } from "@/lib/db"
import { bots } from "@/lib/db/schema"
import { assertWithinLimits } from "@/lib/usage-server"

// Starts the bot's sandbox and desktop if needed and returns a signed noVNC
// URL for it. botId comes from the browser, so ownership is checked here.
export async function getBotScreenUrl(botId: string) {
  const { userId, has } = await auth.protect()
  assertFeatures(has, FEATURES.sandboxes)
  // A connected screen keeps the sandbox running, which is metered time
  await assertWithinLimits(userId, ["sandbox_seconds"])

  const bot = await db.query.bots.findFirst({
    where: and(eq(bots.id, botId), eq(bots.userId, userId)),
    columns: { sandboxId: true },
  })
  if (!bot) throw new Error("Bot not found")
  if (!bot.sandboxId) throw new Error("This bot has no sandbox")

  return getVncUrl(bot.sandboxId)
}
