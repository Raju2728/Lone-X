import { useEffect, useState } from 'react'

type Audit = { time: number; command: string; outcome: string }
type Result = { outcome: string; output: string }

declare global {
  interface Window {
    loneXTerminal: {
      run: (id: string) => Promise<Result>
      stop: () => Promise<void>
      history: () => Promise<Audit[]>
    }
  }
}

export default function LocalTerminal() {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [audit, setAudit] = useState<Audit[]>([])
  const [error, setError] = useState('')
  const terminal = window.loneXTerminal

  useEffect(() => {
    terminal.history().then(setAudit).catch(() => setError('Could not load the local audit log.'))
  }, [terminal])

  async function run(id: string) {
    setPending(true)
    setError('')
    setResult(null)
    try {
      setResult(await terminal.run(id))
    } catch {
      setError('Could not run this PowerShell command.')
    } finally {
      setPending(false)
      terminal.history().then(setAudit).catch(() => setError('Could not refresh the local audit log.'))
    }
  }

  return <section className="panel terminal-panel" aria-label="Local PowerShell">
    <div className="provider-controls">
      <button className="provider-button" disabled={pending} onClick={() => void run('version')}>PowerShell version</button>
      <button className="provider-button" disabled={pending} onClick={() => void run('memory')}>Available memory</button>
      <button className="provider-button" disabled={!pending} onClick={() => void terminal.stop().catch(() => setError('Could not stop the command.'))}>Stop command</button>
    </div>
    <p role="status">{pending ? 'Awaiting approval or running…' : result?.outcome ?? 'Choose a read-only command.'}</p>
    {result?.output && <pre className="terminal">{result.output}</pre>}
    {error && <p className="chat-error" role="alert">{error}</p>}
    {audit.length > 0 && <section className="project-list" aria-label="Command audit">
      <h2>Recent command activity</h2>
      <ul>{audit.map((entry, index) => <li key={index}>
        <span>{entry.command} · {new Date(entry.time).toLocaleString()}</span><small>{entry.outcome}</small>
      </li>)}</ul>
    </section>}
  </section>
}
