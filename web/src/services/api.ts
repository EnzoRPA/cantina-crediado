import axios from 'axios';

const rawUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const API_BASE = rawUrl.endsWith('/api') || rawUrl.endsWith('/api/')
  ? rawUrl
  : `${rawUrl.replace(/\/+$/, '')}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// Response interceptor: handle 401 + refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
          const newAccessToken = data.data.accessToken;
          const newRefreshToken = data.data.refreshToken;

          localStorage.setItem('accessToken', newAccessToken);
          localStorage.setItem('refreshToken', newRefreshToken);

          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

          processQueue(null, newAccessToken);
          isRefreshing = false;

          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          isRefreshing = false;

          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }
    return Promise.reject(error);
  }
);

// ---- Auth ----
export const authApi = {
  login: (data: { email: string; password: string; schoolId: string }) =>
    api.post('/auth/login', data),
  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refreshToken }),
  profile: () => api.get('/auth/profile'),
  registerGuardian: (data: any) =>
    api.post('/auth/register-guardian', data),
};

// ---- POS ----
export const posApi = {
  openCashRegister: (data: { openingBalance: number; terminalName?: string }) =>
    api.post('/pos/cash-register/open', data),
  closeCashRegister: (data?: { notes?: string }) =>
    api.post('/pos/cash-register/close', data || {}),
  getCurrentRegister: () =>
    api.get('/pos/cash-register/current'),
  addMovement: (data: { type: 'sangria' | 'suprimento'; amount: number; description: string }) =>
    api.post('/pos/cash-register/movement', data),
  createTransaction: (data: any) =>
    api.post('/pos/transactions', data),
  listTransactions: (params?: any) =>
    api.get('/pos/transactions', { params }),
  cancelTransaction: (id: string, reason: string) =>
    api.post(`/pos/transactions/${id}/cancel`, { reason }),
  getShiftReport: () =>
    api.get('/pos/shift-report'),
  resetTestSales: () =>
    api.post('/pos/reset-test-sales'),
  createManualOnCredit: (data: { studentId: string; amount: number; date?: string; description?: string }) =>
    api.post('/pos/on-credit/manual', data),
  createBatchManualOnCredit: (data: { date?: string; description?: string; items: Array<{ studentId: string; amount: number }> }) =>
    api.post('/pos/on-credit/manual-batch', data),
  getRecentConsumers: (startDate?: string, endDate?: string) =>
    api.get('/pos/on-credit/recent-consumers', { params: { startDate, endDate } }),
  updateOnCreditTransaction: (transactionId: string, data: { amount?: number; date?: string; description?: string }) =>
    api.put(`/pos/on-credit/transactions/${transactionId}`, data),
  deleteOnCreditTransaction: (transactionId: string) =>
    api.delete(`/pos/on-credit/transactions/${transactionId}`),
};


// ---- Products / Menu ----
export const menuApi = {
  getToday: () => api.get('/menu/today'),
  getPromotions: () => api.get('/menu/promotions'),
};

// ---- Cards ----
export const cardsApi = {
  getStudentByCard: (code: string) =>
    api.get(`/cards/${code}/student`),
};

// ---- Students ----
export const studentsApi = {
  create: (data: any) =>
    api.post('/students', data),
  update: (id: string, data: any) =>
    api.put(`/students/${id}`, data),
  delete: (id: string) =>
    api.delete(`/students/${id}`),
  getById: (id: string) =>
    api.get(`/students/${id}`),
  search: (query: string) =>
    api.get('/students', { params: { search: query, limit: 10 } }),
  list: (params?: any) =>
    api.get('/students', { params }),
  getBalance: (id: string) =>
    api.get(`/students/${id}/balance`),
  adjustBalance: (id: string, data: { amount: number; type: 'credit' | 'debit'; reason: string }) =>
    api.post(`/students/${id}/balance`, data),
  updateMarketing: (id: string, isMarketingSent: boolean) =>
    api.put(`/students/${id}/marketing`, { isMarketingSent }),
};

// ---- Daily Limits ----
export const dailyLimitsApi = {
  get: (studentId: string) =>
    api.get(`/daily-limits/${studentId}`),
  upsert: (studentId: string, data: { maxDailyAmount: number | null }) =>
    api.put(`/daily-limits/${studentId}`, data),
  delete: (studentId: string) =>
    api.delete(`/daily-limits/${studentId}`),
  check: (studentId: string, data: { amount: number; productIds?: string[] }) =>
    api.post(`/daily-limits/${studentId}/check`, data),
};

// ---- Payments ----
export const paymentsApi = {
  createPix: (data: { transactionId: string; amount: number }) =>
    api.post('/payments/pix', data),
  approveTransaction: (transactionId: string) =>
    api.post(`/payments/transactions/${transactionId}/approve`),
};

// ---- Facial ----
export const facialApi = {
  register: (data: { studentId: string; descriptor: number[] }) =>
    api.post('/facial/register', data),
  recognize: (data: { descriptor: number[] }) =>
    api.post('/facial/recognize', data),
};

// ---- Guardians ----
export const guardiansApi = {
  list: (params?: any) => api.get('/guardians', { params }),
  getById: (id: string) => api.get(`/guardians/${id}`),
  create: (data: any) => api.post('/guardians', data),
  update: (id: string, data: any) => api.put(`/guardians/${id}`, data),
  linkStudent: (id: string, data: { studentId: string; relationship: string; isPrimary: boolean }) =>
    api.post(`/guardians/${id}/students`, data),
  unlinkStudent: (id: string, studentId: string) =>
    api.delete(`/guardians/${id}/students/${studentId}`),
};

// ---- Users / System Accesses ----
export const usersApi = {
  list: (params?: any) => api.get('/users', { params }),
  getById: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};
