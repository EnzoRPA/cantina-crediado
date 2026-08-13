import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, Coffee, DollarSign, Package, Clock, LayoutDashboard, ShoppingBag, Search } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { usePosStore } from '../../stores/posStore';
import { getImageUrl } from '../../utils/url';
import { menuApi, posApi, authApi, dailyLimitsApi } from '../../services/api';
import CartPanel from '../../components/pos/CartPanel';
import PaymentModal from '../../components/pos/PaymentModal';
import CashRegisterModal from '../../components/pos/CashRegisterModal';
import FacialLoginModal from '../../components/pos/FacialLoginModal';
import { StudentSearchAutocomplete } from '../../components/pos/StudentSearchAutocomplete';
import { StudentSelectionModal, type StudentResult } from '../../components/pos/StudentSelectionModal';
import './POSPage.css';

interface Product {
  id: string;
  name: string;
  sale_price: number;
  effective_price: number;
  image_url: string | null;
  current_stock: number;
  unit: string;
  category_id: string | null;
  is_promotional: boolean;
  control_stock?: boolean;
}

interface Category {
  id: string | null;
  name: string;
}

interface MenuCategory {
  category: Category;
  products: Product[];
}

export default function POSPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { addItem, student, setStudent, setCashRegisterId, items, totalAmount, totalItems } = usePosStore();

  const [showMobileCart, setShowMobileCart] = useState(false);

  const [menuData, setMenuData] = useState<MenuCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [showFacialLogin, setShowFacialLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // State for multiple student selection modal
  const [ambiguousStudents, setAmbiguousStudents] = useState<StudentResult[]>([]);
  const [ambiguousSearchTerm, setAmbiguousSearchTerm] = useState('');
  const [showSelectionModal, setShowSelectionModal] = useState(false);

  // Daily limit display state
  const [dailyLimit, setDailyLimit] = useState<{ max: number | null; remaining: number | null } | null>(null);

  // Custom Amount state (Valor Avulso)
  const [showCustomAmountModal, setShowCustomAmountModal] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [customDescription, setCustomDescription] = useState('');

  useEffect(() => {
    if (student) {
      loadDailyLimit(student.studentId);
    } else {
      setDailyLimit(null);
    }
  }, [student]);

  const loadDailyLimit = async (studentId: string) => {
    try {
      const { data } = await dailyLimitsApi.get(studentId);
      if (data.success && data.data?.limit) {
        const limit = data.data.limit;
        setDailyLimit({
          max: limit.max_daily_amount ? Number(limit.max_daily_amount) : null,
          remaining: limit.remaining_today !== undefined && limit.remaining_today !== null ? Number(limit.remaining_today) : null,
        });
      } else {
        setDailyLimit(null);
      }
    } catch (err) {
      console.error('Failed to load student daily limit:', err);
      setDailyLimit(null);
    }
  };

  const handleAddCustomAmount = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customAmount.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      alert('Informe um valor válido maior que zero');
      return;
    }
    addItem({
      productId: `custom-${Date.now()}`,
      name: customDescription.trim() || 'Valor Avulso',
      unitPrice: val,
    });
    setShowCustomAmountModal(false);
  };

  // Fetch menu on mount
  useEffect(() => {
    loadMenu();
    loadProfile();

    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const loadProfile = async () => {
    try {
      const { data } = await authApi.profile();
      useAuthStore.getState().setUser(data.data.user);
    } catch {
      logout();
      navigate('/login');
    }
  };

  const loadMenu = async () => {
    try {
      setLoading(true);
      const { data } = await menuApi.getToday();
      setMenuData(data.data.menu.categories || []);
    } catch (err) {
      console.error('Failed to load menu:', err);
    } finally {
      setLoading(false);
    }
  };

  // Check cash register on mount
  useEffect(() => {
    checkCashRegister();
  }, []);

  const checkCashRegister = async () => {
    try {
      const { data } = await posApi.getCurrentRegister();
      setCashRegisterId(data.data.register.id);
    } catch {
      setShowCashRegister(true);
    }
  };

  const handleSelectStudentFromModal = (s: StudentResult) => {
    setStudent({
      studentId: s.id,
      name: s.name,
      enrollmentNumber: s.enrollment_number,
      balance: Number(s.balance || 0),
      photoUrl: s.photo_url,
      method: 'manual',
    });
    setShowSelectionModal(false);
  };

  const handleMultipleResults = (students: StudentResult[], searchTerm: string) => {
    setAmbiguousStudents(students);
    setAmbiguousSearchTerm(searchTerm);
    setShowSelectionModal(true);
  };

  // Filter products
  const allProducts = menuData.flatMap((mc) => mc.products);
  const filteredProducts = allProducts.filter((p) => {
    const matchCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const handleAddProduct = (product: Product) => {
    if (product.control_stock !== false && product.current_stock <= 0) return;
    addItem({
      productId: product.id,
      name: product.name,
      unitPrice: product.effective_price,
      imageUrl: product.image_url || undefined,
    });
  };

  const handleLogout = () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) authApi.logout(refreshToken);
    logout();
    navigate('/login');
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="pos-page">
      {/* ---- Header ---- */}
      <header className="pos-header">
        <div className="pos-header-left">
          <div className="pos-logo">
            <Coffee size={20} />
            <span>Cantina PDV</span>
          </div>
          <div className="pos-time">
            <Clock size={14} />
            {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <div className="pos-header-center">
          {/* Student identification with Autocomplete */}
          <StudentSearchAutocomplete
            onSelectStudent={(s) => setStudent(s)}
            onOpenFacialLogin={() => setShowFacialLogin(true)}
            onMultipleResultsFound={handleMultipleResults}
          />

          {student && (
            <div className="pos-student-info animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '6px 12px', gap: '2px', minWidth: '220px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                <User size={16} />
                <span className="pos-student-name" style={{ fontWeight: 'bold' }}>{student.name}</span>
                <button className="btn btn-ghost btn-sm" style={{ padding: '2px', marginLeft: 'auto', height: 'auto', minHeight: 'unset' }} onClick={() => setStudent(null)}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: '10px', fontSize: '0.8rem', opacity: 0.9 }}>
                <span className="pos-student-balance">
                  Saldo: {formatCurrency(student.balance)}
                </span>
                {dailyLimit && dailyLimit.max !== null && (
                  <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                    Limite: {formatCurrency(dailyLimit.max)} (Restante: {formatCurrency(dailyLimit.remaining ?? 0)})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="pos-header-right">
          <button
            className="btn btn-sm"
            style={{ marginRight: '8px', background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', color: '#ffffff', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', boxShadow: '0 2px 6px rgba(22, 163, 74, 0.3)' }}
            onClick={() => navigate('/admin/on-credit')}
            title="Abrir Lançamentos A Prazo em Lote"
          >
            <Clock size={15} /> A Prazo em Lote
          </button>

          {user?.role === 'admin' && (
            <button className="btn btn-secondary btn-sm" style={{ marginRight: '8px' }} onClick={() => navigate('/admin')}>
              <LayoutDashboard size={16} /> Painel
            </button>
          )}

          <button className="btn btn-ghost btn-sm" onClick={() => setShowCashRegister(true)}>
            <DollarSign size={16} /> Caixa
          </button>
          <div className="pos-operator">
            <User size={14} />
            <span>{user?.name?.split(' ')[0] || 'Operador'}</span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={handleLogout} title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ---- Main Content ---- */}
      <div className="pos-main">
        {/* Left: Products */}
        <div className="pos-products-section">
          {/* Categories */}
          <div className="pos-categories">
            <button
              className={`pos-category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              <Package size={16} />
              Todos
            </button>
            {menuData.map((mc, idx) => (
              <button
                key={mc.category?.id ?? `uncategorized-${idx}`}
                className={`pos-category-btn ${selectedCategory === mc.category?.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(mc.category?.id ?? null)}
              >
                {mc.category?.name}
              </button>
            ))}
          </div>

          {/* Search and Custom Amount */}
          <div className="pos-search" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-body, #f8fafc)', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border-color, #e2e8f0)' }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Buscar produto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pos-search-input"
              />
            </div>
            <button
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', height: '42px', padding: '0 16px', fontWeight: 600 }}
              onClick={() => {
                setCustomAmount('');
                setCustomDescription('');
                setShowCustomAmountModal(true);
              }}
            >
              <DollarSign size={18} /> + Valor Avulso
            </button>
          </div>

          {/* Products Grid */}
          <div className="pos-products-grid">
            {loading ? (
              <div className="pos-loading">Carregando cardápio...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="pos-empty">Nenhum produto encontrado</div>
            ) : (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  className={`pos-product-card ${product.control_stock !== false && product.current_stock <= 0 ? 'out-of-stock' : ''}`}
                  onClick={() => handleAddProduct(product)}
                  disabled={product.control_stock !== false && product.current_stock <= 0}
                >
                  <div className="pos-product-image">
                    {product.image_url ? (
                      <img src={getImageUrl(product.image_url) || ''} alt={product.name} />
                    ) : (
                      <Coffee size={28} />
                    )}
                    {product.is_promotional && (
                      <span className="pos-promo-badge">PROMO</span>
                    )}
                  </div>
                  <div className="pos-product-info">
                    <span className="pos-product-name">{product.name}</span>
                    <span className="pos-product-price">
                      {formatCurrency(product.effective_price)}
                    </span>
                    <span className="pos-product-stock">
                      {product.control_stock === false
                        ? 'Ilimitado'
                        : product.current_stock > 0
                        ? `${product.current_stock} ${product.unit}`
                        : 'Esgotado'}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Cart */}
        <div className={`pos-cart-wrap ${showMobileCart ? 'mobile-open' : ''}`}>
          <CartPanel
            onCheckout={() => {
              if (items.length === 0) {
                alert('Adicione produtos ao carrinho');
                return;
              }
              setShowPayment(true);
            }}
            onClose={() => setShowMobileCart(false)}
          />
        </div>
      </div>

      {/* Floating Bottom Cart Bar for Mobile */}
      {totalItems() > 0 && (
        <button className="pos-mobile-cart-bar mobile-only" onClick={() => setShowMobileCart(true)}>
          <div className="pos-mobile-cart-bar-left">
            <ShoppingBag size={18} />
            <span>Ver Carrinho ({totalItems()})</span>
          </div>
          <span className="pos-mobile-cart-bar-total">{formatCurrency(totalAmount())}</span>
        </button>
      )}

      {/* Modals */}
      {showPayment && (
        <PaymentModal onClose={() => setShowPayment(false)} />
      )}
      {showCashRegister && (
        <CashRegisterModal onClose={() => setShowCashRegister(false)} />
      )}
      {showFacialLogin && (
        <FacialLoginModal onClose={() => setShowFacialLogin(false)} isOpen={showFacialLogin} />
      )}
      <StudentSelectionModal
        isOpen={showSelectionModal}
        students={ambiguousStudents}
        searchTerm={ambiguousSearchTerm}
        onSelect={handleSelectStudentFromModal}
        onClose={() => setShowSelectionModal(false)}
      />

      {/* Custom Amount Modal (Valor Avulso) */}
      {showCustomAmountModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-zoomIn" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2><DollarSign size={20} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Lançar Valor Avulso</h2>
              <button type="button" className="btn-close" onClick={() => setShowCustomAmountModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustomAmount}>
              <div className="modal-body">
                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem' }}>
                  Informe um valor monetário direto para adicionar ao carrinho (ex: Ficha de valor personalizado).
                </p>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Valor em Reais (R$)*</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input"
                    placeholder="0,00"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    autoFocus
                    required
                    style={{ fontSize: '1.25rem', fontWeight: 'bold', padding: '0.6rem 0.75rem' }}
                  />
                </div>

                {/* Quick Presets */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>Atalhos de Valores</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {[1, 2, 5, 10, 15, 20, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ padding: '8px 4px', fontSize: '0.85rem', fontWeight: 600 }}
                        onClick={() => setCustomAmount(preset.toFixed(2))}
                      >
                        R$ {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Descrição (Opcional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ex: Valor Avulso / Ficha Personalizada"
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCustomAmountModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Adicionar ao Carrinho
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
