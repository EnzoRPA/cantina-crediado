import { useEffect, useState } from 'react';
import { 
  ShoppingBag, Search, Filter, CheckCircle, 
  Clock, ChevronDown, ChevronUp, AlertCircle, 
  MessageSquare, Loader2, XCircle, Wallet, Copy,
  X, RotateCcw, CalendarDays
} from 'lucide-react';
import { posApi, paymentsApi, api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { generateStaticPix } from '../../utils/pix';
import './SalesPage.css';


interface TransactionItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface TransactionPayment {
  id: string;
  payment_method: string;
  amount: number;
  status: string;
  metadata?: string;
}

interface Transaction {
  id: string;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  identification_method: string | null;
  created_at: string;
  notes: string | null;
  operator_name: string;
  student_name: string | null;
  enrollment_number: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  items?: TransactionItem[];
  payments?: TransactionPayment[];
}

export default function SalesPage() {
  const user = useAuthStore((s) => s.user);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 15;

  // Summary totals for all pages
  const [summary, setSummary] = useState<{
    pendingTotal: number;
    completedSalesTotal: number;
    rechargeTotal: number;
    totalCount: number;
  } | null>(null);

  useEffect(() => {
    loadTransactions();
  }, [page, statusFilter, startDate, endDate]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setError('');
      
      const params: any = {
        page,
        limit,
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const { data } = await posApi.listTransactions(params);
      
      // Fetch details (items and payments) for each transaction
      const txList: Transaction[] = data.data.data || [];
      const detailedList = await Promise.all(
        txList.map(async (tx) => {
          try {
            const res = await apiGetTransaction(tx.id);
            return res;
          } catch {
            return tx;
          }
        })
      );

      setTransactions(detailedList);
      setTotalPages(data.data.pagination?.totalPages || 1);
      setSummary(data.data.summary || null);
    } catch (err: any) {
      setError('Erro ao carregar vendas. Verifique sua conexão.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const apiGetTransaction = async (id: string): Promise<Transaction> => {
    const response = await api.get(`/pos/transactions/${id}`);
    return response.data.data.transaction;
  };

  const handleApprovePayment = async (txId: string) => {
    if (!window.confirm('Confirmar recebimento manual deste Pix a Distância?')) return;
    try {
      await paymentsApi.approveTransaction(txId);
      alert('Pagamento confirmado com sucesso!');
      loadTransactions();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Falha ao confirmar pagamento.');
    }
  };

  const handleCancelTransaction = async (txId: string) => {
    const reason = window.prompt('Motivo do cancelamento (ex: Lançamento por engano, Desistência):');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('É necessário informar o motivo do cancelamento.');
      return;
    }
    try {
      await posApi.cancelTransaction(txId, reason.trim());
      alert('Venda cancelada com sucesso!');
      loadTransactions();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Falha ao cancelar venda.');
    }
  };

  const handleSendWhatsApp = (tx: Transaction) => {
    if (!tx.guardian_phone) return;
    const cleanPhone = tx.guardian_phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone;
    
    const itemsText = tx.items?.map(i => `- ${i.quantity}x ${i.product_name} (${formatCurrency(Number(i.total_price))})`).join('\n') || '';
    
    const savedKey = localStorage.getItem('cantina-pix-key') || '52803416000141';
    const savedMerchant = localStorage.getItem('cantina-merchant-name') || 'POLLYANNA AVELINO VERZARO';
    const savedCity = localStorage.getItem('cantina-merchant-city') || 'IMPERATRIZ';

    const pixCode = generateStaticPix(savedKey, Number(tx.final_amount), savedMerchant, savedCity);
    const formattedCnpj = savedKey === '52803416000141' ? '52.803.416/0001-41' : savedKey;

    const txDate = tx.created_at ? new Date(tx.created_at) : new Date();
    const formattedDate = txDate.toLocaleDateString('pt-BR');
    const formattedTime = txDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    try { navigator.clipboard.writeText(pixCode); } catch (_) {}

    const messageText = `Olá, ${tx.guardian_name || 'Responsável'}! Lembramos que o seu filho(a) *${tx.student_name}* consumiu na cantina em *${formattedDate} às ${formattedTime}* o valor de *${formatCurrency(tx.final_amount)}*.\n\n*Itens consumidos:*\n${itemsText}\n\n*Informações do Pix:*\nBeneficiário: ${savedMerchant}\nBanco: Banco Inter\nChave Pix (CNPJ): ${formattedCnpj}\n\n*Pix Copia e Cola (Valor Fechado: ${formatCurrency(tx.final_amount)}):*\n${pixCode}\n\nPor favor, envie o comprovante após a transferência. Obrigado!`;
    
    const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(messageText)}`;
    window.open(url, '_blank');
  };

  const handleSendPixOnly = (tx: Transaction) => {
    if (!tx.guardian_phone) return;
    const cleanPhone = tx.guardian_phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone;

    const savedKey = localStorage.getItem('cantina-pix-key') || '52803416000141';
    const savedMerchant = localStorage.getItem('cantina-merchant-name') || 'POLLYANNA AVELINO VERZARO';
    const savedCity = localStorage.getItem('cantina-merchant-city') || 'IMPERATRIZ';

    const pixCode = generateStaticPix(savedKey, Number(tx.final_amount), savedMerchant, savedCity);
    try { navigator.clipboard.writeText(pixCode); } catch (_) {}

    const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(pixCode)}`;
    window.open(url, '_blank');
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const toggleExpand = (id: string) => {
    setExpandedTxId(expandedTxId === id ? null : id);
  };

  const getTxType = (tx: Transaction) => {
    if (
      tx.notes === 'Recarga Online PIX' ||
      tx.identification_method === 'balance_adjustment' ||
      (tx.identification_method === 'manual' && (tx.notes?.toLowerCase().includes('ajuste') || tx.notes?.toLowerCase().includes('saldo')))
    ) {
      return 'recharge';
    }
    return 'sale';
  };

  const handleSetDatePreset = (preset: 'today' | '7days' | 'thisMonth') => {
    const now = new Date();
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (preset === 'today') {
      const todayStr = formatDate(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '7days') {
      const past = new Date();
      past.setDate(past.getDate() - 6);
      setStartDate(formatDate(past));
      setEndDate(formatDate(now));
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatDate(firstDay));
      setEndDate(formatDate(now));
    }
    setPage(1);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const activeFiltersCount = 
    (statusFilter !== 'all' ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (searchQuery.trim() !== '' ? 1 : 0) +
    (startDate !== '' ? 1 : 0) +
    (endDate !== '' ? 1 : 0);

  // Filter local search in addition to server filters
  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = !searchQuery || (() => {
      const query = searchQuery.toLowerCase();
      return (
        tx.id.toLowerCase().includes(query) ||
        (tx.student_name && tx.student_name.toLowerCase().includes(query)) ||
        (tx.notes && tx.notes.toLowerCase().includes(query)) ||
        (tx.enrollment_number && tx.enrollment_number.toLowerCase().includes(query))
      );
    })();

    const matchesType = typeFilter === 'all' || getTxType(tx) === typeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <div className="sales-page animate-fadeIn">
      <div className="sales-header">
        <div>
          <h1>Gerenciar Vendas</h1>
          <p>Acompanhe o histórico de vendas, Pix a Distância e recebimentos da cantina</p>
        </div>
      </div>

      {/* Stats row (Visible only for admin) */}
      {user?.role === 'admin' && (
        <div className="sales-stats-row">
          <div className="sales-stat-card pending">
            <div className="stat-card-header">
              <span>Pix a Distância Pendentes</span>
              <Clock size={20} className="text-warning" />
            </div>
            <div className="stat-card-value">
              {formatCurrency(
                summary?.pendingTotal ??
                transactions
                  .filter(t => t.status === 'pending')
                  .reduce((sum, t) => sum + Number(t.final_amount), 0)
              )}
            </div>
            <span className="stat-card-sub">Cobranças em aberto (Geral)</span>
          </div>

          <div className="sales-stat-card completed">
            <div className="stat-card-header">
              <span>Vendas Concluídas</span>
              <CheckCircle size={20} className="text-success" />
            </div>
            <div className="stat-card-value">
              {formatCurrency(
                summary?.completedSalesTotal ??
                transactions
                  .filter(t => t.status === 'completed' && getTxType(t) === 'sale')
                  .reduce((sum, t) => sum + Number(t.final_amount), 0)
              )}
            </div>
            <span className="stat-card-sub">Vendas na cantina (Geral)</span>
          </div>

          <div className="sales-stat-card recharge" style={{ borderLeft: '4px solid var(--color-primary)' }}>
            <div className="stat-card-header">
              <span>Recargas de Saldo</span>
              <Wallet size={20} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div className="stat-card-value" style={{ color: 'var(--color-primary)' }}>
              {formatCurrency(
                summary?.rechargeTotal ??
                transactions
                  .filter(t => t.status === 'completed' && getTxType(t) === 'recharge')
                  .reduce((sum, t) => sum + Number(t.final_amount), 0)
              )}
            </div>
            <span className="stat-card-sub">Recargas online e manuais (Geral)</span>
          </div>
        </div>
      )}


      {/* Structured Filters Container */}
      <div className="sales-filters-card">
        {/* Quick Filter Presets Bar */}
        <div className="quick-presets-header">
          <span className="quick-presets-title">
            <Filter size={16} /> Filtros Rápidos:
          </span>
          <div className="quick-chips-row">
            <button
              className={`preset-chip ${statusFilter === 'all' && typeFilter === 'all' ? 'active' : ''}`}
              onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setPage(1); }}
            >
              Todas
            </button>
            <button
              className={`preset-chip pending ${statusFilter === 'pending' ? 'active' : ''}`}
              onClick={() => { setStatusFilter('pending'); setTypeFilter('all'); setPage(1); }}
            >
              ⚠️ Pix Pendentes
            </button>
            <button
              className={`preset-chip completed ${statusFilter === 'completed' && typeFilter === 'sale' ? 'active' : ''}`}
              onClick={() => { setStatusFilter('completed'); setTypeFilter('sale'); setPage(1); }}
            >
              ✅ Vendas Concluídas
            </button>
            <button
              className={`preset-chip recharge ${typeFilter === 'recharge' ? 'active' : ''}`}
              onClick={() => { setStatusFilter('all'); setTypeFilter('recharge'); setPage(1); }}
            >
              💳 Recargas de Saldo
            </button>
            <button
              className={`preset-chip cancelled ${statusFilter === 'cancelled' ? 'active' : ''}`}
              onClick={() => { setStatusFilter('cancelled'); setTypeFilter('all'); setPage(1); }}
            >
              ❌ Canceladas
            </button>
          </div>
        </div>

        {/* Detailed Filter Controls */}
        <div className="sales-filter-controls">
          {/* Search Field */}
          <div className="filter-field search-field">
            <label htmlFor="sales-search-input">Pesquisar</label>
            <div className="input-with-icon">
              <Search size={16} className="field-icon" />
              <input 
                id="sales-search-input"
                type="text" 
                placeholder="Buscar por estudante, matrícula, código ou nota..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button 
                  className="clear-search-btn" 
                  onClick={() => setSearchQuery('')}
                  title="Limpar busca"
                  type="button"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Status Dropdown */}
          <div className="filter-field">
            <label htmlFor="sales-status-select">Status do Pagamento</label>
            <div className="input-with-icon">
              <Clock size={16} className="field-icon" />
              <select 
                id="sales-status-select"
                value={statusFilter} 
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="all">Todos os Status</option>
                <option value="pending">Pendente (Pix a Distância)</option>
                <option value="completed">Concluída</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
          </div>

          {/* Type Dropdown */}
          <div className="filter-field">
            <label htmlFor="sales-type-select">Tipo de Transação</label>
            <div className="input-with-icon">
              <Wallet size={16} className="field-icon" />
              <select 
                id="sales-type-select"
                value={typeFilter} 
                onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              >
                <option value="all">Todos os Tipos</option>
                <option value="sale">Apenas Vendas de Itens</option>
                <option value="recharge">Apenas Recargas de Saldo</option>
              </select>
            </div>
          </div>

          {/* Date Range Selector */}
          <div className="filter-field date-range-field">
            <label>Filtrar por Período</label>
            <div className="date-inputs-row">
              <div className="date-input-group">
                <span className="date-sublabel">De:</span>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => { setStartDate(e.target.value); setPage(1); }} 
                  title="Data Inicial"
                />
              </div>
              <div className="date-input-group">
                <span className="date-sublabel">Até:</span>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => { setEndDate(e.target.value); setPage(1); }} 
                  title="Data Final"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Date Shortcuts & Active Filters Indicator */}
        <div className="filters-footer-bar">
          <div className="date-shortcuts-group">
            <span className="shortcuts-label"><CalendarDays size={14} /> Períodos Rápidos:</span>
            <button className="date-shortcut-btn" onClick={() => handleSetDatePreset('today')}>
              Hoje
            </button>
            <button className="date-shortcut-btn" onClick={() => handleSetDatePreset('7days')}>
              Últimos 7 dias
            </button>
            <button className="date-shortcut-btn" onClick={() => handleSetDatePreset('thisMonth')}>
              Este Mês
            </button>
          </div>

          {activeFiltersCount > 0 && (
            <div className="active-filters-summary">
              <span className="active-filters-badge">
                {activeFiltersCount} {activeFiltersCount === 1 ? 'filtro ativo' : 'filtros ativos'}
              </span>
              <button 
                className="btn-clear-filters"
                onClick={clearAllFilters}
                title="Limpar todos os filtros aplicados"
              >
                <RotateCcw size={14} /> Limpar Filtros
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table container with optimized responsiveness */}
      <div className="sales-table-container">
        {loading ? (
          <div className="sales-loading">
            <Loader2 size={32} className="spinner" />
            <p>Carregando vendas...</p>
          </div>
        ) : error ? (
          <div className="sales-error">
            <AlertCircle size={24} />
            <p>{error}</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="sales-empty">
            <ShoppingBag size={48} />
            <p>Nenhuma venda encontrada com os filtros selecionados.</p>
            {activeFiltersCount > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={clearAllFilters} style={{ marginTop: '0.5rem' }}>
                Limpar Filtros Aplicados
              </button>
            )}
          </div>
        ) : (
          <table className="sales-table">
            <thead>
              <tr>
                <th>Código / Data</th>
                <th>Estudante</th>
                <th>Itens / Tipo</th>
                <th>Valor Final</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx) => {
                const isExpanded = expandedTxId === tx.id;
                const isPending = tx.status === 'pending';
                const isCancelled = tx.status === 'cancelled';
                const hasGuardian = !!tx.guardian_phone;
                const paymentMethodLabel = tx.payments?.map(p => {
                  if (p.payment_method === 'pix') return tx.notes === 'Pix Fiado' ? 'Pix a Distância' : 'PIX';
                  if (p.payment_method === 'cash') return 'Dinheiro';
                  if (p.payment_method === 'debit_card') return 'Débito';
                  if (p.payment_method === 'credit_card') return 'Crédito';
                  if (p.payment_method === 'school_balance') return 'Saldo';
                  if (p.payment_method === 'on_credit') return 'A Prazo';
                  return p.payment_method;
                }).join(', ') || 'Não inf.';

                return (
                  <tr key={`tx-group-${tx.id}`} style={{ display: 'contents' }}>
                    <tr key={tx.id} className={`sales-row ${isPending ? 'pending' : ''} ${isCancelled ? 'cancelled' : ''}`}>
                      <td onClick={() => toggleExpand(tx.id)} className="sales-clickable-cell">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          <div>
                            <span className="sales-tx-id">#{tx.id.slice(0, 8)}</span>
                            <span className="sales-tx-date">
                              {new Date(tx.created_at).toLocaleDateString('pt-BR')} {new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="sales-student-info">
                          <span className="student-name">{tx.student_name || 'Venda Avulsa'}</span>
                          {tx.enrollment_number && (
                            <span className="student-enrollment">Matrícula: {tx.enrollment_number}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {getTxType(tx) === 'recharge' ? (
                          <span className="badge-recharge-type">
                            Recarga
                          </span>
                        ) : (
                          <span className="sales-items-count">
                            {tx.items?.reduce((sum, i) => sum + i.quantity, 0) || 0} unid.
                          </span>
                        )}
                      </td>
                      <td>
                        <strong className="sales-amount">{formatCurrency(Number(tx.final_amount))}</strong>
                      </td>
                      <td>
                        <span className="payment-method-badge">{paymentMethodLabel}</span>
                      </td>
                      <td>
                        <span className={`status-badge ${tx.status}`}>
                          {tx.status === 'pending' ? 'Pendente' : tx.status === 'completed' ? 'Concluída' : 'Cancelada'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="sales-actions-cell">
                          {isPending && (
                            <>
                              <button 
                                className="btn btn-sm btn-success btn-approve"
                                title="Confirmar Recebimento"
                                onClick={() => handleApprovePayment(tx.id)}
                              >
                                <CheckCircle size={14} /> Confirmar
                              </button>
                              {hasGuardian && (
                                <div className="sales-whatsapp-group">
                                  <button 
                                    className="btn btn-sm btn-whatsapp"
                                    title="Enviar Cobrança Completa por WhatsApp"
                                    onClick={() => handleSendWhatsApp(tx)}
                                  >
                                    <MessageSquare size={14} /> WhatsApp
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-pix-only"
                                    title="Enviar Apenas Pix Copia e Cola"
                                    onClick={() => handleSendPixOnly(tx)}
                                  >
                                    <Copy size={14} /> Só Pix
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                          {!isCancelled && (
                            <button
                              className="btn btn-sm btn-cancel-tx"
                              title="Cancelar Venda"
                              onClick={() => handleCancelTransaction(tx.id)}
                            >
                              <XCircle size={14} /> Cancelar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    
                    {/* Collapsible Details Row */}
                    {isExpanded && (
                      <tr key={`details-${tx.id}`} className="sales-details-row">
                        <td colSpan={7}>
                          <div className="sales-details-content animate-slideDown">
                            <div className="details-col">
                              <h4>Itens Vendidos</h4>
                              <ul className="details-items-list">
                                {tx.items?.map((item) => (
                                  <li key={item.id}>
                                    <span>{item.quantity}x {item.product_name}</span>
                                    <span>{formatCurrency(Number(item.unit_price))} / total: {formatCurrency(Number(item.total_price))}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            
                            <div className="details-col">
                              <h4>Informações Adicionais</h4>
                              <p><strong>Operador:</strong> {tx.operator_name}</p>
                              {tx.notes && <p><strong>Observações:</strong> {tx.notes}</p>}
                              {isPending && tx.guardian_name && (
                                <p><strong>Responsável:</strong> {tx.guardian_name} ({tx.guardian_phone})</p>
                              )}
                              {tx.discount_amount > 0 && (
                                <p><strong>Desconto Aplicado:</strong> {formatCurrency(Number(tx.discount_amount))}</p>
                              )}
                              {(() => {
                                const pixPayment = tx.payments?.find(p => p.payment_method === 'pix');
                                if (!pixPayment?.metadata) return null;
                                try {
                                  const meta = typeof pixPayment.metadata === 'string' 
                                    ? JSON.parse(pixPayment.metadata) 
                                    : pixPayment.metadata;
                                  const receiptUrl = meta.receipt_url || meta.infinitepay_webhook?.receipt_url;
                                  if (!receiptUrl) return null;
                                  return (
                                    <div style={{ marginTop: '0.75rem' }}>
                                      <a 
                                        href={receiptUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="btn btn-sm btn-receipt-link"
                                      >
                                        🧾 Ver Comprovante InfinitePay
                                      </a>
                                    </div>
                                  );
                                } catch (_) { return null; }
                              })()}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="sales-pagination">
          <button 
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="btn btn-secondary btn-sm"
          >
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button 
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
            className="btn btn-secondary btn-sm"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}

