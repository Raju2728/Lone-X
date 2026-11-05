import { useEffect, useState, type FormEvent } from 'react'

type BrowserState = { status: string; url: string; canGoBack?: boolean; canGoForward?: boolean }
declare global {
  interface Window {
    loneXBrowser: {
      navigate: (action: 'back' | 'forward' | 'reload') => Promise<BrowserState>
      open: (url: string) => Promise<BrowserState>
      status: () => Promise<BrowserState>
      stop: () => Promise<void>
      close: () => Promise<void>
    }
  }
}

export default function BrowserWorkspace() {
  const [url, setUrl] = useState('')
  const [state, setState] = useState<BrowserState>({ status: 'Closed', url: '' })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const api = window.loneXBrowser

  useEffect(() => {
    let mounted = true
    const update = () => {
      api.status().then(value => { if (mounted) setState(value) }).catch(() => {
        if (mounted) setError('Could not read the browser status.')
      })
    }
    update()
    const interval = window.setInterval(update, 1000)
    return () => { mounted = false; window.clearInterval(interval) }
  }, [api])

  async function open(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try { setState(await api.open(url.trim())) }
    catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not open the website.')
    } finally { setPending(false) }
  }

  async function navigate(action: 'back' | 'forward' | 'reload') {
    setError('')
    try { setState(await api.navigate(action)) }
    catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not navigate the website.')
    }
  }

  return <section className="launch-panel" aria-label="Browser workspace">
    <h2>Browser workspace</h2>
    <div className="p-4">
      <p className="muted">Review an HTTPS website before opening it. Navigation stays on its approved origin. Browser data is temporary.</p>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event => void open(event)}>
        <label className="min-w-0 flex-1">Website address
          <input className="block w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] p-2" type="url" required maxLength={2048} value={url} placeholder="https://example.com" onChange={event => setUrl(event.target.value)} disabled={pending} />
        </label>
        <button className="provider-button" disabled={pending}>Review and open</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="provider-button" disabled={pending || state.status === 'Loading' || !state.canGoBack} onClick={() => void navigate('back')}>Back</button>
        <button className="provider-button" disabled={pending || state.status === 'Loading' || !state.canGoForward} onClick={() => void navigate('forward')}>Forward</button>
        <button className="provider-button" disabled={pending || state.status === 'Closed' || state.status === 'Loading'} onClick={() => void navigate('reload')}>Reload</button>
        <button className="provider-button" disabled={state.status === 'Closed' && !pending} onClick={() => void api.stop().catch(() => setError('Could not stop page loading.'))}>Stop loading</button>
        <button className="provider-button" disabled={state.status === 'Closed' && !pending} onClick={() => void api.close().catch(() => setError('Could not close the browser.'))}>Close browser</button>
      </div>
      <p className="break-all mt-3" role="status">{state.status}{state.url && ' · ' + state.url}</p>
      {error && <p className="chat-error" role="alert">{error}</p>}
    </div>
  </section>
}
