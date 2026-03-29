import { useState, useEffect, lazy, Suspense } from 'react'
import Sidebar from './components/layout/Sidebar.jsx'
import TopBar from './components/layout/TopBar.jsx'
import LoginPage from './components/auth/LoginPage.jsx'
import ImportModal from './components/import/ImportModal.jsx'
import QuickAddTrade from './components/quicktrade/QuickAddTrade.jsx'
import { useSettingsStore } from './store/useSettingsStore.js'
import { setAnthropicFallbackKey } from './utils/ai.js'
import { setSchwabToken, setSchwabTokenGetter } from './utils/marketData.js'
import { useAuthStore } from './store/useAuthStore.js'
import PageErrorBoundary from './components/PageErrorBoundary.jsx'
import { useSchwabStore } from './store/useSchwabStore.js'
import { useTradeStore } from './store/useTradeStore.js'
import { useJournalStore } from './store/useJournalStore.js'
import { useMorningStore } from './store/useMorningStore.js'
import { supabase } from './lib/supabase.js'
import { Loader } from 'lucide-react'

// ── Lazy-loaded pages (each splits into its own chunk) ────────────────────────
// Only the page you're on gets downloaded — everything else costs nothing until navigated to.
const Dashboard          = lazy(() => import('./components/dashboard/Dashboard.jsx'))
const TradeLog           = lazy(() => import('./components/tradelog/TradeLog.jsx'))
const RiskPanel          = lazy(() => import('./components/risk/RiskPanel.jsx'))
const Analytics          = lazy(() => import('./components/analytics/Analytics.jsx'))
const Journal            = lazy(() => import('./components/journal/Journal.jsx'))
const AIFeedback         = lazy(() => import('./components/ai/AIFeedback.jsx'))
const Settings           = lazy(() => import('./components/settings/Settings.jsx'))
const TradeReview        = lazy(() => import('./components/chartreview/TradeReview.jsx'))
const Morning            = lazy(() => import('./components/morning/Morning.jsx'))
const RRGPage            = lazy(() => import('./components/rrg/RRGPage.jsx'))
const EdgeLab            = lazy(() => import('./components/edgelab/EdgeLab.jsx'))
const FactorRegime       = lazy(() => import('./components/regime/FactorRegime.jsx'))
const ThematicResearch    = lazy(() => import('./components/thematic/ThematicResearch.jsx'))

// ── Page-transition loading fallback ─────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center text-gray-500">
      <div className="flex flex-col items-center gap-3">
        <Loader size={24} className="animate-spin text-accent-blue" />
        <span className="text-xs">Loading…</span>
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [showImport, setShowImport] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState('All')
  const { theme, anthropicApiKey, loadFromCloud: loadSettings } = useSettingsStore()
  const { loadTokens: loadSchwabTokens, _accessToken: schwabAccessToken } = useSchwabStore()
  const { user, loading: authLoading, setSession } = useAuthStore()
  const { loadFromCloud, clearLocalState } = useTradeStore()
  const { loadFromCloud: loadJournal, clearLocalState: clearJournal } = useJournalStore()
  const { loadFromCloud: loadMorning, clearLocalState: clearMorning } = useMorningStore()

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme || 'dark')
  }, [theme])

  // Handle OAuth callback redirect from Schwab (?schwab=connected)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const schwabStatus = params.get('schwab')
    if (schwabStatus === 'connected') {
      window.history.replaceState({}, '', window.location.pathname)
      loadSchwabTokens()
      setPage('settings')
    } else if (schwabStatus === 'denied') {
      window.history.replaceState({}, '', window.location.pathname)
      useSchwabStore.setState({ error: 'Schwab authorization was denied.' })
      setPage('settings')
    } else if (schwabStatus === 'error') {
      const reason = params.get('reason') || 'unknown'
      const messages = {
        config:         'Missing Vercel env vars (SCHWAB_APP_KEY / SCHWAB_APP_SECRET / etc.)',
        token_exchange: 'Token exchange failed — check that SCHWAB_REDIRECT_URI matches exactly in both Vercel and the Schwab Developer Portal.',
        missing_params: 'OAuth callback missing code or state parameter.',
        bad_state:      'Could not decode state — try connecting again.',
        db_write:       'Supabase write failed — the schwab_tokens table may not exist. See Settings for setup instructions.',
        db_error:       'Supabase connection error — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
        fetch_failed:   'Network error contacting Schwab token endpoint.',
      }
      window.history.replaceState({}, '', window.location.pathname)
      useSchwabStore.setState({ error: messages[reason] || `OAuth error: ${reason}` })
      setPage('settings')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep Anthropic fallback key in sync with settings store
  useEffect(() => {
    setAnthropicFallbackKey(anthropicApiKey || '')
  }, [anthropicApiKey])

  // Push Schwab access token into marketData.js so all fetchHistory calls use it
  useEffect(() => {
    setSchwabToken(schwabAccessToken || null)
  }, [schwabAccessToken])

  // Register a getter so marketData always gets a fresh (auto-refreshed) token
  useEffect(() => {
    setSchwabTokenGetter(() => useSchwabStore.getState().getValidToken())
  }, [])

  // Bootstrap Supabase auth session on mount
  useEffect(() => {
    if (!supabase) {
      setSession(null)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        loadFromCloud(session.user.id)
        loadJournal(session.user.id)
        loadMorning(session.user.id)
        loadSettings(session.user.id)
        loadSchwabTokens()
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'SIGNED_IN' && session?.user) {
        loadFromCloud(session.user.id)
        loadJournal(session.user.id)
        loadMorning(session.user.id)
        loadSettings(session.user.id)
        loadSchwabTokens()
      }
      if (event === 'SIGNED_OUT') {
        clearLocalState()
        clearJournal()
        clearMorning()
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading spinner while checking for existing session ───────────────────
  if (supabase && authLoading) {
    return (
      <div className="flex h-screen bg-surface items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader size={28} className="animate-spin text-accent-blue" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    )
  }

  // ── Login gate (only when Supabase is configured) ─────────────────────────
  if (supabase && !user) {
    return <LoginPage />
  }

  // ── Main app ──────────────────────────────────────────────────────────────
  const pageProps = { selectedAccount }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar
        page={page}
        setPage={setPage}
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          page={page}
          onImport={() => setShowImport(true)}
        />

        <main className={`flex-1 ${page === 'rrg' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <PageErrorBoundary key={page}>
          <Suspense fallback={<PageLoader />}>
            {page === 'dashboard'   && <Dashboard    {...pageProps} />}
            {page === 'trades'      && <TradeLog      {...pageProps} />}
            {page === 'risk'        && <RiskPanel     {...pageProps} />}
            {page === 'analytics'   && <Analytics     {...pageProps} />}
            {page === 'chartreview' && <TradeReview   {...pageProps} />}
            {page === 'morning'     && <Morning />}
            {page === 'journal'     && <Journal       {...pageProps} />}
            {page === 'ai'          && <AIFeedback    {...pageProps} />}
            {page === 'edgelab'     && <EdgeLab       {...pageProps} />}
            {page === 'regime'      && <FactorRegime />}
            {page === 'settings'      && <Settings />}
            {page === 'rrg'         && <div className="h-full"><RRGPage /></div>}
            {page === 'thematic'    && <ThematicResearch />}
          </Suspense>
          </PageErrorBoundary>
        </main>
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      <QuickAddTrade />
    </div>
  )
}
