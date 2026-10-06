import React, { useMemo, useState } from 'react';
import { 
  Truck, 
  PackageCheck, 
  Clock, 
  MapPin, 
  Calendar, 
  Phone, 
  AlertTriangle, 
  Search, 
  Plus, 
  CheckCircle2, 
  ChevronRight, 
  MessageCircle, 
  Navigation, 
  FileText,
  User,
  ExternalLink
} from 'lucide-react';
import { Order, OrderStatus, UserRole } from '../types';

const PAGE = 30;
/** Henüz yola çıkmamış siparişler: sadece bunlar için gecikme / bugün sevk uyarısı verilir */
const NOT_SHIPPED: OrderStatus[] = ['hazirlaniyor', 'depoda_hazir', 'gecikmeli'];

interface OrderShippingTrackerProps {
  orders: Order[];
  currentRole: UserRole;
  onSaveOrder: (order: Order) => void;
  onUpdateOrderStatus: (id: string, status: OrderStatus, carrierCompany?: string, trackingNumber?: string) => void;
  onDeleteOrder: (id: string) => void;
  onOpenNewOrderModal: () => void;
}

export const OrderShippingTracker: React.FC<OrderShippingTrackerProps> = ({
  orders,
  currentRole,
  onSaveOrder,
  onUpdateOrderStatus,
  onDeleteOrder,
  onOpenNewOrderModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const filteredOrders = useMemo(() => {
    const q = searchTerm.toLocaleLowerCase('tr');
    return orders
      .filter((o) => {
        const matchesSearch =
          !q ||
          o.customerName.toLocaleLowerCase('tr').includes(q) ||
          o.orderNumber.toLocaleLowerCase('tr').includes(q) ||
          (o.trackingNumber || '').toLocaleLowerCase('tr').includes(q) ||
          (o.carrierCompany || '').toLocaleLowerCase('tr').includes(q) ||
          (o.city || '').toLocaleLowerCase('tr').includes(q);

        let matchesStatus = true;
        if (statusFilter === 'today') {
          matchesStatus = o.targetShippingDate === todayStr && NOT_SHIPPED.includes(o.status);
        } else if (statusFilter === 'overdue') {
          matchesStatus = o.targetShippingDate < todayStr && NOT_SHIPPED.includes(o.status);
        } else if (statusFilter !== 'all') {
          matchesStatus = o.status === statusFilter;
        }

        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => (b.orderDate || b.createdAt || '').localeCompare(a.orderDate || a.createdAt || ''));
  }, [orders, searchTerm, statusFilter, todayStr]);

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'hazirlaniyor':
        return { label: 'Hazırlanıyor (Depo)', color: 'bg-amber-100 text-amber-800 border-amber-300' };
      case 'depoda_hazir':
        return { label: 'Depoda Hazır (Yükleme)', color: 'bg-blue-100 text-blue-800 border-blue-300' };
      case 'sevk_edildi':
        return { label: 'Sevk Edildi (Yolda)', color: 'bg-purple-100 text-purple-800 border-purple-300' };
      case 'teslim_edildi':
        return { label: 'Teslim Edildi', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      case 'gecikmeli':
        return { label: 'Gecikmeli', color: 'bg-rose-100 text-rose-800 border-rose-300' };
    }
  };



  return (
    <div className="space-y-4">
      
      {/* Top Filter & Add Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Sipariş no, müşteri, nakliye ambarı veya irsaliye no ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => { setStatusFilter('all'); setLimit(PAGE); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tümü ({orders.length})
          </button>

          <button
            onClick={() => { setStatusFilter('today'); setLimit(PAGE); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
            }`}
          >
            Bugün Sevk Edilecekler
          </button>

          <button
            onClick={() => { setStatusFilter('overdue'); setLimit(PAGE); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'overdue'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            Gecikenler
          </button>

          <button
            onClick={() => { setStatusFilter('sevk_edildi'); setLimit(PAGE); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'sevk_edildi'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
            }`}
          >
            Yoldakiler
          </button>

          <button
            onClick={onOpenNewOrderModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors shrink-0 ml-auto"
          >
            <Plus className="w-4 h-4" />
            <span>+ Yeni Sevkiyat Planla</span>
          </button>
        </div>

      </div>

      {/* Orders List / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrders.length === 0 ? (
          <div className="col-span-full bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400">
            Kriterlere uygun sipariş veya sevkiyat kaydı bulunamadı.
          </div>
        ) : (
          filteredOrders.slice(0, limit).map((order) => {
            const statusBadge = getStatusBadge(order.status);
            const isToday = order.targetShippingDate === todayStr;
            const isPast = order.targetShippingDate < todayStr && NOT_SHIPPED.includes(order.status);

            return (
              <div
                key={order.id}
                className={`bg-white rounded-xl border shadow-xs hover:shadow-md transition-all p-4 space-y-3 relative flex flex-col justify-between ${
                  isPast ? 'border-rose-300 ring-1 ring-rose-300' : isToday ? 'border-blue-300 ring-1 ring-blue-300' : 'border-slate-200'
                }`}
              >
                <div>
                  {/* Top: Order Number & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                          {order.orderNumber}
                        </span>
                        {order.quoteNumber && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            Teklif: {order.quoteNumber}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mt-1 line-clamp-1">
                        {order.customerName}
                      </h4>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusBadge.color}`}>
                      {statusBadge.label}
                    </span>
                  </div>

                  {/* Delivery Location & Phone */}
                  <div className="mt-2 text-xs text-slate-600 space-y-1">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{order.deliveryAddress || order.city || 'Isparta'}</span>
                    </div>
                    {order.customerPhone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <a href={`tel:${order.customerPhone}`} className="text-sky-600 hover:underline">
                          {order.customerPhone}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Shipping Date Card (The core focus of user's request!) */}
                  <div className={`mt-3 p-2.5 rounded-lg border text-xs ${
                    isPast
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : isToday
                      ? 'bg-blue-50 border-blue-200 text-blue-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Hedef Sevk Tarihi:
                      </span>
                      <span className="font-black text-sm">
                        {order.targetShippingDate || 'Belirlenmedi'}
                      </span>
                    </div>

                    {isPast && (
                      <p className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Sevk tarihi geçti! Aksama kontrolü yapınız.
                      </p>
                    )}
                    {isToday && (
                      <p className="text-[11px] font-bold text-blue-700 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Bugün sevk edilmesi gerekiyor!
                      </p>
                    )}
                  </div>

                  {/* Carrier & Tracking Info */}
                  <div className="mt-2 bg-slate-50/80 p-2 rounded-lg border border-slate-200/60 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nakliye / Ambar:</span>
                      <span className="font-semibold text-slate-800 truncate pl-2">{order.carrierCompany || 'Seçilmedi'}</span>
                    </div>
                    {order.trackingNumber && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">İrsaliye / Fiş No:</span>
                        <span className="font-mono font-bold text-slate-800">{order.trackingNumber}</span>
                      </div>
                    )}
                    {order.driverContact && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Şoför / İletişim:</span>
                        <span className="font-medium text-slate-700 truncate pl-2">{order.driverContact}</span>
                      </div>
                    )}
                  </div>

                  {/* Items summary */}
                  {order.itemsSummary && (
                    <p className="mt-2 text-xs text-slate-600 line-clamp-2 italic">
                      📦 {order.itemsSummary}
                    </p>
                  )}
                </div>

                {/* Card Actions */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-1 gap-1.5">
                    {/* Edit / Detail modal */}
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 transition-colors"
                    >
                      <span>Durum Güncelle</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Fast Status advancement button */}
                  {order.status === 'hazirlaniyor' && (
                    <button
                      onClick={() => onUpdateOrderStatus(order.id, 'depoda_hazir')}
                      className="w-full py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 transition-colors"
                    >
                      İstanbul Depoda Hazırlandı Olarak İşaretle &rarr;
                    </button>
                  )}
                  {order.status === 'depoda_hazir' && (
                    <button
                      onClick={() => onUpdateOrderStatus(order.id, 'sevk_edildi')}
                      className="w-full py-1 rounded bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors"
                    >
                      🚚 Araca Yüklendi / Sevk Edildi Olarak İşaretle
                    </button>
                  )}
                  {order.status === 'sevk_edildi' && (
                    <button
                      onClick={() => onUpdateOrderStatus(order.id, 'teslim_edildi')}
                      className="w-full py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                    >
                      ✓ Şantiyeye / Müşteriye Teslim Edildi
                    </button>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>

      {filteredOrders.length > limit && (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>{limit} / {filteredOrders.length} sipariş gösteriliyor</span>
          <button
            onClick={() => setLimit((n) => n + PAGE)}
            className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold"
          >
            {PAGE} sipariş daha göster
          </button>
        </div>
      )}

      {/* Order Status Update Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                  {selectedOrder.orderNumber}
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  {selectedOrder.customerName}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Sevkiyat Aşaması
                </label>
                <select
                  value={selectedOrder.status}
                  onChange={(e) => setSelectedOrder({ ...selectedOrder, status: e.target.value as OrderStatus })}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white font-medium"
                >
                  <option value="hazirlaniyor">Hazırlanıyor (Depo Stok Topluyor)</option>
                  <option value="depoda_hazir">Depoda Hazır (Paletlendi, Araca Yüklenecek)</option>
                  <option value="sevk_edildi">Sevk Edildi (Yolda / Kamyon Hareket Etti)</option>
                  <option value="teslim_edildi">Teslim Edildi (Tamamlandı)</option>
                  <option value="gecikmeli">Gecikmeli (Aksama Var)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Hedef Sevk Tarihi (Ne Zaman Sevk Olacak?)
                </label>
                <input
                  type="date"
                  value={selectedOrder.targetShippingDate}
                  onChange={(e) => setSelectedOrder({ ...selectedOrder, targetShippingDate: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nakliye / Ambar Firması
                </label>
                <input
                  type="text"
                  placeholder="Örn: Isparta Öz Ambar, Yurtiçi Kargo, Fabrika Kamyon..."
                  value={selectedOrder.carrierCompany || ''}
                  onChange={(e) => setSelectedOrder({ ...selectedOrder, carrierCompany: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  İrsaliye No / Ambar Takip Fişi
                </label>
                <input
                  type="text"
                  placeholder="Örn: IRS-2026-9482 veya AMB-789"
                  value={selectedOrder.trackingNumber || ''}
                  onChange={(e) => setSelectedOrder({ ...selectedOrder, trackingNumber: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Şoför / Nakliyeci İletişim & Plaka
                </label>
                <input
                  type="text"
                  placeholder="Örn: 32 AB 123 - Şoför Ali Bey (0532 111 22 33)"
                  value={selectedOrder.driverContact || ''}
                  onChange={(e) => setSelectedOrder({ ...selectedOrder, driverContact: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Sevkiyat Durum Notu
                </label>
                <textarea
                  rows={2}
                  placeholder="Örn: Malzemeler yarın öğleden önce şantiyeye varacak..."
                  value={selectedOrder.statusNotes || ''}
                  onChange={(e) => setSelectedOrder({ ...selectedOrder, statusNotes: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  onSaveOrder(selectedOrder);
                  setSelectedOrder(null);
                }}
                className="flex-1 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm shadow-sm"
              >
                Kaydet ve Senkronize Et
              </button>
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200"
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
