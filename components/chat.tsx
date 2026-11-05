"use client"

import { useChat } from "@ai-sdk/react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import { ArrowRightLeftIcon } from "lucide-react"
import { useState } from "react"
import Image from "next/image"

import {
  loadTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"

import { ChatAvatar } from "@/components/chat-avatar"
import { Badge } from "@/components/ui/badge"
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
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
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
type ChatBot = { id: string; name: string; avatar: string }
type ToolPart = Extract<Part, { type: `tool-${string}` }>
type HandoffPart = Extract<Part, { type: "tool-handoff" }>

// A group reply split by handoffs: each run of parts with the bot that wrote
// it. The reply starts with the bot it was sent to, and each finished handoff
// passes the rest of it to the next bot. The handoff part stays with the bot
// that made it.
function replySegments(message: ChatUIMessage) {
  const segments: { botId: string | undefined; parts: Part[] }[] = [
    { botId: message.metadata?.botId, parts: [] },
  ]
  for (const part of message.parts) {
    segments.at(-1)!.parts.push(part)
    if (part.type === "tool-handoff" && part.state === "output-available") {
      segments.push({ botId: part.output.to.id, parts: [] })
    }
  }
  // A handoff that just finished has nothing after it yet
  return segments.filter((s, i) => i === 0 || s.parts.length > 0)
}

// Loads the saved transcript first, so useChat starts from the same history
// the transport's resume cursor points past
// `bots` is passed for group chats, so the composer can pick who answers
function Chat({ chatId, bots }: { chatId: string; bots?: ChatBot[] }) {
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
      bots={bots}
    />
  )
}

function ChatMessages({
  chatId,
  initialMessages,
  transport,
  bots,
}: {
  chatId: string
  initialMessages: ChatUIMessage[]
  transport: TriggerChatTransport
  bots?: ChatBot[]
}) {
  const [botId, setBotId] = useState(bots?.[0]?.id)
  const { messages, sendMessage, status, stop, error } = useChat<ChatUIMessage>(
    {
      id: chatId,
      messages: initialMessages,
      transport,
    }
  )

  function handleSubmit({ text }: PromptInputMessage) {
    if (!text.trim()) return
    if (!botId) {
      sendMessage({ text })
      return
    }
    // The request metadata tells the agent which bot answers this turn; the
    // message metadata is saved with the message, so its badge survives reloads
    sendMessage({ text, metadata: { botId } }, { metadata: { botId } })
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
            messages.map((message) => {
              // In a group chat, the bot a message was sent to or written by
              const bot = bots?.find((b) => b.id === message.metadata?.botId)
              const parts = message.parts.map((part, i) => (
                <MessagePart key={i} part={part} />
              ))
              const content = (
                <MessageContent>
                  {bot && message.role === "user" ? (
                    // Floated in normal flow, so the first line of text runs
                    // beside the badge like a tag and later lines wrap under it
                    <div className="flow-root">
                      <Badge
                        variant="outline"
                        className="float-left mr-1.5 max-w-36 pl-0.5"
                        title={bot.name}
                      >
                        <ChatAvatar seed={bot.avatar} className="size-4" />
                        <span className="min-w-0 truncate">{bot.name}</span>
                      </Badge>
                      {parts}
                    </div>
                  ) : (
                    parts
                  )}
                </MessageContent>
              )

              // In a group chat, a reply sits beside the face of the bot
              // that wrote it; a handed-off reply shows each bot's part
              // beside its own face
              if (bots && message.role === "assistant") {
                return replySegments(message).map((segment, i) => {
                  const author = bots.find((b) => b.id === segment.botId)
                  return (
                    <Message
                      key={`${message.id}-${i}`}
                      from={message.role}
                      className="flex-row items-start gap-3"
                    >
                      {author ? (
                        <ChatAvatar
                          seed={author.avatar}
                          className="size-7"
                          alt={author.name}
                        />
                      ) : (
                        // Left the group, or replied before replies were tagged
                        <div className="size-7 shrink-0" />
                      )}
                      <MessageContent>
                        {segment.parts.map((part, j) => (
                          <MessagePart key={j} part={part} />
                        ))}
                      </MessageContent>
                    </Message>
                  )
                })
              }

              return (
                <Message key={message.id} from={message.role}>
                  {content}
                </Message>
              )
            })
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
          <PromptInputFooter className={bots ? undefined : "justify-end"}>
            {bots && (
              <PromptInputTools>
                <BotSelect bots={bots} value={botId} onChange={setBotId} />
              </PromptInputTools>
            )}
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

// Who answers the next message in a group chat
function BotSelect({
  bots,
  value,
  onChange,
}: {
  bots: ChatBot[]
  value: string | undefined
  onChange: (botId: string) => void
}) {
  return (
    <PromptInputSelect
      value={value ?? null}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next)
      }}
    >
      <PromptInputSelectTrigger size="sm" aria-label="Bot to talk to">
        <PromptInputSelectValue>
          {(id: string | null) => {
            const bot = bots.find((b) => b.id === id)
            return bot ? <BotOption bot={bot} /> : "Pick a bot"
          }}
        </PromptInputSelectValue>
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        {bots.map((bot) => (
          <PromptInputSelectItem key={bot.id} value={bot.id}>
            <BotOption bot={bot} />
          </PromptInputSelectItem>
        ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  )
}

function BotOption({ bot }: { bot: ChatBot }) {
  return (
    <>
      <ChatAvatar seed={bot.avatar} className="size-4" />
      <span className="truncate">{bot.name}</span>
    </>
  )
}

function MessagePart({ part }: { part: Part }) {
  if (part.type === "text") {
    return <MessageResponse>{part.text}</MessageResponse>
  }
  if (part.type === "tool-handoff") {
    return <HandoffNotice part={part} />
  }
  if (part.type.startsWith("tool-")) {
    return <ToolCall part={part as ToolPart} />
  }
  return null
}

// One bot passing the message to another, with the note it left
function HandoffNotice({ part }: { part: HandoffPart }) {
  const text =
    part.state === "output-available"
      ? `Handed off to ${part.output.to.name}`
      : part.state === "output-error"
        ? "Couldn't hand off"
        : "Handing off…"
  const note = part.state === "output-available" ? part.output.note : undefined

  return (
    <div className="flex items-start gap-2 text-sm text-muted-foreground">
      <ArrowRightLeftIcon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">{text}</p>
        {note && <p className="italic">“{note}”</p>}
        {part.state === "output-error" && (
          <p className="text-destructive">{part.errorText}</p>
        )}
      </div>
    </div>
  )
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
