/**
 * SHEETS-SYNC.JS: bridges the app to the "GF" Google Sheet via a Google
 * Apps Script Web App (see GymSheetSync.gs). The app never talks to the
 * Sheets API directly and never sends a broad write - every call names one
 * specific, whitelisted action (addSubscription/addOneTime/addExpense),
 * and the Apps Script itself is what actually decides which single cell
 * gets touched.
 *
 * SETUP (one-time, done by the gym owner in the spreadsheet):
 *  1. Open the spreadsheet -> Extensions > Apps Script.
 *  2. Paste the contents of GymSheetSync.gs, replacing SHARED_SECRET with
 *     a random string.
 *  3. Deploy > New deployment > type "Web app" > execute as "Me" > who has
 *     access "Anyone with the link" > Deploy. Copy the /exec URL.
 *  4. Paste that URL into GYM_SHEETS_WEBHOOK_URL in config.js, and the same
 *     SHARED_SECRET into GYM_SHEETS_TOKEN in config.js (see config.example.js).
 * Until both are filled in, every call below fails safely with a toast
 * instead of doing nothing silently.
 */

function isGymSheetsConfigured() {
    return !!GYM_SHEETS_WEBHOOK_URL && !!GYM_SHEETS_TOKEN;
}

/**
 * Sends one whitelisted action to the Apps Script web app.
 * @param {'addSubscription'|'addOneTime'|'addExpense'} action
 * @param {object} payload Action-specific fields (see GymSheetSync.gs).
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
async function postToGymSheet(action, payload) {
    if (!isGymSheetsConfigured()) {
        return { ok: false, message: 'Синхронизация с таблицей не настроена. Обратитесь к разработчику.' };
    }

    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local date
    const body = { token: GYM_SHEETS_TOKEN, action, date: today, ...payload };

    try {
        const res = await fetch(GYM_SHEETS_WEBHOOK_URL, {
            method: 'POST',
            // text/plain avoids a CORS preflight against the Apps Script
            // endpoint, which doesn't handle OPTIONS requests.
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(body),
        });
        return await res.json();
    } catch (err) {
        console.error('Gym sheet sync error:', err);
        return { ok: false, message: 'Не удалось связаться с таблицей. Проверьте интернет.' };
    }
}

window.postToGymSheet = postToGymSheet;
window.isGymSheetsConfigured = isGymSheetsConfigured;
