import { useState } from 'react'

type Project = {
  name: string
  entries: { name: string; kind: 'File' | 'Folder' | 'Other' }[]
  truncated: boolean
}

declare global {
  interface Window {
    loneXProjects: { open: () => Promise<Project | null>; preview: () => Promise<{ name: string; text: string } | null> }
  }
}

export default function Projects() {
  const [project, setProject] = useState<Project | null>(null)
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function open() {
    setPending(true)
    setError('')
    try {
      const selected = await window.loneXProjects.open()
      if (selected) setProject(selected)
    } catch {
      setError('Could not open the selected folder.')
    } finally {
      setPending(false)
    }
  }

  async function openPreview() {
    setPending(true)
    setError('')
    try {
      const selected = await window.loneXProjects.preview()
      if (selected) setPreview(selected)
    } catch {
      setError('Could not preview this file. Choose a UTF-8 text file up to 128 KB.')
    } finally {
      setPending(false)
    }
  }

  return <section className="panel" aria-label="Project folder">
    <button className="provider-button" disabled={pending} onClick={open}>
      {pending ? 'Opening…' : 'Choose project folder'}
    </button>
    <button className="provider-button ml-2" disabled={pending} onClick={openPreview}>Preview text file</button>
    {preview && <div className="project-list">
      <h2>{preview.name}</h2>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all">{preview.text}</pre>
    </div>}
    {error && <p className="chat-error" role="alert">{error}</p>}
    {project && <div className="project-list">
      <h2>{project.name}</h2>
      {project.entries.length ? <ul>{project.entries.map(entry =>
        <li key={entry.name}><span>{entry.name}</span><small>{entry.kind}</small></li>
      )}</ul> : <p className="muted">This folder is empty.</p>}
      {project.truncated && <small>Showing 500 entries.</small>}
    </div>}
  </section>
}
