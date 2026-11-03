import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDown, Download, ArrowRight, ArrowUpRight, Boxes, Folder, History, LayoutDashboard, ListChecks, MessageSquare, Moon, Settings, ShieldCheck, Sun, Terminal } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import GlareHover from './react-bits/GlareHover'
import FlipCard from './react-bits/FlipCard'
import LatticeLoader from './react-bits/LatticeLoader'
import SquishSwitch from './react-bits/SquishSwitch'
import AIWorkspace from './AIWorkspace'
import Projects from './Projects'
import TechText from './react-bits/TechText'
import './style.css'


const logo = './logo.png'
const downloadUrl = import.meta.env.VITE_WINDOWS_DOWNLOAD_URL || (__LOCAL_WINDOWS_DOWNLOAD__ ? './downloads/Lone-X-Windows.zip' : 'https://github.com/Raju2728/Lone-X/releases/download/desktop-preview/Lone-X-Windows.zip')
const desktop = location.protocol === 'file:'
const pages = [
  { name: 'Overview', icon: LayoutDashboard, detail: 'Your Windows agent workspace at a glance.' },
  { name: 'AI workspace', icon: MessageSquare, detail: 'Draft an instruction for your agent.' },
  { name: 'Projects', icon: Folder, detail: 'Choose a local folder to view its files.' },
  { name: 'Task monitor', icon: ListChecks, detail: 'No tasks are running. Task execution becomes available with the local agent.' },
  { name: 'Terminal', icon: Terminal, detail: 'PowerShell execution will be available after the secure local agent is connected.' },
  { name: 'Activity', icon: History, detail: 'Execution history will appear here once the local agent runs tasks.' },
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

function App() {
  const [logoFlipped, setLogoFlipped] = useState(false)
  const [logoStatus, setLogoStatus] = useState<'working' | 'done' | 'error'>('working')
  const [theme, setTheme] = usePreference('lone-x-theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  const [draft, setDraft] = usePreference('lone-x-draft', '')
  const [page, setPage] = useState<(typeof pages)[number]>(pages[0])
  const reduceMotion = useReducedMotion()
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const themeButton = <SquishSwitch ariaLabel="Light theme" thumbContent={theme === 'light' ? <Sun size={14} /> : <Moon size={14} />} checked={theme === 'light'} onChange={checked => setTheme(checked ? 'light' : 'dark')} width={48} height={28} trackColor="var(--line)" trackOnColor="var(--accent)" thumbColor="var(--text)" thumbOnColor="var(--button-text)" />
  const brand = <span className="brand"><img src={logo} alt="" /> Lone X</span>

  if (desktop) {
    return <div className="shell">
      <aside className="rail">
        <div className="rail-brand">{brand}<span>DESKTOP AGENT</span></div>
        <p className="eyebrow">WORKSPACE</p>
        <nav aria-label="Workspace">{pages.map(item => <button key={item.name} aria-current={page === item ? 'page' : undefined} onClick={() => setPage(item)}><item.icon size={17} aria-hidden="true" />{item.name}</button>)}</nav>
        <div className="rail-status"><ShieldCheck size={16} aria-hidden="true" /><div><strong>Local workspace</strong><small>Windows desktop</small></div></div>
      </aside>
      <main className="work">
        <header className="work-bar">
          <span className="work-path">Workspace <span aria-hidden="true">/</span> <strong>{page.name}</strong></span>
          {themeButton}
        </header>
        <div className="work-content">
          {page.name === 'Overview' ? <>
            <section className="command-banner" aria-labelledby="overview-heading">
              <div className="command-copy">
                <p className="eyebrow">LONE X / WINDOWS WORKSPACE</p>
                <h1 id="overview-heading">Overview</h1>
                <p>Draft an instruction or check task status from your local workspace.</p>
                <button className="command-cta" onClick={() => setPage(pages[1])}>
                  {draft ? 'Resume instruction' : 'Open AI workspace'} <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="command-art" aria-hidden="true">
                <div className="command-orbit"><img src={logo} alt="" /></div>
                <span className="command-coordinate">LX / 01</span>
              </div>
            </section>
            <section className="launch-panel" aria-labelledby="launch-heading">
              <h2 id="launch-heading">Quick access</h2>
              {[pages[2], pages[3], pages[4]].map(item => (
                <button className="launch-row" key={item.name} onClick={() => setPage(item)}>
                  <span className="launch-icon"><item.icon size={18} aria-hidden="true" /></span>
                  <span><strong>{item.name}</strong><small>{item.detail}</small></span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ))}
            </section>
          </> : <>
            <div className="work-heading"><p className="eyebrow">LONE X / WORKSPACE</p><h1>{page.name}</h1><p className="muted">{page.detail}</p></div>
            {page.name === 'Terminal' && <div className="panel terminal-panel"><div><Terminal size={16} aria-hidden="true" /> PowerShell</div><pre className="terminal" aria-label="Terminal status">PS &gt; Waiting for local execution support</pre></div>}
            {page.name === 'Settings' && <div className="panel settings"><span>Appearance</span>{themeButton}</div>}
          </>}
          <div hidden={page.name !== 'Projects'}><Projects /></div>
          <div hidden={page.name !== 'AI workspace'}><AIWorkspace draft={draft} setDraft={setDraft} /></div>
        </div>
      </main>
    </div>
  }

  return <div className="site">
    <header className="top"><a href="./" aria-label="Lone X home">{brand}</a><nav aria-label="Site"><a href="#workspace">Workspace</a><a href="#capabilities">Capabilities</a><a href="#download">Download</a>{themeButton}</nav></header>
    <main>
      <section className="hero">
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>
          <p className="eyebrow"><span className="signal" /> WINDOWS AGENT / IN DEVELOPMENT</p>
          <h1 className={reduceMotion ? undefined : 'sr-only'}>Your PC.<br />Your <em>agent.</em></h1>
          {!reduceMotion && <div className="hero-tech" aria-hidden="true">
            <TechText text="Your PC." align="left" fontSize={190} fontWeight={750} letterSpacing={-0.045} sweep={false} draggable={false} clickKick={false} selection={false} accentColor={theme === 'light' ? '#174c99' : '#ffffff'} intro="none" />
            <TechText text="Your agent." className="hero-tech-accent" align="left" fontSize={190} fontWeight={750} letterSpacing={-0.045} sweep={false} draggable={false} clickKick={false} selection={false} accentColor={theme === 'light' ? '#174c99' : '#ffffff'} intro="none" />
          </div>}
          <p className="intro">A Windows workspace for AI-assisted development, task execution, and controlled access to your machine.</p>
          <a className="primary" href="#workspace">Explore the workspace <ArrowDown size={17} /></a>
        </motion.div>
        <div className="mark"
          onPointerEnter={event => { if (event.pointerType === 'mouse') setLogoFlipped(true) }}
          onPointerLeave={event => { if (event.pointerType === 'mouse') setLogoFlipped(false) }}>
          <FlipCard className="hero-logo-card" flipped={logoFlipped} onFlipChange={setLogoFlipped}
            ariaLabel="Lone X application purpose" draggable={false} tilt={false} shadow={false} glare={false}
            radius={0} background="var(--surface)" color="var(--text)"
            front={<>
              <GlareHover width="100%" borderRadius="0" glareColor="#8feaff" glareOpacity={0.24} rimGlint={false}>
                <img src={logo} alt="Lone X metallic blue monogram" width={1254} height={1254} onLoad={() => setLogoStatus('done')} onError={() => setLogoStatus('error')} />
              </GlareHover>
              <span className="mark-label">{logoStatus === 'done' ? 'LONE X' : <LatticeLoader status={logoStatus} label="Loading logo" errorLabel="Logo unavailable" color="#8feaff" showTimer={false} />}</span>
            </>}
            back={<div className="logo-purpose">
              <span className="eyebrow">WHAT LONE X IS FOR</span>
              <strong>AI assistance for work on your PC.</strong>
              <p>Lone X is a Windows workspace for planning development tasks and carrying them out with controlled access to your files, tools, and apps.</p>
              <small>AI and PC execution are in development.</small>
            </div>} />
        </div>
      </section>
      <section id="workspace" className="section"><p className="eyebrow">01 / DESKTOP WORKSPACE</p><h2>One place to direct the work.</h2>
        <div className="preview"><header><span className="signal" /> Lone X <span className="muted">Desktop preview</span></header><div><strong>AI workspace</strong><p className="muted">Draft an instruction, then follow task progress and review tool activity as execution features roll out.</p><div className="preview-field">Describe what you want to do…</div></div></div>
      </section>
      <section id="capabilities" className="section"><p className="eyebrow">02 / PRODUCT ROADMAP</p><h2>Designed for your machine.</h2><div className="cards">
        {capabilities.map(({ icon: Icon, title, detail }) => <FlipCard key={title} ariaLabel={title}
          height={192} radius={12} background="var(--surface)" color="var(--text)" shadow={false} tilt={false} draggable={false}
          front={<div className="card feature-face"><Icon aria-hidden="true" /><strong>{title}</strong><span>Flip for details</span></div>}
          back={<div className="card feature-face"><strong>{title}</strong><span>{detail}</span></div>} />)}
      </div></section>
      <section id="download" className="section">
        <p className="eyebrow">03 / WINDOWS DESKTOP</p>
        <h2>Download Lone X</h2>
        <p className="muted">Try the desktop preview on Windows x64. Extract the ZIP and open Lone X.exe.</p>
        {downloadUrl ? <a className="primary" href={downloadUrl}><Download size={17} aria-hidden="true" /> Download for Windows</a> : <p className="muted">The Windows download will appear here once the preview is published.</p>}
      </section>
    </main>
    <footer>Developed By Raju · © {new Date().getFullYear()}</footer>
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
