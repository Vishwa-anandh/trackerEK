import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth, db } from './firebase'
import './App.css'
import { exportCsv, exportDoc, exportPdf } from './export'
import CustomSheets from './CustomSheets'
import ConfirmModal from './ConfirmModal'
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import "./DatePicker.css"
import { parseDateStr, formatDateStr, total, sumSubmitted } from './sheetUtils'

const trackerRef = doc(db, 'trackers', 'main')
const sheetsRef = doc(db, 'trackers', 'custom_sheets')
const OWNER_EMAIL = import.meta.env.VITE_OWNER_EMAIL

const seed = [
  { id: 1, date: '2026-07-23', activity: 'Brand Poster', submitted: true, startDate: '', endDate: '', score: 50, bonus: 0, remarks: 'Best Script' },
  { id: 2, date: '2026-07-24', activity: 'Chief Guest Intro', submitted: true, startDate: '', endDate: '', score: 30, bonus: 20, remarks: 'Presented on stage' },
  { id: 3, date: '2026-07-24', activity: 'EKT Test', submitted: true, startDate: '', endDate: '', score: 15, bonus: 0, remarks: '' },
]

function App() {
  const [currentView, setCurrentView] = useState('home')
  const [rows, setRows] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncError, setSyncError] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showSaved, setShowSaved] = useState(false)
  const [bump, setBump] = useState(false)
  const [fadingId, setFadingId] = useState(null)
  const lastActivityRef = useRef(null)
  const exportMenuRef = useRef(null)
  const saveTimer = useRef(null)
  const bumpTimer = useRef(null)
  const prevGrandTotal = useRef(null)
  const hydrated = useRef(false)
  const nextIdRef = useRef(1)

  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState(null)
  const isEditor = !!user

  const [sheetsData, setSheetsData] = useState({ sheets: [], activeSheetId: null })
  const sheetsHydrated = useRef(false)
  const sheetsSaveTimer = useRef(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAuthChecked(true)
    })
    return unsubscribe
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setAuthError('')
    setSigningIn(true)
    try {
      await signInWithEmailAndPassword(auth, OWNER_EMAIL, password)
      setPassword('')
      setShowLogin(false)
    } catch {
      setAuthError('Incorrect password')
    } finally {
      setSigningIn(false)
    }
  }

  function handleLogout() {
    signOut(auth)
  }

  useEffect(() => {
    if (!authChecked) return
    const unsubscribe = onSnapshot(
      trackerRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          setRows(data.rows || [])
          setName(data.name || '')
          nextIdRef.current = Math.max(0, ...(data.rows || []).map((r) => r.id)) + 1
        } else if (auth.currentUser) {
          setDoc(trackerRef, { rows: seed, name: '' })
          nextIdRef.current = Math.max(0, ...seed.map((r) => r.id)) + 1
        } else {
          setRows([])
          setName('')
        }
        hydrated.current = true
        setLoading(false)
      },
      (err) => {
        console.error('Firestore listen failed', err)
        setSyncError(true)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [authChecked])

  useEffect(() => {
    if (!hydrated.current || !isEditor) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setDoc(trackerRef, { rows, name }, { merge: true })
        .then(() => {
          setShowSaved(true)
          setTimeout(() => setShowSaved(false), 900)
        })
        .catch((err) => {
          console.error('Firestore save failed', err)
          setSyncError(true)
        })
    }, 500)
    return () => clearTimeout(saveTimer.current)
  }, [rows, name, isEditor])

  useEffect(() => {
    if (!authChecked) return
    const unsubscribe = onSnapshot(
      sheetsRef,
      (snap) => {
        if (snap.exists()) {
          const fetchedData = snap.data()
          if (!fetchedData.activeSheetId && fetchedData.sheets?.length > 0) {
            fetchedData.activeSheetId = fetchedData.sheets[0].id
          }
          setSheetsData(fetchedData)
        } else if (auth.currentUser) {
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
        } else {
          setSheetsData({ sheets: [], activeSheetId: null })
        }
        sheetsHydrated.current = true
      },
      (err) => {
        console.error('Firestore listen failed', err)
        setSyncError(true)
      },
    )
    return unsubscribe
  }, [authChecked])

  useEffect(() => {
    if (!sheetsHydrated.current || !isEditor) return
    clearTimeout(sheetsSaveTimer.current)
    sheetsSaveTimer.current = setTimeout(() => {
      setDoc(sheetsRef, sheetsData, { merge: true })
        .catch((err) => {
          console.error('Firestore save failed', err)
          setSyncError(true)
        })
    }, 500)
    return () => clearTimeout(sheetsSaveTimer.current)
  }, [sheetsData, isEditor])

  function updateSheetById(id, updater) {
    if (!isEditor) return
    setSheetsData((prev) => {
      const idx = prev.sheets.findIndex((s) => s.id === id)
      if (idx === -1) return prev
      const newSheets = [...prev.sheets]
      newSheets[idx] = updater(newSheets[idx])
      return { ...prev, sheets: newSheets }
    })
  }

  const MAIN_LABEL = 'Ryla 61.0 Tracker'

  // Every entry across the main sheet + all subsheets, each tagged with its source sheet.
  const combinedEntries = useMemo(() => {
    const main = rows.map((r) => ({ row: r, source: 'main', sheetTitle: MAIN_LABEL }))
    const subs = sheetsData.sheets.flatMap((s) =>
      s.rows.map((r) => ({ row: r, source: s.id, sheetTitle: s.title || 'Untitled' }))
    )
    return [...main, ...subs]
  }, [rows, sheetsData])

  // Only submitted entries count toward the totals.
  const { score: scoreSum, bonus: bonusSum, total: grandTotal } = useMemo(
    () => sumSubmitted(combinedEntries.map((e) => e.row)),
    [combinedEntries]
  )
  const submittedCount = useMemo(() => combinedEntries.filter((e) => e.row.submitted).length, [combinedEntries])
  const totalEntries = combinedEntries.length
  const rate = totalEntries ? Math.round((submittedCount / totalEntries) * 100) : 0

  useEffect(() => {
    function closeOnOutsideClick(e) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        exportMenuRef.current.open = false
      }
    }
    document.addEventListener('click', closeOnOutsideClick)
    return () => document.removeEventListener('click', closeOnOutsideClick)
  }, [])

  useEffect(() => {
    if (prevGrandTotal.current !== null && prevGrandTotal.current !== grandTotal) {
      setBump(true)
      clearTimeout(bumpTimer.current)
      bumpTimer.current = setTimeout(() => setBump(false), 180)
    }
    prevGrandTotal.current = grandTotal
    return () => clearTimeout(bumpTimer.current)
  }, [grandTotal])

  const visibleEntries = combinedEntries.filter((e) => {
    if (filter === 'submitted' && !e.row.submitted) return false
    if (filter === 'pending' && e.row.submitted) return false
    if (search && !(e.row.activity || '').toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  function updateRow(source, id, field, value) {
    if (!isEditor) return
    if (source === 'main') {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
    } else {
      updateSheetById(source, (s) => ({
        ...s,
        rows: s.rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
      }))
    }
  }

  function toggleSubmitted(source, id) {
    if (!isEditor) return
    if (source === 'main') {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, submitted: !r.submitted } : r)))
    } else {
      updateSheetById(source, (s) => ({
        ...s,
        rows: s.rows.map((r) => (r.id === id ? { ...r, submitted: !r.submitted } : r)),
      }))
    }
  }

  function addRow() {
    if (!isEditor) return
    const id = nextIdRef.current++
    setRows((prev) => [
      ...prev,
      { id, date: new Date().toISOString().slice(0, 10), activity: '', submitted: false, startDate: '', endDate: '', score: 0, bonus: 0, remarks: '' },
    ])
    requestAnimationFrame(() => lastActivityRef.current?.focus())
  }

  function deleteRow(source, id) {
    if (!isEditor) return
    setEntryToDelete({ source, id })
  }

  function confirmDeleteRow() {
    if (!entryToDelete) return
    const { source, id } = entryToDelete
    setEntryToDelete(null)
    setFadingId(`${source}-${id}`)
    setTimeout(() => {
      if (source === 'main') {
        setRows((prev) => prev.filter((r) => r.id !== id))
      } else {
        updateSheetById(source, (s) => ({ ...s, rows: s.rows.filter((r) => r.id !== id) }))
      }
      setFadingId(null)
    }, 140)
  }

  function handleRemarksKeyDown(e, isLast) {
    if (e.key === 'Enter' && isLast) {
      e.preventDefault()
      addRow()
    }
  }

  function runExport(fn) {
    const title = name ? `${name} — Overall (All Sheets)` : 'Overall (All Sheets)'
    const prefix = (name ? `${name}-overall` : 'overall').toLowerCase().replace(/\s+/g, '-')
    fn(combinedEntries.map((e) => e.row), total, prefix, title)
    if (exportMenuRef.current) exportMenuRef.current.open = false
  }

  if (loading) {
    return (
      <div className="wrap">
        <div className="loading-state">Connecting to database…</div>
      </div>
    )
  }

  return (
    <>
      <CustomSheets
        data={sheetsData}
        setData={setSheetsData}
        updateSheetById={updateSheetById}
        isEditor={isEditor}
        currentView={currentView}
        setCurrentView={setCurrentView}
        authElement={
          <div className="auth-bar">
            {isEditor ? (
              <button type="button" className="auth-chip" onClick={handleLogout}>🔓 Signed in · Sign out</button>
            ) : showLogin ? (
              <form className="login-box" onSubmit={handleLogin}>
                <input
                  type="password"
                  placeholder="Password"
                  aria-label="Password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="submit" className="auth-chip primary" disabled={signingIn}>{signingIn ? '…' : 'Enter'}</button>
                <button type="button" className="auth-chip" onClick={() => { setShowLogin(false); setAuthError('') }}>Cancel</button>
                {authError && <span className="auth-error">{authError}</span>}
              </form>
            ) : (
              <button type="button" className="auth-chip" onClick={() => setShowLogin(true)}>🔒 Sign in</button>
            )}
          </div>
        }
      />

      {currentView === 'home' && (
        <div className="wrap">

      {syncError && (
        <div className="sync-banner">
          Couldn't reach the database — check your Firestore setup. Changes made now may not be saved.
        </div>
      )}
      <div className="scoreboard">
        <div className="title-block">
          <h1>Overall</h1>
          <input
            className="name-field"
            type="text"
            placeholder="Add your name"
            aria-label="Your name"
            value={name}
            disabled={!isEditor}
            onChange={(e) => setName(e.target.value)}
          />

        </div>
        <div className="grand-tile">
          <span className="label">Grand total</span>
          <span className={'num' + (bump ? ' bump' : '')}>{grandTotal}</span>
        </div>
      </div>

      <div className="mini-stats">
        <div className="mini-stat">Entries <b>{totalEntries}</b></div>
        <div className="mini-stat">Submitted <b>{submittedCount}/{totalEntries}</b></div>
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

      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th className="center" style={{ width: '2.5rem' }}>#</th>
              <th style={{ width: '9.5rem' }}>Date</th>
              <th>Activity</th>
              <th style={{ width: '10rem' }}>Sheet</th>
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
            {visibleEntries.map((entry, i) => {
              const { row, source, sheetTitle } = entry
              const isLast = i === visibleEntries.length - 1
              const rowKey = `${source}-${row.id}`
              return (
                <tr
                  key={rowKey}
                  className={(row.submitted ? 'submitted' : 'pending') + (fadingId === rowKey ? ' fade-out' : '')}
                >
                  <td className="sl center" data-label="#">{i + 1}</td>
                  <td data-label="Date">
                    <DatePicker
                      selected={parseDateStr(row.date)}
                      onChange={(date) => updateRow(source, row.id, 'date', formatDateStr(date))}
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
                      ref={isLast ? lastActivityRef : null}
                      onChange={(e) => updateRow(source, row.id, 'activity', e.target.value)}
                    />
                  </td>
                  <td data-label="Sheet">
                    <span className="sheet-tag">{sheetTitle}</span>
                  </td>
                  <td className="center" data-label="Submitted">
                    <button
                      type="button"
                      className={'check ' + (row.submitted ? 'yes' : 'no')}
                      aria-pressed={row.submitted}
                      aria-label="Toggle submitted"
                      disabled={!isEditor}
                      onClick={() => toggleSubmitted(source, row.id)}
                    >
                      {row.submitted ? '✓' : '✕'}
                    </button>
                  </td>
                  <td data-label="Start Date">
                    <DatePicker
                      selected={parseDateStr(row.startDate)}
                      onChange={(date) => updateRow(source, row.id, 'startDate', formatDateStr(date))}
                      disabled={!isEditor}
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Start Date"
                      isClearable={isEditor}
                    />
                  </td>
                  <td data-label="End Date">
                    <DatePicker
                      selected={parseDateStr(row.endDate)}
                      onChange={(date) => updateRow(source, row.id, 'endDate', formatDateStr(date))}
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
                      onChange={(e) => updateRow(source, row.id, 'score', e.target.value)}
                    />
                  </td>
                  <td className="num" data-label="Bonus">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={row.bonus ?? ''}
                      disabled={!isEditor}
                      onChange={(e) => updateRow(source, row.id, 'bonus', e.target.value)}
                    />
                  </td>
                  <td className="num total-cell" data-label="Total">{total(row)}</td>
                  <td data-label="Remarks">
                    <input
                      type="text"
                      placeholder="–"
                      value={row.remarks || ''}
                      disabled={!isEditor}
                      onKeyDown={(e) => handleRemarksKeyDown(e, isLast)}
                      onChange={(e) => updateRow(source, row.id, 'remarks', e.target.value)}
                    />
                  </td>
                  <td className="row-actions" data-label="">
                    {isEditor && (
                      <button className="row-del" title="Delete entry" aria-label="Delete entry" onClick={() => deleteRow(source, row.id)}>✕</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {isEditor && (
              <tr className="add-row">
                <td colSpan={12}>
                  <button type="button" className="add-entry-btn" onClick={addRow}>+ Add entry (to {MAIN_LABEL})</button>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} className="foot-label" data-label="">Overall</td>
              <td className="num foot-total" data-label="Score">{scoreSum}</td>
              <td className="num foot-total" data-label="Bonus">{bonusSum}</td>
              <td className="num foot-total" data-label="Total">{grandTotal}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
        {visibleEntries.length === 0 && (
          <div className="empty">
            <strong>No entries match</strong>
            <span>Try a different filter or search, or add a new activity above.</span>
          </div>
        )}
      </div>

      <div className="footer-row">
        <span className="save-note">
          <span className={'save-dot' + (showSaved ? ' show' : '')} />
          <span>Synced to your database</span>
        </span>
      </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={entryToDelete !== null}
        title="Delete Entry"
        message="Are you sure you want to delete this entry? This cannot be undone."
        onConfirm={confirmDeleteRow}
        onCancel={() => setEntryToDelete(null)}
      />
    </>
  )
}

export default App
