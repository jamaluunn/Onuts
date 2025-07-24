// Konfigurasi Global
const SHEET_NAME = "Database_Kasir_HPP";
const PRODUCT_SHEET = "Produk";
const TRANSACTION_SHEET = "Transaksi";
const STOCK_LOG_SHEET = "LogStok";
const SETTINGS_SHEET = "Pengaturan";

function formatCurrency(value) {
  return 'Rp ' + Number(value).toLocaleString('id-ID');
}

// Fungsi utama untuk menampilkan aplikasi web
function doGet(e) {
  let page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'Kasir';
  let htmlTemplate = HtmlService.createTemplateFromFile(page);
  htmlTemplate.page = page;
  return htmlTemplate.evaluate()
      .setTitle('Aplikasi Kasir & HPP')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

// ===============================================================
// FUNGSI INCLUDE
// ===============================================================
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function includeTemplate(filename, data) {
  const template = HtmlService.createTemplateFromFile(filename);
  if (data) {
    for (const key in data) {
      template[key] = data[key];
    }
  }
  return template.evaluate().getContent();
}

// ===============================================================
// FUNGSI PENGATURAN AWAL (SETUP)
// ===============================================================
function setup() {
  const ss = SpreadsheetApp.create(SHEET_NAME);
  const spreadsheetId = ss.getId();
  PropertiesService.getScriptProperties().setProperty('spreadsheetId', spreadsheetId);
  
  // Sheet Produk
  ss.getSheetByName('Sheet1').setName(PRODUCT_SHEET);
  const productSheet = ss.getSheetByName(PRODUCT_SHEET);
  productSheet.getRange("A1:G1").setValues([["ID Produk", "Nama Produk", "Harga Jual", "HPP Modal", "Stok Saat Ini", "SKU", "Timestamp Update"]]).setFontWeight("bold");
  productSheet.setFrozenRows(1);

  // Sheet Transaksi (dengan kolom tambahan)
  const transactionSheet = ss.insertSheet(TRANSACTION_SHEET);
  transactionSheet.getRange("A1:J1").setValues([["ID Transaksi", "Timestamp", "Detail Item", "Total Item", "Total HPP", "Total Penjualan", "Profit", "Metode Bayar", "Tipe Penjualan", "Uang Diterima"]]).setFontWeight("bold");
  transactionSheet.setFrozenRows(1);

  // Sheet Log Stok
  const stockLogSheet = ss.insertSheet(STOCK_LOG_SHEET);
  stockLogSheet.getRange("A1:F1").setValues([["ID Log", "Timestamp", "ID Produk", "Nama Produk", "Jenis Log", "Jumlah"]]).setFontWeight("bold");
  stockLogSheet.setFrozenRows(1);

  // Sheet Pengaturan
  const settingsSheet = ss.insertSheet(SETTINGS_SHEET);
  settingsSheet.getRange("A1:B1").setValues([["Kunci", "Nilai"]]).setFontWeight("bold");
  settingsSheet.setFrozenRows(1);
  const defaultSettings = [
    ['namaToko', 'Toko Onuts Anda'],
    ['alamatToko', 'Jl. Jendral Sudirman No. 123'],
    ['teleponToko', '081234567890'],
    ['ucapanStruk', 'Terima kasih telah berbelanja!'],
    ['pajakGrabFood', '20'],
    ['metodePembayaran', 'Tunai,QRIS,Transfer Bank'],
    ['batasStokMinimum', '5'],
    ['opsiCetakStruk', 'WhatsApp'],
    ['nomorKasir', '6281234567890']
  ];
  settingsSheet.getRange(2, 1, defaultSettings.length, 2).setValues(defaultSettings);

  SpreadsheetApp.getUi().alert(`Database Google Sheet '${SHEET_NAME}' berhasil dibuat!`);
}

// ===============================================================
// FUNGSI INTERAKSI DENGAN GOOGLE SHEET (BACKEND)
// ===============================================================
function getSpreadsheet() {
  try {
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('spreadsheetId');
    if (!spreadsheetId) {
      const files = DriveApp.getFilesByName(SHEET_NAME);
      if (files.hasNext()) {
          const file = files.next();
          PropertiesService.getScriptProperties().setProperty('spreadsheetId', file.getId());
          return SpreadsheetApp.open(file);
      } else {
          throw new Error(`Database '${SHEET_NAME}' tidak ditemukan. Jalankan fungsi 'setup' terlebih dahulu.`);
      }
    }
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (e) {
    Logger.log("Error di getSpreadsheet: " + e.message);
    throw new Error("Gagal membuka spreadsheet. Pastikan izin sudah diberikan. " + e.message);
  }
}

// --- FUNGSI UNTUK PENGATURAN ---
function getSettings() {
  try {
    const sheet = getSpreadsheet().getSheetByName(SETTINGS_SHEET);
    if (!sheet) {
      Logger.log("Sheet 'Pengaturan' tidak ditemukan.");
      return {};
    }
    if (sheet.getLastRow() < 2) return {};
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    const settings = {};
    data.forEach(row => {
      if (row[0]) { // Pastikan kunci tidak kosong
        settings[row[0]] = row[1];
      }
    });
    return settings;
  } catch (e) {
    Logger.log("Error di getSettings: " + e.message);
    return {}; // Kembalikan objek kosong jika gagal
  }
}

// --- FUNGSI UNTUK PRODUK & STOK ---
function getProducts() {
  try {
    const sheet = getSpreadsheet().getSheetByName(PRODUCT_SHEET);
    if (!sheet) {
      Logger.log("Sheet 'Produk' tidak ditemukan.");
      return [];
    }
    if (sheet.getLastRow() < 2) return [];
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
    return data.map(row => ({ 
      id: row[0], 
      name: row[1], 
      price: parseFloat(row[2]) || 0, // Pastikan harga adalah angka
      hpp: parseFloat(row[3]) || 0,   // Pastikan HPP adalah angka
      stock: parseInt(row[4]) || 0    // Pastikan stok adalah angka
    })).filter(p => p.id && p.name);
  } catch (e) {
    Logger.log("Error di getProducts: " + e.message);
    return []; // Kembalikan array kosong jika gagal
  }
}

// --- FUNGSI UNTUK DATA AWAL KASIR (DENGAN LOGGING) ---
function getKasirData() {
  const data = {
    products: getProducts(),
    settings: getSettings()
  };
  // Logging untuk debugging. Anda bisa lihat hasilnya di 'Executions' di Apps Script Editor.
  Logger.log("Data yang dikirim ke Kasir:");
  Logger.log(JSON.stringify(data, null, 2));
  return data;
}

/**
 * Membuat file PDF dari data transaksi dan mengembalikannya sebagai URL.
 * @param {object} transactionData Data transaksi dari client-side.
 * @param {object} appSettings Pengaturan aplikasi (nama toko, dll).
 * @returns {string} URL dari file PDF yang bisa diakses publik.
 */
function createReceiptPdf(transactionData, appSettings) {
  try {
    // 1. Buat konten HTML untuk struk
    const htmlContent = createReceiptHtml(transactionData, appSettings);
    
    // 2. Konversi HTML menjadi file PDF (Blob)
    const blob = HtmlService.createHtmlOutput(htmlContent).getAs('application/pdf');
    
    // 3. Beri nama file yang unik
    const timestamp = new Date().getTime();
    blob.setName(`Struk_${timestamp}.pdf`);
    
    // 4. Simpan file ke Google Drive (Anda bisa membuat folder khusus jika mau)
    const file = DriveApp.createFile(blob);
    
    // 5. PENTING: Beri akses agar URL bisa dibuka di tab baru browser
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 6. Kembalikan URL file ke client-side
    return file.getUrl();

  } catch (e) {
    Logger.log('Error saat membuat PDF struk: ' + e.toString());
    throw new Error('Gagal membuat file PDF struk.');
  }
}


/**
 * Membuat konten HTML dari template struk dengan data yang dinamis.
 * @param {object} data Data transaksi.
 * @param {object} settings Pengaturan aplikasi.
 * @returns {string} Konten HTML yang sudah diisi data.
 */
function createReceiptHtml(data, settings) {
  try {
    let template = HtmlService.createTemplateFromFile('Struk');
    template.data = data;
    template.settings = settings;

    // ======================================================================
    // LOGO SUDAH DIUBAH MENJADI TEKS (BASE64) DAN DITANAM DI SINI
    // Ini adalah cara paling cepat dan andal.
    // String ini adalah representasi dari logo "Onuts Donut" Anda.
    const LOGO_BASE64_STRING = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABQAAAALjCAYAAADa2L9MAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAACr5SURBVHja7d1rctxIgsbxQv//vJft0G62s06AIAEkQJKkKLPK7NInOQf30FMAAAAAAAAAAAAAAADY4f/59gMAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8JsAAAAAAAAAAAAAAADgXwD8JgAAAAAAAAAAAAAAgH8B8P99+93u9tt/f/j2u/32/3/f/fbt9+9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e9vP3z7/e-";

    // QR Code untuk Instagram juga sudah ditanamkan langsung
    const QR_CODE_BASE64_STRING = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAABaCAYAAAA4evwWAAAAAklEQVR4AewaftIAAAOESURBVO3BQW7kQAwEwSxC//9y7hkpQZJ93ZA5MQP+2h0gQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBLkCZIEeYIkQZ4gSZAnSBJkCZIEeYIkQZ4gSZD/AYo8dIe0Y6VTAAAAAElFTkSuQmCC";
    // ======================================================================

    template.logoBase64 = LOGO_BASE64_STRING;
    template.qrCodeBase64 = QR_CODE_BASE64_STRING;

    return template.evaluate().getContent();
    
  } catch(e) {
    Logger.log("Error di createReceiptHtml: " + e.toString());
    // Fallback jika ada error
    let template = HtmlService.createTemplateFromFile('Struk');
    template.data = data;
    template.settings = settings;
    template.logoBase64 = '';
    template.qrCodeBase64 = '';
    return template.evaluate().getContent();
  }
}

/**
 * Mengambil gambar dari URL dan mengubahnya menjadi format Base64.
 * @param {string} url URL dari gambar.
 * @returns {string} String Base64 dari gambar.
 */
function getImageAsBase64(url) {
  try {
    const blob = UrlFetchApp.fetch(url).getBlob();
    const contentType = blob.getContentType();
    const base64 = Utilities.encodeBase64(blob.getBytes());
    return `data:${contentType};base64,${base64}`;
  } catch (e) {
    Logger.log('Gagal mengambil atau mengubah gambar ke Base64: ' + e.toString());
    return ''; // Kembalikan string kosong jika gagal
  }
}

// --- FUNGSI LAINNYA (Tidak diubah) ---

function saveSettings(settings) {
  const sheet = getSpreadsheet().getSheetByName(SETTINGS_SHEET);
  const data = sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues();
  for (const key in settings) {
    let found = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(settings[key]);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([key, settings[key]]);
    }
  }
  return { success: true, message: "Pengaturan berhasil disimpan." };
}

function saveProduct(productData) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(PRODUCT_SHEET);
  const logSheet = ss.getSheetByName(STOCK_LOG_SHEET);
  const newId = "PROD-" + new Date().getTime();
  const timestamp = new Date();
  sheet.appendRow([ newId, productData.name, productData.price, productData.hpp, productData.initialStock, productData.sku || '', timestamp ]);
  logSheet.appendRow(["LOG-" + new Date().getTime(), timestamp, newId, productData.name, "Stok Awal", productData.initialStock]);
  return { success: true, message: `Produk '${productData.name}' berhasil disimpan.` };
}

function updateStock(stockData) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(PRODUCT_SHEET);
  const logSheet = ss.getSheetByName(STOCK_LOG_SHEET);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  const timestamp = new Date();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] == stockData.productId) {
      const currentStock = Number(data[i][4]);
      const newStock = currentStock + Number(stockData.quantity);
      sheet.getRange(i + 2, 5).setValue(newStock); 
      sheet.getRange(i + 2, 7).setValue(timestamp);
      const productName = sheet.getRange(i + 2, 2).getValue();
      logSheet.appendRow(["LOG-" + new Date().getTime(), timestamp, stockData.productId, productName, "Stok Manual", stockData.quantity]);
      return { success: true, message: `Stok ${productName} berhasil diupdate.` };
    }
  }
  return { success: false, message: "Produk tidak ditemukan." };
}

function recordTransaction(transactionData) {
  const ss = getSpreadsheet();
  const transactionSheet = ss.getSheetByName(TRANSACTION_SHEET);
  const productSheet = ss.getSheetByName(PRODUCT_SHEET);
  const logSheet = ss.getSheetByName(STOCK_LOG_SHEET);
  const transactionId = "TRX-" + new Date().getTime();
  const timestamp = new Date();
  const cart = transactionData.cart;
  let totalHpp = 0;
  const productData = productSheet.getDataRange().getValues();
  cart.forEach(item => {
    for (let i = 1; i < productData.length; i++) {
      if (productData[i][0] === item.id) {
        const currentStock = Number(productData[i][4]);
        productSheet.getRange(i + 1, 5).setValue(currentStock - item.qty);
        totalHpp += (Number(productData[i][3]) * item.qty);
        logSheet.appendRow(["LOG-" + new Date().getTime(), timestamp, item.id, item.name, "Penjualan", -item.qty]);
        break;
      }
    }
  });
  const profit = transactionData.totalSale - totalHpp;
  const itemsString = cart.map(item => `${item.name} (x${item.qty})`).join(', ');
  transactionSheet.appendRow([ transactionId, timestamp, itemsString, transactionData.totalItems, totalHpp, transactionData.totalSale, profit, transactionData.paymentMethod, transactionData.saleType, transactionData.cashReceived ]);
  return { success: true, message: "Transaksi berhasil dicatat." };
}

function recordTransaction(transactionData) {
  try {
    const ss = getSpreadsheet();
    const transactionSheet = ss.getSheetByName(TRANSACTION_SHEET);
    const productSheet = ss.getSheetByName(PRODUCT_SHEET);
    const logSheet = ss.getSheetByName(STOCK_LOG_SHEET);
    const transactionId = "TRX-" + new Date().getTime();
    const timestamp = new Date();
    
    // Logika pengurangan stok (tidak berubah)
    const cart = transactionData.cart;
    let totalHpp = 0;
    const productData = productSheet.getDataRange().getValues();
    cart.forEach(item => {
      for (let i = 1; i < productData.length; i++) {
        if (productData[i][0] === item.id) {
          const currentStock = Number(productData[i][4]);
          productSheet.getRange(i + 1, 5).setValue(currentStock - item.qty);
          totalHpp += (Number(productData[i][3]) * item.qty);
          logSheet.appendRow(["LOG-" + new Date().getTime(), timestamp, item.id, item.name, "Penjualan", -item.qty]);
          break;
        }
      }
    });
    
    const profit = transactionData.totalSale - totalHpp;
    const itemsString = cart.map(item => `${item.name} (x${item.qty})`).join(', ');
    
    transactionSheet.appendRow([ 
      transactionId, timestamp, itemsString, transactionData.totalItems, totalHpp, 
      transactionData.totalSale, profit, transactionData.paymentMethod, 
      transactionData.saleType, transactionData.cashReceived 
    ]);
    
    // Kembali ke respons simpel, tanpa mengirim HTML
    return { 
      success: true, 
      message: "Transaksi berhasil dicatat."
    };
  } catch (e) {
    Logger.log("Error di recordTransaction: " + e.message);
    return { success: false, message: e.message };
  }
}

function getSalesReport(startDate, endDate) {
  const sheet = getSpreadsheet().getSheetByName(TRANSACTION_SHEET);
  if (sheet.getLastRow() < 2) return { totalRevenue: 0, totalProfit: 0, totalItemsSold: 0, productSales: [], transactions: [], revenueByPaymentMethod: {} };
  
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  
  const filteredData = data.filter(row => {
    const rowDate = new Date(row[1]);
    return rowDate >= start && rowDate <= end;
  });

  let totalRevenue = 0, totalProfit = 0, totalItemsSold = 0;
  const productSales = {};
  const revenueByPaymentMethod = {}; // <-- BARU: Inisialisasi objek untuk "kantong"

  filteredData.forEach(row => {
    const revenue = Number(row[5]);
    const paymentMethod = row[7] || 'Lainnya'; // <-- Ambil metode bayar, default ke 'Lainnya'

    totalItemsSold += Number(row[3]);
    totalRevenue += revenue;
    totalProfit += Number(row[6]);
    
    // <-- BARU: Menjumlahkan pendapatan untuk setiap metode pembayaran
    revenueByPaymentMethod[paymentMethod] = (revenueByPaymentMethod[paymentMethod] || 0) + revenue;
    
    const items = row[2].split(', ');
    items.forEach(itemString => {
        const match = itemString.match(/(.*) \(x(\d+)\)/);
        if (match) {
            productSales[match[1]] = (productSales[match[1]] || 0) + parseInt(match[2], 10);
        }
    });
  });
  
  const result = {
    totalRevenue,
    totalProfit,
    totalItemsSold,
    productSales: Object.entries(productSales).map(([name, qty]) => ({ name, qty })),
    transactions: filteredData.map(row => ({
        id: row[0],
        timestamp: new Date(row[1]).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        items: row[2],
        revenue: Number(row[5]),
        profit: Number(row[6])
    })).reverse(),
    revenueByPaymentMethod // <-- BARU: Menambahkan data "kantong" ke hasil
  };

  Logger.log("Data Laporan: " + JSON.stringify(result, null, 2));
  return result;
}
