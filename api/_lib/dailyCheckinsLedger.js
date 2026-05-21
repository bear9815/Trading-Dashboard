export const DAILY_CHECKINS_LEDGER_KEY = 'trading-dashboard:daily-checkins:v1'

function toTime(value) {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeMode(mode) {
  return mode === 'afternoon' ? 'afternoon' : 'morning'
}

function normalizeFields(record = {}) {
  return {
    state: String(record.state || '').trim(),
    riskLevel: record.riskLevel === '' || record.riskLevel == null ? '' : Number(record.riskLevel),
    primaryResponse: String(record.primaryResponse || '').trim(),
    actionResponse: String(record.actionResponse || '').trim(),
    notes: String(record.notes || '').trim(),
  }
}

function sortRecords(records = []) {
  return [...records].sort((a, b) => (
    String(b.date || '').localeCompare(String(a.date || '')) ||
    String(a.mode || '').localeCompare(String(b.mode || '')) ||
    toTime(b.updatedAt) - toTime(a.updatedAt)
  ))
}

async function readLedger(kv) {
  const raw = await kv.get(DAILY_CHECKINS_LEDGER_KEY)
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

async function writeLedger(kv, records) {
  await kv.set(DAILY_CHECKINS_LEDGER_KEY, sortRecords(records))
}

function identity(record = {}) {
  if (!record.date) return ''
  return `${record.date}:${normalizeMode(record.mode)}`
}

export async function listDailyCheckinRecords({ kv, date } = {}) {
  if (!kv) return { ok: false, error: 'Daily check-in ledger is not configured.', records: [] }
  const records = sortRecords(await readLedger(kv))
  const filtered = date ? records.filter(record => record.date === date) : records
  return { ok: true, records: filtered }
}

export async function upsertDailyCheckinRecord({
  kv,
  record,
  now = new Date().toISOString(),
  idFactory = () => crypto.randomUUID(),
} = {}) {
  if (!kv) return { ok: false, error: 'Daily check-in ledger is not configured.' }
  const date = String(record?.date || '').trim()
  if (!date) return { ok: false, error: 'date is required.' }
  const mode = normalizeMode(record?.mode)
  const records = await readLedger(kv)
  const key = `${date}:${mode}`
  const existing = records.find(item => identity(item) === key)
  const next = {
    id: existing?.id || record.id || idFactory(),
    date,
    mode,
    startedAt: existing?.startedAt || record.startedAt || now,
    submittedAt: existing?.submittedAt || record.submittedAt || now,
    createdAt: existing?.createdAt || record.createdAt || now,
    ...normalizeFields(record),
    updatedAt: now,
  }
  const nextRecords = [next, ...records.filter(item => identity(item) !== key)]
  await writeLedger(kv, nextRecords)

  const reread = await readLedger(kv)
  const verifiedRecord = reread.find(item => item.id === next.id && identity(item) === key) || null
  if (!verifiedRecord) return { ok: false, error: 'Daily check-in write could not be verified.' }

  return { ok: true, record: next, verifiedRecord, records: sortRecords(reread) }
}

export async function deleteDailyCheckinRecord({ kv, id } = {}) {
  if (!kv) return { ok: false, error: 'Daily check-in ledger is not configured.' }
  const trimmedId = String(id || '').trim()
  if (!trimmedId) return { ok: false, error: 'id is required.' }
  const records = await readLedger(kv)
  const nextRecords = records.filter(record => record.id !== trimmedId)
  await writeLedger(kv, nextRecords)
  return { ok: true, deleted: records.length !== nextRecords.length, records: sortRecords(nextRecords) }
}
