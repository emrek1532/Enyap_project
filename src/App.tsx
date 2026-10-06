/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import {
  AppData,
  Customer,
  Quote,
  Order,
  CalendarEvent,
  QuickNote,
  ActivityLog,
  UserRole,
  SyncStatus,
  QuoteStatus,
  OrderStatus
} from './types';
import {
  loadLocalData,
  saveLocalData,
  loadOutbox,
  saveOutbox,
  clearLocalCache,
  setStoredUserRole
} from './lib/storage';
import { supabase } from './lib/supabase';
import {
  fetchAllData,
  applyOp,
  isPermanentError,
  replaceAllData,
  subscribeToChanges,
  PendingOp
} from './lib/db';
import { getDemoData } from './lib/demoData';
import { findCustomer } from './lib/customers';
import { AuthScreen } from './components/AuthScreen';
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
import { CustomersPanel } from './components/CustomersPanel';

const USER_ROLE_KEY = 'enyap_active_user_role_v1';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  return <Portal key={session.user.id} session={session} />;
}

function Portal({ session }: { session: Session }) {
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    const stored = localStorage.getItem(USER_ROLE_KEY);
    if (stored === 'isparta' || stored === 'istanbul') return stored;
    return session.user.user_metadata?.role === 'istanbul' ? 'istanbul' : 'isparta';
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('quotes');

  // App Data State (Offline-first initialized)
  const [data, setData] = useState<AppData>(() => {
    const local = loadLocalData();
    if (local) return local;
    return {
      customers: [],
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
    pendingSync: loadOutbox().length > 0,
    error: null,
  });

  // Modals state
  const [isNewQuoteOpen, setIsNewQuoteOpen] = useState(false);
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [convertingQuote, setConvertingQuote] = useState<Quote | null>(null);
  const [quoteCustomer, setQuoteCustomer] = useState<Customer | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [printableQuote, setPrintableQuote] = useState<Quote | null>(null);

  // Switch role handler
  const handleRoleChange = (role: UserRole) => {
    setCurrentRole(role);
    setStoredUserRole(role);
  };

  // Apply a local (optimistic) change and cache it
  const mutate = useCallback((fn: (prev: AppData) => AppData) => {
    setData(prev => {
      const next = { ...fn(prev), lastUpdated: new Date().toISOString() };
      saveLocalData(next);
      return next;
    });
  }, []);

  const syncingRef = useRef(false);
  const rerunRef = useRef(false);

  // Flush offline queue to Supabase, then pull the latest shared state
  const performSync = useCallback(async (): Promise<void> => {
    if (syncingRef.current) {
      rerunRef.current = true;
      return;
    }
    if (!navigator.onLine) {
      setSyncStatus(prev => ({ ...prev, isOnline: false, pendingSync: loadOutbox().length > 0 }));
      return;
    }

    syncingRef.current = true;
    setSyncStatus(prev => ({ ...prev, isSyncing: true, error: null }));
    let lastError: string | null = null;
    try {
      let queue = loadOutbox();
      while (queue.length > 0) {
        try {
          await applyOp(queue[0]);
        } catch (err: any) {
          if (!isPermanentError(err)) throw err;
          console.error('Dropping operation that the database rejected:', queue[0], err);
          lastError = err.message;
        }
        // New operations may have been appended meanwhile; only drop the head
        queue = loadOutbox().slice(1);
        saveOutbox(queue);
      }

      const fresh = await fetchAllData();
      if (loadOutbox().length === 0) {
        setData(fresh);
        saveLocalData(fresh);
      } else {
        rerunRef.current = true;
      }
      setSyncStatus({
        isOnline: true,
        isSyncing: false,
        lastSyncedAt: new Date(),
        pendingSync: loadOutbox().length > 0,
        error: lastError,
      });
    } catch (err: any) {
      console.warn('Sync failed:', err);
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        pendingSync: loadOutbox().length > 0,
        error: err?.message || 'Senkronizasyon hatası',
      }));
    } finally {
      syncingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        setTimeout(() => performSync(), 0);
      }
    }
  }, []);

  // Queue changes for Supabase and push them right away
  const persist = useCallback((ops: PendingOp[]) => {
    saveOutbox([...loadOutbox(), ...ops]);
    setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    performSync();
  }, [performSync]);

  const logActivity = (action: string, description: string, badgeColor: string): ActivityLog => ({
    id: 'act-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    action,
    description,
    author: currentRole,
    timestamp: new Date().toISOString(),
    badgeColor,
  });

  // Initial load + live updates from other devices
  useEffect(() => {
    performSync();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToChanges(() => {
      clearTimeout(timer);
      timer = setTimeout(() => performSync(), 400);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [performSync]);

  // Online / Offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: true }));
      performSync();
    };

    const handleOffline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: false }));
    };

    const handleVisible = () => {
      if (document.visibilityState === 'visible') performSync();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);

    // Periodic heartbeat sync (in case a realtime message was missed)
    const interval = setInterval(() => {
      if (navigator.onLine) performSync();
    }, 60000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
      clearInterval(interval);
    };
  }, [performSync]);

  // Teklif/siparişte geçen firma listede yoksa müşteri olarak ekle
  const newCustomerFor = (name: string, city: string, contact?: string, phone?: string): Customer | null => {
    if (!name.trim() || findCustomer(data.customers, name)) return null;
    const now = new Date().toISOString();
    return {
      id: 'cus-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      name: name.trim(),
      city: city || '',
      contactPerson: contact || '',
      phone: phone || '',
      createdAt: now,
      updatedAt: now,
    };
  };

  const addCustomerLocally = (customer: Customer | null) => {
    if (!customer) return;
    mutate(d => ({ ...d, customers: [...(d.customers || []), customer] }));
  };

  // Customers
  const handleSaveCustomer = (customer: Customer) => {
    mutate(d => {
      const list = d.customers || [];
      const exists = list.some(c => c.id === customer.id);
      return { ...d, customers: exists ? list.map(c => (c.id === customer.id ? customer : c)) : [...list, customer] };
    });
    persist([{ kind: 'upsert', entity: 'customers', record: customer }]);
  };

  const handleDeleteCustomer = (id: string) => {
    mutate(d => ({ ...d, customers: (d.customers || []).filter(c => c.id !== id) }));
    persist([{ kind: 'delete', entity: 'customers', id }]);
  };

  // Save new quote
  const handleSaveQuote = (newQuote: Quote) => {
    const activity = logActivity(
      'Yeni Teklif Talebi Açıldı',
      `${newQuote.customerName} için ${newQuote.quoteNumber} nolu talep oluşturuldu.`,
      'sky'
    );
    const customer = newCustomerFor(newQuote.customerName, newQuote.city, newQuote.customerContact, newQuote.customerPhone);
    addCustomerLocally(customer);
    mutate(d => ({
      ...d,
      quotes: [newQuote, ...d.quotes.filter(q => q.id !== newQuote.id)],
      activities: [activity, ...(d.activities || [])],
    }));
    persist([
      ...(customer ? [{ kind: 'upsert', entity: 'customers', record: customer } as PendingOp] : []),
      { kind: 'upsert', entity: 'quotes', record: newQuote },
      { kind: 'upsert', entity: 'activities', record: activity },
    ]);
  };

  // Update Quote Status
  const handleUpdateQuoteStatus = (id: string, status: QuoteStatus) => {
    const target = data.quotes.find(q => q.id === id);
    if (!target) return;
    const updated: Quote = { ...target, status, updatedAt: new Date().toISOString() };
    const activity = logActivity(
      'Teklif Durumu Değişti',
      `${target.customerName} teklifi "${status}" durumuna alındı.`,
      'indigo'
    );
    mutate(d => ({
      ...d,
      quotes: d.quotes.map(q => (q.id === id ? updated : q)),
      activities: [activity, ...(d.activities || [])],
    }));
    persist([
      { kind: 'upsert', entity: 'quotes', record: updated },
      { kind: 'upsert', entity: 'activities', record: activity },
    ]);
  };

  // Delete Quote
  const handleDeleteQuote = (id: string) => {
    mutate(d => ({ ...d, quotes: d.quotes.filter(q => q.id !== id) }));
    persist([{ kind: 'delete', entity: 'quotes', id }]);
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

  // Save Order / Shipment (new or edited)
  const handleSaveOrder = (order: Order) => {
    const now = new Date().toISOString();
    const isNew = !data.orders.some(o => o.id === order.id);
    const saved: Order = { ...order, updatedAt: now };
    const ops: PendingOp[] = [{ kind: 'upsert', entity: 'orders', record: saved }];

    if (!isNew) {
      mutate(d => ({ ...d, orders: d.orders.map(o => (o.id === saved.id ? saved : o)) }));
      persist(ops);
      return;
    }

    // Auto add calendar event for shipping day
    let shipEv: CalendarEvent | null = null;
    if (saved.targetShippingDate) {
      shipEv = {
        id: 'ev-ship-' + saved.id,
        title: `🚚 Sevkiyat: ${saved.customerName}`,
        date: saved.targetShippingDate,
        time: '09:30',
        category: 'sevkiyat',
        relatedEntity: { type: 'order', id: saved.id, name: saved.customerName },
        location: saved.deliveryAddress || saved.city,
        assignedUser: 'all',
        completed: false,
        notes: `${saved.orderNumber} nolu sipariş sevk günü. Ambar/Kargo: ${saved.carrierCompany || 'Belirtilmedi'}`,
        reminder: true,
        createdAt: now,
        updatedAt: now,
      };
      ops.push({ kind: 'upsert', entity: 'events', record: shipEv });
    }

    const activity = logActivity(
      'Yeni Sipariş & Sevkiyat Planlandı',
      `${saved.customerName} için ${saved.orderNumber} nolu sipariş açıldı. Sevk: ${saved.targetShippingDate}`,
      'emerald'
    );
    ops.push({ kind: 'upsert', entity: 'activities', record: activity });

    const customer = newCustomerFor(saved.customerName, saved.city, saved.customerContact, saved.customerPhone);
    if (customer) {
      addCustomerLocally(customer);
      ops.unshift({ kind: 'upsert', entity: 'customers', record: customer });
    }

    mutate(d => ({
      ...d,
      orders: [saved, ...d.orders],
      events: shipEv ? [shipEv, ...d.events] : d.events,
      activities: [activity, ...(d.activities || [])],
    }));
    persist(ops);
  };

  // Update Order Status
  const handleUpdateOrderStatus = (
    id: string,
    status: OrderStatus,
    carrierCompany?: string,
    trackingNumber?: string
  ) => {
    const target = data.orders.find(o => o.id === id);
    if (!target) return;
    const today = new Date().toISOString().split('T')[0];
    const updated: Order = {
      ...target,
      status,
      carrierCompany: carrierCompany || target.carrierCompany,
      trackingNumber: trackingNumber || target.trackingNumber,
      actualShippingDate:
        status === 'sevk_edildi' && !target.actualShippingDate ? today : target.actualShippingDate,
      updatedAt: new Date().toISOString(),
    };
    const activity = logActivity(
      'Sevkiyat Durumu Güncellendi',
      `${target.customerName} siparişi "${status}" yapıldı.`,
      'amber'
    );
    mutate(d => ({
      ...d,
      orders: d.orders.map(o => (o.id === id ? updated : o)),
      activities: [activity, ...(d.activities || [])],
    }));
    persist([
      { kind: 'upsert', entity: 'orders', record: updated },
      { kind: 'upsert', entity: 'activities', record: activity },
    ]);
  };

  // Delete Order
  const handleDeleteOrder = (id: string) => {
    mutate(d => ({ ...d, orders: d.orders.filter(o => o.id !== id) }));
    persist([{ kind: 'delete', entity: 'orders', id }]);
  };

  // Calendar Event handlers
  const handleSaveEvent = (event: CalendarEvent) => {
    const saved: CalendarEvent = { ...event, updatedAt: new Date().toISOString() };
    mutate(d => {
      const exists = d.events.some(e => e.id === saved.id);
      return {
        ...d,
        events: exists ? d.events.map(e => (e.id === saved.id ? saved : e)) : [saved, ...d.events],
      };
    });
    persist([{ kind: 'upsert', entity: 'events', record: saved }]);
  };

  const handleDeleteEvent = (id: string) => {
    mutate(d => ({ ...d, events: d.events.filter(e => e.id !== id) }));
    persist([{ kind: 'delete', entity: 'events', id }]);
  };

  // Quick Notes handlers
  const handleSaveNote = (note: QuickNote) => {
    const saved: QuickNote = { ...note, updatedAt: new Date().toISOString() };
    mutate(d => {
      const exists = d.notes.some(n => n.id === saved.id);
      return {
        ...d,
        notes: exists ? d.notes.map(n => (n.id === saved.id ? saved : n)) : [saved, ...d.notes],
      };
    });
    persist([{ kind: 'upsert', entity: 'notes', record: saved }]);
  };

  const handleDeleteNote = (id: string) => {
    mutate(d => ({ ...d, notes: d.notes.filter(n => n.id !== id) }));
    persist([{ kind: 'delete', entity: 'notes', id }]);
  };

  // Import Backup: merge imported records into the shared database
  const handleImportData = (importedData: AppData) => {
    mutate(() => ({ ...importedData, customers: importedData.customers || data.customers || [] }));
    persist([
      ...(importedData.customers || []).map(record => ({ kind: 'upsert', entity: 'customers', record }) as PendingOp),
      ...(importedData.quotes || []).map(record => ({ kind: 'upsert', entity: 'quotes', record }) as PendingOp),
      ...(importedData.orders || []).map(record => ({ kind: 'upsert', entity: 'orders', record }) as PendingOp),
      ...(importedData.events || []).map(record => ({ kind: 'upsert', entity: 'events', record }) as PendingOp),
      ...(importedData.notes || []).map(record => ({ kind: 'upsert', entity: 'notes', record }) as PendingOp),
      ...(importedData.activities || []).map(record => ({ kind: 'upsert', entity: 'activities', record }) as PendingOp),
    ]);
  };

  // Reset Demo: replace the shared database with sample data
  const handleResetDemo = async () => {
    if (!navigator.onLine) {
      alert('Örnek verileri yüklemek için internet bağlantısı gerekli.');
      return;
    }
    setSyncStatus(prev => ({ ...prev, isSyncing: true, error: null }));
    try {
      saveOutbox([]);
      const fresh = await replaceAllData(getDemoData());
      setData(fresh);
      saveLocalData(fresh);
      setSyncStatus(prev => ({ ...prev, isSyncing: false, pendingSync: false, lastSyncedAt: new Date() }));
    } catch (err: any) {
      console.error(err);
      setSyncStatus(prev => ({ ...prev, isSyncing: false, error: err?.message || 'Örnek veriler yüklenemedi' }));
    }
  };

  const handleSignOut = async () => {
    if (loadOutbox().length > 0 &&
      !confirm('Henüz buluta gönderilmemiş değişiklikler var. Çıkış yaparsanız bu değişiklikler kaybolur. Devam edilsin mi?')) {
      return;
    }
    clearLocalCache();
    await supabase.auth.signOut();
  };

  // Counts for alerts & badges
  const urgentCount = data.quotes.filter(q => q.urgency === 'acil' && q.status === 'yeni_talep').length;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayShipmentCount = data.orders.filter(o => o.targetShippingDate === todayStr && o.status !== 'teslim_edildi').length;
  const pendingQuotesCount = data.quotes.filter(q => q.status === 'yeni_talep').length;
  const todayEventsCount = data.events.filter(e => e.date === todayStr && !e.completed).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col pb-20 md:pb-8">
      
      {/* Header + desktop tabs stay pinned together while scrolling */}
      <div className="sticky top-0 z-30">
      {/* Top Application Header */}
      <Header
        currentRole={currentRole}
        onRoleChange={handleRoleChange}
        syncStatus={syncStatus}
        onTriggerSync={() => performSync()}
        onOpenNewQuote={() => setIsNewQuoteOpen(true)}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onSignOut={handleSignOut}
        userEmail={session.user.email || ''}
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
      </div>

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

        {/* Müşteriler */}
        {activeTab === 'customers' && (
          <CustomersPanel
            customers={data.customers || []}
            onSaveCustomer={handleSaveCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            onCreateQuoteForCustomer={(customer) => {
              setQuoteCustomer(customer);
              setIsNewQuoteOpen(true);
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
          customers={data.customers || []}
          initialCustomer={quoteCustomer}
          onSaveQuote={handleSaveQuote}
          onClose={() => {
            setIsNewQuoteOpen(false);
            setQuoteCustomer(null);
          }}
        />
      )}

      {/* 2. New Order / Convert Quote to Shipment Modal */}
      {isNewOrderOpen && (
        <NewOrderModal
          currentRole={currentRole}
          initialQuote={convertingQuote}
          customers={data.customers || []}
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
