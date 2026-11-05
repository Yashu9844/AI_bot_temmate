// Billable features. The slugs match the features attached to the paid plan in
// Clerk Dashboard → Billing → Plans. The free plan has neither, so a user
// without the paid plan can't create or use bots or their sandboxes.
export const FEATURES = {
  bots: "bots",
  sandboxes: "sandboxes",
} as const

export type Feature = (typeof FEATURES)[keyof typeof FEATURES]

// Where the upgrade toast sends the user. Not linked from the sidebar.
export const PRICING_PATH = "/pricing"

export class UpgradeRequiredError extends Error {
  constructor(readonly missing: Feature[]) {
    super(`Upgrade required: ${missing.join(", ")}`)
    this.name = "UpgradeRequiredError"
  }
}

// `has` from auth() / auth.protect(). Throws unless every feature is on the
// user's active plan, so server actions call it right after auth.protect().
export function assertFeatures(
  has: (params: { feature: string }) => boolean,
  ...features: Feature[]
) {
  const missing = features.filter((feature) => !has({ feature }))
  if (missing.length > 0) throw new UpgradeRequiredError(missing)
}
