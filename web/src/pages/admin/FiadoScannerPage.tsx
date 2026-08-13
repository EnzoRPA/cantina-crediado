import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Printer, Camera, Volume2, Trash2, Plus, Download, Send, Search,
  RefreshCw, Filter, ArrowUpDown, CheckSquare, Square
} from 'lucide-react';
import { api, posApi } from '../../services/api';
import { QRCodeSVG } from '../../components/common/QRCodeSVG';
import { showToast } from '../../components/common/Toast';
import './OnCreditPage.css';

interface StudentItem {
  student_id: string;
  student_name: string;
  grade?: string;
  class_group?: string;
  enrollment_number?: string;
  total_debt?: number;
}

export interface ScannedBatchItem {
  studentId: string;
  studentName: string;
  grade?: string;
  enrollmentNumber?: string;
  amountInput: string;
  scannedAt: Date;
}

function playScanBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (_) {}
}

function parseMathExpression(expr: string): number {
  if (!expr || !expr.trim()) return 0;
  const sanitized = expr.replace(/,/g, '.').replace(/[^0-9.+-]/g, '');
  if (!sanitized) return 0;
  const tokens = sanitized.split(/(?=[+-])|(?<=[+-])/).filter((t) => t.trim() !== '');
  let total = 0;
  let currentSign = 1;
  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed === '+') currentSign = 1;
    else if (trimmed === '-') currentSign = -1;
    else {
      const val = parseFloat(trimmed);
      if (!isNaN(val)) total += currentSign * val;
    }
  }
  return Math.max(0, Math.round(total * 100) / 100);
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export default function FiadoScannerPage() {
  const [activeTab, setActiveTab] = useState<'impressao' | 'scanner'>('impressao');
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Print Tab Filters
  const [sortBy, setSortBy] = useState<'nome' | 'debito'>('nome');
  const [sortAsc, setSortAsc] = useState(true);
  const [gradeFilter, setGradeFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [onlyDebtors, setOnlyDebtors] = useState(false);

  // Camera Scanner Tab State
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedBatchItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [manualSearch, setManualSearch] = useState('');

  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/pos/on-credit/debts');
      const debtList = data.data?.debts || [];
      setStudents(
        debtList.map((d: any) => ({
          student_id: d.student_id,
          student_name: d.student_name,
          grade: d.grade || '',
          class_group: d.class_group || '',
          enrollment_number: d.enrollment_number || '',
          total_debt: Number(d.total_debt || 0),
        }))
      );
    } catch (err) {
      console.error('Error loading students for scanner page:', err);
    } finally {
      setLoading(false);
    }
  };

  // Camera handling for Scanner Tab
  useEffect(() => {
    if (activeTab === 'scanner') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
        startScanLoop();
      }
    } catch (err) {
      console.warn('Unable to access primary camera, trying fallback:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play();
          setCameraActive(true);
          startScanLoop();
        }
      } catch (fallbackErr) {
        setCameraActive(false);
        showToast('Não foi possível iniciar a câmera. Você ainda pode adicionar alunos manualmente.', 'info');
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const startScanLoop = () => {
    let animId: number;
    let detector: any = null;

    if ('BarcodeDetector' in window) {
      try {
        detector = new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
      } catch (_) {
        detector = null;
      }
    }

    const scanFrame = async () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        if (detector) {
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              handleCodeDetected(barcodes[0].rawValue);
            }
          } catch (_) {}
        }
      }
      animId = requestAnimationFrame(scanFrame);
    };

    animId = requestAnimationFrame(scanFrame);
    return () => cancelAnimationFrame(animId);
  };

  const handleCodeDetected = (code: string) => {
    if (!code || code === lastScannedCode) return;

    setLastScannedCode(code);
    setTimeout(() => setLastScannedCode(null), 2000);

    let extractedId = code;
    if (code.startsWith('STUDENT:')) {
      extractedId = code.replace('STUDENT:', '').trim();
    }

    const targetStudent = students.find(
      (s) =>
        s.student_id === extractedId ||
        s.enrollment_number === extractedId ||
        s.student_name.toLowerCase() === extractedId.toLowerCase()
    );

    if (!targetStudent) {
      showToast(`Código escaneado "${code}" não pertence a nenhum aluno cadastrado.`, 'info');
      return;
    }

    playScanBeep();
    addStudentToBatch(targetStudent);
  };

  const addStudentToBatch = (student: StudentItem, defaultAmount = '10') => {
    setScannedItems((prev) => {
      const exists = prev.some((item) => item.studentId === student.student_id);
      if (exists) {
        showToast(`Aluno ${student.student_name} já está na lista escaneada.`, 'info');
        return prev;
      }

      showToast(`✅ ${student.student_name} identificado!`, 'success');
      const newItem: ScannedBatchItem = {
        studentId: student.student_id,
        studentName: student.student_name,
        grade: student.grade,
        enrollmentNumber: student.enrollment_number,
        amountInput: defaultAmount,
        scannedAt: new Date(),
      };

      setTimeout(() => {
        const el = inputRefs.current[student.student_id];
        if (el) {
          el.focus();
          el.select();
        }
      }, 100);

      return [newItem, ...prev];
    });
  };

  const handleRemoveItem = (studentId: string) => {
    setScannedItems((prev) => prev.filter((item) => item.studentId !== studentId));
  };

  const handleAmountChange = (studentId: string, val: string) => {
    setScannedItems((prev) =>
      prev.map((item) => (item.studentId === studentId ? { ...item, amountInput: val } : item))
    );
  };

  const grandTotalBatch = scannedItems.reduce(
    (sum, item) => sum + parseMathExpression(item.amountInput),
    0
  );

  const handleSaveBatch = async () => {
    if (scannedItems.length === 0) {
      showToast('Nenhum aluno escaneado para lançamento.', 'info');
      return;
    }

    const payloadItems = [];
    for (const item of scannedItems) {
      const parsed = parseMathExpression(item.amountInput);
      if (isNaN(parsed) || parsed <= 0) {
        showToast(`Informe um valor válido para ${item.studentName}.`, 'error');
        return;
      }
      payloadItems.push({ studentId: item.studentId, amount: parsed });
    }

    setSubmitting(true);
    try {
      const { data } = await posApi.createBatchManualOnCredit({
        date: new Date().toISOString().split('T')[0],
        description: 'Consumo diário via Folha QR Code (Câmera)',
        items: payloadItems,
      });

      const count = data?.data?.count || payloadItems.length;
      showToast(`Sucesso! Criados ${count} lançamentos em lote no sistema.`, 'success');
      setScannedItems([]);
      loadStudents();
    } catch (err: any) {
      console.error('Error submitting scanned batch:', err);
      showToast(err.response?.data?.error?.message || 'Erro ao efetuar lançamento em lote.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCSV = () => {
    if (scannedItems.length === 0) {
      showToast('Nenhum item na lista para exportar.', 'info');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    let csvContent = '\uFEFF';
    csvContent += 'Data;Matrícula;Nome do Aluno;Turma;Valor Consumido (R$)\n';

    scannedItems.forEach((item) => {
      const amountVal = parseMathExpression(item.amountInput).toFixed(2).replace('.', ',');
      csvContent += `${todayStr};"${item.enrollmentNumber || ''}";"${item.studentName}";"${item.grade || ''}";"${amountVal}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `consumo_fiado_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Planilha CSV exportada com sucesso!', 'success');
  };

  // Extract unique grades for filters
  const availableGrades = useMemo(() => {
    const gradesSet = new Set<string>();
    students.forEach((s) => {
      if (s.grade) gradesSet.add(s.grade);
    });
    return Array.from(gradesSet).sort();
  }, [students]);

  // Filtered list for print tab
  const filteredPrintStudents = useMemo(() => {
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

  const filteredStudentsForManualAdd = students
    .filter((s) => {
      if (!manualSearch.trim()) return false;
      const term = manualSearch.toLowerCase().trim();
      return (
        s.student_name.toLowerCase().includes(term) ||
        (s.enrollment_number && s.enrollment_number.toLowerCase().includes(term))
      );
    })
    .slice(0, 5);

  const todayStr = new Date().toLocaleDateString('pt-BR');

  return (
    <div className="on-credit-page animate-fadeIn" style={{ padding: '0 0.5rem' }}>
      {/* Top Header Controls (No Print) */}
      <div className="no-print" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main, #0f172a)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              🖨️ Folha & Scanner QR de Fiado
            </h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
              Imprima folhas A4 personalizadas com QR Code e escaneie consumos pela câmera à noite.
            </span>
          </div>

          {/* Dedicated View Mode Tabs */}
          <div style={{ display: 'flex', background: 'var(--bg-card, #ffffff)', padding: '0.3rem', borderRadius: '12px', border: '1px solid var(--border-color, #e2e8f0)' }}>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'impressao' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('impressao')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, padding: '0.6rem 1.25rem' }}
            >
              <Printer size={18} /> 🖨️ 1. Gerar & Imprimir Folha A4
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'scanner' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('scanner')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, padding: '0.6rem 1.25rem' }}
            >
              <Camera size={18} /> 📷 2. Escanear Câmera & Lançar
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: GERAR E IMPRIMIR FOLHA A4 */}
      {activeTab === 'impressao' && (
        <div className="animate-fadeIn">
          {/* Controls Bar (No Print) */}
          <div
            className="no-print"
            style={{
              padding: '1rem',
              background: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: '12px',
              marginBottom: '1.25rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.85rem',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
              {/* Search */}
              <div style={{ position: 'relative', minWidth: '200px' }}>
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

            {/* Print Action Button */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.print()}
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
              <Printer size={18} /> Imprimir Folha A4 ({filteredPrintStudents.length})
            </button>
          </div>

          {/* Printable Paper Container */}
          <div
            id="printable-fiado-sheet"
            className="printable-paper"
            style={{
              background: '#ffffff',
              maxWidth: '850px',
              margin: '0 auto',
              padding: '2.5rem',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              borderRadius: '12px',
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
                  Total: {filteredPrintStudents.length} Alunos
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

            {/* Students Table */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>Carregando lista de alunos...</div>
            ) : filteredPrintStudents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>Nenhum aluno encontrado para a busca.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '1rem' }}>
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
                  {filteredPrintStudents.map((student, idx) => (
                    <tr
                      key={student.student_id}
                      style={{
                        borderBottom: '1px solid #cbd5e1',
                        pageBreakInside: 'avoid',
                        background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                      }}
                    >
                      <td style={{ padding: '6px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ display: 'inline-block', background: '#ffffff', padding: '2px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                          <QRCodeSVG value={`STUDENT:${student.student_id}`} size={56} />
                        </div>
                      </td>
                      <td style={{ padding: '6px 10px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#000000' }}>
                          {idx + 1}. {student.student_name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
                          {student.grade ? `Série/Turma: ${student.grade} ${student.class_group || ''}` : ''}
                          {student.enrollment_number ? ` • Matrícula: ${student.enrollment_number}` : ''}
                        </div>
                      </td>
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
                      <td style={{ padding: '6px', textAlign: 'center', verticalAlign: 'bottom' }}>
                        <div style={{ borderBottom: '1px solid #000000', margin: '0 5px 4px 5px', height: '24px' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Instructions */}
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
                * No final do dia, acesse a aba <strong>"📷 Escanear Câmera & Lançar"</strong> e aponte a câmera para os QR Codes para importar todos os consumos.
              </div>
              <div>Página 1</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SCANNER DE CÂMERA & LANÇAMENTO EM LOTE */}
      {activeTab === 'scanner' && (
        <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) 1fr', gap: '1.25rem' }}>
            {/* Video Camera Container */}
            <div
              style={{
                position: 'relative',
                background: '#0f172a',
                borderRadius: '16px',
                overflow: 'hidden',
                aspectRatio: '4/3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #334155',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}
            >
              <video
                ref={videoRef}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                muted
                playsInline
              />

              {/* Target Scanner Reticle */}
              <div
                style={{
                  position: 'absolute',
                  width: '200px',
                  height: '200px',
                  border: '2px dashed #22c55e',
                  borderRadius: '16px',
                  boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ width: '14px', height: '14px', background: '#22c55e', borderRadius: '50%' }} />
              </div>

              {/* Live Status Overlay */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  background: 'rgba(15, 23, 42, 0.9)',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <Camera size={16} className={cameraActive ? 'animate-pulse' : ''} color="#22c55e" />
                  {cameraActive ? 'Câmera Ativa — Aponte para o QR Code' : 'Câmera Inativa'}
                </span>
                <Volume2 size={16} color="#94a3b8" />
              </div>
            </div>

            {/* Quick Stats & Manual Add */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'space-between' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: 'var(--bg-card, #ffffff)', border: '1px solid #bbf7d0', padding: '1.25rem', borderRadius: '14px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 700 }}>Alunos Escaneados</span>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#15803d', marginTop: '4px' }}>
                    {scannedItems.length}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card, #ffffff)', border: '1px solid #bfdbfe', padding: '1.25rem', borderRadius: '14px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#1e40af', fontWeight: 700 }}>Total da Folha</span>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#1d4ed8', marginTop: '4px' }}>
                    {formatCurrency(grandTotalBatch)}
                  </div>
                </div>
              </div>

              {/* Manual Search Addition */}
              <div
                style={{
                  background: 'var(--bg-card, #ffffff)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '14px',
                  padding: '1.25rem',
                }}
              >
                <label style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '0.5rem' }}>
                  ➕ Adicionar Aluno Manualmente (Sem QR Code)
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Digite nome ou matrícula do aluno..."
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    style={{ paddingLeft: '2.4rem', fontSize: '0.9rem' }}
                  />
                </div>

                {filteredStudentsForManualAdd.length > 0 && (
                  <div
                    style={{
                      background: 'var(--bg-card, #ffffff)',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: '10px',
                      marginTop: '0.5rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      overflow: 'hidden',
                    }}
                  >
                    {filteredStudentsForManualAdd.map((s) => (
                      <div
                        key={s.student_id}
                        onClick={() => {
                          addStudentToBatch(s);
                          setManualSearch('');
                        }}
                        style={{
                          padding: '0.7rem 1rem',
                          borderBottom: '1px solid var(--border-color, #f1f5f9)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.88rem',
                        }}
                      >
                        <div>
                          <strong>{s.student_name}</strong>
                          <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '6px' }}>
                            ({s.grade || 'Geral'})
                          </span>
                        </div>
                        <Plus size={16} color="#16a34a" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Scanned Batch Table & Action Footer */}
          <div style={{ background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '14px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                📋 Lista de Consumo Escaneado ({scannedItems.length})
              </h3>
              {scannedItems.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setScannedItems([])}
                  style={{ color: '#ef4444' }}
                >
                  Limpar Lista
                </button>
              )}
            </div>

            {scannedItems.length === 0 ? (
              <div style={{ border: '2px dashed var(--border-color, #cbd5e1)', borderRadius: '12px', padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Camera size={42} style={{ margin: '0 auto 0.5rem auto', color: '#94a3b8' }} />
                <strong>Nenhum consumo escaneado ainda.</strong>
                <p style={{ fontSize: '0.85rem', margin: '4px 0 0 0' }}>
                  Aponte a câmera para os QR Codes da folha impressa ou busque o aluno acima.
                </p>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-hover, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 16px', width: '50px' }}>#</th>
                      <th style={{ padding: '12px 16px' }}>Aluno / Matrícula</th>
                      <th style={{ padding: '12px 16px', width: '240px' }}>Valor Consumido (R$)</th>
                      <th style={{ padding: '12px 16px', width: '70px', textAlign: 'center' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannedItems.map((item, idx) => (
                      <tr key={item.studentId} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)', background: idx === 0 ? '#f0fdf4' : 'var(--bg-card)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 'bold', color: '#64748b' }}>
                          {scannedItems.length - idx}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <strong style={{ color: 'var(--text-main)' }}>{item.studentName}</strong>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {item.grade ? `Série/Turma: ${item.grade}` : ''}
                            {item.enrollmentNumber ? ` • Matrícula: ${item.enrollmentNumber}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>R$</span>
                            <input
                              ref={(el) => { inputRefs.current[item.studentId] = el; }}
                              type="text"
                              className="form-input"
                              value={item.amountInput}
                              onChange={(e) => handleAmountChange(item.studentId, e.target.value)}
                              placeholder="12.50 ou 5+3"
                              style={{ fontWeight: 800, fontSize: '1.05rem', color: '#16a34a' }}
                            />
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => handleRemoveItem(item.studentId)}
                            style={{ color: '#ef4444' }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color, #e2e8f0)', flexWrap: 'wrap', gap: '1rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleExportCSV}
                disabled={scannedItems.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <Download size={18} /> Exportar Planilha CSV
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveBatch}
                disabled={scannedItems.length === 0 || submitting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 700,
                  padding: '0.8rem 2rem',
                  fontSize: '1rem',
                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  borderColor: '#16a34a',
                  color: '#ffffff',
                  boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)',
                }}
              >
                {submitting ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" /> Lançando no Banco...
                  </>
                ) : (
                  <>
                    <Send size={18} /> Lançar Todos no Sistema ({scannedItems.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
