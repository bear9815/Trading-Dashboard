import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore.js'
import { Loader } from 'lucide-react'
import AppLogo from '../layout/AppLogo.jsx'

export default function LoginPage() {
  const { signIn, signUp, resetPassword } = useAuthStore()
  const [mode,     setMode]     = useState('signin') // 'signin' | 'signup' | 'reset'
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
      } else if (mode === 'reset') {
        await resetPassword(email)
        setSuccess('Password reset email sent — check your inbox.')
        setMode('signin')
      } else {
        await signIn(email, password)
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
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <AppLogo size="md" showWordmark={false} />
            <div className="flex flex-col leading-none">
              <span className="text-xl font-bold text-white tracking-tight">Trading</span>
              <span className="text-sm font-medium text-blue-400 tracking-widest uppercase">Dashboard</span>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="card p-6">
          <h1 className="text-lg font-semibold text-white mb-1">
            {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {mode === 'signin'
              ? 'Your trades sync automatically across all devices.'
              : mode === 'signup'
              ? 'Set up your cloud account to sync trades everywhere.'
              : "Enter your email and we'll send you a reset link."}
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
            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label">Password</label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => { setMode('reset'); setError(''); setSuccess('') }}
                      className="text-xs text-gray-500 hover:text-accent-blue transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                  required
                  minLength={6}
                  className="input w-full"
                />
              </div>
            )}

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
              {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </button>
          </form>
        </div>

        {/* Toggle mode */}
        <p className="text-center text-sm text-gray-500 mt-4">
          {mode === 'reset'
            ? <>Remember it? <button onClick={() => { setMode('signin'); setError(''); setSuccess('') }} className="text-accent-blue hover:text-accent-blue/80 transition-colors font-medium">Sign in</button></>
            : mode === 'signin'
            ? <>Don't have an account? <button onClick={() => { setMode('signup'); setError(''); setSuccess('') }} className="text-accent-blue hover:text-accent-blue/80 transition-colors font-medium">Sign up</button></>
            : <>Already have an account? <button onClick={() => { setMode('signin'); setError(''); setSuccess('') }} className="text-accent-blue hover:text-accent-blue/80 transition-colors font-medium">Sign in</button></>
          }
        </p>
      </div>
    </div>
  )
}
