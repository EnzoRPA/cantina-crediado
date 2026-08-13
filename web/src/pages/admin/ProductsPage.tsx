import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Package, AlertTriangle, X, Save } from 'lucide-react';
import axios from 'axios';
import { api } from '../../services/api';
import { getImageUrl } from '../../utils/url';
import './ProductsPage.css';

interface Product {
  id: string;
  name: string;
  sale_price: number;
  cost_price: number;
  current_stock: number;
  min_stock: number;
  category_id: string;
  is_active: boolean;
  unit: string;
  barcode: string;
  image_url: string | null;
  control_stock?: boolean;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    salePrice: '',
    costPrice: '',
    currentStock: '0',
    minStock: '5',
    barcode: '',
    unit: 'un',
    imageUrl: '',
    controlStock: true
  });

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    try {
      const { data } = await api.get('/products', { params: { limit: 100, isActive: true } });
      const items = data.data?.data || [];
      console.log('📦 Produtos carregados:', items);
      if (items.length > 0) {
        console.log('🔍 Exemplo de ID do primeiro produto:', items[0].id);
      }
      setProducts(items);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = () => {
    setEditingId(null);
    setSelectedImage(null);
    setImagePreview(null);
    setFormData({
      name: '', salePrice: '', costPrice: '',
      currentStock: '0', minStock: '5', barcode: '', unit: 'un',
      imageUrl: '', controlStock: true
    });
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingId(p.id);
    setSelectedImage(null);
    setImagePreview(getImageUrl(p.image_url));
    setFormData({
      name: p.name,
      salePrice: String(p.sale_price),
      cost_price: String(p.cost_price || 0),
      costPrice: String(p.cost_price || 0),
      currentStock: String(p.current_stock),
      minStock: String(p.min_stock),
      barcode: p.barcode || '',
      unit: p.unit || 'un',
      imageUrl: p.image_url || '',
      controlStock: p.control_stock !== undefined ? Boolean(p.control_stock) : true
    } as any);
    setIsModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        salePrice: Number(formData.salePrice),
        costPrice: Number((formData as any).cost_price || (formData as any).costPrice),
        currentStock: Number(formData.currentStock),
        minStock: Number(formData.minStock),
        barcode: formData.barcode,
        unit: formData.unit,
        controlStock: Boolean(formData.controlStock)
      };

      let productId = editingId;
      if (editingId) {
        await api.put(`/products/${editingId}`, payload);
      } else {
        const { data } = await api.post('/products', payload);
        productId = data.data.product.id;
      }

      // Upload image if selected
      if (selectedImage && productId) {
        const imgData = new FormData();
        imgData.append('image', selectedImage);

        console.log('Uploading image for product:', productId);
        const token = localStorage.getItem('accessToken');
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
        await axios.post(`${API_URL}/products/${productId}/image`, imgData, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }

      setIsModalOpen(false);
      loadProducts();
    } catch (err: any) {
      console.error('Error saving product:', err);
      const msg = err.response?.data?.error?.message || 'Erro ao salvar produto.';
      alert(`${msg} Verifique os dados e tente novamente.`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!id || id === 'null') {
      console.error('ID do produto está ausente:', { id, name });
      alert('Erro: Não foi possível identificar o produto para exclusão.');
      return;
    }

    if (window.confirm(`Deseja desativar o produto "${name}"? ele não aparecerá mais no estoque nem no PDV.`)) {
      try {
        await api.put(`/products/${id}`, { isActive: false });
        // Recarrega a lista para o produto sumir
        loadProducts();
      } catch (err) {
        console.error('Error inactivating product', err);
        alert('Erro ao desativar produto. Tente novamente.');
      }
    }
  };

  // Fix form matching state binding
  const changeField = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: val });
  };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.includes(search))
  );

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const stockStatus = (p: Product) => {
    if (p.control_stock === false) return 'ok';
    if (p.current_stock <= 0) return 'out';
    if (p.current_stock <= p.min_stock) return 'low';
    return 'ok';
  };

  return (
    <div className="products-page animate-fadeIn">
      <div className="page-header">
        <div>
          <h1>Produtos</h1>
          <p>{products.length} produtos cadastrados</p>
        </div>
        <button className="btn btn-primary" onClick={openNewModal}>
          <Plus size={18} /> Novo Produto
        </button>
      </div>

      <div className="page-toolbar">
        <div className="page-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Buscar por nome ou código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="page-loading">Carregando...</div>
      ) : (
        <div className="products-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Preço Venda</th>
                <th>Preço Custo</th>
                <th>Margem</th>
                <th>Estoque</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const margin = p.sale_price > 0
                  ? ((p.sale_price - (p.cost_price || 0)) / p.sale_price * 100).toFixed(0)
                  : '0';
                const status = stockStatus(p);

                return (
                  <tr key={p.id}>
                    <td>
                      <div className="prod-cell">
                        <div className="prod-img-wrap">
                          {p.image_url ? (
                            <img src={getImageUrl(p.image_url) || ''} alt={p.name} />
                          ) : (
                            <Package size={18} />
                          )}
                        </div>
                        <div>
                          <span className="prod-name">{p.name}</span>
                          <span className="prod-barcode">{p.barcode || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="td-price">{formatCurrency(Number(p.sale_price))}</td>
                    <td className="td-muted">{formatCurrency(Number(p.cost_price || 0))}</td>
                    <td>
                      <span className={`margin-badge ${Number(margin) >= 50 ? 'high' : Number(margin) >= 30 ? 'mid' : 'low'}`}>
                        {margin}%
                      </span>
                    </td>
                    <td>
                      <div className="stock-cell">
                        {status === 'low' && <AlertTriangle size={14} className="stock-warn" />}
                        <span className={`stock-val stock-${status}`}>
                          {p.control_stock === false ? '∞' : `${p.current_stock} ${p.unit}`}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${p.control_stock === false ? 'badge-success' : status === 'out' ? 'badge-danger' : status === 'low' ? 'badge-warning' : 'badge-success'}`}>
                        {p.control_stock === false ? 'Infinito' : status === 'out' ? 'Esgotado' : status === 'low' ? 'Baixo' : 'OK'}
                      </span>
                    </td>
                    <td>
                      <div className="td-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditModal(p)}>
                          <Edit2 size={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(p.id, p.name)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                    Nenhum produto encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content animate-zoomIn" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>{editingId ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button type="button" className="btn-close" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-image-upload">
                  <label>Foto do Produto</label>
                  <div className="image-upload-box" onClick={() => document.getElementById('image-input')?.click()}>
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" />
                    ) : (
                      <div className="upload-placeholder">
                        <Plus size={32} />
                        <span>Upload</span>
                      </div>
                    )}
                    <input
                      type="file"
                      id="image-input"
                      hidden
                      accept="image/*"
                      onChange={handleImageChange}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Nome do Produto *</label>
                  <input type="text" name="name"
                    value={formData.name} onChange={changeField}
                    required placeholder="Ex: Salgado Assado" />
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Preço Venda (R$) *</label>
                    <input type="number" step="0.01" name="salePrice"
                      value={formData.salePrice} onChange={changeField}
                      required placeholder="0.00" />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Preço Custo (R$)</label>
                    <input type="number" step="0.01" name="costPrice"
                      value={formData.costPrice} onChange={changeField}
                      placeholder="0.00" />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      name="controlStock"
                      checked={formData.controlStock}
                      onChange={changeField}
                      style={{ width: '18px', height: '18px', margin: 0 }}
                    />
                    Controlar quantidade em estoque
                  </label>
                </div>

                <div className="form-row" style={{ opacity: formData.controlStock ? 1 : 0.5, pointerEvents: formData.controlStock ? 'auto' : 'none' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Estoque Atual *</label>
                    <input type="number" name="currentStock"
                      value={formData.currentStock} onChange={changeField}
                      required={formData.controlStock} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Estoque Mínimo *</label>
                    <input type="number" name="minStock"
                      value={formData.minStock} onChange={changeField}
                      required={formData.controlStock} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Código de Barras</label>
                    <input type="text" name="barcode"
                      value={formData.barcode} onChange={changeField}
                      placeholder="Ex: 789..." />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Unidade</label>
                    <select name="unit" value={formData.unit} onChange={changeField}>
                      <option value="un">un (Unidade)</option>
                      <option value="kg">kg (Quilo)</option>
                      <option value="lt">lt (Litro)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
