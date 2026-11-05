import { useState } from 'react'

type Project = {
  name: string
  entries: { name: string; kind: 'File' | 'Folder' | 'Other' }[]
  truncated: boolean
  starter?: boolean
}

type StarterCheck = { name: string; status: 'Passed' | 'Missing' | 'Changed' }
type StarterReview = { name: string; current: string; expected: string }
type FilePreview = { name: string; text: string; canApply: boolean }
type NpmAction = 'install' | 'start' | 'test'
type NpmCommand = { action: NpmAction; command: string; script: string | null }
type NpmResult = { outcome: string; code: number | null; output: string }
type FixProposal = { diagnosis: string; replacement: string | null }
const npmLabels: Record<NpmAction, string> = { install: 'Install dependencies', start: 'Run start script', test: 'Run tests' }

declare global {
  interface Window {
    loneXProjects: {
      open: () => Promise<Project | null>
      preview: () => Promise<FilePreview | null>
      saveCopy: (text?: string) => Promise<string | null>
      applySourceEdit: (text: string) => Promise<string | null>
      createStarter: () => Promise<Project | null>
      checkStarter: () => Promise<StarterCheck[] | null>
      repairStarter: () => Promise<StarterCheck[] | null>
      reviewStarterFile: (name: string) => Promise<StarterReview | null>
      saveStarterRepair: (name: string) => Promise<string | null>
      applyStarterRepair: (name: string) => Promise<{ backup: string; checks: StarterCheck[] } | null>
      previewStarter: () => Promise<boolean | null>
      inspectNpm: () => Promise<NpmCommand[] | null>
      proposeFix: () => Promise<FixProposal | null>
      runNpm: (action: NpmAction) => Promise<NpmResult | null>
      stopNpm: () => Promise<void>
      onNpmOutput: (callback: (chunk: string) => void) => () => void
    }
  }
}

export default function Projects() {
  const [project, setProject] = useState<Project | null>(null)
  const [preview, setPreview] = useState<FilePreview | null>(null)
  const [editedText, setEditedText] = useState<string>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [checks, setChecks] = useState<StarterCheck[]>([])
  const [review, setReview] = useState<StarterReview | null>(null)
  const [npmCommands, setNpmCommands] = useState<NpmCommand[] | null>(null)
  const [npmRunning, setNpmRunning] = useState(false)
  const [npmOutput, setNpmOutput] = useState('')
  const [npmResult, setNpmResult] = useState<NpmResult | null>(null)
  const [failedTest, setFailedTest] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnosis, setDiagnosis] = useState('')

  async function open() {
    setPending(true)
    setError('')
    try {
      const selected = await window.loneXProjects.open()
      if (selected) {
        setProject(selected)
        setPreview(null)
        setEditedText(undefined)
        setChecks([])
        setReview(null)
        setNpmCommands(null)
        setNpmOutput('')
        setNpmResult(null)
        setFailedTest(false)
        setDiagnosis('')
        setSaved('')
      }
    } catch {
      setError('Could not open the selected folder.')
    } finally {
      setPending(false)
    }
  }

  async function inspectProjectCommands() {
    setPending(true)
    setError('')
    try {
      setNpmCommands(await window.loneXProjects.inspectNpm())
    } catch (failure) {
      setNpmCommands(null)
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not inspect project commands.')
    } finally {
      setPending(false)
    }
  }

  async function runProjectCommand(action: NpmAction) {
    setPending(true)
    setNpmRunning(true)
    setNpmOutput('')
    setNpmResult(null)
    setError('')
    const unsubscribe = window.loneXProjects.onNpmOutput(chunk => setNpmOutput(previous => (previous + chunk).slice(-64000)))
    try {
      const result = await window.loneXProjects.runNpm(action)
      if (result) {
        setNpmResult(result)
        setNpmOutput(result.output)
        if (action === 'test') {
          setFailedTest(result.outcome === 'Failed' && !!result.output.trim())
          setDiagnosis('')
        }
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not run the project command.')
    } finally {
      unsubscribe()
      setNpmRunning(false)
      setPending(false)
    }
  }

  async function proposeFix() {
    setPending(true)
    setDiagnosing(true)
    setDiagnosis('')
    setError('')
    try {
      const proposal = await window.loneXProjects.proposeFix()
      if (proposal) {
        setDiagnosis(proposal.diagnosis + (proposal.replacement === null ? ' No matching edit was proposed.' : ''))
        if (proposal.replacement !== null) setEditedText(proposal.replacement)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not diagnose the failed test.')
    } finally {
      setDiagnosing(false)
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
        setFailedTest(false)
        setDiagnosis('')
        setPreview(null)
        setEditedText(undefined)
        setChecks([])
        setReview(null)
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
      if (Array.isArray(result)) {
        setChecks(result)
        setReview(null)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not complete the starter action.')
    } finally {
      setPending(false)
    }
  }

  async function reviewStarterFile(name: string, action: 'review' | 'copy' | 'restore' = 'review') {
    setPending(true)
    setSaved('')
    setError('')
    try {
      if (action === 'restore') {
        const result = await window.loneXProjects.applyStarterRepair(name)
        if (result) {
          setChecks(result.checks)
          setReview(null)
          setSaved('Restored ' + name + '. Original backed up to ' + result.backup)
        }
      } else if (action === 'copy') {
        const savedName = await window.loneXProjects.saveStarterRepair(name)
        if (savedName) setSaved('Saved repaired copy as ' + savedName)
      } else {
        setReview(await window.loneXProjects.reviewStarterFile(name))
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not complete the starter repair action.')
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
        setDiagnosis('')
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

  async function applyEdit() {
    if (!preview?.canApply || editedText === undefined) return
    setPending(true)
    setError('')
    setSaved('')
    try {
      const backup = await window.loneXProjects.applySourceEdit(editedText)
      if (backup) {
        setPreview({ ...preview, text: editedText })
        setEditedText(undefined)
        setSaved('Applied edit. Original backed up to ' + backup)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not apply the edit.')
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
      {preview.canApply && failedTest && editedText === undefined && <button className="provider-button mr-2" disabled={pending} onClick={() => void proposeFix()}>{diagnosing ? 'Diagnosing…' : 'Propose fix with Ollama'}</button>}
      {diagnosing && <button className="provider-button mr-2" onClick={() => void window.loneXProjects.stopNpm().catch(() => setError('Could not stop diagnosis.'))}>Stop diagnosis</button>}
      {diagnosis && <p className="muted mt-2" role="status">{diagnosis}</p>}
      <button className="provider-button" disabled={pending} onClick={saveCopy}>{editedText === undefined ? 'Save a copy' : 'Save edited copy'}</button>
      <button className="provider-button ml-2" disabled={pending} onClick={() => {
        setEditedText(editedText === undefined ? preview.text : undefined)
        setSaved('')
        setError('')
      }}>{editedText === undefined ? 'Edit a copy' : 'Discard edits'}</button>
      {preview.canApply && editedText !== undefined && <button className="provider-button ml-2" disabled={pending || editedText === preview.text} onClick={() => void applyEdit()}>Apply edit with backup</button>}
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
    {project && !project.starter && <section className="project-list" aria-label="Project commands">
      <h2>Project commands</h2>
      <p className="muted">Inspect a trusted npm project, then approve each command before it runs.</p>
      {failedTest && <p className="muted">Preview the source file related to this failure to request a local fix proposal.</p>}
      <button className="provider-button mt-3" disabled={pending} onClick={() => void inspectProjectCommands()}>Inspect npm commands</button>
      {npmCommands?.length ? <ul>{npmCommands.map(item => <li key={item.action}>
        <div className="min-w-0"><strong>{npmLabels[item.action]}</strong>
          <p className="break-all"><code>{item.command}</code></p>
          {item.script && <small className="break-all">{item.script}</small>}
        </div>
        <button className="provider-button" disabled={pending} onClick={() => void runProjectCommand(item.action)}>Review and run</button>
      </li>)}</ul> : npmCommands && <p className="muted">No supported commands found. Installation requires package-lock.json.</p>}
      {npmRunning && <button className="provider-button mt-3" onClick={() => void window.loneXProjects.stopNpm().catch(() => setError('Could not stop the command.'))}>Stop command</button>}
      {npmResult && <p role="status">{npmResult.outcome}{npmResult.code === null ? '' : ' · Exit code ' + npmResult.code}</p>}
      {npmOutput && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all" aria-label="Project command output">{npmOutput}</pre>}
    </section>}
    {project?.starter && <section className="project-list" aria-label="Starter workflow">
      <h2>Starter workflow</h2>
      <p className="muted">This static project runs without dependencies. Checks compare its files with the generated template.</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="provider-button" disabled={pending} onClick={() => void runStarterAction('checkStarter')}>Run checks</button>
        <button className="provider-button" disabled={pending} onClick={() => void runStarterAction('previewStarter')}>Open preview</button>
        {checks.some(check => check.status === 'Missing') && <button className="provider-button" disabled={pending} onClick={() => void runStarterAction('repairStarter')}>Restore missing files</button>}
      </div>
      {checks.length > 0 && <ul aria-label="Starter check results" aria-live="polite">{checks.map(check =>
        <li key={check.name}><span>{check.name}</span><small>{check.status}</small>
          {check.status === 'Changed' && <button className="provider-button" disabled={pending} onClick={() => void reviewStarterFile(check.name)}>Review {check.name}</button>}
        </li>
      )}</ul>}
      {review && <section className="mt-4" aria-label={'Review ' + review.name}>
        <h3>{review.name}</h3>
        <div className="overview-panels">
          <div className="min-w-0"><strong>Current file</strong><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{review.current}</pre></div>
          <div className="min-w-0"><strong>Starter template</strong><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">{review.expected}</pre></div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button className="provider-button" disabled={pending} onClick={() => void reviewStarterFile(review.name, 'copy')}>Save repaired copy</button>
          <button className="provider-button" disabled={pending} onClick={() => void reviewStarterFile(review.name, 'restore')}>Restore template with backup</button>
        </div>
      </section>}
    </section>}
  </section>
}
