import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Cpu, MessageSquare, Plus, Radio, UserRound } from 'lucide-react'
import LatticeLoader from './react-bits/LatticeLoader'
import StatusMark from './react-bits/StatusMark'
import PromptBar from './react-bits/PromptBar'

type Conversation = { id: string; title: string; updatedAt: number }

type Message = { role: 'user' | 'assistant'; content: string }

declare global {
  interface Window {
    loneXAI: {
      history: (id?: string) => Promise<Message[]>
      models: () => Promise<string[]>
      send: (input: { model: string; text: string; chatId: string }) => Promise<Message[] | null>
      conversations: () => Promise<Conversation[]>
      stop: () => Promise<void>
      onDelta: (callback: (delta: string) => void) => () => void
    }
  }
}

export default function AIWorkspace({ draft, setDraft }: { draft: string; setDraft: (draft: string) => void }) {
  const model = 'qwen2.5:0.5b'
  const [chatId, setChatId] = useState(() => localStorage.getItem('lone-x-current-chat') ?? 'default')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState('')
  const [response, setResponse] = useState('')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [responseSaved, setResponseSaved] = useState(false)
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
    api.conversations().then(rows => { if (mounted) setConversations(rows) }).catch(() => { if (mounted) setError('Could not load saved chats.') })
    const unsubscribe = api.onDelta(delta => setResponse(text => text + delta))
    return () => { mounted = false; unsubscribe() }
  }, [api, chatId])

  function openChat(id: string) {
    if (pending || id === chatId) return
    localStorage.setItem('lone-x-draft-' + chatId, draft)
    const nextDraft = localStorage.getItem('lone-x-draft-' + id) ?? ''
    localStorage.setItem('lone-x-current-chat', id)
    followLatest.current = true
    setReady(false)
    setResponseSaved(false)
    setError('')
    setMessages([])
    setDraft(nextDraft)
    setChatId(id)
  }

  async function send(prompt: string) {
    const text = prompt.trim()
    if (!ready || !text || !model.trim() || pending) return
    followLatest.current = true
    setResponseSaved(false)
    setPending(text)
    setResponse('')
    setError('')
    try {
      const history = await api.send({ model, text, chatId })
      if (!history) return
      setMessages(history)
      setDraft('')
      void api.conversations().then(setConversations).catch(() => {})
      setResponseSaved(true)
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
      <button className="provider-button ai-new-chat" type="button" disabled={!!pending} onClick={() => openChat(crypto.randomUUID())}><Plus size={16} aria-hidden="true" />New chat</button>
    </div>

    <div className="ai-workbench">
      <aside className="ai-history" aria-label="Saved chats">
        <h2>Chats</h2>
        {conversations.length === 0 && <small>Saved chats will appear here.</small>}
        <ul>{conversations.map(chat => <li key={chat.id}>
          <button title={chat.title} aria-current={chat.id === chatId ? 'true' : undefined} disabled={!!pending} onClick={() => openChat(chat.id)}>
            <MessageSquare size={14} aria-hidden="true" /><span>{chat.title}</span>
          </button>
        </li>)}</ul>
      </aside>
      <div className="ai-thread">
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

    <div className="ai-compose">
      <PromptBar value={draft} onValueChange={setDraft} busy={!!pending} disabled={!ready}
        onSend={text => void send(text)} onStop={() => void api.stop().catch(() => setError('Could not stop the response.'))}
        sources={[]} commands={[]} models={[]} efforts={[]}
        placeholder="Ask Raju…" background="var(--bg)" color="var(--text)" menuBackground="var(--surface)" sparkColor="var(--accent)" />
      <div className="ai-compose-bar">
        {responseSaved && !draft && !pending
          ? <StatusMark status="done" label="Response saved locally" doneColor="var(--accent)" size={16} fontSize={12} />
          : <small>{draft && !pending ? 'Draft saved locally' : 'Enter to send · Shift+Enter for a new line'}</small>}
      </div>
      {error && <p className="chat-error" role="alert">{error}</p>}
    </div>
      </div>
    </div>
  </section>
}
