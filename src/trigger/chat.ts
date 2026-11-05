import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { stepCountIs } from "ai"
import { asc, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { chatMembers, chats } from "@/lib/db/schema"

import {
  MAX_HANDOFFS_PER_TURN,
  tools,
  turn,
  type ChatUIMessage,
  type TurnBot,
} from "./tools"

const nebius = createOpenAICompatible({
  name: "nebius",
  baseURL: "https://api.tokenfactory.nebius.com/v1",
  apiKey: process.env.NEBIUS_API_KEY,
  includeUsage: true,
  // Sends screenshots from tools as images; otherwise they go as base64 text
  supportsMultiPartToolContent: true,
})

// Sent by the composer with every message. In a group chat it names the bot
// the user is talking to; direct chats leave it out.
export const chatClientData = z.object({
  botId: z.string().optional(),
})

// What every bot's prompt this turn shares; only "you" changes on a handoff
const turnContext = chat.local<{
  chatName: string | null
  // Who said what so far, one line per message
  log: string[]
}>({ id: "turnContext" })

// Older lines are dropped so a long chat doesn't crowd the prompt
const MAX_LOG_LINES = 40

async function loadChat(chatId: string) {
  const found = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    with: {
      members: {
        orderBy: asc(chatMembers.joinedAt),
        with: {
          bot: {
            columns: {
              id: true,
              name: true,
              job: true,
              instructions: true,
              sandboxId: true,
            },
          },
        },
      },
    },
  })
  if (!found) throw new Error(`Chat ${chatId} not found`)
  return found
}

// One line per message, naming who wrote each reply, so a bot can tell its own
// replies from the other bots' (they all reach the model as "assistant")
function conversationLog(messages: ChatUIMessage[], members: TurnBot[]) {
  const name = (id: string | undefined) =>
    members.find((m) => m.id === id)?.name ?? "a bot no longer in the group"

  const lines = messages.map((message, i) => {
    if (message.role === "user") {
      const to = message.metadata?.botId
      const line = to ? `User, to ${name(to)}` : "User"
      return i === messages.length - 1
        ? `${line}  ← the message being answered now`
        : line
    }
    const authors = [name(message.metadata?.botId)]
    for (const part of message.parts) {
      if (part.type === "tool-handoff" && part.state === "output-available") {
        authors.push(`${part.output.to.name} (by handoff)`)
      }
    }
    return authors.join(", then ")
  })

  const cut = lines.length - MAX_LOG_LINES
  return cut > 0
    ? [`(${cut} earlier messages not listed)`, ...lines.slice(cut)]
    : lines
}

const TOOLS_SECTION = `## Your tools

- bash, read_file, write_file, list_files: work with the shell and files in your sandbox.
- view_screen, mouse_click, mouse_move, mouse_scroll, keyboard_type, keyboard_press: use your sandbox's desktop. The desktop is 1024x768 pixels; coordinates start at the top-left corner.
- show_screen: show the user a screenshot of your screen.

How to use them:

- Prefer shell commands and file tools when they can do the job. Use the mouse and keyboard for graphical apps.
- Before clicking or typing, use view_screen to see where things are, and use it again to check the result.
- Use show_screen only when the user wants to see your screen. view_screen is for you alone.
- Never claim to have done something you didn't do. If a tool fails, say so.`

const ENVIRONMENT_SECTION = `## Your environment

You have your own sandbox: an isolated Linux computer in the cloud that belongs only to you. It has its own filesystem, processes, and network, separate from every other bot. It was created along with you and will be deleted along with you. Files in it are kept between conversations. While it isn't in use it is stopped to save resources, and it starts again when needed.`

function groupSections(bot: TurnBot) {
  const { chatName, log } = turnContext
  const { members, holders } = turn
  const firstHolder = members.find((m) => m.id === holders[0])
  const handedFrom = members.find((m) => m.id === holders.at(-2))

  const memberList = members
    .map(
      (m) =>
        `- ${m.name} (id: ${m.id}): ${m.job}${m.id === bot.id ? " ← you" : ""}`
    )
    .join("\n")

  const howYouGotIt =
    handedFrom && firstHolder && firstHolder.id !== bot.id
      ? `The user sent their latest message to ${firstHolder.name}, and ${handedFrom.name} handed it to you; the note is in the handoff result above. Answer it now as ${bot.name}.`
      : "The user sent their latest message to you."

  return [
    `## You're in a group chat

This is a group chat${chatName ? ` called "${chatName}"` : ""} between the user and several bots. The user picks which bot gets each message, and only that bot answers. ${howYouGotIt}

The bots in this group:

${memberList}`,

    `## How the group works

- Not every earlier reply is yours. Every bot's replies reach you as assistant messages; the log below says who wrote each one. Don't take credit for another bot's work, and refer to the other bots by name.
- Speak only as yourself. Don't write lines for other bots, and don't put your name at the start of your reply; the chat already shows who wrote it.
- Each bot has its own sandbox. You can't see or touch another bot's files, screen, or programs, and they can't see yours. If another bot says it made a file, it's on that bot's computer, not yours.
- Only one bot works at a time. Others can't act during your reply; the only way to bring one in is the handoff tool. They will read this whole conversation, your replies included, when it's their turn.`,

    `## Handing off

You have one more tool here: handoff. It passes the user's latest message to another bot in the group, which then answers in your place.

- Hand off when the message clearly falls in another member's job rather than yours, or the user asks for another member.
- If you can do it well yourself, do it. Don't hand off just because another bot could also do it, or to avoid something hard.
- Don't hand off when the user chose you on purpose, for example by asking for your take or addressing you by name.
- Hand off before doing any of the work. At most write one short sentence first, then call handoff, then stop. The other bot's answer follows yours in the same reply.
- Give a note that tells the other bot why it's the better fit and anything it needs to know.
- A bot that already held this message can't get it back, and a message can be handed on at most ${MAX_HANDOFFS_PER_TURN} times. If a handoff fails, answer the message yourself.`,

    `## Who said what

The conversation so far, oldest first:

${log.map((line) => `- ${line}`).join("\n")}`,
  ]
}

function systemPrompt(bot: TurnBot) {
  const sections = [
    `You are ${bot.name}. Your job: ${bot.job}.`,
    bot.instructions && `## How to go about your job\n\n${bot.instructions}`,
    ...(turn.isGroup
      ? groupSections(bot)
      : ["## The chat\n\nThis is a one-on-one chat between you and the user."]),
    ENVIRONMENT_SECTION,
    TOOLS_SECTION,
  ]
  return sections.filter(Boolean).join("\n\n")
}

export const chatAgent = chat
  .withUIMessage<ChatUIMessage>()
  .withClientData({ schema: chatClientData })
  .agent({
    id: "chat",
    // Platform transcript snapshot, keyed by chat id
    storage: defaultStorage,
    // Declared here too so screenshots reach the model as images on later turns
    tools,
    onBoot: async () => {
      turn.init({ isGroup: false, members: [], answering: null, holders: [] })
      turnContext.init({ chatName: null, log: [] })
    },
    // Every turn, so edits to the bots' names, jobs, or instructions apply to
    // the next message, and a group chat can switch bots between messages
    onTurnStart: async ({ chatId, clientData, uiMessages }) => {
      const found = await loadChat(chatId)
      const members = found.members.map((m) => m.bot)
      // The picked bot, if it's in the chat, otherwise the first member (a
      // direct chat's only bot)
      const bot =
        members.find((m) => m.id === clientData?.botId) ?? members[0]
      if (!bot) throw new Error(`No bot in chat ${chatId}`)
      if (clientData?.botId && bot.id !== clientData.botId) {
        throw new Error(`Bot ${clientData.botId} isn't in chat ${chatId}`)
      }

      turn.isGroup = found.kind === "group"
      turn.members = members
      turn.answering = bot
      turn.holders = [bot.id]
      turnContext.chatName = found.name
      turnContext.log = turn.isGroup
        ? conversationLog(uiMessages as ChatUIMessage[], members)
        : []

      chat.prompt.set(systemPrompt(bot))
      // Tags this turn's reply with the bot it was sent to; saved with the
      // transcript, so it survives reloads. Handoffs within the reply are
      // read from its handoff tool parts.
      chat.setUIMessageStreamOptions({
        messageMetadata: ({ part }) =>
          part.type === "start" ? { botId: bot.id } : undefined,
      })
    },
    // streamText comes from the run argument so the managed options apply,
    // including the system prompt set above
    run: async ({ messages, tools, signal, streamText }) =>
      streamText({
        // Sees screenshots and gives accurate pixel coordinates, at low cost
        model: nebius("MiniMaxAI/MiniMax-M3.1-Flash"),
        messages,
        tools,
        // Handing off only makes sense with other bots around
        activeTools: turn.isGroup
          ? undefined
          : (Object.keys(tools) as (keyof typeof tools)[]).filter(
              (name) => name !== "handoff"
            ),
        // After a handoff the next steps run as the new bot. The override
        // carries forward to later steps, until another handoff replaces it.
        prepareStep: () => {
          const bot = turn.answering
          return bot && bot.id !== turn.holders[0]
            ? { instructions: systemPrompt(bot) }
            : undefined
        },
        abortSignal: signal,
        // Computer use takes many small steps: look, click, look again
        stopWhen: stepCountIs(30),
        maxOutputTokens: 4000,
      }),
  })
