import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Coffee, ShieldCheck, UserPlus, X } from 'lucide-react';
import { authApi } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Self-registration states
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regEnrollment, setRegEnrollment] = useState('');
  const [regBirthDate, setRegBirthDate] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');

  // For demo/dev: use a hardcoded schoolId
  let schoolId = import.meta.env.VITE_SCHOOL_ID;
  if (!schoolId || schoolId === 'undefined' || schoolId === 'null' || schoolId.trim() === '') {
    schoolId = 'a0000000-0000-0000-0000-000000000001';
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await authApi.login({ 
        email: email.trim().toLowerCase(), 
        password: password.trim(), 
        schoolId 
      });
      const result = data.data;

      login(result.user, result.accessToken, result.refreshToken);
      
      if (result.user.role === 'admin') {
        navigate('/admin');
      } else if (result.user.role === 'guardian') {
        navigate('/guardian');
      } else {
        navigate('/pos');
      }
    } catch (err: any) {
      const apiError = err.response?.data?.error;
      if (apiError?.details && Array.isArray(apiError.details)) {
        const detailsMsg = apiError.details.map((d: any) => d.message).join(', ');
        setError(`${apiError.message}: ${detailsMsg}`);
      } else if (apiError?.message) {
        setError(apiError.message);
      } else if (err.message) {
        setError(`Conexão com API falhou (${err.message}). Tente novamente.`);
      } else {
        setError('Erro ao fazer login. Verifique sua conexão.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegLoading(true);

    // Validate password constraints matching the backend zod validator
    if (regPassword.length < 8) {
      setRegError('A senha precisa ter pelo menos 8 caracteres.');
      setRegLoading(false);
      return;
    }
    if (!/[A-Z]/.test(regPassword)) {
      setRegError('A senha precisa conter pelo menos uma letra maiúscula.');
      setRegLoading(false);
      return;
    }
    if (!/[0-9]/.test(regPassword)) {
      setRegError('A senha precisa conter pelo menos um número.');
      setRegLoading(false);
      return;
    }

    try {
      const { data } = await authApi.registerGuardian({
        name: regName,
        email: regEmail,
        phone: regPhone,
        password: regPassword,
        schoolId,
        studentEnrollment: regEnrollment,
        studentBirthDate: regBirthDate,
      });

      const result = data.data;
      login(result.user, result.accessToken, result.refreshToken);
      navigate('/guardian');
    } catch (err: any) {
      const apiError = err.response?.data?.error;
      setRegError(apiError?.message || 'Erro ao realizar autocadastro. Verifique os dados do aluno.');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-effects">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
      </div>

      <div className="login-card animate-scaleIn">
        <div className="login-logo">
          <div className="login-logo-icon">
            <Coffee size={32} />
          </div>
          <h1>Cantina Escolar</h1>
          <p>Sistema de Ponto de Venda</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="login-error animate-fadeIn">
              <ShieldCheck size={16} />
              {error}
            </div>
          )}

          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="operador@escola.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-lg login-submit" disabled={loading}>
            {loading ? (
              <span className="login-spinner" />
            ) : (
              <>
                <LogIn size={18} />
                Entrar
              </>
            )}
          </button>
        </form>

        <div className="login-register-prompt" style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>É responsável por aluno? </span>
          <button 
            type="button" 
            className="login-link-action" 
            onClick={() => setShowRegister(true)}
            style={{ 
              background: 'transparent', 
              color: 'var(--color-primary)', 
              border: 'none', 
              fontSize: '0.85rem', 
              fontWeight: 600, 
              cursor: 'pointer', 
              textDecoration: 'underline' 
            }}
          >
            Primeiro Acesso / Cadastrar-se
          </button>
        </div>

        <div className="login-footer">
          <div className="login-security">
            <ShieldCheck size={14} />
            Conexão segura criptografada
          </div>
        </div>
      </div>

      {/* Register Modal */}
      {showRegister && (
        <div className="login-modal-overlay">
          <div className="login-modal-box animate-scaleIn">
            <div className="login-modal-header">
              <h3><UserPlus size={20} style={{ color: 'var(--color-primary)' }} /> Primeiro Acesso do Responsável</h3>
              <button type="button" className="btn-close-modal" onClick={() => setShowRegister(false)} title="Fechar">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleRegister} className="login-modal-form">
              {regError && (
                <div className="login-error animate-fadeIn" style={{ marginBottom: '1rem' }}>
                  <ShieldCheck size={16} />
                  {regError}
                </div>
              )}

              <div className="login-field">
                <label>Seu Nome Completo</label>
                <input 
                  type="text" 
                  className="input"
                  placeholder="Ex: João da Silva"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required 
                />
              </div>

              <div className="login-field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="login-field">
                  <label>E-mail Real</label>
                  <input 
                    type="email" 
                    className="input"
                    placeholder="Ex: joao@email.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required 
                  />
                </div>
                <div className="login-field">
                  <label>Telefone de Contato</label>
                  <input 
                    type="text" 
                    className="input"
                    placeholder="Ex: 81988887777"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    required 
                  />
                </div>
              </div>

              <div className="login-field">
                <label>Criar Senha de Acesso</label>
                <input 
                  type="password" 
                  className="input"
                  placeholder="Mínimo 8 dígitos, 1 maiúscula e 1 número"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required 
                />
              </div>

              <hr className="login-modal-divider" style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.2rem 0' }} />
              <p className="login-modal-section-title" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '0.8rem' }}>Dados de Vinculação do Aluno</p>

              <div className="login-field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="login-field">
                  <label>Matrícula do Aluno</label>
                  <input 
                    type="text" 
                    className="input"
                    placeholder="Código da Matrícula"
                    value={regEnrollment}
                    onChange={(e) => setRegEnrollment(e.target.value)}
                    required 
                  />
                </div>
                <div className="login-field">
                  <label>Data de Nascimento</label>
                  <input 
                    type="date" 
                    className="input"
                    value={regBirthDate}
                    onChange={(e) => setRegBirthDate(e.target.value)}
                    required 
                  />
                </div>
              </div>

              <div className="login-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--color-border)', marginTop: '1.5rem', paddingTop: '1rem' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowRegister(false)}
                  disabled={regLoading}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={regLoading}
                >
                  {regLoading ? 'Registrando...' : 'Confirmar e Entrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
