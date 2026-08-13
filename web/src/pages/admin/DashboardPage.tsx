import { useEffect, useState } from 'react';
import {
  DollarSign, ShoppingBag, Users, TrendingUp,
  Package, AlertTriangle, ArrowUpRight, ArrowDownRight, Clock
} from 'lucide-react';
import { api } from '../../services/api';
import './DashboardPage.css';

interface DashStats {
  todaySales: number;
  todayRevenue: number;
  todayTransactions: number;
  activeStudents: number;
  lowStockCount: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  recentSales: { id: string; student: string; amount: number; time: string; method: string }[];
  salesByCategory: { category: string; total: number }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      // In a real app, this would be a dedicated dashboard endpoint
      // For now, we build it from available APIs
      const today = new Date();
      const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const [productsRes, studentsRes, txRes] = await Promise.allSettled([
        api.get('/products', { params: { limit: 100 } }),
        api.get('/students', { params: { limit: 100 } }),
        api.get('/pos/transactions', { params: { limit: 100, startDate: todayString } }),
      ]);

      const getArray = (res: any) => res.status === 'fulfilled' ? (Array.isArray(res.value.data.data) ? res.value.data.data : res.value.data.data?.data || []) : [];
      const products = getArray(productsRes);
      const students = getArray(studentsRes);
      const transactions = getArray(txRes);

      const lowStock = Array.isArray(products)
        ? products.filter((p: any) => p.current_stock <= p.min_stock).length
        : 0;

      const completedTx = Array.isArray(transactions) 
        ? transactions.filter((t: any) => t.status === 'completed') 
        : [];

      const todayRevenue = completedTx.reduce((sum: number, t: any) => sum + Number(t.final_amount), 0);
      const todayTransactions = completedTx.length;

      setStats({
        todaySales: todayTransactions,
        todayRevenue,
        todayTransactions,
        activeStudents: Array.isArray(students) ? students.length : 0,
        lowStockCount: lowStock,
        topProducts: Array.isArray(products)
          ? products.slice(0, 5).map((p: any) => ({
              name: p.name,
              quantity: p.current_stock,
              revenue: Number(p.sale_price) * 10,
            }))
          : [],
        recentSales: [],
        salesByCategory: [],
      });
    } catch (err) {
      console.error('Dashboard load error:', err);
      setStats({
        todaySales: 0, todayRevenue: 0, todayTransactions: 0,
        activeStudents: 0, lowStockCount: 0, topProducts: [],
        recentSales: [], salesByCategory: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  if (loading) {
    return <div className="dash-loading">Carregando dashboard...</div>;
  }

  const statCards = [
    {
      label: 'Vendas Hoje',
      value: stats?.todayTransactions || 0,
      icon: ShoppingBag,
      color: 'primary',
      change: '+12%',
      up: true,
    },
    {
      label: 'Faturamento',
      value: formatCurrency(stats?.todayRevenue || 0),
      icon: DollarSign,
      color: 'success',
      change: '+8%',
      up: true,
    },
    {
      label: 'Alunos Ativos',
      value: stats?.activeStudents || 0,
      icon: Users,
      color: 'info',
      change: '',
      up: true,
    },
    {
      label: 'Estoque Baixo',
      value: stats?.lowStockCount || 0,
      icon: AlertTriangle,
      color: stats?.lowStockCount ? 'danger' : 'success',
      change: '',
      up: false,
    },
  ];

  return (
    <div className="dashboard animate-fadeIn">
      <div className="dash-header">
        <div>
          <h1>Dashboard</h1>
          <p>Visão geral da cantina</p>
        </div>
        <div className="dash-date">
          {new Date().toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="dash-stats">
        {statCards.map((card, i) => (
          <div key={i} className={`dash-stat-card stat-${card.color}`}>
            <div className="stat-icon">
              <card.icon size={22} />
            </div>
            <div className="stat-content">
              <span className="stat-label">{card.label}</span>
              <span className="stat-value">{card.value}</span>
              {card.change && (
                <span className={`stat-change ${card.up ? 'up' : 'down'}`}>
                  {card.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {card.change}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Content Grid */}
      <div className="dash-grid">
        {/* Top Products */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h3><Package size={18} /> Top Produtos</h3>
          </div>
          <div className="dash-card-body">
            {stats?.topProducts?.length ? (
              <div className="dash-product-list">
                {stats.topProducts.map((p, i) => (
                  <div key={i} className="dash-product-item">
                    <div className="dash-product-rank">#{i + 1}</div>
                    <div className="dash-product-info">
                      <span className="dash-product-name">{p.name}</span>
                      <span className="dash-product-qty">{p.quantity} em estoque</span>
                    </div>
                    <span className="dash-product-rev">{formatCurrency(p.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dash-empty">Nenhuma venda registrada hoje</p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h3><TrendingUp size={18} /> Ações Rápidas</h3>
          </div>
          <div className="dash-card-body">
            <div className="dash-actions">
              <a href="/admin/on-credit" className="dash-action-btn">
                <Clock size={24} />
                <span>Crediário (A Prazo)</span>
              </a>
              <a href="/admin/products" className="dash-action-btn">
                <Package size={24} />
                <span>Gerenciar Produtos</span>
              </a>
              <a href="/admin/students" className="dash-action-btn">
                <Users size={24} />
                <span>Gerenciar Alunos</span>
              </a>
              <a href="/admin/reports" className="dash-action-btn">
                <TrendingUp size={24} />
                <span>Ver Relatórios</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
