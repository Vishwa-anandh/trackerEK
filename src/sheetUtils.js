export function parseDateStr(ds) {
  if (!ds) return null
  const [y, m, d] = ds.split('-')
  return new Date(y, m - 1, d)
}

export function formatDateStr(d) {
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dy}`
}

// Anything past this is a millisecond epoch rather than a sequential row id.
const MS_EPOCH_FLOOR = 1e12

// When a row was added. New rows carry `createdAt`; rows created before that field
// existed fall back to their id (subsheet ids were minted from Date.now()) and then
// to the date column, which carries no time of day.
export function entryStamp(row) {
  if (typeof row.createdAt === 'number') return { ms: row.createdAt, hasTime: true }
  if (typeof row.id === 'number' && row.id > MS_EPOCH_FLOOR) return { ms: row.id, hasTime: true }
  const d = parseDateStr(row.date)
  return d ? { ms: d.getTime(), hasTime: false } : null
}

// The most recently added row across the given rows, or null if none can be dated.
export function lastEntryStamp(rows) {
  return rows.reduce((latest, row) => {
    const stamp = entryStamp(row)
    if (!stamp) return latest
    return !latest || stamp.ms > latest.ms ? stamp : latest
  }, null)
}

export function formatStamp(stamp) {
  if (!stamp) return '—'
  const d = new Date(stamp.ms)
  const date = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  if (!stamp.hasTime) return date
  return `${date}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export function num(v) {
  const n = parseFloat(v)
  return Number.isNaN(n) ? 0 : n
}

export function total(row) {
  return num(row.score) + num(row.bonus)
}

// Aggregate score/bonus/total across rows, counting submitted rows only.
export function sumSubmitted(rows) {
  return rows.reduce(
    (acc, row) => {
      if (!row.submitted) return acc
      acc.score += num(row.score)
      acc.bonus += num(row.bonus)
      acc.total += total(row)
      return acc
    },
    { score: 0, bonus: 0, total: 0 }
  )
}
