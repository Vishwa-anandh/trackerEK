import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const HEADERS = ['#', 'Date', 'Activity', 'Submitted', 'Score', 'Bonus', 'Total', 'Remarks']

function toRecords(rows, total) {
  return rows.map((r, i) => [
    i + 1,
    r.date,
    r.activity,
    r.submitted ? 'Yes' : 'No',
    r.score,
    r.bonus,
    total(r),
    r.remarks,
  ])
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function csvEscape(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function exportCsv(rows, total, filenamePrefix) {
  const lines = [HEADERS, ...toRecords(rows, total)].map((r) => r.map(csvEscape).join(','))
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  download(blob, `${filenamePrefix}.csv`)
}

export function exportPdf(rows, total, filenamePrefix, title) {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(title, 14, 15)
  autoTable(doc, {
    startY: 21,
    head: [HEADERS],
    body: toRecords(rows, total),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [201, 122, 43] },
  })
  doc.save(`${filenamePrefix}.pdf`)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function exportDoc(rows, total, filenamePrefix, title) {
  const bodyRows = toRecords(rows, total)
    .map((cols) => `<tr>${cols.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('')
  const headRow = `<tr>${HEADERS.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>
<h1 style="font-family:sans-serif;">${escapeHtml(title)}</h1>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">
${headRow}
${bodyRows}
</table>
</body></html>`
  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  download(blob, `${filenamePrefix}.doc`)
}
