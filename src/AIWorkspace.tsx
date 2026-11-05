import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Cpu, Ellipsis, FileText, MessageSquare, Plus, Radio, Trash2, UserRound } from 'lucide-react'
import LatticeLoader from './react-bits/LatticeLoader'
import PromptBar, { type PromptBarSendDetail } from './react-bits/PromptBar'
import ResponseText from './ResponseText'
import type { Usage } from './OverviewActivity'
import { chatModels, defaultModel, type ModelInventoryItem, type ModelProgress } from './modelCatalog'

type Conversation = { id: string; title: string; updatedAt: number }

const fileSources = [{ key: 'files', name: 'Add files', description: 'Attach local text or source files', icon: <FileText size={15} />, attach: true }]
const responseEfforts = ['Short', 'Balanced', 'Detailed']
const loadingLabels = ['Thinking…', 'Yosichufying…']

type Message = { role: 'user' | 'assistant'; content: string }
type AgentReview = { id: string; kind: string; path: string; before: string; after: string; note: string }

declare global {
  interface Window {
    loneXAI: {
      chooseAgentFolder: (target?: 'desktop' | 'pc') => Promise<string | null>
      disconnectAgent: () => Promise<void>
      reviewAgent: (input: { id: string; accept: boolean }) => Promise<void>
      onAgentReview: (callback: (review: AgentReview | null) => void) => () => void
      plan: (task: string) => Promise<{ summary: string; steps: { action: string; verify: string; tool?: 'version' | 'memory' | 'get-location' }[] } | null>
      history: (id?: string) => Promise<Message[]>
      models: () => Promise<string[]>
      modelInventory: () => Promise<ModelInventoryItem[]>
      stopModel: () => Promise<void>
      onModelProgress: (callback: (progress: ModelProgress) => void) => () => void
      overview: () => Promise<Usage>
      overviewUpdate: () => Promise<string | null>
      send: (input: { model: string; text: string; chatId: string; effort?: string; agent?: boolean }) => Promise<Message[] | null>
      installModel: (model: string) => Promise<boolean>
      conversations: () => Promise<Conversation[]>
      deleteChat: (id: string) => Promise<Conversation[]>
      stop: () => Promise<void>
      dictate: () => Promise<string>
      stopDictation: () => Promise<void>
      onDelta: (callback: (delta: string) => void) => () => void
    }
  }
}

export default function AIWorkspace({ active, draft, setDraft }: { active: boolean; draft: string; setDraft: (draft: string) => void }) {
  const [model, setModel] = useState(defaultModel)
  const [agent, setAgent] = useState(false)
  const [agentFolder, setAgentFolder] = useState('')
  const [pcWide, setPcWide] = useState(false)
  const [review, setReview] = useState<AgentReview | null>(null)
  const [choosingFolder, setChoosingFolder] = useState(false)
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
  const [loadingLabel, setLoadingLabel] = useState(loadingLabels[0])
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const api = window.loneXAI
  const transcript = useRef<HTMLDivElement>(null)
  const newChatButton = useRef<HTMLButtonElement>(null)
  const files = useRef(new Map<string, File>())
  const followLatest = useRef(true)

  useEffect(() => api.onAgentReview(setReview), [api])

  async function chooseAgentFolder(target?: 'desktop' | 'pc') {
    setChoosingFolder(true); setError('')
    try {
      const folder = await api.chooseAgentFolder(target)
      if (folder) { setAgentFolder(folder); setPcWide(target === 'pc'); setAgent(true); setModel('qwen3:4b-instruct') }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not choose agent folder.') }
    finally { setChoosingFolder(false) }
  }

  async function decideReview(accept: boolean) {
    if (!review) return
    try { await api.reviewAgent({ id: review.id, accept }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not submit the review.') }
  }

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
    files.current.clear()
    stopDictation()
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

  function attachFiles() {
    return new Promise<string[]>(resolve => {
      const picker = document.createElement('input')
      picker.type = 'file'
      picker.multiple = true
      picker.accept = '.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.html,.css,.py,.xml,.yaml,.yml,.log'
      picker.addEventListener('cancel', () => resolve([]), { once: true })
      picker.addEventListener('change', () => {
        const chosen = Array.from(picker.files ?? [])
        const accepted = chosen.filter(file => file.size <= 16000 && /\.(txt|md|csv|json|js|ts|tsx|jsx|html|css|py|xml|ya?ml|log)$/i.test(file.name))
        setError(accepted.length < chosen.length ? 'Choose text or source files up to 16 KB each.' : '')
        for (const file of accepted) files.current.set(file.name, file)
        resolve(accepted.map(file => file.name))
      }, { once: true })
      picker.click()
    })
  }

  function stopDictation() {
    void api.stopDictation().catch(() => {})
  }

  async function dictate() {
    setError('')
    try {
      return await api.dictate()
    } catch {
      setError('Windows dictation is unavailable. Check your microphone and installed speech language.')
    }
  }

  async function send(prompt: string, detail: PromptBarSendDetail) {
    const text = prompt.trim()
    if (deleting || installing || !ready || (!text && !detail.attachments.length) || needsModel || pending) return false
    let sendAgent = agent
    let sendModel = model
    if (!pcWide && /^(?:please\s+)?(?:create|make|write|edit|read|delete|remove)\b/i.test(text) && /\bdesktop\b/i.test(text) && /\b(?:file|folder|directory|document)\b/i.test(text)) {
      setChoosingFolder(true)
      try {
        const folder = await api.chooseAgentFolder('desktop')
        if (!folder) return false
        setAgentFolder(folder); setPcWide(false); setAgent(true); setModel('qwen3:4b-instruct')
        sendAgent = true; sendModel = 'qwen3:4b-instruct'
        const available = await api.models()
        setInstalledModels(available)
        if (!available.includes(sendModel)) { setError('Desktop access is ready. Download Qwen3 4B Instruct below, then send this prompt again.'); return false }
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not request Desktop access.'); return false }
      finally { setChoosingFolder(false) }
    }
    followLatest.current = true
    stopDictation()
    setPending([text, ...detail.attachments].filter(Boolean).join('\n'))
    setResponse('')
    setLoadingLabel(loadingLabels[Math.floor(Math.random() * loadingLabels.length)])
    setError('')
    try {
      const excerpts = await Promise.all(detail.attachments.map(async name => {
        const file = files.current.get(name)
        if (!file) throw new Error('Attach the file again before sending.')
        const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
        if (content.includes('\0')) throw new Error('Attachments must be UTF-8 text files.')
        return 'File: ' + name + '\n' + content
      }))
      const message = [text, ...excerpts].filter(Boolean).join('\n\n')
      if (message.length > 16000) throw new Error('Keep the prompt and attached text within 16,000 characters.')
      const history = await api.send({ model: sendModel, text: message, chatId, effort: detail.effort, agent: sendAgent })
      if (!history) return false
      setMessages(history)
      setDraft('')
      files.current.clear()
      void api.conversations().then(setConversations).catch(() => {})
      return true
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not send the instruction.')
      return false
    } finally {
      setPending('')
      setResponse('')
      window.dispatchEvent(new Event('lone-x-usage-changed'))
    }
  }

  const timeline = [...messages, ...(pending ? [{ role: 'user', content: pending }, { role: 'assistant', content: response }] : [])]

  return <section className="ai-console" aria-label="AI conversation">
    <div className="ai-console-bar">
      <div className="ai-runtime"><Radio size={17} aria-hidden="true" /><div><strong>Local session</strong><small>Raju · Ollama on this PC</small></div></div>
      <div className="agent-controls">
        <button className="provider-button" aria-pressed={agent} disabled={!!pending || installing || choosingFolder} onClick={() => { setAgent(value => !value); if (!agent) setModel('qwen3:4b-instruct') }}>Agent {agent ? 'on' : 'off'}</button>
        <button className="provider-button" disabled={!!pending || choosingFolder} onClick={() => void chooseAgentFolder()}>{choosingFolder ? 'Choosing…' : agentFolder ? 'Change folder' : 'Choose agent folder'}</button>
        <button className="provider-button" disabled={!!pending || choosingFolder} onClick={() => void chooseAgentFolder('desktop')}>Use Desktop</button>
        <button className="provider-button" aria-pressed={pcWide} disabled={!!pending || choosingFolder} onClick={() => void chooseAgentFolder('pc')}>PC-wide access</button>
        {agentFolder && <span className="agent-folder" title={pcWide ? 'All accessible Windows drives · changes require approval' : agentFolder}>{pcWide ? 'PC-wide · review required' : agentFolder}</span>}
        {agentFolder && <button className="provider-button" disabled={!!pending || choosingFolder} onClick={() => void api.disconnectAgent().then(() => { setAgentFolder(''); setAgent(false); setPcWide(false) }).catch(() => setError('Could not disconnect the folder.'))}>Disconnect</button>}
      </div>
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
            {message.content && (user ? <p>{message.content}</p> : <ResponseText text={message.content} streaming={streaming} onReveal={() => {
              const log = transcript.current
              if (log && followLatest.current) log.scrollTop = log.scrollHeight
            }} />)}
            {streaming && !response && <LatticeLoader className="ai-thinking" label={loadingLabel} pattern="sweep" grid={4}
              shape="round" cellSize={3} gap={2} fontSize={13} color="var(--accent)" showTimer={false} />}
          </div>
        </article>
      })}
    </div>

    <div className="ai-compose">
      {agent && !agentFolder && <p className="muted">Choose a project folder to allow agent tools. File changes require review.</p>}
      {review && <section className="agent-review" aria-label="Review agent action">
        <strong>Review {review.kind} · {review.path}</strong><p>{review.note}</p>
        <div className="agent-review__changes">
          <div><small>Current content / script</small><pre tabIndex={0}>{review.before || (review.kind === 'command' ? '(dependency install)' : '(empty or new file)')}</pre></div>
          <div><small>Proposed content / command</small><pre tabIndex={0}>{review.after || (review.kind === 'recycle' ? '(move to Recycle Bin)' : '(empty file)')}</pre></div>
        </div>
        <div className="agent-controls"><button className="provider-button" onClick={() => void decideReview(false)}>Reject</button><button className="provider-button" onClick={() => void decideReview(true)}>Approve {review.kind}</button></div>
      </section>}
      <PromptBar key={chatId} value={draft} onValueChange={setDraft} busy={!!pending} disabled={!ready || deleting || installing || needsModel || choosingFolder || (agent && !agentFolder)}
        onSend={send} onStop={() => void api.stop().catch(() => setError('Could not stop the response.'))}
        sources={fileSources} onAttach={attachFiles} onDictate={dictate} onCancelDictation={stopDictation}
        commands={[]} models={chatModels} efforts={responseEfforts} selectedModel={model} modelLocked={installing || deleting}
        onModelChange={key => { setModel(key); if (key !== 'qwen3:4b-instruct') setAgent(false); setError('') }}
        placeholder="Ask Anything" radius={24} background="var(--bg)" color="var(--text)" menuBackground="var(--surface)" sparkColor="var(--accent)" />
      {needsModel && <div className="ai-model-actions">
        {installing ? <>
          <LatticeLoader label={'Downloading ' + modelName} color="var(--accent)" />
          <button className="provider-button" type="button" onClick={() => void api.stopModel().catch(() => setError('Could not stop the model download.'))}>Cancel download</button>
        </> : <button className="provider-button" type="button" onClick={() => void installModel()}>Download {modelName}</button>}
      </div>}
      {error && <p className="chat-error" role="alert">{error}</p>}
    </div>
      </div>
    </div>
  </section>
}
