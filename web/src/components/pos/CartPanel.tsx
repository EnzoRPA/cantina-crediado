import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, X } from 'lucide-react';
import { usePosStore } from '../../stores/posStore';
import './CartPanel.css';

interface Props {
  onCheckout: () => void;
  onClose?: () => void;
}

export default function CartPanel({ onCheckout, onClose }: Props) {
  const { items, updateQuantity, removeItem, totalAmount, totalItems } = usePosStore();

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="cart-panel">
      <div className="cart-header">
        <div className="cart-title">
          <ShoppingBag size={18} />
          <span>Carrinho</span>
          {totalItems() > 0 && (
            <span className="cart-count">{totalItems()}</span>
          )}
        </div>
        {onClose && (
          <button className="cart-close-btn mobile-only" onClick={onClose} title="Fechar Carrinho">
            <X size={20} />
          </button>
        )}
      </div>


      <div className="cart-items">
        {items.length === 0 ? (
          <div className="cart-empty">
            <ShoppingBag size={40} />
            <p>Carrinho vazio</p>
            <span>Toque nos produtos para adicionar</span>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.productId} className="cart-item animate-fadeIn">
              <div className="cart-item-info">
                <span className="cart-item-name">{item.name}</span>
                <span className="cart-item-price">
                  {formatCurrency(item.unitPrice)} cada
                </span>
              </div>

              <div className="cart-item-actions">
                <div className="cart-qty-controls">
                  <button
                    className="cart-qty-btn"
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                  >
                    <Minus size={14} />
                  </button>
                  <span className="cart-qty">{item.quantity}</span>
                  <button
                    className="cart-qty-btn"
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <span className="cart-item-total">
                  {formatCurrency(item.unitPrice * item.quantity)}
                </span>

                <button
                  className="cart-remove-btn"
                  onClick={() => removeItem(item.productId)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {items.length > 0 && (
        <div className="cart-footer">
          <div className="cart-total">
            <span>Total</span>
            <span className="cart-total-amount">{formatCurrency(totalAmount())}</span>
          </div>

          <button className="btn btn-primary btn-lg cart-checkout-btn" onClick={onCheckout}>
            Finalizar Venda
            <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
