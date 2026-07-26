import { useEffect, useRef, useState } from 'react'
import DatePicker from 'react-datepicker'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import ConfirmModal from './ConfirmModal'
import { exportCsv, exportPdf, exportDoc } from './export'
import { parseDateStr, formatDateStr, total, sumSubmitted } from './sheetUtils'

const quillModules = {
  toolbar: false
}

export default function SubsheetPanel({ sheet, isEditor, onUpdateSheet }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [bump, setBump] = useState(false)
  const [rowToDelete, setRowToDelete] = useState(null)
  const prevGrandTotal = useRef(null)
  const bumpTimer = useRef(null)
  const exportMenuRef = useRef(null)

  // Only submitted rows count toward the totals.
  const { score: scoreSum, bonus: bonusSum, total: grandTotal } = sumSubmitted(sheet.rows)
  const submittedCount = sheet.rows.filter((r) => r.submitted).length
  const rate = sheet.rows.length ? Math.round((submittedCount / sheet.rows.length) * 100) : 0

  const visibleRows = sheet.rows.filter((row) => {
    if (filter === 'submitted' && !row.submitted) return false
    if (filter === 'pending' && row.submitted) return false
    if (search && !row.activity.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  useEffect(() => {
    if (prevGrandTotal.current !== null && prevGrandTotal.current !== grandTotal) {
      setBump(true)
      clearTimeout(bumpTimer.current)
      bumpTimer.current = setTimeout(() => setBump(false), 180)
    }
    prevGrandTotal.current = grandTotal
    return () => clearTimeout(bumpTimer.current)
  }, [grandTotal])

  useEffect(() => {
    function closeOnOutsideClick(e) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        exportMenuRef.current.open = false
      }
    }
    document.addEventListener('click', closeOnOutsideClick)
    return () => document.removeEventListener('click', closeOnOutsideClick)
  }, [])

  function updateRow(rowId, field, value) {
    if (!isEditor) return
    onUpdateSheet((s) => ({
      ...s,
      rows: s.rows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    }))
  }

  function toggleSubmitted(rowId) {
    if (!isEditor) return
    onUpdateSheet((s) => ({
      ...s,
      rows: s.rows.map((r) => (r.id === rowId ? { ...r, submitted: !r.submitted } : r))
    }))
  }

  function addRow() {
    if (!isEditor) return
    onUpdateSheet((s) => ({
      ...s,
      rows: [
        ...s.rows,
        { id: Date.now(), date: new Date().toISOString().slice(0, 10), activity: '', submitted: false, startDate: '', endDate: '', score: 0, bonus: 0, remarks: '' }
      ]
    }))
  }

  function confirmDeleteRow() {
    if (rowToDelete === null) return
    const id = rowToDelete
    setRowToDelete(null)
    onUpdateSheet((s) => ({
      ...s,
      rows: s.rows.filter((r) => r.id !== id)
    }))
  }

  function runExport(fn) {
    const title = sheet.title || 'Untitled Sheet'
    const prefix = title.toLowerCase().replace(/\s+/g, '-') || 'custom-sheet'
    fn(sheet.rows, total, prefix, title)
    if (exportMenuRef.current) exportMenuRef.current.open = false
  }

  return (
    <div className="cs-active-sheet">
      <div className="cs-header scoreboard">
        <div className="title-block" style={{ flex: 1, paddingRight: '1rem' }}>
          <input
            type="text"
            className="cs-title-input"
            value={sheet.title}
            onChange={(e) => onUpdateSheet((s) => ({ ...s, title: e.target.value }))}
            placeholder="Sheet Title"
            disabled={!isEditor}
          />
          <ReactQuill
            theme="snow"
            className="cs-desc-quill"
            value={sheet.description || ''}
            onChange={(content) => onUpdateSheet((s) => ({ ...s, description: content }))}
            placeholder="Description..."
            readOnly={!isEditor}
            modules={quillModules}
          />
        </div>
        <div className="grand-tile">
          <span className="label">Grand total</span>
          <span className={'num' + (bump ? ' bump' : '')}>{grandTotal}</span>
        </div>
      </div>

      <div className="mini-stats">
        <div className="mini-stat">Entries <b>{sheet.rows.length}</b></div>
        <div className="mini-stat">Submitted <b>{submittedCount}/{sheet.rows.length}</b></div>
        <div className="mini-stat">
          Rate <b>{rate}%</b>
          <span className="rate-track"><span className="rate-fill" style={{ width: rate + '%' }} /></span>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search activity…"
            aria-label="Search activity"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="toolbar-right">
          <div className="filters" role="group" aria-label="Filter by submission status">
            {['all', 'submitted', 'pending'].map((key) => (
              <button
                key={key}
                className="filter-chip"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {key === 'all' ? 'All' : key === 'submitted' ? 'Submitted' : 'Pending'}
              </button>
            ))}
          </div>
          <details className="export-menu" ref={exportMenuRef}>
            <summary className="export-trigger">Export ▾</summary>
            <div className="export-list" role="menu">
              <button role="menuitem" onClick={() => runExport(exportCsv)}>Excel (.csv)</button>
              <button role="menuitem" onClick={() => runExport(exportPdf)}>PDF</button>
              <button role="menuitem" onClick={() => runExport(exportDoc)}>Word (.doc)</button>
            </div>
          </details>
        </div>
      </div>

      <div className="cs-table-container">
        <table className="tracker-table cs-table-override">
          <thead>
            <tr>
              <th className="center" style={{ width: '2.5rem' }}>#</th>
              <th style={{ width: '9.5rem' }}>Date</th>
              <th>Activity</th>
              <th className="center" style={{ width: '5.5rem' }}>Submitted</th>
              <th style={{ width: '9.5rem' }}>Start Date</th>
              <th style={{ width: '9.5rem' }}>End Date</th>
              <th className="num" style={{ width: '5.5rem' }}>Score</th>
              <th className="num" style={{ width: '5.5rem' }}>Bonus</th>
              <th className="num" style={{ width: '5.5rem' }}>Total</th>
              <th>Remarks</th>
              <th style={{ width: '2rem' }} />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.id}
                className={row.submitted ? 'submitted' : 'pending'}
              >
                <td className="sl center" data-label="#">{sheet.rows.indexOf(row) + 1}</td>
                <td data-label="Date">
                  <DatePicker
                    selected={parseDateStr(row.date)}
                    onChange={(date) => updateRow(row.id, 'date', formatDateStr(date))}
                    disabled={!isEditor}
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select Date"
                  />
                </td>
                <td data-label="Activity">
                  <input
                    type="text"
                    placeholder="Activity name"
                    value={row.activity || ''}
                    disabled={!isEditor}
                    onChange={(e) => updateRow(row.id, 'activity', e.target.value)}
                  />
                </td>
                <td className="center" data-label="Submitted">
                  <button
                    type="button"
                    className={'check ' + (row.submitted ? 'yes' : 'no')}
                    aria-pressed={row.submitted}
                    aria-label="Toggle submitted"
                    disabled={!isEditor}
                    onClick={() => toggleSubmitted(row.id)}
                  >
                    {row.submitted ? '✓' : '✕'}
                  </button>
                </td>
                <td data-label="Start Date">
                  <DatePicker
                    selected={parseDateStr(row.startDate)}
                    onChange={(date) => updateRow(row.id, 'startDate', formatDateStr(date))}
                    disabled={!isEditor}
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Start Date"
                    isClearable={isEditor}
                  />
                </td>
                <td data-label="End Date">
                  <DatePicker
                    selected={parseDateStr(row.endDate)}
                    onChange={(date) => updateRow(row.id, 'endDate', formatDateStr(date))}
                    disabled={!isEditor}
                    dateFormat="yyyy-MM-dd"
                    placeholderText="End Date"
                    isClearable={isEditor}
                  />
                </td>
                <td className="num" data-label="Score">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={row.score ?? ''}
                    disabled={!isEditor}
                    onChange={(e) => updateRow(row.id, 'score', e.target.value)}
                  />
                </td>
                <td className="num" data-label="Bonus">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={row.bonus ?? ''}
                    disabled={!isEditor}
                    onChange={(e) => updateRow(row.id, 'bonus', e.target.value)}
                  />
                </td>
                <td className="num total-cell" data-label="Total">{total(row)}</td>
                <td data-label="Remarks">
                  <input
                    type="text"
                    placeholder="–"
                    value={row.remarks || ''}
                    disabled={!isEditor}
                    onChange={(e) => updateRow(row.id, 'remarks', e.target.value)}
                  />
                </td>
                <td className="row-actions" data-label="">
                  {isEditor && (
                    <button className="row-del" title="Delete entry" aria-label="Delete entry" onClick={() => setRowToDelete(row.id)}>✕</button>
                  )}
                </td>
              </tr>
            ))}
            {isEditor && (
              <tr className="add-row">
                <td colSpan={11}>
                  <button type="button" className="add-entry-btn" onClick={addRow}>+ Add entry</button>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="foot-label" data-label="">Overall</td>
              <td className="num foot-total" data-label="Score">{scoreSum}</td>
              <td className="num foot-total" data-label="Bonus">{bonusSum}</td>
              <td className="num foot-total" data-label="Total">{grandTotal}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
        {visibleRows.length === 0 && (
          <div className="empty">
            <strong>No entries match</strong>
            <span>Try a different filter or search, or add a new activity above.</span>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={rowToDelete !== null}
        title="Delete Row"
        message="Are you sure you want to delete this row? This cannot be undone."
        onConfirm={confirmDeleteRow}
        onCancel={() => setRowToDelete(null)}
      />
    </div>
  )
}
