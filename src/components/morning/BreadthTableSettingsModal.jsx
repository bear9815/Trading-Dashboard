import { Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { DEFAULT_BREADTH_TABLE_SETTINGS, normalizeBreadthTableSettings } from '../../store/useSettingsStore.js'

function BandEditor({ label, helper, values, onChange }) {
  const updateValue = (index, nextValue) => {
    const numeric = Number(nextValue)
    onChange(values.map((value, valueIndex) => (valueIndex === index ? (Number.isFinite(numeric) ? numeric : value) : value)))
  }

  const addBand = () => {
    const nextValue = values.length ? Math.min(99, values[values.length - 1] + 5) : 50
    onChange([...values, nextValue])
  }

  const removeBand = (index) => {
    if (values.length <= 1) return
    onChange(values.filter((_, valueIndex) => valueIndex !== index))
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{helper}</p>
        </div>
        <button
          type="button"
          onClick={addBand}
          className="flex items-center gap-1 rounded-lg border border-accent-blue/25 bg-accent-blue/15 px-2 py-1 text-xs text-accent-blue"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {values.map((value, index) => (
          <div key={`${label}-${index}`} className="flex items-center gap-1 rounded-lg border border-white/10 bg-surface-200 px-2 py-1.5">
            <input
              type="number"
              min="1"
              max="99"
              value={value}
              onChange={event => updateValue(index, event.target.value)}
              className="w-14 bg-transparent text-center text-xs font-semibold text-gray-100 outline-none"
            />
            <span className="text-[10px] text-gray-500">pct</span>
            <button
              type="button"
              onClick={() => removeBand(index)}
              disabled={values.length <= 1}
              className="rounded p-1 text-gray-500 transition hover:text-accent-red disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BreadthTableSettingsModal({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(() => normalizeBreadthTableSettings(settings))

  const updateBands = (key, values) => {
    setDraft(current => normalizeBreadthTableSettings({
      ...current,
      heatmap: {
        ...current.heatmap,
        [key]: values,
      },
    }))
  }

  const resetDefaults = () => {
    setDraft(normalizeBreadthTableSettings(DEFAULT_BREADTH_TABLE_SETTINGS))
  }

  const save = () => {
    onSave(normalizeBreadthTableSettings(draft))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-surface-50 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Breadth Heatmap Settings</p>
            <p className="text-xs text-gray-500">Edit the percentile bands that drive the breadth-table heatmap.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-semibold text-white">How the bands work</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-gray-500">
              <li>`Participation` bands color percent-based breadth metrics like `20DMA Above` and `All AVWAP Aligned`.</li>
              <li>`Signed distance` bands color AVWAP distance columns, while still preserving above-zero as green and below-zero as red.</li>
              <li>Lower percentile bands define the weak/extreme left tail. Upper percentile bands define the strong/extreme right tail.</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BandEditor
              label="Participation Lower Bands"
              helper="Used for weaker breadth readings. Smaller percentiles are more extreme."
              values={draft.heatmap.pctLowerBands}
              onChange={values => updateBands('pctLowerBands', values)}
            />
            <BandEditor
              label="Participation Upper Bands"
              helper="Used for stronger breadth readings. Larger percentiles are more extreme."
              values={draft.heatmap.pctUpperBands}
              onChange={values => updateBands('pctUpperBands', values)}
            />
            <BandEditor
              label="Signed Distance Lower Bands"
              helper="Used for more negative AVWAP-distance readings."
              values={draft.heatmap.signedLowerBands}
              onChange={values => updateBands('signedLowerBands', values)}
            />
            <BandEditor
              label="Signed Distance Upper Bands"
              helper="Used for more positive AVWAP-distance readings."
              values={draft.heatmap.signedUpperBands}
              onChange={values => updateBands('signedUpperBands', values)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={resetDefaults}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
          >
            <RotateCcw size={12} />
            Reset Defaults
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:text-white">
              Cancel
            </button>
            <button type="button" onClick={save} className="rounded-lg border border-accent-blue/30 bg-accent-blue/20 px-3 py-1.5 text-xs font-semibold text-accent-blue">
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
