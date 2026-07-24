import { useEffect, useState, useRef } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { exportCsv, exportPdf, exportDoc } from './export'
import ConfirmModal from './ConfirmModal'
import { db } from './firebase'
import './CustomSheets.css'
import DatePicker from "react-datepicker"
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
function parseDateStr(ds) {
  if (!ds) return null
  const [y, m, d] = ds.split('-')
  return new Date(y, m - 1, d)
}
function formatDateStr(d) {
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dy}`
}

const sheetsRef = doc(db, 'trackers', 'custom_sheets')

function num(v) {
  const n = parseFloat(v)
  return Number.isNaN(n) ? 0 : n
}

function total(row) {
  return num(row.score) + num(row.bonus)
}

const quillModules = {
  toolbar: false
};

export default function CustomSheets({ isEditor, currentView, setCurrentView, authElement }) {
  const [data, setData] = useState({ sheets: [], activeSheetId: null })
  const [loading, setLoading] = useState(true)
  const [syncError, setSyncError] = useState(false)
  const [modalConfig, setModalConfig] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [bump, setBump] = useState(false)
  const prevGrandTotal = useRef(null)
  const bumpTimer = useRef(null)
  const hydrated = useRef(false)
  const saveTimer = useRef(null)
  const exportMenuRef = useRef(null)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      sheetsRef,
      (snap) => {
        if (snap.exists()) {
          const fetchedData = snap.data()
          if (!fetchedData.activeSheetId && fetchedData.sheets?.length > 0) {
            fetchedData.activeSheetId = fetchedData.sheets[0].id
          }
          setData(fetchedData)
        } else {
          const initialSheetId = 'sheet_' + Date.now()
          const initialData = {
            sheets: [
              {
                id: initialSheetId,
                title: 'New Sheet',
                description: 'Double click to edit description...',
                rows: [{ id: Date.now(), date: new Date().toISOString().slice(0, 10), activity: '', submitted: false, startDate: '', endDate: '', score: 0, bonus: 0, remarks: '' }]
              }
            ],
            activeSheetId: initialSheetId
          }
          setDoc(sheetsRef, initialData)
        }
        hydrated.current = true
        setLoading(false)
      },
      (err) => {
        console.error('Firestore listen failed', err)
        setSyncError(true)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!hydrated.current || !isEditor) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setDoc(sheetsRef, data, { merge: true })
        .catch((err) => {
          console.error('Firestore save failed', err)
          setSyncError(true)
        })
    }, 500)
    return () => clearTimeout(saveTimer.current)
  }, [data, isEditor])

  useEffect(() => {
    function closeOnOutsideClick(e) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        exportMenuRef.current.open = false
      }
    }
    document.addEventListener('click', closeOnOutsideClick)
    return () => document.removeEventListener('click', closeOnOutsideClick)
  }, [])

  function updateData(updater) {
    if (!isEditor) return
    setData((prev) => updater(prev))
  }

  function addSheet() {
    const id = 'sheet_' + Date.now()
    updateData((prev) => ({
      ...prev,
      sheets: [
        ...prev.sheets,
        {
          id,
          title: 'Untitled Sheet',
          description: '',
          rows: [{ id: Date.now(), date: new Date().toISOString().slice(0, 10), activity: '', submitted: false, startDate: '', endDate: '', score: 0, bonus: 0, remarks: '' }]
        }
      ],
      activeSheetId: id
    }))
  }

  const activeSheetIndex = data.sheets.findIndex(s => s.id === data.activeSheetId)
  const activeSheet = data.sheets[activeSheetIndex]

  const scoreSum = activeSheet ? activeSheet.rows.reduce((sum, row) => sum + num(row.score), 0) : 0
  const bonusSum = activeSheet ? activeSheet.rows.reduce((sum, row) => sum + num(row.bonus), 0) : 0
  const grandTotal = activeSheet ? activeSheet.rows.reduce((sum, row) => sum + total(row), 0) : 0
  const submittedCount = activeSheet ? activeSheet.rows.filter(r => r.submitted).length : 0
  const rate = activeSheet && activeSheet.rows.length ? Math.round((submittedCount / activeSheet.rows.length) * 100) : 0

  const visibleRows = activeSheet ? activeSheet.rows.filter((row) => {
    if (filter === 'submitted' && !row.submitted) return false
    if (filter === 'pending' && row.submitted) return false
    if (search && !row.activity.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  }) : []

  useEffect(() => {
    if (prevGrandTotal.current !== null && prevGrandTotal.current !== grandTotal) {
      setBump(true)
      clearTimeout(bumpTimer.current)
      bumpTimer.current = setTimeout(() => setBump(false), 180)
    }
    prevGrandTotal.current = grandTotal
    return () => clearTimeout(bumpTimer.current)
  }, [grandTotal])

  function updateActiveSheet(updater) {
    updateData((prev) => {
      const idx = prev.sheets.findIndex(s => s.id === prev.activeSheetId)
      if (idx === -1) return prev
      const newSheets = [...prev.sheets]
      newSheets[idx] = updater(newSheets[idx])
      return { ...prev, sheets: newSheets }
    })
  }

  function promptRemoveSheet(id) {
    setModalConfig({
      type: 'sheet',
      targetId: id,
      title: 'Delete Sheet',
      message: 'Are you sure you want to delete this sheet? This cannot be undone.',
      confirmText: 'Delete Sheet'
    })
  }

  function promptRemoveRow(id) {
    setModalConfig({
      type: 'row',
      targetId: id,
      title: 'Delete Row',
      message: 'Are you sure you want to delete this row? This cannot be undone.',
      confirmText: 'Delete Row'
    })
  }

  function updateRow(rowId, field, value) {
    if (!isEditor) return
    updateActiveSheet((sheet) => ({
      ...sheet,
      rows: sheet.rows.map(r => r.id === rowId ? { ...r, [field]: value } : r)
    }))
  }

  function addRow() {
    if (!isEditor) return
    updateActiveSheet((sheet) => ({
      ...sheet,
      rows: [
        ...sheet.rows,
        { id: Date.now(), date: new Date().toISOString().slice(0, 10), activity: '', submitted: false, startDate: '', endDate: '', score: 0, bonus: 0, remarks: '' }
      ]
    }))
  }

  function toggleSubmitted(rowId) {
    if (!isEditor) return
    updateActiveSheet((sheet) => ({
      ...sheet,
      rows: sheet.rows.map(r => r.id === rowId ? { ...r, submitted: !r.submitted } : r)
    }))
  }

  function runExport(fn) {
    const sheet = data.sheets.find(s => s.id === data.activeSheetId)
    if (!sheet) return
    const title = sheet.title || 'Untitled Sheet'
    const prefix = title.toLowerCase().replace(/\s+/g, '-') || 'custom-sheet'
    fn(sheet.rows, total, prefix, title)
    if (exportMenuRef.current) exportMenuRef.current.open = false
  }

  function handleConfirm() {
    if (!modalConfig) return
    const { type, targetId } = modalConfig
    if (type === 'sheet') {
      updateData((prev) => {
        const newSheets = prev.sheets.filter(s => s.id !== targetId)
        return {
          ...prev,
          sheets: newSheets,
          activeSheetId: prev.activeSheetId === targetId ? (newSheets[0]?.id || null) : prev.activeSheetId
        }
      })
    } else if (type === 'row') {
      updateActiveSheet((sheet) => ({
        ...sheet,
        rows: sheet.rows.filter(r => r.id !== targetId)
      }))
    }
    setModalConfig(null)
  }

  if (loading) {
    return <div className="loading-state">Connecting to Custom Sheets…</div>
  }

  return (
    <>
      <nav className="top-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <img src="/logoek.png" alt="Sithira Madam — Live Your Own Palace" className="brand-logo-small" />
          <button 
            className={'nav-btn ' + (currentView === 'home' ? 'active' : '')} 
            onClick={() => setCurrentView('home')}
          >
            Tracker Home
          </button>
        </div>
        <div className="cs-tabs-header">
          {data.sheets.map((sheet) => (
            <div key={sheet.id} className={'cs-tab-group ' + (sheet.id === data.activeSheetId && currentView !== 'home' ? 'active' : '')}>
              <button
                className="cs-tab"
                onClick={() => {
                  updateData(prev => ({ ...prev, activeSheetId: sheet.id }))
                  setCurrentView('custom')
                }}
              >
                {sheet.title || 'Untitled'}
              </button>
              {isEditor && (
                <button 
                  className="cs-del-sheet" 
                  onClick={() => promptRemoveSheet(sheet.id)}
                  title="Delete sheet"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {isEditor && (
            <button className="cs-add-sheet" onClick={() => {
              addSheet()
              setCurrentView('custom')
            }}>+ New Sheet</button>
          )}
        </div>
        {authElement}
      </nav>

      {currentView !== 'home' && (
        <div className="custom-sheets-wrap">
          {syncError && (
            <div className="sync-banner">
              Couldn't reach the database — check your Firestore setup. Changes made now may not be saved.
            </div>
          )}

      {activeSheet && (
        <div className="cs-active-sheet">
          <div className="cs-header scoreboard">
            <div className="title-block" style={{ flex: 1, paddingRight: '1rem' }}>
              <input
                type="text"
                className="cs-title-input"
                value={activeSheet.title}
                onChange={(e) => updateActiveSheet(s => ({ ...s, title: e.target.value }))}
                placeholder="Sheet Title"
                disabled={!isEditor}
              />
              <ReactQuill
                theme="snow"
                className="cs-desc-quill"
                value={activeSheet.description || ''}
                onChange={(content) => updateActiveSheet(s => ({ ...s, description: content }))}
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
            <div className="mini-stat">Entries <b>{activeSheet.rows.length}</b></div>
            <div className="mini-stat">Submitted <b>{submittedCount}/{activeSheet.rows.length}</b></div>
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
                {visibleRows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={(row.submitted ? 'submitted' : 'pending')}
                  >
                    <td className="sl center" data-label="#">{activeSheet.rows.indexOf(row) + 1}</td>
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
                        <button className="row-del" title="Delete entry" aria-label="Delete entry" onClick={() => promptRemoveRow(row.id)}>✕</button>
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
        </div>
      )}

      {modalConfig && (
        <ConfirmModal
          isOpen={true}
          title={modalConfig.title}
          message={modalConfig.message}
          onConfirm={handleConfirm}
          onCancel={() => setModalConfig(null)}
        />
      )}
    </div>
    )}
    </>
  )
}
