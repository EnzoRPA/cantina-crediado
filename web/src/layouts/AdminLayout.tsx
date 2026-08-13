import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Package, Users, ShoppingBag,
  BarChart3, Settings, LogOut, Coffee,
  ChevronLeft, ChevronRight, Menu, X, UserCheck, Clock, QrCode
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../services/api';
import './AdminLayout.css';

const menuItems = [
  { path: '/admin/on-credit', icon: Clock, label: 'A Prazo (Crediário)' },
  { path: '/admin/fiado-scanner', icon: QrCode, label: 'Folha & Scanner QR' },
  { path: '/admin/students', icon: Users, label: 'Alunos / Clientes' },
  { path: '/admin/guardians', icon: UserCheck, label: 'Responsáveis' },
  { path: '/admin/products', icon: Package, label: 'Produtos' },
  { path: '/admin/sales', icon: ShoppingBag, label: 'Vendas' },
  { path: '/admin/reports', icon: BarChart3, label: 'Relatórios' },
  { path: '/admin/settings', icon: Settings, label: 'Configurações' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    const rt = localStorage.getItem('refreshToken');
    if (rt) authApi.logout(rt);
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  const [visiblePages, setVisiblePages] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('cantina-visible-pages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && !parsed.includes('/admin/fiado-scanner')) {
          parsed.push('/admin/fiado-scanner');
          localStorage.setItem('cantina-visible-pages', JSON.stringify(parsed));
        }
        return parsed;
      }
    } catch (_) {}
    return ['/admin/on-credit', '/admin/fiado-scanner', '/admin/students', '/admin/guardians', '/admin/products', '/admin/sales', '/admin/reports', '/admin/settings'];
  });

  useEffect(() => {
    const handleUpdate = () => {
      try {
        const saved = localStorage.getItem('cantina-visible-pages');
        if (saved) setVisiblePages(JSON.parse(saved));
      } catch (_) {}
    };
    window.addEventListener('cantina-visible-pages-updated', handleUpdate);
    return () => window.removeEventListener('cantina-visible-pages-updated', handleUpdate);
  }, []);

  const filteredMenuItems = menuItems.filter(item => {
    // Custom user visibility settings from localStorage
    if (visiblePages.length > 0 && !visiblePages.includes(item.path) && item.path !== '/admin/settings' && item.path !== '/admin/fiado-scanner') {
      return false;
    }
    if (!user) return true;
    if (user.role === 'operator') {
      return ['/admin/on-credit', '/admin/fiado-scanner', '/admin/students', '/admin/guardians'].includes(item.path);
    }
    if (user.role === 'manager') {
      return item.path !== '/admin/reports';
    }
    return true;
  });

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'manager': return 'Gerente / Supervisor';
      case 'operator': return 'Operador de Caixa';
      default: return role || '';
    }
  };

  return (
    <div className="admin-layout">
      {/* Sidebar Backdrop Overlay on Mobile */}
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`admin-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Coffee size={22} />
            {(!collapsed || mobileOpen) && <span>Cantina Admin</span>}
          </div>
          <button
            className="sidebar-toggle desktop-only"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            className="sidebar-mobile-close mobile-only"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {filteredMenuItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
              title={collapsed ? label : undefined}
              onClick={handleNavClick}
            >
              <Icon size={20} />
              {(!collapsed || mobileOpen) && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {user?.name?.charAt(0) || 'A'}
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{user?.name}</span>
                <span className="sidebar-user-role">{getRoleLabel(user?.role)}</span>
              </div>
            )}
            <button className="sidebar-logout" onClick={handleLogout} title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        {/* Mobile Header */}
        <div className="mobile-admin-header mobile-only">
          <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>
            <Menu size={24} />
          </button>
          <div className="mobile-logo">
            <Coffee size={20} />
            <span>Cantina Admin</span>
          </div>
          <div className="mobile-user-avatar">
            {user?.name?.charAt(0) || 'A'}
          </div>
        </div>


        <div className="admin-page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

