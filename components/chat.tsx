"use client"

import { useChat } from "@ai-sdk/react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import Image from "next/image"

import {
  loadTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"

import { CodeBlock } from "@/components/ai-elements/code-block"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Terminal } from "@/components/ai-elements/terminal"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import type { chatAgent } from "@/src/trigger/chat"
import type { ChatUIMessage } from "@/src/trigger/tools"

type Part = ChatUIMessage["parts"][number]
type ToolPart = Extract<Part, { type: `tool-${string}` }>

// Loads the saved transcript first, so useChat starts from the same history
// the transport's resume cursor points past
function Chat({ chatId }: { chatId: string }) {
  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
  })
  const { messages, isLoading } = useLoadTranscript(chatId, loadTranscript, {
    transport,
  })

  if (isLoading) return <div className="flex-1" />

  return (
    <ChatMessages
      chatId={chatId}
      initialMessages={messages as ChatUIMessage[]}
      transport={transport}
    />
  )
}

function ChatMessages({
  chatId,
  initialMessages,
  transport,
}: {
  chatId: string
  initialMessages: ChatUIMessage[]
  transport: TriggerChatTransport
}) {
  const { messages, sendMessage, status, stop, error } = useChat<ChatUIMessage>(
    {
      id: chatId,
      messages: initialMessages,
      transport,
    }
  )

  function handleSubmit({ text }: PromptInputMessage) {
    if (!text.trim()) return
    sendMessage({ text })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Say hello"
              description="Send a message to start the conversation"
            />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.parts.map((part, i) => (
                    <MessagePart key={i} part={part} />
                  ))}
                </MessageContent>
              </Message>
            ))
          )}
          {error && (
            <p className="text-sm text-destructive">
              Something went wrong. Please try again.
            </p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl p-4 pt-0">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

function MessagePart({ part }: { part: Part }) {
  if (part.type === "text") {
    return <MessageResponse>{part.text}</MessageResponse>
  }
  if (part.type.startsWith("tool-")) {
    return <ToolCall part={part as ToolPart} />
  }
  return null
}

// What the bot did, in a few words, from whatever input has streamed in so far
function toolTitle(part: ToolPart) {
  switch (part.type) {
    case "tool-bash":
      return "Ran a command"
    case "tool-read_file":
      return part.input?.path ? `Read ${part.input.path}` : "Read a file"
    case "tool-write_file":
      return part.input?.path ? `Wrote ${part.input.path}` : "Wrote a file"
    case "tool-list_files":
      return part.input?.path ? `Listed ${part.input.path}` : "Listed files"
    case "tool-mouse_click":
      return part.input?.x !== undefined && part.input?.y !== undefined
        ? `Clicked at ${part.input.x}, ${part.input.y}`
        : "Clicked"
    case "tool-mouse_move":
      return part.input?.x !== undefined && part.input?.y !== undefined
        ? `Moved the mouse to ${part.input.x}, ${part.input.y}`
        : "Moved the mouse"
    case "tool-mouse_scroll":
      return part.input?.direction
        ? `Scrolled ${part.input.direction}`
        : "Scrolled"
    case "tool-keyboard_type":
      return "Typed text"
    case "tool-keyboard_press":
      return part.input?.key
        ? `Pressed ${[...(part.input.modifiers ?? []), part.input.key].join("+")}`
        : "Pressed a key"
    case "tool-view_screen":
      return "Looked at the screen"
    case "tool-show_screen":
      return "Shared the screen"
  }
}

function ToolCall({ part }: { part: ToolPart }) {
  const title = toolTitle(part)
  const errorText = part.state === "output-error" ? part.errorText : undefined

  switch (part.type) {
    // The bot's own look at the screen; the picture stays out of the chat
    case "tool-view_screen":
      return (
        <Tool>
          <ToolHeader type={part.type} state={part.state} title={title} />
          {errorText && (
            <ToolContent>
              <ToolOutput output={undefined} errorText={errorText} />
            </ToolContent>
          )}
        </Tool>
      )

    case "tool-show_screen":
      return (
        <Tool defaultOpen>
          <ToolHeader type={part.type} state={part.state} title={title} />
          <ToolContent>
            {part.state === "output-available" ? (
              <Image
                src={`data:${part.output.mediaType};base64,${part.output.data}`}
                alt="The bot's screen"
                width={1024}
                height={768}
                unoptimized
                className="h-auto w-full rounded-md border"
              />
            ) : (
              <ToolOutput output={undefined} errorText={errorText} />
            )}
          </ToolContent>
        </Tool>
      )

    case "tool-bash":
      return (
        <Tool>
          <ToolHeader type={part.type} state={part.state} title={title} />
          <ToolContent>
            {part.input?.command && (
              <CodeBlock code={part.input.command} language="bash" />
            )}
            {part.state === "output-available" ? (
              <Terminal
                output={
                  part.output.output +
                  (part.output.exitCode === 0
                    ? ""
                    : `\n\x1b[31mExited with code ${part.output.exitCode}\x1b[0m`)
                }
              />
            ) : (
              <ToolOutput output={undefined} errorText={errorText} />
            )}
          </ToolContent>
        </Tool>
      )

    default:
      return (
        <Tool>
          <ToolHeader type={part.type} state={part.state} title={title} />
          <ToolContent>
            <ToolInput input={part.input} />
            <ToolOutput
              output={
                part.state === "output-available" ? part.output : undefined
              }
              errorText={errorText}
            />
          </ToolContent>
        </Tool>
      )
  }
}

export { Chat }
