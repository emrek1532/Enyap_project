// Enyap Isı → Google Sheet ("Verilen Teklifler") senkronu
// Sistemde teklif eklenince / değişince / silinince Supabase bu web uygulamasına POST atar.
// Sütunlar: A Teklif No | B Tarih | C Durum | D Firma | E Şehir (formül) | F Teklifi Veren
//           G USD | H EURO | I TL | J Genel Toplam USD (formül) | K Genel Toplam TL (formül) | L Açıklama
var SECRET = 'BURAYA_GIZLI_ANAHTAR';
var SHEET_NAME = 'Verilen Teklifler';
var COLLECTION_SHEET = 'Yapılan Tahsilatlar';
// Tahsilat sütunları: A Tarih | B Firma | C Tahsilat | D Şehir (formül) | E Banka | F Şube | G Çek No
//                     H Tutar | I Vade | J Kayıt No (sistemdeki kimlik; eşleştirme için)
var EXPENSE_SHEET = 'Harcamalar';
// Harcama sütunları: A Tarih | B Açıklama (kategori) | C Kart (ödeme) | D Miktar | E Not | F Kayıt No

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return out_('bad json'); }
  if (data.secret !== SECRET) return out_('forbidden');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (data.kind === 'collection') return collection_(data);
    if (data.kind === 'expense') return expense_(data);
    return quote_(data);
  } finally {
    lock.releaseLock();
  }
}

// Kurulumdan sonra çalıştırıp izin vermek ve sheet'i bulduğunu görmek için
function test() {
  var sh = sheet_();
  Logger.log(sh ? ('Bulundu: ' + sh.getName() + ', son satır ' + lastDataRow_(sh)) : 'Teklif sayfası bulunamadı');
  var col = sheet_(COLLECTION_SHEET);
  Logger.log(col ? ('Bulundu: ' + col.getName() + ', son satır ' + lastDataRow_(col, 2)) : 'Tahsilat sayfası bulunamadı');
  var ex = sheet_(EXPENSE_SHEET);
  Logger.log(ex ? ('Bulundu: ' + ex.getName() + ', son satır ' + lastDataRow_(ex, 1)) : 'Harcama sayfası bulunamadı');
}

// ---- Verilen Teklifler ----
function quote_(data) {
  var sh = sheet_();
  if (!sh) return out_('sheet yok');
  var no = String(data.quoteNumber || '').trim();
  if (!no || no === '-') return out_('skip');

  var row = findRow_(sh, no);
  var oldNo = String(data.oldQuoteNumber || '').trim();
  if (!row && oldNo && oldNo !== '-' && oldNo !== no) row = findRow_(sh, oldNo);

  if (data.action === 'delete') {
    if (row) sh.deleteRow(row);
    return out_('deleted');
  }

  if (!row) {
    var last = lastDataRow_(sh);
    row = last + 1;
    if (last >= 2) {
      // Şehir ve genel toplam formüllerini bir üst satırdan kopyala
      [5, 10, 11].forEach(function (c) { sh.getRange(last, c).copyTo(sh.getRange(row, c)); });
    }
  }

  var p = String(data.date || '').split('-');
  var date = p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date();
  var num = /^\d+$/.test(no) ? Number(no) : no;

  sh.getRange(row, 1, 1, 4).setValues([[num, date, data.status || 'Beklemede', data.customer || '']]);
  sh.getRange(row, 6, 1, 4).setValues([[data.preparedBy || '', Number(data.usd) || 0, Number(data.eur) || 0, Number(data['try']) || 0]]);
  sh.getRange(row, 12).setValue(data.notes || '');
  return out_('ok ' + row);
}

// ---- Harcamalar ----
function expense_(data) {
  var sh = sheet_(EXPENSE_SHEET);
  if (!sh) return out_('harcama sayfası yok');
  if (String(sh.getRange(1, 6).getValue()).trim() === '') sh.getRange(1, 6).setValue('Kayıt No');

  var row = findExpense_(sh, data);
  if (data.action === 'delete') {
    if (row) sh.deleteRow(row);
    return out_('deleted');
  }
  if (!row) row = lastDataRow_(sh, 1) + 1;
  sh.getRange(row, 1, 1, 6).setValues([[
    date_(data.date), data.category || '', data.method || '', Number(data.amount) || 0, data.description || '', data.id || ''
  ]]);
  return out_('ok ' + row);
}

// Önce F sütunundaki kayıt no ile, yoksa (eski satırlar) tarih + açıklama + tutar ile bulur
function findExpense_(sh, data) {
  var last = lastDataRow_(sh, 1);
  if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, 6).getValues();
  var id = String(data.id || '');
  for (var i = 0; i < vals.length; i++) if (id && String(vals[i][5]) === id) return i + 2;
  var o = data.old || data;
  var key = [String(o.date || ''), norm_(o.category || ''), Number(o.amount) || 0].join('|');
  for (var j = 0; j < vals.length; j++) {
    var v = vals[j];
    if (String(v[5]).trim() !== '') continue;
    var k = [ymd_(v[0]), norm_(v[1]), Number(v[3]) || 0].join('|');
    if (k === key) return j + 2;
  }
  return 0;
}

// ---- Yapılan Tahsilatlar ----
function collection_(data) {
  var sh = sheet_(COLLECTION_SHEET);
  if (!sh) return out_('tahsilat sayfası yok');
  if (String(sh.getRange(1, 10).getValue()).trim() === '') sh.getRange(1, 10).setValue('Kayıt No');

  var row = findCollection_(sh, data);
  if (data.action === 'delete') {
    if (row) sh.deleteRow(row);
    return out_('deleted');
  }
  if (!row) {
    var last = lastDataRow_(sh, 2);
    row = last + 1;
    if (last >= 2) sh.getRange(last, 4).copyTo(sh.getRange(row, 4)); // Şehir formülü
  }
  var chk = String(data.checkNo || '').trim();
  sh.getRange(row, 1, 1, 3).setValues([[date_(data.date), data.customer || '', data.method || '']]);
  sh.getRange(row, 5, 1, 6).setValues([[
    data.bank || '', data.branch || '', /^\d+$/.test(chk) ? Number(chk) : chk,
    Number(data.amount) || 0, data.dueDate ? date_(data.dueDate) : '', data.id || ''
  ]]);
  return out_('ok ' + row);
}

// Önce J sütunundaki kayıt no ile, yoksa (Excel'den gelen eski satırlar) tarih + firma + tutar + çek no ile bulur
function findCollection_(sh, data) {
  var last = lastDataRow_(sh, 2);
  if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, 10).getValues();
  var id = String(data.id || '');
  for (var i = 0; i < vals.length; i++) if (id && String(vals[i][9]) === id) return i + 2;
  var o = data.old || data;
  var key = [String(o.date || ''), norm_(o.customer || ''), Number(o.amount) || 0, String(o.checkNo || '').trim()].join('|');
  for (var j = 0; j < vals.length; j++) {
    var v = vals[j];
    if (String(v[9]).trim() !== '') continue;
    var k = [ymd_(v[0]), norm_(v[1]), Number(v[7]) || 0, String(v[6]).trim()].join('|');
    if (k === key) return j + 2;
  }
  return 0;
}

function date_(s) {
  var p = String(s || '').split('-');
  return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : '';
}

function ymd_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return String(v || '');
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var want = norm_(name || SHEET_NAME);
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) if (norm_(all[i].getName()) === want) return all[i];
  return null;
}

function norm_(s) { return String(s).trim().toLocaleLowerCase('tr'); }

function findRow_(sh, no) {
  var last = lastDataRow_(sh);
  if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, 1).getValues();
  var key = String(no).trim();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]).trim() === key) return i + 2;
  return 0;
}

function lastDataRow_(sh, col) {
  var n = sh.getLastRow();
  if (n < 1) return 0;
  var vals = sh.getRange(1, col || 1, n, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]).trim() !== '') return i + 1;
  return 0;
}

function out_(s) { return ContentService.createTextOutput(s); }

// ---- Tek seferlik: "Harcamalar" sayfasını sistemdeki harcamalarla eşitler ----
// Apps Script'te bu fonksiyonu seçip bir kez "Çalıştır"a basın. Kayıt No (F) ile, yoksa eski tarih + tür + tutar ile
// satırı bulur; bulunamayanları sona ekler. Hepsini tek seferde yazar (kilit gerekmez).
var SUPABASE_URL = 'https://aaduhhdwemnyqhnttcat.supabase.co';
var SUPABASE_KEY = 'sb_publishable_r-RVHM4n_fEKQ5pX-L_kvQ_Cg2CDu5r';

function harcamalariEsitle() {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/expense_sheet_export', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    payload: JSON.stringify({ p_token: SECRET })
  });
  if (res.getResponseCode() !== 200) throw new Error('Veri alınamadı: ' + res.getContentText());
  var recs = JSON.parse(res.getContentText()) || [];

  var sh = sheet_(EXPENSE_SHEET);
  if (!sh) throw new Error('Harcamalar sayfası yok');
  sh.getRange(1, 6).setValue('Kayıt No');
  var last = lastDataRow_(sh, 1);
  var vals = last >= 2 ? sh.getRange(2, 1, last - 1, 6).getValues() : [];
  var byId = {}, byKey = {};
  vals.forEach(function (v, i) {
    var id = String(v[5] || '').trim();
    if (id) { byId[id] = i; return; }
    var k = [ymd_(v[0]), norm_(v[1]), Number(v[3]) || 0].join('|');
    (byKey[k] = byKey[k] || []).push(i);
  });
  var updated = 0, added = 0;
  recs.forEach(function (r) {
    // r = [id, tarih, tür, ödeme, tutar, açıklama, eskiTarih, eskiTür, eskiTutar]
    var i = byId[r[0]];
    if (i === undefined && r[6]) {
      var list = byKey[[r[6], norm_(r[7]), Number(r[8]) || 0].join('|')];
      if (list && list.length) i = list.shift();
    }
    var row = [date_(r[1]), r[2], r[3], Number(r[4]) || 0, r[5] || '', r[0]];
    if (i === undefined) { vals.push(row); byId[r[0]] = vals.length - 1; added++; }
    else { vals[i] = row; byId[r[0]] = i; updated++; }
  });
  if (vals.length) sh.getRange(2, 1, vals.length, 6).setValues(vals);
  Logger.log('Güncellenen: ' + updated + ', eklenen: ' + added + ', toplam satır: ' + vals.length);
}

// ---- Tek seferlik: senkron kapalıyken (ör. gizli anahtar yanlışken) girilen teklif ve tahsilatları Sheet'e yazar ----
// GUN_SAYISI kadar geriye giderek o tarihten beri eklenen/değişen kayıtları getirir; var olan satırı günceller, yoksa ekler.
function teklifTahsilatEsitle() {
  var GUN_SAYISI = 10;
  var since = Utilities.formatDate(new Date(Date.now() - GUN_SAYISI * 864e5), 'Europe/Istanbul', 'yyyy-MM-dd');
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/sheet_sync_export', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    payload: JSON.stringify({ p_token: SECRET, p_since: since })
  });
  if (res.getResponseCode() !== 200) throw new Error('Veri alınamadı: ' + res.getContentText());
  var data = JSON.parse(res.getContentText());
  var q = 0, c = 0;
  (data.quotes || []).forEach(function (x) { x.action = 'upsert'; quote_(x); q++; });
  (data.collections || []).forEach(function (x) { x.action = 'upsert'; collection_(x); c++; });
  Logger.log(since + ' tarihinden beri: ' + q + ' teklif, ' + c + ' tahsilat yazıldı');
}
