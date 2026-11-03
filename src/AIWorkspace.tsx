import { useEffect, useState } from 'react'
import ThoughtLine from './react-bits/ThoughtLine'

type Message = { role: 'user' | 'assistant'; content: string }

declare global {
  interface Window {
    loneXAI: {
      history: () => Promise<Message[]>
      models: () => Promise<string[]>
      send: (input: { model: string; text: string }) => Promise<Message[]>
      onDelta: (callback: (delta: string) => void) => () => void
    }
  }
}

export default function AIWorkspace({ draft, setDraft }: { draft: string; setDraft: (draft: string) => void }) {
  const [model, setModel] = useState(() => localStorage.getItem('lone-x-model-ollama') ?? '')
  const [models, setModels] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState('')
  const [response, setResponse] = useState('')
  const [error, setError] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [ready, setReady] = useState(false)
  const api = window.loneXAI

  useEffect(() => {
    let mounted = true
    api.history().then(history => {
      if (mounted) {
        setMessages(history)
        setReady(true)
      }
    }).catch(() => { if (mounted) setError('Could not load the local conversation.') })
    const unsubscribe = api.onDelta(delta => setResponse(text => text + delta))
    return () => { mounted = false; unsubscribe() }
  }, [api])

  function changeModel(next: string) {
    setModel(next)
    localStorage.setItem('lone-x-model-ollama', next)
  }

  async function discover() {
    setDiscovering(true)
    setError('')
    try {
      const installed = await api.models()
      setModels(installed)
      if (!installed.length) setError('Ollama is running, but no models are installed.')
    } catch {
      setError('Ollama is unavailable. Start it locally and refresh the model list.')
    } finally {
      setDiscovering(false)
    }
  }

  async function send() {
    const text = draft.trim()
    if (!text || !model.trim() || pending) return
    setPending(text)
    setResponse('')
    setError('')
    try {
      const history = await api.send({ model, text })
      setMessages(history)
      setDraft('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not send the instruction.')
    } finally {
      setPending('')
      setResponse('')
    }
  }

  return <section className="panel draft-panel" aria-label="AI conversation">
    <div className="provider-controls">
      <span>Ollama · Local</span>
      <label>Model <input value={model} maxLength={200} disabled={!!pending} onChange={event => changeModel(event.target.value)} list="ollama-models" placeholder="Installed model name" /></label>
      <datalist id="ollama-models">{models.map(name => <option key={name} value={name} />)}</datalist>
      <button className="provider-button" type="button" disabled={!!pending || discovering} onClick={discover}>{discovering ? 'Checking…' : 'Find models'}</button>
    </div>
    <div className="chat-log" aria-label="Messages">
      {[...messages, ...(pending ? [{ role: 'user', content: pending }, { role: 'assistant', content: response }] : [])].map((message, index) =>
        message.content && <div key={index} className={'chat-message chat-' + message.role}><strong>{message.role === 'user' ? 'You' : 'Lone X'}</strong><p>{message.content}</p></div>
      )}
      {pending && <ThoughtLine working label={response ? "Streaming response" : "Waiting for Ollama"} glyphColor="var(--accent)" />}
    </div>
    <form onSubmit={event => { event.preventDefault(); void send() }}>
      <label htmlFor="draft">Instruction draft</label>
      <textarea id="draft" value={draft} maxLength={16000} disabled={!!pending} onChange={event => setDraft(event.target.value)} placeholder="Describe what you want to do…" />
      <div className="provider-controls">
        <button className="provider-button" disabled={!ready || !!pending || !draft.trim() || !model.trim()}>{pending ? 'Responding…' : 'Send instruction'}</button>
        {draft && !pending && <ThoughtLine working={false} label="Draft saved locally" doneLabel="Draft saved locally" showTimer={false} glyph="dot" glyphColor="var(--accent)" shimmer={false} />}
      </div>
    </form>
    {error && <p className="chat-error" role="alert">{error}</p>}
  </section>
}
