import { useEffect, useState } from 'react';
import { Search, Users as UsersIcon, CreditCard, Wallet, Plus, X, Save, Edit2, Trash2, ScanFace, Clock, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import { api, dailyLimitsApi } from '../../services/api';
import { FacialCaptureModal } from '../../components/FacialCaptureModal';
import './StudentsPage.css';

interface Student {
  id: string;
  name?: string;
  email?: string;
  enrollment_number: string;
  grade: string;
  class_group: string;
  balance: number;
  type?: 'student' | 'employee';
  billing_type?: 'pix_direto' | 'crediario';
  is_active: boolean;
  user_id: string;
  cpf?: string;
  guardian_name?: string;
  phone?: string;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'student' | 'employee'>('all');
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Facial Capture State
  const [isFacialModalOpen, setIsFacialModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Balance State
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [balanceData, setBalanceData] = useState({
    amount: '',
    type: 'credit' as 'credit' | 'debit',
    reason: '',
    paymentMethod: 'cash',
  });
  const [savingBalance, setSavingBalance] = useState(false);

  // Daily Limit Modal State
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [limitStudent, setLimitStudent] = useState<Student | null>(null);
  const [limitAmount, setLimitAmount] = useState('');
  const [limitInfo, setLimitInfo] = useState<{ max: number | null; spent: number; remaining: number | null } | null>(null);
  const [savingLimit, setSavingLimit] = useState(false);

  const [formData, setFormData] = useState({
    type: 'student' as 'student' | 'employee',
    billingType: 'pix_direto' as 'pix_direto' | 'crediario',
    name: '',
    email: '',
    password: '',
    enrollmentNumber: '',
    grade: '',
    class_group: '',
    cpf: '',
    phone: '',
    birthDate: '',
    addressFull: '',
    guardianName: '',
    guardianCpf: '',
    guardianRg: '',
    guardianPhone: '',
  });

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSummary, setImportSummary] = useState<{ imported: number; total: number; errors: any[] } | null>(null);
  const [reverting, setReverting] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const downloadErrorReport = (errors: any[]) => {
    const BOM = '\uFEFF';
    const headers = ['Linha', 'Matrícula', 'Nome', 'Motivo do Erro'];
    const csvRows = [
      headers.join(','),
      ...errors.map((err) => {
        const row = err.row;
        const enroll = `"${(err.enrollmentNumber || '').replace(/"/g, '""')}"`;
        const name = `"${(err.name || '').replace(/"/g, '""')}"`;
        const reason = `"${(err.error || '').replace(/"/g, '""')}"`;
        return [row, enroll, name, reason].join(',');
      })
    ];
    const csvContent = BOM + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_erros_importacao_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openLimitModal = async (student: Student) => {
    setLimitStudent(student);
    setLimitAmount('');
    setLimitInfo(null);
    setIsLimitModalOpen(true);

    try {
      const { data } = await dailyLimitsApi.get(student.id);
      if (data.success && data.data?.limit) {
        const l = data.data.limit;
        setLimitAmount(l.max_daily_amount ? String(l.max_daily_amount) : '');
        setLimitInfo({
          max: l.max_daily_amount ? Number(l.max_daily_amount) : null,
          spent: Number(l.spent_today || 0),
          remaining: l.remaining_today !== undefined && l.remaining_today !== null ? Number(l.remaining_today) : null,
        });
      }
    } catch (err) {
      console.error('Erro ao carregar limite do aluno:', err);
    }
  };

  const handleSaveLimit = async (e: React.FormEvent) => {
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

      setIsLimitModalOpen(false);
      alert('Limite diário atualizado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao salvar limite:', err);
      alert(err.response?.data?.error?.message || 'Erro ao salvar limite diário.');
    } finally {
      setSavingLimit(false);
    }
  };

  const handleRemoveLimit = async () => {
    if (!limitStudent) return;
    setSavingLimit(true);

    try {
      await dailyLimitsApi.delete(limitStudent.id);
      setIsLimitModalOpen(false);
      alert('Limite diário removido do aluno!');
    } catch (err: any) {
      console.error('Erro ao remover limite:', err);
      alert(err.response?.data?.error?.message || 'Erro ao remover limite.');
    } finally {
      setSavingLimit(false);
    }
  };

  const loadStudentHistory = async (studentId: string) => {
    setLoadingHistory(true);
    try {
      const { data } = await api.get(`/pos/transactions?studentId=${studentId}&limit=100`);
      setHistory(data.data?.data || []);
    } catch (err) {
      console.error('Erro ao carregar histórico', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleRevertImport = async () => {
    if (!window.confirm('Atenção: Isso irá apagar todos os alunos que foram cadastrados na ÚLTIMA importação de planilha de uma vez só! Deseja continuar?')) return;
    
    setReverting(true);
    try {
      const { data } = await api.delete('/students/import/revert');
      alert(`Importação desfeita com sucesso! ${data.data.reverted} cadastros foram removidos.`);
      loadStudents();
    } catch (err: any) {
      console.error('Erro ao desfazer', err);
      if (err.response?.status === 404) {
        alert('Nenhuma importação recente encontrada para desfazer.');
      } else {
        alert('Erro ao desfazer a importação. Tente novamente.');
      }
    } finally {
      setReverting(true); // Wait, should be setReverting(false)! Let's keep it clean
      setReverting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportProgress(0);
    setImportSummary(null);

    const formData = new FormData();
    formData.append('file', file);

    const progressInterval = setInterval(() => {
      setImportProgress((prev) => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return 95;
        }
        return prev + 5;
      });
    }, 200);

    try {
      const token = localStorage.getItem('accessToken');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      const { data } = await axios.post(`${API_URL}/students/import`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      });
      
      clearInterval(progressInterval);
      setImportProgress(100);

      setTimeout(() => {
        setImportSummary(data.data);
        setImporting(false);
        setImportProgress(0);
      }, 500);

      loadStudents();
    } catch (err: any) {
      clearInterval(progressInterval);
      setImporting(false);
      setImportProgress(0);
      console.error('Erro ao importar', err);
      alert('Erro ao importar planilha. Verifique o formato do arquivo ou se você possui privilégios de administrador.');
    } finally {
      e.target.value = ''; // Reset input
    }
  };

  useEffect(() => { loadStudents(); }, []);

  const loadStudents = async () => {
    try {
      const { data } = await api.get('/students', { params: { limit: 1000, page: 1 } });
      setStudents(data.data?.data || []);
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = () => {
    setEditingId(null);
    setFormData({ 
      type: 'student',
      billingType: 'pix_direto',
      name: '', email: '', password: '', enrollmentNumber: '', grade: '', class_group: '',
      cpf: '', phone: '', birthDate: '', addressFull: '',
      guardianName: '', guardianCpf: '', guardianRg: '', guardianPhone: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (s: any) => {
    setEditingId(s.id);
    setFormData({
      type: s.type || 'student',
      billingType: s.billing_type || 'pix_direto',
      name: s.name || '',
      email: s.email || '',
      password: '', // Leave empty for edit
      enrollmentNumber: s.enrollment_number || '',
      grade: s.grade || '',
      class_group: s.class_group || '',
      cpf: s.cpf || '',
      phone: s.phone || '',
      birthDate: s.birth_date || '',
      addressFull: s.address_full || '',
      guardianName: s.guardian_name || '',
      guardianCpf: s.guardian_cpf || '',
      guardianRg: s.guardian_rg || '',
      guardianPhone: s.guardian_phone || '',
    });
    setIsModalOpen(true);
  };

  const openFaceModal = (s: Student) => {
    setSelectedStudent(s);
    setIsFacialModalOpen(true);
  };

  const openBalanceModal = (s: Student) => {
    setSelectedStudent(s);
    setBalanceData({ amount: '', type: 'credit', reason: '', paymentMethod: 'cash' });
    setIsBalanceModalOpen(true);
  };

  const handleSaveBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || savingBalance) return;
    const amountNum = parseFloat(balanceData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Valor inválido.');
      return;
    }
    setSavingBalance(true);
    try {
      await api.post(`/students/${selectedStudent.id}/balance`, {
        amount: parseFloat(balanceData.amount),
        type: balanceData.type,
        reason: balanceData.reason,
        paymentMethod: balanceData.paymentMethod,
      });
      alert('Operação realizada com sucesso!');
      setIsBalanceModalOpen(false);
      setBalanceData({ amount: '', type: 'credit', reason: '', paymentMethod: 'cash' });
      loadStudents();
    } catch (err: any) {
      console.error('Erro ao ajustar saldo:', err);
      alert(err.response?.data?.error?.message || 'Erro ao ajustar saldo.');
    } finally {
      setSavingBalance(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Deseja desativar o aluno "${name}"?`)) {
      try {
        await api.put(`/students/${id}`, { isActive: false });
        loadStudents();
      } catch (err) {
        console.error('Error inactivating student', err);
        alert('Erro ao desativar aluno.');
      }
    }
  };

  const changeField = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    try {
      if (editingId) {
        // Include email, and password if provided
        const payload: any = {
          type: formData.type,
          billingType: formData.billingType,
          name: formData.name,
          email: formData.email,
          enrollmentNumber: formData.enrollmentNumber,
          grade: formData.grade,
          classGroup: formData.class_group,
          cpf: formData.cpf,
          phone: formData.phone,
          birthDate: formData.birthDate,
          addressFull: formData.addressFull,
          guardianName: formData.guardianName,
          guardianCpf: formData.guardianCpf,
          guardianRg: formData.guardianRg,
          guardianPhone: formData.guardianPhone,
        };
        if (formData.password.trim() !== '') {
          payload.password = formData.password;
        }
        await api.put(`/students/${editingId}`, payload);
      } else {
        await api.post('/students', {
          type: formData.type,
          billingType: formData.billingType,
          name: formData.name,
          email: formData.email,
          password: formData.password || 'Mudar123', // Minimum 8 chars, 1 uppercase, 1 number
          enrollmentNumber: formData.enrollmentNumber,
          grade: formData.grade,
          classGroup: formData.class_group,
          cpf: formData.cpf,
          phone: formData.phone,
          birthDate: formData.birthDate,
          addressFull: formData.addressFull,
          guardianName: formData.guardianName,
          guardianCpf: formData.guardianCpf,
          guardianRg: formData.guardianRg,
          guardianPhone: formData.guardianPhone,
        });
      }
      setIsModalOpen(false);
      loadStudents();
    } catch (err: any) {
      console.error('Error saving student:', err.response?.data || err);
      let msg = 'Erro ao salvar aluno.';
      if (err.response?.data?.error?.message) {
        msg = err.response.data.error.message;
      }
      if (err.response?.data?.error?.details) {
        const details = err.response.data.error.details.map((d: any) => d.message).join('\n');
        msg += '\n\nDetalhes:\n' + details;
      }
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const filtered = students.filter((s) => {
    const matchesActive = s.is_active !== false && Number(s.is_active) !== 0;
    const matchesType = typeFilter === 'all' ? true : (s.type || 'student') === typeFilter;
    if (!matchesActive || !matchesType) return false;

    if (!search.trim()) return true;

    const fullSearch = search.toLowerCase().trim();
    const searchableText = `${s.name || ''} ${s.enrollment_number || ''} ${s.grade || ''} ${s.class_group || ''} ${s.cpf || ''} ${s.guardian_name || ''}`.toLowerCase();
    
    if (searchableText.includes(fullSearch)) return true;

    const terms = fullSearch.split(/\s+/).filter(Boolean);
    return terms.every(term => searchableText.includes(term));
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const totalBalance = students.reduce((sum, s) => sum + Number(s.balance || 0), 0);
  const employeeCount = students.filter((s) => s.type === 'employee').length;
  const studentCount = students.filter((s) => (s.type || 'student') === 'student').length;

  return (
    <div className="students-page animate-fadeIn">
      <div className="page-header">
        <div>
          <h1>Clientes (Alunos e Funcionários)</h1>
          <p>
            {students.length} cadastrados ({studentCount} alunos, {employeeCount} funcionários) • Saldo total: {formatCurrency(totalBalance)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-outline danger" onClick={handleRevertImport} disabled={reverting || importing} title="Desfazer a última importação">
            {reverting ? 'Desfazendo...' : 'Desfazer Importação'}
          </button>
          <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
            {importing ? 'Importando...' : 'Importar Planilha'}
            <input 
              type="file" 
              accept=".xlsx,.xls,.csv" 
              style={{ display: 'none' }}
              onChange={handleImport}
              disabled={importing || reverting}
            />
          </label>
          <button className="btn btn-primary" onClick={openNewModal}>
            <Plus size={18} /> Novo Cliente
          </button>
        </div>
      </div>

      {importing && (
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }} className="animate-fadeIn">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 'bold' }}>
            <span>Processando planilha de novos cadastros...</span>
            <span>{importProgress}%</span>
          </div>
          <div style={{ height: '8px', width: '100%', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${importProgress}%`, background: '#2563eb', transition: 'width 0.2s ease-in-out' }} />
          </div>
        </div>
      )}

      <div className="page-toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn btn-sm ${typeFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTypeFilter('all')}
          >
            Todos ({students.length})
          </button>
          <button
            className={`btn btn-sm ${typeFilter === 'student' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTypeFilter('student')}
          >
            Alunos ({studentCount})
          </button>
          <button
            className={`btn btn-sm ${typeFilter === 'employee' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTypeFilter('employee')}
          >
            Funcionários ({employeeCount})
          </button>
        </div>

        <div className="page-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar por nome, matrícula ou RE..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="page-loading">Carregando...</div>
      ) : (
        <div className="students-grid">
          {filtered.map((s) => (
            <div key={s.id} className="student-card">
              <div className="student-card-header">
                <div className="student-avatar">
                  <UsersIcon size={20} />
                </div>
                <div className="student-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span className="student-name" title={s.name || `Cliente ${s.enrollment_number}`}>
                      {s.name || `Cliente ${s.enrollment_number}`}
                    </span>
                    {s.type === 'employee' ? (
                      <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', background: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}>Funcionário</span>
                    ) : (
                      <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>Aluno</span>
                    )}
                    {s.billing_type === 'crediario' ? (
                      <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>📋 Crediário</span>
                    ) : (
                      <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>⚡ Pix Direto</span>
                    )}
                  </div>
                  <span className="student-meta">
                    {s.enrollment_number} {s.grade ? `• ${s.grade}` : ''} {s.class_group ? `• ${s.class_group}` : ''}
                  </span>
                </div>
                <div className="student-balance">
                  <Wallet size={14} />
                  <span className={Number(s.balance) > 0 ? 'bal-positive' : 'bal-zero'}>
                    {formatCurrency(Number(s.balance))}
                  </span>
                </div>
              </div>
              <div className="student-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setViewingHistory(s);
                    loadStudentHistory(s.id);
                  }}
                  title="Ver Extrato"
                >
                  <Clock size={16} />
                </button>
                <button className="btn btn-outline" onClick={() => { /* cards modal */ }} title="Cartões">
                  <CreditCard size={16} /> Cartões
                </button>
                <button className="btn btn-outline" onClick={() => openBalanceModal(s)} title="Pôr Saldo">
                  <Wallet size={16} /> Saldo
                </button>
                <button className="btn btn-outline" onClick={() => openLimitModal(s)} title="Limite Diário">
                  <ShieldCheck size={16} /> Limite
                </button>
                <button className="btn btn-outline" onClick={() => openFaceModal(s)} title="Biometria">
                  <ScanFace size={16} /> Biometria
                </button>
                <button className="btn btn-outline" onClick={() => openEditModal(s)} title="Editar">
                  <Edit2 size={16} /> Editar
                </button>
                <button className="btn btn-outline danger" onClick={() => handleDelete(s.id, s.name!)} title="Excluir">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: '#888' }}>
              Nenhum aluno encontrado.
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content animate-zoomIn">
            <div className="modal-header">
              <h2>{editingId ? (formData.type === 'employee' ? 'Editar Funcionário' : 'Editar Aluno') : 'Novo Cadastro'}</h2>
              <button type="button" className="btn-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-group" style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Tipo de Cliente *</label>
                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.65rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: formData.type === 'student' ? 'bold' : 'normal' }}>
                      <input type="radio" name="type" value="student" checked={formData.type === 'student'} onChange={() => setFormData({ ...formData, type: 'student' })} />
                      <span>Aluno</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: formData.type === 'employee' ? 'bold' : 'normal' }}>
                      <input type="radio" name="type" value="employee" checked={formData.type === 'employee'} onChange={() => setFormData({ ...formData, type: 'employee' })} />
                      <span>Funcionário (Professor, Secretaria, Direção, etc.)</span>
                    </label>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '0.5rem 0' }} />

                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem', marginTop: '0.4rem' }}>Perfil de Cobrança / Pagamento *</label>
                  <div style={{ display: 'flex', gap: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: formData.billingType === 'pix_direto' ? 'bold' : 'normal' }}>
                      <input type="radio" name="billingType" value="pix_direto" checked={formData.billingType === 'pix_direto'} onChange={() => setFormData({ ...formData, billingType: 'pix_direto' })} />
                      <span style={{ color: '#0369a1' }}>⚡ Pix Direto (Pré-pago / Recarga)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: formData.billingType === 'crediario' ? 'bold' : 'normal' }}>
                      <input type="radio" name="billingType" value="crediario" checked={formData.billingType === 'crediario'} onChange={() => setFormData({ ...formData, billingType: 'crediario' })} />
                      <span style={{ color: '#15803d' }}>📋 Crediário (A Prazo / Fiado)</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label>{formData.type === 'employee' ? 'Nome do Funcionário (Opcional)' : 'Nome do Aluno *'}</label>
                  <input type="text" name="name"
                    value={formData.name} onChange={changeField}
                    required={formData.type === 'student'}
                    placeholder={formData.type === 'employee' ? 'Ex: Maria Oliveira (Gerado auto se vazio)' : 'Nome completo do aluno'} />
                </div>
                
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>{formData.type === 'employee' ? 'Cargo / Setor / Departamento' : 'Série/Turno/Turma *'}</label>
                    <input type="text" name="class_group"
                      value={formData.class_group} onChange={changeField}
                      required={formData.type === 'student'}
                      placeholder={formData.type === 'employee' ? 'Ex: Professor, Secretaria, Direção, TI' : 'Ex: Educação Infantil - EI Maternal (2 anos) - Tarde - A'} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Celular (WhatsApp)</label>
                    <input type="text" name="phone"
                      value={formData.phone} onChange={changeField}
                      placeholder="Ex: 5599981234567" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>{formData.type === 'employee' ? 'Matrícula / Registro (Opcional)' : 'Matrícula *'}</label>
                    <input type="text" name="enrollmentNumber"
                      value={formData.enrollmentNumber} onChange={changeField}
                      required={formData.type === 'student'}
                      placeholder={formData.type === 'employee' ? 'Ex: RE-1042 (Gerado auto se vazio)' : 'Ex: 2024001'} />
                  </div>
                  {formData.type === 'student' && (
                    <div className="form-group">
                      <label>Data de Nascimento</label>
                      <input type="date" name="birthDate"
                        value={formData.birthDate?.split('T')[0] || ''} onChange={changeField} />
                    </div>
                  )}
                </div>

                {formData.type === 'student' && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Email *</label>
                      <input type="email" name="email"
                        value={formData.email} onChange={changeField}
                        required placeholder="email@exemplo.com" />
                    </div>
                    <div className="form-group">
                      <label>{editingId ? 'Nova Senha (opcional)' : 'Senha Inicial *'}</label>
                      <input type="text" name="password"
                        value={formData.password} onChange={changeField}
                        required={!editingId} placeholder={editingId ? 'Preencha só se quiser alterar' : 'ex: Senha@123'} />
                    </div>
                  </div>
                )}

                {formData.type === 'student' && (
                  <>
                    <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />
                    <h3 style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>Dados do Responsável</h3>

                    <div className="form-group">
                      <label>Nome do Responsável</label>
                      <input type="text" name="guardianName"
                        value={formData.guardianName} onChange={changeField}
                        placeholder="Nome completo do responsável" />
                    </div>
                    
                    <div className="form-row">
                      <div className="form-group">
                        <label>Celular (WhatsApp do Responsável)</label>
                        <input type="text" name="guardianPhone"
                          value={formData.guardianPhone} onChange={changeField}
                          placeholder="Ex: 5599981234567" />
                      </div>
                      <div className="form-group">
                        <label>CPF do Responsável</label>
                        <input type="text" name="guardianCpf"
                          value={formData.guardianCpf} onChange={changeField}
                          placeholder="CPF responsável" />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Save size={18} /> {saving ? 'Salvando...' : (formData.type === 'employee' ? 'Salvar Funcionário' : 'Salvar Aluno')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {selectedStudent && (
        <FacialCaptureModal
          isOpen={isFacialModalOpen}
          onClose={() => setIsFacialModalOpen(false)}
          studentId={selectedStudent.id}
          studentName={selectedStudent.name || 'Aluno'}
          onSuccess={() => alert('Rosto cadastrado com sucesso!')}
        />
      )}

      {isBalanceModalOpen && selectedStudent && (
        <div className="modal-overlay">
          <div className="modal-content animate-zoomIn" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Recarga / Ajuste de Saldo</h2>
              <button type="button" className="btn-close" onClick={() => setIsBalanceModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveBalance}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Aluno</label>
                  <input type="text" readOnly disabled value={selectedStudent.name || `Aluno ${selectedStudent.enrollment_number}`} />
                </div>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Tipo de Operação</label>
                    <select
                      className="input"
                      value={balanceData.type}
                      onChange={(e) => setBalanceData({ ...balanceData, type: e.target.value as 'credit' | 'debit' })}
                    >
                      <option value="credit">Adicionar Saldo (+)</option>
                      <option value="debit">Remover Saldo (-)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Ex: 50.00"
                    value={balanceData.amount}
                    onChange={(e) => setBalanceData({ ...balanceData, amount: e.target.value })}
                  />
                </div>

                {balanceData.type === 'credit' && (
                  <div className="form-group">
                    <label>Forma de Recebimento</label>
                    <select
                      className="input"
                      value={balanceData.paymentMethod}
                      onChange={(e) => setBalanceData({ ...balanceData, paymentMethod: e.target.value })}
                    >
                      <option value="cash">Dinheiro</option>
                      <option value="pix">PIX (Manual)</option>
                      <option value="debit_card">Cartão de Débito</option>
                      <option value="credit_card">Cartão de Crédito</option>
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label>Motivo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Recarga na Cantina"
                    value={balanceData.reason}
                    onChange={(e) => setBalanceData({ ...balanceData, reason: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsBalanceModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingBalance}>
                  {savingBalance ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {viewingHistory && (
        <div className="modal-overlay" onClick={() => setViewingHistory(null)}>
          <div className="modal-content" style={{ maxWidth: '800px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Extrato: {viewingHistory.name}</h3>
              <button className="btn-close" onClick={() => setViewingHistory(null)}>✕</button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {loadingHistory ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
              ) : history.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Nenhuma movimentação encontrada</div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Método</th>
                        <th>Valor</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((tx: any) => {
                        const isCredit = tx.notes?.toLowerCase().includes('crédito') || tx.notes?.toLowerCase().includes('portal') || tx.notes?.toLowerCase().includes('recarga');
                        
                        let dateStr = tx.created_at;
                        if (typeof dateStr === 'string' && !dateStr.includes('Z') && !dateStr.includes('+')) {
                          dateStr = dateStr.replace(' ', 'T') + 'Z';
                        }
                        const dateObj = new Date(dateStr);

                        return (
                          <tr key={tx.id}>
                            <td>{dateObj.toLocaleString('pt-BR')}</td>
                            <td>{tx.notes || 'Venda PDV'}</td>
                            <td>{tx.identification_method}</td>
                            <td style={{ fontWeight: 'bold', color: isCredit ? '#22c55e' : '#f87171' }}>
                              {isCredit ? '+' : '-'} R$ {Number(tx.final_amount).toFixed(2)}
                            </td>
                            <td>{tx.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {importSummary && (
        <div className="modal-overlay" onClick={() => setImportSummary(null)}>
          <div className="modal-content animate-zoomIn" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Resumo da Importação</h2>
              <button type="button" className="btn-close" onClick={() => setImportSummary(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '1.05rem', color: '#475569', marginBottom: '1.25rem' }}>
                O processamento da planilha foi concluído! Confira o resultado:
              </p>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ textAlign: 'center', flex: 1, padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#15803d' }}>{importSummary.imported}</div>
                  <div style={{ fontSize: '0.85rem', color: '#166534', fontWeight: '500' }}>Importados / Reativados</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1, padding: '1rem', background: importSummary.errors.length > 0 ? '#fef2f2' : '#f8fafc', border: importSummary.errors.length > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: importSummary.errors.length > 0 ? '#b91c1c' : '#475569' }}>{importSummary.errors.length}</div>
                  <div style={{ fontSize: '0.85rem', color: importSummary.errors.length > 0 ? '#991b1b' : '#475569', fontWeight: '500' }}>Ignorados / Com Erro</div>
                </div>
              </div>
              
              {importSummary.errors.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#991b1b' }}>Prévia das Linhas não Importadas:</div>
                  <div style={{ 
                    maxHeight: '180px', 
                    overflowY: 'auto', 
                    border: '1px solid #fee2e2', 
                    padding: '0.5rem 0.75rem', 
                    borderRadius: '6px', 
                    background: '#fff5f5', 
                    fontSize: '0.85rem' 
                  }}>
                    {importSummary.errors.slice(0, 10).map((err, idx) => (
                      <div key={idx} style={{ padding: '0.35rem 0', borderBottom: idx < Math.min(importSummary.errors.length, 10) - 1 ? '1px solid #fecaca' : 'none', color: '#991b1b' }}>
                        <strong>Linha {err.row}:</strong> {err.name || err.enrollmentNumber || 'Sem Nome'} <br/>
                        <span style={{ fontSize: '0.8rem', color: '#b91c1c' }}>Motivo: {err.error}</span>
                      </div>
                    ))}
                    {importSummary.errors.length > 10 && (
                      <div style={{ textAlign: 'center', padding: '0.5rem 0 0 0', fontWeight: 'bold', color: '#b91c1c', borderTop: '1px dashed #fecaca' }}>
                        E mais {importSummary.errors.length - 10} registros...
                      </div>
                    )}
                  </div>
                  
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ 
                      width: '100%', 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      gap: '0.5rem', 
                      marginTop: '0.5rem',
                      borderColor: '#b91c1c',
                      color: '#b91c1c'
                    }}
                    onClick={() => downloadErrorReport(importSummary.errors)}
                  >
                    Baixar Relatório de Erros Completo (CSV)
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={() => setImportSummary(null)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Daily Limit Modal for Admin */}
      {isLimitModalOpen && limitStudent && (
        <div className="modal-overlay">
          <div className="modal-content animate-zoomIn" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2><ShieldCheck size={20} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Limite Diário — {limitStudent.name}</h2>
              <button type="button" className="btn-close" onClick={() => setIsLimitModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveLimit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem' }}>
                  Defina ou ajuste o limite diário de consumo para o aluno no caixa da cantina.
                </p>

                {limitInfo?.max && (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                    <div><strong>Limite Atual:</strong> {formatCurrency(limitInfo.max)}</div>
                    <div><strong>Gasto Hoje:</strong> {formatCurrency(limitInfo.spent)}</div>
                    {limitInfo.remaining !== null && (
                      <div style={{ color: '#059669', fontWeight: 600 }}><strong>Restante Hoje:</strong> {formatCurrency(limitInfo.remaining)}</div>
                    )}
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Valor Máximo por Dia (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    placeholder="0,00 (Ex: 20,00)"
                    value={limitAmount}
                    onChange={(e) => setLimitAmount(e.target.value)}
                    autoFocus
                    style={{ fontSize: '1.25rem', fontWeight: 'bold', padding: '0.6rem 0.75rem' }}
                  />
                </div>

                {/* Quick Presets */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>Atalhos Sugeridos</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {[10, 15, 20, 30, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ padding: '8px 4px', fontSize: '0.85rem', fontWeight: 600 }}
                        onClick={() => setLimitAmount(preset.toFixed(2))}
                      >
                        R$ {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
                {limitInfo?.max ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: '#ef4444' }}
                    onClick={handleRemoveLimit}
                    disabled={savingLimit}
                  >
                    Remover Limite
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setIsLimitModalOpen(false)}
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
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

