import { useEffect, useState } from 'react'
import OverviewActivity from './OverviewActivity'

type Audit = Awaited<ReturnType<Window['loneXTerminal']['history']>>

export default function Activity() {
  const [audit, setAudit] = useState<Audit>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    window.loneXTerminal.history().then(entries => {
      if (current) setAudit(entries)
    }).catch(() => { if (current) setFailed(true) })
    return () => { current = false }
  }, [])

  return <div className="overview-panels">
    <OverviewActivity />
    <section className="launch-panel activity-log" aria-labelledby="activity-log-title">
      <h2 id="activity-log-title">Recent commands</h2>
      {audit?.length ? <ul>{audit.map((entry, index) => <li key={index}>
        <div><strong>{entry.command}</strong><time dateTime={new Date(entry.time).toISOString()}>{new Date(entry.time).toLocaleString()}</time></div>
        <span>{entry.outcome}</span>
      </li>)}</ul> : <p role="status">{failed ? 'Could not load command history.' : audit ? 'No commands recorded yet.' : 'Loading command history…'}</p>}
    </section>
  </div>
}
