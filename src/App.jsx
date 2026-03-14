import { useState, useEffect } from 'react'
import Sidebar from './components/layout/Sidebar.jsx'
import TopBar from './components/layout/TopBar.jsx'
import Dashboard from './components/dashboard/Dashboard.jsx'
import TradeLog from './components/tradelog/TradeLog.jsx'
import RiskPanel from './components/risk/RiskPanel.jsx'
import Analytics from './components/analytics/Analytics.jsx'
import Journal from './components/journal/Journal.jsx'
import AIFeedback from './components/ai/AIFeedback.jsx'
import Settings from './components/settings/Settings.jsx'
import TradeReview from './components/chartreview/TradeReview.jsx'
import Morning from './components/morning/Morning.jsx'
import RRGPage from './components/rrg/RRGPage.jsx'
import EdgeLab from './components/edgelab/EdgeLab.jsx'
import ImportModal from './components/import/ImportModal.jsx'
import { useSettingsStore } from './store/useSettingsStore.js'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [showImport, setShowImport] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState('All')
  const { theme } = useSettingsStore()

  // Apply theme to <html> data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme || 'dark')
  }, [theme])

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
          {page === 'dashboard'   && <Dashboard    {...pageProps} />}
          {page === 'trades'      && <TradeLog      {...pageProps} />}
          {page === 'risk'        && <RiskPanel     {...pageProps} />}
          {page === 'analytics'   && <Analytics     {...pageProps} />}
          {page === 'chartreview' && <TradeReview   {...pageProps} />}
          {page === 'morning'     && <Morning />}
          {page === 'journal'     && <Journal       {...pageProps} />}
          {page === 'ai'          && <AIFeedback    {...pageProps} />}
          {page === 'edgelab'     && <EdgeLab       {...pageProps} />}
          {page === 'settings'    && <Settings />}
          {page === 'rrg'         && <div className="h-full"><RRGPage /></div>}
        </main>
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
