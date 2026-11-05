import { useEffect, useState, type FormEvent } from 'react'
import policy from '../desktop/legal-documents.json'

export type LegalDocument = keyof typeof policy.documents
type Versions = Record<LegalDocument, string>
type Agreements = Record<LegalDocument, boolean>
type Receipt = { revision: number; versions: Versions; acceptedAt: string }
const documents: LegalDocument[] = ['terms', 'privacy', 'eula']

declare global {
  interface Window {
    loneXLegal: {
      status: () => Promise<Receipt | null>
      accept: (input: { revision: number; versions: Versions; agreements: Agreements }) => Promise<Receipt>
    }
  }
}

function DocumentBody({ name }: { name: LegalDocument }) {
  const document = policy.documents[name]
  return <div className="legal-copy">
    <p className="muted">Version {document.version} · Updated {policy.updatedAt} · {policy.operator}</p>
    {document.sections.map(section => <section key={section.heading}>
      <h2>{section.heading}</h2>
      {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
    </section>)}
    <section>
      <h2>Contact</h2>
      {policy.privacyEmail
        ? <p>For legal questions or privacy requests, email {location.protocol === 'file:'
          ? policy.privacyEmail : <a href={'mailto:' + policy.privacyEmail}>{policy.privacyEmail}</a>}.</p>
        : <p>Privacy and grievance contact pending confirmation before publication.</p>}
    </section>
  </div>
}

function Documents() {
  return <div className="legal-documents">
    {documents.map(name => <details className="legal-document" key={name}>
      <summary>{policy.documents[name].title} <span>v{policy.documents[name].version}</span></summary>
      <DocumentBody name={name} />
    </details>)}
  </div>
}

export function WebsiteLegalFooter() {
  return <footer className="legal-footer">
    <span>Developed By Raju · © {new Date().getFullYear()}</span>
    <nav aria-label="Legal">
      <a href="/terms">Terms &amp; Conditions</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/eula">EULA</a>
    </nav>
  </footer>
}

export function WebsiteLegalPage({ name }: { name: LegalDocument }) {
  const title = policy.documents[name].title
  useEffect(() => { document.title = title + ' | Lone X' }, [title])
  return <div className="site">
    <main className="legal-page">
      <a className="brand" href="/"><img src="/logo.png" alt="" /> Lone X</a>
      <h1>{title}</h1>
      <DocumentBody name={name} />
    </main>
    <WebsiteLegalFooter />
  </div>
}

export function LegalConsent({ onAccepted }: { onAccepted: () => void }) {
  const [agreements, setAgreements] = useState<Agreements>({ terms: false, privacy: false, eula: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const complete = documents.every(name => agreements[name])

  async function accept(event: FormEvent) {
    event.preventDefault()
    if (!complete || saving) return
    setSaving(true)
    setError('')
    try {
      const versions = { terms: policy.documents.terms.version, privacy: policy.documents.privacy.version, eula: policy.documents.eula.version }
      await window.loneXLegal.accept({ revision: policy.consentRevision, versions, agreements })
      onAccepted()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not record acceptance.')
    } finally {
      setSaving(false)
    }
  }

  return <main className="legal-page legal-consent" aria-labelledby="legal-consent-title">
    <span className="brand"><img src="./logo.png" alt="" /> Lone X</span>
    <h1 id="legal-consent-title">Review the Lone X agreements</h1>
    <p>Open each document to read it in full. You can revisit them in Settings → Legal &amp; Policies. If you decline, close the application.</p>
    <Documents />
    <form onSubmit={accept}>
      <fieldset disabled={saving}>
        <legend>Your choices</legend>
        {documents.map(name => <label key={name}>
          <input type="checkbox" name={name} checked={agreements[name]} onChange={event => {
            const checked = event.target.checked
            setAgreements(previous => ({ ...previous, [name]: checked }))
          }} />
          {name === 'privacy' ? 'I acknowledge that I have been shown the Privacy Policy.' : 'I agree to the ' + policy.documents[name].title + '.'}
        </label>)}
      </fieldset>
      {error && <p className="chat-error" role="alert">{error}</p>}
      <button className="ai-send" type="submit" disabled={!complete || saving}>{saving ? 'Recording acceptance…' : 'I Agree & Continue'}</button>
    </form>
  </main>
}

export function LegalSettings() {
  const [receipt, setReceipt] = useState<Receipt | null>()
  useEffect(() => {
    let mounted = true
    window.loneXLegal.status().then(value => { if (mounted) setReceipt(value) }).catch(() => { if (mounted) setReceipt(null) })
    return () => { mounted = false }
  }, [])
  return <div className="legal-settings">
    {receipt && <p className="muted">Accepted <time dateTime={receipt.acceptedAt}>{new Date(receipt.acceptedAt).toLocaleString()}</time>
      {' · Terms v' + receipt.versions.terms + ' · Privacy v' + receipt.versions.privacy + ' · EULA v' + receipt.versions.eula}</p>}
    <Documents />
  </div>
}
