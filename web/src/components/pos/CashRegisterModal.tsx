import { useState, useEffect } from 'react';
import { X, DollarSign, ArrowDownCircle, ArrowUpCircle, Loader2, Printer, Package } from 'lucide-react';
import { posApi } from '../../services/api';
import { usePosStore } from '../../stores/posStore';
import './CashRegisterModal.css';

interface Props {
  onClose: () => void;
}

export default function CashRegisterModal({ onClose }: Props) {
  const { cashRegisterId, setCashRegisterId } = usePosStore();
  const [openingBalance, setOpeningBalance] = useState('0');
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    if (cashRegisterId) {
      loadReport();
    }
  }, [cashRegisterId]);

  const loadReport = async () => {
    setReportLoading(true);
    try {
      const { data } = await posApi.getShiftReport();
      setReport(data.data.report);
    } catch (err: any) {
      console.error('Failed to load shift report:', err);
    } finally {
      setReportLoading(false);
    }
  };

  const handleOpen = async () => {
    setError('');
    setLoading(true);
    try {
      const { data } = await posApi.openCashRegister({
        openingBalance: parseFloat(openingBalance) || 0,
      });
      setCashRegisterId(data.data.register.id);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao abrir caixa');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    if (!window.confirm('Tem certeza que deseja encerrar e fechar este caixa?')) return;
    setError('');
    setLoading(true);
    try {
      await posApi.closeCashRegister();
      setCashRegisterId(null);
      alert('Caixa encerrado com sucesso!');
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao fechar caixa');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const translateMethod = (method: string) => {
    const map: Record<string, string> = {
      cash: 'Dinheiro',
      pix: 'PIX',
      debit_card: 'Cartão de Débito',
      credit_card: 'Cartão de Crédito',
      school_balance: 'Saldo Carteira',
      on_credit: 'A Prazo (Crediário)',
    };
    return map[method] || method;
  };

  // Movement state (Sangria / Suprimento)
  const [movementType, setMovementType] = useState<'sangria' | 'suprimento' | null>(null);
  const [movementAmount, setMovementAmount] = useState('');
  const [movementDesc, setMovementDesc] = useState('');
  const [movementLoading, setMovementLoading] = useState(false);

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementType || !movementAmount) return;

    setMovementLoading(true);
    try {
      await posApi.addMovement({
        type: movementType,
        amount: parseFloat(movementAmount),
        description: movementDesc || (movementType === 'sangria' ? 'Retirada de caixa' : 'Reforço de troco')
      });
      alert(`${movementType === 'sangria' ? 'Sangria (retirada)' : 'Suprimento (entrada)'} de R$ ${parseFloat(movementAmount).toFixed(2)} realizada com sucesso!`);
      setMovementType(null);
      setMovementAmount('');
      setMovementDesc('');
      loadReport();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao registrar movimentação');
    } finally {
      setMovementLoading(false);
    }
  };

  // Calculations from report
  const openingVal = Number(report?.register?.opening_balance || 0);
  
  // Sales by method
  const payments: any[] = report?.paymentBreakdown || [];
  const cashSales = Number(payments.find(p => p.payment_method === 'cash')?.total || 0);
  const totalSalesAll = payments.reduce((sum, p) => sum + Number(p.total || 0), 0);

  // Cash movements
  const movements: any[] = report?.cashMovements || [];
  const sangriaTotal = Number(movements.find(m => m.type === 'sangria')?.total || 0);
  const suprimentoTotal = Number(movements.find(m => m.type === 'suprimento')?.total || 0);

  // Expected drawer balance
  const expectedDrawer = openingVal + cashSales + suprimentoTotal - sangriaTotal;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cashreg-modal animate-scaleIn" style={{ maxWidth: cashRegisterId ? '600px' : '440px' }}>
        <div className="cashreg-header">
          <div className="cashreg-title">
            <DollarSign size={20} />
            <h2>{cashRegisterId ? 'Relatório de Fechamento de Caixa' : 'Abertura de Caixa'}</h2>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {error && <div className="payment-error animate-fadeIn">{error}</div>}

        {!cashRegisterId ? (
          <div className="cashreg-open">
            <div className="cashreg-icon-container">
              <ArrowUpCircle size={48} />
            </div>
            <h3>Abrir Caixa</h3>
            <p>Informe o valor de abertura para iniciar as vendas.</p>

            <div className="cashreg-field">
              <label>Saldo Inicial (R$)</label>
              <input
                type="number"
                className="input cashreg-input"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                min="0"
                step="0.01"
                autoFocus
              />
            </div>

            <button
              className="btn btn-primary btn-lg cashreg-action-btn"
              onClick={handleOpen}
              disabled={loading}
            >
              {loading ? <Loader2 size={20} className="spin" /> : 'Abrir Caixa'}
            </button>
          </div>
        ) : (
          <div className="cashreg-close">
            <div className="cashreg-status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span className="badge badge-success" style={{ fontSize: '0.85rem' }}>● Caixa Aberto</span>
              {report?.register?.opened_at && (
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Aberto em {new Date(report.register.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {reportLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                <Loader2 size={28} className="spin" style={{ marginBottom: '0.5rem' }} />
                <p>Carregando resumo do caixa...</p>
              </div>
            ) : (
              <div className="shift-report-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Drawer Summary Box */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.75rem', fontWeight: 700 }}>
                    Conferência da Gaveta (Dinheiro Físico)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
                    <div><span>Saldo Inicial:</span> <strong>{formatCurrency(openingVal)}</strong></div>
                    <div><span>Vendas em Dinheiro:</span> <strong>{formatCurrency(cashSales)}</strong></div>
                    <div><span>Suprimentos:</span> <strong style={{ color: '#16a34a' }}>+ {formatCurrency(suprimentoTotal)}</strong></div>
                    <div><span>Sangrias:</span> <strong style={{ color: '#dc2626' }}>- {formatCurrency(sangriaTotal)}</strong></div>
                  </div>
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>Dinheiro Esperado na Gaveta:</span>
                    <strong style={{ fontSize: '1.35rem', color: '#2563eb' }}>{formatCurrency(expectedDrawer)}</strong>
                  </div>

                  {/* Sangria and Suprimento Action Buttons */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ flex: 1, borderColor: '#dc2626', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '6px 8px' }}
                      onClick={() => { setMovementType('sangria'); setMovementAmount(''); setMovementDesc(''); }}
                    >
                      <ArrowDownCircle size={15} /> Retirar Dinheiro (Sangria)
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ flex: 1, borderColor: '#16a34a', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '6px 8px' }}
                      onClick={() => { setMovementType('suprimento'); setMovementAmount(''); setMovementDesc(''); }}
                    >
                      <ArrowUpCircle size={15} /> Colocar Dinheiro (Suprimento)
                    </button>
                  </div>

                  {/* Inline Movement Form */}
                  {movementType && (
                    <div style={{ background: '#ffffff', border: `2px solid ${movementType === 'sangria' ? '#dc2626' : '#16a34a'}`, borderRadius: '8px', padding: '0.85rem', marginTop: '0.85rem' }}>
                      <h5 style={{ margin: '0 0 0.6rem 0', fontSize: '0.88rem', color: movementType === 'sangria' ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                        {movementType === 'sangria' ? '🔻 Registrar Sangria (Retirada do Caixa)' : '🔺 Registrar Suprimento (Entrada de Dinheiro)'}
                      </h5>
                      <form onSubmit={handleAddMovement} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Valor (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            className="input"
                            placeholder="0.00"
                            value={movementAmount}
                            onChange={(e) => setMovementAmount(e.target.value)}
                            required
                            autoFocus
                            style={{ width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.95rem', fontWeight: 600 }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '2px' }}>Motivo / Observação</label>
                          <input
                            type="text"
                            className="input"
                            placeholder={movementType === 'sangria' ? 'Ex: Retirada para pagamento, troco externo...' : 'Ex: Reforço de moedas para troco...'}
                            value={movementDesc}
                            onChange={(e) => setMovementDesc(e.target.value)}
                            style={{ width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMovementType(null)}>
                            Cancelar
                          </button>
                          <button type="submit" className={`btn btn-sm ${movementType === 'sangria' ? 'btn-danger' : 'btn-primary'}`} disabled={movementLoading}>
                            {movementLoading ? 'Gravando...' : (movementType === 'sangria' ? 'Confirmar Retirada' : 'Confirmar Entrada')}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>

                {/* Sales by Payment Method */}
                <div>
                  <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.5rem', fontWeight: 700 }}>
                    Vendas por Forma de Pagamento (Total: {formatCurrency(totalSalesAll)})
                  </h4>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    {payments.length === 0 ? (
                      <p style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', margin: 0 }}>Nenhuma venda neste turno.</p>
                    ) : (
                      payments.map((p, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.85rem', borderBottom: idx < payments.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: '0.875rem' }}>
                          <span>{translateMethod(p.payment_method)} ({p.count}x)</span>
                          <strong>{formatCurrency(Number(p.total))}</strong>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Top Products */}
                {report?.topProducts && report.topProducts.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b', marginBottom: '0.5rem', fontWeight: 700 }}>
                      <Package size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                      Produtos / Fichas Mais Vendidas no Turno
                    </h4>
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}>
                      {report.topProducts.slice(0, 5).map((prod: any, idx: number) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
                          <span>{prod.total_quantity}x {prod.product_name}</span>
                          <span style={{ color: '#64748b' }}>{formatCurrency(Number(prod.total_revenue))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={() => window.print()}
                  >
                    <Printer size={16} /> Imprimir Relatório
                  </button>

                  <button
                    className="btn btn-danger"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={handleClose}
                    disabled={loading}
                  >
                    {loading ? <Loader2 size={18} className="spin" /> : (
                      <>
                        <ArrowDownCircle size={18} />
                        Fechar Caixa
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
