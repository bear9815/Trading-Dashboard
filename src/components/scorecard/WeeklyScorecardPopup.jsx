import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Sparkles, X } from 'lucide-react'
import { useWeeklyScorecardWorkspace } from './useWeeklyScorecardWorkspace.js'
import { buildWeeklyScorecardPopupState } from '../../utils/weeklyScorecardPopup.js'

const STORAGE_KEY = 'weekly-scorecard-popup-shown-dates'

function readShownDates() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function writeShownDate(dateKey) {
  try {
    const next = [...new Set([...readShownDates(), dateKey])].slice(-30)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
}

export default function WeeklyScorecardPopup({ onOpenScorecard }) {
  const { normalizedSettings, selectedScorecard, aiLoadingWeekKey } = useWeeklyScorecardWorkspace()
  const [visible, setVisible] = useState(false)
  const popupState = useMemo(
    () => buildWeeklyScorecardPopupState({
      now: new Date(),
      autoPopupEnabled: normalizedSettings.autoPopupEnabled,
      shownDates: typeof window === 'undefined' ? [] : readShownDates(),
    }),
    [normalizedSettings.autoPopupEnabled]
  )

  useEffect(() => {
    if (popupState.shouldOpen) setVisible(true)
  }, [popupState.shouldOpen])

  if (!visible || !selectedScorecard) return null

  const dismiss = () => {
    writeShownDate(popupState.shownDateKey)
    setVisible(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={dismiss} />
      <div className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0d1016] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <CalendarCheck size={16} className="text-accent-green" />
            <div>
              <p className="text-sm font-semibold text-white">Weekly Scorecard Ready</p>
              <p className="text-xs text-gray-500">{selectedScorecard.weekStart} to {selectedScorecard.weekEnd}</p>
            </div>
          </div>
          <button onClick={dismiss} className="text-gray-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="card-sm">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Trades</p>
              <p className="mt-2 text-2xl font-black mono text-white">{selectedScorecard.metrics.tradesPlaced}</p>
            </div>
            <div className="card-sm">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Review Rate</p>
              <p className="mt-2 text-2xl font-black mono text-white">{selectedScorecard.metrics.reviewCompletionRate}%</p>
            </div>
            <div className="card-sm">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Routine Days</p>
              <p className="mt-2 text-2xl font-black mono text-white">{selectedScorecard.metrics.routineCompleteTradingDays}/5</p>
            </div>
            <div className="card-sm">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Wellness</p>
              <p className="mt-2 text-2xl font-black mono text-white">{selectedScorecard.metrics.wellnessSessions}</p>
            </div>
          </div>

          <div className="card-sm">
            <div className="flex items-center gap-2 text-accent-blue">
              <Sparkles size={13} />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">AI Snapshot</p>
            </div>
            <p className="mt-2 text-sm text-gray-300">
              {selectedScorecard.aiSummary?.headline
                || (aiLoadingWeekKey === selectedScorecard.weekKey ? 'Generating your summary…' : 'Open the full scorecard to review and finalize the week.')}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={dismiss} className="btn-ghost text-xs">Dismiss</button>
            <button
              onClick={() => {
                dismiss()
                onOpenScorecard?.()
              }}
              className="btn-primary text-xs"
            >
              Open Scorecard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
