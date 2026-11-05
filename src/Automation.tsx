import { useEffect, useState } from 'react'
import BrowserWorkspace from './BrowserWorkspace'

type Status = {
  memory: { total: number; free: number }
  processors: number
  apps: { id: string; name: string; available: boolean }[]
  history: { time: number; application: string; outcome: string }[]
}

declare global {
  interface Window {
    loneXAutomation: {
      status: () => Promise<Status>
      launch: (id: string) => Promise<{ outcome: string }>
      cancel: () => Promise<void>
    }
  }
}

const gib = (bytes: number) => (bytes / 1024 ** 3).toFixed(1) + ' GB'

export default function Automation() {
  const [status, setStatus] = useState<Status>()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const api = window.loneXAutomation

  useEffect(() => {
    let mounted = true
    const update = () => {
      api.status().then(value => { if (mounted) setStatus(value) }).catch(() => {
        if (mounted) setError('Could not read system status.')
      })
    }
    update()
    const timer = window.setInterval(update, 5000)
    return () => {
      mounted = false
      window.clearInterval(timer)
      void api.cancel().catch(() => {})
    }
  }, [api, refresh])

  async function launch(id: string) {
    setPending(true)
    setError('')
    setMessage('')
    try { setMessage((await api.launch(id)).outcome) }
    catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not open the application.')
    } finally {
      setPending(false)
      setRefresh(value => value + 1)
    }
  }

  return <><section className="launch-panel" aria-label="Windows automation">
    <h2>Windows applications</h2>
    <div className="px-4 pb-4">
      {status && <p className="muted">Memory · {gib(status.memory.total - status.memory.free)} used of {gib(status.memory.total)} · {status.processors} logical processors</p>}
      {message && <p role="status">{message}</p>}
      {error && <p className="chat-error" role="alert">{error}</p>}
      {pending && <button className="provider-button" onClick={() => void api.cancel().catch(() => setError('Could not cancel the launch request.'))}>Cancel pending request</button>}
    </div>
    {status?.apps.map(item => <div className="launch-row" key={item.id}>
      <span className="launch-icon" aria-hidden="true">↗</span>
      <div><strong>{item.name}</strong><small>{item.available ? 'Available on this PC' : 'Not found in the standard Windows location'}</small></div>
      <button className="provider-button" disabled={pending || !item.available} onClick={() => void launch(item.id)}>Review and open</button>
    </div>)}
    {!!status?.history.length && <details className="ps-audit">
      <summary>Application launch history</summary>
      <ul>{status.history.map((entry, index) => <li key={index}>
        <span>{entry.application} · {new Date(entry.time).toLocaleString()}</span><span>{entry.outcome}</span>
      </li>)}</ul>
    </details>}
  </section><BrowserWorkspace /></>
}
