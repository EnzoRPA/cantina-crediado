import { useState, useEffect } from 'react';
import { keepAliveService } from '../../services/keepAlive';
import { Activity } from 'lucide-react';
import './ServerStatusBadge.css';

export function ServerStatusBadge({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<'online' | 'waking' | 'offline'>('online');
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = keepAliveService.subscribe((newStatus, newLatency) => {
      setStatus(newStatus);
      setLatency(newLatency);
    });
    return () => unsubscribe();
  }, []);

  const getStatusText = () => {
    if (status === 'waking') return 'Acordando...';
    if (status === 'offline') return 'Offline';
    if (latency !== null) return `${latency}ms`;
    return 'Online';
  };

  const getStatusClass = () => {
    if (status === 'waking') return 'status-waking';
    if (status === 'offline') return 'status-offline';
    return 'status-online';
  };

  return (
    <div
      className={`server-status-badge ${getStatusClass()} ${compact ? 'compact' : ''}`}
      title={`Status do Servidor (Render): ${status === 'online' ? 'Ativo e Rápido' : 'Conectando'} | Keep-alive a cada 5s`}
    >
      <span className="status-indicator-dot" />
      {!compact && <Activity size={12} className="status-icon" />}
      <span className="status-label">{getStatusText()}</span>
    </div>
  );
}
