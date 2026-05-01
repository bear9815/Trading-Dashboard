import { Loader2, Save, Sparkles, Trash2 } from 'lucide-react'

function renderSection(title, payload) {
  if (!payload) return null
  if (typeof payload === 'string') {
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">{title}</p>
        <p className="text-xs text-gray-300">{payload}</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{title}</p>
      <p className="text-xs text-gray-300">{payload.summary || '—'}</p>
      <div className="flex items-center gap-2 text-[10px] text-gray-600">
        {payload.confidence ? <span>Confidence: {payload.confidence}</span> : null}
        {payload.provenance ? <span>Source: {payload.provenance}</span> : null}
      </div>
    </div>
  )
}

export default function ContextAssistPanel({
  model,
  loading = false,
  error = '',
  onBuildContext,
  onSaveContext,
  onDiscardContext,
}) {
  const context = model.contextAssist || { status: 'idle', result: null }
  const preview = context.status === 'preview'
  const saved = context.status === 'saved'

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-white">Historical Context Assistant</p>
          <p className="text-xs text-gray-500 mt-1">
            Manually reconstruct likely catalyst, earnings backdrop, and hot theme context for this model stock.
          </p>
        </div>
        <button
          type="button"
          onClick={onBuildContext}
          disabled={loading}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-gray-300 hover:text-white hover:border-white/20 disabled:opacity-40 flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          Build historical context
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-accent-red/20 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">{error}</div>
      ) : null}

      {!context.result ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-xs text-gray-600">
          Run this on demand when you want deeper catalyst and theme context for the current model stock.
        </div>
      ) : (
        <div className={`rounded-xl border p-4 space-y-3 ${
          preview ? 'border-accent-blue/20 bg-accent-blue/[0.04]' : 'border-white/10 bg-white/[0.02]'
        }`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-gray-500">
              {preview ? 'Preview only — save if this looks useful.' : 'Saved to this model entry.'}
            </div>
            <div className="flex items-center gap-2">
              {preview && (
                <button
                  type="button"
                  onClick={onSaveContext}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-accent-green/20 bg-accent-green/10 text-accent-green flex items-center gap-1.5"
                >
                  <Save size={12} />
                  Save
                </button>
              )}
              <button
                type="button"
                onClick={onDiscardContext}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-gray-400 hover:text-white hover:border-white/20 flex items-center gap-1.5"
              >
                <Trash2 size={12} />
                {saved ? 'Clear saved context' : 'Discard'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {renderSection('Probable catalyst', context.result.probableCatalyst)}
            {renderSection('Earnings / sales backdrop', context.result.earningsSalesBackdrop)}
            {renderSection('Theme and group context', context.result.themeGroupContext)}
            {renderSection('Leader confirmation', context.result.leaderConfirmation)}
          </div>

          {renderSection('What likely mattered most', context.result.whatLikelyMatteredMost)}

          {Array.isArray(context.result.risksContradictions) && context.result.risksContradictions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Risks / contradictions</p>
              <ul className="space-y-1 text-xs text-gray-300">
                {context.result.risksContradictions.map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-accent-red mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(context.result.evidenceSources) && context.result.evidenceSources.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Evidence sources</p>
              <div className="flex flex-wrap gap-1.5">
                {context.result.evidenceSources.map(source => (
                  <span key={source} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/8 text-gray-500">
                    {source}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
