import ConfirmModal from './ConfirmModal'
import SubsheetPanel from './SubsheetPanel'
import './CustomSheets.css'
import { useState } from 'react'

export default function CustomSheets({ data, setData, isEditor, currentView, setCurrentView, authElement, updateSheetById }) {
  const [modalConfig, setModalConfig] = useState(null)

  function updateData(updater) {
    if (!isEditor) return
    setData((prev) => updater(prev))
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
          rows: [{ id: Date.now(), date: new Date().toISOString().slice(0, 10), activity: '', submitted: false, startDate: '', endDate: '', score: 0, bonus: 0, remarks: '' }]
        }
      ],
      activeSheetId: id
    }))
  }

  const activeSheetIndex = data.sheets.findIndex(s => s.id === data.activeSheetId)
  const activeSheet = data.sheets[activeSheetIndex]

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
