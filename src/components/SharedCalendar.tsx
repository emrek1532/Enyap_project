import React, { useState } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  Circle, 
  Trash2, 
  AlertCircle, 
  Filter,
  User,
  Truck,
  Phone,
  FileText
} from 'lucide-react';
import { CalendarEvent, EventCategory, UserRole } from '../types';

interface SharedCalendarProps {
  events: CalendarEvent[];
  currentRole: UserRole;
  onSaveEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (id: string) => void;
}

export const SharedCalendar: React.FC<SharedCalendarProps> = ({
  events,
  currentRole,
  onSaveEvent,
  onDeleteEvent,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEvent, setNewEvent] = useState<Partial<CalendarEvent>>({
    title: '',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    category: 'saha_ziyaret',
    location: 'Isparta',
    assignedUser: 'all',
    notes: '',
    reminder: true,
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthNames = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  const daysOfWeek = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  // Days in current month
  const firstDayOfMonth = new Date(year, month, 1);
  const startingDayIndex = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonthDays = new Date(year, month, 0).getDate();

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateStr(today.toISOString().split('T')[0]);
  };

  const getCategoryBadge = (category: EventCategory) => {
    switch (category) {
      case 'saha_ziyaret':
        return { label: 'Saha Keşif / Ziyaret', color: 'bg-emerald-500 text-white', dot: 'bg-emerald-500' };
      case 'musteri_takip':
        return { label: 'Müşteri Görüşme / Arama', color: 'bg-sky-500 text-white', dot: 'bg-sky-500' };
      case 'sevkiyat':
        return { label: 'Sevkiyat Teslimatı', color: 'bg-orange-500 text-white', dot: 'bg-orange-500' };
      case 'odeme':
        return { label: 'Ödeme / Vade / Çek', color: 'bg-purple-500 text-white', dot: 'bg-purple-500' };
      case 'kritik':
        return { label: 'Kritik Hatırlatma', color: 'bg-rose-500 text-white', dot: 'bg-rose-500' };
      case 'genel':
        return { label: 'Genel Not', color: 'bg-slate-500 text-white', dot: 'bg-slate-500' };
    }
  };

  // Filter events
  const filteredEvents = events.filter((e) => {
    if (categoryFilter === 'all') return true;
    return e.category === categoryFilter;
  });

  const selectedDayEvents = filteredEvents.filter((e) => e.date === selectedDateStr);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.title || !newEvent.date) return;

    const event: CalendarEvent = {
      id: 'ev-' + Date.now(),
      title: newEvent.title,
      date: newEvent.date,
      time: newEvent.time,
      category: (newEvent.category as EventCategory) || 'genel',
      location: newEvent.location || '',
      assignedUser: newEvent.assignedUser || 'all',
      completed: false,
      notes: newEvent.notes || '',
      reminder: newEvent.reminder || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveEvent(event);
    setShowAddModal(false);
    setNewEvent({
      title: '',
      date: selectedDateStr,
      time: '10:00',
      category: 'saha_ziyaret',
      location: 'Isparta',
      assignedUser: 'all',
      notes: '',
      reminder: true,
    });
  };

  return (
    <div className="space-y-4">
      
      {/* Calendar Header Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        
        {/* Month Selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <h2 className="text-base sm:text-lg font-black text-slate-900 min-w-[160px] text-center">
            {monthNames[month]} {year}
          </h2>

          <button
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <button
            onClick={handleToday}
            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors ml-1"
          >
            Bugün
          </button>
        </div>

        {/* Filter & Add Event Button */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs sm:text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          >
            <option value="all">Tüm Kategoriler</option>
            <option value="saha_ziyaret">Saha Keşif / Ziyaret</option>
            <option value="musteri_takip">Müşteri Görüşme / Arama</option>
            <option value="sevkiyat">Sevkiyat Teslimatı</option>
            <option value="odeme">Ödeme / Vade</option>
            <option value="kritik">Kritik Hatırlatma</option>
            <option value="genel">Genel Not</option>
          </select>

          <button
            onClick={() => {
              setNewEvent(prev => ({ ...prev, date: selectedDateStr }));
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Hatırlatıcı / Not Ekle</span>
          </button>
        </div>

      </div>

      {/* Main Grid: Calendar on Left, Selected Day Agenda on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        
        {/* Month Calendar Grid (takes 2 cols on lg) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-3 sm:p-4">
          
          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-500 pb-2 border-b border-slate-100">
            {daysOfWeek.map((day, i) => (
              <div key={day} className={i >= 5 ? 'text-rose-500' : ''}>
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1 mt-2">
            {/* Blank/previous month padding */}
            {Array.from({ length: startingDayIndex }).map((_, i) => {
              const dayNum = prevMonthDays - startingDayIndex + i + 1;
              return (
                <div
                  key={`prev-${i}`}
                  className="min-h-[70px] sm:min-h-[85px] p-1.5 rounded-lg bg-slate-50/50 text-slate-300 text-xs select-none"
                >
                  <span className="font-semibold">{dayNum}</span>
                </div>
              );
            })}

            {/* Current month days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const isSelected = dateStr === selectedDateStr;
              const isToday = dateStr === new Date().toISOString().split('T')[0];
              const dayEvents = filteredEvents.filter((e) => e.date === dateStr);

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDateStr(dateStr)}
                  className={`min-h-[70px] sm:min-h-[85px] p-1.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-orange-50/70 border-orange-500 ring-2 ring-orange-500/30'
                      : isToday
                      ? 'bg-sky-50/60 border-sky-400'
                      : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                        isToday
                          ? 'bg-sky-600 text-white'
                          : isSelected
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-700'
                      }`}
                    >
                      {dayNum}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1 rounded">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Day Events Dots / Mini titles */}
                  <div className="space-y-0.5 mt-1 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => {
                      const badge = getCategoryBadge(ev.category);
                      return (
                        <div
                          key={ev.id}
                          className={`text-[9px] sm:text-[10px] truncate px-1 py-0.2 rounded font-semibold text-white ${badge.color}`}
                        >
                          {ev.time ? `${ev.time} ` : ''}{ev.title}
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <div className="text-[9px] text-slate-500 font-bold px-1">
                        +{dayEvents.length - 2} daha
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Color Legend */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2 text-[11px] text-slate-600">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Saha Keşif / Ziyaret
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              Müşteri Görüşme
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              Sevkiyat
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              Ödeme / Vade
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              Kritik
            </span>
          </div>

        </div>

        {/* Selected Day Agenda & Tasks (takes 1 col on lg) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">
                Seçilen Gün Ajandası
              </span>
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                {new Date(selectedDateStr).toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  weekday: 'long',
                })}
              </h3>
            </div>
            <button
              onClick={() => {
                setNewEvent(prev => ({ ...prev, date: selectedDateStr }));
                setShowAddModal(true);
              }}
              className="p-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 font-bold text-xs flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ekle</span>
            </button>
          </div>

          {/* Agenda List */}
          <div className="space-y-2.5 max-h-[500px] overflow-y-auto">
            {selectedDayEvents.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">
                <CalendarIcon className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                Bu tarihe kayıtlı etkinlik veya not bulunmuyor.
                <button
                  onClick={() => {
                    setNewEvent(prev => ({ ...prev, date: selectedDateStr }));
                    setShowAddModal(true);
                  }}
                  className="block mx-auto mt-2 text-orange-600 font-bold hover:underline"
                >
                  + Not veya Ziyaret Ekle
                </button>
              </div>
            ) : (
              selectedDayEvents.map((ev) => {
                const badge = getCategoryBadge(ev.category);
                return (
                  <div
                    key={ev.id}
                    className={`p-3 rounded-xl border transition-all space-y-2 ${
                      ev.completed
                        ? 'bg-slate-50 border-slate-200 opacity-60'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => onSaveEvent({ ...ev, completed: !ev.completed })}
                          className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors"
                        >
                          {ev.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Circle className="w-4 h-4" />
                          )}
                        </button>
                        <div>
                          <h4 className={`text-xs sm:text-sm font-bold ${ev.completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                            {ev.title}
                          </h4>
                          <span className={`inline-block text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase mt-1 ${badge.color}`}>
                            {badge.label}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => onDeleteEvent(ev.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded"
                        title="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Details: Time, Location */}
                    <div className="text-[11px] text-slate-600 space-y-1 pl-6">
                      {ev.time && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>Saat: <strong>{ev.time}</strong></span>
                        </div>
                      )}
                      {ev.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{ev.location}</span>
                        </div>
                      )}
                      {ev.notes && (
                        <p className="mt-1 p-2 bg-slate-50 rounded border border-slate-100 text-slate-700 italic">
                          "{ev.notes}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 pl-6 border-t border-slate-100">
                      <span>Atanan: {ev.assignedUser === 'isparta' ? 'Şakir Emre (Isparta)' : ev.assignedUser === 'istanbul' ? 'İstanbul Ofis' : 'Ortak'}</span>
                      {ev.reminder && <span className="text-orange-600 font-semibold">🔔 Hatırlatıcı Aktif</span>}
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>

      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h3 className="text-base font-black text-slate-900">
                + Takvime Not & Hatırlatıcı Ekle
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Başlık / Hatırlatıcı Konusu *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Gül Mühendislik Şantiye Keşfi, Sevkiyat Kontrolü..."
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tarih *
                  </label>
                  <input
                    type="date"
                    required
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Saat
                  </label>
                  <input
                    type="time"
                    value={newEvent.time}
                    onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kategori
                </label>
                <select
                  value={newEvent.category}
                  onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value as EventCategory })}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                >
                  <option value="saha_ziyaret">Saha Keşif / Müşteri Ziyareti (Isparta vb.)</option>
                  <option value="musteri_takip">Müşteri Teklif Takip Araması</option>
                  <option value="sevkiyat">Sevkiyat Teslimatı / Ambar Karşılama</option>
                  <option value="odeme">Ödeme / Vade / Çek Takibi</option>
                  <option value="kritik">Kritik Acil Hatırlatma</option>
                  <option value="genel">Genel Şirket Notu</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Konum / Yer
                </label>
                <input
                  type="text"
                  placeholder="Örn: Isparta Modern Evler Şantiyesi, Ambarlar Sitesi..."
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  İlgili Notlar
                </label>
                <textarea
                  rows={2}
                  placeholder="Detaylar, görüşülecek kişi, yapılacak işlem..."
                  value={newEvent.notes}
                  onChange={(e) => setNewEvent({ ...newEvent, notes: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="reminderCheck"
                  checked={newEvent.reminder}
                  onChange={(e) => setNewEvent({ ...newEvent, reminder: e.target.checked })}
                  className="w-4 h-4 text-orange-500 rounded border-slate-300"
                />
                <label htmlFor="reminderCheck" className="text-xs font-medium text-slate-700">
                  Bildirim ve ajanda uyarısı aktif olsun
                </label>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm shadow-sm"
                >
                  Takvime Kaydet
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200"
                >
                  İptal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
