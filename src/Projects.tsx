import { useState } from 'react'

type Project = {
  name: string
  entries: { name: string; kind: 'File' | 'Folder' | 'Other' }[]
  truncated: boolean
  starter?: boolean
}

type StarterCheck = { name: string; status: 'Passed' | 'Missing' | 'Changed' }

declare global {
  interface Window {
    loneXProjects: {
      open: () => Promise<Project | null>
      preview: () => Promise<{ name: string; text: string } | null>
      saveCopy: (text?: string) => Promise<string | null>
      createStarter: () => Promise<Project | null>
      checkStarter: () => Promise<StarterCheck[] | null>
      repairStarter: () => Promise<StarterCheck[] | null>
      previewStarter: () => Promise<boolean | null>
    }
  }
}

export default function Projects() {
  const [project, setProject] = useState<Project | null>(null)
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null)
  const [editedText, setEditedText] = useState<string>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [checks, setChecks] = useState<StarterCheck[]>([])

  async function open() {
    setPending(true)
    setError('')
    try {
      const selected = await window.loneXProjects.open()
      if (selected) {
        setProject(selected)
        setChecks([])
        setSaved('')
      }
    } catch {
      setError('Could not open the selected folder.')
    } finally {
      setPending(false)
    }
  }

  async function createStarter() {
    setPending(true)
    setError('')
    setSaved('')
    try {
      const created = await window.loneXProjects.createStarter()
      if (created) {
        setProject(created)
        setChecks([])
        setSaved('Created ' + created.name + '. Run the starter checks or open its preview.')
      }
    } catch {
      setError('Could not create the starter. Choose a writable folder.')
    } finally {
      setPending(false)
    }
  }

  async function runStarterAction(action: 'checkStarter' | 'repairStarter' | 'previewStarter') {
    setPending(true)
    setError('')
    setSaved('')
    try {
      const result = await window.loneXProjects[action]()
      if (Array.isArray(result)) setChecks(result)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not complete the starter action.')
    } finally {
      setPending(false)
    }
  }

  async function openPreview() {
    setPending(true)
    setError('')
    try {
      const selected = await window.loneXProjects.preview()
      if (selected) {
        setPreview(selected)
        setEditedText(undefined)
        setSaved('')
      }
    } catch {
      setError('Could not preview this file. Choose a UTF-8 text file up to 128 KB.')
    } finally {
      setPending(false)
    }
  }

  async function saveCopy() {
    setPending(true)
    setError('')
    setSaved('')
    try {
      const name = await window.loneXProjects.saveCopy(editedText)
      if (name) setSaved('Saved ' + name)
    } catch {
      setError('Could not save the copy. Use a new filename and keep edited text within 128 KB.')
    } finally {
      setPending(false)
    }
  }

  return <section className="panel" aria-label="Project folder">
    <button className="provider-button" disabled={pending} onClick={open}>
      {pending ? 'Opening…' : 'Choose project folder'}
    </button>
    <button className="provider-button ml-2" disabled={pending} onClick={openPreview}>Preview text file</button>
    <button className="provider-button ml-2" disabled={pending} onClick={createStarter}>Create HTML starter</button>
    {saved && <p role="status">{saved}</p>}
    {preview && <div className="project-list">
      <h2>{preview.name}</h2>
      <button className="provider-button" disabled={pending} onClick={saveCopy}>{editedText === undefined ? 'Save a copy' : 'Save edited copy'}</button>
      <button className="provider-button ml-2" disabled={pending} onClick={() => {
        setEditedText(editedText === undefined ? preview.text : undefined)
        setSaved('')
        setError('')
      }}>{editedText === undefined ? 'Edit a copy' : 'Discard edits'}</button>
      {editedText !== undefined && <label className="block mt-3">Edited copy
        <textarea spellCheck={false} className="font-mono" value={editedText} disabled={pending}
          onChange={event => setEditedText(event.target.value)} />
      </label>}
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all" aria-label="Original file">{preview.text}</pre>
    </div>}
    {error && <p className="chat-error" role="alert">{error}</p>}
    {project && <div className="project-list">
      <h2>{project.name}</h2>
      {project.entries.length ? <ul>{project.entries.map(entry =>
        <li key={entry.name}><span>{entry.name}</span><small>{entry.kind}</small></li>
      )}</ul> : <p className="muted">This folder is empty.</p>}
      {project.truncated && <small>Showing 500 entries.</small>}
    </div>}
    {project?.starter && <section className="project-list" aria-label="Starter workflow">
      <h2>Starter workflow</h2>
      <p className="muted">This static project runs without dependencies. Checks compare its files with the generated template.</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="provider-button" disabled={pending} onClick={() => void runStarterAction('checkStarter')}>Run checks</button>
        <button className="provider-button" disabled={pending} onClick={() => void runStarterAction('previewStarter')}>Open preview</button>
        {checks.some(check => check.status === 'Missing') && <button className="provider-button" disabled={pending} onClick={() => void runStarterAction('repairStarter')}>Restore missing files</button>}
      </div>
      {checks.length > 0 && <ul aria-label="Starter check results" aria-live="polite">{checks.map(check =>
        <li key={check.name}><span>{check.name}</span><small>{check.status}</small></li>
      )}</ul>}
    </section>}
  </section>
}
