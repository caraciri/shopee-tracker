// ============================================================
// GOOGLE APPS SCRIPT — Shopee Affiliate Tracker
// Paste kode ini di: script.google.com
// Lalu Deploy sebagai Web App (lihat panduan di tools)
// ============================================================

const SHEET_NAME = 'Data Iklan'; // Nama sheet tab

function doPost(e) {
  try {
    const ss     = SpreadsheetApp.getActiveSpreadsheet();
    let sheet    = ss.getSheetByName(SHEET_NAME);

    // Buat sheet + header otomatis jika belum ada
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        'Tanggal', 'Produk', 'Spend Meta Ads (Rp)',
        'Komisi Shopee (Rp)', 'Profit/Rugi (Rp)', 'ROAS',
        'Klik', 'Catatan', 'Waktu Input'
      ]);
      // Format header
      const header = sheet.getRange(1, 1, 1, 9);
      header.setBackground('#1a1a18').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidths(1, 9, 150);
    }

    const data    = JSON.parse(e.postData.contents);
    const profit  = (data.commission || 0) - (data.spend || 0);
    const roas    = data.spend > 0
      ? Math.round((data.commission / data.spend) * 100) / 100
      : 0;
    const now     = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    const newRow = [
      data.date        || '',
      data.product     || '—',
      data.spend       || 0,
      data.commission  || 0,
      profit,
      roas,
      data.clicks      || 0,
      data.note        || '',
      now
    ];

    sheet.appendRow(newRow);

    // Auto format kolom angka
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 3, 1, 5).setNumberFormat('#,##0');
    sheet.getRange(lastRow, 6, 1, 1).setNumberFormat('0.00');

    // Warnai baris berdasarkan profit/rugi
    const rowRange = sheet.getRange(lastRow, 1, 1, 9);
    if (profit > 0) {
      rowRange.setBackground('#e8f5ee');
    } else if (profit < 0) {
      rowRange.setBackground('#faebeb');
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', row: lastRow }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Fungsi ini untuk test — jalankan manual di editor
function testWrite() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        date: '2026-04-21',
        product: 'Test Produk',
        spend: 100000,
        commission: 250000,
        clicks: 320,
        note: 'Test dari editor'
      })
    }
  };
  const result = doPost(mockEvent);
  Logger.log(result.getContent());
}
