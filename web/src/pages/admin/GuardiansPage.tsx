import { useState, useEffect } from 'react';
import { 
  Search, UserCheck, Plus, Edit2, Link, Trash2, 
  Loader2, AlertCircle, X, Check, User
} from 'lucide-react';
import { guardiansApi, studentsApi } from '../../services/api';
import './GuardiansPage.css';

interface LinkedStudent {
  id: string;
  name: string;
  enrollment_number: string;
  grade: string;
  balance: number;
  relationship: string;
  is_primary: boolean;
}

interface Guardian {
  id: string;
  name: string;
  email: string;
  phone: string;
  is_active: boolean;
  cpf: string | null;
  created_at: string;
  students?: LinkedStudent[];
}

export default function GuardiansPage() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters and Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  // Create/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    cpf: '',
    isActive: true,
  });

  // Link Student Modal State
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [selectedGuardian, setSelectedGuardian] = useState<Guardian | null>(null);
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  
  // Link Student Form State
  const [studentSearch, setStudentSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [selectedStudentToLink, setSelectedStudentToLink] = useState<any | null>(null);
  const [relationship, setRelationship] = useState('guardian');
  const [isPrimary, setIsPrimary] = useState(true);
  const [linking, setLinking] = useState(false);

  const translateRelationship = (rel: string) => {
    switch (rel) {
      case 'parent': return 'Pai/Mãe';
      case 'guardian': return 'Responsável';
      case 'grandparent': return 'Avô/Avó';
      case 'other': return 'Outro';
      default: return rel;
    }
  };

  // Debounced search trigger to prevent rate-limiting on keystrokes
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 400);

    return () => clearTimeout(handler);
  }, [searchInput]);

  useEffect(() => {
    loadGuardians();
  }, [page, searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  };

  const loadGuardians = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await guardiansApi.list({
        page,
        limit,
        search: searchQuery || undefined,
      });
      
      setGuardians(data.data?.data || []);
      setTotalPages(data.data?.pagination?.totalPages || 1);
    } catch (err) {
      console.error(err);
      setError('Erro ao carregar responsáveis.');
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = () => {
    setEditingId(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      cpf: '',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (g: Guardian) => {
    setEditingId(g.id);
    setFormData({
      name: g.name,
      email: g.email,
      password: '', // Password only changes if typed
      phone: g.phone || '',
      cpf: g.cpf || '',
      isActive: g.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSaveGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!formData.name || !formData.email) {
      alert('Nome e E-mail são obrigatórios.');
      return;
    }

    if (!editingId && !formData.password) {
      alert('A senha é obrigatória para novos cadastros.');
      return;
    }

    const sanitizeField = (val: string) => {
      const trimmed = val.trim();
      return trimmed === '' ? undefined : trimmed;
    };

    const formatCPF = (val: string): string | undefined => {
      const clean = val.replace(/\D/g, '');
      if (clean.length === 11) {
        return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      }
      return clean === '' ? undefined : val;
    };

    setSaving(true);
    try {
      if (editingId) {
        const payload: any = {
          name: formData.name,
          phone: sanitizeField(formData.phone),
          cpf: formatCPF(formData.cpf),
          isActive: formData.isActive,
        };
        if (formData.password.trim()) {
          payload.password = formData.password;
        }
        await guardiansApi.update(editingId, payload);
      } else {
        await guardiansApi.create({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: sanitizeField(formData.phone),
          cpf: formatCPF(formData.cpf),
        });
      }
      setIsModalOpen(false);
      loadGuardians();
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      if (errorData?.code === 'VALIDATION_ERROR' && errorData.details) {
        const detailsMsg = errorData.details
          .map((d: any) => `${d.field}: ${d.message}`)
          .join('\n');
        alert(`Erro de validação:\n${detailsMsg}`);
      } else {
        alert(errorData?.message || 'Erro ao salvar responsável.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Linked Students Management
  const openLinkModal = async (g: Guardian) => {
    setSelectedGuardian(g);
    setIsLinkModalOpen(true);
    setStudentSearch('');
    setSearchResults([]);
    setSelectedStudentToLink(null);
    setRelationship('guardian');
    setIsPrimary(true);
    
    // Load links
    setLoadingLinks(true);
    try {
      const { data } = await guardiansApi.getById(g.id);
      setLinkedStudents(data.data.guardian.students || []);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar alunos vinculados.');
    } finally {
      setLoadingLinks(false);
    }
  };

  // Autocomplete search for students to link
  useEffect(() => {
    if (studentSearch.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setSearchingStudents(true);
      try {
        const { data } = await studentsApi.search(studentSearch);
        setSearchResults(data.data?.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setSearchingStudents(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [studentSearch]);

  const handleLinkStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuardian || !selectedStudentToLink || linking) return;

    setLinking(true);
    try {
      await guardiansApi.linkStudent(selectedGuardian.id, {
        studentId: selectedStudentToLink.id,
        relationship,
        isPrimary,
      });
      
      // Reload links
      const { data } = await guardiansApi.getById(selectedGuardian.id);
      setLinkedStudents(data.data.guardian.students || []);
      
      // Reset form
      setStudentSearch('');
      setSelectedStudentToLink(null);
      loadGuardians(); // update main table
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao vincular aluno.');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkStudent = async (studentId: string, studentName: string) => {
    if (!selectedGuardian) return;
    if (!window.confirm(`Deseja desvincular o aluno "${studentName}" deste responsável?`)) return;

    try {
      await guardiansApi.unlinkStudent(selectedGuardian.id, studentId);
      
      // Reload links
      const { data } = await guardiansApi.getById(selectedGuardian.id);
      setLinkedStudents(data.data.guardian.students || []);
      loadGuardians(); // update main table
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao desvincular aluno.');
    }
  };

  return (
    <div className="guardians-page animate-fadeIn">
      <div className="guardians-header">
        <div>
          <h1>Gerenciar Responsáveis</h1>
          <p>Cadastre os pais/responsáveis e vincule-os às contas de seus filhos</p>
        </div>
        <button className="btn btn-primary" onClick={openNewModal}>
          <Plus size={18} /> Novo Responsável
        </button>
      </div>

      {/* Filter bar */}
      <div className="guardians-filters-bar">
        <div className="filter-group search">
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Buscar por nome, email ou CPF..." 
            value={searchInput}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {/* Table */}
      <div className="guardians-table-container">
        {loading ? (
          <div className="guardians-loading">
            <Loader2 size={32} className="spinner" />
            <p>Carregando responsáveis...</p>
          </div>
        ) : error ? (
          <div className="guardians-error">
            <AlertCircle size={24} />
            <p>{error}</p>
          </div>
        ) : guardians.length === 0 ? (
          <div className="guardians-empty">
            <UserCheck size={48} />
            <p>Nenhum responsável cadastrado.</p>
          </div>
        ) : (
          <>
            <table className="guardians-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>CPF</th>
                  <th>Alunos Vinculados</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {guardians.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <div className="guardian-name-cell">
                        <span className="guardian-name">{g.name}</span>
                        <span className="guardian-email">{g.email}</span>
                      </div>
                    </td>
                    <td>
                      <span className="guardian-phone-cell">{g.phone || 'Não inf.'}</span>
                    </td>
                    <td>
                      <span className="guardian-cpf-cell">{g.cpf || 'Não inf.'}</span>
                    </td>
                    <td>
                      {g.students && g.students.length > 0 ? (
                        g.students.map((s) => (
                          <span 
                            key={s.id} 
                            className={`student-tag ${s.is_primary ? 'primary' : ''}`}
                            title={`${translateRelationship(s.relationship)} | Saldo: R$ ${Number(s.balance).toFixed(2)}`}
                          >
                            <User size={10} /> {s.name.split(' ')[0]} ({translateRelationship(s.relationship)})
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Nenhum aluno</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${g.is_active ? 'active' : 'inactive'}`}>
                        {g.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button 
                          className="btn btn-sm btn-secondary" 
                          title="Vincular Alunos"
                          onClick={() => openLinkModal(g)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Link size={14} /> Alunos
                        </button>
                        <button 
                          className="btn btn-sm btn-secondary" 
                          title="Editar cadastro"
                          onClick={() => openEditModal(g)}
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="guardians-pagination">
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
          </>
        )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="modal-backdrop show" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Responsável' : 'Novo Responsável'}</h2>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveGuardian}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="form-group">
                  <label>Nome Completo*</label>
                  <input 
                    type="text" 
                    required 
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: João Silva"
                  />
                </div>

                <div className="form-group">
                  <label>E-mail de Login*</label>
                  <input 
                    type="email" 
                    required 
                    disabled={!!editingId}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Ex: joao.silva@email.com"
                  />
                </div>

                <div className="form-group">
                  <label>{editingId ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha de Acesso*'}</label>
                  <input 
                    type="password" 
                    required={!editingId}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>

                <div className="form-group">
                  <label>Telefone (WhatsApp)*</label>
                  <input 
                    type="text" 
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Ex: 99985084888"
                  />
                </div>

                <div className="form-group">
                  <label>CPF</label>
                  <input 
                    type="text" 
                    value={formData.cpf}
                    onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                    placeholder="Ex: 123.456.789-00"
                  />
                </div>

                {editingId && (
                  <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="checkbox" 
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    <label htmlFor="isActive" style={{ marginBottom: 0, cursor: 'pointer' }}>Cadastro Ativo</label>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Link Student Modal */}
      {isLinkModalOpen && selectedGuardian && (
        <div className="modal-backdrop show" onClick={() => setIsLinkModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div>
                <h2>Vincular Alunos</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  Responsável: <strong>{selectedGuardian.name}</strong>
                </p>
              </div>
              <button className="modal-close" onClick={() => setIsLinkModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              {/* Linked Students List */}
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--color-text-primary)' }}>
                Alunos Atualmente Vinculados
              </h3>
              
              {loadingLinks ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                  <Loader2 className="spinner" size={24} />
                </div>
              ) : linkedStudents.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', fontStyle: 'italic', marginBottom: '2rem' }}>
                  Nenhum aluno vinculado a este responsável.
                </p>
              ) : (
                <ul className="linked-students-list">
                  {linkedStudents.map((student) => (
                    <li key={student.id} className="linked-student-item">
                      <div className="linked-student-info">
                        <span className="linked-student-name">{student.name}</span>
                        <span className="linked-student-meta">
                          Matrícula: {student.enrollment_number} | Grau: {student.grade || 'Não inf.'}
                        </span>
                        <span className="linked-student-meta" style={{ marginTop: '2px' }}>
                          Grau de Parentesco: <strong>{translateRelationship(student.relationship)}</strong> {student.is_primary && <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>• Principal</span>}
                        </span>
                      </div>
                      <button 
                        type="button"
                        className="btn btn-sm btn-secondary" 
                        title="Desvincular Aluno"
                        onClick={() => handleUnlinkStudent(student.id, student.name)}
                        style={{ color: '#ef4444', border: 'none', background: 'transparent' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '1.5rem 0' }} />

              {/* Link New Student Form */}
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text-primary)' }}>
                Vincular Novo Aluno
              </h3>
              
              <form onSubmit={handleLinkStudent}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="form-group student-search-container">
                    <label>Buscar Aluno (Digite o nome para pesquisar)*</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input 
                        type="text" 
                        placeholder="Digite pelo menos 2 caracteres..."
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        disabled={!!selectedStudentToLink}
                      />
                      {selectedStudentToLink && (
                        <button 
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setSelectedStudentToLink(null); setStudentSearch(''); }}
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    {searchingStudents && (
                      <div style={{ position: 'absolute', right: '10px', top: '35px' }}>
                        <Loader2 className="spinner" size={16} />
                      </div>
                    )}

                    {searchResults.length > 0 && !selectedStudentToLink && (
                      <div className="student-search-results">
                        {searchResults.map((s) => (
                          <div 
                            key={s.id}
                            className="student-search-item"
                            onClick={() => {
                              setSelectedStudentToLink(s);
                              setStudentSearch(s.name);
                              setSearchResults([]);
                            }}
                          >
                            <span><strong>{s.name}</strong></span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Matrícula: {s.enrollment_number}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedStudentToLink && (
                    <div style={{ padding: '0.75rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: '#4ade80', fontSize: '0.875rem' }}>
                      <Check size={16} /> Aluno selecionado: <strong>{selectedStudentToLink.name}</strong>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label>Grau de Parentesco*</label>
                      <select 
                        value={relationship}
                        onChange={(e) => setRelationship(e.target.value)}
                      >
                        <option value="guardian">Responsável</option>
                        <option value="parent">Pai / Mãe</option>
                        <option value="grandparent">Avô / Avó</option>
                        <option value="other">Outro</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ flexDirection: 'row', alignItems: 'flex-end', paddingBottom: '0.5rem', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        id="isPrimaryLink"
                        checked={isPrimary}
                        onChange={(e) => setIsPrimary(e.target.checked)}
                      />
                      <label htmlFor="isPrimaryLink" style={{ marginBottom: 0, cursor: 'pointer' }}>Responsável Principal</label>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={!selectedStudentToLink || linking}
                  >
                    {linking ? 'Vinculando...' : 'Confirmar Vínculo'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
