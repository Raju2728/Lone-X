import { useEffect, useRef, useState } from 'react'
import { Cpu } from 'lucide-react'
import { chatModels, type ModelInventoryItem, type ModelProgress } from './modelCatalog'

function message(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : 'The model operation failed.'
}

export default function LocalModels() {
  const [inventory, setInventory] = useState<ModelInventoryItem[]>()
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [download, setDownload] = useState<string>()
  const [progress, setProgress] = useState<ModelProgress>()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const running = useRef<string | undefined>(undefined)
  const api = window.loneXAI

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    api.modelInventory().then(models => {
      if (mounted) setInventory(models)
    }).catch(failure => {
      if (mounted) {
        setInventory(undefined)
        setError(message(failure))
      }
    }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [api, refresh])

  useEffect(() => {
    const unsubscribe = api.onModelProgress(update => {
      if (running.current === update.model) setProgress(update)
    })
    return () => {
      unsubscribe()
      if (running.current) void api.stopModel().catch(() => {})
    }
  }, [api])

  async function install(model: string, name: string) {
    if (running.current) return
    running.current = model
    setDownload(model)
    setProgress(undefined)
    setNotice('')
    setError('')
    try {
      const installed = await api.installModel(model)
      if (installed) setInventory(await api.modelInventory())
      setNotice(installed ? name + ' is installed and ready.' : 'Download cancelled.')
    } catch (failure) {
      setError(message(failure))
    } finally {
      running.current = undefined
      setDownload(undefined)
    }
  }

  return <section className="launch-panel" aria-label="Local model manager">
    <h2>Ollama model library</h2>
    <div className="px-4 pb-4">
      <button className="provider-button" disabled={loading || !!download} onClick={() => setRefresh(value => value + 1)}>Refresh models</button>
      <p className="muted" role="status">{loading ? 'Checking Ollama…' : inventory ? 'Ollama is running on this PC.' : 'Ollama is unavailable.'}</p>
      {notice && <p role="status">{notice}</p>}
      {error && <p className="chat-error" role="alert">{error}</p>}
    </div>
    {chatModels.map(model => {
      const installed = inventory?.find(item => item.name === model.key)
      const size = installed?.size
      const downloading = download === model.key
      return <div className="launch-row" key={model.key}>
        <span className="launch-icon"><Cpu size={16} aria-hidden="true" /></span>
        <div className="min-w-0">
          <strong>{model.name}</strong>
          <small>{model.detail}</small>
          <small>{downloading ? progress?.status ?? 'Starting download…' : installed
            ? 'Installed' + (size ? ' · ' + Math.round(size / 1_000_000).toLocaleString() + ' MB' : '')
            : inventory ? 'Download available' : 'Installation status unavailable'}</small>
          {downloading && progress?.percent != null && <progress value={progress.percent} max={100} aria-label="Current model file download progress" />}
        </div>
        {downloading
          ? <button className="provider-button" onClick={() => void api.stopModel().catch(failure => setError(message(failure)))}>Cancel download</button>
          : !installed && <button className="provider-button" disabled={!inventory || loading || !!download} onClick={() => void install(model.key, model.name)}>Download</button>}
      </div>
    })}
  </section>
}
