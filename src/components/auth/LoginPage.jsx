import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore.js'
import { TrendingUp, Loader } from 'lucide-react'

export default function LoginPage() {
  const { signIn, signUp } = useAuthStore()
  const [mode,     setMode]     = useState('signin') // 'signin' | 'signup'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        await signUp(email, password)
        setSuccess('Account created — check your email to confirm, then sign in.')
        setMode('signin')
      } else {
        await signIn(email, password)
        // App.jsx will detect the session change and render the main app
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-lg bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center">
            <TrendingUp size={18} className="text-accent-blue" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">Risk Tool</span>
        </div>

        {/* Card */}
        <div className="card p-6">
          <h1 className="text-lg font-semibold text-white mb-1">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {mode === 'signin'
              ? 'Your trades sync automatically across all devices.'
              : 'Set up your cloud account to sync trades everywhere.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="input w-full mt-1"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                required
                minLength={6}
                className="input w-full mt-1"
              />
            </div>

            {error && (
              <p className="text-sm text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-accent-green bg-accent-green/10 border border-accent-green/20 rounded-md px-3 py-2">
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading && <Loader size={14} className="animate-spin" />}
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        {/* Toggle mode */}
        <p className="text-center text-sm text-gray-500 mt-4">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess('') }}
            className="text-accent-blue hover:text-accent-blue/80 transition-colors font-medium"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
