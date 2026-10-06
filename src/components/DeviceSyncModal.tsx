import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Key, 
  Download, 
  Upload, 
  RefreshCw, 
  Smartphone, 
  Monitor, 
  Check, 
  Copy, 
  Share2, 
  Database,
  Wifi,
  WifiOff,
  AlertCircle
} from 'lucide-react';
import { AppData, SyncStatus } from '../types';
import { createExportBackup, parseImportBackup, getStoredPassphrase, setStoredPassphrase } from '../lib/storage';

interface DeviceSyncModalProps {
  data: AppData;
  syncStatus: SyncStatus;
  onTriggerSync: () => void;
  onImportData: (newData: AppData) => void;
  onResetDemo: () => void;
  onClose: () => void;
}

export const DeviceSyncModal: React.FC<DeviceSyncModalProps> = ({
  data,
  syncStatus,
  onTriggerSync,
  onImportData,
  onResetDemo,
  onClose,
}) => {
  const [passphrase, setPassphrase] = useState(getStoredPassphrase());
  const [encryptBackups, setEncryptBackups] = useState(true);
  const [keySaved, setKeySaved] = useState(false);
  const [exportCode, setExportCode] = useState('');
  const [importCode, setImportCode] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleSavePassphrase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) return;
    setStoredPassphrase(passphrase.trim());
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2500);
  };

  const handleGenerateExportCode = async () => {
    try {
      const backupStr = await createExportBackup(data, encryptBackups, passphrase);
      // Create mini base64 representation for sharing
      const b64 = window.btoa(unescape(encodeURIComponent(backupStr)));
      setExportCode(b64);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadFile = async () => {
    const backupStr = await createExportBackup(data, encryptBackups, passphrase);
    const blob = new Blob([backupStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enyap-isi-yedek-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSubmit = async () => {
    setImportError(null);
    setImportSuccess(false);

    try {
      let rawJson = importCode.trim();
      // If it's base64 encoded string, decode it
      if (!rawJson.startsWith('{') && !rawJson.startsWith('[')) {
        try {
          rawJson = decodeURIComponent(escape(window.atob(rawJson)));
        } catch {
          // keep rawJson
        }
      }

      const imported = await parseImportBackup(rawJson, passphrase);
      onImportData(imported);
      setImportSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setImportError(err.message || 'Veri aktarımı okunamadı.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        setImportCode(text);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg">
                Uçtan Uca Şifreleme & Cihazlar Arası Aktarım
              </h3>
              <p className="text-xs text-slate-400">
                AES-GCM 256-bit Güvenlik ve Isparta &rarr; İstanbul Veri Eşitlemesi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs sm:text-sm">
          
          {/* Section 1: Cloud & Offline Status */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Database className="w-4 h-4 text-sky-600" />
                Bulut & Çevrimdışı Çalışma Durumu
              </span>
              <span className={`flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-bold ${
                syncStatus.isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {syncStatus.isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                {syncStatus.isOnline ? 'Çevrimiçi (Bulut Aktif)' : 'Çevrimdışı (Yerel Depolama)'}
              </span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Teklifler</span>
                <span className="font-bold text-slate-800 text-sm">{data.quotes?.length || 0} Adet</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Sipariş & Sevk</span>
                <span className="font-bold text-slate-800 text-sm">{data.orders?.length || 0} Adet</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Takvim Notları</span>
                <span className="font-bold text-slate-800 text-sm">{data.events?.length || 0} Adet</span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-slate-400 block text-[10px]">Hızlı Notlar</span>
                <span className="font-bold text-slate-800 text-sm">{data.notes?.length || 0} Adet</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500">
                Son Eşitleme: {syncStatus.lastSyncedAt ? syncStatus.lastSyncedAt.toLocaleTimeString('tr-TR') : 'Şimdi'}
              </span>
              <button
                onClick={onTriggerSync}
                disabled={syncStatus.isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-xs transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
                <span>{syncStatus.isSyncing ? 'Senkronize Ediliyor...' : 'Şimdi Senkronize Et'}</span>
              </button>
            </div>
          </div>

          {/* Section 2: End-to-End Encryption Key */}
          <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-emerald-950 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600" />
                Uçtan Uca Şifreleme (E2EE) Anahtarı
              </h4>
              <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded">
                AES-GCM 256-bit
              </span>
            </div>
            <p className="text-xs text-emerald-900/80">
              Şirket teklifleri ve müşteri telefonları istemci tarafında şifrelenir. Hem Isparta saha hem de İstanbul ofis cihazınızda aynı şifreleme anahtarını kullanarak güvenli veri alışverişi yapabilirsiniz.
            </p>

            <form onSubmit={handleSavePassphrase} className="flex gap-2">
              <div className="relative flex-1">
                <Key className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-emerald-300 rounded-lg text-xs sm:text-sm font-mono bg-white text-slate-800"
                  placeholder="Şifreleme parolası..."
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs flex items-center gap-1 shrink-0"
              >
                {keySaved ? <Check className="w-3.5 h-3.5" /> : null}
                <span>{keySaved ? 'Kaydedildi' : 'Kaydet'}</span>
              </button>
            </form>
          </div>

          {/* Section 3: Device-to-Device Fast Transfer */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <h4 className="font-bold text-slate-900 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-orange-500" />
              Cihazlar Arası Kolay Veri Aktarımı (Yedek & Eşitleme)
            </h4>

            {/* Option A: Download / Upload JSON File */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={handleDownloadFile}
                className="flex items-center justify-center gap-2 p-3 rounded-xl bg-white border border-slate-200 hover:border-orange-400 hover:bg-orange-50/30 transition-all font-bold text-slate-800 text-xs shadow-2xs"
              >
                <Download className="w-4 h-4 text-orange-500" />
                <span>Yedek Dosyasını İndir (.JSON)</span>
              </button>

              <label className="flex items-center justify-center gap-2 p-3 rounded-xl bg-white border border-slate-200 hover:border-sky-400 hover:bg-sky-50/30 transition-all font-bold text-slate-800 text-xs shadow-2xs cursor-pointer">
                <Upload className="w-4 h-4 text-sky-500" />
                <span>Yedek Dosyası Yükle (.JSON)</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Option B: Fast Transfer Code (Copy & Paste) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Hızlı Aktarım Kodu ile Eşitle:
                </label>
                <button
                  onClick={handleGenerateExportCode}
                  className="text-xs text-orange-600 font-bold hover:underline"
                >
                  Şimdi Aktarım Kodu Oluştur &rarr;
                </button>
              </div>

              {exportCode && (
                <div className="relative">
                  <textarea
                    readOnly
                    rows={2}
                    value={exportCode}
                    className="w-full p-2 pr-16 bg-white border border-slate-300 rounded-lg font-mono text-[11px] text-slate-700"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(exportCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="absolute right-2 top-2 px-2 py-1 bg-slate-900 text-white rounded text-[11px] font-bold flex items-center gap-1"
                  >
                    {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCode ? 'Kopyalandı' : 'Kopyala'}</span>
                  </button>
                </div>
              )}

              {/* Import Area */}
              <div className="space-y-1.5 pt-1">
                <textarea
                  rows={2}
                  placeholder="Diğer cihazdan kopyalanan aktarım kodunu veya JSON verisini buraya yapıştırın..."
                  value={importCode}
                  onChange={(e) => setImportCode(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono bg-white"
                />

                {importError && (
                  <p className="text-xs text-rose-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {importError}
                  </p>
                )}
                {importSuccess && (
                  <p className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    Veriler başarıyla içe aktarıldı ve eşitlendi!
                  </p>
                )}

                <button
                  onClick={handleImportSubmit}
                  disabled={!importCode.trim()}
                  className="w-full py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs transition-colors disabled:opacity-50"
                >
                  Verileri Bu Cihaza Yükle & Eşitle
                </button>
              </div>
            </div>

          </div>

          {/* Section 4: Demo Data Reset */}
          <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs text-slate-400">
            <span>Enyap Isı Portalı v1.0.0</span>
            <button
              onClick={() => {
                if (confirm('DİKKAT: Buluttaki TÜM veriler silinip örnek Enyap Isı verileriyle değiştirilecek. Bu işlem tüm cihazları etkiler. Devam edilsin mi?')) {
                  onResetDemo();
                  onClose();
                }
              }}
              className="text-slate-500 hover:text-slate-800 underline"
            >
              Örnek Verileri Yükle (Tümünü Sıfırla)
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
