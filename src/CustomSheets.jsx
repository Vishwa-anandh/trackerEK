import { useEffect, useState, useRef } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { exportGenericCsv, exportGenericPdf, exportGenericDoc } from './export'
import ConfirmModal from './ConfirmModal'
import { db } from './firebase'
import './CustomSheets.css'

const sheetsRef = doc(db, 'trackers', 'custom_sheets')

export default function CustomSheets({ isEditor }) {
  const [data, setData] = useState({ sheets: [], activeSheetId: null })
  const [loading, setLoading] = useState(true)
  const [syncError, setSyncError] = useState(false)
  const [modalConfig, setModalConfig] = useState(null)
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
                columns: [{ id: 'col_' + Date.now(), name: 'Column 1' }],
                rows: [{ id: 'row_' + Date.now() }]
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
          columns: [{ id: 'col_' + Date.now(), name: 'Column 1' }],
          rows: [{ id: 'row_' + Date.now() }]
        }
      ],
      activeSheetId: id
    }))
  }

  const activeSheetIndex = data.sheets.findIndex(s => s.id === data.activeSheetId)
  const activeSheet = data.sheets[activeSheetIndex]

  function updateActiveSheet(updater) {
    updateData((prev) => {
      const idx = prev.sheets.findIndex(s => s.id === prev.activeSheetId)
      if (idx === -1) return prev
      const newSheets = [...prev.sheets]
      newSheets[idx] = updater(newSheets[idx])
      return { ...prev, sheets: newSheets }
    })
  }

  function addColumn() {
    updateActiveSheet((sheet) => ({
      ...sheet,
      columns: [...sheet.columns, { id: 'col_' + Date.now(), name: 'New Column' }]
    }))
  }

  function updateColumnName(colId, name) {
    updateActiveSheet((sheet) => ({
      ...sheet,
      columns: sheet.columns.map(c => c.id === colId ? { ...c, name } : c)
    }))
  }

  function promptRemoveSheet(sheetId) {
    setModalConfig({ type: 'sheet', targetId: sheetId, title: 'Delete Sheet', message: 'Are you sure you want to delete this sheet?' })
  }

  function promptRemoveColumn(colId) {
    setModalConfig({ type: 'column', targetId: colId, title: 'Delete Column', message: 'Are you sure you want to delete this column and all its data?' })
  }

  function addRow() {
    updateActiveSheet((sheet) => ({
      ...sheet,
      rows: [...sheet.rows, { id: 'row_' + Date.now() }]
    }))
  }

  function promptRemoveRow(rowId) {
    setModalConfig({ type: 'row', targetId: rowId, title: 'Delete Row', message: 'Are you sure you want to delete this row?' })
  }

  function runExport(fn) {
    const sheet = data.sheets.find(s => s.id === data.activeSheetId)
    if (!sheet) return
    const title = sheet.title || 'Untitled Sheet'
    const prefix = title.toLowerCase().replace(/\s+/g, '-') || 'custom-sheet'
    const headers = ['#', ...sheet.columns.map(c => c.name)]
    const records = sheet.rows.map((r, i) => [
      String(i + 1),
      ...sheet.columns.map(c => r[c.id] || '')
    ])
    fn(headers, records, prefix, title)
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
    } else if (type === 'column') {
      updateActiveSheet((sheet) => ({
        ...sheet,
        columns: sheet.columns.filter(c => c.id !== targetId),
      }))
    } else if (type === 'row') {
      updateActiveSheet((sheet) => ({
        ...sheet,
        rows: sheet.rows.filter(r => r.id !== targetId)
      }))
    }
    setModalConfig(null)
  }

  function updateCell(rowId, colId, value) {
    updateActiveSheet((sheet) => ({
      ...sheet,
      rows: sheet.rows.map(r => r.id === rowId ? { ...r, [colId]: value } : r)
    }))
  }

  if (loading) {
    return <div className="loading-state">Connecting to Custom Sheets…</div>
  }

  return (
    <div className="custom-sheets-wrap">
      {syncError && (
        <div className="sync-banner">
          Couldn't reach the database — check your Firestore setup. Changes made now may not be saved.
        </div>
      )}

      <div className="cs-tabs">
        {data.sheets.map((sheet) => (
          <div key={sheet.id} className={'cs-tab-group ' + (sheet.id === data.activeSheetId ? 'active' : '')}>
            <button
              className="cs-tab"
              onClick={() => updateData(prev => ({ ...prev, activeSheetId: sheet.id }))}
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
          <button className="cs-add-sheet" onClick={addSheet}>+ New Sheet</button>
        )}
      </div>

      {activeSheet && (
        <div className="cs-active-sheet">
          <div className="cs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, paddingRight: '1rem' }}>
              <input
                type="text"
                className="cs-title-input"
                value={activeSheet.title}
                onChange={(e) => updateActiveSheet(s => ({ ...s, title: e.target.value }))}
                placeholder="Sheet Title"
                disabled={!isEditor}
              />
              <input
                type="text"
                className="cs-desc-input"
                value={activeSheet.description}
                onChange={(e) => updateActiveSheet(s => ({ ...s, description: e.target.value }))}
                placeholder="Description..."
                disabled={!isEditor}
              />
            </div>
            <div>
              <details className="export-menu" ref={exportMenuRef}>
                <summary className="export-trigger">Export ▾</summary>
                <div className="export-list" role="menu">
                  <button role="menuitem" onClick={() => runExport(exportGenericCsv)}>Excel (.csv)</button>
                  <button role="menuitem" onClick={() => runExport(exportGenericPdf)}>PDF</button>
                  <button role="menuitem" onClick={() => runExport(exportGenericDoc)}>Word (.doc)</button>
                </div>
              </details>
            </div>
          </div>

          <div className="cs-table-container">
            <table className="cs-table">
              <thead>
                <tr>
                  <th style={{ width: '3rem' }}>#</th>
                  {activeSheet.columns.map((col) => (
                    <th key={col.id}>
                      <div className="cs-col-header">
                        <input 
                          type="text" 
                          className="cs-col-name-input"
                          value={col.name}
                          onChange={(e) => updateColumnName(col.id, e.target.value)}
                          disabled={!isEditor}
                        />
                        {isEditor && (
                          <button 
                            className="cs-del-col" 
                            title="Delete column" 
                            onClick={() => promptRemoveColumn(col.id)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  {isEditor && (
                    <th style={{ width: '8rem' }}>
                      <button className="cs-add-col" onClick={addColumn}>+ Column</button>
                    </th>
                  )}
                  {isEditor && <th style={{ width: '3rem' }}></th>}
                </tr>
              </thead>
              <tbody>
                {activeSheet.rows.map((row, i) => (
                  <tr key={row.id}>
                    <td className="cs-sl center">{i + 1}</td>
                    {activeSheet.columns.map((col) => (
                      <td key={col.id}>
                        <input
                          type="text"
                          value={row[col.id] || ''}
                          onChange={(e) => updateCell(row.id, col.id, e.target.value)}
                          disabled={!isEditor}
                        />
                      </td>
                    ))}
                    {isEditor && <td />}
                    {isEditor && (
                      <td>
                        <button className="cs-del-row" title="Delete row" onClick={() => promptRemoveRow(row.id)}>✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {isEditor && (
              <button className="cs-add-row" onClick={addRow}>+ Add row</button>
            )}
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={modalConfig !== null}
        title={modalConfig?.title}
        message={modalConfig?.message}
        onConfirm={handleConfirm}
        onCancel={() => setModalConfig(null)}
      />
    </div>
  )
}
