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

// noVNC, started with the rest of the desktop by computerUse.start()
const VNC_PORT = 6080
const VNC_URL_TTL_SECONDS = 60 * 60

// A browser-ready noVNC URL for the sandbox's desktop. Signed, so it works in
// an iframe without headers, and scoped to the VNC port only.
export async function getVncUrl(sandboxId: string) {
  const sandbox = await getComputer(sandboxId)
  const { url } = await sandbox.getSignedPreviewUrl(
    VNC_PORT,
    VNC_URL_TTL_SECONDS
  )

  const vnc = new URL("/vnc.html", url)
  vnc.searchParams.set("autoconnect", "true")
  vnc.searchParams.set("reconnect", "true")
  // Scale the remote desktop to whatever box the iframe is given
  vnc.searchParams.set("resize", "scale")
  return vnc.toString()
}
