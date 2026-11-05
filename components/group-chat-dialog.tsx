"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trash2Icon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import type { z } from "zod"

import {
  createGroupChat,
  deleteGroupChat,
  updateGroupChat,
} from "@/actions/chat"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { useFeatureGate } from "@/hooks/use-feature-gate"
import { FEATURES } from "@/lib/billing"
import { insertGroupChatSchema } from "@/lib/db/schema"
import type { BotSummary } from "@/queries/bots"

type GroupChatValues = z.input<typeof insertGroupChatSchema>

type EditableGroupChat = { id: string; name: string; botIds: string[] }

// The group's current name and members when editing, a blank group otherwise
function initialValues(chat?: EditableGroupChat): GroupChatValues {
  if (chat) return { name: chat.name, botIds: chat.botIds }
  return { name: "", botIds: [] }
}

// Asks first, then deletes the group and goes home; its bots stay
function DeleteGroupChatButton({ chat }: { chat: EditableGroupChat }) {
  const [isDeleting, startDeleting] = React.useTransition()

  function handleDelete() {
    startDeleting(async () => {
      try {
        // Redirects on success, so nothing runs after it
        await deleteGroupChat(chat.id)
      } catch {
        toast.add({
          title: "Couldn't delete group",
          description: "Something went wrong. Try again.",
        })
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="destructive" className="sm:mr-auto" />
        }
      >
        <Trash2Icon data-icon="inline-start" />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {chat.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the group and its chat history. Its bots and their own
            chats stay. You can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={handleDelete}
          >
            {isDeleting && <Spinner data-icon="inline-start" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Creates a group chat and opens it, or edits `chat` when one is passed:
// rename it, add or remove bots, or delete it
function GroupChatDialog({
  chat,
  bots,
  children,
  open: openProp,
  onOpenChange,
}: {
  chat?: EditableGroupChat
  bots: BotSummary[]
  children?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const router = useRouter()
  const gate = useFeatureGate()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = openProp ?? uncontrolledOpen
  const form = useForm({
    resolver: zodResolver(insertGroupChatSchema),
    defaultValues: initialValues(chat),
  })

  function setOpen(next: boolean) {
    // Creating a group needs the paid plan; editing an existing one doesn't
    if (next && !chat && !gate(FEATURES.bots)) return
    setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  // Reset after closing rather than on open, so a dialog opened by a
  // controlling parent (which never fires onOpenChange(true)) starts fresh too.
  function handleOpenChangeComplete(next: boolean) {
    if (!next) form.reset(initialValues(chat))
  }

  async function onSubmit(values: GroupChatValues) {
    try {
      if (chat) {
        const { chat: updated } = await updateGroupChat(chat.id, values)
        toast.add({ title: `${updated.name} is updated` })
        setOpen(false)
      } else {
        if (!gate(FEATURES.bots)) return
        const { chat: created } = await createGroupChat(values)
        toast.add({ title: `${created.name} is ready` })
        setOpen(false)
        router.push(`/chats/${created.id}`)
      }
    } catch {
      toast.add({
        title: chat ? "Couldn't save group" : "Couldn't create group",
        description: "Something went wrong. Try again.",
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={handleOpenChangeComplete}
    >
      {children && <DialogTrigger render={children} />}
      <DialogContent className="sm:max-w-md">
        <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
          <DialogHeader>
            <DialogTitle>
              {chat ? "Edit group chat" : "New group chat"}
            </DialogTitle>
            <DialogDescription>
              {chat
                ? "Rename the group, or change which bots are in it."
                : "Name the group and pick which bots are in it."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="group-chat-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="group-chat-name"
                    placeholder="Weekend plans"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="botIds"
              control={form.control}
              render={({ field, fieldState }) => (
                <FieldSet data-invalid={fieldState.invalid}>
                  <FieldLegend variant="label">Bots</FieldLegend>
                  {bots.length < 2 && (
                    <FieldDescription>
                      A group needs at least two bots. Create another bot first.
                    </FieldDescription>
                  )}
                  <FieldGroup data-slot="checkbox-group" className="gap-3">
                    {bots.map((bot) => {
                      const id = `group-chat-bot-${bot.id}`
                      const checked = field.value.includes(bot.id)
                      return (
                        <Field
                          key={bot.id}
                          orientation="horizontal"
                          data-invalid={fieldState.invalid}
                        >
                          <Checkbox
                            id={id}
                            name={field.name}
                            checked={checked}
                            aria-invalid={fieldState.invalid}
                            onCheckedChange={(next) =>
                              field.onChange(
                                next
                                  ? [...field.value, bot.id]
                                  : field.value.filter((v) => v !== bot.id)
                              )
                            }
                          />
                          <FieldLabel htmlFor={id} className="font-normal">
                            <ChatAvatar seed={bot.avatar} className="size-5" />
                            {bot.name}
                          </FieldLabel>
                        </Field>
                      )
                    })}
                  </FieldGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </FieldSet>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            {chat && <DeleteGroupChatButton chat={chat} />}
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && (
                <Spinner data-icon="inline-start" />
              )}
              {chat ? "Save changes" : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { GroupChatDialog }
