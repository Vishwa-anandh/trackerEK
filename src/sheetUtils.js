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

// Sheet end dates carry a time of day, stored as local "YYYY-MM-DD HH:mm".
// Values saved before the time was added are date-only and read as midnight.
export function parseDateTimeStr(s) {
  if (!s) return null
  const [datePart, timePart] = s.split(' ')
  const d = parseDateStr(datePart)
  if (!d || !timePart) return d
  const [h, min] = timePart.split(':')
  d.setHours(Number(h) || 0, Number(min) || 0, 0, 0)
  return d
}

export function formatDateTimeStr(d) {
  if (!d) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${formatDateStr(d)} ${hh}:${mm}`
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
