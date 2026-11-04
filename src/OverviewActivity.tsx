import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'

export type Usage = { elapsedMs: number; tokens: number; completed: number; version: string }
const tokenFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })

function formatElapsed(elapsedMs: number) {
  const seconds = Math.floor(elapsedMs / 1000)
  if (elapsedMs > 0 && seconds === 0) return '<1 sec'
  if (seconds < 60) return seconds + ' sec'
  if (seconds < 3600) return Math.floor(seconds / 60) + ' min ' + seconds % 60 + ' sec'
  return Math.floor(seconds / 3600) + ' hr ' + Math.floor(seconds % 3600 / 60) + ' min'
}

export default function OverviewActivity() {
  const [usage, setUsage] = useState<Usage>()
  const [models, setModels] = useState<string[]>()
  const [modelsUnavailable, setModelsUnavailable] = useState(false)
  const [update, setUpdate] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const api = window.loneXAI
    api.overview().then(value => { if (mounted) setUsage(value) }).catch(() => {})
    api.models().then(value => { if (mounted) setModels(value) }).catch(() => { if (mounted) setModelsUnavailable(true) })
    const refreshUpdate = () => {
      api.overviewUpdate().then(value => { if (mounted) setUpdate(value) }).catch(() => {})
    }
    refreshUpdate()
    const interval = window.setInterval(refreshUpdate, 15 * 60 * 1000)
    return () => { mounted = false; window.clearInterval(interval) }
  }, [])

  return <section className="launch-panel overview-activity" aria-labelledby="overview-activity-title">
    <h2 id="overview-activity-title">Activity summary</h2>
    <dl>
      <div><dt>Time spent</dt><dd>{usage ? formatElapsed(usage.elapsedMs) : '—'}</dd><small>Processing completed chats</small></div>
      <div><dt>Tokens used</dt><dd title={usage?.tokens.toLocaleString()}>{usage ? tokenFormat.format(usage.tokens) : '—'}</dd><small>Ollama input and output</small></div>
      <div><dt>Work done</dt><dd>{usage?.completed.toLocaleString() ?? '—'}</dd><small>Completed chat replies</small></div>
      <div><dt>Application version</dt><dd>{usage?.version ?? '—'}</dd></div>
      <div className="overview-models"><dt>Models available</dt><dd>
        {models?.length ? <ul>{models.map(model => <li key={model}>{model}</li>)}</ul>
          : models ? 'No models installed' : modelsUnavailable ? 'Ollama unavailable' : 'Checking Ollama…'}
      </dd></div>
    </dl>
    {update && <p className="overview-update" role="status"><Bell size={16} aria-hidden="true" /><span>Update available · Build {update}. Use <code>LoneX -update</code> in Terminal.</span></p>}
  </section>
}
