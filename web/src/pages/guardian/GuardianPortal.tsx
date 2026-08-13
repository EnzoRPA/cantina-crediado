import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coffee, LogOut, Users, Wallet, ArrowUpCircle,
  ShoppingCart, Clock, RefreshCw, CreditCard, BookOpen, ShieldCheck
} from 'lucide-react';
import { api, authApi, dailyLimitsApi } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { formatDateBR } from '../../utils/date';
import './GuardianPortal.css';

interface Student {
  id: string;
  name: string;
  enrollment_number: string;
  grade: string;
  class_group: string;
  balance: number;
  photo_url: string | null;
  birth_date: string | null;
  relationship: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  method: string;
  description: string;
  created_at: string;
  status?: string;
}

export default function GuardianPortal() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [filterType, setFilterType] = useState('all');
  const [pixData, setPixData] = useState<any>(null);

  // Link another child states
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [addChildEnrollment, setAddChildEnrollment] = useState('');
  const [addChildBirthDate, setAddChildBirthDate] = useState('');
  const [addChildLoading, setAddChildLoading] = useState(false);
  const [addChildError, setAddChildError] = useState('');

  // Joint recharge splits states
  const [isJointRecharge, setIsJointRecharge] = useState(false);
  const [jointAmounts, setJointAmounts] = useState<Record<string, string>>({});

  // Daily limits state for parents
  const [dailyLimits, setDailyLimits] = useState<Record<string, { max: number | null; spent: number; remaining: number | null }>>({});
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitStudent, setLimitStudent] = useState<Student | null>(null);
  const [limitAmount, setLimitAmount] = useState('');
  const [savingLimit, setSavingLimit] = useState(false);

  const presetAmounts = [10, 20, 30, 50, 75, 100];

  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadStudents();

    // Auto-refresh every 15 seconds for a more "live" feel
    const interval = setInterval(() => {
      loadStudents();

      // Also refresh transactions for the currently selected student
      if (selectedIdRef.current) {
        loadTransactions(selectedIdRef.current);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedStudent) {
      selectedIdRef.current = selectedStudent.id;
      loadTransactions(selectedStudent.id);
      loadDailyLimit(selectedStudent.id);
    }
  }, [selectedStudent]);

  const handleManualRefresh = async () => {
    await loadStudents();
    if (selectedStudent) {
      await loadTransactions(selectedStudent.id);
    }
  };

  const loadStudents = async () => {
    try {
      const { data } = await api.get('/guardians/me/students');
      const list = data.data?.students || [];
      setStudents(list);
      
      // If we don't have a selection, or our selection is no longer in the list, set to first
      if (list.length > 0) {
        if (!selectedIdRef.current || !list.some((s: Student) => s.id === selectedIdRef.current)) {
          setSelectedStudent(list[0]);
        } else {
          // Update selected student with fresh data
          const updated = list.find((s: Student) => s.id === selectedIdRef.current);
          if (updated) setSelectedStudent(updated);
        }
      } else {
        setSelectedStudent(null);
      }
    } catch (err) {
      console.error('Erro ao carregar alunos:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async (studentId: string) => {
    setLoadingTx(true);
    try {
      const { data } = await api.get(`/guardians/me/students/${studentId}/transactions`);
      setTransactions(data.data?.data || []);
    } catch (err) {
      console.error('Erro ao carregar transações:', err);
      setTransactions([]);
    } finally {
      setLoadingTx(false);
    }
  };

  const loadDailyLimit = async (studentId: string) => {
    try {
      const { data } = await dailyLimitsApi.get(studentId);
      if (data.success && data.data?.limit) {
        const limit = data.data.limit;
        setDailyLimits(prev => ({
          ...prev,
          [studentId]: {
            max: limit.max_daily_amount ? Number(limit.max_daily_amount) : null,
            spent: Number(limit.spent_today || 0),
            remaining: limit.remaining_today !== undefined && limit.remaining_today !== null ? Number(limit.remaining_today) : null,
          }
        }));
      } else {
        setDailyLimits(prev => ({
          ...prev,
          [studentId]: { max: null, spent: 0, remaining: null }
        }));
      }
    } catch (err) {
      console.error('Erro ao carregar limite diário:', err);
    }
  };

  const handleSaveDailyLimit = async (e: FormEvent) => {
    e.preventDefault();
    if (!limitStudent) return;
    setSavingLimit(true);

    try {
      const val = parseFloat(limitAmount.replace(',', '.'));
      if (isNaN(val) || val <= 0) {
        await dailyLimitsApi.delete(limitStudent.id);
      } else {
        await dailyLimitsApi.upsert(limitStudent.id, { maxDailyAmount: val });
      }

      await loadDailyLimit(limitStudent.id);
      setShowLimitModal(false);
      alert('Limite diário atualizado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar limite diário:', err);
      alert(err.response?.data?.error?.message || 'Erro ao salvar limite diário.');
    } finally {
      setSavingLimit(false);
    }
  };

  const handleRemoveDailyLimit = async () => {
    if (!limitStudent) return;
    setSavingLimit(true);

    try {
      await dailyLimitsApi.delete(limitStudent.id);
      await loadDailyLimit(limitStudent.id);
      setShowLimitModal(false);
      alert('Limite diário removido. O consumo agora é livre!');
    } catch (err: any) {
      console.error('Erro ao remover limite diário:', err);
      alert(err.response?.data?.error?.message || 'Erro ao remover limite diário.');
    } finally {
      setSavingLimit(false);
    }
  };

  const handleLogout = () => {
    const rt = localStorage.getItem('refreshToken');
    if (rt) authApi.logout(rt);
    logout();
    navigate('/login');
  };

  const handleRecharge = async () => {
    if (isJointRecharge) {
      const splits = Object.entries(jointAmounts)
        .map(([studentId, val]) => ({ studentId, amount: parseFloat(val) }))
        .filter(s => s.amount > 0);

      const total = splits.reduce((sum, s) => sum + s.amount, 0);
      if (total <= 0) {
        alert('Por favor, informe pelo menos um valor válido para recarga.');
        return;
      }

      try {
        const { data } = await api.post('/payments/recharge', {
          studentId: selectedStudent?.id, // Fallback studentId for schema validation
          amount: total,
          paymentMethod: 'pix',
          splits,
        });
        setPixData(data.data);
      } catch (err: any) {
        console.error('Erro na recarga conjunta:', err);
        alert(err.response?.data?.error?.message || 'Erro ao gerar PIX para recarga conjunta.');
      }
    } else {
      const amount = selectedPreset || parseFloat(rechargeAmount);
      if (!amount || amount <= 0 || !selectedStudent) return;

      try {
        const { data } = await api.post('/payments/recharge', {
          studentId: selectedStudent.id,
          amount,
          paymentMethod: 'pix'
        });
        setPixData(data.data);
      } catch (err: any) {
        console.error('Erro na recarga:', err);
        alert(err.response?.data?.error?.message || 'Erro ao gerar PIX para recarga.');
      }
    }
  };

  const handleAddChild = async (e: FormEvent) => {
    e.preventDefault();
    setAddChildError('');
    setAddChildLoading(true);

    try {
      await api.post('/guardians/me/students', {
        enrollmentNumber: addChildEnrollment,
        birthDate: addChildBirthDate,
      });

      setShowAddChildModal(false);
      setAddChildEnrollment('');
      setAddChildBirthDate('');
      await loadStudents();
      alert('Filho vinculado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao vincular filho:', err);
      setAddChildError(err.response?.data?.error?.message || 'Erro ao vincular filho. Verifique os dados fornecidos.');
    } finally {
      setAddChildLoading(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const filteredTransactions = transactions.filter(tx => {
    if (filterType === 'all') return true;
    if (filterType === 'balance') return tx.method.includes('school_balance') || tx.type === 'credit';
    if (filterType === 'cash') return tx.method.includes('cash');
    if (filterType === 'others') return tx.method.includes('pix') || tx.method.includes('card');
    return true;
  });

  const formatDate = (dateStr: any) => {
    if (!dateStr) return '---';

    let d: Date;

    if (typeof dateStr === 'string') {
      const normalizedDate = dateStr.includes('Z') || dateStr.includes('+')
        ? dateStr
        : dateStr.replace(' ', 'T') + 'Z';
      d = new Date(normalizedDate);
    } else {
      d = new Date(dateStr);
    }

    if (isNaN(d.getTime())) return '---';

    return d.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const totalExpenses = transactions
    .filter(t => t.type === 'purchase' || t.type === 'debit')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  if (loading) {
    return (
      <div className="guardian-portal">
        <div className="gp-loading">
          <div className="gp-spinner" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="guardian-portal">
      {/* Header */}
      <header className="gp-header">
        <div className="gp-header-left">
          <div className="gp-header-logo">
            <Coffee size={20} />
          </div>
          <div className="gp-header-title">
            <h1>Portal do Responsável</h1>
            <p>Cantina Escolar</p>
          </div>
        </div>
        <button className="gp-logout-btn" onClick={handleLogout}>
          <LogOut size={16} />
          Sair
        </button>
      </header>

      {/* Content */}
      <div className="gp-content">
        {/* Welcome */}
        <div className="gp-welcome">
          <h2>Olá, <span>{user?.name || 'Responsável'}</span> 👋</h2>
          <p>Acompanhe os gastos e saldo dos seus filhos na cantina</p>
        </div>

        {/* No students */}
        {students.length === 0 && (
          <div className="gp-empty">
            <div className="gp-empty-icon">
              <Users size={28} />
            </div>
            <h3>Nenhum aluno vinculado</h3>
            <p>Por favor, clique no botão abaixo para vincular os filhos sob sua responsabilidade.</p>
          </div>
        )}

        {/* Student Cards */}
        {students.map((student) => (
          <div
            key={student.id}
            className={`gp-student-card ${selectedStudent?.id === student.id ? 'active' : ''}`}
            onClick={() => setSelectedStudent(student)}
          >
            <div className="gp-student-header">
              <div className="gp-student-avatar">
                {student.name?.charAt(0) || '?'}
              </div>
              <div className="gp-student-info">
                <h3>{student.name}</h3>
                <p>Matrícula: {student.enrollment_number}</p>
                <div className="gp-student-meta">
                  {student.class_group && (
                    <span><BookOpen size={12} /> {student.class_group}</span>
                  )}
                  {student.birth_date && (
                    <span><Clock size={12} /> {formatDateBR(student.birth_date)}</span>
                  )}
                  <span><CreditCard size={12} /> {student.relationship || 'Responsável'}</span>
                </div>
              </div>
            </div>

            {/* Balance */}
            <div className="gp-balance-section">
              <div className="gp-balance-card main">
                <div className="gp-balance-label">Saldo Atual</div>
                <div className="gp-balance-value">
                  {formatCurrency(Number(student.balance) || 0)}
                </div>
              </div>
              <div className="gp-balance-card">
                <div className="gp-balance-label">Total Gasto</div>
                <div className="gp-balance-value expenses">
                  {selectedStudent?.id === student.id
                    ? formatCurrency(totalExpenses)
                    : '---'}
                </div>
              </div>
            </div>

            {/* Daily Limit Banner */}
            <div 
                style={{ 
                  marginTop: '0.75rem', 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  border: '1px solid rgba(255, 255, 255, 0.1)', 
                  borderRadius: '10px', 
                  padding: '0.75rem 1rem', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShieldCheck size={20} style={{ color: dailyLimits[student.id]?.max ? '#34d399' : '#9ca3af' }} />
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Limite Diário de Consumo</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f9fafb' }}>
                      {dailyLimits[student.id]?.max ? formatCurrency(dailyLimits[student.id].max!) : 'Livre (Sem Limite)'}
                    </span>
                    {dailyLimits[student.id]?.max && dailyLimits[student.id].remaining !== null && (
                      <span style={{ fontSize: '0.75rem', color: '#34d399', display: 'block', marginTop: '2px' }}>
                        Restante hoje: {formatCurrency(dailyLimits[student.id].remaining!)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="gp-logout-btn"
                  style={{ borderColor: '#6366f1', color: '#818cf8', background: 'rgba(99, 102, 241, 0.1)', padding: '0.4rem 0.75rem', fontSize: '0.8rem', width: 'auto' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLimitStudent(student);
                    setLimitAmount(dailyLimits[student.id]?.max ? String(dailyLimits[student.id].max) : '');
                    setShowLimitModal(true);
                  }}
                >
                  {dailyLimits[student.id]?.max ? 'Alterar Limite' : 'Definir Limite'}
                </button>
              </div>

            {/* Recharge */}
            {selectedStudent?.id === student.id && (
              <button
                className="gp-recharge-btn"
                onClick={(e) => { e.stopPropagation(); setIsJointRecharge(false); setShowRechargeModal(true); }}
              >
                <Wallet size={18} />
                Fazer Recarga
              </button>
            )}
          </div>
        ))}

        {/* Link Another Student Trigger */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem', marginBottom: '2rem' }}>
          <button 
            type="button" 
            className="gp-logout-btn" 
            style={{ 
              borderColor: 'var(--color-primary)', 
              color: 'var(--color-primary)', 
              background: 'transparent', 
              width: 'auto', 
              display: 'flex', 
              gap: '0.5rem', 
              alignItems: 'center',
              boxShadow: 'none'
            }}
            onClick={() => setShowAddChildModal(true)}
          >
            <Users size={16} />
            + Vincular Outro Filho
          </button>
        </div>

        {/* Transactions */}
        {selectedStudent && (
          <div className="gp-transactions">
            <div className="gp-section-title">
              <h3>
                <Clock size={18} />
                Histórico de Movimentações
              </h3>
              <button
                className="gp-logout-btn"
                style={{ borderColor: 'rgba(99,102,241,0.3)', color: '#818cf8', background: 'rgba(99,102,241,0.1)', padding: '0.35rem 0.75rem' }}
                onClick={handleManualRefresh}
              >
                <RefreshCw size={14} />
                Atualizar
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="gp-filter-tabs">
              <button
                className={filterType === 'all' ? 'active' : ''}
                onClick={() => setFilterType('all')}
              >
                Tudo
              </button>
              <button
                className={filterType === 'balance' ? 'active' : ''}
                onClick={() => setFilterType('balance')}
              >
                Saldo
              </button>
              <button
                className={filterType === 'cash' ? 'active' : ''}
                onClick={() => setFilterType('cash')}
              >
                Dinheiro
              </button>
              <button
                className={filterType === 'others' ? 'active' : ''}
                onClick={() => setFilterType('others')}
              >
                PIX/Outros
              </button>
            </div>

            {loadingTx ? (
              <div className="gp-loading" style={{ minHeight: '20vh' }}>
                <div className="gp-spinner" />
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="gp-empty" style={{ padding: '2rem' }}>
                <p>Nenhuma movimentação encontrada para este filtro</p>
              </div>
            ) : (
              <div className="gp-tx-list">
                {filteredTransactions.map((tx) => {
                  const isCredit = tx.type === 'credit' || tx.type === 'recharge';
                  const isPending = tx.status === 'pending';
                  return (
                    <div key={tx.id} className="gp-tx-item" style={isPending ? { opacity: 0.75 } : {}}>
                      <div className="gp-tx-left">
                        <div className={`gp-tx-icon ${isPending ? 'pending' : (isCredit ? 'credit' : 'purchase')}`} style={isPending ? { background: '#fef3c7', color: '#d97706' } : {}}>
                          {isCredit
                            ? <ArrowUpCircle size={18} />
                            : <ShoppingCart size={18} />
                          }
                        </div>
                        <div className="gp-tx-info">
                          <p>{tx.description || (isCredit ? 'Recarga' : 'Compra na Cantina')}</p>
                          <div className="gp-tx-meta-info">
                            <span>{formatDate(tx.created_at)}</span>
                            <span className="gp-method-badge">{tx.method.replace('school_balance', 'Saldo').replace('cash', 'Dinheiro').replace('pix', 'PIX').replace('credit_card', 'Cartão').replace('debit_card', 'Cartão')}</span>
                            {isPending && <span style={{ background: '#f59e0b', color: '#fff', fontSize: '0.7rem', padding: '1px 5px', borderRadius: '4px', marginLeft: '6px', fontWeight: 'bold' }}>Aguardando Pagamento</span>}
                          </div>
                        </div>
                      </div>
                      <div className={`gp-tx-amount ${isPending ? 'pending' : (isCredit ? 'credit' : 'purchase')}`} style={isPending ? { color: '#d97706' } : {}}>
                        {isPending ? '' : (isCredit ? '+' : '-')}{formatCurrency(Number(tx.amount))}
                        {isPending && <span style={{ fontSize: '0.7rem', display: 'block', color: '#d97706', fontWeight: 'normal', textAlign: 'right' }}>(Pendente)</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recharge Modal */}
      {showRechargeModal && selectedStudent && (
        <div className="gp-modal-overlay" onClick={() => { setShowRechargeModal(false); setPixData(null); setRechargeAmount(''); setSelectedPreset(null); setIsJointRecharge(false); }}>
          <div className="gp-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              <Wallet size={20} />
              Recarga – {isJointRecharge ? 'Recarga Conjunta' : selectedStudent.name}
            </h3>

            {students.length > 1 && !pixData && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'var(--color-bg-hover)', padding: '4px', borderRadius: '8px' }}>
                <button
                  type="button"
                  style={{ 
                    flex: 1, 
                    padding: '8px', 
                    borderRadius: '6px', 
                    border: 'none', 
                    background: !isJointRecharge ? 'var(--color-bg-primary)' : 'transparent', 
                    color: !isJointRecharge ? 'var(--color-primary)' : 'var(--color-text-secondary)', 
                    fontWeight: 600, 
                    cursor: 'pointer' 
                  }}
                  onClick={() => setIsJointRecharge(false)}
                >
                  Individual
                </button>
                <button
                  type="button"
                  style={{ 
                    flex: 1, 
                    padding: '8px', 
                    borderRadius: '6px', 
                    border: 'none', 
                    background: isJointRecharge ? 'var(--color-bg-primary)' : 'transparent', 
                    color: isJointRecharge ? 'var(--color-primary)' : 'var(--color-text-secondary)', 
                    fontWeight: 600, 
                    cursor: 'pointer' 
                  }}
                  onClick={() => {
                    setIsJointRecharge(true);
                    const initialAmounts: Record<string, string> = {};
                    students.forEach(s => {
                      initialAmounts[s.id] = s.id === selectedStudent.id ? rechargeAmount : '';
                    });
                    setJointAmounts(initialAmounts);
                    setSelectedPreset(null);
                  }}
                >
                  Recarga Conjunta (Dividir)
                </button>
              </div>
            )}

            {pixData ? (
              <div className="gp-pix-payment" style={{ textAlign: 'center', padding: '1rem 0' }}>
                <p style={{ marginBottom: '1rem' }}>Escaneie o QR Code abaixo no app do seu banco:</p>
                <img src={pixData.qr_code_base64} alt="QR Code PIX" style={{ maxWidth: '200px', borderRadius: '8px', margin: '0 auto' }} />

                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {pixData.ticket_url && (
                    <a
                      href={pixData.ticket_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gp-confirm-btn"
                      style={{
                        display: 'block',
                        textDecoration: 'none',
                        textAlign: 'center',
                        background: '#6366f1',
                        color: '#fff',
                        fontWeight: 'bold',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        fontSize: '0.95rem'
                      }}
                    >
                      💳 Pagar com Pix ou Cartão
                    </a>
                  )}

                  {pixData.qr_code && (
                    <div style={{ textAlign: 'left' }}>
                      <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: '0.5rem' }}>Ou use o PIX Copia e Cola:</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          readOnly
                          value={pixData.qr_code}
                          style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: '0.85rem' }}
                        />
                        <button
                          style={{ padding: '0.75rem 1rem', background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                          onClick={() => { navigator.clipboard.writeText(pixData.qr_code); alert('Código copiado!'); }}
                        >
                          Copiar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="gp-modal-actions" style={{ marginTop: '2rem' }}>
                  <button
                    className="gp-confirm-btn"
                    style={{ width: '100%' }}
                    onClick={() => {
                      setShowRechargeModal(false);
                      setPixData(null);
                      setRechargeAmount('');
                      setSelectedPreset(null);
                      setIsJointRecharge(false);
                      loadStudents();
                      loadTransactions(selectedStudent.id);
                    }}
                  >
                    Já Paguei / Fechar
                  </button>
                </div>
              </div>
            ) : isJointRecharge ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                  {students.map((student) => (
                    <div key={student.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{student.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Saldo: {formatCurrency(student.balance)}</span>
                      </div>
                      <div style={{ width: '120px' }}>
                        <input
                          type="number"
                          placeholder="R$ 0,00"
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', textAlign: 'right' }}
                          value={jointAmounts[student.id] || ''}
                          onChange={(e) => {
                            setJointAmounts({
                              ...jointAmounts,
                              [student.id]: e.target.value
                            });
                          }}
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--color-bg-hover)', borderRadius: '8px', textAlign: 'right' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginRight: '0.5rem' }}>Total da Recarga:</span>
                  <strong style={{ fontSize: '1.2rem', color: 'var(--color-primary)' }}>
                    {formatCurrency(
                      Object.values(jointAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0)
                    )}
                  </strong>
                </div>

                <div className="gp-modal-actions" style={{ marginTop: '1.5rem' }}>
                  <button className="gp-cancel-btn" onClick={() => { setShowRechargeModal(false); setPixData(null); setRechargeAmount(''); setSelectedPreset(null); setIsJointRecharge(false); }}>
                    Cancelar
                  </button>
                  <button
                    className="gp-confirm-btn"
                    onClick={handleRecharge}
                    disabled={Object.values(jointAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0) <= 0}
                  >
                    Gerar PIX Único
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Child selector when multiple children */}
                {students.length > 1 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.5rem' }}>
                      Para qual filho?
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {students.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelectedStudent(s)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            border: `2px solid ${selectedStudent?.id === s.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            background: selectedStudent?.id === s.id ? 'rgba(99,102,241,0.08)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>{s.name}</span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>Saldo: {formatCurrency(Number(s.balance))}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="gp-amount-grid">
                  {presetAmounts.map((amount) => (
                    <button
                      key={amount}
                      className={`gp-amount-btn ${selectedPreset === amount ? 'selected' : ''}`}
                      onClick={() => { setSelectedPreset(amount); setRechargeAmount(''); }}
                    >
                      R$ {amount}
                    </button>
                  ))}
                </div>

                <div className="gp-custom-amount">
                  <label>Ou digite um valor personalizado:</label>
                  <input
                    type="number"
                    placeholder="0,00"
                    value={rechargeAmount}
                    onChange={(e) => { setRechargeAmount(e.target.value); setSelectedPreset(null); }}
                    min="1"
                    step="0.01"
                  />
                </div>

                <div className="gp-modal-actions">
                  <button className="gp-cancel-btn" onClick={() => { setShowRechargeModal(false); setPixData(null); setRechargeAmount(''); setSelectedPreset(null); }}>
                    Cancelar
                  </button>
                  <button
                    className="gp-confirm-btn"
                    onClick={handleRecharge}
                    disabled={!selectedPreset && (!rechargeAmount || parseFloat(rechargeAmount) <= 0)}
                  >
                    Gerar PIX
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Child Modal */}
      {showAddChildModal && (
        <div className="gp-modal-overlay" onClick={() => { setShowAddChildModal(false); setAddChildError(''); }}>
          <div className="gp-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              <Users size={20} style={{ color: 'var(--color-primary)' }} />
              Vincular Outro Filho
            </h3>

            <form onSubmit={handleAddChild} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '1rem' }}>
              {addChildError && (
                <div className="login-error animate-fadeIn" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <ShieldCheck size={16} />
                  <span style={{ fontSize: '0.85rem' }}>{addChildError}</span>
                </div>
              )}

              <div className="gp-custom-amount" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Matrícula do Aluno</label>
                <input 
                  type="text" 
                  className="input"
                  placeholder="Código da Matrícula" 
                  value={addChildEnrollment}
                  onChange={(e) => setAddChildEnrollment(e.target.value)}
                  required 
                  style={{ width: '100%' }}
                />
              </div>

              <div className="gp-custom-amount" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Data de Nascimento</label>
                <input 
                  type="date" 
                  className="input"
                  value={addChildBirthDate}
                  onChange={(e) => setAddChildBirthDate(e.target.value)}
                  required 
                  style={{ width: '100%' }}
                />
              </div>

              <div className="gp-modal-actions" style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => { setShowAddChildModal(false); setAddChildError(''); }}
                  disabled={addChildLoading}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={addChildLoading}
                >
                  {addChildLoading ? 'Vinculando...' : 'Vincular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Daily Limit Modal */}
      {showLimitModal && limitStudent && (
        <div className="gp-modal-overlay" onClick={() => setShowLimitModal(false)}>
          <div className="gp-modal animate-scaleIn" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="gp-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={22} style={{ color: 'var(--color-primary, #6366f1)' }} />
                <h3>Limite Diário de Consumo</h3>
              </div>
              <button className="gp-modal-close" onClick={() => setShowLimitModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDailyLimit}>
              <div style={{ padding: '1.25rem' }}>
                <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                  Defina o valor máximo diário que <strong>{limitStudent.name}</strong> poderá gastar na cantina.
                </p>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.4rem', color: '#f8fafc' }}>Valor Máximo por Dia (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    placeholder="0,00 (Ex: 20,00)"
                    value={limitAmount}
                    onChange={(e) => setLimitAmount(e.target.value)}
                    autoFocus
                    style={{ fontSize: '1.25rem', fontWeight: 'bold', padding: '0.6rem 0.75rem', width: '100%' }}
                  />
                </div>

                {/* Shortcuts */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>Atalhos Sugeridos</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {[10, 15, 20, 30, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="gp-logout-btn"
                        style={{ padding: '8px 4px', fontSize: '0.85rem', fontWeight: 600, width: '100%', justifyContent: 'center' }}
                        onClick={() => setLimitAmount(preset.toFixed(2))}
                      >
                        R$ {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="gp-modal-footer" style={{ display: 'flex', gap: '0.5rem', padding: '1rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                {dailyLimits[limitStudent.id]?.max ? (
                  <button
                    type="button"
                    className="gp-logout-btn"
                    style={{ color: '#ef4444', borderColor: '#ef4444', background: 'transparent' }}
                    onClick={handleRemoveDailyLimit}
                    disabled={savingLimit}
                  >
                    Remover Limite
                  </button>
                ) : (
                  <button
                    type="button"
                    className="gp-logout-btn"
                    onClick={() => setShowLimitModal(false)}
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  className="gp-recharge-btn"
                  style={{ marginLeft: 'auto', marginTop: 0 }}
                  disabled={savingLimit}
                >
                  {savingLimit ? 'Salvando...' : 'Salvar Limite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
