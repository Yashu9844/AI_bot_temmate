"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShuffleIcon } from "lucide-react"
import { nanoid } from "nanoid"
import { Controller, useForm } from "react-hook-form"
import type { z } from "zod"

import { createBot } from "@/actions/bot"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { insertBotSchema } from "@/lib/db/schema"

type BotValues = z.input<typeof insertBotSchema>

const presets = [
  {
    job: "Research assistant",
    instructions:
      "Answer briefly, cite sources, and ask before running anything destructive.",
  },
  {
    job: "Code reviewer",
    instructions:
      "Point out bugs first, then risky patterns. Suggest fixes as small diffs.",
  },
  {
    job: "Writing editor",
    instructions:
      "Tighten wording and fix grammar. Keep my voice and explain bigger changes.",
  },
  {
    job: "Tutor",
    instructions:
      "Teach step by step, check my understanding, and don't just hand over answers.",
  },
]

function emptyValues(): BotValues {
  return { name: "", avatar: nanoid(), job: "", instructions: "" }
}

function BotDialog({
  children,
  open: openProp,
  onOpenChange,
}: {
  children?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = openProp ?? uncontrolledOpen
  const form = useForm({
    resolver: zodResolver(insertBotSchema),
    defaultValues: emptyValues(),
  })

  function setOpen(next: boolean) {
    setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  // Reset after closing rather than on open, so a dialog opened by a
  // controlling parent (which never fires onOpenChange(true)) starts fresh too.
  function handleOpenChangeComplete(next: boolean) {
    if (!next) form.reset(emptyValues())
  }

  async function onSubmit(values: BotValues) {
    try {
      const { bot } = await createBot(values)
      toast.add({ title: `${bot.name} is ready` })
      setOpen(false)
    } catch {
      toast.add({
        title: "Couldn't create bot",
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
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
          <DialogHeader>
            <DialogTitle>New bot</DialogTitle>
            <DialogDescription>
              Give it a face, a name, and a job to do.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.job}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  form.setValue("job", preset.job, { shouldValidate: true })
                  form.setValue("instructions", preset.instructions)
                }}
              >
                {preset.job}
              </Button>
            ))}
          </div>
          <FieldGroup>
            <Controller
              name="avatar"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <ChatAvatar
                    seed={field.value ?? ""}
                    className="size-12 rounded-none"
                  />
                  <FieldContent>
                    <FieldTitle>Face</FieldTitle>
                    <FieldDescription>
                      Shuffle until you find one you like.
                    </FieldDescription>
                  </FieldContent>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => field.onChange(nanoid())}
                  >
                    <ShuffleIcon data-icon="inline-start" />
                    Shuffle
                  </Button>
                </Field>
              )}
            />
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="bot-name"
                    placeholder="Ada"
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
              name="job"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-job">Job</FieldLabel>
                  <Input
                    {...field}
                    id="bot-job"
                    placeholder="Research assistant"
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
              name="instructions"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-instructions">
                    How it should work
                  </FieldLabel>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    id="bot-instructions"
                    placeholder="Answer briefly, cite sources, and ask before running anything destructive."
                    className="min-h-24"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && (
                <Spinner data-icon="inline-start" />
              )}
              Create bot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { BotDialog }
