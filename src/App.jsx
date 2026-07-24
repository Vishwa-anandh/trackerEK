import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth, db } from './firebase'
import './App.css'
import { exportCsv, exportDoc, exportPdf } from './export'
import CustomSheets from './CustomSheets'
import ConfirmModal from './ConfirmModal'

const trackerRef = doc(db, 'trackers', 'main')
const OWNER_EMAIL = import.meta.env.VITE_OWNER_EMAIL

const seed = [
  { id: 1, date: '2026-07-23', activity: 'Brand Poster', submitted: true, startDate: '', endDate: '', score: 50, bonus: 0, remarks: 'Best Script' },
  { id: 2, date: '2026-07-24', activity: 'Chief Guest Intro', submitted: true, startDate: '', endDate: '', score: 30, bonus: 20, remarks: 'Presented on stage' },
  { id: 3, date: '2026-07-24', activity: 'EKT Test', submitted: true, startDate: '', endDate: '', score: 15, bonus: 0, remarks: '' },
]

function num(v) {
  const n = parseFloat(v)
  return Number.isNaN(n) ? 0 : n
}

function total(row) {
  return num(row.score) + num(row.bonus)
}

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

  const grandTotal = useMemo(() => rows.reduce((sum, r) => sum + total(r), 0), [rows])
  const submittedCount = useMemo(() => rows.filter((r) => r.submitted).length, [rows])
  const rate = rows.length ? Math.round((submittedCount / rows.length) * 100) : 0
  const scoreSum = useMemo(() => rows.reduce((sum, r) => sum + num(r.score), 0), [rows])
  const bonusSum = useMemo(() => rows.reduce((sum, r) => sum + num(r.bonus), 0), [rows])

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

  const visibleRows = rows.filter((row) => {
    if (filter === 'submitted' && !row.submitted) return false
    if (filter === 'pending' && row.submitted) return false
    if (search && !row.activity.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  function updateRow(id, field, value) {
    if (!isEditor) return
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  function toggleSubmitted(id) {
    if (!isEditor) return
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, submitted: !r.submitted } : r)))
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

  function deleteRow(id) {
    if (!isEditor) return
    setEntryToDelete(id)
  }

  function confirmDeleteRow() {
    if (entryToDelete === null) return
    const id = entryToDelete
    setEntryToDelete(null)
    setFadingId(id)
    setTimeout(() => {
      setRows((prev) => prev.filter((r) => r.id !== id))
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
    const title = name ? `${name} — Ryla 61.0 Tracker` : 'Ryla 61.0 Tracker'
    const prefix = (name ? `${name}-scorecard` : 'scorecard').toLowerCase().replace(/\s+/g, '-')
    fn(rows, total, prefix, title)
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
      <CustomSheets isEditor={isEditor} currentView={currentView} setCurrentView={setCurrentView} />

      {currentView === 'home' && (
        <div className="wrap">
      <div className="header-bar">
        <img src="/logoek.png" alt="Sithira Madam — Live Your Own Palace" className="brand-logo" />
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
      </div>

      {syncError && (
        <div className="sync-banner">
          Couldn't reach the database — check your Firestore setup. Changes made now may not be saved.
        </div>
      )}
      <div className="scoreboard">
        <div className="title-block">
          <h1>Ryla 61.0 Tracker</h1>
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
        <div className="mini-stat">Entries <b>{rows.length}</b></div>
        <div className="mini-stat">Submitted <b>{submittedCount}/{rows.length}</b></div>
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
            {visibleRows.map((row, i) => {
              const isLast = i === visibleRows.length - 1
              return (
                <tr
                  key={row.id}
                  className={(row.submitted ? 'submitted' : 'pending') + (fadingId === row.id ? ' fade-out' : '')}
                >
                  <td className="sl center" data-label="#">{rows.indexOf(row) + 1}</td>
                  <td data-label="Date">
                    <input
                      type="date"
                      value={row.date}
                      disabled={!isEditor}
                      onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                    />
                  </td>
                  <td data-label="Activity">
                    <input
                      type="text"
                      placeholder="Activity name"
                      value={row.activity}
                      disabled={!isEditor}
                      ref={isLast ? lastActivityRef : null}
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
                    <input
                      type="date"
                      value={row.startDate || ''}
                      disabled={!isEditor}
                      onChange={(e) => updateRow(row.id, 'startDate', e.target.value)}
                    />
                  </td>
                  <td data-label="End Date">
                    <input
                      type="date"
                      value={row.endDate || ''}
                      disabled={!isEditor}
                      onChange={(e) => updateRow(row.id, 'endDate', e.target.value)}
                    />
                  </td>
                  <td className="num" data-label="Score">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={row.score}
                      disabled={!isEditor}
                      onChange={(e) => updateRow(row.id, 'score', e.target.value)}
                    />
                  </td>
                  <td className="num" data-label="Bonus">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={row.bonus}
                      disabled={!isEditor}
                      onChange={(e) => updateRow(row.id, 'bonus', e.target.value)}
                    />
                  </td>
                  <td className="num total-cell" data-label="Total">{total(row)}</td>
                  <td data-label="Remarks">
                    <input
                      type="text"
                      placeholder="–"
                      value={row.remarks}
                      disabled={!isEditor}
                      onKeyDown={(e) => handleRemarksKeyDown(e, isLast)}
                      onChange={(e) => updateRow(row.id, 'remarks', e.target.value)}
                    />
                  </td>
                  <td className="row-actions" data-label="">
                    {isEditor && (
                      <button className="row-del" title="Delete entry" aria-label="Delete entry" onClick={() => deleteRow(row.id)}>✕</button>
                    )}
                  </td>
                </tr>
              )
            })}
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
