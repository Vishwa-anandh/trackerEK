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

export function num(v) {
  const n = parseFloat(v)
  return Number.isNaN(n) ? 0 : n
}

export function total(row) {
  return num(row.score) + num(row.bonus)
}
