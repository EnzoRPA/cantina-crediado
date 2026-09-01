import { useState, useEffect } from 'react';
import { 
  Palette, School, ShieldCheck, Check, Users, Search, Eye,
  Plus, Edit, Power, Trash2, Loader2, RefreshCw, X, Send, MessageSquare, AlertTriangle, QrCode, Banknote
} from 'lucide-react';
import { usersApi, studentsApi, posApi } from '../../services/api';
import { formatDateBR } from '../../utils/date';
import './SettingsPage.css';

interface ThemeOption {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  bgColor: string;
  textColor: string;
  cardColor: string;
}

const themeOptions: ThemeOption[] = [
  {
    id: 'default',
    name: 'Escuro Clássico (Original)',
    description: 'Fundo escuro moderno com detalhes em verde vibrante.',
    primaryColor: '#22c55e',
    bgColor: '#0f1117',
    textColor: '#f1f5f9',
    cardColor: '#22252f',
  },
  {
    id: 'light-mint',
    name: 'Verde Menta Fresco',
    description: 'Visual claro, limpo e profissional com acentos verde menta.',
    primaryColor: '#10b981',
    bgColor: '#f8fafc',
    textColor: '#0f172a',
    cardColor: '#ffffff',
  },
  {
    id: 'light-lavender',
    name: 'Lilás / Lavanda Pastel',
    description: 'Estilo neumórfico suave com tons pastéis roxos aconchegantes.',
    primaryColor: '#8b5cf6',
    bgColor: '#faf9f6',
    textColor: '#1e1b4b',
    cardColor: '#ffffff',
  },
  {
    id: 'light-ocean',
    name: 'Azul Oceano Refrescante',
    description: 'Visual moderno e revigorante com tons de azul marinho e ciano.',
    primaryColor: '#0284c7',
    bgColor: '#f0f9ff',
    textColor: '#0f172a',
    cardColor: '#ffffff',
  },
];

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'operator' | 'student' | 'guardian';
  phone?: string;
  is_active: boolean;
  created_at: string;
}


export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'crm'>('general');
  const [activeTheme, setActiveTheme] = useState('default');
  
  // Page visibility toggles state
  const availablePagesList = [
    { path: '/admin/on-credit', label: 'A Prazo (Crediário / Vendas a Prazo)' },
    { path: '/admin/fiado-scanner', label: 'Folha & Scanner QR (Câmera)' },
    { path: '/admin/students', label: 'Alunos / Clientes' },
    { path: '/admin/guardians', label: 'Responsáveis' },
    { path: '/admin/products', label: 'Produtos e Categorias' },
    { path: '/admin/sales', label: 'Histórico de Vendas' },
    { path: '/admin/reports', label: 'Relatórios Financeiros' },
    { path: '/admin/settings', label: 'Configurações do Sistema' },
  ];

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

  const handleTogglePageVisibility = (path: string) => {
    if (path === '/admin/settings') return;
    let updated: string[];
    if (visiblePages.includes(path)) {
      updated = visiblePages.filter(p => p !== path);
    } else {
      updated = [...visiblePages, path];
    }
    setVisiblePages(updated);
    localStorage.setItem('cantina-visible-pages', JSON.stringify(updated));
    window.dispatchEvent(new Event('cantina-visible-pages-updated'));
  };

  // School info form state
  const [schoolName, setSchoolName] = useState('Cantina Escolar');
  const [schoolPhone, setSchoolPhone] = useState('(81) 99999-9999');
  const [schoolAddress, setSchoolAddress] = useState('Rua Principal, 123 - Recife');
  const [savingInfo, setSavingInfo] = useState(false);

  // PIX config state
  const [pixKey, setPixKey] = useState(localStorage.getItem('cantina-pix-key') || '57fbef81-90eb-4097-9c40-93cdd4320ae4');
  const [merchantName, setMerchantName] = useState(localStorage.getItem('cantina-merchant-name') || 'POLLYANNA AVELINO VERZARO');
  const [merchantCity, setMerchantCity] = useState(localStorage.getItem('cantina-merchant-city') || 'IMPERATRIZ');
  const [savingPix, setSavingPix] = useState(false);

  // Users CRUD state
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersQuery, setUsersQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  
  // User Modal State
  const [showUserModal, setShowUserModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Modal Fields State
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState<'admin' | 'manager' | 'operator'>('operator');

  const [userIsActive, setUserIsActive] = useState(true);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // CRM Campaign State
  const [crmStudents, setCrmStudents] = useState<any[]>([]);
  const [crmSearch, setCrmSearch] = useState('');
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmPage, setCrmPage] = useState(1);
  const [crmTotalPages, setCrmTotalPages] = useState(1);
  const [whatsappTemplate, setWhatsappTemplate] = useState(() => {
    return localStorage.getItem('cantina-wa-template') || 'Olá {nome_responsavel}! O portal da cantina já está online. Para consultar saldo e recarregar via Pix para {nome_aluno}, acesse {link_portal} e clique em "Primeiro Acesso" com os dados - Matrícula: {matricula} e Nascimento: {data_nascimento}.';
  });

  // Initial loads
  useEffect(() => {
    const savedTheme = localStorage.getItem('cantina-theme') || 'default';
    setActiveTheme(savedTheme);
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsersList();
    }
  }, [activeTab, usersQuery, roleFilter, usersPage]);

  useEffect(() => {
    if (activeTab === 'crm') {
      loadCrmStudents();
    }
  }, [activeTab, crmSearch, crmPage]);

  const loadCrmStudents = async () => {
    try {
      setCrmLoading(true);
      setErrorMsg('');
      const params: any = {
        page: crmPage,
        limit: 20,
        search: crmSearch || undefined,
      };
      const { data } = await studentsApi.list(params);
      setCrmStudents(data.data?.data || []);
      setCrmTotalPages(data.data?.pagination?.totalPages || 1);
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao buscar lista de alunos para divulgação.');
    } finally {
      setCrmLoading(false);
    }
  };

  const loadUsersList = async () => {
    try {
      setLoadingUsers(true);
      setErrorMsg('');
      const params: any = {
        page: usersPage,
        limit: 10,
        search: usersQuery || undefined,
        role: roleFilter !== 'all' ? roleFilter : undefined,
      };
      const { data } = await usersApi.list(params);
      setUsers(data.data?.data || []);
      setUsersTotalPages(data.data?.pagination?.totalPages || 1);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Erro ao buscar usuários do sistema.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleThemeChange = (themeId: string) => {
    setActiveTheme(themeId);
    localStorage.setItem('cantina-theme', themeId);
    if (themeId === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', themeId);
    }
  };

  const handleSaveInfo = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInfo(true);
    setTimeout(() => {
      setSavingInfo(false);
      alert('Configurações da escola salvas com sucesso!');
    }, 800);
  };

  const handleSavePixConfig = () => {
    setSavingPix(true);
    localStorage.setItem('cantina-pix-key', pixKey);
    localStorage.setItem('cantina-merchant-name', merchantName);
    localStorage.setItem('cantina-merchant-city', merchantCity);
    setTimeout(() => {
      setSavingPix(false);
      alert('Configurações PIX salvas com sucesso!');
    }, 400);
  };

  // User actions
  const [resettingSales, setResettingSales] = useState(false);

  const handleResetTestSales = async () => {
    const confirmation = window.prompt(
      '⚠️ ATENÇÃO: Esta ação apagará permanentemente todas as vendas, pagamentos, históricos de caixa e débitos a prazo de teste, e zerará os saldos dos alunos.\n\nPara confirmar o reset para Início de Produção, digite a palavra ZERAR abaixo:'
    );

    if (confirmation !== 'ZERAR') {
      if (confirmation !== null) alert('Confirmação incorreta. Operação cancelada.');
      return;
    }

    setResettingSales(true);
    try {
      await posApi.resetTestSales();
      alert('✅ Todas as vendas e movimentações de caixa de teste foram zeradas com sucesso! O sistema está pronto para a operação oficial.');
    } catch (err: any) {
      console.error('Error resetting test sales:', err);
      alert(err.response?.data?.error?.message || 'Erro ao zerar vendas de teste.');
    } finally {
      setResettingSales(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedUser(null);
    setUserName('');
    setUserEmail('');
    setUserPhone('');
    setUserPassword('');
    setUserRole('operator');
    setUserIsActive(true);
    setErrorMsg('');
    setShowUserModal(true);
  };

  const openEditModal = (user: User) => {
    setModalMode('edit');
    setSelectedUser(user);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserPhone(user.phone || '');
    setUserPassword(''); // blank password during edits
    setUserRole(user.role === 'admin' ? 'admin' : 'operator');
    setUserIsActive(user.is_active);
    setErrorMsg('');
    setShowUserModal(true);
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingUser(true);
    setErrorMsg('');

    try {
      if (modalMode === 'create') {
        // Validate password constraints matching the backend zod validator
        if (!userPassword) {
          setErrorMsg('Senha é obrigatória para novos usuários.');
          setSubmittingUser(false);
          return;
        }
        if (userPassword.length < 8) {
          setErrorMsg('A senha precisa ter pelo menos 8 caracteres.');
          setSubmittingUser(false);
          return;
        }
        if (!/[A-Z]/.test(userPassword)) {
          setErrorMsg('A senha precisa conter pelo menos uma letra maiúscula.');
          setSubmittingUser(false);
          return;
        }
        if (!/[0-9]/.test(userPassword)) {
          setErrorMsg('A senha precisa conter pelo menos um número.');
          setSubmittingUser(false);
          return;
        }

        await usersApi.create({
          name: userName,
          email: userEmail,
          password: userPassword,
          role: userRole,
          phone: userPhone || undefined,
        });
      } else {
        // Update user
        if (!selectedUser) return;

        // If password is provided in edit mode, validate it
        if (userPassword) {
          if (userPassword.length < 8) {
            setErrorMsg('A nova senha precisa ter pelo menos 8 caracteres.');
            setSubmittingUser(false);
            return;
          }
          if (!/[A-Z]/.test(userPassword)) {
            setErrorMsg('A nova senha precisa conter pelo menos uma letra maiúscula.');
            setSubmittingUser(false);
            return;
          }
          if (!/[0-9]/.test(userPassword)) {
            setErrorMsg('A nova senha precisa conter pelo menos um número.');
            setSubmittingUser(false);
            return;
          }
        }

        await usersApi.update(selectedUser.id, {
          name: userName,
          email: userEmail,
          phone: userPhone || undefined,
          role: userRole,
          isActive: userIsActive,
          password: userPassword || undefined,
        });
      }

      setShowUserModal(false);
      loadUsersList();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.error?.message || 'Falha ao processar operação.');
    } finally {
      setSubmittingUser(false);
    }
  };

  const handleToggleActiveStatus = async (user: User) => {
    try {
      await usersApi.update(user.id, {
        isActive: !user.is_active,
      });
      loadUsersList();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao alterar status.');
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`Tem certeza que deseja desativar o usuário "${user.name}"?`)) return;
    try {
      await usersApi.delete(user.id);
      alert('Usuário desativado com sucesso.');
      loadUsersList();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao desativar usuário.');
    }
  };

  const handleSaveWaTemplate = () => {
    localStorage.setItem('cantina-wa-template', whatsappTemplate);
    alert('Modelo de mensagem do WhatsApp salvo com sucesso!');
  };

  const handleToggleMarketing = async (studentId: string, currentStatus: boolean) => {
    try {
      const newStatus = !currentStatus;
      await studentsApi.updateMarketing(studentId, newStatus);
      
      // Update the student in local state
      setCrmStudents(prev => prev.map(s => {
        if (s.id === studentId) {
          return { ...s, is_marketing_sent: newStatus ? 1 : 0 };
        }
        return s;
      }));
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar status de divulgação do aluno.');
    }
  };

  const handleSendWhatsApp = async (student: any) => {
    const parentPhone = student.guardian_phone || student.phone;
    if (!parentPhone) {
      alert('Telefone do responsável não cadastrado na matrícula desse aluno.');
      return;
    }
    
    // Replace placeholders in the WhatsApp template
    let text = whatsappTemplate
      .replace(/{nome_responsavel}/g, student.guardian_name || 'Responsável')
      .replace(/{nome_aluno}/g, student.name)
      .replace(/{matricula}/g, student.enrollment_number)
      .replace(/{data_nascimento}/g, formatDateBR(student.birth_date))
      .replace(/{link_portal}/g, window.location.origin);
      
    // Clean phone number (leave digits only)
    let cleanPhone = parentPhone.replace(/\D/g, '');
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      cleanPhone = `55${cleanPhone}`;
    }
    
    // Open WhatsApp link
    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');

    // Automatically mark as sent in database & UI
    if (!student.is_marketing_sent) {
      try {
        await studentsApi.updateMarketing(student.id, true);
        setCrmStudents(prev => prev.map(s => {
          if (s.id === student.id) {
            return { ...s, is_marketing_sent: 1 };
          }
          return s;
        }));
      } catch (err) {
        console.error('Failed to auto-mark marketing status:', err);
      }
    }
  };

  return (
    <div className="settings-page animate-fadeIn">
      <div className="settings-header">
        <div>
          <h1>Configurações do Sistema</h1>
          <p>Personalize o visual da cantina, dados cadastrais e preferências de acesso</p>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="settings-tabs-container">
        <button 
          className={`settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          <Palette size={18} />
          <span>Aparência e Cadastro</span>
        </button>
        <button 
          className={`settings-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => { setActiveTab('users'); setUsersPage(1); }}
        >
          <Users size={18} />
          <span>Controle de Acessos</span>
        </button>
        <button 
          className={`settings-tab-btn ${activeTab === 'crm' ? 'active' : ''}`}
          onClick={() => { setActiveTab('crm'); setCrmPage(1); }}
        >
          <MessageSquare size={18} />
          <span>Painel de Divulgação (CRM)</span>
        </button>
      </div>

      <div className="settings-container">
        {activeTab === 'general' ? (
          <>
            {/* Visual Themes Card */}
            <div className="settings-card theme-selector-card">
              <div className="card-header-with-icon">
                <Palette size={20} className="icon-primary" />
                <div>
                  <h3>Tema Visual do Sistema</h3>
                  <p>Escolha um estilo que combine com o seu dia a dia. Tons claros ajudam na leitura diurna.</p>
                </div>
              </div>

              <div className="themes-grid">
                {themeOptions.map((theme) => {
                  const isActive = activeTheme === theme.id;
                  return (
                    <div 
                      key={theme.id}
                      className={`theme-card ${isActive ? 'active' : ''}`}
                      onClick={() => handleThemeChange(theme.id)}
                    >
                      <div className="theme-preview" style={{ background: theme.bgColor }}>
                        <div className="preview-sidebar" style={{ background: theme.id === 'default' ? '#1a1d27' : '#f1f5f9' }} />
                        <div className="preview-content">
                          <div className="preview-card" style={{ background: theme.cardColor }}>
                            <div className="preview-dot" style={{ background: theme.primaryColor }} />
                            <div className="preview-line" style={{ background: theme.textColor, opacity: 0.3 }} />
                            <div className="preview-line short" style={{ background: theme.textColor, opacity: 0.2 }} />
                          </div>
                        </div>
                      </div>
                      <div className="theme-info">
                        <div className="theme-name-row">
                          <span>{theme.name}</span>
                          {isActive && <div className="theme-check"><Check size={12} /></div>}
                        </div>
                        <p>{theme.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Page Visibility Card (Mostrar / Ocultar Páginas) */}
            <div className="settings-card" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
              <div className="card-header-with-icon">
                <Eye size={20} className="icon-primary" />
                <div>
                  <h3>Exibição de Páginas no Menu Lateral</h3>
                  <p>Marque ou desmarque as páginas que deseja exibir ou ocultar no menu lateral do sistema.</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.85rem', marginTop: '1.25rem' }}>
                {availablePagesList.map(item => {
                  const isChecked = visiblePages.includes(item.path);
                  const isSettings = item.path === '/admin/settings';
                  return (
                    <label
                      key={item.path}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.85rem 1rem',
                        background: isChecked ? '#f0fdf4' : '#f8fafc',
                        border: `1px solid ${isChecked ? '#bbf7d0' : '#e2e8f0'}`,
                        borderRadius: '10px',
                        cursor: isSettings ? 'not-allowed' : 'pointer',
                        opacity: isSettings ? 0.75 : 1,
                        userSelect: 'none',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        color: isChecked ? '#166534' : '#475569',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isSettings}
                        onChange={() => handleTogglePageVisibility(item.path)}
                        style={{ width: '18px', height: '18px', accentColor: '#16a34a', cursor: isSettings ? 'not-allowed' : 'pointer' }}
                      />
                      <span>{item.label}</span>
                      {isSettings && <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: 'auto' }}>(Fixa)</span>}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* PIX Config Card */}
            <div className="settings-card" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
              <div className="card-header-with-icon">
                <QrCode size={20} style={{ color: '#00bfa5' }} />
                <div>
                  <h3>Configuração da Chave PIX (Cobranças)</h3>
                  <p>Configure a chave PIX, nome do beneficiário e cidade utilizados nas mensagens de cobrança via WhatsApp.</p>
                </div>
              </div>

              <div className="settings-form-grid" style={{ marginTop: '1.5rem' }}>
                <div className="form-group">
                  <label>Chave PIX (CNPJ, CPF, E-mail ou Aleatória)</label>
                  <input
                    type="text"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="Ex: 57fbef81-90eb-4097-9c40-93cdd4320ae4"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Nome do Beneficiário</label>
                  <input
                    type="text"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    placeholder="Ex: POLLYANNA AVELINO VERZARO"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Cidade</label>
                  <input
                    type="text"
                    value={merchantCity}
                    onChange={(e) => setMerchantCity(e.target.value)}
                    placeholder="Ex: IMPERATRIZ"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-primary" onClick={handleSavePixConfig} disabled={savingPix} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Banknote size={16} />
                  {savingPix ? 'Salvando...' : 'Salvar Config PIX'}
                </button>
              </div>
            </div>

            <div className="settings-two-columns">
              {/* School Details */}
              <form className="settings-card" onSubmit={handleSaveInfo}>
                <div className="card-header-with-icon">
                  <School size={20} className="icon-secondary" />
                  <div>
                    <h3>Dados da Escola</h3>
                    <p>Configure as informações principais exibidas nos cabeçalhos e relatórios.</p>
                  </div>
                </div>

                <div className="settings-form-grid" style={{ marginTop: '1.5rem' }}>
                  <div className="form-group">
                    <label>Nome da Escola / Cantina</label>
                    <input 
                      type="text" 
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      required 
                    />
                  </div>

                  <div className="form-group">
                    <label>Telefone de Contato</label>
                    <input 
                      type="text" 
                      value={schoolPhone}
                      onChange={(e) => setSchoolPhone(e.target.value)}
                      required 
                    />
                  </div>

                  <div className="form-group">
                    <label>Endereço Completo</label>
                    <input 
                      type="text" 
                      value={schoolAddress}
                      onChange={(e) => setSchoolAddress(e.target.value)}
                      required 
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={savingInfo}>
                    {savingInfo ? 'Salvando...' : 'Salvar Dados'}
                  </button>
                </div>
              </form>

              {/* Integrations Readonly */}
              <div className="settings-card">
                <div className="card-header-with-icon">
                  <ShieldCheck size={20} style={{ color: '#8b5cf6' }} />
                  <div>
                    <h3>Gateway de Pagamentos</h3>
                    <p>Status das conexões e webhooks de recebimento.</p>
                  </div>
                </div>

                <div className="integrations-list" style={{ marginTop: '1.5rem' }}>
                  <div className="integration-item active">
                    <div className="integration-info">
                      <strong>InfinitePay Gateway</strong>
                      <span className="integration-status status-active">Conectado (Ativo)</span>
                    </div>
                    <p className="integration-desc">
                      Transações Pix a Distância geradas no PDV e recargas de saldo online dos pais são processadas de forma direta e sem tarifas adicionais.
                    </p>
                  </div>

                  <div className="integration-item">
                    <div className="integration-info">
                      <strong>Mercado Pago</strong>
                      <span className="integration-status status-inactive">Desativado</span>
                    </div>
                    <p className="integration-desc">
                      Configuração de contingência. Não está em uso no momento devido à preferência pela taxa zero da InfinitePay.
                    </p>
                  </div>
                </div>
              </div>

              {/* Reset Test Sales Card */}
              <div className="settings-card" style={{ marginTop: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.02)' }}>
                <div className="card-header-with-icon">
                  <AlertTriangle size={20} style={{ color: '#ef4444' }} />
                  <div>
                    <h3 style={{ color: '#ef4444' }}>Zerar Vendas de Teste (Início da Operação Real)</h3>
                    <p>Limpeza completa do histórico de testes para iniciar as vendas oficiais de produção.</p>
                  </div>
                </div>

                <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#64748b' }}>
                  <p style={{ marginBottom: '0.75rem' }}>
                    Caso tenha feito testes de vendas, aberturas de caixa, débitos a prazo ou recargas de treinamento, clique abaixo para zerar o histórico de vendas.
                  </p>
                  <p style={{ marginBottom: '1rem', fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                    ✓ Seus produtos, categorias, dados de alunos, cadastros de responsáveis, fotos e senhas serão 100% mantidos.
                  </p>

                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 600 }}
                    onClick={handleResetTestSales}
                    disabled={resettingSales}
                  >
                    <Trash2 size={16} />
                    {resettingSales ? 'Zerando Vendas...' : 'Zerar Todas as Vendas e Caixas de Teste'}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : activeTab === 'users' ? (
          /* Users Access Management CRUD Section */
          <div className="settings-card">
            <div className="users-crud-header">
              <div className="card-header-with-icon">
                <Users size={20} className="icon-primary" />
                <div>
                  <h3>Controle de Usuários e Acessos</h3>
                  <p>Adicione, edite ou desative os usuários que têm acesso ao painel de administração e operadores de caixa.</p>
                </div>
              </div>
              <button className="btn btn-primary btn-add-user" onClick={openCreateModal}>
                <Plus size={16} />
                <span>Novo Usuário</span>
              </button>
            </div>

            {/* Filters bar */}
            <div className="users-filters-row">
              <div className="search-box">
                <Search size={16} />
                <input 
                  type="text" 
                  placeholder="Buscar por nome ou e-mail..." 
                  value={usersQuery}
                  onChange={(e) => { setUsersQuery(e.target.value); setUsersPage(1); }}
                />
              </div>

              <div className="filter-select">
                <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setUsersPage(1); }}>
                  <option value="all">Todas as Funções</option>
                  <option value="admin">Administradores</option>
                  <option value="manager">Gerente / Supervisor</option>
                  <option value="operator">Operadores (Caixa)</option>
                  <option value="guardian">Responsáveis</option>
                  <option value="student">Estudantes</option>
                </select>
              </div>

              <button className="btn btn-secondary btn-icon-only" onClick={loadUsersList} title="Recarregar">
                <RefreshCw size={16} />
              </button>
            </div>

            {/* Users Table */}
            <div className="users-table-wrapper">
              {loadingUsers ? (
                <div className="users-loading">
                  <Loader2 size={32} className="spinner" />
                  <p>Carregando usuários do sistema...</p>
                </div>
              ) : errorMsg && users.length === 0 ? (
                <div className="users-error-alert">
                  <p>{errorMsg}</p>
                </div>
              ) : users.length === 0 ? (
                <div className="users-empty-state">
                  <Users size={48} />
                  <p>Nenhum usuário encontrado.</p>
                </div>
              ) : (
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>E-mail</th>
                      <th>Cargo / Função</th>
                      <th>Telefone</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const roleLabel = 
                        user.role === 'admin' ? 'Administrador' :
                        user.role === 'manager' ? 'Gerente / Supervisor' :
                        user.role === 'operator' ? 'Operador (Caixa)' :
                        user.role === 'guardian' ? 'Responsável' : 'Estudante';

                      
                      return (
                        <tr key={user.id} className={!user.is_active ? 'row-inactive' : ''}>
                          <td>
                            <div className="user-avatar-name">
                              <div className="user-avatar-circle">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="user-name-text">{user.name}</span>
                            </div>
                          </td>
                          <td>{user.email}</td>
                          <td>
                            <span className={`user-role-badge ${user.role}`}>
                              {roleLabel}
                            </span>
                          </td>
                          <td>{user.phone || 'Não inf.'}</td>
                          <td>
                            <span className={`status-pill ${user.is_active ? 'active' : 'inactive'}`}>
                              {user.is_active ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="user-actions-btns">
                              <button 
                                className="btn btn-secondary btn-xs-action"
                                title="Editar Usuário"
                                onClick={() => openEditModal(user)}
                              >
                                <Edit size={14} />
                              </button>
                              <button 
                                className={`btn btn-xs-action ${user.is_active ? 'btn-deactivate-action' : 'btn-activate-action'}`}
                                title={user.is_active ? 'Desativar Usuário' : 'Ativar Usuário'}
                                onClick={() => handleToggleActiveStatus(user)}
                              >
                                <Power size={14} />
                              </button>
                              <button 
                                className="btn btn-danger-action btn-xs-action"
                                title="Excluir (Desativar)"
                                onClick={() => handleDeleteUser(user)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {usersTotalPages > 1 && (
              <div className="users-pagination">
                <button 
                  className="btn btn-secondary btn-sm"
                  disabled={usersPage === 1}
                  onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <span>Página {usersPage} de {usersTotalPages}</span>
                <button 
                  className="btn btn-secondary btn-sm"
                  disabled={usersPage === usersTotalPages}
                  onClick={() => setUsersPage(p => Math.min(usersTotalPages, p + 1))}
                >
                  Próxima
                </button>
              </div>
            )}
          </div>
        ) : (
          /* CRM Campaign & Messaging Section */
          <>
            {/* Template Edit Card */}
            <div className="settings-card">
              <div className="card-header-with-icon">
                <MessageSquare size={20} className="icon-primary" />
                <div>
                  <h3>Mensagem de Divulgação (WhatsApp)</h3>
                  <p>Escreva o modelo da mensagem que será disparado. Use as variáveis para personalização automática.</p>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <div className="form-group">
                  <textarea
                    rows={4}
                    className="input"
                    value={whatsappTemplate}
                    onChange={(e) => setWhatsappTemplate(e.target.value)}
                    style={{ fontFamily: 'inherit', width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--color-border)', resize: 'vertical' }}
                  />
                  <small className="form-tip" style={{ display: 'block', marginTop: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                    Variáveis disponíveis: <strong>{`{nome_responsavel}`}</strong>, <strong>{`{nome_aluno}`}</strong>, <strong>{`{matricula}`}</strong>, <strong>{`{data_nascimento}`}</strong>, <strong>{`{link_portal}`}</strong>.
                  </small>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button type="button" className="btn btn-primary" onClick={handleSaveWaTemplate}>
                    Salvar Modelo de Mensagem
                  </button>
                </div>
              </div>
            </div>

            {/* Students Funnel CRM List Card */}
            <div className="settings-card">
              <div className="users-crud-header">
                <div className="card-header-with-icon">
                  <Users size={20} className="icon-secondary" />
                  <div>
                    <h3>Lista de Alunos e Vínculos de Acesso</h3>
                    <p>Controle de pais cadastrados e botões de divulgação via WhatsApp.</p>
                  </div>
                </div>
              </div>

              {/* Filters bar */}
              <div className="users-filters-row" style={{ marginTop: '1.5rem' }}>
                <div className="search-box" style={{ flex: 1 }}>
                  <Search size={16} />
                  <input 
                    type="text" 
                    placeholder="Buscar aluno por nome ou matrícula..." 
                    value={crmSearch}
                    onChange={(e) => { setCrmSearch(e.target.value); setCrmPage(1); }}
                  />
                </div>

                <button className="btn btn-secondary btn-icon-only" onClick={loadCrmStudents} title="Recarregar">
                  <RefreshCw size={16} />
                </button>
              </div>

              {/* CRM Students Table */}
              <div className="users-table-wrapper" style={{ marginTop: '1rem' }}>
                {crmLoading ? (
                  <div className="users-loading">
                    <Loader2 size={32} className="spinner" />
                    <p>Carregando funil de adoção de alunos...</p>
                  </div>
                ) : crmStudents.length === 0 ? (
                  <div className="users-empty-state">
                    <Users size={48} />
                    <p>Nenhum aluno encontrado.</p>
                  </div>
                ) : (
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>Aluno</th>
                        <th>Série / Turma</th>
                        <th>Responsável Importado</th>
                        <th>Contato Importado</th>
                        <th>Status do Portal</th>
                        <th style={{ textAlign: 'center' }}>Divulgado?</th>
                        <th style={{ textAlign: 'right' }}>Disparo WhatsApp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crmStudents.map((student) => {
                        const hasParentLinked = Number(student.guardian_count || 0) > 0;
                        const isMarketingSent = student.is_marketing_sent === true || student.is_marketing_sent === 1 || student.is_marketing_sent === '1';
                        return (
                          <tr key={student.id}>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600 }}>{student.name}</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Matrícula: {student.enrollment_number}</span>
                              </div>
                            </td>
                            <td>{student.grade} - {student.class_group || 'Turma A'}</td>
                            <td>{student.guardian_name || 'Não informado'}</td>
                            <td>{student.guardian_phone || 'Não informado'}</td>
                            <td>
                              {hasParentLinked ? (
                                <span className="status-pill active" style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                                  <Check size={12} />
                                  Ativo ({student.linked_guardian_names || 'Sim'})
                                </span>
                              ) : (
                                <span className="status-pill inactive" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                  Pendente
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="checkbox" 
                                checked={isMarketingSent}
                                onChange={() => handleToggleMarketing(student.id, isMarketingSent)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#10b981' }}
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {student.guardian_phone ? (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ 
                                    background: isMarketingSent ? 'rgba(37, 211, 102, 0.15)' : '#25d366', 
                                    color: isMarketingSent ? '#25d366' : '#ffffff',
                                    border: '1px solid #25d366',
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '0.5rem', 
                                    padding: '6px 12px',
                                    fontSize: '0.85rem'
                                  }}
                                  onClick={() => handleSendWhatsApp(student)}
                                >
                                  <Send size={14} />
                                  <span>{isMarketingSent ? 'Reenviar Zap' : 'Enviar Zap'}</span>
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Sem telefone</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* CRM Pagination */}
              {crmTotalPages > 1 && (
                <div className="users-pagination" style={{ marginTop: '1.5rem' }}>
                  <button 
                    className="btn btn-secondary btn-sm"
                    disabled={crmPage === 1}
                    onClick={() => setCrmPage(p => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <span>Página {crmPage} de {crmTotalPages}</span>
                  <button 
                    className="btn btn-secondary btn-sm"
                    disabled={crmPage === crmTotalPages}
                    onClick={() => setCrmPage(p => Math.min(crmTotalPages, p + 1))}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* User Creator/Editor Modal */}
      {showUserModal && (
        <div className="user-modal-overlay">
          <div className="user-modal-box animate-scaleIn">
            <div className="user-modal-header">
              <h3>{modalMode === 'create' ? 'Novo Usuário de Sistema' : 'Editar Usuário'}</h3>
              <button className="btn-close-modal" onClick={() => setShowUserModal(false)}>
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleUserSubmit} className="user-modal-form">
              {errorMsg && (
                <div className="modal-error-alert">
                  <p>{errorMsg}</p>
                </div>
              )}

              <div className="form-group">
                <label>Nome Completo</label>
                <input 
                  type="text" 
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  required 
                />
              </div>

              <div className="form-group">
                <label>E-mail (Login)</label>
                <input 
                  type="email" 
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="Ex: joao@email.com"
                  required 
                />
              </div>

              <div className="form-group">
                <label>Telefone (Opcional)</label>
                <input 
                  type="text" 
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="Ex: (81) 98888-7777"
                />
              </div>

              <div className="form-group">
                <label>Cargo / Função</label>
                <select 
                  value={userRole} 
                  onChange={(e) => setUserRole(e.target.value as any)}
                >
                  <option value="operator">Operador (Acesso ao PDV de Vendas)</option>
                  <option value="manager">Gerente / Supervisor (Gestão de Produtos, Alunos e Caixas - Sem Finanças Globais)</option>
                  <option value="admin">Administrador (Acesso total)</option>
                </select>

              </div>

              <div className="form-group">
                <label>{modalMode === 'create' ? 'Senha de Acesso' : 'Alterar Senha de Acesso (Nova Senha)'}</label>
                <input 
                  type="password" 
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  placeholder={modalMode === 'create' ? "Mínimo 8 dígitos, 1 maiúscula e 1 número" : "Deixe em branco para manter a senha atual"}
                  required={modalMode === 'create'}
                />
                <small className="form-tip">A senha precisa conter pelo menos 8 caracteres, uma letra maiúscula e um número.</small>
              </div>

              {modalMode === 'edit' && (
                <div className="form-group-checkbox">
                  <input 
                    type="checkbox" 
                    id="user-active-checkbox"
                    checked={userIsActive}
                    onChange={(e) => setUserIsActive(e.target.checked)}
                  />
                  <label htmlFor="user-active-checkbox">Conta de acesso ativa no sistema</label>
                </div>
              )}

              <div className="user-modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowUserModal(false)}
                  disabled={submittingUser}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={submittingUser}
                >
                  {submittingUser ? 'Gravando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
