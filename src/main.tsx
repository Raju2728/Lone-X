import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Download, ArrowRight, ArrowUpRight, Boxes, Folder, History, LayoutDashboard, ListChecks, MessageSquare, Moon, Settings, ShieldCheck, Sun, Terminal } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import FlipCard from './react-bits/FlipCard'
import SquishSwitch from './react-bits/SquishSwitch'
import AIWorkspace from './AIWorkspace'
import OverviewActivity from './OverviewActivity'
import Activity from './Activity'
import Projects from './Projects'
import LocalTerminal from './LocalTerminal'
import TaskPlanner from './TaskPlanner'
import AccountGate from './AccountGate'
import TechText from './react-bits/TechText'
import CursorGrid from './react-bits/CursorGrid'
import Aurora from './react-bits/Aurora'
import './style.css'


const logo = './logo.png'
const downloadUrl = import.meta.env.VITE_WINDOWS_DOWNLOAD_URL || (__LOCAL_WINDOWS_DOWNLOAD__ ? './downloads/Lone-X-Windows.zip' : 'https://github.com/Raju2728/Lone-X/releases/download/desktop-preview/Lone-X-Windows.zip')
const desktop = location.protocol === 'file:'
const pages = [
  { name: 'Overview', icon: LayoutDashboard, detail: 'Your Windows agent workspace at a glance.' },
  { name: 'Chat', icon: MessageSquare, detail: 'Draft an instruction for your agent.' },
  { name: 'Projects', icon: Folder, detail: 'Choose a local folder to view its files.' },
  { name: 'Task monitor', icon: ListChecks, detail: 'Ask Raju to draft a task plan and review each step.' },
  { name: 'Terminal', icon: Terminal, detail: 'Run approved Windows PowerShell commands.' },
  { name: 'Activity', icon: History, detail: 'Review local chat usage and recent command results.' },
  { name: 'Settings', icon: Settings, detail: 'Manage your workspace appearance.' },
] as const

function usePreference(key: string, initial: string) {
  const [value, setValue] = useState(() => localStorage.getItem(key) ?? initial)
  useEffect(() => { localStorage.setItem(key, value) }, [key, value])
  return [value, setValue] as const
}

const capabilities = [
  { icon: Boxes, title: 'Local AI with Ollama', detail: 'Use a model installed on your PC for offline chat.' },
  { icon: ShieldCheck, title: 'Approval controls', detail: 'Review sensitive actions and see what the agent attempted in its activity history.' },
  { icon: Terminal, title: 'Development tools', detail: 'Work with project files, PowerShell output, and code changes from one desktop workspace.' },
]

const shippedFeatures = [
  { icon: MessageSquare, title: 'Offline AI chat', detail: 'Raju streams replies from the bundled qwen2.5:0.5b model. Chat runs on your PC without an API key.' },
  { icon: History, title: 'Saved conversations', detail: 'Start a new chat, reopen or delete an older one, and keep history locally for up to 30 days.' },
  { icon: Folder, title: 'Local project tools', detail: 'Choose a folder to list its contents, preview UTF-8 text files, and save a new copy.' },
  { icon: ListChecks, title: 'Reviewable task plans', detail: 'Draft ordered steps and a verification check for each step using the local model.' },
  { icon: Terminal, title: 'PowerShell diagnostics', detail: 'Run a fixed set of read-only commands, stop a running command, and review its local audit entry.' },
  { icon: ShieldCheck, title: 'Local account and updates', detail: 'Sign in with a local account and check for verified Windows updates from the terminal.' }
]

function DesktopDownloads() {
  return <section id="download" className="section" aria-labelledby="download-heading">
    <p className="eyebrow">04 / DESKTOP DOWNLOADS</p>
    <h2 id="download-heading">Download Lone X</h2>
    <p className="muted">Compare builds and system requirements for your operating system.</p>
    <div className="download-platforms">
      <article className="download-platform">
        <h3>Windows <small className="download-badge">x64 preview available</small></h3>
        <div className="download-options">
          <div>
            <strong>Windows 64-bit (x64)</strong>
            <p className="muted">Windows 10 version 22H2 or later on an x64 processor. Allow about 2 GB of free storage for the ZIP and extracted files.</p>
            <p className="muted">The preview uses your CPU for inference. It includes Ollama and the default model. Extract the full ZIP and follow Windows-Setup.txt.</p>
            {downloadUrl && <a className="primary" href={downloadUrl}><Download size={17} aria-hidden="true" /> Download for Windows x64</a>}
          </div>
          <div><strong>Windows 32-bit (x86)</strong><p className="muted">Unavailable. The current preview requires 64-bit Windows.</p></div>
        </div>
      </article>
      <article className="download-platform">
        <h3>Mac <small className="download-badge">Coming soon</small></h3>
        <div className="download-options">
          <div><strong>Mac with Apple silicon (ARM64)</strong><p className="muted">Build unavailable.</p></div>
          <div><strong>Mac with Intel (x64)</strong><p className="muted">Build unavailable.</p></div>
          <p className="muted">Supported macOS versions and hardware requirements will be listed once a Mac build is tested.</p>
        </div>
      </article>
    </div>
  </section>
}

function LogoOrbit({ background }: { background?: ReactNode }) {
  return <div className="command-art" role="img" aria-label="Lone X logo surrounded by orbiting Windows utility icons">
    {background && <div className="orbit-cursor-grid" aria-hidden="true">{background}</div>}
    <div className="command-orbit" aria-hidden="true">
      <img src={logo} alt="" width={1254} height={1254} />
      <div className="command-satellites">
        {[Folder, Terminal, LayoutDashboard, Settings].map((Icon, index) =>
          <div className={'command-track track-' + index} key={index}><span><Icon size={16} /></span></div>
        )}
      </div>
    </div>
    <span className="command-coordinate" aria-hidden="true">LX / 01</span>
  </div>
}

function App() {
  const [theme, setTheme] = usePreference('lone-x-theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  const [draft, setDraft] = usePreference('lone-x-draft', '')
  const [page, setPage] = useState<(typeof pages)[number]>(pages[0])
  const work = useRef<HTMLElement>(null)
  useLayoutEffect(() => { if (work.current) work.current.scrollTop = 0 }, [page])
  const reduceMotion = useReducedMotion()
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const themeButton = <SquishSwitch ariaLabel="Light theme" thumbContent={theme === 'light' ? <Sun size={14} /> : <Moon size={14} />} checked={theme === 'light'} onChange={checked => setTheme(checked ? 'light' : 'dark')} width={48} height={28} trackColor="var(--line)" trackOnColor="var(--accent)" thumbColor="var(--text)" thumbOnColor="var(--text)" />
  const brand = <span className="brand"><img src={logo} alt="" /> Lone X</span>

  if (desktop) {
    const inChat = page === pages[1]
    return <AccountGate><div className={inChat ? 'shell shell-chat' : 'shell'}>
      <aside className="rail">
        <div className="rail-brand">{inChat ? <img src={logo} alt="Lone X" /> : <>{brand}<span>DESKTOP AGENT</span></>}</div>
        <p className="eyebrow">WORKSPACE</p>
        <nav aria-label="Workspace">{pages.slice(0, 2).map(item => {
          const label = item.name
          return <button key={item.name} aria-label={label} title={inChat ? label : undefined} aria-current={page === item ? 'page' : undefined} onClick={() => setPage(item)}><item.icon size={17} aria-hidden="true" /><span>{label}</span></button>
        })}</nav>
        <button className="rail-settings" aria-label="Settings" title={inChat ? 'Settings' : undefined} aria-current={page === pages[6] ? 'page' : undefined} onClick={() => setPage(pages[6])}><Settings size={17} aria-hidden="true" /><span>Settings</span></button>
        <div className="rail-status"><ShieldCheck size={16} aria-hidden="true" /><div><strong>Local workspace</strong><small>Windows desktop</small></div>{themeButton}</div>
      </aside>
      <main ref={work} className={inChat ? 'work work-chat' : 'work'}>
        <div className="work-content">
          {(inChat || page.name === 'Terminal') ? null : page.name === 'Overview' ? <>
            <section className="command-banner" aria-labelledby="overview-heading">
              <div className="command-copy">
                <h1 id="overview-heading">Overview</h1>
                <p>Draft an instruction or check task status from your local workspace.</p>
                <button className="command-cta" onClick={() => setPage(pages[1])}>
                  {draft ? 'Resume instruction' : 'Open Chat'} <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </div>
              <LogoOrbit />
            </section>
            <div className="overview-panels">
              <section className="launch-panel" aria-labelledby="launch-heading">
                <h2 id="launch-heading">Quick access</h2>
                {[pages[1], pages[6]].map(item => (
                  <button className="launch-row" key={item.name} onClick={() => setPage(item)}>
                    <span className="launch-icon"><item.icon size={18} aria-hidden="true" /></span>
                    <span><strong>{item.name}</strong><small>{item.detail}</small></span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                ))}
              </section>
              <OverviewActivity />
            </div>
          </> : <>
            <div className="work-heading"><h1>{page.name}</h1><p className="muted">{page.detail}</p></div>
            {page.name === 'Settings' && <>
              <section className="launch-panel" aria-label="Workspace tools">
                <h2>Workspace tools</h2>
                {pages.slice(2, 6).map(item => <button className="launch-row" key={item.name} onClick={() => setPage(item)}>
                  <span className="launch-icon"><item.icon size={18} aria-hidden="true" /></span>
                  <span><strong>{item.name}</strong><small>{item.detail}</small></span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>)}
              </section>
            </>}
          </>}
          <div hidden={page.name !== 'Task monitor'}><TaskPlanner /></div>
          <div hidden={page.name !== 'Terminal'}><LocalTerminal /></div>
          <div hidden={page.name !== 'Projects'}><Projects /></div>
          {page.name === 'Activity' && <Activity />}
          <div hidden={!inChat}><AIWorkspace active={inChat} draft={draft} setDraft={setDraft} /></div>
        </div>
      </main>
    </div></AccountGate>
  }

  const showCursorGrid = theme === 'dark' && !reduceMotion
  const cursorGrid = (cellSize: number) => showCursorGrid ? (
    <CursorGrid cellSize={cellSize} radius={125} gridOpacity={0.3} fillOpacity={0.15} clickPulse={false}
      color="#86d8ef" />
  ) : null

  return <div className="site">
    {showCursorGrid && <div className="site-cursor-grid" aria-hidden="true">{cursorGrid(36)}</div>}
    {theme === 'light' && !reduceMotion && <div className="site-aurora" aria-hidden="true">
      <Aurora lightMode colorStops={['#97b5d3', '#b6d3db', '#ead8bb']} amplitude={0.75} blend={0.7}
        height={0.58} speed={0.45} opacity={0.75} layers={2} mouseInteraction={false} intro={false} dpr={1.5} />
    </div>}
    <header className="top">
      <a href="./" aria-label="Lone X home">{brand}</a>
      <nav aria-label="Site">
        <a href="#workspace">Workspace</a>
        <a href="#capabilities">Capabilities</a>
        <a href="#features">Features</a>
        <a href="#download">Download</a>
        {themeButton}
      </nav>
    </header>
    <main className="site-main">
      <section className="hero">
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>
          <p className="eyebrow"><span className="signal" /> WINDOWS AGENT / IN DEVELOPMENT</p>
          <h1 className={reduceMotion ? undefined : 'sr-only'}>Your PC.<br />Your <em>agent.</em></h1>
          {!reduceMotion && <div className="hero-tech" aria-hidden="true">
            <TechText text="Your PC." align="left" fontSize={190} fontWeight={750} letterSpacing={-0.045} sweep={false} draggable={false} clickKick={false} selection={false} accentColor={theme === 'light' ? '#174c99' : '#ffffff'} intro="none" />
            <TechText text="Your agent." className="hero-tech-accent" align="left" fontSize={190} fontWeight={750} letterSpacing={-0.045} sweep={false} draggable={false} clickKick={false} selection={false} accentColor={theme === 'light' ? '#174c99' : '#ffffff'} intro="none" />
          </div>}
          <p className="intro">A Windows workspace for AI-assisted development, task execution, and controlled access to your machine.</p>
          <a className="primary" href="#workspace">Explore the workspace <ArrowRight size={17} /></a>
        </motion.div>
        <LogoOrbit background={cursorGrid(24)} />
      </section>
      <section id="workspace" className="section">
        <p className="eyebrow">01 / DESKTOP WORKSPACE</p>
        <h2>One place to direct the work.</h2>
        <p className="intro">Chat with Raju on your PC, revisit saved conversations, and inspect local files from the same Windows app.</p>
        <div className="preview">
          <header><span className="signal" /> Lone X <span className="muted">Desktop preview</span></header>
          <div><strong>Local chat with Raju</strong><p className="muted">The Windows preview includes its own Ollama runtime and default model.</p>
            <a className="primary" href="#download">Get the Windows preview <ArrowRight size={17} /></a></div>
        </div>
      </section>
      <section id="capabilities" className="section"><p className="eyebrow">02 / CAPABILITIES</p><h2>Designed for your machine.</h2><div className="cards">
        {capabilities.map(({ icon: Icon, title, detail }) => <FlipCard key={title} ariaLabel={title}
          height={192} radius={12} background="var(--surface)" color="var(--text)" shadow={false} tilt={false} draggable={false}
          front={<div className="card feature-face"><Icon aria-hidden="true" /><strong>{title}</strong><span>Flip for details</span></div>}
          back={<div className="card feature-face"><strong>{title}</strong><span>{detail}</span></div>} />)}
      </div></section>
      <section id="features" className="section">
        <p className="eyebrow">03 / AVAILABLE IN THE PREVIEW</p>
        <h2>Features of LoneX</h2>
        <div className="cards">{shippedFeatures.map(({ icon: Icon, title, detail }) => (
          <article className="card" key={title}><Icon size={22} aria-hidden="true" /><strong>{title}</strong><span>{detail}</span></article>
        ))}</div>
      </section>
      <DesktopDownloads />
    </main>
    <footer>Developed By Raju · © {new Date().getFullYear()}</footer>
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
