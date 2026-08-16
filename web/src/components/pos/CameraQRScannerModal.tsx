import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Volume2, Trash2, Plus, Download, Send, Search, RefreshCw } from 'lucide-react';
import { showToast } from '../common/Toast';

interface StudentItem {
  student_id: string;
  student_name: string;
  grade?: string;
  class_group?: string;
  enrollment_number?: string;
}

export interface ScannedBatchItem {
  studentId: string;
  studentName: string;
  grade?: string;
  enrollmentNumber?: string;
  amountInput: string;
  scannedAt: Date;
}

interface CameraQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  allStudents: StudentItem[];
  onConfirmBatch: (items: Array<{ studentId: string; amount: number }>, date?: string) => Promise<void>;
}

// Audio beep synthesizer using Web Audio API
function playScanBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 tone
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

function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, '')
    .trim();
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const getTodayStr = () => new Date().toISOString().split('T')[0];

export const CameraQRScannerModal: React.FC<CameraQRScannerModalProps> = ({
  isOpen,
  onClose,
  allStudents,
  onConfirmBatch,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedBatchItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [launchDate, setLaunchDate] = useState<string>(getTodayStr());

  // Manual Add Student Dropdown State
  const [manualSearch, setManualSearch] = useState('');

  // Input refs map for auto-focusing newly scanned student inputs
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Camera initialization and continuous QR scanning loop
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
      console.warn('Unable to access primary camera, trying default video:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play();
          setCameraActive(true);
          startScanLoop();
        }
      } catch (fallbackErr) {
        console.error('Camera permission denied or device unsupported:', fallbackErr);
        setCameraActive(false);
        showToast('Não foi possível acessar a câmera. Você ainda pode adicionar alunos manualmente.', 'info');
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
      } catch (e) {
        detector = null;
      }
    }

    const scanFrame = async () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        if (detector) {
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              const rawVal = barcodes[0].rawValue;
              handleCodeDetected(rawVal);
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
    setTimeout(() => setLastScannedCode(null), 2000); // 2 sec cooldown per code

    // Extract studentId or enrollment number from QR format ("STUDENT:<id>" or raw id)
    let extractedId = code;
    if (code.startsWith('STUDENT:')) {
      extractedId = code.replace('STUDENT:', '').trim();
    }

    const targetStudent = allStudents.find(
      (s) =>
        s.student_id === extractedId ||
        (s.enrollment_number && s.enrollment_number.toLowerCase() === extractedId.toLowerCase()) ||
        normalizeText(s.student_name) === normalizeText(extractedId)
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
      const existsIdx = prev.findIndex((item) => item.studentId === student.student_id);
      if (existsIdx >= 0) {
        showToast(`Aluno ${student.student_name} já está na lista.`, 'info');
        return prev;
      }

      showToast(`✅ Aluno ${student.student_name} identificado!`, 'success');
      const newItem: ScannedBatchItem = {
        studentId: student.student_id,
        studentName: student.student_name,
        grade: student.grade,
        enrollmentNumber: student.enrollment_number,
        amountInput: defaultAmount,
        scannedAt: new Date(),
      };

      // Focus new input on next tick
      setTimeout(() => {
        const inputEl = inputRefs.current[student.student_id];
        if (inputEl) {
          inputEl.focus();
          inputEl.select();
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
      showToast('Nenhum aluno foi escaneado para lançamento.', 'info');
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
      await onConfirmBatch(payloadItems, launchDate);
      onClose();
    } catch (err) {
      console.error('Error submitting scanned batch:', err);
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
    let csvContent = '\uFEFF'; // UTF-8 BOM
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

  const filteredStudentsForManualAdd = allStudents
    .filter((s) => {
      if (!manualSearch.trim()) return false;
      const term = normalizeText(manualSearch);
      const searchableText = normalizeText(
        `${s.student_name} ${s.grade || ''} ${s.class_group || ''} ${s.enrollment_number || ''}`
      );
      if (searchableText.includes(term)) return true;
      const tokens = term.split(/\s+/).filter(Boolean);
      return tokens.every((token) => searchableText.includes(token));
    })
    .slice(0, 50);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay animate-fadeIn" style={{ zIndex: 1150 }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '920px',
          width: '95%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: '16px',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            background: 'var(--bg-card, #ffffff)',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
              📷 Escanear Folha / Lançar Consumo via Câmera (Com Data 📅)
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Aponte a câmera para os QR Codes da folha impressa para identificar e registrar consumos instantaneamente.
            </span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: '0.5rem' }}>
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem' }}>
          {/* Top Row: Video Camera Feed + Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: '1.25rem' }}>
            {/* Video Container */}
            <div
              style={{
                position: 'relative',
                background: '#0f172a',
                borderRadius: '12px',
                overflow: 'hidden',
                aspectRatio: '4/3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #334155',
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
                  width: '180px',
                  height: '180px',
                  border: '2px dashed #22c55e',
                  borderRadius: '16px',
                  boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ width: '12px', height: '12px', background: '#22c55e', borderRadius: '50%' }} />
              </div>

              {/* Live Scanner Badge */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '10px',
                  right: '10px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Camera size={14} className={cameraActive ? 'animate-pulse' : ''} color="#22c55e" />
                  {cameraActive ? 'Câmera Ativa — Aponte para o QR Code' : 'Câmera Inativa'}
                </span>
                <Volume2 size={14} color="#94a3b8" />
              </div>
            </div>

            {/* Quick Stats & Manual Add Card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'space-between' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.3fr', gap: '0.65rem' }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.75rem', borderRadius: '12px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>Alunos Escaneados</span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                    {scannedItems.length}
                  </div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.75rem', borderRadius: '12px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 600 }}>Total Folha</span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1d4ed8', marginTop: '2px' }}>
                    {formatCurrency(grandTotalBatch)}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #cbd5e1)', padding: '0.65rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-main, #334155)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                    📅 Data do Lançamento
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={launchDate}
                    onChange={(e) => setLaunchDate(e.target.value)}
                    style={{ fontWeight: 800, fontSize: '0.85rem', padding: '3px 6px', width: '100%', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => setLaunchDate(getTodayStr())}
                      style={{ padding: '1px 6px', fontSize: '0.7rem', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', fontWeight: 600, background: launchDate === getTodayStr() ? '#dbeafe' : 'transparent' }}
                    >
                      Hoje
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        const y = new Date();
                        y.setDate(y.getDate() - 1);
                        setLaunchDate(y.toISOString().split('T')[0]);
                      }}
                      style={{ padding: '1px 6px', fontSize: '0.7rem', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', fontWeight: 600 }}
                    >
                      Ontem
                    </button>
                  </div>
                </div>
              </div>

              {/* Manual Student Addition Search */}
              <div
                style={{
                  background: 'var(--bg-card, #ffffff)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: '12px',
                  padding: '1rem',
                }}
              >
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '0.5rem' }}>
                  ➕ Adicionar Aluno Sem Escanear QR Code
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Digite nome ou matrícula do aluno..."
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    style={{ paddingLeft: '2.2rem', fontSize: '0.85rem' }}
                  />
                </div>

                {/* Autocomplete list */}
                {filteredStudentsForManualAdd.length > 0 && (
                  <div
                    style={{
                      background: 'var(--bg-card, #ffffff)',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderRadius: '8px',
                      marginTop: '0.4rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      maxHeight: '240px',
                      overflowY: 'auto',
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
                          padding: '0.6rem 0.85rem',
                          borderBottom: '1px solid var(--border-color, #f1f5f9)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.85rem',
                        }}
                        className="hover:bg-slate-100"
                      >
                        <div>
                          <strong>{s.student_name}</strong>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '6px' }}>
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

          {/* Scanned Batch Table */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Lista de Consumo Escaneado ({scannedItems.length})
              </h4>
              {scannedItems.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setScannedItems([])}
                  style={{ color: '#ef4444', fontSize: '0.8rem' }}
                >
                  Limpar Lista
                </button>
              )}
            </div>

            {scannedItems.length === 0 ? (
              <div
                style={{
                  border: '2px dashed var(--border-color, #cbd5e1)',
                  borderRadius: '12px',
                  padding: '2.5rem',
                  textAlign: 'center',
                  color: 'var(--text-muted, #64748b)',
                }}
              >
                <Camera size={36} style={{ margin: '0 auto 0.5rem auto', color: '#94a3b8' }} />
                <strong>Nenhum consumo escaneado ainda.</strong>
                <p style={{ fontSize: '0.82rem', margin: '4px 0 0 0' }}>
                  Aponte a câmera para os QR Codes da folha impressa ou adicione alunos manualmente acima.
                </p>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-hover, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px', width: '50px' }}>#</th>
                      <th style={{ padding: '10px 14px' }}>Aluno / Matrícula</th>
                      <th style={{ padding: '10px 14px', width: '220px' }}>Valor Consumido (R$)</th>
                      <th style={{ padding: '10px 14px', width: '60px', textAlign: 'center' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannedItems.map((item, idx) => (
                      <tr
                        key={item.studentId}
                        style={{
                          borderBottom: '1px solid var(--border-color, #f1f5f9)',
                          background: idx === 0 ? '#f0fdf4' : 'var(--bg-card, #ffffff)',
                        }}
                      >
                        <td style={{ padding: '10px 14px', fontWeight: 'bold', color: '#64748b' }}>
                          {scannedItems.length - idx}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <strong style={{ color: 'var(--text-main)' }}>{item.studentName}</strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {item.grade ? `Série/Turma: ${item.grade}` : ''}
                            {item.enrollmentNumber ? ` • Matrícula: ${item.enrollmentNumber}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>R$</span>
                            <input
                              ref={(el) => {
                                inputRefs.current[item.studentId] = el;
                              }}
                              type="text"
                              className="form-input"
                              value={item.amountInput}
                              onChange={(e) => handleAmountChange(item.studentId, e.target.value)}
                              placeholder="ex: 12.50 ou 5+3"
                              style={{ fontWeight: 800, fontSize: '1rem', color: '#16a34a' }}
                            />
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => handleRemoveItem(item.studentId)}
                            title="Remover aluno"
                            style={{ color: '#ef4444', padding: '4px' }}
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
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            background: 'var(--bg-card, #ffffff)',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleExportCSV}
            disabled={scannedItems.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}
          >
            <Download size={18} /> Exportar Planilha CSV
          </button>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
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
                padding: '0.7rem 1.5rem',
                background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                borderColor: '#16a34a',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
              }}
            >
              {submitting ? (
                <>
                  <RefreshCw size={18} className="animate-spin" /> Lançando...
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
    </div>
  );
};

export default CameraQRScannerModal;
