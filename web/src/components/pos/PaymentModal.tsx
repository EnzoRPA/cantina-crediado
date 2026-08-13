import { useState } from 'react';
import { X, Banknote, CreditCard, QrCode, Wallet, Check, Loader2, Clock } from 'lucide-react';
import { usePosStore } from '../../stores/posStore';
import { posApi, paymentsApi } from '../../services/api';
import './PaymentModal.css';

interface Props {
  onClose: () => void;
}

type PaymentMethod = 'cash' | 'pix' | 'debit_card' | 'credit_card' | 'school_balance' | 'pix_credit' | 'on_credit';

export default function PaymentModal({ onClose }: Props) {
  const { items, student, totalAmount, clearCart } = usePosStore();
  const total = totalAmount();

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [error, setError] = useState('');

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const change = Math.max(0, (parseFloat(cashReceived) || 0) - total);

  const paymentMethods: { key: PaymentMethod; label: string; icon: typeof Banknote; disabled?: boolean }[] = [
    { key: 'cash', label: 'Dinheiro', icon: Banknote },
    { key: 'pix', label: 'PIX', icon: QrCode },
    { key: 'debit_card', label: 'Débito', icon: CreditCard },
    { key: 'credit_card', label: 'Crédito', icon: CreditCard },
    { key: 'school_balance', label: 'Saldo', icon: Wallet, disabled: !student },
    { key: 'pix_credit', label: 'Pix a Distância', icon: Wallet, disabled: !student },
    { key: 'on_credit', label: 'A Prazo', icon: Clock, disabled: !student },
  ];

  const handleFinalize = async () => {
    setError('');
    setLoading(true);

    try {
      const transactionData = {
        studentId: student?.studentId || undefined,
        identificationMethod: student?.method || undefined,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          name: i.name,
        })),
        payments: [{
          paymentMethod: selectedMethod === 'pix_credit' ? 'pix' : selectedMethod,
          amount: total,
        }],
        notes: selectedMethod === 'pix_credit' ? 'Pix Fiado' : undefined,
      };

      const { data } = await posApi.createTransaction(transactionData);
      setReceiptData(data.data.transaction);
      setSuccess(true);

      // If PIX or Pix Fiado, generate QR code
      if ((selectedMethod === 'pix' || selectedMethod === 'pix_credit') && data.data.transaction.id) {
        try {
          const pixData = await paymentsApi.createPix({
            transactionId: data.data.transaction.id,
            amount: total,
          });
          setReceiptData((prev: any) => ({ ...prev, pix: pixData.data.data }));
        } catch (err) {
          console.warn('PIX QR generation failed:', err);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao processar venda');
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    clearCart();
    onClose();
  };

  const quickCashValues = [5, 10, 20, 50, 100];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !success && onClose()}>
      <div className="payment-modal animate-scaleIn">
        {!success ? (
          <>
            <div className="payment-header">
              <h2>Finalizar Venda</h2>
              <button className="btn btn-ghost btn-icon" onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            <div className="payment-total">
              <span>Total a Pagar</span>
              <span className="payment-total-value">{formatCurrency(total)}</span>
            </div>

            {error && (
              <div className="payment-error animate-fadeIn">{error}</div>
            )}

            <div className="payment-methods">
              {paymentMethods.map(({ key, label, icon: Icon, disabled }) => (
                <button
                  key={key}
                  className={`payment-method-btn ${selectedMethod === key ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                  onClick={() => !disabled && setSelectedMethod(key)}
                  disabled={disabled}
                  title={disabled ? 'Identifique um aluno para habilitar este método' : undefined}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {selectedMethod === 'cash' && (
              <div className="payment-cash animate-fadeIn">
                <label>Valor Recebido</label>
                <input
                  type="number"
                  className="input payment-cash-input"
                  placeholder="0.00"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  autoFocus
                />
                <div className="payment-quick-values">
                  {quickCashValues.map((val) => (
                    <button
                      key={val}
                      className="btn btn-secondary btn-sm"
                      onClick={() => setCashReceived(String(val))}
                    >
                      R$ {val}
                    </button>
                  ))}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setCashReceived(String(total))}
                  >
                    Exato
                  </button>
                </div>
                {parseFloat(cashReceived) > 0 && (
                  <div className="payment-change">
                    <span>Troco:</span>
                    <span className="payment-change-value">{formatCurrency(change)}</span>
                  </div>
                )}
              </div>
            )}

            {selectedMethod === 'school_balance' && student && (
              <div className="payment-balance-info animate-fadeIn">
                <div className="payment-balance-row">
                  <span>Saldo Atual:</span>
                  <span>{formatCurrency(student.balance)}</span>
                </div>
                <div className="payment-balance-row">
                  <span>Após Compra:</span>
                  <span className={student.balance - total < 0 ? 'text-danger' : ''}>
                    {formatCurrency(student.balance - total)}
                  </span>
                </div>
                {student.balance < total && (
                  <div className="payment-error">Saldo insuficiente!</div>
                )}
              </div>
            )}

            {selectedMethod === 'pix' && (
              <div className="payment-pix-info animate-fadeIn">
                <p>Um QR Code PIX será gerado após confirmar a venda.</p>
              </div>
            )}

            {selectedMethod === 'pix_credit' && (
              <div className="payment-pix-info animate-fadeIn">
                <p>A venda será registrada como <strong>Pix a Distância</strong>.</p>
                <p>Um link de pagamento da InfinitePay e mensagem de WhatsApp serão gerados para o responsável do aluno.</p>
              </div>
            )}

            <button
              className="btn btn-primary btn-lg payment-confirm-btn"
              onClick={handleFinalize}
              disabled={
                loading ||
                (selectedMethod === 'cash' && (!cashReceived || parseFloat(cashReceived) < total)) ||
                (selectedMethod === 'school_balance' && (!student || student.balance < total))
              }
            >
              {loading ? (
                <Loader2 size={20} className="spin" />
              ) : (
                <>
                  <Check size={18} />
                  Confirmar Venda — {formatCurrency(total)}
                </>
              )}
            </button>
          </>
        ) : (
          <div className="payment-success animate-scaleIn">
            <div className="payment-success-icon">
              <Check size={48} />
            </div>
            <h2>Venda Realizada!</h2>
            <p className="payment-success-amount">{formatCurrency(total)}</p>

            {selectedMethod === 'cash' && parseFloat(cashReceived) > total && (
              <div className="payment-success-change">
                <span>Troco:</span>
                <span>{formatCurrency(change)}</span>
              </div>
            )}

            {selectedMethod === 'pix' && receiptData?.pix && (
              <div className="payment-pix-success animate-fadeIn" style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', textAlign: 'center' }}>
                <h4 style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#0f172a' }}>Pagamento PIX</h4>
                
                {receiptData.pix.qr_code_base64 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0.5rem 0' }}>
                    <img src={receiptData.pix.qr_code_base64} alt="QR Code Pix" style={{ width: '150px', height: '150px', borderRadius: '4px' }} />
                  </div>
                )}

                {receiptData.pix.qr_code && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Pix Copia e Cola:</p>
                    <textarea 
                      readOnly 
                      value={receiptData.pix.qr_code} 
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                      style={{ width: '100%', height: '60px', padding: '0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', resize: 'none' }}
                    />
                    <button 
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: '0.5rem', width: '100%' }}
                      onClick={() => {
                        navigator.clipboard.writeText(receiptData.pix.qr_code);
                        alert('Pix Copia e Cola copiado!');
                      }}
                    >
                      Copiar Código Pix
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedMethod === 'pix_credit' && receiptData && (
              <div className="payment-pix-credit-success animate-fadeIn" style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b' }}>
                <h4 style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#0f172a' }}>Cobrança Pix a Distância</h4>
                {receiptData.guardian_name ? (
                  <p style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}><strong>Responsável:</strong> {receiptData.guardian_name}</p>
                ) : null}
                {receiptData.guardian_phone ? (
                  <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}><strong>WhatsApp:</strong> {receiptData.guardian_phone}</p>
                ) : (
                  <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem', color: '#ef4444' }}>⚠️ Nenhum telefone de responsável cadastrado!</p>
                )}
                
                {receiptData.pix?.qr_code_base64 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0.5rem 0' }}>
                    <img src={receiptData.pix.qr_code_base64} alt="QR Code Pix" style={{ width: '120px', height: '120px', borderRadius: '4px' }} />
                  </div>
                )}

                {receiptData.pix?.ticket_url && (
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Link de Pagamento (InfinitePay):</p>
                    <input 
                      type="text"
                      readOnly 
                      value={receiptData.pix.ticket_url} 
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a' }}
                    />
                    <button 
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: '0.5rem', width: '100%' }}
                      onClick={() => {
                        navigator.clipboard.writeText(receiptData.pix.ticket_url);
                        alert('Link de Pagamento copiado!');
                      }}
                    >
                      Copiar Link de Pagamento
                    </button>
                  </div>
                )}

                {receiptData.pix?.qr_code && (
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>Pix Copia e Cola:</p>
                    <textarea 
                      readOnly 
                      value={receiptData.pix.qr_code} 
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                      style={{ width: '100%', height: '60px', padding: '0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', resize: 'none' }}
                    />
                    <button 
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: '0.5rem', width: '100%' }}
                      onClick={() => {
                        navigator.clipboard.writeText(receiptData.pix.qr_code);
                        alert('Pix Copia e Cola copiado!');
                      }}
                    >
                      Copiar Código Pix
                    </button>
                  </div>
                )}

                {receiptData.guardian_phone && (receiptData.pix?.ticket_url || receiptData.pix?.qr_code) && (
                  <button
                    className="btn"
                    style={{ width: '100%', background: '#25D366', color: '#ffffff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer' }}
                    onClick={() => {
                      const cleanPhone = receiptData.guardian_phone.replace(/\D/g, '');
                      const formattedPhone = cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone;
                      
                      const itemsText = items.map(i => `- ${i.quantity}x ${i.name} (${formatCurrency(i.unitPrice * i.quantity)})`).join('\n');
                      
                      const txDate = receiptData.created_at ? new Date(receiptData.created_at) : new Date();
                      const formattedDate = txDate.toLocaleDateString('pt-BR');
                      const formattedTime = txDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                      let messageText = '';
                      if (receiptData.pix.ticket_url) {
                        messageText = `Olá, ${receiptData.guardian_name || 'Responsável'}! Seu filho(a) *${student?.name}* consumiu na cantina em *${formattedDate} às ${formattedTime}* o valor total de *${formatCurrency(total)}*.\n\n*Itens consumidos:*\n${itemsText}\n\nPor favor, utilize o link de pagamento abaixo para realizar o pagamento via Pix ou Cartão:\n\n${receiptData.pix.ticket_url}\n\nObrigado!`;
                      } else {
                        messageText = `Olá, ${receiptData.guardian_name || 'Responsável'}! Seu filho(a) *${student?.name}* consumiu na cantina em *${formattedDate} às ${formattedTime}* o valor total de *${formatCurrency(total)}*.\n\n*Itens consumidos:*\n${itemsText}\n\n*Informações do Pix:*\nBeneficiário: Pollyanna Avelino Verzaro\nBanco: Nubank\n\nPor favor, utilize o Pix Copia e Cola abaixo para realizar o pagamento:\n\n${receiptData.pix.qr_code}\n\nObrigado!`;
                      }
                      
                      const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(messageText)}`;
                      window.open(url, '_blank');
                    }}
                  >
                    💬 Enviar Cobrança via WhatsApp
                  </button>
                )}
              </div>
            )}

            {selectedMethod === 'on_credit' && (
              <div className="payment-on-credit-success animate-fadeIn" style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', textAlign: 'center' }}>
                <h4 style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#0f172a' }}>Venda Registrada A Prazo</h4>
                <p style={{ fontSize: '0.875rem' }}>O valor de <strong>{formatCurrency(total)}</strong> foi adicionado ao débito do aluno <strong>{student?.name}</strong>.</p>
              </div>
            )}

            <button className="btn btn-primary btn-lg" onClick={handleDone} style={{ marginTop: '1rem' }}>
              Nova Venda
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
