import { chat, type InferChatUIMessageFromTools } from "@trigger.dev/sdk/ai"
import { tool } from "ai"
import { z } from "zod"

import { getComputer } from "@/lib/daytona"

// The answering bot's sandbox, set in the agent's onBoot
export const botSandbox = chat.local<{ sandboxId: string | null }>({
  id: "botSandbox",
})

async function sandbox() {
  const { sandboxId } = botSandbox
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
}

export type ChatUIMessage = InferChatUIMessageFromTools<typeof tools>
