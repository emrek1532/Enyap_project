// Enyap Isı → Google Sheet ("Verilen Teklifler") senkronu
// Sistemde teklif eklenince / değişince / silinince Supabase bu web uygulamasına POST atar.
// Sütunlar: A Teklif No | B Tarih | C Durum | D Firma | E Şehir (formül) | F Teklifi Veren
//           G USD | H EURO | I TL | J Genel Toplam USD (formül) | K Genel Toplam TL (formül) | L Açıklama
var SECRET = 'BURAYA_GIZLI_ANAHTAR';
var SHEET_NAME = 'Verilen Teklifler';
var COLLECTION_SHEET = 'Yapılan Tahsilatlar';
// Tahsilat sütunları: A Tarih | B Firma | C Tahsilat | D Şehir (formül) | E Banka | F Şube | G Çek No
//                     H Tutar | I Vade | J Kayıt No (sistemdeki kimlik; eşleştirme için)

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return out_('bad json'); }
  if (data.secret !== SECRET) return out_('forbidden');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (data.kind === 'collection') return collection_(data);
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
