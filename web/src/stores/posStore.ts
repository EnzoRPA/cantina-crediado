import { create } from 'zustand';

export interface CartItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  imageUrl?: string;
}

interface IdentifiedStudent {
  studentId: string;
  name: string;
  enrollmentNumber: string;
  balance: number;
  photoUrl?: string;
  method: 'card' | 'facial' | 'manual';
}

interface PosState {
  // Cart
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;

  // Student identification
  student: IdentifiedStudent | null;
  setStudent: (student: IdentifiedStudent | null) => void;

  // Cash register
  cashRegisterId: string | null;
  setCashRegisterId: (id: string | null) => void;

  // Computed
  totalAmount: () => number;
  totalItems: () => number;
}

export const usePosStore = create<PosState>((set, get) => ({
  items: [],
  student: null,
  cashRegisterId: null,

  addItem: (item) => {
    const items = get().items;
    const existing = items.find((i) => i.productId === item.productId);

    if (existing) {
      set({
        items: items.map((i) =>
          i.productId === item.productId
            ? { ...i, quantity: i.quantity + 1 }
            : i
        ),
      });
    } else {
      set({ items: [...items, { ...item, quantity: 1 }] });
    }
  },

  removeItem: (productId) => {
    set({ items: get().items.filter((i) => i.productId !== productId) });
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return;
    }
    set({
      items: get().items.map((i) =>
        i.productId === productId ? { ...i, quantity } : i
      ),
    });
  },

  clearCart: () => set({ items: [], student: null }),

  setStudent: (student) => set({ student }),
  setCashRegisterId: (id) => set({ cashRegisterId: id }),

  totalAmount: () =>
    get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),

  totalItems: () =>
    get().items.reduce((sum, item) => sum + item.quantity, 0),
}));
