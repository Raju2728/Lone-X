import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

type Audit = { time: number; command: string; outcome: string }
type Result = { outcome: string; output: string }
type Entry = { command: string; result?: Result }

declare global {
  interface Window {
    loneXTerminal: {
      run: (command: string) => Promise<Result>
      stop: () => Promise<void>
      history: () => Promise<Audit[]>
    }
  }
}

const help = [
  'Approved PowerShell commands:',
  '  $PSVersionTable.PSVersion.ToString()  PowerShell version',
  '  Get-Date                              Current date and time',
  '  Get-Location (pwd)                    Current working directory',
  '  memory                                Available memory diagnostic',
  '',
  'Lone X commands:',
  '  LoneX -v                              Show the version of LoneX',
  '  LoneX -Avail                          Check whether a newer build is available',
  '  LoneX -update                         Check for Updates',
  '',
  'Console commands: help, clear (cls)',
  'Enter runs a command. Up/Down recalls commands. Ctrl+C stops a running command.'
].join('\n')

export default function LocalTerminal() {
  const [command, setCommand] = useState('')
  const [pending, setPending] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const input = useRef<HTMLInputElement>(null)
  const consoleBody = useRef<HTMLDivElement>(null)
  const commands = useRef<string[]>([])
  const cursor = useRef(0)
  const draft = useRef('')
  const terminal = window.loneXTerminal

  useEffect(() => {
    terminal.history().then(setAudit).catch(() => {})
  }, [terminal])

  useEffect(() => {
    if (consoleBody.current) consoleBody.current.scrollTop = consoleBody.current.scrollHeight
  }, [entries, pending])

  function show(text: string, result?: Result) {
    setEntries(previous => [...previous.slice(-99), { command: text, result }])
  }

  async function run(event: FormEvent) {
    event.preventDefault()
    const text = command.trim()
    if (pending || !text) return
    commands.current = [...commands.current.slice(-99), text]
    cursor.current = commands.current.length
    setCommand('')
    if (['clear', 'cls'].includes(text.toLowerCase())) {
      setEntries([])
      return
    }
    if (text.toLowerCase() === 'help') {
      show(text, { outcome: '', output: help })
      return
    }

    show(text)
    setPending(true)
    let result: Result
    try {
      result = await terminal.run(text)
    } catch (failure) {
      result = {
        outcome: 'Error',
        output: failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not run the command.'
      }
    }
    setEntries(previous => previous.map((entry, index) => index === previous.length - 1 ? { ...entry, result } : entry))
    setPending(false)
    terminal.history().then(setAudit).catch(() => {})
  }

  function stop() {
    void terminal.stop().catch(() => show('^C', { outcome: 'Error', output: 'Could not stop the command.' }))
  }

  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (pending && event.ctrlKey && event.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
      event.preventDefault()
      stop()
    }
    if (event.target !== input.current || pending) return
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      if (cursor.current === commands.current.length && event.key === 'ArrowUp') draft.current = command
      cursor.current = Math.min(commands.current.length, Math.max(0, cursor.current + (event.key === 'ArrowUp' ? -1 : 1)))
      setCommand(commands.current[cursor.current] ?? draft.current)
    }
    if (event.key === 'Escape') setCommand('')
  }

  return <section className="ps-window" aria-label="Windows PowerShell terminal" onKeyDown={handleKeys}>
    <div className="ps-title"><span aria-hidden="true">❯_</span> Windows PowerShell
      {pending && <button type="button" onClick={stop}>Stop command</button>}
    </div>
    <div className="ps-console" ref={consoleBody} tabIndex={0}>
      <div className="ps-banner">Windows PowerShell<br />Lone X local console. Type <strong>help</strong> for approved commands.</div>
      {entries.map((entry, index) => <div className="ps-entry" key={index}>
        <div><span className="ps-prompt">Lone X&gt;</span> {entry.command}</div>
        {entry.result?.output && <pre className={entry.result.outcome === 'Error' || entry.result.outcome === 'Failed' ? 'ps-error' : undefined}>{entry.result.output}</pre>}
        {entry.result?.outcome && entry.result.outcome !== 'Completed' && <div className="ps-status">{entry.result.outcome}</div>}
      </div>)}
      <form className="ps-input" onSubmit={event => void run(event)}>
        <label htmlFor="ps-command" className="ps-prompt">Lone X&gt;<span className="sr-only"> PowerShell command</span></label>
        <input id="ps-command" ref={input} value={command} maxLength={300} readOnly={pending}
          onChange={event => { setCommand(event.target.value); cursor.current = commands.current.length }}
          onFocus={event => {
            const field = event.currentTarget
            requestAnimationFrame(() => {
              if (document.activeElement === field) {
                const end = field.value.length
                field.setSelectionRange(end, end)
              }
            })
          }}
          autoComplete="off" spellCheck={false} aria-describedby="ps-state" />
      </form>
      <div id="ps-state" className="ps-status" role="status">{pending ? 'Running…' : ''}</div>
    </div>
    <details className="ps-audit">
      <summary>Command audit</summary>
      {audit.length ? <ul>{audit.map((entry, index) => <li key={index}>
        <span>{entry.command} · {new Date(entry.time).toLocaleString()}</span><span>{entry.outcome}</span>
      </li>)}</ul> : <p>No commands recorded.</p>}
    </details>
  </section>
}
