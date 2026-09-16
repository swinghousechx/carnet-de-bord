import { useState, type FormEvent } from 'react'
import { supabase } from '../app/supabase'
import { PrimaryButton } from '../ui/Button'
import { TextRow } from '../ui/Field'
import { Section } from '../ui/List'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError(navigator.onLine ? 'Email ou mot de passe incorrect.' : 'Connexion impossible hors ligne.')
  }

  return (
    <main className="min-h-full bg-bg pt-[calc(env(safe-area-inset-top)+72px)]">
      <h1 className="px-8 text-center text-[28px] font-bold">Carnet de bord</h1>
      <p className="px-8 pt-2 pb-8 text-center text-[15px] text-label2">Une seule connexion : l’app reste connectée ensuite.</p>
      <form onSubmit={submit}>
        <Section footer={error && <span className="text-red">{error}</span>}>
          <TextRow label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" />
          <TextRow label="Mot de passe" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
        </Section>
        <div className="px-4">
          <PrimaryButton type="submit" disabled={busy || !email || !password}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </PrimaryButton>
        </div>
      </form>
    </main>
  )
}
