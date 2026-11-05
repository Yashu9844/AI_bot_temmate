"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"

import { getVncUrl } from "@/lib/daytona"
import { db } from "@/lib/db"
import { bots } from "@/lib/db/schema"

// Starts the bot's sandbox and desktop if needed and returns a signed noVNC
// URL for it. botId comes from the browser, so ownership is checked here.
export async function getBotScreenUrl(botId: string) {
  const { userId } = await auth.protect()

  const bot = await db.query.bots.findFirst({
    where: and(eq(bots.id, botId), eq(bots.userId, userId)),
    columns: { sandboxId: true },
  })
  if (!bot) throw new Error("Bot not found")
  if (!bot.sandboxId) throw new Error("This bot has no sandbox")

  return getVncUrl(bot.sandboxId)
}
