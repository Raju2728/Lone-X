import { useState, type FormEvent } from 'react'
import LatticeLoader from './react-bits/LatticeLoader'

type Plan = NonNullable<Awaited<ReturnType<Window['loneXAI']['plan']>>>

export default function TaskPlanner() {
  const [task, setTask] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function generate(event: FormEvent) {
    event.preventDefault()
    if (pending || !task.trim()) return
    setPending(true)
    setPlan(null)
    setError('')
    try {
      setPlan(await window.loneXAI.plan(task))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not generate a plan.')
    } finally {
      setPending(false)
    }
  }

  return <section className="panel task-planner" aria-label="Task planner">
    <form onSubmit={event => void generate(event)}>
      <label htmlFor="planning-task">Task to plan</label>
      <textarea id="planning-task" value={task} maxLength={2000} disabled={pending}
        onChange={event => setTask(event.target.value)} placeholder="What would you like to accomplish?" />
      <button className="provider-button" disabled={pending || !task.trim()}>Draft plan</button>
      {pending && <button className="provider-button ml-2" type="button" onClick={() => void window.loneXAI.stop().catch(() => setError('Could not stop planning.'))}>Stop planning</button>}
    </form>
    {pending && <LatticeLoader label="Drafting a plan" color="var(--accent)" />}
    {error && <p className="chat-error" role="alert">{error}</p>}
    {plan && <section className="project-list" aria-label="Proposed plan">
      <h2>Proposed plan</h2>
      <p>{plan.summary}</p>
      <ol>{plan.steps.map((step, index) => <li key={index}>
        <div><strong>{index + 1}. {step.action}</strong><p className="muted">Verify: {step.verify}</p></div>
      </li>)}</ol>
    </section>}
  </section>
}
