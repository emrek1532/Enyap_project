// Enyap Isı → Google Sheet ("Verilen Teklifler") senkronu
// Sistemde teklif eklenince / değişince / silinince Supabase bu web uygulamasına POST atar.
// Sütunlar: A Teklif No | B Tarih | C Durum | D Firma | E Şehir (formül) | F Teklifi Veren
//           G USD | H EURO | I TL | J Genel Toplam USD (formül) | K Genel Toplam TL (formül) | L Açıklama
var SECRET = 'BURAYA_GIZLI_ANAHTAR';
var SHEET_NAME = 'Verilen Teklifler';

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return out_('bad json'); }
  if (data.secret !== SECRET) return out_('forbidden');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_();
    if (!sh) return out_('sheet yok');
    var no = String(data.quoteNumber || '').trim();
    if (!no || no === '-') return out_('skip');

    var row = findRow_(sh, no);
    if (!row && data.oldQuoteNumber && data.oldQuoteNumber !== no) row = findRow_(sh, data.oldQuoteNumber);

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
  Logger.log(sh ? ('Bulundu: ' + sh.getName() + ', son satır ' + lastDataRow_(sh)) : 'Sheet bulunamadı');
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var want = norm_(SHEET_NAME);
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

function lastDataRow_(sh) {
  var n = sh.getLastRow();
  if (n < 1) return 0;
  var vals = sh.getRange(1, 1, n, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]).trim() !== '') return i + 1;
  return 0;
}

function out_(s) { return ContentService.createTextOutput(s); }
