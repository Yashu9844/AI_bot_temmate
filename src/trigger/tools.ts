import { chat } from "@trigger.dev/sdk/ai"
import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai"
import { z } from "zod"

import { getComputer } from "@/lib/daytona"
import type { Bot } from "@/lib/db/schema"

export type TurnBot = Pick<
  Bot,
  "id" | "name" | "job" | "instructions" | "sandboxId"
>

// Who is in the chat and who is answering right now. Set at the start of each
// turn; a handoff moves `answering` to another member partway through it
export const turn = chat.local<{
  isGroup: boolean
  members: TurnBot[]
  answering: TurnBot | null
  // Bots that have held this turn, in order; a handoff can't go back to one
  holders: string[]
}>({ id: "turn" })

// Handoffs one turn may chain, so bots can't pass a message around forever
export const MAX_HANDOFFS_PER_TURN = 2

async function sandbox() {
  const sandboxId = turn.answering?.sandboxId
  if (!sandboxId) throw new Error("This bot has no sandbox")
  return getComputer(sandboxId)
}

// Long outputs would crowd out the rest of the conversation
const MAX_OUTPUT = 20_000
function truncate(text: string) {
  return text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT)}\n… (${text.length - MAX_OUTPUT} more characters cut)`
    : text
}

const coordinates = {
  x: z.number().int().min(0).describe("Pixels from the left edge"),
  y: z.number().int().min(0).describe("Pixels from the top edge"),
}

async function screenshot() {
  const computer = await sandbox()
  const shot = await computer.computerUse.screenshot.takeCompressed({
    format: "jpeg",
    quality: 70,
    showCursor: true,
  })
  if (!shot.screenshot) throw new Error("The screenshot came back empty")
  return { mediaType: "image/jpeg", data: shot.screenshot }
}

// Hands the screenshot to the model as an image instead of base64 text
function screenshotForModel({
  output,
}: {
  output: { mediaType: string; data: string }
}) {
  return {
    type: "content" as const,
    value: [
      {
        type: "file" as const,
        mediaType: output.mediaType,
        data: { type: "data" as const, data: output.data },
      },
    ],
  }
}

export const tools = {
  bash: tool({
    description:
      "Run a shell command in your sandbox and get its output and exit code. Commands run non-interactively, in /home/daytona unless you cd elsewhere, and time out after the given number of seconds.",
    inputSchema: z.object({
      command: z.string().describe("The shell command to run"),
      timeout: z
        .number()
        .int()
        .min(1)
        .max(600)
        .default(60)
        .describe("Seconds to wait before giving up"),
    }),
    execute: async ({ command, timeout }) => {
      const computer = await sandbox()
      const { exitCode, result } = await computer.process.executeCommand(
        command,
        undefined,
        undefined,
        timeout
      )
      return { exitCode, output: truncate(result) }
    },
  }),

  read_file: tool({
    description: "Read a text file from your sandbox.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path, or relative to /home/daytona"),
    }),
    execute: async ({ path }) => {
      const computer = await sandbox()
      const content = await computer.fs.downloadFile(path)
      return { content: truncate(content.toString("utf8")) }
    },
  }),

  write_file: tool({
    description:
      "Write a text file in your sandbox, creating it or replacing its contents.",
    inputSchema: z.object({
      path: z.string().describe("Absolute path, or relative to /home/daytona"),
      content: z.string().describe("The full contents of the file"),
    }),
    execute: async ({ path, content }) => {
      const computer = await sandbox()
      await computer.fs.uploadFile(Buffer.from(content, "utf8"), path)
      return { bytes: Buffer.byteLength(content, "utf8") }
    },
  }),

  list_files: tool({
    description: "List the files and folders in a directory of your sandbox.",
    inputSchema: z.object({
      path: z
        .string()
        .default("/home/daytona")
        .describe("Absolute path, or relative to /home/daytona"),
    }),
    execute: async ({ path }) => {
      const computer = await sandbox()
      const files = await computer.fs.listFiles(path)
      return {
        files: files.map((f) => ({
          name: f.name,
          type: f.isDir ? ("directory" as const) : ("file" as const),
          size: f.size,
        })),
      }
    },
  }),

  mouse_click: tool({
    description: "Click the mouse at a point on your screen.",
    inputSchema: z.object({
      ...coordinates,
      button: z.enum(["left", "right", "middle"]).default("left"),
      double: z.boolean().default(false).describe("Double-click"),
    }),
    execute: async ({ x, y, button, double }) => {
      const computer = await sandbox()
      await computer.computerUse.mouse.click(x, y, button, double)
      return { clicked: { x, y } }
    },
  }),

  mouse_move: tool({
    description: "Move the mouse pointer to a point on your screen.",
    inputSchema: z.object(coordinates),
    execute: async ({ x, y }) => {
      const computer = await sandbox()
      await computer.computerUse.mouse.move(x, y)
      return { movedTo: { x, y } }
    },
  }),

  mouse_scroll: tool({
    description: "Scroll the mouse wheel at a point on your screen.",
    inputSchema: z.object({
      ...coordinates,
      direction: z.enum(["up", "down"]),
      amount: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(3)
        .describe("Wheel notches; each moves a few lines"),
    }),
    execute: async ({ x, y, direction, amount }) => {
      const computer = await sandbox()
      await computer.computerUse.mouse.scroll(x, y, direction, amount)
      return { scrolled: { direction, amount } }
    },
  }),

  keyboard_type: tool({
    description:
      "Type text with the keyboard into whatever has focus. Newlines press Enter.",
    inputSchema: z.object({ text: z.string() }),
    execute: async ({ text }) => {
      const computer = await sandbox()
      await computer.computerUse.keyboard.type(text)
      return { typed: text.length }
    },
  }),

  keyboard_press: tool({
    description:
      "Press one key, optionally with modifiers held, such as Enter, Escape, Tab, arrow keys, or Ctrl+C.",
    inputSchema: z.object({
      key: z
        .string()
        .describe(
          "Key name, e.g. enter, escape, tab, backspace, up, f5, a, 1, /"
        ),
      modifiers: z
        .array(z.enum(["ctrl", "alt", "shift", "cmd"]))
        .default([])
        .describe("Keys held while pressing"),
    }),
    execute: async ({ key, modifiers }) => {
      const computer = await sandbox()
      await computer.computerUse.keyboard.press(key, modifiers)
      return { pressed: [...modifiers, key].join("+") }
    },
  }),

  view_screen: tool({
    description:
      "Take a screenshot so you can see your screen. Only you see it. Use it to look before you click or type, and to check what an action did.",
    inputSchema: z.object({}),
    execute: screenshot,
    toModelOutput: screenshotForModel,
  }),

  show_screen: tool({
    description:
      "Take a screenshot and show it to the user in the chat. Use it when the user wants to see your screen. You see it too.",
    inputSchema: z.object({}),
    execute: screenshot,
    toModelOutput: screenshotForModel,
  }),

  handoff: tool({
    description:
      "Group chats only. Pass the user's latest message to another bot in this group whose job fits it better than yours. That bot takes over right away and answers in your place, with its own instructions and its own sandbox; you stop once this call returns. Don't answer the message yourself before handing off.",
    inputSchema: z.object({
      botId: z
        .string()
        .describe("The id of the group member to hand off to, from the member list"),
      note: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .describe(
          "One or two sentences for the other bot, which the user sees too: why it's better suited, and anything it needs to know"
        ),
    }),
    execute: async ({ botId, note }) => {
      const from = turn.answering
      if (!turn.isGroup || !from) {
        throw new Error("Handoffs only work in group chats.")
      }
      const to = turn.members.find((m) => m.id === botId)
      if (!to) {
        throw new Error(
          `No bot with id "${botId}" is in this group. Use an id from the member list.`
        )
      }
      if (to.id === from.id) {
        throw new Error("You can't hand off to yourself. Answer the message.")
      }
      if (turn.holders.includes(to.id)) {
        throw new Error(
          `${to.name} already handed this message on, so it can't go back to them. Answer it yourself as best you can.`
        )
      }
      if (turn.holders.length > MAX_HANDOFFS_PER_TURN) {
        throw new Error(
          "This message has been handed off too many times. Answer it yourself as best you can."
        )
      }

      // The next step runs as the other bot: the agent's prepareStep swaps in
      // its prompt, and the sandbox tools now reach its computer
      turn.answering = to
      turn.holders = [...turn.holders, to.id]
      return {
        from: { id: from.id, name: from.name },
        to: { id: to.id, name: to.name },
        note,
      }
    },
    // Worded so it still reads right when replayed as history on later turns
    toModelOutput: ({ output }) => ({
      type: "text",
      value: `Handoff done. ${output.from.name} handed the user's latest message to ${output.to.name}, with this note: "${output.note}". From here until the end of this reply, ${output.to.name} is the one answering.`,
    }),
  }),
}

// Stamped on each reply by the agent, so a group chat can show who wrote it
export type ChatMessageMetadata = { botId?: string }

export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  UIDataTypes,
  InferUITools<typeof tools>
>
