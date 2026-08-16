import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Send, X, Plus, ListChecks, CheckSquare, Square, RefreshCw, User, ArrowLeft, Users, MessageSquare, TrendingUp, ShoppingBag, History, Calculator, Settings, Share2, DollarSign, Store, AlertCircle, ChevronRight, HelpCircle, Pencil, Trash2, Printer, Camera } from 'lucide-react';
import { api, posApi, studentsApi } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { generateStaticPix } from '../../utils/pix';
import { showToast } from '../../components/common/Toast';
import { PrintableSheetModal } from '../../components/pos/PrintableSheetModal';
import { CameraQRScannerModal } from '../../components/pos/CameraQRScannerModal';
import './OnCreditPage.css';

interface DebtStudent {
  student_id: string;
  student_name: string;
  grade: string;
  class_group: string;
  enrollment_number: string;
  total_debt: number;
  last_purchase_at: string;
  balance?: number;
}

interface DebtDetailItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface DebtTransaction {
  id: string;
  created_at: string;
  amount: number;
  notes: string | null;
  operator_name?: string;
  payment_status?: string;
  payment_method?: string;
  items: DebtDetailItem[];
}

interface GuardianDetails {
  guardian_name: string | null;
  guardian_phone: string | null;
}

function parseMathExpression(expr: string): number {
  if (!expr || !expr.trim()) return 0;
  const sanitized = expr.replace(/,/g, '.').replace(/[^0-9.+-]/g, '');
  if (!sanitized) return 0;
  const tokens = sanitized.split(/(?=[+-])|(?<=[+-])/).filter((t) => t.trim() !== '');
  let total = 0;
  let currentSign = 1;
  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed === '+') currentSign = 1;
    else if (trimmed === '-') currentSign = -1;
    else {
      const val = parseFloat(trimmed);
      if (!isNaN(val)) total += currentSign * val;
    }
  }
  return Math.max(0, Math.round(total * 100) / 100);
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export default function OnCreditPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [debts, setDebts] = useState<DebtStudent[]>([]);
  const [totals, setTotals] = useState({
    total_sold: 0,
    total_received: 0,
    total_pending: 0,
    today_sales: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modais de Folha Impressa A4 com QR Code e Leitor por Câmera
  const [isPrintableSheetModalOpen, setIsPrintableSheetModalOpen] = useState(false);
  const [isCameraScannerModalOpen, setIsCameraScannerModalOpen] = useState(false);

  // Sort & Filter state
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterFiado, setFilterFiado] = useState(true);
  const [filterCredito, setFilterCredito] = useState(true);
  const [filterEmDia, setFilterEmDia] = useState(true);
  const [sortBy, setSortBy] = useState<'preco' | 'nome'>('preco');
  const [sortAsc, setSortAsc] = useState(false); // default: maior débito primeiro

  // Crediário App Main Tabs State (Prints 1, 3, 4)
  const [mainTab, setMainTab] = useState<'resumo' | 'clientes' | 'cobrar'>('clientes');
  // Customer Detail Sub-tabs State (Prints 5, 6, 7, 8, 9)
  const [customerSubTab, setCustomerSubTab] = useState<'info' | 'vendas' | 'historico' | 'extrato' | 'config'>('info');
  const [selectedMonth, setSelectedMonth] = useState('Julho 2026');

  // Quick Add Student Modal State (Print 3 FAB)
  const [isNewStudentModalOpen, setIsNewStudentModalOpen] = useState(false);
  const [newStudentData, setNewStudentData] = useState({
    type: 'student' as 'student' | 'employee',
    name: '',
    enrollmentNumber: '',
    grade: '',
    class_group: '',
    jobRole: '',
    guardianName: '',
    guardianPhone: '',
  });
  const [savingNewStudent, setSavingNewStudent] = useState(false);

  // Manual Debt Launch State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualStudentSearch, setManualStudentSearch] = useState('');
  const [manualStudentResults, setManualStudentResults] = useState<any[]>([]);
  const [selectedManualStudent, setSelectedManualStudent] = useState<any | null>(null);
  const [manualAmount, setManualAmount] = useState('');
  const [lastUsedDate, setLastUsedDate] = useState(
    () => localStorage.getItem('cantina-last-manual-date') || new Date().toISOString().split('T')[0]
  );
  const [manualDate, setManualDate] = useState(lastUsedDate);
  const [manualDescription, setManualDescription] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  
  // Edit Transaction State
  const [editingTransaction, setEditingTransaction] = useState<DebtTransaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);

  // Batch On-Credit State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };
  const getTodayStr = () => new Date().toISOString().split('T')[0];

  const [batchRefStartDate, setBatchRefStartDate] = useState(getYesterdayStr());
  const [batchRefEndDate, setBatchRefEndDate] = useState(getYesterdayStr());
  const [batchLaunchDate, setBatchLaunchDate] = useState(getTodayStr());
  const [batchDescription, setBatchDescription] = useState('Consumo diário (Ficha a Prazo)');
  const [batchDefaultPrice, setBatchDefaultPrice] = useState('10');
  const [batchSearch, setBatchSearch] = useState('');
  const [loadingBatchConsumers, setLoadingBatchConsumers] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);

  interface BatchConsumerItem {
    student_id: string;
    student_name: string;
    grade: string;
    class_group: string;
    enrollment_number: string;
    yesterday_amount: number;
    selected: boolean;
    amountInput: string;
  }
  const [batchConsumers, setBatchConsumers] = useState<BatchConsumerItem[]>([]);

  const loadBatchConsumers = async (startDate: string, endDate: string, defaultPrice: string) => {
    setLoadingBatchConsumers(true);
    try {
      const { data } = await posApi.getRecentConsumers(startDate, endDate);
      const rawList = data?.data?.consumers || [];

      if (rawList.length > 0) {
        setBatchConsumers(
          rawList.map((c: any) => ({
            student_id: c.student_id,
            student_name: c.student_name,
            grade: c.grade || '',
            class_group: c.class_group || '',
            enrollment_number: c.enrollment_number || '',
            yesterday_amount: Number(c.yesterday_amount || 0),
            selected: true,
            amountInput: c.yesterday_amount > 0 ? c.yesterday_amount.toString() : defaultPrice,
          }))
        );
      } else {
        setBatchConsumers(
          debts.map((d) => ({
            student_id: d.student_id,
            student_name: d.student_name,
            grade: d.grade || '',
            class_group: d.class_group || '',
            enrollment_number: d.enrollment_number || '',
            yesterday_amount: 0,
            selected: true,
            amountInput: defaultPrice,
          }))
        );
      }
    } catch (err) {
      console.error('Erro ao carregar consumidores da faixa de datas:', err);
    } finally {
      setLoadingBatchConsumers(false);
    }
  };

  const handleOpenBatchModal = () => {
    const yesterday = getYesterdayStr();
    const today = getTodayStr();
    setBatchRefStartDate(yesterday);
    setBatchRefEndDate(yesterday);
    setBatchLaunchDate(today);
    setBatchDefaultPrice('10');
    setBatchDescription('Consumo diário (Ficha a Prazo)');
    setBatchSearch('');
    setIsBatchModalOpen(true);
    loadBatchConsumers(yesterday, yesterday, '10');
  };

  const handleSelectAllBatch = (selectAll: boolean) => {
    setBatchConsumers((prev) => prev.map((c) => ({ ...c, selected: selectAll })));
  };

  const handleApplyDefaultPriceToAll = () => {
    setBatchConsumers((prev) =>
      prev.map((c) => (c.selected ? { ...c, amountInput: batchDefaultPrice } : c))
    );
  };

  const handleToggleConsumer = (studentId: string) => {
    setBatchConsumers((prev) =>
      prev.map((c) => (c.student_id === studentId ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleConsumerAmountChange = (studentId: string, val: string) => {
    setBatchConsumers((prev) =>
      prev.map((c) => (c.student_id === studentId ? { ...c, amountInput: val } : c))
    );
  };

  const handleSaveBatchOnCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedItems = batchConsumers.filter((c) => c.selected);
    if (selectedItems.length === 0) {
      showToast('Selecione pelo menos um cliente para lançar.', 'error');
      return;
    }

    const payloadItems = [];
    for (const item of selectedItems) {
      const parsedAmount = parseMathExpression(item.amountInput);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        showToast(`O valor para o cliente ${item.student_name} está inválido.`, 'error');
        return;
      }
      payloadItems.push({
        studentId: item.student_id,
        amount: parsedAmount,
      });
    }

    setSavingBatch(true);
    try {
      const { data } = await posApi.createBatchManualOnCredit({
        date: batchLaunchDate,
        description: batchDescription.trim() || 'Lançamento em Lote (Ficha a Prazo)',
        items: payloadItems,
      });

      const count = data?.data?.count || selectedItems.length;
      showToast(`Sucesso! Criados ${count} lançamentos em lote.`, 'success');
      setIsBatchModalOpen(false);
      loadDebts();
      if (selectedStudent) {
        handleSelectStudent(selectedStudent);
      }
    } catch (err: any) {
      console.error('Erro ao lançar em lote:', err);
      showToast(err.response?.data?.error?.message || 'Erro ao efetuar lançamento em lote.', 'error');
    } finally {
      setSavingBatch(false);
    }
  };

  const handleConfirmCameraBatch = async (items: Array<{ studentId: string; amount: number }>, date?: string) => {
    try {
      const { data } = await posApi.createBatchManualOnCredit({
        date: date || new Date().toISOString().split('T')[0],
        description: 'Consumo diário via Folha QR Code (Câmera)',
        items,
      });
      const count = data?.data?.count || items.length;
      showToast(`Sucesso! Criados ${count} lançamentos em lote via escaneamento.`, 'success');
      loadDebts();
      if (selectedStudent) {
        handleSelectStudent(selectedStudent);
      }
    } catch (err: any) {
      console.error('Erro ao salvar lote via câmera:', err);
      showToast(err.response?.data?.error?.message || 'Erro ao efetuar lançamento em lote via câmera.', 'error');
      throw err;
    }
  };

  const filteredBatchConsumers = batchConsumers.filter((c) => {
    if (!batchSearch.trim()) return true;
    const term = batchSearch.toLowerCase().trim();
    return (
      c.student_name.toLowerCase().includes(term) ||
      c.grade.toLowerCase().includes(term) ||
      c.enrollment_number.toLowerCase().includes(term)
    );
  });

  const selectedBatchCount = batchConsumers.filter((c) => c.selected).length;
  const grandTotalBatch = batchConsumers
    .filter((c) => c.selected)
    .reduce((sum, c) => sum + parseMathExpression(c.amountInput), 0);

  const manualSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isManualModalOpen && !selectedManualStudent) {
      const timer = setTimeout(() => {
        manualSearchInputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isManualModalOpen, selectedManualStudent]);

  // Selected student details
  const [selectedStudent, setSelectedStudent] = useState<DebtStudent | null>(null);
  const [details, setDetails] = useState<DebtTransaction[]>([]);
  const [guardian, setGuardian] = useState<GuardianDetails>({ guardian_name: null, guardian_phone: null });
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Pix key state (saved in localStorage)
  const [pixKey, setPixKey] = useState(localStorage.getItem('cantina-pix-key') || '52803416000141');
  const [merchantName, setMerchantName] = useState(localStorage.getItem('cantina-merchant-name') || 'POLLYANNA AVELINO VERZARO');
  const [merchantCity, setMerchantCity] = useState(localStorage.getItem('cantina-merchant-city') || 'IMPERATRIZ');
  const [isEditingPixKey, setIsEditingPixKey] = useState(false);

  void setPixKey;
  void setMerchantName;
  void setMerchantCity;
  void deletingTxId;

  // Settle modal state
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [settling, setSettling] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDate, setSettleDate] = useState(() => getTodayStr());

  // Drag to scroll and Mouse Wheel Horizontal Scroll
  const scrollRowRef = useRef<HTMLDivElement>(null);
  const isMouseDownRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRowRef.current) return;
    isMouseDownRef.current = true;
    scrollRowRef.current.classList.add('dragging');
    startXRef.current = e.pageX - scrollRowRef.current.offsetLeft;
    scrollLeftRef.current = scrollRowRef.current.scrollLeft;
  };

  const handleMouseLeave = () => {
    isMouseDownRef.current = false;
    if (scrollRowRef.current) scrollRowRef.current.classList.remove('dragging');
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    if (scrollRowRef.current) scrollRowRef.current.classList.remove('dragging');
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDownRef.current || !scrollRowRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRowRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    scrollRowRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!scrollRowRef.current) return;
    if (e.deltaY !== 0) {
      scrollRowRef.current.scrollLeft += e.deltaY;
    }
  };

  useEffect(() => {
    loadDebts();
  }, []);

  const loadDebts = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/pos/on-credit/debts');
      setDebts(data.data.debts || []);
      if (data.data.totals) {
        setTotals(data.data.totals);
      }
    } catch (err) {
      console.error('Error loading on-credit debts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStudent = async (student: DebtStudent) => {
    setSelectedStudent(student);
    setLoadingDetails(true);
    try {
      const { data } = await api.get(`/pos/on-credit/debts/${student.student_id}`);
      setDetails(data.data.transactions || []);
      setGuardian(data.data.guardian || { guardian_name: null, guardian_phone: null });
    } catch (err) {
      console.error('Error loading student debt details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSavePixKey = () => {
    localStorage.setItem('cantina-pix-key', pixKey);
    localStorage.setItem('cantina-merchant-name', merchantName);
    localStorage.setItem('cantina-merchant-city', merchantCity);
    setIsEditingPixKey(false);
  };

  const handleSendWhatsApp = () => {
    if (!selectedStudent) return;

    const phone = guardian.guardian_phone?.replace(/\D/g, '') || '';
    const formattedPhone = phone.length === 11 ? `55${phone}` : phone;

    const formattedTotal = formatCurrency(selectedStudent.total_debt);
    const dateToday = new Date().toLocaleDateString('pt-BR');

    const itemsTextList = details.map(tx => {
      const txDate = new Date(tx.created_at);
      const dateStr = txDate.toLocaleDateString('pt-BR');
      const itemsList = tx.items.map(item => `${item.quantity}x ${(item.product_name || '').replace(/Lançamento Manual/gi, 'Consumo na Cantina')}`).join(', ');
      return `* ${dateStr}: ${itemsList} (${formatCurrency(tx.amount)})`;
    }).join('\n');

    const formattedCnpj = pixKey === '52803416000141' ? '52.803.416/0001-41' : pixKey;
    const generatedCopiaCola = generateStaticPix(pixKey, selectedStudent.total_debt, merchantName, merchantCity);

    try { navigator.clipboard.writeText(generatedCopiaCola); } catch (_) {}

    const messageText = `Olá, ${guardian.guardian_name || 'Responsável'}! Lembramos que o seu filho(a) *${selectedStudent.student_name}* possui consumo pendente (A Prazo) na cantina no valor total de *${formattedTotal}* (atualizado em ${dateToday}).\n\n*Detalhamento do consumo:*\n${itemsTextList}\n\n*Informações para Pagamento Pix:*\nBeneficiário: ${merchantName}\nBanco: Banco Inter\nChave Pix (CNPJ): ${formattedCnpj}\n\n*Pix Copia e Cola (Valor Fechado: ${formattedTotal}):*\n${generatedCopiaCola}\n\nPor favor, envie o comprovante após a transferência. Obrigado!`;

    const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(messageText)}`;
    window.open(url, '_blank');
  };

  const handleSendPixOnly = () => {
    if (!selectedStudent) return;
    const phone = guardian.guardian_phone?.replace(/\D/g, '') || '';
    const formattedPhone = phone.length === 11 ? `55${phone}` : phone;
    const generatedCopiaCola = generateStaticPix(pixKey, selectedStudent.total_debt, merchantName, merchantCity);

    try { navigator.clipboard.writeText(generatedCopiaCola); } catch (_) {}

    const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(generatedCopiaCola)}`;
    window.open(url, '_blank');
  };

  // Silence unused state warnings for build
  void loading;
  void loadingDetails;
  void isEditingPixKey;
  void handleSavePixKey;
  void handleSendPixOnly;
  void lastUsedDate;
  void selectedMonth;

  const handleSettleDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || settling) return;

    setSettling(true);
    try {
      const parsedAmount = settleAmount.trim() ? parseMathExpression(settleAmount) : undefined;
      const { data } = await api.post(`/pos/on-credit/debts/${selectedStudent.student_id}/pay`, {
        paymentMethod,
        amount: parsedAmount,
        date: settleDate,
      });

      const totalPaid = data?.data?.totalSettled || (parsedAmount || selectedStudent.total_debt);
      const isPartial = parsedAmount && parsedAmount < selectedStudent.total_debt;

      showToast(isPartial
        ? `Abatimento de R$ ${totalPaid.toFixed(2)} registrado com sucesso!`
        : 'Débito quitado com sucesso!', 'success'
      );
      setIsSettleModalOpen(false);
      setSelectedStudent(null);
      setDetails([]);
      setSettleAmount('');
      loadDebts();
    } catch (err: any) {
      console.error('Error settling debt:', err);
      showToast(err.response?.data?.error?.message || 'Erro ao processar recebimento.', 'error');
    } finally {
      setSettling(false);
    }
  };

  // Autocomplete for manual debt launch
  useEffect(() => {
    if (manualStudentSearch.trim().length < 2) {
      setManualStudentResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await studentsApi.search(manualStudentSearch.trim());
        setManualStudentResults(data.data?.data || []);
      } catch (err) {
        console.error('Erro buscando alunos:', err);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [manualStudentSearch]);

  const handleSaveManualDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManualStudent || savingManual) return;
    const amountNum = parseMathExpression(manualAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast('Informe um valor ou expressão de soma válida (ex: 9+8+2).', 'error');
      return;
    }

    setSavingManual(true);
    try {
      await posApi.createManualOnCredit({
        studentId: selectedManualStudent.id,
        amount: amountNum,
        date: manualDate ? new Date(manualDate + 'T12:00:00').toISOString() : undefined,
        description: manualDescription.trim() || 'Lançamento Manual (Ficha a Prazo)',
      });
      const targetStudent = selectedStudent || {
        student_id: selectedManualStudent.id,
        student_name: selectedManualStudent.name,
        grade: selectedManualStudent.grade || '',
        class_group: selectedManualStudent.class_group || '',
        enrollment_number: selectedManualStudent.enrollment_number || '',
        total_debt: amountNum,
        balance: 0,
        last_purchase_at: new Date().toISOString()
      };
      localStorage.setItem('cantina-last-manual-date', manualDate);
      setLastUsedDate(manualDate);
      showToast('Venda a prazo lançada com sucesso!', 'success');
      setIsManualModalOpen(false);
      setSelectedManualStudent(null);
      setManualStudentSearch('');
      setManualAmount('');
      setManualDescription('');

      // Refresh debts & student details asynchronously in parallel
      Promise.all([
        loadDebts(),
        handleSelectStudent(targetStudent)
      ]).catch(console.error);
    } catch (err: any) {
      console.error('Erro ao lançar venda a prazo:', err);
      showToast(err.response?.data?.error?.message || 'Erro ao lançar venda a prazo.', 'error');
    } finally {
      setSavingManual(false);
    }
  };

  const handleOpenEditModal = (tx: DebtTransaction) => {
    setEditingTransaction(tx);
    setEditAmount(tx.amount.toString());
    setEditDate(tx.created_at ? new Date(tx.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    setEditDescription(tx.notes || tx.items[0]?.product_name || '');
  };

  const handleSaveEditTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction || savingEdit) return;

    const amountNum = parseMathExpression(editAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showToast('Informe um valor ou expressão de soma válida (ex: 9+8+2).', 'error');
      return;
    }

    setSavingEdit(true);
    try {
      await posApi.updateOnCreditTransaction(editingTransaction.id, {
        amount: amountNum,
        date: editDate ? new Date(editDate + 'T12:00:00').toISOString() : undefined,
        description: editDescription.trim() || undefined,
      });

      showToast('Lançamento a prazo atualizado com sucesso!', 'success');
      setEditingTransaction(null);
      if (selectedStudent) {
        handleSelectStudent(selectedStudent);
      }
      loadDebts();
    } catch (err: any) {
      console.error('Erro ao atualizar lançamento a prazo:', err);
      showToast(err.response?.data?.error?.message || 'Erro ao atualizar lançamento.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    if (!window.confirm('Tem certeza que deseja cancelar/apagar este lançamento a prazo? Esta ação reduzirá o valor pendente.')) {
      return;
    }
    setDeletingTxId(txId);
    try {
      await posApi.deleteOnCreditTransaction(txId);
      showToast('Lançamento apagado com sucesso!', 'success');
      if (selectedStudent) {
        handleSelectStudent(selectedStudent);
      }
      loadDebts();
    } catch (err: any) {
      console.error('Erro ao apagar lançamento:', err);
      showToast(err.response?.data?.error?.message || 'Erro ao apagar lançamento.', 'error');
    } finally {
      setDeletingTxId(null);
    }
  };

  void handleOpenEditModal;
  void handleDeleteTransaction;

  const handleSaveQuickStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentData.name.trim() || savingNewStudent) return;

    setSavingNewStudent(true);
    try {
      const isEmployee = newStudentData.type === 'employee';
      const gradeVal = isEmployee
        ? (newStudentData.jobRole.trim() || 'Funcionário')
        : (newStudentData.grade.trim() || 'Geral');
      const classGroupVal = isEmployee
        ? (newStudentData.jobRole.trim() || 'Funcionário')
        : (newStudentData.class_group.trim() || 'A');

      await studentsApi.create({
        type: isEmployee ? 'employee' : 'student',
        name: newStudentData.name.trim(),
        enrollmentNumber: newStudentData.enrollmentNumber.trim() || `${isEmployee ? 'FUNC' : 'MAT'}-${Date.now().toString().slice(-4)}`,
        grade: gradeVal,
        classGroup: classGroupVal,
        class_group: classGroupVal,
        guardianName: isEmployee ? undefined : (newStudentData.guardianName.trim() || undefined),
        guardianPhone: newStudentData.guardianPhone.trim() || undefined,
      });

      showToast(isEmployee ? 'Funcionário cadastrado com sucesso!' : 'Cliente cadastrado com sucesso!', 'success');
      setIsNewStudentModalOpen(false);
      setNewStudentData({
        type: 'student',
        name: '',
        enrollmentNumber: '',
        grade: '',
        class_group: '',
        jobRole: '',
        guardianName: '',
        guardianPhone: '',
      });
      loadDebts();
    } catch (err: any) {
      console.error('Erro ao cadastrar cliente:', err);
      showToast(err.response?.data?.error?.message || 'Erro ao cadastrar cliente.', 'error');
    } finally {
      setSavingNewStudent(false);
    }
  };

  const normalizeText = (str: string) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[º°]/g, '')
      .trim();

  // Apply type filters + search + sort
  const filtered = (() => {
    let list = debts.filter(d => {
      // Type filters
      const hasDiabet = d.total_debt > 0;
      const hasCredit = (d.balance || 0) > 0 && d.total_debt === 0;
      const isEmDia   = d.total_debt === 0 && (d.balance || 0) === 0;

      if (hasDiabet && !filterFiado)   return false;
      if (hasCredit && !filterCredito)  return false;
      if (isEmDia   && !filterEmDia)    return false;

      // Search text
      if (!search.trim()) return true;
      const term = normalizeText(search);
      const searchableText = normalizeText(`${d.student_name} ${d.grade} ${d.class_group} ${d.enrollment_number}`);
      
      if (searchableText.includes(term)) return true;
      const tokens = term.split(/\s+/).filter(Boolean);
      return tokens.every(token => searchableText.includes(token));
    });

    // Sort
    list = list.sort((a, b) => {
      if (sortBy === 'nome') {
        const cmp = a.student_name.localeCompare(b.student_name, 'pt-BR');
        return sortAsc ? cmp : -cmp;
      } else {
        const cmp = a.total_debt - b.total_debt;
        return sortAsc ? cmp : -cmp;
      }
    });

    return list;
  })();

  const grandTotalDebt = debts.reduce((sum, d) => sum + d.total_debt, 0);
  const totalCredits = debts.reduce((sum, d) => sum + (d.balance || 0), 0);

  return (
    <div className="on-credit-page animate-fadeIn">
      {/* 3 Main Crediario Tabs Bar (Prints 1, 3, 4) */}
      {!selectedStudent && (
        <div className="crediario-main-tabs">
          <button
            type="button"
            className={`crediario-tab-btn ${mainTab === 'resumo' ? 'active' : ''}`}
            onClick={() => setMainTab('resumo')}
          >
            <TrendingUp size={18} />
            <span>Vendas / Resumo</span>
          </button>
          <button
            type="button"
            className={`crediario-tab-btn ${mainTab === 'clientes' ? 'active' : ''}`}
            onClick={() => setMainTab('clientes')}
          >
            <Users size={18} />
            <span>Clientes A Prazo</span>
            {debts.length > 0 && <span className="tab-badge">{debts.length}</span>}
          </button>
          <button
            type="button"
            className={`crediario-tab-btn ${mainTab === 'cobrar' ? 'active' : ''}`}
            onClick={() => setMainTab('cobrar')}
          >
            <MessageSquare size={18} />
            <span>Cobrar A Prazo</span>
            {debts.filter(d => d.total_debt > 0).length > 0 && (
              <span className="tab-badge warning">{debts.filter(d => d.total_debt > 0).length}</span>
            )}
          </button>
        </div>
      )}

      {/* VIEW LEVEL 1: MAIN TABS (When NO student is selected) */}
      {!selectedStudent && (
        <>
          {/* TAB 1: VENDAS / RESUMO (Prints 1 e 2) */}
          {mainTab === 'resumo' && (
            <div className="animate-fadeIn">
              <div style={{ background: 'var(--bg-card, #ffffff)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color, #e2e8f0)', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>Olá, {user?.name || 'Operador'}</span>
                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main, #0f172a)', margin: 0 }}>
                      {formatCurrency(grandTotalDebt)}
                    </h2>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>Total a receber</span>
                  </div>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={loadDebts}
                    title="Atualizar balanço"
                    style={{ borderRadius: '50%', padding: '0.5rem' }}
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
              </div>

              {/* Entrada de Dinheiro Alert (Print 2) */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '12px', marginBottom: '1.25rem', display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                <div style={{ background: '#16a34a', color: '#ffffff', borderRadius: '8px', padding: '0.6rem', display: 'flex', alignItems: 'center' }}>
                  <DollarSign size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: '#166534', fontSize: '0.95rem' }}>Entrada de dinheiro & Balanço Ativo</strong>
                  <p style={{ fontSize: '0.8rem', color: '#15803d', margin: 0 }}>Recalculo e abate automático ativado. Lançamentos manuais salvam em ~20ms.</p>
                </div>
              </div>

              {/* Ações do Crediário Inteligente */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setIsPrintableSheetModalOpen(true)}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
                    cursor: 'pointer'
                  }}
                >
                  <Printer size={18} /> 🖨️ Folha Impressa (QR Code)
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={() => setIsCameraScannerModalOpen(true)}
                  style={{
                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
                    cursor: 'pointer'
                  }}
                >
                  <Camera size={18} /> 📷 Escanear Câmera / Folha
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={handleOpenBatchModal}
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                    cursor: 'pointer'
                  }}
                >
                  <ListChecks size={18} /> Lançamento em Lote Rápido
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={() => navigate('/admin/fiado-scanner')}
                  style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.25)',
                    cursor: 'pointer'
                  }}
                >
                  <Share2 size={18} /> 🖥️ Página Dedicada QR
                </button>
              </div>

              {/* Recent Purchases Section (Print 1 & 2) */}
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShoppingBag size={18} style={{ color: '#16a34a' }} /> Vendas / Consumos recentes
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                  {filtered.slice(0, 8).map(d => (
                    <div key={d.student_id} onClick={() => handleSelectStudent(d)} style={{ background: 'var(--bg-card, #ffffff)', padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', cursor: 'pointer' }}>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>{d.student_name}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {d.grade} {d.class_group}
                      </div>
                      <div style={{ fontSize: '1rem', color: d.total_debt > 0 ? '#ef4444' : '#16a34a', fontWeight: 800, marginTop: '0.35rem' }}>
                        {formatCurrency(d.total_debt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* FAB button */}
              <button
                className="crediario-fab"
                onClick={() => {
                  setIsManualModalOpen(true);
                  setSelectedManualStudent(null);
                  setManualStudentSearch('');
                  setManualAmount('');
                  setManualDescription('');
                }}
              >
                <DollarSign size={20} /> NOVA VENDA A PRAZO
              </button>
            </div>
          )}

          {/* TAB 2: CLIENTES A PRAZO (Print 3) */}
          {mainTab === 'clientes' && (
            <div className="animate-fadeIn">
              {/* Single Horizontal Scrollable Row with Invisible Scroll & Drag/Wheel Support */}
              <div
                ref={scrollRowRef}
                className="crediario-horizontal-scroll-row"
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onWheel={handleWheel}
              >
                {/* 1. Hoje */}
                <div className="summary-scroll-item">
                  <div className="crediario-pill yellow">
                    <span className="crediario-pill-val">{formatCurrency(totals.today_sales || 0)}</span>
                    <span className="crediario-pill-lbl">Hoje</span>
                  </div>
                </div>

                {/* 2. Total a receber / Vencida (logo após Hoje) */}
                <div className="summary-scroll-item">
                  <div className="crediario-pill red">
                    <span className="crediario-pill-val">{formatCurrency(grandTotalDebt)}</span>
                    <span className="crediario-pill-lbl">Total a receber</span>
                  </div>
                </div>

                {/* 3. Créditos */}
                <div className="summary-scroll-item">
                  <div className="crediario-pill green">
                    <span className="crediario-pill-val">{formatCurrency(totalCredits)}</span>
                    <span className="crediario-pill-lbl">Créditos</span>
                  </div>
                </div>

                {/* 4. Você já recebeu (Pílula Verde Padronizada) */}
                <div className="summary-scroll-item">
                  <div className="crediario-pill green">
                    <span className="crediario-pill-val">{formatCurrency(totals.total_received)}</span>
                    <span className="crediario-pill-lbl">Você já recebeu</span>
                  </div>
                </div>

                {/* 5. Você já vendeu (Pílula Vermelha Padronizada) */}
                <div className="summary-scroll-item">
                  <div className="crediario-pill red">
                    <span className="crediario-pill-val">{formatCurrency(totals.total_sold)}</span>
                    <span className="crediario-pill-lbl">Você já vendeu</span>
                  </div>
                </div>

                {/* 6. Total a receber (Pílula Cinza Padronizada) */}
                <div className="summary-scroll-item">
                  <div className="crediario-pill grey">
                    <span className="crediario-pill-val">{formatCurrency(grandTotalDebt)}</span>
                    <span className="crediario-pill-lbl">Total a receber</span>
                  </div>
                </div>

                {/* 7. Ícone de Ajuda (?) */}
                <div className="summary-scroll-item help-item">
                  <button type="button" className="help-btn" title="Ajuda sobre os balanços">
                    <HelpCircle size={22} />
                  </button>
                </div>
              </div>

              {/* Search Bar + Filter Toggle */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div className="page-search" style={{ flex: 1, margin: 0 }}>
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Buscar por nome, série (ex: 5º ano) ou parte do nome..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFilterPanel(p => !p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.55rem 0.9rem', borderRadius: '8px', border: '1px solid #e2e8f0',
                      background: showFilterPanel ? '#f0fdf4' : '#ffffff',
                      color: showFilterPanel ? '#16a34a' : '#475569',
                      fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                    Filtro
                  </button>
                </div>

                {/* Filter Panel */}
                {showFilterPanel && (
                  <div style={{ marginTop: '0.75rem', padding: '1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    {/* Type filters */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {/* Fiado */}
                      <button type="button" onClick={() => setFilterFiado(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '8px', border: `2px solid ${filterFiado ? '#fca5a5' : '#e2e8f0'}`, background: filterFiado ? '#fff0f0' : '#ffffff', cursor: 'pointer' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>Fiado</span>
                        <div style={{ width: 18, height: 18, borderRadius: '4px', background: filterFiado ? '#16a34a' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {filterFiado && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}
                        </div>
                      </button>
                      {/* Crédito */}
                      <button type="button" onClick={() => setFilterCredito(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '8px', border: `2px solid ${filterCredito ? '#86efac' : '#e2e8f0'}`, background: filterCredito ? '#f0fdf4' : '#ffffff', cursor: 'pointer' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>Crédito</span>
                        <div style={{ width: 18, height: 18, borderRadius: '4px', background: filterCredito ? '#16a34a' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {filterCredito && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}
                        </div>
                      </button>
                      {/* Em dia */}
                      <button type="button" onClick={() => setFilterEmDia(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '8px', border: `2px solid ${filterEmDia ? '#a5f3a5' : '#e2e8f0'}`, background: filterEmDia ? '#f0fff4' : '#ffffff', cursor: 'pointer' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>Em dia</span>
                        <div style={{ width: 18, height: 18, borderRadius: '4px', background: filterEmDia ? '#16a34a' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {filterEmDia && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}
                        </div>
                      </button>
                    </div>

                    {/* Sort options */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
                      <button
                        type="button"
                        onClick={() => setSortBy(s => s === 'preco' ? 'nome' : 'preco')}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.4rem',
                          padding: '0.4rem 0.8rem', borderRadius: '20px',
                          border: '1px solid #16a34a', background: '#f0fdf4',
                          color: '#16a34a', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer'
                        }}
                      >
                        {sortBy === 'preco'
                          ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg> Preço</>
                          : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h10M4 18h6"/></svg> Nome</>
                        }
                      </button>

                      <button
                        type="button"
                        onClick={() => setSortAsc(v => !v)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.4rem 0.8rem', borderRadius: '20px',
                          border: '1px solid #e2e8f0', background: '#ffffff',
                          color: '#475569', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer'
                        }}
                      >
                        {/* Toggle pill */}
                        <div style={{
                          width: 32, height: 18, borderRadius: '9px',
                          background: sortAsc ? '#16a34a' : '#cbd5e1',
                          position: 'relative', transition: 'background 0.2s'
                        }}>
                          <div style={{
                            position: 'absolute', top: 2,
                            left: sortAsc ? 16 : 2,
                            width: 14, height: 14, borderRadius: '50%',
                            background: '#ffffff', transition: 'left 0.2s'
                          }} />
                        </div>
                        {sortAsc ? 'Ascendente' : 'Descendente'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Cards */}
              <div className="debts-cards-grid">
                {filtered.map(d => {
                  const hasCredit = (d.balance || 0) > 0 && d.total_debt === 0;
                  return (
                    <div key={d.student_id} className="debt-student-card" onClick={() => handleSelectStudent(d)}>
                      <div
                        className="debt-card-avatar"
                        style={{
                          background: hasCredit ? '#dcfce7' : d.total_debt > 0 ? '#fee2e2' : '#e2e8f0',
                          color: hasCredit ? '#16a34a' : d.total_debt > 0 ? '#dc2626' : '#475569',
                          fontWeight: 800
                        }}
                      >
                        {d.student_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="debt-card-info">
                        <span className="debt-student-name" style={{ color: '#0f172a', fontWeight: 700 }}>{d.student_name}</span>
                        <span className="debt-student-meta" style={{ color: '#64748b' }}>
                          {d.grade} {d.class_group || 'Turma'} • Matrícula {d.enrollment_number}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {hasCredit ? (
                          <div style={{ textAlign: 'right' }}>
                            <div className="debt-card-amount" style={{ color: '#16a34a', fontWeight: 800 }}>
                              + {formatCurrency(d.balance || 0)}
                            </div>
                            <span style={{ fontSize: '0.725rem', color: '#15803d', fontWeight: 700, background: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>
                              Crédito Positivo
                            </span>
                          </div>
                        ) : (
                          <div className="debt-card-amount" style={{ color: d.total_debt > 0 ? '#ef4444' : '#16a34a', fontWeight: 800 }}>
                            {formatCurrency(d.total_debt)}
                          </div>
                        )}
                        <ChevronRight size={18} style={{ color: '#94a3b8' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* FAB button */}
              <button
                className="crediario-fab"
                onClick={() => setIsNewStudentModalOpen(true)}
              >
                <Plus size={20} /> ADICIONAR CLIENTE
              </button>
            </div>
          )}

          {/* TAB 3: COBRAR A PRAZO (Print 4) */}
          {mainTab === 'cobrar' && (
            <div className="animate-fadeIn">
              <div style={{ background: 'var(--bg-card, #ffffff)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color, #e2e8f0)', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Cobre dinheiro e receba mais rápido</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>Hoje é: {new Date().toLocaleDateString('pt-BR')}</p>
              </div>

              <div className="debts-cards-grid">
                {debts.filter(d => d.total_debt > 0).map(d => (
                  <div key={d.student_id} className="debt-student-card" style={{ flexDirection: 'column', alignItems: 'stretch' }} onClick={() => handleSelectStudent(d)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="debt-card-avatar" style={{ background: '#fee2e2', color: '#dc2626', fontWeight: 800 }}>
                          {d.student_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>{d.student_name}</strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{d.grade} {d.class_group}</div>
                        </div>
                      </div>
                      <div style={{ background: '#fee2e2', color: '#dc2626', fontWeight: 800, padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.9rem' }}>
                        {formatCurrency(d.total_debt)}
                      </div>
                    </div>

                    <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        style={{ borderColor: '#16a34a', color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectStudent(d);
                          handleSendWhatsApp();
                        }}
                      >
                        <Send size={14} /> Cobrar via WhatsApp
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* VIEW LEVEL 2: CUSTOMER DETAIL EXTRATO (Prints 5, 6, 7, 8, 9) */}
      {selectedStudent && (
        <div className="debt-details-panel" style={{ width: '100%', flex: 1, position: 'static' }}>
          <div className="details-content animate-fadeIn">
            {/* Header & Back Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setSelectedStudent(null)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.875rem', padding: '0.5rem 0.85rem', borderColor: '#16a34a', color: '#16a34a' }}
              >
                <ArrowLeft size={18} /> Voltar para a Busca
              </button>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                {selectedStudent.student_name}
              </h2>
            </div>

            {/* 6 Sub-tabs Header (Prints 5-9) */}
            <div className="customer-subtabs-nav">
              <button type="button" className={`customer-subtab-btn ${customerSubTab === 'info' ? 'active' : ''}`} onClick={() => setCustomerSubTab('info')}>
                <User size={16} /> Info
              </button>
              <button type="button" className={`customer-subtab-btn ${customerSubTab === 'vendas' ? 'active' : ''}`} onClick={() => setCustomerSubTab('vendas')}>
                <ShoppingBag size={16} /> Vendas ({details.filter(tx => !(tx as any).is_payment && tx.payment_status === 'pending').length})
              </button>
              <button type="button" className={`customer-subtab-btn ${customerSubTab === 'historico' ? 'active' : ''}`} onClick={() => setCustomerSubTab('historico')}>
                <History size={16} /> Histórico
              </button>
              <button type="button" className={`customer-subtab-btn ${customerSubTab === 'extrato' ? 'active' : ''}`} onClick={() => setCustomerSubTab('extrato')}>
                <Calculator size={16} /> Declaração
              </button>
              <button type="button" className="customer-subtab-btn" onClick={handleOpenBatchModal} title="Lançamento em Lote">
                <ListChecks size={16} /> Em Lote
              </button>
              <button type="button" className={`customer-subtab-btn ${customerSubTab === 'config' ? 'active' : ''}`} onClick={() => setCustomerSubTab('config')}>
                <Settings size={16} /> Configurações
              </button>
            </div>

            {/* Sub-tab 1: Info (Print 5) */}
            {customerSubTab === 'info' && (
              <div className="guardian-card animate-fadeIn">
                <h4 style={{ color: '#64748b' }}>Responsável & Contato</h4>
                {guardian.guardian_name ? (
                  <>
                    <p style={{ color: '#0f172a' }}><strong style={{ color: '#0f172a' }}>Nome:</strong> {guardian.guardian_name}</p>
                    <p style={{ color: '#0f172a' }}><strong style={{ color: '#0f172a' }}>WhatsApp:</strong> {guardian.guardian_phone || 'Não cadastrado'}</p>
                  </>
                ) : (
                  <p className="text-warning">⚠️ Nenhum responsável vinculado a este aluno.</p>
                )}
                <div style={{ marginTop: '1rem', padding: '0.85rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#475569', fontWeight: 600 }}>Total Devedor Pendente:</span>
                  <strong style={{ color: '#ef4444', fontSize: '1.2rem' }}>{formatCurrency(selectedStudent.total_debt)}</strong>
                </div>
              </div>
            )}

            {/* Sub-tab 2: Vendas / Consumos (Print 6) */}
            {customerSubTab === 'vendas' && (
              <div className="transactions-list animate-fadeIn">
                {(() => {
                  const pendingVendas = details.filter(tx => tx.payment_status === 'pending');
                  if (pendingVendas.length === 0) {
                    return (
                      <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#64748b', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', margin: '0.5rem 0' }}>
                        <ShoppingBag size={42} style={{ color: '#94a3b8', marginBottom: '0.5rem' }} />
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#334155' }}>Nenhum débito pendente registrado para este cliente.</p>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Utilize o botão "Vendi" na barra inferior para realizar um lançamento direto.</p>
                      </div>
                    );
                  }
                  return pendingVendas.map(tx => (
                    <div key={tx.id} className="tx-item-card" style={{ padding: '0.85rem', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '0.75rem', background: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0f172a' }}>{formatCurrency(tx.amount)}</span>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <span style={{ background: '#fef9c3', color: '#ca8a04', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>A Prazo</span>
                          <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>Pendente</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => handleOpenEditModal(tx)}
                            title="Editar este lançamento"
                            style={{ padding: '2px 6px', color: '#2563eb' }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => handleDeleteTransaction(tx.id)}
                            title="Apagar este lançamento"
                            style={{ padding: '2px 6px', color: '#ef4444' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                        {new Date(tx.created_at).toLocaleDateString('pt-BR')}
                      </div>
                      {tx.items.map((item, idx) => (
                        <div key={idx} style={{ fontSize: '0.875rem', marginTop: '0.35rem', fontWeight: 600, color: '#1e293b' }}>
                          1x {(item.product_name || '').replace(/Lançamento Manual/gi, 'Consumo na Cantina')}
                        </div>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Sub-tab 3: Histórico — Extrato com saldo corrido */}
            {customerSubTab === 'historico' && (
              <div className="animate-fadeIn">
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 56px', fontWeight: 700, fontSize: '0.75rem', color: '#475569', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.4rem', marginBottom: '0.4rem' }}>
                  <span>Registros</span>
                  <span style={{ color: '#ef4444', textAlign: 'right' }}>Fiados(−)</span>
                  <span style={{ color: '#16a34a', textAlign: 'right' }}>Pagamentos(+)</span>
                  <span style={{ textAlign: 'center' }}>Ações</span>
                </div>

                {details.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                    Nenhum movimento registrado.
                  </div>
                ) : (() => {
                  // Sort oldest -> newest to calculate running balance
                  const sorted = [...details].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                  let running = 0;
                  const withBalance = sorted.map(tx => {
                    const isPayment = (tx as any).is_payment || (tx as any).type === 'payment' || (tx.notes ? /^Recebimento|^Recarga|^Abatimento/i.test(tx.notes.trim()) : false);
                    const fiado = !isPayment ? tx.amount : 0;
                    const pagamento = isPayment ? tx.amount : 0;
                    running += pagamento - fiado;
                    return { ...tx, isPayment, fiado, pagamento, runningBalance: running };
                  });

                  // Display newest first
                  const displayed = [...withBalance].reverse();

                  let totalFiado = 0;
                  let totalPagamento = 0;

                  const rows = displayed.map((tx) => {
                    totalFiado += tx.fiado;
                    totalPagamento += tx.pagamento;
                    const bal = tx.runningBalance;
                    const isNeg = bal < 0;
                    const desc = (tx.items[0]?.product_name || tx.notes || 'Lançamento').replace(/Lançamento Manual/gi, 'Consumo');

                    return (
                      <div key={tx.id} style={{ borderBottom: '1px dashed #e2e8f0', padding: '0.6rem 0' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 56px', alignItems: 'center', fontSize: '0.82rem' }}>

                          {/* Col 1: Registros — Date, Running Balance Badge, Description */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span style={{ color: '#334155', fontSize: '0.78rem', fontWeight: 600 }}>
                              {new Date(tx.created_at).toLocaleDateString('pt-BR')}
                            </span>
                            {bal !== 0 ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  background: isNeg ? '#ef4444' : '#22c55e',
                                  color: '#ffffff',
                                  fontWeight: 700,
                                  fontSize: '0.72rem',
                                  padding: '1px 8px',
                                  borderRadius: '4px',
                                  width: 'fit-content'
                                }}
                              >
                                {formatCurrency(Math.abs(bal))}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                                R$ 0,00
                              </span>
                            )}
                            <span style={{ fontSize: '0.68rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }} title={desc}>
                              {desc}
                            </span>
                          </div>

                          {/* Col 2: Fiados(-) — ALWAYS red for sales/consumptions */}
                          <span style={{ color: tx.fiado > 0 ? '#ef4444' : '#94a3b8', fontWeight: tx.fiado > 0 ? 700 : 400, textAlign: 'right' }}>
                            {tx.fiado > 0 ? formatCurrency(tx.fiado) : '—'}
                          </span>

                          {/* Col 3: Pagamentos(+) — ALWAYS green for receipts/payments */}
                          <span style={{ color: tx.pagamento > 0 ? '#16a34a' : '#94a3b8', fontWeight: tx.pagamento > 0 ? 700 : 400, textAlign: 'right' }}>
                            {tx.pagamento > 0 ? formatCurrency(tx.pagamento) : '—'}
                          </span>

                          {/* Col 4: Ações (Edit & Delete) */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(tx)}
                              title="Editar este lançamento"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '2px' }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTransaction(tx.id)}
                              title="Apagar este lançamento"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  });

                  return (
                    <>
                      {rows}
                      {/* Totals footer */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 56px', padding: '0.6rem 0', borderTop: '2px solid #cbd5e1', marginTop: '0.3rem', fontSize: '0.82rem', fontWeight: 800 }}>
                        <span style={{ color: '#0f172a' }}>Total</span>
                        <span style={{ color: '#ef4444', textAlign: 'right' }}>{formatCurrency(totalFiado)}</span>
                        <span style={{ color: '#16a34a', textAlign: 'right' }}>{formatCurrency(totalPagamento)}</span>
                        <span></span>
                      </div>
                      {(() => {
                        const netBalance = totalPagamento - totalFiado;
                        const isCredit = netBalance > 0;
                        const isDebt = netBalance < 0;

                        return (
                          <div style={{ background: isDebt ? '#fee2e2' : isCredit ? '#dcfce7' : '#f1f5f9', borderRadius: '8px', padding: '0.65rem 0.85rem', marginTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
                              {isDebt ? 'Saldo devedor atual' : isCredit ? 'Saldo atual (Crédito Positivo)' : 'Saldo atual (Conta Zerada)'}
                            </span>
                            <strong style={{ fontSize: '1.05rem', color: isDebt ? '#ef4444' : isCredit ? '#16a34a' : '#475569' }}>
                              {formatCurrency(Math.abs(netBalance))}
                            </strong>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>
            )}


            {/* Sub-tab 4: Extrato Mensal (Print 8) */}
            {customerSubTab === 'extrato' && (
              <div className="animate-fadeIn">
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto' }}>
                  {['Maio 2026', 'Junho 2026', 'Julho 2026', 'Agosto 2026'].map(m => (
                    <button key={m} type="button" className={`btn btn-xs ${selectedMonth === m ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSelectedMonth(m)}>
                      {m}
                    </button>
                  ))}
                </div>
                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong>Saldo Total do Período:</strong>
                  <h3 style={{ fontSize: '1.5rem', color: '#16a34a', margin: '0.25rem 0 0 0' }}>{formatCurrency(selectedStudent.total_debt)}</h3>
                </div>
              </div>
            )}

            {/* Sub-tab 5: Configurações do Cliente (Print 9) */}
            {customerSubTab === 'config' && (
              <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong>{selectedStudent.student_name}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Matrícula: {selectedStudent.enrollment_number} • Turma: {selectedStudent.grade} {selectedStudent.class_group}
                  </div>
                </div>

                <button type="button" className="btn btn-outline" style={{ justifyContent: 'flex-start', gap: '0.5rem' }} onClick={() => handleSelectStudent(selectedStudent)}>
                  <RefreshCw size={16} /> Recalcular vendas e pagamentos
                </button>
              </div>
            )}

            {/* Persistent Bottom Action Bar (Prints 5-9) */}
            <div className="customer-detail-bottom-bar">
              <button type="button" className="btn btn-outline" onClick={handleSendWhatsApp}>
                <Share2 size={18} /> Extrato
              </button>
              <button type="button" className="btn btn-recebi" onClick={() => setIsSettleModalOpen(true)}>
                <DollarSign size={18} /> Recebi
              </button>
              <button type="button" className="btn btn-vendi" onClick={() => {
                setIsManualModalOpen(true);
                setSelectedManualStudent({ id: selectedStudent.student_id, name: selectedStudent.student_name });
              }}>
                <Store size={18} /> Vendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ADD STUDENT / EMPLOYEE MODAL (Print 3 FAB) */}
      {isNewStudentModalOpen && (
        <div className="modal-overlay animate-fadeIn">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3>{newStudentData.type === 'employee' ? 'Adicionar Novo Funcionário' : 'Adicionar Novo Cliente / Aluno'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setIsNewStudentModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Type Selector (Aluno vs Funcionário) */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', background: 'var(--bg-input, #f1f5f9)', padding: '4px', borderRadius: '8px' }}>
              <button
                type="button"
                className={`btn btn-sm ${newStudentData.type === 'student' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1, borderRadius: '6px', fontSize: '13px' }}
                onClick={() => setNewStudentData({ ...newStudentData, type: 'student' })}
              >
                👤 Aluno / Cliente
              </button>
              <button
                type="button"
                className={`btn btn-sm ${newStudentData.type === 'employee' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1, borderRadius: '6px', fontSize: '13px' }}
                onClick={() => setNewStudentData({ ...newStudentData, type: 'employee' })}
              >
                💼 Funcionário
              </button>
            </div>

            <form onSubmit={handleSaveQuickStudent}>
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label>{newStudentData.type === 'employee' ? 'Nome do Funcionário *' : 'Nome do Aluno / Cliente *'}</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder={newStudentData.type === 'employee' ? 'Ex: Maria Oliveira' : 'Ex: João Silva'}
                  value={newStudentData.name}
                  onChange={(e) => setNewStudentData({ ...newStudentData, name: e.target.value })}
                />
              </div>

              {newStudentData.type === 'student' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div className="form-group">
                      <label>Série / Ano</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Ex: 5º Ano"
                        value={newStudentData.grade}
                        onChange={(e) => setNewStudentData({ ...newStudentData, grade: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Turma</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Ex: A"
                        value={newStudentData.class_group}
                        onChange={(e) => setNewStudentData({ ...newStudentData, class_group: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label>Nome do Responsável (Pai/Mãe)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ex: Carlos Silva"
                      value={newStudentData.guardianName}
                      onChange={(e) => setNewStudentData({ ...newStudentData, guardianName: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>WhatsApp do Responsável</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ex: (11) 99999-9999"
                      value={newStudentData.guardianPhone}
                      onChange={(e) => setNewStudentData({ ...newStudentData, guardianPhone: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label>Função / Cargo (Setor / Departamento) *</label>
                    <input
                      type="text"
                      className="input"
                      required
                      placeholder="Ex: Professor(a), Cozinha, Secretaria, Direção, TI"
                      value={newStudentData.jobRole}
                      onChange={(e) => setNewStudentData({ ...newStudentData, jobRole: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>WhatsApp do Funcionário</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ex: (11) 99999-9999"
                      value={newStudentData.guardianPhone}
                      onChange={(e) => setNewStudentData({ ...newStudentData, guardianPhone: e.target.value })}
                    />
                  </div>
                </>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setIsNewStudentModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-success" disabled={savingNewStudent}>
                  {savingNewStudent ? 'Salvando...' : newStudentData.type === 'employee' ? 'Salvar Funcionário' : 'Salvar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Debt Modal */}
      {isSettleModalOpen && selectedStudent && (
        <div className="modal-overlay">
          <div className="modal-content animate-zoomIn" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2>Quitar / Abater Débito</h2>
              <button type="button" className="btn-close" onClick={() => { setIsSettleModalOpen(false); setSettleAmount(''); }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSettleDebt}>
              <div className="modal-body">
                <p style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)' }}>
                  Aluno: <strong style={{ color: 'var(--color-text-primary)' }}>{selectedStudent.student_name}</strong><br />
                  Dívida Total Pendente: <strong style={{ color: '#ef4444', fontSize: '1.05rem' }}>{formatCurrency(selectedStudent.total_debt)}</strong>
                </p>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Valor a Receber / Abater (R$)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder={`Total: R$ ${selectedStudent.total_debt.toFixed(2)} (ou ex: 20+15)`}
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', fontSize: '1rem', fontWeight: 600 }}
                  />
                  {settleAmount.trim() !== '' && (
                    <div style={{ fontSize: '0.825rem', marginTop: '0.35rem', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>∑ Total a pagar:</span>
                      <span style={{ fontSize: '0.9rem', background: 'rgba(34, 197, 94, 0.15)', padding: '2px 8px', borderRadius: '4px', color: '#22c55e' }}>
                        {formatCurrency(parseMathExpression(settleAmount))}
                      </span>
                    </div>
                  )}
                  <small style={{ display: 'block', marginTop: '0.35rem', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                    Deixe em branco para quitar o total ({formatCurrency(selectedStudent.total_debt)}) ou digite o valor/expressão paga.
                  </small>
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Data do Recebimento *</label>
                  <input
                    type="date"
                    required
                    className="input"
                    style={{ cursor: 'pointer', width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', colorScheme: 'light dark' }}
                    value={settleDate}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    onChange={(e) => setSettleDate(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => setSettleDate(getTodayStr())}
                      style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#2563eb', fontWeight: 600, border: '1px solid #bfdbfe', borderRadius: '4px' }}
                    >
                      📅 Hoje
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => setSettleDate(getYesterdayStr())}
                      style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#2563eb', fontWeight: 600, border: '1px solid #bfdbfe', borderRadius: '4px' }}
                    >
                      📅 Ontem
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        const d2 = new Date();
                        d2.setDate(d2.getDate() - 2);
                        setSettleDate(d2.toISOString().split('T')[0]);
                      }}
                      style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                    >
                      📅 Anteontem
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Forma de Recebimento</label>
                  <select
                    className="input"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
                  >
                    <option value="pix">PIX (Confirmado manual)</option>
                    <option value="cash">Dinheiro físico</option>
                    <option value="debit_card">Cartão de Débito</option>
                    <option value="credit_card">Cartão de Crédito</option>
                  </select>
                </div>

                <div className="alert alert-warning" style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', background: '#fffbeb', border: '1px solid #fef3c7', padding: '0.75rem', borderRadius: '6px', color: '#b45309', fontSize: '0.85rem' }}>
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <span>Esta operação dará baixa em todas as fichas pendentes do aluno no sistema e registrará o valor no caixa aberto atual.</span>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsSettleModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={settling}>
                  {settling ? 'Confirmando...' : 'Confirmar Pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Lançar Venda a Prazo (Manual) */}
      {isManualModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content animate-zoomIn" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Lançar Venda a Prazo (Ficha/Fiado)</h2>
              <button type="button" className="btn-close" onClick={() => setIsManualModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveManualDebt}>
              <div className="modal-body">
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', background: 'var(--bg-body, rgba(255,255,255,0.05))', padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--border-color, rgba(255,255,255,0.1))' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{ flex: 1, fontWeight: 700 }}
                  >
                    1 Aluno (Individual)
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ flex: 1, background: '#16a34a', borderColor: '#16a34a', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                    onClick={() => {
                      setIsManualModalOpen(false);
                      handleOpenBatchModal();
                    }}
                  >
                    <ListChecks size={15} /> Lançar em Lote (Recorrentes)
                  </button>
                </div>

                <div style={{ background: 'rgba(59, 130, 246, 0.12)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)', marginBottom: '1rem', fontSize: '0.85rem', color: '#60a5fa' }}>
                  ℹ️ <strong>Nota:</strong> Lançamentos manuais de venda a prazo aumentam o débito do cliente sem afetar o caixa físico do dia.
                </div>


                <div className="form-group" style={{ position: 'relative' }}>
                  <label style={{ color: 'var(--color-text-primary, #f1f5f9)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Cliente (Aluno ou Funcionário) *</label>
                  {selectedManualStudent ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-input, #1e2130)', padding: '0.625rem 0.85rem', borderRadius: '8px', border: '1px solid var(--color-border, rgba(148, 163, 184, 0.2))' }}>
                      <div>
                        <strong style={{ color: 'var(--color-text-primary, #f1f5f9)', fontSize: '0.95rem' }}>{selectedManualStudent.name}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                          Matrícula/RE: {selectedManualStudent.enrollment_number} {selectedManualStudent.grade ? `• ${selectedManualStudent.grade}` : ''} {selectedManualStudent.type === 'employee' ? '• Funcionário' : '• Aluno'}
                        </div>
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedManualStudent(null)}>
                        Alterar
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        ref={manualSearchInputRef}
                        type="text"
                        className="input"
                        placeholder="Digite nome, matrícula, série ou cargo..."
                        value={manualStudentSearch}
                        onChange={(e) => setManualStudentSearch(e.target.value)}
                      />
                      {manualStudentResults.length > 0 && (
                        <ul style={{ background: 'var(--color-bg-card, #22252f)', border: '1px solid var(--color-border, rgba(148, 163, 184, 0.2))', borderRadius: '8px', marginTop: '6px', maxHeight: '200px', overflowY: 'auto', listStyle: 'none', padding: '4px', boxShadow: 'var(--shadow-lg)' }}>
                          {manualStudentResults.map((s) => (
                            <li
                              key={s.id}
                              style={{ padding: '0.625rem 0.75rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border, rgba(148, 163, 184, 0.08))' }}
                              onClick={() => {
                                setSelectedManualStudent(s);
                                setManualStudentResults([]);
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover, #323644)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                              <div>
                                <strong style={{ color: 'var(--color-text-primary, #f1f5f9)', fontSize: '0.875rem' }}>{s.name}</strong>
                                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                                  RE/Matrícula: {s.enrollment_number} {s.class_group ? `• ${s.class_group}` : ''} {(s.guardian_name || s.linked_guardian_names) ? ` • Resp: ${s.guardian_name || s.linked_guardian_names}` : ''}
                                </div>
                              </div>
                              <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: s.type === 'employee' ? 'rgba(109, 40, 217, 0.2)' : 'rgba(30, 64, 175, 0.2)', color: s.type === 'employee' ? '#c084fc' : '#60a5fa', fontWeight: 600 }}>
                                {s.type === 'employee' ? 'Funcionário' : 'Aluno'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label style={{ color: 'var(--color-text-primary, #f1f5f9)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Valor da Ficha / Consumo (R$) *</label>
                    <input
                      type="text"
                      required
                      className="input"
                      placeholder="Ex: 9+8+2 ou 15.50"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                    />
                    {manualAmount.trim() !== '' && (
                      <div style={{ fontSize: '0.825rem', marginTop: '0.35rem', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>∑ Soma calculada:</span>
                        <span style={{ fontSize: '0.9rem', background: 'rgba(34, 197, 94, 0.15)', padding: '2px 8px', borderRadius: '4px', color: '#22c55e' }}>
                          {formatCurrency(parseMathExpression(manualAmount))}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label style={{ color: 'var(--color-text-primary, #f1f5f9)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Data do Acontecimento *</label>
                    <input
                      type="date"
                      required
                      className="input"
                      style={{ cursor: 'pointer', width: '100%', colorScheme: 'light dark' }}
                      value={manualDate}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setManualDate(val);
                        setLastUsedDate(val);
                        localStorage.setItem('cantina-last-manual-date', val);
                      }}
                    />
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          setManualDate(today);
                          setLastUsedDate(today);
                          localStorage.setItem('cantina-last-manual-date', today);
                        }}
                        style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#2563eb', fontWeight: 600, border: '1px solid #bfdbfe', borderRadius: '4px' }}
                      >
                        📅 Hoje
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => {
                          const y = new Date();
                          y.setDate(y.getDate() - 1);
                          const yStr = y.toISOString().split('T')[0];
                          setManualDate(yStr);
                          setLastUsedDate(yStr);
                          localStorage.setItem('cantina-last-manual-date', yStr);
                        }}
                        style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#2563eb', fontWeight: 600, border: '1px solid #bfdbfe', borderRadius: '4px' }}
                      >
                        📅 Ontem
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => {
                          const d2 = new Date();
                          d2.setDate(d2.getDate() - 2);
                          const d2Str = d2.toISOString().split('T')[0];
                          setManualDate(d2Str);
                          setLastUsedDate(d2Str);
                          localStorage.setItem('cantina-last-manual-date', d2Str);
                        }}
                        style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                      >
                        📅 Anteontem
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label style={{ color: 'var(--color-text-primary, #f1f5f9)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Descrição / Nº da Ficha / Obs</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ex: Ficha #104 - Lanche da tarde"
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsManualModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingManual || !selectedManualStudent}>
                  {savingManual ? 'Lançando...' : 'Confirmar Lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Editar Lançamento a Prazo */}
      {editingTransaction && (
        <div className="modal-overlay">
          <div className="modal-content animate-zoomIn" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Editar Lançamento a Prazo</h2>
              <button type="button" className="btn-close" onClick={() => setEditingTransaction(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEditTransaction}>
              <div className="modal-body">
                <div className="form-group">
                  <label style={{ color: 'var(--color-text-primary, #f1f5f9)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Valor da Ficha / Consumo (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Ex: 9+8+2 ou 15.50"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                  />
                  {editAmount.trim() !== '' && (
                    <div style={{ fontSize: '0.825rem', marginTop: '0.35rem', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>∑ Soma calculada:</span>
                      <span style={{ fontSize: '0.9rem', background: 'rgba(34, 197, 94, 0.15)', padding: '2px 8px', borderRadius: '4px', color: '#22c55e' }}>
                        {formatCurrency(parseMathExpression(editAmount))}
                      </span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label style={{ color: 'var(--color-text-primary, #f1f5f9)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Data do Consumo / Ficha *
                  </label>
                  <input
                    type="date"
                    required
                    className="input"
                    style={{ cursor: 'pointer', width: '100%', colorScheme: 'light dark' }}
                    value={editDate}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label style={{ color: 'var(--color-text-primary, #f1f5f9)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                    Descrição / Nº da Ficha / Observação
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ex: Ficha #104 - Lanche da tarde"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEditingTransaction(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                  {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lançamento em Lote */}
      {isBatchModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content animate-zoomIn batch-modal-content" style={{ maxWidth: '780px', width: '92vw' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ListChecks size={22} style={{ color: '#16a34a' }} />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Lançamento em Lote (Baseado em Dias Anteriores)</h2>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
                    Escolha a data dos lançamentos de origem para carregar quem consumiu e lançar em massa.
                  </p>
                </div>
              </div>
              <button type="button" className="btn-close" onClick={() => setIsBatchModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveBatchOnCredit}>
              <div className="modal-body" style={{ maxHeight: 'calc(75vh - 80px)', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {/* Reference Date Range & Target Launch Controls */}
                <div className="batch-config-grid">
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontWeight: 700, color: '#4ade80', display: 'block', marginBottom: '0.4rem' }}>
                      📅 Faixa de Data dos Lançamentos de Origem (Período)
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1, minWidth: '150px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600 }}>De:</span>
                        <input
                          type="date"
                          className="input"
                          style={{ border: '2px solid #16a34a', background: '#0f172a', color: '#ffffff', fontWeight: 800, fontSize: '0.9rem', width: '100%' }}
                          value={batchRefStartDate}
                          onChange={(e) => setBatchRefStartDate(e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1, minWidth: '150px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600 }}>Até:</span>
                        <input
                          type="date"
                          className="input"
                          style={{ border: '2px solid #16a34a', background: '#0f172a', color: '#ffffff', fontWeight: 800, fontSize: '0.9rem', width: '100%' }}
                          value={batchRefEndDate}
                          onChange={(e) => setBatchRefEndDate(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ borderColor: '#16a34a', color: '#4ade80', padding: '0.45rem 12px', fontWeight: 700, height: '38px', whiteSpace: 'nowrap' }}
                        onClick={() => loadBatchConsumers(batchRefStartDate, batchRefEndDate, batchDefaultPrice)}
                        title="Buscar clientes que consumiram nesta faixa de datas"
                      >
                        <RefreshCw size={15} /> Carregar Clientes
                      </button>
                    </div>
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontWeight: 700, color: '#f8fafc', display: 'block', marginBottom: '0.35rem' }}>Data do Novo Lançamento (Efetivo)</label>
                    <input
                      type="date"
                      required
                      className="input"
                      style={{ border: '1px solid #475569', background: '#0f172a', color: '#ffffff', fontWeight: 800, fontSize: '0.95rem' }}
                      value={batchLaunchDate}
                      onChange={(e) => setBatchLaunchDate(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '0.35rem' }}>Descrição do Lançamento</label>
                    <input
                      type="text"
                      className="input"
                      style={{ border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 600, fontSize: '0.95rem' }}
                      placeholder="Ex: Consumo diário (Ficha a Prazo)"
                      value={batchDescription}
                      onChange={(e) => setBatchDescription(e.target.value)}
                    />
                  </div>
                </div>

                {/* Bulk Price & Select Controls Toolbar */}
                <div className="batch-toolbar">
                  <div className="batch-toolbar-left">
                    <div className="bulk-price-input-group">
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>Valor Padrão:</span>
                      <input
                        type="text"
                        className="input input-sm"
                        style={{ width: '90px', fontWeight: 700, background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1' }}
                        value={batchDefaultPrice}
                        placeholder="10"
                        onChange={(e) => setBatchDefaultPrice(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleApplyDefaultPriceToAll}
                        style={{ fontSize: '0.8rem' }}
                      >
                        Aplicar nos Marcados
                      </button>
                    </div>
                  </div>

                  <div className="batch-toolbar-right">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleSelectAllBatch(true)}
                      style={{ gap: '4px', fontSize: '0.8rem' }}
                    >
                      <CheckSquare size={14} /> Selecionar Todos
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleSelectAllBatch(false)}
                      style={{ gap: '4px', fontSize: '0.8rem' }}
                    >
                      <Square size={14} /> Desmarcar Todos
                    </button>
                  </div>
                </div>

                {/* Internal Search */}
                <div className="page-search" style={{ marginBottom: '0.75rem' }}>
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Filtrar aluno na checklist..."
                    value={batchSearch}
                    onChange={(e) => setBatchSearch(e.target.value)}
                  />
                </div>

                {/* Checklist Table / List */}
                {loadingBatchConsumers ? (
                  <div className="panel-loading">Buscando consumidores recorrentes...</div>
                ) : filteredBatchConsumers.length === 0 ? (
                  <div className="panel-empty">Nenhum cliente encontrado para esta data de referência.</div>
                ) : (
                  <div className="batch-checklist">
                    {filteredBatchConsumers.map((c) => (
                      <div
                        key={c.student_id}
                        className={`batch-checklist-item ${c.selected ? 'active' : ''}`}
                      >
                        <div
                          className="batch-item-checkbox"
                          onClick={() => handleToggleConsumer(c.student_id)}
                        >
                          <input
                            type="checkbox"
                            checked={c.selected}
                            onChange={() => {}}
                          />
                        </div>

                        <div
                          className="batch-item-info"
                          onClick={() => handleToggleConsumer(c.student_id)}
                        >
                          <span className="batch-student-name">{c.student_name}</span>
                          <span className="batch-student-meta">
                            {c.grade} {c.class_group} • Matrícula {c.enrollment_number}
                          </span>
                          {c.yesterday_amount > 0 && (
                            <span className="batch-yesterday-tag">
                              Ontem: {formatCurrency(c.yesterday_amount)}
                            </span>
                          )}
                        </div>

                        <div className="batch-item-price">
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>Valor R$</label>
                          <input
                            type="text"
                            className="input input-sm"
                            style={{ width: '90px', fontWeight: 600, textAlign: 'right' }}
                            value={c.amountInput}
                            disabled={!c.selected}
                            onChange={(e) => handleConsumerAmountChange(c.student_id, e.target.value)}
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.9rem' }}>
                  <strong>{selectedBatchCount}</strong> selecionados | Total: <strong className="text-danger" style={{ fontSize: '1.05rem' }}>{formatCurrency(grandTotalBatch)}</strong>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setIsBatchModalOpen(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingBatch || selectedBatchCount === 0}>
                    {savingBatch ? 'Lançando...' : `Confirmar (${selectedBatchCount})`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal da Folha Impressa A4 com QR Code */}
      <PrintableSheetModal
        isOpen={isPrintableSheetModalOpen}
        onClose={() => setIsPrintableSheetModalOpen(false)}
        students={debts}
      />

      {/* Modal do Scanner de Câmera & Leitor de QR Code */}
      <CameraQRScannerModal
        isOpen={isCameraScannerModalOpen}
        onClose={() => setIsCameraScannerModalOpen(false)}
        allStudents={debts}
        onConfirmBatch={handleConfirmCameraBatch}
      />
    </div>
  );
}
