"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import type { z } from "zod"

import { db } from "@/lib/db"
import { bots, insertBotSchema } from "@/lib/db/schema"

export async function createBot(values: z.input<typeof insertBotSchema>) {
  const { userId } = await auth.protect()

  const data = insertBotSchema.parse(values)
  const [bot] = await db
    .insert(bots)
    .values({ ...data, instructions: data.instructions || null, userId })
    .returning()

  revalidatePath("/")
  return bot
}
