import React from 'react';
import './ConfirmModal.css';

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = "Delete", cancelText = "Cancel" }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 className="modal-title">{title}</h3>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>{cancelText}</button>
          <button className="modal-btn confirm" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
