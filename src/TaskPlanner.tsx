import { useState, type FormEvent } from 'react'
import LatticeLoader from './react-bits/LatticeLoader'

type Plan = NonNullable<Awaited<ReturnType<Window['loneXAI']['plan']>>>
type Tool = NonNullable<Plan['steps'][number]['tool']>

const toolLabels: Record<Tool, string> = {
  version: 'PowerShell version',
  memory: 'Available memory',
  'get-location': 'Current working directory'
}

export default function TaskPlanner() {
  const [task, setTask] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [runningStep, setRunningStep] = useState<number | null>(null)
  const [results, setResults] = useState<Record<number, { outcome: string; output: string }>>({})

  async function generate(event: FormEvent) {
    event.preventDefault()
    if (pending || runningStep !== null || !task.trim()) return
    setPending(true)
    setPlan(null)
    setResults({})
    setError('')
    try {
      setPlan(await window.loneXAI.plan(task))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not generate a plan.')
    } finally {
      setPending(false)
    }
  }

  async function runTool(index: number, tool: Tool) {
    if (pending || runningStep !== null || !window.confirm('Run read-only diagnostic: ' + toolLabels[tool] + '?')) return
    setError('')
    setRunningStep(index)
    try {
      const result = await window.loneXTerminal.run(tool)
      setResults(previous => ({ ...previous, [index]: result }))
    } catch {
      setError('Could not run the selected diagnostic.')
    } finally {
      setRunningStep(null)
    }
  }

  return <section className="panel task-planner" aria-label="Task planner">
    <form onSubmit={event => void generate(event)}>
      <label htmlFor="planning-task">Task to plan</label>
      <textarea id="planning-task" value={task} maxLength={2000} disabled={pending}
        onChange={event => setTask(event.target.value)} placeholder="What would you like to accomplish?" />
      <button className="provider-button" disabled={pending || runningStep !== null || !task.trim()}>Draft plan</button>
      {pending && <button className="provider-button ml-2" type="button" onClick={() => void window.loneXAI.stop().catch(() => setError('Could not stop planning.'))}>Stop planning</button>}
    </form>
    {pending && <LatticeLoader label="Drafting a plan" color="var(--accent)" />}
    {error && <p className="chat-error" role="alert">{error}</p>}
    {plan && <section className="project-list" aria-label="Proposed plan">
      <h2>Proposed plan</h2>
      <p>{plan.summary}</p>
      <ol>{plan.steps.map((step, index) => <li key={index}>
        <div>
          <strong>{index + 1}. {step.action}</strong><p className="muted">Verify: {step.verify}</p>
          {step.tool && <button className="provider-button mt-2" type="button" disabled={runningStep !== null}
            onClick={() => { if (step.tool) void runTool(index, step.tool) }}>
            {runningStep === index ? 'Running…' : 'Run ' + toolLabels[step.tool]}
          </button>}
          {runningStep === index && <button className="provider-button ml-2" type="button"
            onClick={() => void window.loneXTerminal.stop().catch(() => setError('Could not stop the diagnostic.'))}>Stop</button>}
          {results[index] && <div role="status"><span>{results[index].outcome}</span>
            {results[index].output && <pre className="terminal">{results[index].output}</pre>}</div>}
        </div>
      </li>)}</ol>
    </section>}
  </section>
}
