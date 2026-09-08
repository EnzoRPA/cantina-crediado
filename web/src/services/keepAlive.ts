/**
 * Serviço Keep-Alive para manter o backend no Render acordado
 * Realiza pings de 5 em 5 segundos no endpoint /health
 */

type ServerStatus = 'online' | 'waking' | 'offline';

interface KeepAliveListener {
  (status: ServerStatus, latencyMs: number | null): void;
}

class RenderKeepAliveService {
  private intervalId: any = null;
  private isRunning: boolean = false;
  private intervalMs: number = 5000; // 5 segundos
  private status: ServerStatus = 'online';
  private latencyMs: number | null = null;
  private listeners: Set<KeepAliveListener> = new Set();
  private healthUrl: string = '';
  private visibilityHandler: (() => void) | null = null;

  constructor() {
    const rawUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    const baseUrl = rawUrl.endsWith('/api') || rawUrl.endsWith('/api/')
      ? rawUrl.replace(/\/+$/, '')
      : `${rawUrl.replace(/\/+$/, '')}/api`;

    this.healthUrl = `${baseUrl}/health`;
  }

  public start(customIntervalMs = 5000) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalMs = customIntervalMs;

    // Ping imediato ao inicializar
    this.ping();

    this.intervalId = setInterval(() => {
      this.ping();
    }, this.intervalMs);

    // Quando a aba volta a ficar visível, dispara um ping imediato
    if (typeof document !== 'undefined' && !this.visibilityHandler) {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          this.ping();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (typeof document !== 'undefined' && this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.isRunning = false;
  }

  public subscribe(listener: KeepAliveListener): () => void {
    this.listeners.add(listener);
    listener(this.status, this.latencyMs);
    return () => this.listeners.delete(listener);
  }

  public getStatus() {
    return { status: this.status, latencyMs: this.latencyMs };
  }

  private async ping() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline', null);
      return;
    }

    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(this.healthUrl, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latency = Date.now() - start;

      if (res.ok) {
        this.setStatus('online', latency);
      } else {
        this.setStatus('waking', latency);
      }
    } catch (err: any) {
      clearTimeout(timeout);
      const latency = Date.now() - start;
      if (err.name === 'AbortError') {
        // Provável cold start do Render acordando
        this.setStatus('waking', latency);
      } else {
        this.setStatus('waking', null);
      }
    }
  }

  private setStatus(status: ServerStatus, latency: number | null) {
    this.status = status;
    this.latencyMs = latency;
    this.listeners.forEach((l) => l(status, latency));
  }
}

export const keepAliveService = new RenderKeepAliveService();
