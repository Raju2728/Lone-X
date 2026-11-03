import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Cpu, Plus, Radio, UserRound } from 'lucide-react'
import LatticeLoader from './react-bits/LatticeLoader'

type Message = { role: 'user' | 'assistant'; content: string }

declare global {
  interface Window {
    loneXAI: {
      history: (id?: string) => Promise<Message[]>
      models: () => Promise<string[]>
      send: (input: { model: string; text: string; chatId: string }) => Promise<Message[]>
      onDelta: (callback: (delta: string) => void) => () => void
    }
  }
}

export default function AIWorkspace({ draft, setDraft }: { draft: string; setDraft: (draft: string) => void }) {
  const model = 'qwen2.5:0.5b'
  const [chatId, setChatId] = useState(() => localStorage.getItem('lone-x-current-chat') ?? 'default')
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState('')
  const [response, setResponse] = useState('')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const api = window.loneXAI
  const transcript = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)

  useLayoutEffect(() => {
    const log = transcript.current
    if (log && followLatest.current) log.scrollTop = log.scrollHeight
  }, [messages, pending, response])

  useEffect(() => {
    let mounted = true
    api.history(chatId).then(history => {
      if (mounted) {
        setMessages(history)
        setReady(true)
      }
    }).catch(() => { if (mounted) setError('Could not load the local conversation.') })
    const unsubscribe = api.onDelta(delta => setResponse(text => text + delta))
    return () => { mounted = false; unsubscribe() }
  }, [api, chatId])

  function newChat() {
    const id = crypto.randomUUID()
    localStorage.setItem('lone-x-current-chat', id)
    followLatest.current = true
    setReady(false)
    setError('')
    setMessages([])
    setDraft('')
    setChatId(id)
  }

  async function send() {
    const text = draft.trim()
    if (!ready || !text || !model.trim() || pending) return
    followLatest.current = true
    setPending(text)
    setResponse('')
    setError('')
    try {
      const history = await api.send({ model, text, chatId })
      setMessages(history)
      setDraft('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not send the instruction.')
    } finally {
      setPending('')
      setResponse('')
    }
  }

  const timeline = [...messages, ...(pending ? [{ role: 'user', content: pending }, { role: 'assistant', content: response }] : [])]

  return <section className="ai-console" aria-label="AI conversation">
    <div className="ai-console-bar">
      <div className="ai-runtime"><Radio size={17} aria-hidden="true" /><div><strong>Local session</strong><small>Raju · Ollama on this PC</small></div></div>
      <button className="provider-button ai-new-chat" type="button" disabled={!!pending} onClick={newChat}><Plus size={16} aria-hidden="true" />New chat</button>
    </div>

    <div className="ai-transcript" aria-label="Messages" tabIndex={0} ref={transcript} onScroll={event => {
      const log = event.currentTarget
      followLatest.current = log.scrollHeight - log.scrollTop - log.clientHeight < 72
    }}>
      {!timeline.length && <div className="ai-empty">
        <img src="./logo.png" alt="" />
        <h2>Start a local conversation</h2>
        <p>Ask Raju a question to start chatting.</p>
      </div>}
      {timeline.map((message, index) => {
        const user = message.role === 'user'
        const streaming = !!pending && index === timeline.length - 1
        return <article key={index} className={'ai-turn' + (user ? ' ai-turn-user' : '')}>
          <span className="ai-avatar">{user ? <UserRound size={16} aria-hidden="true" /> : <Cpu size={16} aria-hidden="true" />}</span>
          <div className="ai-turn-body">
            <strong>{user ? 'You' : 'Raju'}</strong>
            {message.content && <p>{message.content}</p>}
            {streaming && <LatticeLoader label={response ? 'Streaming response' : 'Waiting for Ollama'} color="var(--accent)" />}
          </div>
        </article>
      })}
    </div>

    <form className="ai-compose" onSubmit={event => { event.preventDefault(); void send() }}>
      <label htmlFor="draft" className="sr-only">Instruction draft</label>
      <textarea id="draft" value={draft} maxLength={16000} disabled={!!pending} onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }
        }} placeholder="Ask your local model…" />
      <div className="ai-compose-bar">
        <small>{draft && !pending ? 'Draft saved locally' : 'Enter to send · Shift+Enter for a new line'}</small>
        <button className="ai-send" disabled={!ready || !!pending || !draft.trim() || !model.trim()}>
          {pending ? 'Responding…' : 'Send instruction'}<ArrowUp size={16} aria-hidden="true" />
        </button>
      </div>
      {error && <p className="chat-error" role="alert">{error}</p>}
    </form>
  </section>
}
