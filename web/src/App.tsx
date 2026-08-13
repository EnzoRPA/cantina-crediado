import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import LoginPage from './pages/auth/LoginPage';
import POSPage from './pages/pos/POSPage';
import AdminLayout from './layouts/AdminLayout';
import ProductsPage from './pages/admin/ProductsPage';
import StudentsPage from './pages/admin/StudentsPage';
import GuardianPortal from './pages/guardian/GuardianPortal';
import SalesPage from './pages/admin/SalesPage';
import GuardiansPage from './pages/admin/GuardiansPage';
import SettingsPage from './pages/admin/SettingsPage';
import OnCreditPage from './pages/admin/OnCreditPage';
import FiadoScannerPage from './pages/admin/FiadoScannerPage';
import ToastContainer from './components/common/Toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const isAuthenticated = useAuthStore((s: any) => s.isAuthenticated);
  const user = useAuthStore((s: any) => s.user);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <SmartRedirect />;
  }

  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('cantina-theme') || 'default';
    if (savedTheme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastContainer />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* PDV */}
          <Route
            path="/pos"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager', 'operator']}>
                <POSPage />
              </ProtectedRoute>
            }
          />

          {/* Portal do Responsável */}
          <Route
            path="/guardian"
            element={
              <ProtectedRoute allowedRoles={['guardian']}>
                <GuardianPortal />
              </ProtectedRoute>
            }
          />

          {/* Admin / Gerente / Operador */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager', 'operator']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardOrRedirect />} />
            <Route path="products" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><ProductsPage /></ProtectedRoute>} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="guardians" element={<GuardiansPage />} />
            <Route path="cards" element={<PlaceholderPage title="Cartões" />} />
            <Route path="sales" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><SalesPage /></ProtectedRoute>} />
            <Route path="on-credit" element={<OnCreditPage />} />
            <Route path="fiado-scanner" element={<FiadoScannerPage />} />
            <Route path="reports" element={<ProtectedRoute allowedRoles={['admin']}><PlaceholderPage title="Relatórios" /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><SettingsPage /></ProtectedRoute>} />
          </Route>

          {/* Default redirect based on role */}
          <Route path="*" element={<SmartRedirect />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function DashboardOrRedirect() {
  return <Navigate to="/admin/on-credit" replace />;
}

/** Redirects admin/manager/operator/guardian to the right page */
function SmartRedirect() {
  const user = useAuthStore((s: any) => s.user);
  const isAuth = useAuthStore((s: any) => s.isAuthenticated);

  if (!isAuth) return <Navigate to="/login" replace />;
  if (user?.role === 'guardian') return <Navigate to="/guardian" replace />;
  return <Navigate to="/admin/on-credit" replace />;
}


/** Temporary placeholder for routes not yet implemented */
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="animate-fadeIn" style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>{title}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>Em desenvolvimento...</p>
    </div>
  );
}

