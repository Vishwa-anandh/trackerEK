import ConfirmModal from './ConfirmModal'
import SubsheetPanel from './SubsheetPanel'
import './CustomSheets.css'
import { useState } from 'react'

export default function CustomSheets({ data, setData, isEditor, currentView, setCurrentView, authElement, updateSheetById }) {
  const [modalConfig, setModalConfig] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)

  function updateData(updater) {
    if (!isEditor) return
    setData((prev) => updater(prev))
  }

  // Tab reordering — the dragged sheet takes the target's slot and the rest shift.
  function moveSheet(sourceId, targetId) {
    if (sourceId === targetId) return
    updateData((prev) => {
      const from = prev.sheets.findIndex((s) => s.id === sourceId)
      const to = prev.sheets.findIndex((s) => s.id === targetId)
      if (from === -1 || to === -1) return prev
      const sheets = [...prev.sheets]
      const [moved] = sheets.splice(from, 1)
      sheets.splice(to, 0, moved)
      return { ...prev, sheets }
    })
  }

  function handleDragStart(e, id) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox refuses to start a drag unless some data is attached.
    e.dataTransfer.setData('text/plain', id)
  }

  function handleDragOver(e, id) {
    if (dragId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id !== dropTargetId) setDropTargetId(id)
  }

  function handleDrop(e, targetId) {
    if (dragId === null) return
    e.preventDefault()
    moveSheet(dragId, targetId)
    endDrag()
  }

  function endDrag() {
    setDragId(null)
    setDropTargetId(null)
  }

  // Navigation only — allowed for read-only viewers too. The debounced
  // save in App.jsx is editor-gated, so this never persists for visitors.
  function selectSheet(id) {
    setData((prev) => ({ ...prev, activeSheetId: id }))
    setCurrentView('custom')
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
          endDate: '',
          rows: [{ id: Date.now(), createdAt: Date.now(), date: new Date().toISOString().slice(0, 10), activity: '', submitted: false, startDate: '', endDate: '', score: 0, bonus: 0, remarks: '' }]
        }
      ],
      activeSheetId: id
    }))
  }

  const activeSheetIndex = data.sheets.findIndex(s => s.id === data.activeSheetId)
  const activeSheet = data.sheets[activeSheetIndex]
  const dragIndex = data.sheets.findIndex(s => s.id === dragId)

  function promptRemoveSheet(id) {
    setModalConfig({
      type: 'sheet',
      targetId: id,
      title: 'Delete Sheet',
      message: 'Are you sure you want to delete this sheet? This cannot be undone.',
      confirmText: 'Delete Sheet'
    })
  }

  function handleConfirm() {
    if (!modalConfig) return
    const { targetId } = modalConfig
    updateData((prev) => {
      const newSheets = prev.sheets.filter(s => s.id !== targetId)
      return {
        ...prev,
        sheets: newSheets,
        activeSheetId: prev.activeSheetId === targetId ? (newSheets[0]?.id || null) : prev.activeSheetId
      }
    })
    setModalConfig(null)
  }

  return (
    <>
      <nav className="top-nav">
        <div className="nav-brand">
          <img src="/logoek.png" alt="Sithira Madam — Live Your Own Palace" className="brand-logo-small" />
          <button
            className={'nav-btn ' + (currentView === 'home' ? 'active' : '')}
            onClick={() => setCurrentView('home')}
          >
            Tracker Home
          </button>
        </div>
        <div className="cs-tabs-header">
          {data.sheets.map((sheet, index) => {
            const classes = ['cs-tab-group']
            if (sheet.id === data.activeSheetId && currentView !== 'home') classes.push('active')
            if (dragId === sheet.id) classes.push('dragging')
            if (dropTargetId === sheet.id && dragId && dragId !== sheet.id) {
              // The marker sits on the edge the tab will actually land against.
              classes.push(dragIndex < index ? 'drop-after' : 'drop-before')
            }
            return (
            <div
              key={sheet.id}
              className={classes.join(' ')}
              draggable={isEditor}
              title={isEditor ? 'Drag to reorder' : undefined}
              onDragStart={isEditor ? (e) => handleDragStart(e, sheet.id) : undefined}
              onDragOver={isEditor ? (e) => handleDragOver(e, sheet.id) : undefined}
              onDrop={isEditor ? (e) => handleDrop(e, sheet.id) : undefined}
              onDragEnd={isEditor ? endDrag : undefined}
            >
              <button
                className="cs-tab"
                onClick={() => selectSheet(sheet.id)}
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
            )
          })}
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
          {activeSheet && (
            <SubsheetPanel
              sheet={activeSheet}
              isEditor={isEditor}
              onUpdateSheet={(updater) => updateSheetById(activeSheet.id, updater)}
            />
          )}
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
    </>
  )
}
