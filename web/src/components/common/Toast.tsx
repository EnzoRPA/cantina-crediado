import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import './Toast.css';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

// Global Event Dispatcher
export const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success', duration = 2000) => {
  const event = new CustomEvent('show-cantina-toast', {
    detail: { id: Date.now().toString() + Math.random().toString().slice(2, 6), message, type, duration }
  });
  window.dispatchEvent(event);
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEv = e as CustomEvent<ToastMessage>;
      const newToast = customEv.detail;
      setToasts((prev) => [...prev, newToast]);

      const timeout = newToast.duration || 2000;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, timeout);
    };

    window.addEventListener('show-cantina-toast', handleToast);
    return () => window.removeEventListener('show-cantina-toast', handleToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="cantina-toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`cantina-toast cantina-toast-${toast.type}`}>
          {toast.type === 'success' && <CheckCircle2 size={18} className="toast-icon" />}
          {toast.type === 'error' && <AlertCircle size={18} className="toast-icon" />}
          {toast.type === 'info' && <Info size={18} className="toast-icon" />}
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
