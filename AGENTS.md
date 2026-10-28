<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Database schema changes

Apply schema changes with `drizzle-kit push` only (`bun run db:push`). Never use migrations: do not run `drizzle-kit generate` or `drizzle-kit migrate`, and do not create a `drizzle/` migrations folder or migration scripts.

This is a development project. There is no backwards compatibility and the data is worthless. Prefer data loss: never backfill, migrate, or preserve existing rows, and never spend effort on keeping old data working. Every schema change means a clean slate.


## DiceBear

Use DiceBear 10. Documentation: https://www.dicebear.com/llms.txt

There are seven native cores with identical output, not one library with
wrappers. Use the one matching this project's language. Do not reach for the
JavaScript core when the project is written in something else:

    JavaScript  @dicebear/core + @dicebear/styles
    PHP         dicebear/core + dicebear/styles
    Python      dicebear-core + dicebear-styles
    Rust        dicebear-core + dicebear-styles
    Go          github.com/dicebear/dicebear-go/v10 + github.com/dicebear/styles/v10
    Dart        dicebear_core + dicebear_styles
    C#          DiceBear.Core + DiceBear.Styles

Every style page carries a loading snippet for all seven, for example
https://www.dicebear.com/styles/lorelei/index.md

HTTP API: https://api.dicebear.com/10.x/<style>/svg?seed=<seed> The seed is a
query parameter, not a path segment. Options are query parameters too; array
values are separated by commas.

Options named after a component end in Variant: eyesVariant, not eyes. This
holds in all seven cores and in the HTTP API. Look up the options of a style at
https://api.dicebear.com/10.x/<style>/options.json

Write these forms, not the ones on the left. The left column is pre-10 and the
API does not reject it, so an outdated call runs and silently does the wrong
thing:

    avatars.dicebear.com/api/<style>/<seed>.svg  ->  api.dicebear.com/10.x/<style>/svg?seed=<seed>
    api.dicebear.com/9.x/<style>/svg             ->  api.dicebear.com/10.x/<style>/svg
    npm install @dicebear/collection             ->  npm install @dicebear/styles
    npm install @dicebear/lorelei                ->  npm install @dicebear/styles
    createAvatar(lorelei, { seed })              ->  new Avatar(new Style(definition), { seed })
    { eyes: ['variant01'] }                      ->  { eyesVariant: ['variant01'] }
    ?radius=50                                   ->  ?borderRadius=50

Only JavaScript and the HTTP API have a pre-10 form. The other six cores were
released in 2026 and never had one, so any older-looking PHP, Python, Rust, Go,
Dart or C# API attributed to DiceBear is invented rather than outdated.

## Forms

Every form follows the bot dialog: one zod schema, validated on the client and
again in the server action. See `components/bot-dialog.tsx`, `actions/bot.ts`,
and `insertBotSchema` in `lib/db/schema.ts`.

Packages: `zod` (v4), `react-hook-form`, `@hookform/resolvers`, `drizzle-zod`.
There is no shadcn `form.tsx`. Do not add one.

Schema

- Generate it from the Drizzle table with `createInsertSchema` from
  `drizzle-zod`, next to the table in `lib/db/schema.ts`. Do not write a zod
  object for a table by hand.
- Refine fields in the second argument with user-facing messages, for example
  `name: (s) => s.trim().min(1, "Give it a name").max(50)`.
- `.pick()` only the fields the user fills in. Never include `id`, `userId`,
  timestamps, or other server-set columns. They come from the server.
- Type form values as `z.input<typeof schema>`.

Server action

- Put it in `actions/<table>.ts` with `"use server"` and name it after the
  verb: `createBot`, `updateBot`.
- First line: `const { userId } = await auth.protect()`. Take `userId` from
  Clerk, never from the input.
- Parse the input with the same schema. Client validation is not trusted.
- Store empty optional text as `null` (`data.instructions || null`).
- Write with `db` from `@/lib/db`, `revalidatePath` the affected route, and
  return the row with `.returning()`.

Client component

- `"use client"`, in `components/`. Use
  `useForm({ resolver: zodResolver(schema), defaultValues })`.
- Render every field with `Controller` and the `Field` components from
  `components/ui/field.tsx`:
  `<Field data-invalid={fieldState.invalid}>`, a `FieldLabel` whose `htmlFor`
  matches the input `id`, `aria-invalid={fieldState.invalid}` on the input,
  and `<FieldError errors={[fieldState.error]} />` when invalid.
- Pass `value={field.value ?? ""}` to inputs bound to nullable columns.
- Give every button that does not submit `type="button"`.
- Disable the submit button while `form.formState.isSubmitting` and show
  `<Spinner data-icon="inline-start" />` in it.
- Call the server action in `onSubmit` with `try`/`catch`. On success,
  `toast.add` from `components/ui/toast.tsx` and close the form. On failure,
  `toast.add` an error and keep the user's input.

Forms in dialogs

- The component takes its trigger as `children` and renders
  `<DialogTrigger render={children} />`, so server pages pass their own button.
- Control `open` with state, and in `onOpenChange` call `form.reset()` with
  fresh default values when opening.
- Wrap the dialog body in `<form className="contents">` inside
  `DialogContent`, so `DialogFooter` keeps its full-bleed layout and its
  submit button submits the form.
- Cancel is `<DialogClose render={<Button type="button" variant="outline" />}>`.
- The UI components are Base UI. Compose with the `render` prop, not
  `asChild`.

## Git

Never switch branches (`git checkout`, `git switch`, creating a branch, or
working in a worktree) without telling the user first and getting a go-ahead.
Work on whatever branch is checked out. If the task seems to need a different
branch, ask.
