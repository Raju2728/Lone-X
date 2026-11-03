import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

type Credentials = { email: string; password: string }
declare global {
  interface Window {
    loneXAccount: {
      status: () => Promise<{ exists: boolean; signedIn: boolean; emailReady: boolean }>
      create: (input: Credentials) => Promise<{ emailSent: boolean }>
      login: (input: Credentials) => Promise<void>
      requestReset: (email: string) => Promise<void>
      reset: (input: Credentials & { code: string }) => Promise<void>
    }
  }
}

export default function AccountGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'loading' | 'create' | 'login' | 'reset' | 'open'>('loading')
  const [emailReady, setEmailReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const api = window.loneXAccount

  useEffect(() => {
    api.status().then(status => {
      setEmailReady(status.emailReady)
      setMode(status.signedIn ? 'open' : status.exists ? 'login' : 'create')
    }).catch(() => setError('Could not load the local account. Restart Lone X and try again.'))
  }, [api])

  async function perform(action: () => Promise<void>) {
    setPending(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Account action failed.')
    } finally {
      setPending(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void perform(async () => {
      if (mode === 'create') {
        const result = await api.create({ email, password })
        if (!result.emailSent && emailReady) setMessage('Account created. The confirmation email could not be sent.')
      } else if (mode === 'reset') {
        await api.reset({ email, password, code })
        setPassword('')
        setCode('')
        setMode('login')
        setMessage('Password updated. Sign in to continue.')
        return
      } else {
        await api.login({ email, password })
      }
      setPassword('')
      setMode('open')
    })
  }

  if (mode === 'open') return <>{message && <p className="account-notice" role="status">{message}</p>}{children}</>
  return <main className="account-screen">
    <section className="panel account-panel">
      <img src="./logo.png" alt="Lone X" />
      <h1>{mode === 'create' ? 'Create your local account' : mode === 'reset' ? 'Reset your password' : 'Sign in to Lone X'}</h1>
      {mode !== 'loading' && <form onSubmit={submit}>
        <label>Email <input type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" /></label>
        {mode === 'reset' && <label>Reset code <input required inputMode="numeric" maxLength={6} value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" /></label>}
        <label>{mode === 'reset' ? 'New password' : 'Password'} <input type="password" required minLength={8} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        <button className="ai-send" disabled={pending}>{mode === 'create' ? 'Create account' : mode === 'reset' ? 'Update password' : 'Sign in'}</button>
        {mode === 'login' && emailReady && <button className="provider-button" type="button" disabled={pending || !email.trim()} onClick={() => void perform(async () => {
          await api.requestReset(email)
          setMode('reset')
          setPassword('')
          setMessage('Check your email for a reset code.')
        })}>Email a reset code</button>}
      </form>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="chat-error">{error}</p>}
    </section>
  </main>
}
