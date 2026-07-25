/**
 * GymSheetSync.gs
 * -----------------------------------------------------------------------
 * Paste this into Extensions > Apps Script inside the "GF" spreadsheet
 * itself (Tools > Script editor on old Sheets), then deploy it as a Web
 * App (Deploy > New deployment > type: Web app, execute as: Me, who has
 * access: Anyone with the link). Copy the resulting /exec URL and the
 * SHARED_SECRET below into sheets-sync.js in the Gym Fit app.
 *
 * SAFETY MODEL - read this before changing anything:
 *  - Every action below only ever touches a small, explicit whitelist of
 *    cells. Nothing here ever does a broad range write, so a bad request
 *    can, at worst, write one wrong number in one known cell - never wipe
 *    a sheet or formulas.
 *  - Before writing, addSubscription/addOneTime/addExpense check that the
 *    "День N" tab's own header date matches the date the app thinks it is.
 *    If the gym owner hasn't created next month's day-tabs yet, requests
 *    fail loudly instead of silently landing in the wrong tab.
 *  - A LockService lock serializes writes so two kiosk taps at the same
 *    moment can't land in the same free cell.
 *  - Every successful write is also appended to a "AppLog" tab (created
 *    automatically) as a plain, additive audit trail - never overwritten.
 */

// Change this to any random string, then put the same value in
// sheets-sync.js as GYM_SHEETS_TOKEN. Anyone without this token gets
// rejected before any sheet is touched.
const SHARED_SECRET = 'CHANGE-ME-TO-A-RANDOM-STRING';

// Row/column map for the one-off income rows inside each "День N" tab.
// Each entry has a cash ("Н") row and a card ("К") row; free-form amounts
// go into the first empty cell across columns B..P on that row, and column
// S already contains a SUM(B:P) formula in the template, so it updates on
// its own without us touching it.
const ONE_TIME_ROWS = {
  razovye: { cash: 29, card: 30 },   // РАЗОВЫЕ ТРЕНИРОВКИ
  napitki: { cash: 33, card: 34 },   // НАПИТКИ
  sportpit: { cash: 37, card: 38 },  // СПОРТИВНОЕ ПИТАНИЕ
};

// Row map for the expense table. Each is a single running-total cell in
// column S (plus an optional comment in column E), not a per-transaction
// list, so new amounts get added on top of whatever is already there.
const EXPENSE_ROWS = {
  zal: 42,       // ОБЩИЕ РАСХОДЫ ЗАЛА
  sportpit: 43,  // РАСХОД СПОРТПИТ
  napitki: 44,   // РАСХОД НАПИТКИ
  admin: 45,     // РАСХОД АДМИНИСТРАТОРА
  other: 46,     // ПРОЧИЕ РАСХОДЫ
};

const SUBSCRIPTION_FIRST_ROW = 6;
const SUBSCRIPTION_LAST_ROW = 25;
const ONE_TIME_FIRST_COL = 2;  // column B
const ONE_TIME_LAST_COL = 16;  // column P

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return jsonResponse({ ok: false, message: 'Сервер занят, попробуйте ещё раз через пару секунд.' });
  }

  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.token !== SHARED_SECRET) {
      return jsonResponse({ ok: false, message: 'Неверный токен доступа.' });
    }

    const dateStr = body.date; // 'YYYY-MM-DD', taken from the client's local date
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return jsonResponse({ ok: false, message: 'Некорректная дата.' });
    }

    const sheet = getVerifiedDaySheet(dateStr);
    if (!sheet.ok) return jsonResponse(sheet);

    let result;
    switch (body.action) {
      case 'addSubscription':
        result = addSubscription(sheet.sheet, body);
        break;
      case 'addOneTime':
        result = addOneTime(sheet.sheet, body);
        break;
      case 'addExpense':
        result = addExpense(sheet.sheet, body);
        break;
      default:
        result = { ok: false, message: 'Неизвестное действие: ' + body.action };
    }

    if (result.ok) logAction(body, result);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, message: 'Ошибка сервера: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Resolves the "День N" tab for the given date and makes sure that tab's
 * own header (row 2, e.g. "01.07.2026     День 01") actually matches the
 * month/year we expect - refuses to write otherwise, since a mismatch
 * means the gym owner hasn't set up that month's tabs yet.
 */
function getVerifiedDaySheet(dateStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDate();
  const sheetName = 'День ' + day;
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return { ok: false, message: 'Вкладка "' + sheetName + '" не найдена в таблице.' };
  }

  const header = String(sheet.getRange('A2').getValue() || '');
  const expectedMonthYear = Utilities.formatDate(date, ss.getSpreadsheetTimeZone(), 'MM.yyyy');
  if (header.indexOf(expectedMonthYear) === -1) {
    return {
      ok: false,
      message: 'Вкладка "' + sheetName + '" не похожа на ' + dateStr + ' (заголовок: "' + header + '"). ' +
        'Похоже, таблица на этот месяц ещё не подготовлена - ничего не записано.',
    };
  }

  return { ok: true, sheet: sheet };
}

/** Finds the first row in [firstRow, lastRow] where every column in `cols` is empty. */
function findFirstEmptyRow(sheet, firstRow, lastRow, cols) {
  for (let row = firstRow; row <= lastRow; row++) {
    const allEmpty = cols.every(col => {
      const v = sheet.getRange(row, col).getValue();
      return v === '' || v === null;
    });
    if (allEmpty) return row;
  }
  return -1;
}

/** Finds the first empty cell in a single row across [firstCol, lastCol]. */
function findFirstEmptyCol(sheet, row, firstCol, lastCol) {
  for (let col = firstCol; col <= lastCol; col++) {
    const v = sheet.getRange(row, col).getValue();
    if (v === '' || v === null) return col;
  }
  return -1;
}

function addSubscription(sheet, body) {
  const amount = Number(body.amount);
  if (!amount || amount <= 0) return { ok: false, message: 'Некорректная сумма.' };
  if (body.method !== 'cash' && body.method !== 'card') return { ok: false, message: 'Некорректный способ оплаты.' };

  // Column N = cash, Column P = card (both empty on a free row).
  const row = findFirstEmptyRow(sheet, SUBSCRIPTION_FIRST_ROW, SUBSCRIPTION_LAST_ROW, [14, 16]);
  if (row === -1) return { ok: false, message: 'Все 20 строк абонементов на этот день уже заняты.' };

  if (body.fullName) sheet.getRange(row, 2).setValue(String(body.fullName)); // B: ФИО
  sheet.getRange(row, 12).setValue(body.date); // L: ДАТА
  const targetCol = body.method === 'cash' ? 14 : 16; // N or P
  sheet.getRange(row, targetCol).setValue(amount);

  return { ok: true, message: 'Абонемент добавлен в таблицу (строка ' + row + ').' };
}

function addOneTime(sheet, body) {
  const amount = Number(body.amount);
  if (!amount || amount <= 0) return { ok: false, message: 'Некорректная сумма.' };
  if (body.method !== 'cash' && body.method !== 'card') return { ok: false, message: 'Некорректный способ оплаты.' };

  const rows = ONE_TIME_ROWS[body.category];
  if (!rows) return { ok: false, message: 'Неизвестная категория: ' + body.category };

  const row = body.method === 'cash' ? rows.cash : rows.card;
  const col = findFirstEmptyCol(sheet, row, ONE_TIME_FIRST_COL, ONE_TIME_LAST_COL);
  if (col === -1) return { ok: false, message: 'Нет свободных ячеек в этой строке - обратитесь к разработчику.' };

  sheet.getRange(row, col).setValue(amount);
  return { ok: true, message: 'Добавлено в таблицу.' };
}

function addExpense(sheet, body) {
  const amount = Number(body.amount);
  if (!amount || amount <= 0) return { ok: false, message: 'Некорректная сумма.' };

  const row = EXPENSE_ROWS[body.category];
  if (!row) return { ok: false, message: 'Неизвестная категория расхода: ' + body.category };

  const amountCell = sheet.getRange(row, 19); // S
  const current = Number(amountCell.getValue()) || 0;
  amountCell.setValue(current + amount);

  if (body.comment) {
    const commentCell = sheet.getRange(row, 5); // E (top-left of merged E:R)
    const existing = String(commentCell.getValue() || '').trim();
    commentCell.setValue(existing ? existing + '; ' + body.comment : String(body.comment));
  }

  return { ok: true, message: 'Расход добавлен в таблицу.' };
}

/** Additive-only audit trail - never overwrites anything, just appends a row. */
function logAction(body, result) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let log = ss.getSheetByName('AppLog');
  if (!log) {
    log = ss.insertSheet('AppLog');
    log.appendRow(['Timestamp', 'Action', 'Category', 'Amount', 'Method', 'Date', 'Result']);
  }
  log.appendRow([
    new Date(),
    body.action || '',
    body.category || '',
    body.amount || '',
    body.method || '',
    body.date || '',
    result.message || '',
  ]);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
