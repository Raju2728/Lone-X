import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Cpu, Ellipsis, MessageSquare, Plus, Radio, Trash2, UserRound } from 'lucide-react'
import LatticeLoader from './react-bits/LatticeLoader'
import PromptBar from './react-bits/PromptBar'
import type { Usage } from './OverviewActivity'

type Conversation = { id: string; title: string; updatedAt: number }

const defaultModel = 'qwen2.5:0.5b'
const coderModel = 'qwen2.5-coder:0.5b'
const gemmaModel = 'gemma3:1b'

const chatModels = [
  { key: defaultModel, name: 'Qwen2.5 0.5B', tag: 'Local' },
  { key: coderModel, name: 'Qwen2.5 Coder 0.5B', tag: 'Local' },
  { key: gemmaModel, name: 'Gemma 3 1B', tag: 'Local' }
]

type Message = { role: 'user' | 'assistant'; content: string }

declare global {
  interface Window {
    loneXAI: {
      plan: (task: string) => Promise<{ summary: string; steps: { action: string; verify: string; tool?: 'version' | 'memory' | 'get-location' }[] } | null>
      history: (id?: string) => Promise<Message[]>
      models: () => Promise<string[]>
      overview: () => Promise<Usage>
      overviewUpdate: () => Promise<string | null>
      send: (input: { model: string; text: string; chatId: string }) => Promise<Message[] | null>
      installModel: (model: string) => Promise<boolean>
      conversations: () => Promise<Conversation[]>
      deleteChat: (id: string) => Promise<Conversation[]>
      stop: () => Promise<void>
      onDelta: (callback: (delta: string) => void) => () => void
    }
  }
}

export default function AIWorkspace({ active, draft, setDraft }: { active: boolean; draft: string; setDraft: (draft: string) => void }) {
  const [model, setModel] = useState(defaultModel)
  const [installedModels, setInstalledModels] = useState<string[]>([])
  const [installing, setInstalling] = useState(false)
  const needsModel = model !== defaultModel && !installedModels.includes(model)
  const modelName = chatModels.find(item => item.key === model)?.name ?? model
  const [chatId, setChatId] = useState(() => localStorage.getItem('lone-x-current-chat') ?? 'default')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [deleting, setDeleting] = useState(false)
  const [openActions, setOpenActions] = useState<string>()
  const [pending, setPending] = useState('')
  const [response, setResponse] = useState('')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const api = window.loneXAI
  const transcript = useRef<HTMLDivElement>(null)
  const newChatButton = useRef<HTMLButtonElement>(null)
  const followLatest = useRef(true)

  useEffect(() => {
    if (!active) return
    function handleShortcut(event: KeyboardEvent) {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey || event.key.toLowerCase() !== 'o') return
      event.preventDefault()
      if (!event.repeat) newChatButton.current?.click()
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [active])

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

  useEffect(() => {
    if (!needsModel || installing) return
    let current = true
    api.models().then(models => {
      if (current) setInstalledModels(models)
    }).catch(() => {})
    return () => { current = false }
  }, [api, model, needsModel, installing])

  async function installModel() {
    setInstalling(true)
    setError('')
    try {
      if (await api.installModel(model)) setInstalledModels(models => [...models, model])
    } catch {
      setError('Could not download the selected model. Check your internet connection and available disk space.')
    } finally {
      setInstalling(false)
    }
  }

  function openChat(id: string, discardDraft = false) {
    setOpenActions(undefined)
    if (pending || id === chatId) return
    if (!discardDraft) localStorage.setItem('lone-x-draft-' + chatId, draft)
    const nextDraft = localStorage.getItem('lone-x-draft-' + id) ?? ''
    localStorage.setItem('lone-x-current-chat', id)
    followLatest.current = true
    setReady(false)
    setError('')
    setMessages([])
    setDraft(nextDraft)
    setChatId(id)
  }

  async function removeChat(chat: Conversation) {
    if (pending || deleting || !window.confirm('Delete this saved chat and all its messages?')) return
    setDeleting(true)
    setError('')
    try {
      const remaining = await api.deleteChat(chat.id)
      setConversations(remaining)
      localStorage.removeItem('lone-x-draft-' + chat.id)
      if (chat.id === chatId) openChat(remaining[0]?.id ?? crypto.randomUUID(), true)
    } catch {
      setError('Could not delete the chat. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  async function send(prompt: string) {
    const text = prompt.trim()
    if (deleting || installing || !ready || !text || needsModel || pending) return
    followLatest.current = true
    setPending(text)
    setResponse('')
    setError('')
    try {
      const history = await api.send({ model, text, chatId })
      if (!history) return
      setMessages(history)
      setDraft('')
      void api.conversations().then(setConversations).catch(() => {})
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
    </div>

    <div className="ai-workbench">
      <aside className="ai-history" aria-label="Saved chats">
        <div className="ai-history-heading">
          <h2>Chats</h2>
          <button ref={newChatButton} className="ai-new-chat" type="button" aria-label="New Chat" aria-keyshortcuts="Control+Shift+O" title="New Chat (Ctrl+Shift+O)" disabled={!!pending || deleting} onClick={() => openChat(crypto.randomUUID())}>
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        {conversations.length === 0 && <small>Saved chats will appear here.</small>}
        <ul>{conversations.map(chat => <li key={chat.id} onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpenActions(current => current === chat.id ? undefined : current)
        }} onKeyDown={event => {
          if (event.key !== 'Escape' || openActions !== chat.id) return
          event.currentTarget.querySelector<HTMLButtonElement>('.ai-chat-more')?.focus()
          setOpenActions(undefined)
        }}>
          <button title={chat.title} aria-current={chat.id === chatId ? 'true' : undefined} disabled={!!pending || deleting} onClick={() => openChat(chat.id)}>
            <MessageSquare size={14} aria-hidden="true" /><span>{chat.title}</span>
          </button>
          <button className="ai-chat-more" type="button" aria-label={'More options for ' + chat.title} title="More options" aria-expanded={openActions === chat.id} disabled={!!pending || deleting} onClick={() => setOpenActions(current => current === chat.id ? undefined : chat.id)}>
            <Ellipsis size={16} aria-hidden="true" />
          </button>
          {openActions === chat.id && <div className="ai-chat-actions">
            <button className="ai-chat-delete" type="button" disabled={!!pending || deleting} onClick={() => void removeChat(chat)}>
              <Trash2 size={14} aria-hidden="true" />Delete chat
            </button>
          </div>}
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
      <PromptBar value={draft} onValueChange={setDraft} busy={!!pending} disabled={!ready || deleting || installing || needsModel}
        onSend={text => void send(text)} onStop={() => void api.stop().catch(() => setError('Could not stop the response.'))}
        sources={[]} commands={[]} models={chatModels} efforts={[]} selectedModel={model} modelLocked={installing || deleting}
        onModelChange={key => { setModel(key); setError('') }}
        placeholder="Ask Raju…" background="var(--bg)" color="var(--text)" menuBackground="var(--surface)" sparkColor="var(--accent)" />
      {needsModel && <div className="ai-model-actions">
        {installing ? <>
          <LatticeLoader label={'Downloading ' + modelName} color="var(--accent)" />
          <button className="provider-button" type="button" onClick={() => void api.stop().catch(() => setError('Could not stop the model download.'))}>Cancel download</button>
        </> : <button className="provider-button" type="button" onClick={() => void installModel()}>Download {modelName}</button>}
      </div>}
      {error && <p className="chat-error" role="alert">{error}</p>}
    </div>
      </div>
    </div>
  </section>
}
