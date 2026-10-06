/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  AppData, 
  Quote, 
  Order, 
  CalendarEvent, 
  QuickNote, 
  UserRole, 
  SyncStatus, 
  QuoteStatus, 
  OrderStatus 
} from './types';
import { 
  loadLocalData, 
  saveLocalData, 
  fetchInitialData, 
  syncWithServer, 
  getStoredUserRole, 
  setStoredUserRole 
} from './lib/storage';
import { Header } from './components/Header';
import { Navigation, ActiveTab } from './components/Navigation';
import { DashboardStats } from './components/DashboardStats';
import { QuoteManager } from './components/QuoteManager';
import { OrderShippingTracker } from './components/OrderShippingTracker';
import { SharedCalendar } from './components/SharedCalendar';
import { QuickNotesPanel } from './components/QuickNotesPanel';
import { DeviceSyncModal } from './components/DeviceSyncModal';
import { PrintableQuoteModal } from './components/PrintableQuoteModal';
import { NewQuoteModal } from './components/NewQuoteModal';
import { NewOrderModal } from './components/NewOrderModal';

export default function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>(getStoredUserRole());
  const [activeTab, setActiveTab] = useState<ActiveTab>('quotes');

  // App Data State (Offline-first initialized)
  const [data, setData] = useState<AppData>(() => {
    const local = loadLocalData();
    if (local) return local;
    return {
      quotes: [],
      orders: [],
      events: [],
      notes: [],
      activities: [],
      lastUpdated: new Date().toISOString(),
    };
  });

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    lastSyncedAt: null,
    pendingSync: false,
    error: null,
  });

  // Modals state
  const [isNewQuoteOpen, setIsNewQuoteOpen] = useState(false);
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [convertingQuote, setConvertingQuote] = useState<Quote | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [printableQuote, setPrintableQuote] = useState<Quote | null>(null);

  // Switch role handler
  const handleRoleChange = (role: UserRole) => {
    setCurrentRole(role);
    setStoredUserRole(role);
  };

  // Perform full sync
  const performSync = useCallback(async (currentDataToSync?: AppData) => {
    if (!navigator.onLine) {
      setSyncStatus(prev => ({ ...prev, isOnline: false, pendingSync: true }));
      return;
    }

    setSyncStatus(prev => ({ ...prev, isSyncing: true, error: null }));
    try {
      const dataPayload = currentDataToSync || data;
      const synced = await syncWithServer(dataPayload);
      setData(synced);
      saveLocalData(synced);
      setSyncStatus({
        isOnline: true,
        isSyncing: false,
        lastSyncedAt: new Date(),
        pendingSync: false,
        error: null,
      });
    } catch (err: any) {
      console.warn('Sync failed:', err);
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        pendingSync: true,
        error: err.message || 'Senkronizasyon hatası',
      }));
    }
  }, [data]);

  // Initial load from server
  useEffect(() => {
    async function init() {
      try {
        const serverData = await fetchInitialData();
        setData(serverData);
        setSyncStatus(prev => ({
          ...prev,
          lastSyncedAt: new Date(),
          isOnline: true,
        }));
      } catch (err) {
        console.warn('Could not reach server initially, working offline:', err);
      }
    }
    init();
  }, []);

  // Online / Offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: true }));
      performSync();
    };

    const handleOffline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic heartbeat sync every 30 seconds
    const interval = setInterval(() => {
      if (navigator.onLine) {
        performSync();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [performSync]);

  // Save new quote
  const handleSaveQuote = async (newQuote: Quote) => {
    const updatedQuotes = [newQuote, ...data.quotes];
    const newActivity = {
      id: 'act-' + Date.now(),
      action: 'Yeni Teklif Talebi Açıldı',
      description: `${newQuote.customerName} için ${newQuote.quoteNumber} nolu talep oluşturuldu.`,
      author: currentRole,
      timestamp: new Date().toISOString(),
      badgeColor: 'sky',
    };
    const updatedData: AppData = {
      ...data,
      quotes: updatedQuotes,
      activities: [newActivity, ...(data.activities || [])],
      lastUpdated: new Date().toISOString(),
    };

    setData(updatedData);
    saveLocalData(updatedData);

    // Also push to server API
    try {
      await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuote),
      });
      performSync(updatedData);
    } catch {
      setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    }
  };

  // Update Quote Status
  const handleUpdateQuoteStatus = async (id: string, status: QuoteStatus) => {
    const updatedQuotes = data.quotes.map(q => {
      if (q.id === id) {
        return { ...q, status, updatedAt: new Date().toISOString() };
      }
      return q;
    });

    const targetQuote = data.quotes.find(q => q.id === id);
    const newActivity = {
      id: 'act-' + Date.now(),
      action: 'Teklif Durumu Değişti',
      description: `${targetQuote?.customerName || id} teklifi "${status}" durumuna alındı.`,
      author: currentRole,
      timestamp: new Date().toISOString(),
      badgeColor: 'indigo',
    };

    const updatedData: AppData = {
      ...data,
      quotes: updatedQuotes,
      activities: [newActivity, ...(data.activities || [])],
      lastUpdated: new Date().toISOString(),
    };

    setData(updatedData);
    saveLocalData(updatedData);

    try {
      await fetch(`/api/quotes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, updatedBy: currentRole }),
      });
    } catch {
      setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    }
  };

  // Delete Quote
  const handleDeleteQuote = async (id: string) => {
    const updatedQuotes = data.quotes.filter(q => q.id !== id);
    const updatedData = { ...data, quotes: updatedQuotes, lastUpdated: new Date().toISOString() };
    setData(updatedData);
    saveLocalData(updatedData);

    try {
      await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
    } catch {
      setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    }
  };

  // Convert Quote to Order
  const handleConvertToOrder = (quote: Quote) => {
    setConvertingQuote(quote);
    setIsNewOrderOpen(true);
  };

  // Add Calendar Event directly from quote
  const handleAddCalendarEventFromQuote = (quote: Quote) => {
    const in2Days = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const event: CalendarEvent = {
      id: 'ev-follow-' + Date.now(),
      title: `Teklif Takip: ${quote.customerName}`,
      date: in2Days,
      time: '11:00',
      category: 'musteri_takip',
      relatedEntity: { type: 'quote', id: quote.id, name: quote.customerName },
      location: quote.city || 'Isparta',
      assignedUser: currentRole,
      completed: false,
      notes: `${quote.quoteNumber} nolu teklif sonucu sorulacak (${quote.totalAmount?.toLocaleString('tr-TR')} TL)`,
      reminder: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    handleSaveEvent(event);
    setActiveTab('calendar');
  };

  // Save Order / Shipment
  const handleSaveOrder = async (newOrder: Order) => {
    const updatedOrders = [newOrder, ...data.orders];
    
    // Auto add calendar event for shipping day
    let updatedEvents = [...data.events];
    if (newOrder.targetShippingDate) {
      const shipEv: CalendarEvent = {
        id: 'ev-ship-' + newOrder.id,
        title: `🚚 Sevkiyat: ${newOrder.customerName}`,
        date: newOrder.targetShippingDate,
        time: '09:30',
        category: 'sevkiyat',
        relatedEntity: { type: 'order', id: newOrder.id, name: newOrder.customerName },
        location: newOrder.deliveryAddress || newOrder.city,
        assignedUser: 'all',
        completed: false,
        notes: `${newOrder.orderNumber} nolu sipariş sevk günü. Ambar/Kargo: ${newOrder.carrierCompany || 'Belirtilmedi'}`,
        reminder: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updatedEvents = [shipEv, ...updatedEvents];
    }

    const newActivity = {
      id: 'act-' + Date.now(),
      action: 'Yeni Sipariş & Sevkiyat Planlandı',
      description: `${newOrder.customerName} için ${newOrder.orderNumber} nolu sipariş açıldı. Sevk: ${newOrder.targetShippingDate}`,
      author: currentRole,
      timestamp: new Date().toISOString(),
      badgeColor: 'emerald',
    };

    const updatedData: AppData = {
      ...data,
      orders: updatedOrders,
      events: updatedEvents,
      activities: [newActivity, ...(data.activities || [])],
      lastUpdated: new Date().toISOString(),
    };

    setData(updatedData);
    saveLocalData(updatedData);

    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrder),
      });
      performSync(updatedData);
    } catch {
      setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    }
  };

  // Update Order Status
  const handleUpdateOrderStatus = async (
    id: string, 
    status: OrderStatus, 
    carrierCompany?: string, 
    trackingNumber?: string
  ) => {
    const updatedOrders = data.orders.map(o => {
      if (o.id === id) {
        return { 
          ...o, 
          status, 
          carrierCompany: carrierCompany || o.carrierCompany,
          trackingNumber: trackingNumber || o.trackingNumber,
          updatedAt: new Date().toISOString() 
        };
      }
      return o;
    });

    const targetOrder = data.orders.find(o => o.id === id);
    const newActivity = {
      id: 'act-' + Date.now(),
      action: 'Sevkiyat Durumu Güncellendi',
      description: `${targetOrder?.customerName || id} siparişi "${status}" yapıldı.`,
      author: currentRole,
      timestamp: new Date().toISOString(),
      badgeColor: 'amber',
    };

    const updatedData = {
      ...data,
      orders: updatedOrders,
      activities: [newActivity, ...(data.activities || [])],
      lastUpdated: new Date().toISOString(),
    };

    setData(updatedData);
    saveLocalData(updatedData);

    try {
      await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, carrierCompany, trackingNumber, updatedBy: currentRole }),
      });
    } catch {
      setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    }
  };

  // Delete Order
  const handleDeleteOrder = async (id: string) => {
    const updatedOrders = data.orders.filter(o => o.id !== id);
    const updatedData = { ...data, orders: updatedOrders, lastUpdated: new Date().toISOString() };
    setData(updatedData);
    saveLocalData(updatedData);

    try {
      await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    } catch {
      setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    }
  };

  // Calendar Event handlers
  const handleSaveEvent = async (event: CalendarEvent) => {
    const existingIdx = data.events.findIndex(e => e.id === event.id);
    let updatedEvents = [...data.events];
    if (existingIdx >= 0) {
      updatedEvents[existingIdx] = event;
    } else {
      updatedEvents = [event, ...updatedEvents];
    }

    const updatedData = { ...data, events: updatedEvents, lastUpdated: new Date().toISOString() };
    setData(updatedData);
    saveLocalData(updatedData);

    try {
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch {
      setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    }
  };

  const handleDeleteEvent = async (id: string) => {
    const updatedEvents = data.events.filter(e => e.id !== id);
    const updatedData = { ...data, events: updatedEvents, lastUpdated: new Date().toISOString() };
    setData(updatedData);
    saveLocalData(updatedData);

    try {
      await fetch(`/api/events/${id}`, { method: 'DELETE' });
    } catch {
      setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    }
  };

  // Quick Notes handlers
  const handleSaveNote = async (note: QuickNote) => {
    const existingIdx = data.notes.findIndex(n => n.id === note.id);
    let updatedNotes = [...data.notes];
    if (existingIdx >= 0) {
      updatedNotes[existingIdx] = note;
    } else {
      updatedNotes = [note, ...updatedNotes];
    }

    const updatedData = { ...data, notes: updatedNotes, lastUpdated: new Date().toISOString() };
    setData(updatedData);
    saveLocalData(updatedData);

    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      });
    } catch {
      setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    }
  };

  const handleDeleteNote = async (id: string) => {
    const updatedNotes = data.notes.filter(n => n.id !== id);
    const updatedData = { ...data, notes: updatedNotes, lastUpdated: new Date().toISOString() };
    setData(updatedData);
    saveLocalData(updatedData);

    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    } catch {
      setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    }
  };

  // Import Backup
  const handleImportData = (importedData: AppData) => {
    setData(importedData);
    saveLocalData(importedData);
    performSync(importedData);
  };

  // Reset Demo
  const handleResetDemo = async () => {
    try {
      const res = await fetch('/api/reset-demo', { method: 'POST' });
      const json = await res.json();
      if (json.data) {
        setData(json.data);
        saveLocalData(json.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Counts for alerts & badges
  const urgentCount = data.quotes.filter(q => q.urgency === 'acil' && q.status === 'yeni_talep').length;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayShipmentCount = data.orders.filter(o => o.targetShippingDate === todayStr && o.status !== 'teslim_edildi').length;
  const pendingQuotesCount = data.quotes.filter(q => q.status === 'yeni_talep').length;
  const todayEventsCount = data.events.filter(e => e.date === todayStr && !e.completed).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col pb-20 md:pb-8">
      
      {/* Top Application Header */}
      <Header
        currentRole={currentRole}
        onRoleChange={handleRoleChange}
        syncStatus={syncStatus}
        onTriggerSync={() => performSync()}
        onOpenNewQuote={() => setIsNewQuoteOpen(true)}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        urgentCount={urgentCount}
        todayShipmentCount={todayShipmentCount}
      />

      {/* Navigation (Desktop Top Bar / Mobile Bottom Bar) */}
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        quotesCount={pendingQuotesCount}
        ordersCount={data.orders.filter(o => o.status !== 'teslim_edildi').length}
        eventsCount={todayEventsCount}
      />

      {/* Main App Content Area */}
      <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 flex-1">
        
        {/* KPI Dashboard & Urgent Action Banner */}
        <DashboardStats
          quotes={data.quotes}
          orders={data.orders}
          events={data.events}
          currentRole={currentRole}
          onOpenNewQuote={() => setIsNewQuoteOpen(true)}
          onNavigateTab={setActiveTab}
        />

        {/* Tab 1: Teklifler (Kanban & List) */}
        {activeTab === 'quotes' && (
          <QuoteManager
            quotes={data.quotes}
            currentRole={currentRole}
            onOpenNewQuote={() => setIsNewQuoteOpen(true)}
            onUpdateQuoteStatus={handleUpdateQuoteStatus}
            onDeleteQuote={handleDeleteQuote}
            onConvertToOrder={handleConvertToOrder}
            onAddCalendarEventFromQuote={handleAddCalendarEventFromQuote}
            onPrintQuote={setPrintableQuote}
          />
        )}

        {/* Tab 2: Sipariş & Sevkiyat Takibi */}
        {activeTab === 'orders' && (
          <OrderShippingTracker
            orders={data.orders}
            currentRole={currentRole}
            onSaveOrder={handleSaveOrder}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onDeleteOrder={handleDeleteOrder}
            onOpenNewOrderModal={() => {
              setConvertingQuote(null);
              setIsNewOrderOpen(true);
            }}
          />
        )}

        {/* Tab 3: Ortak Takvim & Ajanda */}
        {activeTab === 'calendar' && (
          <SharedCalendar
            events={data.events}
            currentRole={currentRole}
            onSaveEvent={handleSaveEvent}
            onDeleteEvent={handleDeleteEvent}
          />
        )}

        {/* Tab 4: Notlar & Akış */}
        {activeTab === 'notes' && (
          <QuickNotesPanel
            notes={data.notes}
            activities={data.activities}
            currentRole={currentRole}
            onSaveNote={handleSaveNote}
            onDeleteNote={handleDeleteNote}
          />
        )}

        {/* Tab 5: Güvenlik, Şifreleme & Cihaz Aktarımı */}
        {activeTab === 'sync' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs max-w-2xl mx-auto">
            <h3 className="text-lg font-black text-slate-900 mb-2">
              Veri Yönetimi, Güvenlik ve Eşitleme
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Uçtan uca AES-256 şifreleme ayarlarını yapın, cihazlar arasında yedek aktarın veya çevrimdışı önbelleği yönetin.
            </p>
            <button
              onClick={() => setIsSyncModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-sm"
            >
              Şifreleme & Cihaz Aktarım Panelini Aç
            </button>
          </div>
        )}

      </main>

      {/* MODALS */}
      {/* 1. New Quote Modal */}
      {isNewQuoteOpen && (
        <NewQuoteModal
          currentRole={currentRole}
          onSaveQuote={handleSaveQuote}
          onClose={() => setIsNewQuoteOpen(false)}
        />
      )}

      {/* 2. New Order / Convert Quote to Shipment Modal */}
      {isNewOrderOpen && (
        <NewOrderModal
          currentRole={currentRole}
          initialQuote={convertingQuote}
          onSaveOrder={(order) => {
            handleSaveOrder(order);
            setIsNewOrderOpen(false);
            setConvertingQuote(null);
            setActiveTab('orders');
          }}
          onClose={() => {
            setIsNewOrderOpen(false);
            setConvertingQuote(null);
          }}
        />
      )}

      {/* 3. Official Printable Quote Modal */}
      {printableQuote && (
        <PrintableQuoteModal
          quote={printableQuote}
          onClose={() => setPrintableQuote(null)}
        />
      )}

      {/* 4. Device Sync & Encryption Modal */}
      {isSyncModalOpen && (
        <DeviceSyncModal
          data={data}
          syncStatus={syncStatus}
          onTriggerSync={() => performSync()}
          onImportData={handleImportData}
          onResetDemo={handleResetDemo}
          onClose={() => setIsSyncModalOpen(false)}
        />
      )}

    </div>
  );
}
