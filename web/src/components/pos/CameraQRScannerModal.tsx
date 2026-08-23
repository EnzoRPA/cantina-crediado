import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Trash2,
  Plus,
  Download,
  Send,
  Search,
  RefreshCw,
  Sparkles,
  UploadCloud,
  KeyRound,
  RotateCcw,
} from 'lucide-react';
import { posApi } from '../../services/api';
import { showToast } from '../common/Toast';

interface StudentItem {
  student_id: string;
  student_name: string;
  grade?: string;
  class_group?: string;
  enrollment_number?: string;
  guardian_name?: string;
  guardian_phone?: string;
  type?: 'student' | 'employee';
  total_debt?: number;
  balance?: number;
  billing_type?: 'pix_direto' | 'crediario';
  last_purchase_at?: string;
}

export interface ScannedBatchItem {
  studentId: string;
  studentName: string;
  grade?: string;
  enrollmentNumber?: string;
  amountInput: string;
  scannedAt: Date;
  confidence?: 'high' | 'medium' | 'low';
  totalDebt?: number;
  isFirstTimeCredit?: boolean;
}

interface CameraQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  allStudents: StudentItem[];
  onConfirmBatch: (items: Array<{ studentId: string; amount: number }>, date?: string) => Promise<void>;
}

// Audio beep synthesizer using Web Audio API
function playScanBeep(isSuccess = true) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isSuccess ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(isSuccess ? 880 : 440, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
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
  // Modal Mode: 'photo_ai' (foto única) or 'qr_stream' (bipagem contínua 1 a 1)
  const [scanMode, setScanMode] = useState<'photo_ai' | 'qr_stream'>('photo_ai');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedBatchItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [launchDate, setLaunchDate] = useState<string>(getTodayStr());

  // Photo & AI Vision state
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [customGeminiKey, setCustomGeminiKey] = useState(
    () => localStorage.getItem('cantina-gemini-key') || ''
  );
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  void cameraActive;

  // Manual Add Student Dropdown State
  const [manualSearch, setManualSearch] = useState('');

  // Input refs map for auto-focusing newly scanned student inputs
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedPhoto(null);
      return;
    }
    startCamera();
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Camera initialization
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
        if (scanMode === 'qr_stream') {
          startScanLoop();
        }
      }
    } catch (err) {
      console.warn('Unable to access primary camera, trying default video:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play();
          setCameraActive(true);
          if (scanMode === 'qr_stream') {
            startScanLoop();
          }
        }
      } catch (fallbackErr) {
        console.error('Camera permission denied or device unsupported:', fallbackErr);
        setCameraActive(false);
        showToast('Não foi possível acessar a câmera. Você pode fazer upload da foto abaixo.', 'info');
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

  // Continuous QR scan loop for 'qr_stream' mode
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
      if (scanMode === 'qr_stream') {
        animId = requestAnimationFrame(scanFrame);
      }
    };

    animId = requestAnimationFrame(scanFrame);
    return () => cancelAnimationFrame(animId);
  };

  const handleCodeDetected = (code: string) => {
    if (!code || code === lastScannedCode) return;

    setLastScannedCode(code);
    setTimeout(() => setLastScannedCode(null), 2000); // 2 sec cooldown per code

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

    playScanBeep(true);
    addStudentToBatch(targetStudent);
  };

  const addStudentToBatch = (student: StudentItem, defaultAmount = '10') => {
    setScannedItems((prev) => {
      const existsIdx = prev.findIndex((item) => item.studentId === student.student_id);
      if (existsIdx >= 0) {
        showToast(`Aluno ${student.student_name} já está na lista.`, 'info');
        return prev;
      }

      const totalDebt = student.total_debt || 0;
      const hasHistory = totalDebt > 0 || !!student.last_purchase_at;
      const isFirstTime = !hasHistory;

      if (isFirstTime) {
        showToast(`🌟 ${student.student_name} está no crediário pela 1ª vez!`, 'info');
      } else if (totalDebt > 0) {
        showToast(`⚠️ ${student.student_name} já possui R$ ${totalDebt.toFixed(2)} em débitos.`, 'info');
      } else {
        showToast(`✅ Aluno ${student.student_name} identificado!`, 'success');
      }

      const newItem: ScannedBatchItem = {
        studentId: student.student_id,
        studentName: student.student_name,
        grade: student.grade,
        enrollmentNumber: student.enrollment_number,
        amountInput: defaultAmount,
        scannedAt: new Date(),
        totalDebt: totalDebt,
        isFirstTimeCredit: isFirstTime,
      };

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

  // --- Photo Capture & AI Recognition ---

  const handleCapturePhotoFromCamera = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedPhoto(dataUrl);
      playScanBeep(true);
      showToast('📸 Foto da folha capturada! Clique em "Analisar com IA".', 'success');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCapturedPhoto(dataUrl);
      playScanBeep(true);
      showToast('📁 Foto carregada com sucesso!', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzePhotoWithAI = async () => {
    if (!capturedPhoto) {
      showToast('Tire uma foto ou carregue uma imagem da folha primeiro.', 'info');
      return;
    }

    setAnalyzingPhoto(true);
    try {
      const { data } = await posApi.scanSheetImage({
        imageBase64: capturedPhoto,
        apiKey: customGeminiKey.trim() || undefined,
      });

      const items = data?.data?.items || [];

      if (items.length === 0) {
        showToast('Nenhum consumo manuscrito foi identificado nesta foto da folha.', 'info');
        return;
      }

      playScanBeep(true);
      showToast(`🎉 Sucesso! IA identificou ${items.length} consumos preenchidos na folha!`, 'success');

      // Mapear para a lista de itens cruzando histórico
      setScannedItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.studentId));
        const newBatch: ScannedBatchItem[] = items.map((extracted: any) => {
          const matching = allStudents.find((s) => s.student_id === extracted.student_id);
          const totalDebt = matching?.total_debt || 0;
          const hasHistory = totalDebt > 0 || !!matching?.last_purchase_at;
          const isFirstTime = !hasHistory;

          return {
            studentId: extracted.student_id,
            studentName: extracted.student_name,
            grade: extracted.grade,
            enrollmentNumber: extracted.enrollment_number,
            amountInput: extracted.amount.toString(),
            scannedAt: new Date(),
            confidence: extracted.confidence,
            totalDebt: totalDebt,
            isFirstTimeCredit: isFirstTime,
          };
        });

        // Adicionar apenas os que não existiam ainda ou substituir com os lidos
        const filteredNew = newBatch.filter((item) => !existingIds.has(item.studentId));
        return [...filteredNew, ...prev];
      });
    } catch (err: any) {
      console.error('Erro na análise da folha:', err);
      showToast(
        err.response?.data?.error?.message || 'Erro ao processar imagem da folha com IA.',
        'error'
      );
    } finally {
      setAnalyzingPhoto(false);
    }
  };

  const handleSaveGeminiKey = () => {
    localStorage.setItem('cantina-gemini-key', customGeminiKey);
    setShowKeyConfig(false);
    showToast('Chave salva com sucesso!', 'success');
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
      showToast('Nenhum aluno na lista para lançamento.', 'info');
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
    link.setAttribute('download', `consumo_folha_${todayStr}.csv`);
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
        `${s.student_name} ${s.grade || ''} ${s.class_group || ''} ${s.enrollment_number || ''} ${s.guardian_name || ''} ${s.type || ''}`
      );
      if (searchableText.includes(term)) return true;
      const tokens = term.split(/\s+/).filter(Boolean);
      return tokens.every((token) => searchableText.includes(token));
    })
    .slice(0, 50);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay animate-fadeIn" style={{ zIndex: 1150 }}>
      {/* Hidden canvas for taking snapshot from webcam */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      <div
        className="modal-content"
        style={{
          maxWidth: '960px',
          width: '95%',
          maxHeight: '94vh',
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
            padding: '1.1rem 1.5rem',
            background: 'var(--bg-card, #ffffff)',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {scanMode === 'photo_ai' ? '📸 Foto da Folha Inteira (IA Vision)' : '⚡ Leitor de QR Code Contínuo'}
              </h3>
              <span
                style={{
                  background: scanMode === 'photo_ai' ? '#dcfce7' : '#e0e7ff',
                  color: scanMode === 'photo_ai' ? '#15803d' : '#3730a3',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                {scanMode === 'photo_ai' ? 'Recomendado (1 Foto Só)' : 'Modo 1 a 1'}
              </span>
            </div>
            <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              {scanMode === 'photo_ai'
                ? 'Tire uma foto ou carregue a imagem da folha A4. A IA lê todas as caixinhas de valor de uma vez só!'
                : 'Aponte a câmera sucessivamente para os QR Codes de cada aluno para registrá-los.'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowKeyConfig(!showKeyConfig)}
              title="Configurar Chave Gemini"
              style={{ color: customGeminiKey ? '#16a34a' : '#64748b' }}
            >
              <KeyRound size={18} />
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: '0.5rem' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-hover, #f8fafc)',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            padding: '0.5rem 1.5rem',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            onClick={() => setScanMode('photo_ai')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              border: scanMode === 'photo_ai' ? '1px solid #16a34a' : '1px solid transparent',
              background: scanMode === 'photo_ai' ? '#ffffff' : 'transparent',
              color: scanMode === 'photo_ai' ? '#16a34a' : '#64748b',
              boxShadow: scanMode === 'photo_ai' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            <Sparkles size={16} /> 📸 Foto Única da Folha (IA OCR)
          </button>

          <button
            type="button"
            onClick={() => {
              setScanMode('qr_stream');
              startScanLoop();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              border: scanMode === 'qr_stream' ? '1px solid #2563eb' : '1px solid transparent',
              background: scanMode === 'qr_stream' ? '#ffffff' : 'transparent',
              color: scanMode === 'qr_stream' ? '#2563eb' : '#64748b',
              boxShadow: scanMode === 'qr_stream' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            <Camera size={16} /> ⚡ Bipagem Contínua (QR Code 1 a 1)
          </button>
        </div>

        {/* Optional Gemini Key Drawer */}
        {showKeyConfig && (
          <div
            style={{
              padding: '0.75rem 1.5rem',
              background: '#fefce8',
              borderBottom: '1px solid #fef08a',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <KeyRound size={18} color="#ca8a04" />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#854d0e', display: 'block' }}>
                Chave Gemini API (Opcional se já estiver no .env do backend):
              </span>
              <input
                type="password"
                className="form-input"
                placeholder="AIzaSy..."
                value={customGeminiKey}
                onChange={(e) => setCustomGeminiKey(e.target.value)}
                style={{ fontSize: '0.82rem', padding: '3px 8px', width: '100%', maxWidth: '400px' }}
              />
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleSaveGeminiKey}
              style={{ fontSize: '0.8rem', alignSelf: 'flex-end' }}
            >
              Salvar Chave
            </button>
          </div>
        )}

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem' }}>
          {/* Top Section: Mode View */}
          {scanMode === 'photo_ai' ? (
            /* Mode 1: Photo & IA Vision */
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: '1.25rem' }}>
              {/* Camera Live Preview or Captured Image */}
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
                {capturedPhoto ? (
                  <img
                    src={capturedPhoto}
                    alt="Folha capturada"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000000' }}
                  />
                ) : (
                  <video
                    ref={videoRef}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    muted
                    playsInline
                  />
                )}

                {/* Reticle Guide */}
                {!capturedPhoto && (
                  <div
                    style={{
                      position: 'absolute',
                      width: '85%',
                      height: '85%',
                      border: '2px dashed rgba(34, 197, 94, 0.7)',
                      borderRadius: '8px',
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      style={{
                        background: 'rgba(15, 23, 42, 0.7)',
                        color: '#ffffff',
                        fontSize: '0.75rem',
                        padding: '4px 8px',
                        borderRadius: '4px',
                      }}
                    >
                      Enquadre a folha A4 inteira
                    </span>
                  </div>
                )}

                {/* Overlay Action Badges */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
                    right: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  {capturedPhoto ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setCapturedPhoto(null)}
                      style={{ background: 'rgba(15, 23, 42, 0.85)', color: '#ffffff', fontSize: '0.78rem' }}
                    >
                      <RotateCcw size={14} /> Tirar Outra Foto
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={handleCapturePhotoFromCamera}
                      style={{
                        background: '#16a34a',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        width: '100%',
                        justifyContent: 'center',
                      }}
                    >
                      <Camera size={16} /> 📷 Capturar Foto da Folha
                    </button>
                  )}
                </div>
              </div>

              {/* AI Controls & Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'space-between' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.3fr', gap: '0.65rem' }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.75rem', borderRadius: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>Alunos Identificados</span>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                      {scannedItems.length}
                    </div>
                  </div>

                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.75rem', borderRadius: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 600 }}>Total Calculado</span>
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
                  </div>
                </div>

                {/* Upload & Run AI Banner */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    border: '1px solid #86efac',
                    borderRadius: '12px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={20} color="#16a34a" />
                    <div>
                      <strong style={{ color: '#166534', fontSize: '0.92rem' }}>Reconhecimento Automático de Manuscrito</strong>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#14532d' }}>
                        A IA vai analisar os nomes e os números anotados à mão nas caixinhas de valor.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#ffffff' }}
                    >
                      <UploadCloud size={16} /> 📁 Carregar Arquivo de Foto
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAnalyzePhotoWithAI}
                      disabled={!capturedPhoto || analyzingPhoto}
                      style={{
                        flex: 1.2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: '#16a34a',
                        fontWeight: 700,
                      }}
                    >
                      {analyzingPhoto ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" /> Analisando Folha...
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} /> ✨ Analisar Folha com IA
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Manual Add Quick Fallback */}
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Adicionar aluno manualmente se faltar alguém..."
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    style={{ paddingLeft: '2.2rem', fontSize: '0.85rem' }}
                  />
                  {filteredStudentsForManualAdd.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 30,
                        background: 'var(--bg-card, #ffffff)',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        borderRadius: '10px',
                        marginTop: '4px',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                        maxHeight: '260px',
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
                            padding: '0.65rem 0.85rem',
                            borderBottom: '1px solid var(--border-color, #f1f5f9)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, #f8fafc)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1, paddingRight: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <strong style={{ color: 'var(--text-main, #0f172a)', fontSize: '0.9rem' }}>
                                {s.student_name}
                              </strong>
                              {s.billing_type === 'crediario' ? (
                                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                                  📋 Crediário
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>
                                  ⚡ Pix Direto
                                </span>
                              )}
                              {s.type === 'employee' && (
                                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#f3e8ff', color: '#7e22ce', fontWeight: 700 }}>
                                  💼 Funcionário
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted, #64748b)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <span><strong>Turma:</strong> {s.grade || 'Geral'} {s.class_group || ''}</span>
                              {s.enrollment_number && <span>• <strong>Matrícula:</strong> {s.enrollment_number}</span>}
                              {s.guardian_name && <span>• <strong>Resp:</strong> {s.guardian_name}</span>}
                              {(s.total_debt || 0) > 0 ? (
                                <span style={{ color: '#dc2626', fontWeight: 700 }}>• Débito: {formatCurrency(s.total_debt || 0)}</span>
                              ) : (s.balance || 0) > 0 ? (
                                <span style={{ color: '#16a34a', fontWeight: 700 }}>• Saldo: +{formatCurrency(s.balance || 0)}</span>
                              ) : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            style={{ color: '#16a34a', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, flexShrink: 0 }}
                          >
                            <Plus size={16} /> Adicionar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Mode 2: Continuous QR Code Scanner (1 by 1) */
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: '1.25rem' }}>
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
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'space-between' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
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
                </div>

                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Adicionar aluno manualmente..."
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    style={{ paddingLeft: '2.2rem', fontSize: '0.85rem' }}
                  />
                  {filteredStudentsForManualAdd.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 30,
                        background: 'var(--bg-card, #ffffff)',
                        border: '1px solid var(--border-color, #cbd5e1)',
                        borderRadius: '10px',
                        marginTop: '4px',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
                        maxHeight: '260px',
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
                            padding: '0.65rem 0.85rem',
                            borderBottom: '1px solid var(--border-color, #f1f5f9)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover, #f8fafc)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1, paddingRight: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <strong style={{ color: 'var(--text-main, #0f172a)', fontSize: '0.9rem' }}>
                                {s.student_name}
                              </strong>
                              {s.billing_type === 'crediario' ? (
                                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                                  📋 Crediário
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>
                                  ⚡ Pix Direto
                                </span>
                              )}
                              {s.type === 'employee' && (
                                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#f3e8ff', color: '#7e22ce', fontWeight: 700 }}>
                                  💼 Funcionário
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted, #64748b)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <span><strong>Turma:</strong> {s.grade || 'Geral'} {s.class_group || ''}</span>
                              {s.enrollment_number && <span>• <strong>Matrícula:</strong> {s.enrollment_number}</span>}
                              {s.guardian_name && <span>• <strong>Resp:</strong> {s.guardian_name}</span>}
                              {(s.total_debt || 0) > 0 ? (
                                <span style={{ color: '#dc2626', fontWeight: 700 }}>• Débito: {formatCurrency(s.total_debt || 0)}</span>
                              ) : (s.balance || 0) > 0 ? (
                                <span style={{ color: '#16a34a', fontWeight: 700 }}>• Saldo: +{formatCurrency(s.balance || 0)}</span>
                              ) : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            style={{ color: '#16a34a', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, flexShrink: 0 }}
                          >
                            <Plus size={16} /> Adicionar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Scanned Batch Table */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Lista de Consumo Identificado ({scannedItems.length})
                </h4>
                {scannedItems.length > 0 && (
                  <span style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: 700 }}>
                    • Total: {formatCurrency(grandTotalBatch)}
                  </span>
                )}
              </div>
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
                <strong>Nenhum consumo carregado ainda.</strong>
                <p style={{ fontSize: '0.82rem', margin: '4px 0 0 0' }}>
                  Tire uma foto da folha A4 acima ou use a câmera para identificar os consumos.
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong style={{ color: 'var(--text-main)' }}>{item.studentName}</strong>
                            {item.confidence === 'high' && (
                              <span style={{ fontSize: '0.68rem', background: '#dcfce7', color: '#15803d', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                IA 100%
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '2px' }}>
                            {item.grade ? <span>Série/Turma: {item.grade}</span> : null}
                            {item.enrollmentNumber ? <span>• Matrícula: {item.enrollmentNumber}</span> : null}
                            {item.isFirstTimeCredit ? (
                              <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                🌟 1ª Vez no Crediário
                              </span>
                            ) : (item.totalDebt || 0) > 0 ? (
                              <span style={{ fontSize: '0.7rem', background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                📋 Débito anterior: {formatCurrency(item.totalDebt || 0)}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.7rem', background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                Histórico OK (R$ 0)
                              </span>
                            )}
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
