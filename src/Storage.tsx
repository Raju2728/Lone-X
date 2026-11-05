import { useEffect, useState } from 'react'

type Scan = { folder: string; bytes: number; files: number; entries: number; skipped: number; partial: boolean; capacity: number; free: number; largest: { id: string; name: string; bytes: number; removable: boolean }[] }
declare global {
  interface Window {
    loneXStorage: { scan: () => Promise<Scan | null>; stop: () => Promise<void>; trash: (id: string) => Promise<boolean> }
  }
}
const size = (bytes: number) => bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(2) + ' GB' : bytes >= 1024 ** 2 ? (bytes / 1024 ** 2).toFixed(1) + ' MB' : bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B'
const readable = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not complete the storage request.'

export default function Storage({ openProjects }: { openProjects: () => void }) {
  const [scan, setScan] = useState<Scan>()
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => () => { void window.loneXStorage.stop().catch(() => {}) }, [])

  async function review() {
    setBusy(true); setError(''); setMessage(''); setScan(undefined)
    try {
      const result = await window.loneXStorage.scan()
      if (result) setScan(result)
      else setMessage('Scan cancelled.')
    } catch (failure) { setError(readable(failure)) }
    finally { setBusy(false) }
  }
  async function trash(id: string) {
    setRemoving(true); setError(''); setMessage('')
    try {
      if (await window.loneXStorage.trash(id)) {
        setMessage('File moved to the Recycle Bin. Scan again to refresh storage totals.')
        setScan(value => value && ({ ...value, largest: value.largest.filter(item => item.id !== id) }))
      }
    } catch (failure) { setError(readable(failure)) }
    finally { setRemoving(false) }
  }
  return <section className="launch-panel" aria-label="Storage and files">
    <h2>Storage &amp; files</h2>
    <div className="p-4">
      <p className="muted">Choose a folder to inspect its storage use. Review a file before moving it to the Windows Recycle Bin.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="provider-button" disabled={busy || removing} onClick={() => void review()}>Choose folder and scan</button>
        {busy && <button className="provider-button" onClick={() => void window.loneXStorage.stop().catch(failure => setError(readable(failure)))}>Stop scan</button>}
        <button className="provider-button" onClick={openProjects}>Read or edit files in Projects</button>
      </div>
      {busy && <p role="status">Reviewing selected folder…</p>}
      {message && <p className="mt-3" role="status">{message}</p>}
      {error && <p className="chat-error" role="alert">{error}</p>}
      {scan && <>
        <p className="break-all mt-4"><strong>{scan.folder}</strong></p>
        <p className="muted">Drive: {size(scan.free)} free of {size(scan.capacity)} · Folder scan: {size(scan.bytes)} across {scan.files.toLocaleString()} files.</p>
        <p className="muted">{scan.partial ? 'Partial scan: reached the 5,000-entry limit. Choose a smaller folder for a complete review.' : 'Folder scan complete.'}{scan.skipped > 0 && ` ${scan.skipped} inaccessible entries or links skipped.`}</p>
        <h3 className="mt-4">Largest files</h3>
        {!scan.largest.length && <p>No readable files found.</p>}
        <ul>{scan.largest.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] py-3">
          <div className="min-w-0 flex-1"><strong className="break-all">{item.name}</strong><small className="block">{size(item.bytes)}{!item.removable && ' · Protected application or system file'}</small></div>
          <button className="provider-button" disabled={removing || !item.removable} onClick={() => void trash(item.id)}>Review removal</button>
        </li>)}</ul>
      </>}
    </div>
  </section>
}
