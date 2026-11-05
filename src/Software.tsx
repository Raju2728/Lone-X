import { useEffect, useState } from 'react'

type Attempt = { startedAt: number; finishedAt: number | null; outcome: string }
type Tool = { id: string; name: string; packageId: string; purpose: string; installed: boolean; version: string | null; lastAttempt: Attempt | null }
type Inventory = { wingetAvailable: boolean; tools: Tool[] }
type InstallPlan = { id: string; name: string; packageId: string; command: string; verification: string }

declare global {
  interface Window {
    loneXSoftware: {
      inventory: () => Promise<Inventory>
      plan: (id: string) => Promise<InstallPlan>
      install: (id: string) => Promise<{ outcome: string; output: string; inventory: Inventory } | null>
    }
  }
}

const readable = (error: unknown) => error instanceof Error
  ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  : 'Could not complete the software request.'

export default function Software() {
  const [inventory, setInventory] = useState<Inventory>()
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [plan, setPlan] = useState<InstallPlan>()
  const [message, setMessage] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const api = window.loneXSoftware

  useEffect(() => {
    let mounted = true
    setBusy(true)
    api.inventory().then(state => { if (mounted) setInventory(state) })
      .catch(failure => { if (mounted) setError(readable(failure)) })
      .finally(() => { if (mounted) setBusy(false) })
    return () => { mounted = false }
  }, [api, refresh])

  async function prepare(id: string) {
    setBusy(true)
    setError('')
    setMessage('')
    setOutput('')
    try { setPlan(await api.plan(id)) } catch (failure) { setError(readable(failure)) }
    finally { setBusy(false) }
  }

  async function install() {
    if (!plan) return
    setBusy(true)
    setInstalling(true)
    setError('')
    try {
      const result = await api.install(plan.id)
      if (result) {
        setInventory(result.inventory)
        setMessage(result.outcome)
        setOutput(result.output)
        setPlan(undefined)
      }
    } catch (failure) { setError(readable(failure)) }
    finally { setBusy(false); setInstalling(false) }
  }

  return <section className="launch-panel" aria-label="Software manager">
    <h2>Development tools</h2>
    <div className="px-4 pb-4">
      <p className="muted">Checks the standard Windows installation locations.</p>
      <button className="provider-button" disabled={busy} onClick={() => { setPlan(undefined); setError(''); setRefresh(value => value + 1) }}>Refresh tools</button>
      {inventory && !inventory.wingetAvailable && <p role="status">WinGet is unavailable. Windows App Installer is required to install tools here.</p>}
      {installing && <p role="status">Complete the publisher installer and any Windows approval screen. You can cancel inside the installer.</p>}
      {error && <p className="chat-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
    {inventory?.tools.map(tool => <div className="launch-row" key={tool.id}>
      <span className="launch-icon" aria-hidden="true">↓</span>
      <div><strong>{tool.name}</strong><small>{tool.purpose}</small>
        <small>{tool.installed ? tool.version : 'Not found in the standard location'}</small>
        {tool.lastAttempt && <small>Last attempt · {tool.lastAttempt.outcome} · <time dateTime={new Date(tool.lastAttempt.startedAt).toISOString()}>{new Date(tool.lastAttempt.startedAt).toLocaleString()}</time></small>}
      </div>
      {!tool.installed && <button className="provider-button" disabled={busy || !inventory.wingetAvailable} onClick={() => void prepare(tool.id)}>Review installation</button>}
    </div>)}
    {plan && <div className="p-4">
      <h3>{plan.name}</h3>
      <p className="break-all"><code>{plan.command}</code></p>
      <p className="muted">After installation, Lone X checks <code>{plan.verification}</code>.</p>
      <button className="provider-button mt-3" disabled={busy} onClick={() => void install()}>Continue to approval</button>
    </div>}
    {output && <pre className="p-4 max-h-64 overflow-auto whitespace-pre-wrap break-all" aria-label="Installer output">{output}</pre>}
  </section>
}
