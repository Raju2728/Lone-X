import { useEffect, useState } from 'react'

type Resource = { id: string; version: string; filename: string; size: number; sha256: string }
type ResourceList = { configured: boolean; resources: Resource[] }

declare global {
  interface Window {
    loneXResources: {
      list: () => Promise<ResourceList>
      download: (input: Pick<Resource, 'id' | 'version'>) => Promise<string | null>
      stop: () => Promise<void>
    }
  }
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    : 'The resource request failed.'
}

export default function Resources() {
  const [catalog, setCatalog] = useState<ResourceList>()
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<Resource>()
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const api = window.loneXResources

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError('')
    api.list().then(value => { if (mounted) setCatalog(value) }).catch(failure => {
      if (mounted) {
        setCatalog(undefined)
        setError(errorText(failure))
      }
    }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [api, refresh])

  useEffect(() => () => { void api.stop().catch(() => {}) }, [api])

  async function download(resource: Resource) {
    setDownloading(resource)
    setSaved('')
    setError('')
    try {
      const destination = await api.download({ id: resource.id, version: resource.version })
      if (destination) setSaved('Verified and saved to ' + destination)
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setDownloading(undefined)
    }
  }

  return <section className="launch-panel" aria-label="Resource catalog">
    <h2>Resource catalog</h2>
    <div className="px-4 pb-4">
      <button className="provider-button" disabled={loading || !!downloading} onClick={() => setRefresh(value => value + 1)}>Refresh catalog</button>
      {loading && <p role="status">Loading resources…</p>}
      {!loading && catalog && !catalog.configured && <p role="status">The resource service is not configured on this PC.</p>}
      {!loading && catalog?.configured && !catalog.resources.length && <p role="status">No resources have been registered yet.</p>}
      {error && <p className="chat-error" role="alert">{error}</p>}
      {downloading && <div>
        <p role="status">Downloading and verifying {downloading.filename}…</p>
        <button className="provider-button" onClick={() => void api.stop().catch(failure => setError(errorText(failure)))}>Cancel download</button>
      </div>}
      {saved && <p className="break-all" role="status">{saved}</p>}
    </div>
    {catalog?.resources.map(resource => <div className="launch-row" key={resource.id + ':' + resource.version}>
      <span className="launch-icon" aria-hidden="true">↓</span>
      <div className="min-w-0 break-all">
        <strong>{resource.filename}</strong>
        <small>{resource.id} · {resource.version} · {resource.size.toLocaleString()} bytes</small>
      </div>
      <button className="provider-button" disabled={!!downloading || loading} onClick={() => void download(resource)}>Download</button>
    </div>)}
  </section>
}
