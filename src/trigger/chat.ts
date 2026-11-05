import { openrouter } from "@openrouter/ai-sdk-provider"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { chatMembers, type Bot } from "@/lib/db/schema"

// The bot that answers in this chat. Chats are direct for now, so it's the
// only member.
async function getChatBot(chatId: string) {
  const member = await db.query.chatMembers.findFirst({
    where: eq(chatMembers.chatId, chatId),
    orderBy: asc(chatMembers.joinedAt),
    with: { bot: true },
  })
  if (!member) throw new Error(`No bot in chat ${chatId}`)
  return member.bot
}

function systemPrompt(bot: Bot) {
  const sections = [
    `You are ${bot.name}. Your job: ${bot.job}.`,
    bot.instructions && `## How to go about your job\n\n${bot.instructions}`,
    `## Your environment\n\nYou have your own sandbox: an isolated Linux computer in the cloud that belongs only to you. It has its own filesystem, processes, and network, separate from every other bot. It was created along with you and will be deleted along with you. Files in it are kept between conversations. While it isn't in use it is stopped to save resources, and it starts again when needed.`,
  ]
  return sections.filter(Boolean).join("\n\n")
}

export const chatAgent = chat.agent({
  id: "chat",
  // Platform transcript snapshot, keyed by chat id
  storage: defaultStorage,
  // Every turn, including the first on a fresh worker, so edits to the bot's
  // name, job, or instructions apply to the next message
  onTurnStart: async ({ chatId }) => {
    const bot = await getChatBot(chatId)
    chat.prompt.set(systemPrompt(bot))
  },
  // streamText comes from the run argument so the managed options apply,
  // including the system prompt set above
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model: openrouter("openai/gpt-4o"),
      messages,
      abortSignal: signal,
      // OpenRouter rejects requests whose max output exceeds the remaining credits
      maxOutputTokens: 2000,
    }),
})
