import React from 'react';
import { X, Check } from 'lucide-react';
import './StudentSelectionModal.css';

export interface StudentResult {
  id: string;
  name: string;
  enrollment_number: string;
  type?: 'student' | 'employee';
  grade?: string;
  class_group?: string;
  balance: number;
  photo_url?: string | null;
  guardian_name?: string | null;
  linked_guardian_names?: string | null;
}

interface StudentSelectionModalProps {
  isOpen: boolean;
  students: StudentResult[];
  searchTerm: string;
  onSelect: (student: StudentResult) => void;
  onClose: () => void;
}

export const StudentSelectionModal: React.FC<StudentSelectionModalProps> = ({
  isOpen,
  students,
  searchTerm,
  onSelect,
  onClose,
}) => {
  if (!isOpen) return null;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="modal-overlay animate-fadeIn" style={{ zIndex: 1100 }}>
      <div className="student-selection-modal animate-scaleIn">
        <div className="modal-header">
          <div>
            <h3>Selecionar Cliente</h3>
            <p className="modal-subtitle">
              {students.length} resultado(s) para "{searchTerm}"
            </p>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="student-selection-list">
          {students.map((s) => (
            <div
              key={s.id}
              className="student-selection-item"
              onClick={() => onSelect(s)}
            >
              <div className="student-avatar">
                {s.photo_url ? (
                  <img src={s.photo_url} alt={s.name} />
                ) : (
                  <div className="avatar-placeholder">
                    {s.name ? s.name.substring(0, 2).toUpperCase() : 'CL'}
                  </div>
                )}
              </div>
              <div className="student-info">
                <div className="student-name" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {s.name}
                  {s.type === 'employee' ? (
                    <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '8px', background: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}>Funcionário</span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '8px', background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>Aluno</span>
                  )}
                </div>
                <div className="student-meta">
                  <span>Matrícula: {s.enrollment_number}</span>
                  {s.class_group && <span> • {s.class_group}</span>}
                  {(s.guardian_name || s.linked_guardian_names) && (
                    <span> • Resp: {s.guardian_name || s.linked_guardian_names}</span>
                  )}
                </div>
              </div>
              <div className="student-balance-tag">
                <span>Saldo:</span>
                <strong>{formatCurrency(Number(s.balance || 0))}</strong>
              </div>
              <button className="btn btn-primary btn-sm select-btn">
                <Check size={16} /> Selecionar
              </button>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
