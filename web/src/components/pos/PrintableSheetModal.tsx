import React, { useState, useMemo } from 'react';
import { X, Printer, Filter, ArrowUpDown, Search, CheckSquare, Square } from 'lucide-react';
import { QRCodeSVG } from '../common/QRCodeSVG';

interface StudentItem {
  student_id: string;
  student_name: string;
  grade?: string;
  class_group?: string;
  enrollment_number?: string;
  total_debt?: number;
}

interface PrintableSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentItem[];
}

export const PrintableSheetModal: React.FC<PrintableSheetModalProps> = ({
  isOpen,
  onClose,
  students,
}) => {
  const [sortBy, setSortBy] = useState<'nome' | 'debito'>('nome');
  const [sortAsc, setSortAsc] = useState(true);
  const [gradeFilter, setGradeFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [onlyDebtors, setOnlyDebtors] = useState(false);

  // Extract unique grades/classes for filtering
  const availableGrades = useMemo(() => {
    const gradesSet = new Set<string>();
    students.forEach((s) => {
      if (s.grade) gradesSet.add(s.grade);
    });
    return Array.from(gradesSet).sort();
  }, [students]);

  // Filter & Sort students
  const filteredStudents = useMemo(() => {
    let list = [...students];

    if (onlyDebtors) {
      list = list.filter((s) => (s.total_debt || 0) > 0);
    }

    if (gradeFilter !== 'todos') {
      list = list.filter((s) => s.grade === gradeFilter);
    }

    if (search.trim()) {
      const term = search.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.student_name.toLowerCase().includes(term) ||
          (s.enrollment_number && s.enrollment_number.toLowerCase().includes(term)) ||
          (s.grade && s.grade.toLowerCase().includes(term))
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'nome') {
        const cmp = a.student_name.localeCompare(b.student_name, 'pt-BR');
        return sortAsc ? cmp : -cmp;
      } else {
        const cmp = (a.total_debt || 0) - (b.total_debt || 0);
        return sortAsc ? cmp : -cmp;
      }
    });

    return list;
  }, [students, sortBy, sortAsc, gradeFilter, search, onlyDebtors]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const todayStr = new Date().toLocaleDateString('pt-BR');

  return (
    <div className="modal-overlay animate-fadeIn" style={{ zIndex: 1100 }}>
      <div
        className="modal-content print-sheet-modal-content"
        style={{
          maxWidth: '900px',
          width: '95%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: '16px',
        }}
      >
        {/* Modal Header (No Print) */}
        <div
          className="no-print"
          style={{
            padding: '1.25rem 1.5rem',
            background: 'var(--bg-card, #ffffff)',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
              🖨️ Folha Impressa com QR Code (Fiado A Prazo)
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Gere e imprima a lista A4 dos alunos com QR Code para anotação rápida de consumo.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontWeight: 700,
                padding: '0.65rem 1.25rem',
                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                borderColor: '#16a34a',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
              }}
            >
              <Printer size={18} /> Imprimir Folha A4
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: '0.5rem' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Controls Bar (No Print) */}
        <div
          className="no-print"
          style={{
            padding: '0.85rem 1.5rem',
            background: 'var(--bg-hover, #f8fafc)',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
          }}
        >
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Buscar aluno por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '2.2rem', fontSize: '0.85rem' }}
            />
          </div>

          {/* Grade Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Filter size={15} style={{ color: '#64748b' }} />
            <select
              className="form-input"
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
            >
              <option value="todos">Todas as Turmas ({students.length})</option>
              {availableGrades.map((g) => (
                <option key={g} value={g}>
                  Turma / Série: {g}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Order */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ArrowUpDown size={15} style={{ color: '#64748b' }} />
            <select
              className="form-input"
              value={`${sortBy}-${sortAsc ? 'asc' : 'desc'}`}
              onChange={(e) => {
                const [sb, sa] = e.target.value.split('-');
                setSortBy(sb as any);
                setSortAsc(sa === 'asc');
              }}
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
            >
              <option value="nome-asc">Ordem Alfabética (A-Z)</option>
              <option value="nome-desc">Ordem Alfabética (Z-A)</option>
              <option value="debito-desc">Maior Débito Primeiro</option>
            </select>
          </div>

          {/* Debtors Toggle */}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setOnlyDebtors(!onlyDebtors)}
            style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {onlyDebtors ? <CheckSquare size={16} color="#16a34a" /> : <Square size={16} color="#94a3b8" />}
            Apenas Devedores
          </button>
        </div>

        {/* Printable Paper Preview Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#e2e8f0' }}>
          <div
            id="printable-fiado-sheet"
            className="printable-paper"
            style={{
              background: '#ffffff',
              maxWidth: '800px',
              margin: '0 auto',
              padding: '2rem',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              color: '#000000',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            {/* Paper Header */}
            <div style={{ borderBottom: '2px solid #000000', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    🏫 CANTINA ESCOLAR — FICHA DE CONSUMO FIADO (A PRAZO)
                  </h1>
                  <span style={{ fontSize: '0.85rem', color: '#333333' }}>
                    Folha diária de anotação rápida de consumo por QR Code
                  </span>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 'bold' }}>
                  Total: {filteredStudents.length} Alunos
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '1rem',
                  paddingTop: '0.5rem',
                  borderTop: '1px stroke #cccccc',
                  fontSize: '0.9rem',
                }}
              >
                <div>
                  <strong>Data:</strong> ____ / ____ / 2026 &nbsp;&nbsp;|&nbsp;&nbsp; <strong>Impresso em:</strong> {todayStr}
                </div>
                <div>
                  <strong>Caixa / Operador:</strong> ____________________________
                </div>
              </div>
            </div>

            {/* Students Printable Table */}
            {filteredStudents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666666' }}>
                Nenhum aluno encontrado para os filtros selecionados.
              </div>
            ) : (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #000000' }}>
                    <th style={{ padding: '8px', textTransform: 'uppercase', width: '75px', textAlign: 'center' }}>
                      QR Code
                    </th>
                    <th style={{ padding: '8px', textTransform: 'uppercase', textAlign: 'left' }}>
                      Aluno(a) / Turma / Matrícula
                    </th>
                    <th style={{ padding: '8px', textTransform: 'uppercase', width: '180px', textAlign: 'center' }}>
                      Valor Consumido (R$)
                    </th>
                    <th style={{ padding: '8px', textTransform: 'uppercase', width: '130px', textAlign: 'center' }}>
                      Assinatura / Visto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student, idx) => (
                    <tr
                      key={student.student_id}
                      style={{
                        borderBottom: '1px solid #cbd5e1',
                        pageBreakInside: 'avoid',
                        background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                      }}
                    >
                      {/* Col 1: QR Code */}
                      <td style={{ padding: '6px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ display: 'inline-block', background: '#ffffff', padding: '2px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          <QRCodeSVG value={`STUDENT:${student.student_id}`} size={56} />
                        </div>
                      </td>

                      {/* Col 2: Student Details */}
                      <td style={{ padding: '6px 10px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#000000' }}>
                          {idx + 1}. {student.student_name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
                          {student.grade ? `Série/Turma: ${student.grade} ${student.class_group || ''}` : ''}
                          {student.enrollment_number ? ` • Matrícula: ${student.enrollment_number}` : ''}
                        </div>
                      </td>

                      {/* Col 3: Blank Box for Consumption Value */}
                      <td style={{ padding: '6px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div
                          style={{
                            border: '2px solid #000000',
                            borderRadius: '6px',
                            height: '38px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            paddingLeft: '8px',
                            background: '#ffffff',
                            fontWeight: 'bold',
                            fontSize: '0.95rem',
                            color: '#94a3b8',
                          }}
                        >
                          R$&nbsp;&nbsp;
                        </div>
                      </td>

                      {/* Col 4: Signature Line */}
                      <td style={{ padding: '6px', textAlign: 'center', verticalAlign: 'bottom' }}>
                        <div style={{ borderBottom: '1px solid #000000', margin: '0 5px 4px 5px', height: '24px' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Paper Footer Instructions */}
            <div
              style={{
                marginTop: '1.5rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid #94a3b8',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: '#475569',
              }}
            >
              <div>
                * Dica: No final do dia, acesse o menu <strong>"📷 Escanear Câmera"</strong> no sistema e aponte a câmera para os QR Codes desta folha para importar todos os consumos de forma automática.
              </div>
              <div>Página 1</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableSheetModal;
