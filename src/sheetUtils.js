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
