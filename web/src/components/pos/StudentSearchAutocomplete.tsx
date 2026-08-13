import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, Camera, Loader2, User as UserIcon } from 'lucide-react';
import { studentsApi, cardsApi } from '../../services/api';
import { type StudentResult } from './StudentSelectionModal';
import './StudentSearchAutocomplete.css';

interface StudentSearchAutocompleteProps {
  onSelectStudent: (student: any) => void;
  onOpenFacialLogin: () => void;
  onMultipleResultsFound: (students: StudentResult[], searchTerm: string) => void;
}

export const StudentSearchAutocomplete: React.FC<StudentSearchAutocompleteProps> = ({
  onSelectStudent,
  onOpenFacialLogin,
  onMultipleResultsFound,
}) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce search on query change
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await studentsApi.search(trimmed);
        const results = data.data?.data || [];
        setSuggestions(results);
        setIsOpen(results.length > 0);
        setSelectedIndex(-1);
      } catch (err) {
        console.error('Error fetching student suggestions:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (s: StudentResult) => {
    onSelectStudent({
      studentId: s.id,
      name: s.name,
      enrollmentNumber: s.enrollment_number,
      balance: Number(s.balance || 0),
      photoUrl: s.photo_url,
      method: 'manual',
    });
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();

      // Case 1: An option was highlighted with arrow keys
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelect(suggestions[selectedIndex]);
        return;
      }

      const q = query.trim();
      if (!q) return;

      setLoading(true);
      try {
        // First try barcode/card match
        const { data: cardData } = await cardsApi.getStudentByCard(q);
        const s = cardData.data.student;
        onSelectStudent({
          studentId: s.student_id,
          name: s.name,
          enrollmentNumber: s.enrollment_number,
          balance: Number(s.balance),
          photoUrl: s.photo_url,
          method: 'card',
        });
        setQuery('');
        setSuggestions([]);
        setIsOpen(false);
      } catch {
        // If not a card code, search by name/matricula
        try {
          const { data } = await studentsApi.search(q);
          const results: StudentResult[] = data.data?.data || [];

          if (results.length === 1) {
            handleSelect(results[0]);
          } else if (results.length > 1) {
            setIsOpen(false);
            onMultipleResultsFound(results, q);
          } else {
            alert('Nenhum aluno encontrado.');
          }
        } catch {
          alert('Erro ao buscar aluno.');
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="pos-student-autocomplete-container" ref={containerRef}>
      <div className="pos-student-search-bar">
        <CreditCard size={16} className="search-icon" />
        <input
          type="text"
          placeholder="Cartão, RE/matrícula ou nome..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          className="pos-card-input"
        />

        {loading && <Loader2 size={16} className="animate-spin text-muted" />}

        {/* Botão de Reconhecimento Facial — Mantido Intacto */}
        <button
          type="button"
          className="btn btn-ghost btn-icon facial-cam-btn"
          title="Reconhecimento Facial"
          onClick={onOpenFacialLogin}
        >
          <Camera size={16} />
        </button>
      </div>

      {/* Autocomplete Dropdown List */}
      {isOpen && suggestions.length > 0 && (
        <ul className="pos-autocomplete-dropdown animate-fadeIn">
          {suggestions.map((s, index) => (
            <li
              key={s.id}
              className={`pos-autocomplete-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="item-avatar">
                {s.photo_url ? (
                  <img src={s.photo_url} alt={s.name} />
                ) : (
                  <UserIcon size={18} />
                )}
              </div>
              <div className="item-details">
                <span className="item-name" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {s.name}
                  {s.type === 'employee' ? (
                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px', background: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}>Funcionário</span>
                  ) : (
                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '8px', background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>Aluno</span>
                  )}
                </span>
                <span className="item-sub">
                  Matrícula: {s.enrollment_number} {s.class_group ? `• ${s.class_group}` : ''} {(s.guardian_name || s.linked_guardian_names) ? ` • Resp: ${s.guardian_name || s.linked_guardian_names}` : ''}
                </span>
              </div>
              <div className="item-balance">
                {formatCurrency(Number(s.balance || 0))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
