import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { stepCountIs } from "ai"
import { asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { chatMembers, type Bot } from "@/lib/db/schema"

import { botSandbox, tools, type ChatUIMessage } from "./tools"

const nebius = createOpenAICompatible({
  name: "nebius",
  baseURL: "https://api.tokenfactory.nebius.com/v1",
  apiKey: process.env.NEBIUS_API_KEY,
  includeUsage: true,
  // Sends screenshots from tools as images; otherwise they go as base64 text
  supportsMultiPartToolContent: true,
})

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
    `## Using your computer\n\nYou can run shell commands, read, write, and list files, and use the desktop with the mouse and keyboard. The desktop is 1024x768 pixels; coordinates start at the top-left corner.\n\n- Prefer shell commands and file tools when they can do the job. Use the mouse and keyboard for graphical apps.\n- Before clicking or typing, use view_screen to see where things are, and use it again to check the result.\n- Use show_screen only when the user wants to see your screen. view_screen is for you alone.\n- Never claim to have done something you didn't do. If a tool fails, say so.`,
  ]
  return sections.filter(Boolean).join("\n\n")
}

export const chatAgent = chat.withUIMessage<ChatUIMessage>().agent({
  id: "chat",
  // Platform transcript snapshot, keyed by chat id
  storage: defaultStorage,
  // Declared here too so screenshots reach the model as images on later turns
  tools,
  onBoot: async () => {
    botSandbox.init({ sandboxId: null })
  },
  // Every turn, so edits to the bot's name, job, or instructions apply to the
  // next message
  onTurnStart: async ({ chatId }) => {
    const bot = await getChatBot(chatId)
    botSandbox.sandboxId = bot.sandboxId
    chat.prompt.set(systemPrompt(bot))
  },
  // streamText comes from the run argument so the managed options apply,
  // including the system prompt set above
  run: async ({ messages, tools, signal, streamText }) =>
    streamText({
      // Sees screenshots and gives accurate pixel coordinates, at low cost
      model: nebius("MiniMaxAI/MiniMax-M3.1-Flash"),
      messages,
      tools,
      abortSignal: signal,
      // Computer use takes many small steps: look, click, look again
      stopWhen: stepCountIs(30),
      maxOutputTokens: 4000,
    }),
})
