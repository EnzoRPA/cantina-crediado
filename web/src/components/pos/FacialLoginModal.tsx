import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { X, Loader2, CheckCircle, ScanFace } from 'lucide-react';
import { facialApi } from '../../services/api';
import './FacialLoginModal.css';
import { usePosStore } from '../../stores/posStore';

interface FacialLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CameraDevice {
  deviceId: string;
  label: string;
}

interface MatchResult {
  studentId: string;
  studentName: string;
  enrollmentNumber: string;
  balance: number;
  confidence: number;
}

const CAMERA_STORAGE_KEY = 'cantina_preferred_camera';

// Detector options are created lazily (after TF.js backend is ready)
let _detectorOptions: faceapi.TinyFaceDetectorOptions | null = null;
function getDetectorOptions() {
  if (!_detectorOptions) {
    _detectorOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 416,      // 416 = better detection for low quality/virtual cameras
      scoreThreshold: 0.3, // lowered threshold to ensure it detects faces even if blurry
    });
  }
  return _detectorOptions;
}

// Cooldown between recognition API calls (ms)
const RECOGNITION_COOLDOWN_MS = 1500;

export default function FacialLoginModal({ isOpen, onClose }: FacialLoginModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [scanStatus, setScanStatus] = useState<'waiting' | 'detecting' | 'recognizing' | 'error'>('waiting');

  // Camera selector state
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(
    localStorage.getItem(CAMERA_STORAGE_KEY) || ''
  );

  const setStudent = usePosStore((s) => s.setStudent);

  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const lastRecognizeTimeRef = useRef<number>(0);
  const isRecognizingRef = useRef(false);
  const mountedRef = useRef(true);

  // ---- Draw scanner-style L-corners (from gist) ----
  const drawScannerCorners = useCallback((
    ctx: CanvasRenderingContext2D,
    box: { x: number; y: number; width: number; height: number },
    cornerSize: number = 25,
    color: string = '#00ff88',
    lineWidth: number = 3
  ) => {
    const { x, y, width: w, height: h } = box;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    // Top-left corner
    ctx.beginPath();
    ctx.moveTo(x, y + cornerSize);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerSize, y);
    ctx.stroke();

    // Top-right corner
    ctx.beginPath();
    ctx.moveTo(x + w - cornerSize, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + cornerSize);
    ctx.stroke();

    // Bottom-left corner
    ctx.beginPath();
    ctx.moveTo(x, y + h - cornerSize);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + cornerSize, y + h);
    ctx.stroke();

    // Bottom-right corner
    ctx.beginPath();
    ctx.moveTo(x + w - cornerSize, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - cornerSize);
    ctx.stroke();
  }, []);

  // ---- Draw label text below the face box ----
  const drawLabel = useCallback((
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string = '#00ff88'
  ) => {
    ctx.font = 'bold 14px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';

    // Background pill
    const metrics = ctx.measureText(text);
    const padding = 8;
    const pillW = metrics.width + padding * 2;
    const pillH = 22;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(x - pillW / 2, y - pillH / 2, pillW, pillH, 6);
    ctx.fill();

    // Text
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 5);
  }, []);

  // ---- Initialize on mount ----
  const initRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    mountedRef.current = true;

    // Guard against React StrictMode double-mount
    if (initRef.current) return;
    initRef.current = true;

    const initialize = async () => {
      // 1. Load AI models first (CPU backend — works always)
      try {
        setIsModelLoading(true);

        try {
          await (faceapi.tf as any).setBackend('webgl');
          await (faceapi.tf as any).ready();
        } catch {
          console.warn('WebGL não suportado, usando CPU...');
          await (faceapi.tf as any).setBackend('cpu');
          await (faceapi.tf as any).ready();
        }
        console.log('TF.js backend:', (faceapi.tf as any).getBackend());

        const MODEL_URL = '/models';

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        if (mountedRef.current) {
          setIsModelLoading(false);
          // 2. Open camera AFTER models are loaded
          await startCamera(selectedCameraId || undefined);
        }
      } catch (err: any) {
        console.error('Falha ao carregar modelos', err);
        if (mountedRef.current) setErrorMsg(`Erro modelos: ${err?.message || String(err)}`);
      }
    };

    initialize();

    return () => {
      mountedRef.current = false;
      initRef.current = false;
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async (deviceId?: string) => {
    stopCamera();
    setIsCameraReady(false);
    setErrorMsg('');

    try {
      let stream: MediaStream;

      if (deviceId) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } }
        });
      } else {
        // Try rear camera (facingMode: environment) first for mobile devices
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: 'environment' } }
          });
        } catch (_) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment' }
            });
          } catch (_) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
        }
      }

      console.log('✓ Câmera aberta:', stream.getVideoTracks()[0]?.label);

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch (_) { } // ignore interrupted play
        setIsCameraReady(true);
      }

      // Enumerate devices AFTER camera is working (for dropdown)
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices
          .filter(d => d.kind === 'videoinput')
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Câmera ${i + 1}` }));
        if (mountedRef.current) setCameras(videoDevices);

        // Auto-select back/rear camera if available and not saved yet
        if (!deviceId && !localStorage.getItem(CAMERA_STORAGE_KEY)) {
          const rearCam = videoDevices.find(d => {
            const lbl = d.label.toLowerCase();
            return (
              lbl.includes('back') ||
              lbl.includes('traseira') ||
              lbl.includes('rear') ||
              lbl.includes('environment') ||
              lbl.includes('0, facing back') ||
              lbl.includes('câmera 0') ||
              lbl.includes('camera 0')
            );
          });
          if (rearCam && rearCam.deviceId !== stream.getVideoTracks()[0]?.getSettings()?.deviceId) {
            console.log('📸 Alternando automaticamente para câmera traseira encontrada:', rearCam.label);
            setSelectedCameraId(rearCam.deviceId);
            localStorage.setItem(CAMERA_STORAGE_KEY, rearCam.deviceId);
            stopCamera();
            const rearStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: rearCam.deviceId } }
            });
            streamRef.current = rearStream;
            if (videoRef.current) {
              videoRef.current.srcObject = rearStream;
              try { await videoRef.current.play(); } catch (_) { }
              setIsCameraReady(true);
            }
          }
        }
      } catch (_) { }

    } catch (err: any) {
      console.error('Câmera falhou:', err);
      setErrorMsg(`Erro de Câmera: ${err?.message || String(err)}`);
    }
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    if (newId) {
      localStorage.setItem(CAMERA_STORAGE_KEY, newId);
    } else {
      localStorage.removeItem(CAMERA_STORAGE_KEY);
    }
    if (!isModelLoading) {
      startCamera(newId);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (loopRef.current) clearTimeout(loopRef.current);
  };

  // ---- Recognition API call with debounce ----
  const handleRecognize = async (descriptor: Float32Array) => {
    const now = Date.now();
    if (
      isRecognizingRef.current ||
      now - lastRecognizeTimeRef.current < RECOGNITION_COOLDOWN_MS
    ) {
      return; // Skip: either already in-flight or within cooldown
    }

    isRecognizingRef.current = true;
    lastRecognizeTimeRef.current = now;
    setScanStatus('recognizing');

    try {
      const { data } = await facialApi.recognize({
        descriptor: Array.from(descriptor),
      });
      const matches = data.data.matches;
      const debug = data.data.debug;
      console.log('[Facial Login] Debug info:', debug);

      if (matches && matches.length > 0) {
        const bestMatch = matches[0];

        if (!mountedRef.current) return;

        setMatchResult({
          studentId: bestMatch.studentId,
          studentName: bestMatch.studentName,
          enrollmentNumber: bestMatch.enrollmentNumber,
          balance: bestMatch.balance,
          confidence: bestMatch.confidence,
        });
        setSuccess(true);
        setStudent({
          studentId: bestMatch.studentId,
          name: bestMatch.studentName,
          enrollmentNumber: bestMatch.enrollmentNumber,
          balance: bestMatch.balance,
          photoUrl: null,
          method: 'facial',
        });
        stopCamera();

        setTimeout(() => {
          if (mountedRef.current) onClose();
        }, 2000);
      } else {
        if (mountedRef.current) {
          setScanStatus('error');
          let details = 'Rosto não reconhecido';
          if (debug?.loadedCount === 0) {
            details += ' (Nenhuma biometria cadastrada nesta escola)';
          } else if (debug?.closestCandidate) {
            details += ` (Próximo: ${debug.closestCandidate.name}, dist: ${debug.closestCandidate.distance})`;
          }
          setErrorMsg(details);
          setTimeout(() => {
            if (mountedRef.current) {
              setErrorMsg('');
              setScanStatus('waiting');
            }
          }, 4000); // give more time to read debug details
        }
      }
    } catch (err: any) {
      console.error(err);
      if (mountedRef.current) {
        setScanStatus('error');
        setErrorMsg('Erro na leitura facial');
        setTimeout(() => {
          if (mountedRef.current) {
            setErrorMsg('');
            setScanStatus('waiting');
          }
        }, 2000);
      }
    } finally {
      isRecognizingRef.current = false;
    }
  };

  // ---- Detection loop ----
  const handleVideoPlay = () => {
    if (!videoRef.current || !canvasRef.current) return;

    if (videoRef.current.videoWidth === 0) {
      setTimeout(handleVideoPlay, 200);
      return;
    }

    const displaySize = {
      width: videoRef.current.videoWidth,
      height: videoRef.current.videoHeight,
    };
    faceapi.matchDimensions(canvasRef.current, displaySize);

    const step = async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || success) return;

      try {
        // Detect face + landmarks + descriptor using TinyFaceDetector
        const detection = await faceapi
          .detectSingleFace(videoRef.current, getDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection && canvasRef.current) {
          const resized = faceapi.resizeResults(detection, displaySize);
          const ctx = canvasRef.current.getContext('2d');

          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            const box = resized.detection.box;
            const isRecog = scanStatus === 'recognizing';
            const cornerColor = isRecog ? '#fbbf24' : '#00ff88'; // yellow while recognizing, green otherwise

            // Draw scanner corners
            drawScannerCorners(ctx, box, 25, cornerColor, 3);

            // Draw detection confidence
            const detScore = Math.round(resized.detection.score * 100);
            drawLabel(ctx, `Detecção: ${detScore}%`, box.x + box.width / 2, box.y - 15, cornerColor);

            // Draw scanning animation line
            const scanLineY = box.y + (Date.now() % 2000) / 2000 * box.height;
            ctx.strokeStyle = cornerColor;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.moveTo(box.x + 5, scanLineY);
            ctx.lineTo(box.x + box.width - 5, scanLineY);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          setScanStatus((prev) => prev === 'error' ? prev : 'detecting');

          // Try to recognize (throttled)
          await handleRecognize(detection.descriptor);

        } else {
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
          if (scanStatus !== 'error' && scanStatus !== 'recognizing') {
            setScanStatus('waiting');
          }
        }
      } catch (err) {
        console.error('Erro na detecção facial:', err);
      }

      if (!success) {
        loopRef.current = window.setTimeout(step, 250) as any;
      }
    };

    loopRef.current = window.setTimeout(step, 100) as any;
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  if (!isOpen) return null;

  return (
    <div className="facial-login-overlay">
      <div className="facial-login-content animate-zoomIn">
        <div className="facial-login-header">
          <div className="facial-login-title">
            <ScanFace size={22} />
            <h2>Reconhecimento Facial</h2>
          </div>
          <button className="btn-close" onClick={handleClose}><X size={20} /></button>
        </div>

        <div className="facial-login-body">
          <p className="facial-login-subtitle">Posicione o rosto do aluno em frente à câmera</p>

          {/* Camera selector */}
          {cameras.length > 1 && (
            <div className="facial-camera-selector">
              <label>📷 Câmera:</label>
              <select value={selectedCameraId} onChange={handleCameraChange}>
                <option value="">Padrão</option>
                {cameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="facial-video-wrapper">
            {isModelLoading && (
              <div className="facial-loading-state">
                <Loader2 size={32} className="spinner" />
                <p>Carregando Inteligência Artificial...</p>
              </div>
            )}

            {success && matchResult ? (
              <div className="facial-success-state">
                <CheckCircle size={56} className="facial-success-icon" />
                <p className="facial-success-name">{matchResult.studentName}</p>
                <p className="facial-success-detail">
                  Matrícula: {matchResult.enrollmentNumber}
                </p>
                <p className="facial-success-balance">
                  Saldo: {formatCurrency(matchResult.balance)}
                </p>
                <span className="facial-confidence-badge">
                  {matchResult.confidence}% confiança
                </span>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  onPlay={handleVideoPlay}
                  muted
                  playsInline
                  autoPlay
                  style={{ display: isCameraReady ? 'block' : 'none' }}
                />
                <canvas ref={canvasRef} className="facial-detection-canvas" />

                {/* Status overlays */}
                {isCameraReady && scanStatus === 'waiting' && (
                  <div className="facial-overlay-status waiting">
                    <ScanFace size={18} /> Aguardando rosto...
                  </div>
                )}

                {scanStatus === 'detecting' && (
                  <div className="facial-overlay-status detecting">
                    <ScanFace size={18} /> Rosto detectado — analisando...
                  </div>
                )}

                {scanStatus === 'recognizing' && !errorMsg && (
                  <div className="facial-overlay-status recognizing">
                    <Loader2 size={18} className="spinner" /> Processando biometria...
                  </div>
                )}

                {errorMsg && (
                  <div className="facial-overlay-status error">
                    {errorMsg}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
