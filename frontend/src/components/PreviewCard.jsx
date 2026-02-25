// Preview Card - WhatsApp-like para validação de dados do OCR
import React from 'react';
import './PreviewCard.css';

export default function PreviewCard({ 
  imageUrl, 
  extractedFields, 
  doubtfulFields = [], 
  onConfirm, 
  onEdit, 
  onResend, 
  onSkip,
  isProcessing = false 
}) {
  if (!imageUrl) return null;

  const getConfidenceColor = (fieldName) => {
    if (doubtfulFields.includes(fieldName)) return 'doubtful';
    return 'confirmed';
  };

  return (
    <div className="preview-card">
      <div className="preview-card-header">
        <span className="preview-icon">🔍</span>
        <span className="preview-title">Validação de Dados</span>
      </div>

      <div className="preview-image-container">
        <img src={imageUrl} alt="Comprovante para validar" className="preview-image" />
      </div>

      <div className="preview-fields">
        {Object.entries(extractedFields).map(([key, value]) => (
          <div key={key} className={`preview-field ${getConfidenceColor(key)}`}>
            <span className="field-label">{key}</span>
            <span className="field-value">{value || '—'}</span>
            {doubtfulFields.includes(key) && (
              <span className="field-warning">⚠️</span>
            )}
          </div>
        ))}
      </div>

      <div className="preview-actions">
        <button 
          className="preview-btn confirm" 
          onClick={onConfirm}
          disabled={isProcessing}
        >
          ✅ Confirmar
        </button>
        <button 
          className="preview-btn edit" 
          onClick={onEdit}
          disabled={isProcessing}
        >
          ✏️ Editar
        </button>
        <button 
          className="preview-btn resend" 
          onClick={onResend}
          disabled={isProcessing}
        >
          🔄 Nova Foto
        </button>
        <button 
          className="preview-btn skip" 
          onClick={onSkip}
          disabled={isProcessing}
        >
          ⏭️ Pular
        </button>
      </div>
    </div>
  );
}
