import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { TokenWindow } from './OverviewActivity'

const percentage = (item: TokenWindow) => Math.max(0, Math.min(100, item.remaining / item.limit * 100))
const tone = (percent: number) => percent >= 70 ? 'green' : percent >= 40 ? 'orange' : percent >= 10 ? 'yellow' : 'red'

export default function UsageLimits() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [windows, setWindows] = useState<TokenWindow[]>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let mounted = true
    const refresh = () => {
      window.loneXAI.overview().then(usage => {
        if (mounted) { setWindows(usage.limits); setFailed(false) }
      }).catch(() => { if (mounted) setFailed(true) })
    }
    refresh()
    const interval = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    window.addEventListener('lone-x-usage-changed', refresh)
    return () => {
      mounted = false
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('lone-x-usage-changed', refresh)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    function blur(event: FocusEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', keyboard)
    document.addEventListener('focusin', blur)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', keyboard)
      document.removeEventListener('focusin', blur)
    }
  }, [open])

  return <div className="rail-limits" ref={root}>
    <button ref={trigger} className="rail-limits__trigger" aria-label="Limits" title="Limits · five-hour and weekly usage" aria-expanded={open} aria-controls="usage-limits-panel" onClick={() => setOpen(value => !value)}>
      <svg className="limit-icon" width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M3.1975 13.7426 A13 13 0 0 1 28.8025 13.7426" stroke="var(--line)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M28.8025 18.2574 A13 13 0 0 1 3.1975 18.2574" stroke="var(--line)" strokeWidth="2.5" strokeLinecap="round" />
        {['five-hour', 'weekly'].map((id, index) => {
          const item = windows?.find(window => window.id === id)
          const percent = item ? percentage(item) : 0
          return <path key={id} d={index === 0 ? 'M3.1975 13.7426 A13 13 0 0 1 28.8025 13.7426' : 'M28.8025 18.2574 A13 13 0 0 1 3.1975 18.2574'} pathLength="100" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${percent} 100`} className={item && !failed ? `limit-tone-${tone(percent)}` : 'limit-tone-unknown'} />
        })}
        <path d="M16 10 L22 16 L16 22 L10 16 Z" fill="currentColor" opacity=".7" />
      </svg>
      <span>Limits</span>
    </button>
    {open && <section id="usage-limits-panel" className="usage-limits" aria-label="Usage limits">
      <div className="usage-limits__heading"><strong>Usage limits</strong><span>Local allowance</span></div>
      {failed ? <p role="status">Could not refresh usage limits. Try reopening this page.</p> : !windows ? <p>Loading usage…</p> : <>
        <div className="usage-limits__windows">{['five-hour', 'weekly'].map(id => windows.find(item => item.id === id)).filter((item): item is TokenWindow => !!item).map(item => <div key={item.id} className={`usage-limit limit-tone-${tone(percentage(item))}`} style={{ '--remaining': `${percentage(item)}%` } as CSSProperties}>
          <div className="usage-limit__label"><strong>{item.id === 'five-hour' ? '5-hour limit' : 'Weekly limit'}</strong><span>{Math.floor(percentage(item))}% left</span></div>
          <div className="usage-limit__track" role="progressbar" aria-label={`${item.label} allowance remaining`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage(item)} aria-valuetext={`${Math.floor(percentage(item))}% remaining`}><div /></div>
          <small>{item.resetsAt ? <>Resets <time dateTime={new Date(item.resetsAt).toISOString()}>{new Date(item.resetsAt).toLocaleString()}</time></> : 'Starts with your first AI request'}</small>
          {item.remaining === 0 && <small>Limit reached</small>}
        </div>)}</div>
        <p>Shared across all local models. Each window resets independently. A running response can finish before new requests pause.</p>
        {windows.some(item => item.estimated) && <p>Includes conservative estimates for interrupted responses or missing token counts.</p>}
      </>}
    </section>}
  </div>
}
