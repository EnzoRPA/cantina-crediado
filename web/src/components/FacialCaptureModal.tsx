import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { Camera, X, CheckCircle, Loader2, ScanFace } from 'lucide-react';
import { api } from '../services/api';
import './FacialCaptureModal.css';

interface FacialCaptureModalProps {
  studentId: string;
  studentName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface CameraDevice {
  deviceId: string;
  label: string;
}

const CAMERA_STORAGE_KEY = 'cantina_preferred_camera';

// Use TinyFaceDetector — fast enough for CPU backend
let _detectorOptions: faceapi.TinyFaceDetectorOptions | null = null;
function getDetectorOptions() {
  if (!_detectorOptions) {
    _detectorOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 416, // Matches FacialLoginModal to guarantee same landmark alignment and descriptor vectors
      scoreThreshold: 0.3,
    });
  }
  return _detectorOptions;
}

export function FacialCaptureModal({ studentId, studentName, isOpen, onClose, onSuccess }: FacialCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isModelLoading, setIsModelLoading] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentDescriptor, setCurrentDescriptor] = useState<Float32Array | null>(null);
  const [detectionScore, setDetectionScore] = useState<number>(0);

  // Camera selector state
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>(
    localStorage.getItem(CAMERA_STORAGE_KEY) || ''
  );

  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // ---- Draw scanner-style L-corners ----
  const drawScannerCorners = useCallback((
    ctx: CanvasRenderingContext2D,
    box: { x: number; y: number; width: number; height: number },
    cornerSize: number = 25,
    color: string = '#8b5cf6',
    lineWidth: number = 3
  ) => {
    const { x, y, width: w, height: h } = box;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    // Top-left
    ctx.beginPath();
    ctx.moveTo(x, y + cornerSize);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerSize, y);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + w - cornerSize, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + cornerSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x, y + h - cornerSize);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + cornerSize, y + h);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + w - cornerSize, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - cornerSize);
    ctx.stroke();
  }, []);

  // ---- Draw landmarks as small dots ----
  const drawLandmarks = useCallback((
    ctx: CanvasRenderingContext2D,
    landmarks: faceapi.FaceLandmarks68,
    color: string = '#8b5cf6'
  ) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;
    landmarks.positions.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.5, 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }, []);

  // Initialize everything on mount
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
          await startCamera();
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
    setCurrentDescriptor(null);
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
    if (loopRef.current) clearTimeout(loopRef.current as any);
  };

  // Video Process Loop
  const handleVideoPlay = () => {
    if (!videoRef.current || !canvasRef.current) return;

    if (videoRef.current.videoWidth === 0) {
      setTimeout(handleVideoPlay, 200);
      return;
    }

    const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
    faceapi.matchDimensions(canvasRef.current, displaySize);

    let frameCount = 0;
    const step = async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
      frameCount++;
      if (frameCount <= 3 || frameCount % 10 === 0) {
        console.log(`[FaceDetect] frame ${frameCount}`);
      }

      try {
        const t0 = performance.now();
        const detection = await faceapi
          .detectSingleFace(videoRef.current, getDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();
        const dt = Math.round(performance.now() - t0);

        if (detection && canvasRef.current) {
          const resized = faceapi.resizeResults(detection, displaySize);
          const ctx = canvasRef.current.getContext('2d');

          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            const box = resized.detection.box;

            // Draw scanner corners (purple for registration)
            drawScannerCorners(ctx, box, 25, '#8b5cf6', 3);

            // Draw face landmarks as dots
            drawLandmarks(ctx, resized.landmarks, '#a78bfa');

            // Draw confidence label
            const score = Math.round(resized.detection.score * 100);
            ctx.font = 'bold 12px "Inter", sans-serif';
            ctx.textAlign = 'center';
            const labelText = `${score}% (${dt}ms)`;
            const lm = ctx.measureText(labelText);
            const px = box.x + box.width / 2;
            const py = box.y - 12;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.roundRect(px - lm.width / 2 - 6, py - 10, lm.width + 12, 20, 5);
            ctx.fill();
            ctx.fillStyle = score >= 80 ? '#22c55e' : score >= 60 ? '#fbbf24' : '#f87171';
            ctx.fillText(labelText, px, py + 4);
          }

          if (frameCount <= 3) console.log(`[FaceDetect] ✓ Rosto detectado! score=${Math.round(resized.detection.score * 100)}% (${dt}ms)`);
          setCurrentDescriptor(detection.descriptor);
          setDetectionScore(Math.round(resized.detection.score * 100));
        } else {
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
          setCurrentDescriptor(null);
          setDetectionScore(0);
        }
      } catch (err) {
        console.error('Erro na detecção facial:', err);
      }

      // Schedule next frame with delay (CPU backend is slow)
      loopRef.current = window.setTimeout(step, 300) as any;
    };

    loopRef.current = window.setTimeout(step, 100) as any;
  };

  const handleCapture = async () => {
    if (!currentDescriptor) return;
    setCapturing(true);
    setErrorMsg('');

    try {
      // Per the gist: convert Float32Array to number[] for JSON serialization
      await api.post('/facial/register', {
        studentId,
        descriptor: Array.from(currentDescriptor),
      });

      setSuccess(true);
      stopCamera();

      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error('Error saving descriptor:', err.message);
      console.error('Response data:', JSON.stringify(err.response?.data, null, 2));
      setCapturing(false);
      const msg = err.response?.data?.error?.message || err.response?.data?.message || JSON.stringify(err.response?.data) || 'Falha ao salvar biometria.';
      setErrorMsg(msg);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="facial-modal-overlay">
      <div className="facial-modal-content animate-zoomIn">
        <div className="facial-modal-header">
          <div className="facial-modal-title-row">
            <ScanFace size={20} />
            <h2>Biometria Facial</h2>
          </div>
          <button className="btn-close" onClick={handleClose}><X size={20} /></button>
        </div>

        <div className="facial-modal-body">
          <p className="subtitle">Cadastrando o rosto de <strong>{studentName}</strong></p>

          {/* Camera selector */}
          {cameras.length > 1 && (
            <div className="camera-selector">
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

          <div className="video-container">
            {isModelLoading && (
              <div className="loading-state">
                <Loader2 size={32} className="spinner" />
                <p>Carregando Inteligência Artificial...</p>
              </div>
            )}

            {errorMsg && (
              <div className="error-state">
                <p>{errorMsg}</p>
              </div>
            )}

            {success ? (
              <div className="success-state">
                <CheckCircle size={64} className="success-icon" />
                <p>Biometria Concluída!</p>
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
                <canvas ref={canvasRef} className="face-canvas" />

                {isCameraReady && !currentDescriptor && (
                  <div className="overlay-hint">
                    <ScanFace size={16} /> Enquadre o rosto...
                  </div>
                )}

                {isCameraReady && currentDescriptor && (
                  <div className="overlay-hint" style={{ background: 'rgba(34, 197, 94, 0.7)' }}>
                    ✓ Rosto detectado ({detectionScore}% qualidade)
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="facial-modal-footer">
          <button className="btn btn-ghost" onClick={handleClose} disabled={capturing}>
            Cancelar
          </button>

          {!success && (
            <button
              className="btn btn-primary btn-face"
              onClick={handleCapture}
              disabled={!currentDescriptor || capturing || isModelLoading}
            >
              {capturing ? <Loader2 size={20} className="spinner" /> : <Camera size={20} />}
              {capturing ? 'Salvando...' : 'Capturar e Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
