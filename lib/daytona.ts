import { Daytona, DaytonaNotFoundError, type Sandbox } from "@daytona/sdk"

// Reuse one client across hot reloads in dev.
const globalForDaytona = globalThis as unknown as { daytona?: Daytona }

// Passed explicitly: the SDK refuses to guess the endpoint when the variable
// comes from a .env file that Next.js or Trigger.dev already loaded
const daytona =
  globalForDaytona.daytona ??
  new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL,
  })
if (process.env.NODE_ENV !== "production") globalForDaytona.daytona = daytona

// One sandbox per bot. Labels tie it back to the bot in the Daytona dashboard.
export async function createBotSandbox(botId: string, userId: string) {
  const sandbox = await daytona.create({ labels: { botId, userId } })
  return sandbox.id
}

// A sandbox that is already gone counts as deleted.
export async function deleteSandbox(sandboxId: string) {
  try {
    const sandbox = await daytona.get(sandboxId)
    await daytona.delete(sandbox)
  } catch (error) {
    if (error instanceof DaytonaNotFoundError) return
    throw error
  }
}

const sandboxes = new Map<string, Sandbox>()

// The sandbox, running and with its desktop up, ready for commands and
// computer use. It auto-stops when idle, so its state is checked every call.
export async function getComputer(sandboxId: string) {
  let sandbox = sandboxes.get(sandboxId)
  if (sandbox) {
    await sandbox.refreshData()
  } else {
    sandbox = await daytona.get(sandboxId)
    sandboxes.set(sandboxId, sandbox)
  }

  if (sandbox.state === "starting") {
    await sandbox.waitUntilStarted()
  } else if (sandbox.state !== "started") {
    // Stopped or archived
    await sandbox.start()
  }

  const { status } = await sandbox.computerUse.getStatus()
  if (status !== "active") {
    await sandbox.computerUse.start()
  }

  return sandbox
}
