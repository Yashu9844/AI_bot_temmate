// What the paid plan includes each month. Safe to import in the browser.
//
// Sized against what each unit costs us (November 2026 list prices):
// - Daytona bills a running sandbox per second for its reserved resources:
//   $0.0504 per vCPU-hour and $0.0162 per GiB-hour of RAM. A default sandbox
//   (1 vCPU, 1 GiB) is about $0.067 per running hour, so 20 hours ≈ $1.35.
// - A stopped sandbox still bills its disk ($0.000108 per GiB-hour, ~$0.24 a
//   month for 3 GiB) until it is archived after a day idle, when it bills
//   nothing. The bot cap bounds that: 25 idle bots is at most ~$6 a month,
//   and far less once they archive.
// - Model tokens are billed by the AI provider per million; 2M tokens on a
//   small open-weight model is roughly $1-2.
// Adjust these with the plan's price in Clerk Dashboard → Billing → Plans.
export const PLAN_LIMITS = {
  // Input plus output tokens across every bot, per period
  aiTokens: 2_000_000,
  // Time any of the user's sandboxes spends running, per period
  sandboxSeconds: 20 * 60 * 60,
  // Bots (each with its own sandbox) the user can have at once
  bots: 25,
} as const

export type UsageMeter = "ai_tokens" | "sandbox_seconds" | "bots"

export const METER_LABELS: Record<UsageMeter, string> = {
  ai_tokens: "AI tokens",
  sandbox_seconds: "Sandbox time",
  bots: "Bots",
}

export type UsageSummary = {
  // Null on the free plan
  period: { start: string; end: string } | null
  used: Record<UsageMeter, number>
  limits: Record<UsageMeter, number>
}

// Returned (not thrown) by server actions, so the message survives production
// builds, which hide thrown errors' messages from the browser
export type UsageCheck =
  | { ok: true }
  // On the free plan: nothing is metered, everything needs an upgrade
  | { ok: false; reason: "no_plan" }
  | { ok: false; reason: "limit"; meter: UsageMeter; resetsAt: string | null }

export class UsageLimitError extends Error {
  constructor(
    readonly meter: UsageMeter,
    readonly resetsAt: Date | null
  ) {
    super(`Usage limit reached: ${meter}`)
    this.name = "UsageLimitError"
  }
}
