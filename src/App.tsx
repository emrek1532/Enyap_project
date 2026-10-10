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
  OrderStatus,
  Collection,
  Expense
} from './types';
import {
  loadLocalData,
  saveLocalData,
  loadOutbox,
  saveOutbox,
  clearLocalCache
} from './lib/storage';
import { supabase } from './lib/supabase';
import {
  fetchAllData,
  applyOp,
  isPermanentError,
  subscribeToChanges,
  PendingOp
} from './lib/db';
import { findCustomer } from './lib/customers';
import { PENDING_STATUSES } from './lib/quoteRules';
import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import type { ActiveTab } from './components/Navigation';
import { DashboardStats } from './components/DashboardStats';
import { QuoteManager } from './components/QuoteManager';
import { QuickNoteFab } from './components/QuickNoteFab';
import { QuickNotesPanel } from './components/QuickNotesPanel';
import { PrintableQuoteModal } from './components/PrintableQuoteModal';
import { LedgerPanel } from './components/LedgerPanel';
import { HomePage, PageHeader, SECTION_META } from './components/HomePage';
import { MaterialsPanel } from './components/MaterialsPanel';
import { ReportsPanel } from './components/ReportsPanel';
import { NewQuoteModal } from './components/NewQuoteModal';
import { VoiceAssistant } from './components/VoiceAssistant';
import { AiResult, collectionDraftFrom, expenseDraftFrom, quoteDraftFrom } from './lib/ai';
import { BANKS, EXPENSE_CATEGORIES, EXPENSE_METHODS } from './components/LedgerPanel';
import { CustomersPanel } from './components/CustomersPanel';
import { readQuotePdf } from './lib/pdfQuote';
import { AccessContext, Module, Profile, can, fetchMyProfile } from './lib/access';
import { AdminPanel, PendingScreen } from './components/AdminPanel';

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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  return <Gate key={session.user.id} session={session} />;
}

/** Profili yükler: onaylanmamış / askıdaki kullanıcı veriye ulaşamaz */
function Gate({ session }: { session: Session }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const load = useCallback(() => { fetchMyProfile(session.user.id).then(setProfile); }, [session.user.id]);
  useEffect(() => {
    load();
    // Yönetici yetkiyi değiştirince sayfa yenilemeden uygulanır
    const ch = supabase.channel('my-profile')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, session.user.id]);

  if (profile === undefined) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }
  if (!profile || profile.status !== 'active') {
    return (
      <PendingScreen
        status={profile?.status || 'missing'}
        email={session.user.email || ''}
        onRefresh={load}
        onSignOut={async () => { clearLocalCache(); await supabase.auth.signOut(); }}
      />
    );
  }
  return (
    <AccessContext.Provider value={profile}>
      <Portal session={session} profile={profile} />
    </AccessContext.Provider>
  );
}

// Üstteki "Menü" sırası
const MENU_ORDER: Exclude<ActiveTab, 'home'>[] = ['quotes', 'materials', 'customers', 'collections', 'expenses', 'notes', 'reports', 'admin'];
const MENU_TITLE: Partial<Record<ActiveTab, string>> = { collections: 'Tahsilat', expenses: 'Harcama' };

// Kayıt türü → yetki bölümü (müşteriler ve hareketler tüm aktif kullanıcılara açık)
const ENTITY_MODULE: Record<string, Module | undefined> = {
  quotes: 'quotes', orders: 'orders', collections: 'collections', expenses: 'expenses', events: 'calendar', notes: 'notes',
};

function Portal({ session, profile }: { session: Session; profile: Profile }) {
  const tabAllowed = (tab: ActiveTab): boolean => {
    switch (tab) {
      case 'home': case 'customers': return true;
      case 'quotes': case 'reports': return can(profile, 'quotes');
      case 'materials': return can(profile, 'materials') || can(profile, 'suppliers');
      case 'admin': return profile.isAdmin;
      default: return can(profile, tab as Module);
    }
  };
  // Kullanıcının ekibi kayıt sırasında seçilir; kayıtlarda kimin eklediğini göstermek için kullanılır
  const currentRole: UserRole = session.user.user_metadata?.role === 'istanbul' ? 'istanbul' : 'isparta';
  const [activeTab, setActiveTabState] = useState<ActiveTab>('home');
  // Ana sayfadan "Tahsilat / Harcama Ekle" ile gelince form açık başlasın
  const [ledgerStartNew, setLedgerStartNew] = useState<'collections' | 'expenses' | null>(null);

  // Sayfa geçişleri tarayıcı geçmişine yazılır: telefonun geri tuşu da önceki sayfaya döner
  useEffect(() => {
    window.history.replaceState({ tab: 'home' }, '');
    const onPop = (e: PopStateEvent) => setActiveTabState((e.state?.tab as ActiveTab) || 'home');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const activeTabRef = useRef<ActiveTab>('home');
  activeTabRef.current = activeTab;
  const setActiveTab = useCallback((tab: ActiveTab) => {
    if (activeTabRef.current === tab || !tabAllowed(tab)) return;
    activeTabRef.current = tab;
    window.history.pushState({ tab }, '');
    setActiveTabState(tab);
    window.scrollTo({ top: 0 });
  }, []);
  const goBack = () => {
    if (window.history.state?.tab && window.history.state.tab !== 'home') window.history.back();
    else setActiveTab('home');
  };
  const goHome = () => {
    if (activeTab === 'home') return;
    activeTabRef.current = 'home';
    setActiveTabState('home');
    window.history.pushState({ tab: 'home' }, '');
    window.scrollTo({ top: 0 });
  };
  // Teklif listesinin durum filtresi; üstteki kutucuklar da bunu ayarlar
  const [quoteFilter, setQuoteFilter] = useState('all');

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
  const [quoteCustomer, setQuoteCustomer] = useState<Customer | null>(null);
  // Sesli asistanın hazırladığı taslaklar
  const [quoteDraft, setQuoteDraft] = useState<Partial<Quote> | null>(null);
  const [ledgerDraft, setLedgerDraft] = useState<Partial<Collection & Expense> | null>(null);
  const [printableQuote, setPrintableQuote] = useState<Quote | null>(null);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  // WhatsApp vb. uygulamadan "Paylaş" ile gelen teklif PDF'i: forma otomatik doldurulur
  const [sharedPdf, setSharedPdf] = useState<File | null>(null);
  const [shareError, setShareError] = useState('');
  const [pdfNotice, setPdfNotice] = useState('');

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
  const persist = useCallback((all: PendingOp[]) => {
    const ops = all.filter(op => { const m = ENTITY_MODULE[op.entity]; return !m || can(profile, m, 'edit'); });
    if (ops.length < all.length) {
      setShareError('Bu bölümde düzenleme yetkiniz yok.');
      performSync();
      if (!ops.length) return;
    }
    saveOutbox([...loadOutbox(), ...ops]);
    setSyncStatus(prev => ({ ...prev, pendingSync: true }));
    performSync();
  }, [performSync, profile]);

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
  // ---- Sesli asistan ----
  const aiContext = () => ({
    customers: (data.customers || []).map(c => c.name),
    expenseCategories: EXPENSE_CATEGORIES,
    expenseMethods: EXPENSE_METHODS,
    regions: [...new Set((data.expenses || []).map(e => e.region).filter((r): r is string => !!r))],
    banks: BANKS,
  });

  const cityOfCustomer = (name?: string | null) => {
    const k = (name || '').trim().toLocaleLowerCase('tr');
    return (data.customers || []).find(c => c.name.trim().toLocaleLowerCase('tr') === k)?.city || undefined;
  };

  const handleAiResult = async (r: AiResult) => {
    if (r.intent === 'quote' && r.quote) {
      const draft = await quoteDraftFrom(r.quote);
      draft.city = draft.city || cityOfCustomer(draft.customerName);
      setEditingQuote(null);
      setQuoteCustomer(null);
      setQuoteDraft(draft);
      setIsNewQuoteOpen(true);
    } else if (r.intent === 'collection' && r.collection) {
      const d = collectionDraftFrom(r.collection);
      setLedgerDraft({ ...d, city: cityOfCustomer(d.customerName) });
      setLedgerStartNew('collections');
      setActiveTab('collections');
    } else if (r.intent === 'expense' && r.expense) {
      setLedgerDraft(expenseDraftFrom(r.expense));
      setLedgerStartNew('expenses');
      setActiveTab('expenses');
    }
  };

  // Not bildirimine dokunulduysa (/?open-note=ID) notlar açılır ve not vurgulanır
  const [highlightNote, setHighlightNote] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open-note');
    if (!id) return;
    window.history.replaceState(window.history.state, '', '/');
    setActiveTab('notes');
    setHighlightNote(id);
  }, []);

  // Bildirime dokunulduysa (/?open-quote=ID) o teklifi aç
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('open-quote'));
  useEffect(() => {
    if (!openQuoteId) return;
    const q = data.quotes.find(x => x.id === openQuoteId);
    if (!q) return;
    window.history.replaceState(window.history.state, '', '/');
    setActiveTab('quotes');
    setEditingQuote(q);
    setOpenQuoteId(null);
  }, [openQuoteId, data.quotes]);

  // Paylaş menüsünden açıldıysa (/?shared-pdf=1) PDF'i al: teklif no sistemde varsa o teklifi, yoksa yeni teklifi aç
  const quotesRef = useRef(data.quotes);
  quotesRef.current = data.quotes;
  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get('shared-pdf');
    if (flag === null) return;
    const why = new URLSearchParams(window.location.search).get('why');
    window.history.replaceState(window.history.state, '', '/');
    if (flag !== '1') {
      // Tanı: paylaşım neden alınamadı (Claude kayıtlardan bakıp düzeltir)
      supabase.from('activities').insert({
        id: `diag-share-${Date.now()}`, action: 'Paylaşım alınamadı (tanı)',
        description: `${why || 'neden yok (eski service worker?)'}\n${navigator.userAgent}`.slice(0, 2000),
        author: currentRole, timestamp: new Date().toISOString(), badge_color: 'slate',
      }).then(() => undefined, () => undefined);
      // Telefon yalnızca dosya adını gönderdiyse: yeni teklifi açıp PDF'i elle seçtir
      const name = /title=txt\(([^)]*\.pdf)/i.exec(why || '')?.[1];
      if (name) {
        setPdfNotice(`Telefonunuz WhatsApp'tan dosyanın kendisini göndermedi, sadece adını gönderdi. Yukarıdaki "PDF'ten Doldur" düğmesine basın, açılan pencerede Son kullanılanlar veya "WhatsApp Documents" klasöründen "${name}" dosyasını seçin.`);
        setIsNewQuoteOpen(true);
        return;
      }
      setShareError(`Paylaşılan dosya alınamadı.${why ? ` (${why})` : ''}`);
      return;
    }
    (async () => {
      try {
        const cache = await caches.open('enyap-share');
        const res = await cache.match('/shared-pdf');
        if (!res) { setShareError('Paylaşılan dosya bulunamadı.'); return; }
        await cache.delete('/shared-pdf');
        const name = decodeURIComponent(res.headers.get('x-file-name') || 'teklif.pdf');
        const file = new File([await res.blob()], name, { type: 'application/pdf' });
        const pdf = await readQuotePdf(file, { ai: false }).catch(() => null);
        const existing = pdf?.quoteNumber ? quotesRef.current.find(q => (q.quoteNumber || '').trim() === pdf.quoteNumber) : undefined;
        setSharedPdf(file);
        if (existing) setEditingQuote(existing);
        else setIsNewQuoteOpen(true);
      } catch {
        setShareError('Paylaşılan PDF açılamadı.');
      }
    })();
  }, []);

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
    // Kaydettikten sonra Teklifler sayfasına geç: yeni teklif en üstte görünsün
    setQuoteFilter('all');
    setActiveTab('quotes');
  };

  // Mevcut teklifi düzenle / revize et
  const handleUpdateQuote = (updated: Quote) => {
    const activity = logActivity(
      'Teklif Revize Edildi',
      `${updated.customerName} için ${updated.quoteNumber} nolu teklif güncellendi.`,
      'amber'
    );
    const customer = newCustomerFor(updated.customerName, updated.city, updated.customerContact, updated.customerPhone);
    addCustomerLocally(customer);
    mutate(d => ({
      ...d,
      quotes: d.quotes.map(q => (q.id === updated.id ? updated : q)),
      activities: [activity, ...(d.activities || [])],
    }));
    persist([
      ...(customer ? [{ kind: 'upsert', entity: 'customers', record: customer } as PendingOp] : []),
      { kind: 'upsert', entity: 'quotes', record: updated },
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

  // Tahsilat / harcama kayıtları
  const handleSaveCollection = (record: Collection) => {
    mutate(d => {
      const list = d.collections || [];
      const exists = list.some(c => c.id === record.id);
      return { ...d, collections: exists ? list.map(c => (c.id === record.id ? record : c)) : [record, ...list] };
    });
    persist([{ kind: 'upsert', entity: 'collections', record }]);
  };

  const handleDeleteCollection = (id: string) => {
    mutate(d => ({ ...d, collections: (d.collections || []).filter(c => c.id !== id) }));
    persist([{ kind: 'delete', entity: 'collections', id }]);
  };

  const handleSaveExpense = (record: Expense) => {
    mutate(d => {
      const list = d.expenses || [];
      const exists = list.some(e => e.id === record.id);
      return { ...d, expenses: exists ? list.map(e => (e.id === record.id ? record : e)) : [record, ...list] };
    });
    persist([{ kind: 'upsert', entity: 'expenses', record }]);
  };

  const handleDeleteExpense = (id: string) => {
    mutate(d => ({ ...d, expenses: (d.expenses || []).filter(e => e.id !== id) }));
    persist([{ kind: 'delete', entity: 'expenses', id }]);
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
  const urgentCount = data.quotes.filter(q => q.urgency === 'acil' && PENDING_STATUSES.includes(q.status)).length;
  const todayStr = new Date().toISOString().split('T')[0];
  const pendingQuotesCount = data.quotes.filter(q => PENDING_STATUSES.includes(q.status)).length;
  const todayEventsCount = data.events.filter(e => e.date === todayStr && !e.completed).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col pb-8">
      
      {/* Header + desktop tabs stay pinned together while scrolling */}
      <div className="sticky top-0 z-30">
      {/* Top Application Header */}
      <Header
        syncStatus={syncStatus}
        onTriggerSync={() => performSync()}
        onOpenNewQuote={() => setIsNewQuoteOpen(true)}
        onSignOut={handleSignOut}
        userEmail={session.user.email || ''}
        urgentCount={urgentCount}
        onHome={goHome}
        sections={MENU_ORDER.filter(tabAllowed).map(id => ({ id, ...SECTION_META[id], title: MENU_TITLE[id] || SECTION_META[id].title }))}
        activeSection={activeTab}
        onOpenSection={id => setActiveTab(id as ActiveTab)}
      />

      </div>

      {/* Main App Content Area */}
      <main className="max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4 sm:pt-6 flex-1">

        {/* Ana sayfa */}
        {activeTab === 'home' && (
          <HomePage
            quotes={data.quotes}
            customers={data.customers || []}
            collections={data.collections || []}
            expenses={data.expenses || []}
            notes={data.notes}
            onOpen={setActiveTab}
            allowed={tabAllowed}
            onOpenQuote={setEditingQuote}
            canAdd={{ quote: can(profile, 'quotes', 'edit'), collection: can(profile, 'collections', 'edit'), expense: can(profile, 'expenses', 'edit') }}
            onNewQuote={() => setIsNewQuoteOpen(true)}
            onNewCollection={() => { setLedgerStartNew('collections'); setActiveTab('collections'); }}
            onNewExpense={() => { setLedgerStartNew('expenses'); setActiveTab('expenses'); }}
          />
        )}

        {/* Bölüm başlığı: geri / ana sayfa */}
        {activeTab !== 'home' && (
          <PageHeader
            title={SECTION_META[activeTab].title}
            icon={SECTION_META[activeTab].icon}
            tone={SECTION_META[activeTab].tone}
            onBack={goBack}
            onHome={goHome}
          />
        )}
        
        {/* KPI Dashboard & Urgent Action Banner */}
        {activeTab === 'quotes' && (
          <DashboardStats
            quotes={data.quotes}
            orders={data.orders}
            events={data.events}
            currentRole={currentRole}
            onOpenNewQuote={() => setIsNewQuoteOpen(true)}
            onNavigateTab={setActiveTab}
            onShowQuotes={(filter) => {
              setQuoteFilter(filter);
              setActiveTab('quotes');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* Tab 1: Teklifler (Kanban & List) */}
        {activeTab === 'quotes' && (
          <QuoteManager
            quotes={data.quotes}
            currentRole={currentRole}
            onOpenNewQuote={() => setIsNewQuoteOpen(true)}
            onUpdateQuoteStatus={handleUpdateQuoteStatus}
            onDeleteQuote={handleDeleteQuote}
            onPrintQuote={setPrintableQuote}
            onEditQuote={setEditingQuote}
            statusFilter={quoteFilter}
            onStatusFilterChange={setQuoteFilter}
          />
        )}

        {/* Müşteriler */}
        {activeTab === 'customers' && (
          <CustomersPanel
            customers={data.customers || []}
            quotes={data.quotes}
            onSaveCustomer={handleSaveCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            onCreateQuoteForCustomer={(customer) => {
              setQuoteCustomer(customer);
              setIsNewQuoteOpen(true);
            }}
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
            highlightId={highlightNote}
          />
        )}

        {/* Yapılan Tahsilatlar */}
        {activeTab === 'collections' && (
          <LedgerPanel
            kind="collections"
            records={data.collections || []}
            customers={data.customers || []}
            currentRole={currentRole}
            onSave={(r) => handleSaveCollection(r as Collection)}
            onDelete={handleDeleteCollection}
            startNew={ledgerStartNew === 'collections'}
            startDraft={ledgerDraft}
            onStartNewHandled={() => { setLedgerStartNew(null); setLedgerDraft(null); }}
          />
        )}

        {/* Yapılan Harcamalar */}
        {activeTab === 'expenses' && (
          <LedgerPanel
            kind="expenses"
            records={data.expenses || []}
            currentRole={currentRole}
            onSave={(r) => handleSaveExpense(r as Expense)}
            onDelete={handleDeleteExpense}
            startNew={ledgerStartNew === 'expenses'}
            startDraft={ledgerDraft}
            onStartNewHandled={() => { setLedgerStartNew(null); setLedgerDraft(null); }}
          />
        )}

        {/* Malzemeler (fiyat kataloğu) */}
        {activeTab === 'materials' && <MaterialsPanel />}

        {activeTab === 'admin' && profile.isAdmin && <AdminPanel meId={profile.id} activities={data.activities} />}

        {/* Rapor */}
        {activeTab === 'reports' && (
          <ReportsPanel
            quotes={data.quotes}
            collections={data.collections || []}
            expenses={data.expenses || []}
          />
        )}


      </main>

      {/* Sesli asistan: konuşarak teklif / tahsilat / harcama formu doldurur */}
      <QuickNoteFab currentRole={currentRole} onSave={handleSaveNote} />
      <VoiceAssistant context={aiContext} onResult={handleAiResult} />

      {/* MODALS */}
      {/* 1. New Quote Modal */}
      {isNewQuoteOpen && (
        <NewQuoteModal
          currentRole={currentRole}
          customers={data.customers || []}
          quotes={data.quotes}
          initialCustomer={quoteCustomer}
          draft={quoteDraft}
          initialPdf={sharedPdf}
          pdfNotice={pdfNotice}
          onSaveQuote={handleSaveQuote}
          onClose={() => {
            setIsNewQuoteOpen(false);
            setSharedPdf(null);
            setPdfNotice('');
            setQuoteCustomer(null);
            setQuoteDraft(null);
          }}
        />
      )}

      {shareError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] bg-rose-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-3">
          {shareError}
          <button onClick={() => setShareError('')} className="font-black" aria-label="Kapat">✕</button>
        </div>
      )}

      {/* Teklif düzenleme / revize */}
      {editingQuote && (
        <NewQuoteModal
          key={editingQuote.id}
          currentRole={currentRole}
          customers={data.customers || []}
          editQuote={editingQuote}
          quotes={data.quotes}
          initialPdf={sharedPdf}
          onSaveQuote={handleUpdateQuote}
          onClose={() => { setEditingQuote(null); setSharedPdf(null); }}
        />
      )}

      {/* 3. Official Printable Quote Modal */}
      {printableQuote && (
        <PrintableQuoteModal
          quote={printableQuote}
          onClose={() => setPrintableQuote(null)}
        />
      )}

    </div>
  );
}
