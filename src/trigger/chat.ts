import { openrouter } from "@openrouter/ai-sdk-provider"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"

export const chatAgent = chat.agent({
  id: "chat",
  // Platform transcript snapshot, keyed by chat id
  storage: defaultStorage,
  // streamText comes from the run argument so the managed options apply
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model: openrouter("openai/gpt-4o"),
      messages,
      abortSignal: signal,
      // OpenRouter rejects requests whose max output exceeds the remaining credits
      maxOutputTokens: 2000,
    }),
})
