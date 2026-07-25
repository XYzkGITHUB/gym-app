/**
 * SCRIPT-KIOSK.JS: KIOSK MODE MODULE
 * Handles the admin-only kiosk mode for new user registration and check-ins.
 */

// A flag to prevent multiple scans at once
let isKioskProcessing = false;
// A special string to identify the registration QR code
const KIOSK_REG_PAYLOAD = 'GYMFIT_KIOSK_REGISTER_NEW_USER';
// A temporary object to hold registration data between verification steps
let kioskRegData = {};
// A list of recently scanned users
let recentScans = [];
let isRecentScansVisible = false;

// Sound configuration
const SOUND_PATH = './sounds/';
const ACCEPT_SOUNDS = ['blip1.mp3', 'blip2.mp3', 'blip3.mp3', 'blip4.mp3', 'blip5.mp3', 'blip6.mp3', 'blip7.mp3', 'blip8.mp3', 'blip9.mp3'];
const DECLINE_SOUNDS = ['decline1.mp3', 'decline2.mp3', 'decline3.mp3', 'decline4.mp3'];
const DEFAULT_ACCEPT_SOUND = 'accept/blip8.mp3';
const DEFAULT_DECLINE_SOUND = 'decline/decline3.mp3';

/**
 * Plays a sound for kiosk feedback.
 * @param {'accept' | 'decline'} type The type of sound to play.
 */
function playKioskSound(type) {
    const storedSound = localStorage.getItem(`kiosk_${type}_sound`);
    if (storedSound === 'none') return;

    const soundFile = storedSound || (type === 'accept' ? DEFAULT_ACCEPT_SOUND : DEFAULT_DECLINE_SOUND);
    const audioEl = document.getElementById(`kiosk-${type}-sound`);
    if (audioEl) {
        audioEl.src = `${SOUND_PATH}${soundFile}`;
        audioEl.play().catch(e => console.error("Sound play error:", e));
    }
}

/**
 * Shows a full-screen flash effect with a message.
 * @param {object} profile The user profile object.
 * @param {'accepted' | 'declined'} status The status of the scan.
 */
function showScanFeedback(profile, status) {
    const overlay = document.getElementById('scan-flash-overlay');
    if (!overlay) return;

    const isSuccess = status === 'accepted';
    overlay.className = `scan-flash-overlay ${isSuccess ? 'success' : 'error'}`;
    
    const message = isSuccess 
        ? `Добро пожаловать, ${profile.full_name.split(' ')[0]}!`
        : `${profile.full_name.split(' ')[0]}: Абонемент не активен`;

    overlay.innerHTML = `<div class="flash-message">${message}</div>`;
    
    playKioskSound(isSuccess ? 'accept' : 'decline');
    
    overlay.classList.add('visible');

    if (isSuccess) {
        const flashMessage = overlay.querySelector('.flash-message');
        const subtext = document.createElement('p');
        subtext.style.cssText = 'font-size: 0.9rem; opacity: 0.7; margin-top: 10px;';
        subtext.textContent = 'Перенаправление в профиль?';
        flashMessage.appendChild(subtext);
    }

    setTimeout(() => {
        overlay.classList.remove('visible');
    }, isSuccess ? 4000 : 3500);
}

/**
 * Renders the list of recently scanned users, split into two independently
 * scrollable sections (accepted / declined) holding up to 10 each.
 */
function renderRecentScans() {
    const panel = document.getElementById('recent-scans-panel');
    if (!panel) return;

    const listContainer = panel.querySelector('.recent-scans-list');
    if (!listContainer) return;

    const accepted = recentScans.filter(s => s.status === 'accepted');
    const declined = recentScans.filter(s => s.status === 'declined');

    const renderSection = (title, scans) => {
        let html = `<h4>${title} (${scans.length})</h4><div class="recent-scan-scroll">`;
        if (scans.length > 0) {
            html += scans.map(scan => `
                <div class="recent-scan-item ${scan.status === 'declined' ? 'declined' : ''}" data-scan-timestamp="${scan.timestamp}">
                    <div style="flex:1; text-align: left;">
                        <div class="scan-item-name" style="color: var(--fg); font-weight: 700;">${scan.profile.full_name}</div>
                        <div style="color: var(--muted); font-size: 0.7rem;">${new Date(scan.timestamp).toLocaleTimeString('ru-RU')}</div>
                    </div>
                    <button class="trash-btn" data-scan-timestamp="${scan.timestamp}"><i data-lucide="trash-2"></i></button>
                </div>
            `).join('');
        } else {
            html += '<p style="font-size: 0.8rem; color: var(--muted); text-align: center;">Нет</p>';
        }
        return html + '</div>';
    };

    listContainer.innerHTML = `<div class="recent-scan-section">${renderSection('Принято', accepted)}</div><div class="recent-scan-section">${renderSection('Отклонено', declined)}</div>`;
    if (window.lucide) lucide.createIcons();

    // Add event listeners
    panel.querySelectorAll('.trash-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const timestamp = parseInt(btn.dataset.scanTimestamp, 10);
            recentScans = recentScans.filter(s => s.timestamp !== timestamp);
            renderRecentScans();
        };
    });

    panel.querySelectorAll('.recent-scan-item').forEach(item => {
        item.onclick = () => {
            const timestamp = parseInt(item.dataset.scanTimestamp, 10);
            const scan = recentScans.find(s => s.timestamp === timestamp);
            if (!scan) return;

            if (!scan.found) {
                window.showToast('Профиль не найден в базе', 'error');
                return;
            }

            renderKioskClientProfileModal(scan.profile);
        };
    });
}

/**
 * Handles a check-in scan within the kiosk. Shows a toast, marks attendance, but does not navigate away.
 * @param {string} scannedUserId The user ID from the QR code.
 */
async function handleKioskCheckIn(scannedUserId) {
    if (isKioskProcessing) return;
    isKioskProcessing = true;
    setTimeout(() => { isKioskProcessing = false; }, 3000);

    try {
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', scannedUserId)
            .maybeSingle();

        if (profileError || !profile) {
            const fakeProfile = { full_name: 'Неизвестный' };
            showScanFeedback(fakeProfile, 'declined');
            addRecentScan({ full_name: `Не найден (${scannedUserId.slice(0,8)}...)`, id: scannedUserId }, 'declined', false);
            return;
        }

        if (!profile.subscription_status) {
            showScanFeedback(profile, 'declined');
            addRecentScan(profile, 'declined');
            promptKioskClientChange(profile);
            return;
        }

        const today = new Date().toLocaleDateString('en-CA');
        const { data: existingAttendance, error: attendanceError } = await supabaseClient
            .from('attendance')
            .select('id')
            .eq('user_id', scannedUserId)
            .gte('visit_date', `${today}T00:00:00`)
            .lte('visit_date', `${today}T23:59:59`)
            .limit(1);

        if (attendanceError) throw attendanceError;

        if (!existingAttendance || existingAttendance.length === 0) {
            const { error: insertError } = await supabaseClient
                .from('attendance')
                .insert([{ user_id: scannedUserId, visit_date: today }]);

            if (insertError) throw insertError;
        }

        showScanFeedback(profile, 'accepted');
        addRecentScan(profile, 'accepted');
        promptKioskClientChange(profile);

    } catch (err) {
        console.error("Kiosk check-in error:", err);
        playKioskSound('decline');
    }
}

/**
 * Adds a scan to the recent scans list, keeping up to 10 accepted and 10
 * declined entries independently (older entries of each kind drop off).
 * @param {object} profile The user profile.
 * @param {'accepted' | 'declined'} status The scan status.
 * @param {boolean} found Whether this corresponds to a real profile in the DB.
 */
function addRecentScan(profile, status, found = true) {
    recentScans.unshift({ profile, status, timestamp: Date.now(), found });

    let acceptedCount = 0;
    let declinedCount = 0;
    recentScans = recentScans.filter(scan => {
        if (scan.status === 'accepted') {
            if (acceptedCount >= 10) return false;
            acceptedCount++;
        } else {
            if (declinedCount >= 10) return false;
            declinedCount++;
        }
        return true;
    });

    renderRecentScans();
}

/**
 * Asks the admin whether they want to make changes to the scanned client,
 * opening the kiosk profile popup (same visual style as the admin client
 * card) without leaving kiosk mode.
 * @param {object} profile The full profile row for the scanned client.
 */
function promptKioskClientChange(profile) {
    window.showModal({
        title: 'Внести изменения?',
        content: `<p>Хотите внести изменения в данные клиента <b>${profile.full_name || 'Клиент'}</b>?</p>`,
        confirmText: 'Да, открыть',
        onConfirm: () => {
            renderKioskClientProfileModal(profile);
            return true;
        }
    });
}

/**
 * Renders the client profile popup used inside kiosk mode: same building
 * blocks as the admin "Клиенты" -> client detail page (.profile-container,
 * .profile-info-card, .profile-actions, etc.) so it looks identical, but
 * presented as a scrollable modal since kiosk mode has no page to navigate
 * to and back from.
 * @param {object} client The full profile row for the client.
 */
async function renderKioskClientProfileModal(client) {
    document.querySelectorAll('.kiosk-profile-overlay').forEach(el => el.remove());

    let count = 0;
    let adminNote = null;
    try {
        const { count: attendanceCount } = await supabaseClient
            .from('attendance')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', client.id);
        count = attendanceCount || 0;

        const { data: noteData } = await supabaseClient
            .from('profiles')
            .select('admin_note')
            .eq('id', client.id)
            .maybeSingle();
        if (noteData) adminNote = noteData.admin_note;
    } catch (e) {
        console.error("Could not fetch client details in kiosk:", e);
    }

    const hasSub = client.subscription_status === true;
    const photoHtml = client.avatar_url
        ? `<img src="${client.avatar_url}" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 3px solid var(--accent); margin-bottom: 20px;" />`
        : `<div class="profile-avatar">${(client.full_name || 'С').charAt(0).toUpperCase()}</div>`;

    const overlay = document.createElement('div');
    overlay.className = 'kiosk-profile-overlay';
    overlay.innerHTML = `
        <div class="kiosk-profile-box">
            <button class="kiosk-profile-qr-btn" id="kiosk-profile-qr-btn" aria-label="QR-код"><i data-lucide="qr-code" style="width: 18px; height: 18px;"></i></button>
            <button class="kiosk-profile-close" id="kiosk-profile-close" aria-label="Закрыть"><i data-lucide="x" style="width: 18px; height: 18px;"></i></button>
            <div class="profile-container">
                ${photoHtml}
                <h2 class="profile-name">${client.full_name || 'Без имени'}</h2>
                <p class="profile-email" style="margin-bottom: 15px;">${client.id}</p>
                <div class="card profile-info-card" style="text-align: left;">
                    <div class="info-row"><span class="info-label">Статус:</span><span class="info-value" style="color: ${hasSub ? 'var(--accent)' : 'var(--muted)'}">${hasSub ? 'Активен' : 'Не активен'}</span></div>
                    ${hasSub ? `<div class="info-row"><span class="info-label">Истекает:</span><span class="info-value">${new Date(client.subscription_expires_at).toLocaleDateString('ru-RU')}</span></div>` : ''}
                    <div class="info-row"><span class="info-label">Посещений:</span><span class="info-value">${count}</span></div>
                </div>

                <div class="card profile-info-card profile-info-card--note" style="text-align: left; margin-bottom: 15px;">
                    <div class="info-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span class="info-label" style="color: var(--accent);">Заметка Админа:</span>
                            <button id="kiosk-save-note-btn" class="btn-link" title="Сохранить заметку" style="color: var(--fg); background: rgba(212, 175, 55, 0.1); border-radius: 12px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; padding: 0;">
                                <i data-lucide="check" style="width: 18px; height: 18px;"></i>
                            </button>
                        </div>
                        <textarea id="kiosk-note-textarea" class="plan-textarea" style="min-height: 80px; font-size: 0.85rem; background: transparent; border-color: rgba(255,255,255,0.1);">${adminNote || ''}</textarea>
                    </div>
                </div>

                <div class="profile-actions">
                    <button class="btn-primary" id="kiosk-grant-sub-btn">Выдать абонемент</button>
                    <button class="btn-logout" id="kiosk-cancel-sub-btn" style="border-color: rgba(255,255,255,0.1); color: #8e959f;">Аннулировать доступ</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => overlay.classList.add('is-active'), 10);

    const close = () => {
        overlay.classList.remove('is-active');
        setTimeout(() => overlay.remove(), 300);
    };
    overlay.querySelector('#kiosk-profile-close').onclick = close;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#kiosk-profile-qr-btn').onclick = () => {
        window.showModal({
            title: 'QR-код клиента',
            content: `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px;">
                    <div style="background: #fff; padding: 15px; border-radius: 20px; margin-bottom: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 20px rgba(212,175,55,0.15);">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${client.id}&bgcolor=ffffff"
                             style="display: block; width: 100%; max-width: 200px; border-radius: 10px;" />
                    </div>
                    <div style="font-weight: 800; color: var(--accent); margin-bottom: 4px; text-align: center;">${client.full_name}</div>
                    <div style="color: #8e959f; font-size: 0.75rem; opacity: 0.7;">Карта: #${client.id.split('-')[0]}...</div>
                </div>
            `,
            confirmText: 'Закрыть',
            showCancel: false
        });
    };

    overlay.querySelector('#kiosk-save-note-btn').addEventListener('click', async (e) => {
        const noteText = overlay.querySelector('#kiosk-note-textarea').value.trim();
        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ admin_note: noteText || null })
                .eq('id', client.id);
            if (error) throw error;
            window.showToast('Заметка сохранена!', 'success');
            window.applyBtnCooldown(e.currentTarget, 3);
        } catch (err) {
            console.error("Failed to save admin note:", err);
            window.showToast('Ошибка сохранения заметки', 'error');
        }
    });

    overlay.querySelector('#kiosk-grant-sub-btn').addEventListener('click', () => {
        window.showModal({
            title: 'Выдача абонемента',
            content: `
                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn-link sub-preset-days" data-days="1" data-amount="250" style="flex:1; background: var(--surface-soft); border: 1px solid var(--border); border-radius:12px; padding:10px; font-size:0.78rem; cursor:pointer;">1 день</button>
                    <button type="button" class="btn-link sub-preset-days" data-days="30" data-amount="2000" style="flex:1; background: var(--surface-soft); border: 1px solid var(--border); border-radius:12px; padding:10px; font-size:0.78rem; cursor:pointer;">30 дней</button>
                </div>
                <input type="number" id="k-days" placeholder="Срок (дней)" value="30" />
                <input type="number" id="k-amount" placeholder="Сумма (₽)" value="2000" />
                ${renderMethodToggleHtml('k-method')}
                <input type="text" id="k-info" placeholder="Заметка (необязательно)" />
            `,
            confirmText: 'Подтвердить',
            onConfirm: async (modalOverlay) => {
                const days = parseInt(modalOverlay.querySelector('#k-days').value) || 30;
                const amount = modalOverlay.querySelector('#k-amount').value;
                const method = modalOverlay.querySelector('#k-method').dataset.value;
                const info = modalOverlay.querySelector('#k-info').value;
                if (!amount) { window.showToast('Укажите сумму', 'error'); return false; }

                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + days);

                const { data: updated, error } = await supabaseClient.from('profiles').update({
                    subscription_status: true,
                    subscription_expires_at: expiresAt.toISOString(),
                    last_payment_received_at: new Date().toISOString()
                }).eq('id', client.id).select().single();

                if (error) { window.showToast('Ошибка обновления профиля', 'error'); return false; }

                const { error: payError } = await supabaseClient.from('payments').insert([{
                    user_id: client.id,
                    amount: parseFloat(amount),
                    info: info
                }]);
                if (payError) { window.showToast('Ошибка записи платежа: ' + window.translateError(payError.message), 'error'); return false; }

                window.showToast('Доступ предоставлен');

                // Granting a subscription in person (1 day or 30) means the
                // client is here today, and since they now have a sub they
                // won't scan their QR - mark today's attendance ourselves so
                // their calendar and streak still count the visit.
                markAttendanceForClient(client.id);

                if (window.postToGymSheet) {
                    // A 1-day pass isn't a real monthly membership - record it
                    // as a one-time visit (same bucket as "Разовая тренировка")
                    // instead of filling up the subscriptions table.
                    const sheetCall = days === 1
                        ? window.postToGymSheet('addOneTime', { category: 'razovye', amount: parseFloat(amount), method })
                        : window.postToGymSheet('addSubscription', { fullName: client.full_name, amount: parseFloat(amount), method });
                    sheetCall.then(result => {
                        if (!result.ok) window.showToast(result.message || 'Абонемент выдан, но не записан в таблицу', 'error');
                    });
                }

                close();
                renderKioskClientProfileModal(updated);
                return true;
            }
        });

        setTimeout(() => {
            const modalOverlay = document.querySelector('.modal-overlay.is-active');
            if (!modalOverlay) return;
            if (window.lucide) lucide.createIcons();
            wireMethodToggle(modalOverlay.querySelector('#k-method'));
            modalOverlay.querySelectorAll('.sub-preset-days').forEach(btn => {
                btn.onclick = () => {
                    modalOverlay.querySelector('#k-days').value = btn.dataset.days;
                    modalOverlay.querySelector('#k-amount').value = btn.dataset.amount;
                };
            });
        }, 50);
    });

    overlay.querySelector('#kiosk-cancel-sub-btn').addEventListener('click', () => {
        window.showModal({
            title: 'Аннулирование доступа',
            content: `<p style="color: #8e959f; font-size: 0.9rem;">Вы действительно хотите закрыть доступ этому клиенту?</p>`,
            confirmText: 'Да, закрыть',
            onConfirm: async () => {
                const { data: updated, error } = await supabaseClient.from('profiles').update({
                    subscription_status: false,
                    subscription_expires_at: null,
                    last_payment_received_at: null
                }).eq('id', client.id).select().single();

                if (!error) {
                    window.showToast('Доступ закрыт');
                    close();
                    renderKioskClientProfileModal(updated);
                }
                return true;
            }
        });
    });
}

// Quick "money in" categories, one per non-subscription income line in the
// spreadsheet's "ИТОГ ДНЯ" table. Subscriptions are handled separately by
// the client profile's "Выдать абонемент" flow (see renderKioskClientProfileModal).
const GYM_INCOME_CATEGORIES = [
    { key: 'razovye', label: 'Разовая тренировка', icon: 'dumbbell' },
    { key: 'napitki', label: 'Напитки', icon: 'cup-soda' },
    { key: 'sportpit', label: 'Спортивное питание', icon: 'pill' },
];

// Quick "money out" categories, matching the sheet's expense table rows.
const GYM_EXPENSE_CATEGORIES = [
    { key: 'zal', label: 'Общие расходы зала' },
    { key: 'sportpit', label: 'Расход спортпит' },
    { key: 'napitki', label: 'Расход напитки' },
    { key: 'admin', label: 'Расход администратора' },
    { key: 'other', label: 'Прочие расходы' },
];

/**
 * Renders the finance quick-entry panel: a lightweight, button-based front
 * end for the categories in the "GF" spreadsheet, so the admin never has
 * to open the sheet by hand mid-shift. Picking a category opens a small
 * amount (+ cash/card, or + comment for expenses) form, which posts to the
 * sheet via postToGymSheet (see sheets-sync.js / GymSheetSync.gs).
 */
function renderKioskFinancePanel() {
    document.querySelectorAll('.kiosk-finance-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'kiosk-finance-overlay';
    overlay.innerHTML = `
        <div class="kiosk-finance-box">
            <button class="kiosk-finance-close" id="kiosk-finance-close" aria-label="Закрыть"><i data-lucide="x" style="width: 18px; height: 18px;"></i></button>
            <h3 class="kiosk-finance-title">Приход</h3>
            <div class="kiosk-finance-grid">
                ${GYM_INCOME_CATEGORIES.map(c => `
                    <button class="kiosk-finance-cat" data-kind="income" data-key="${c.key}" data-label="${c.label}">
                        <i data-lucide="${c.icon}"></i>
                        <span>${c.label}</span>
                    </button>
                `).join('')}
            </div>
            <h3 class="kiosk-finance-title">Расход</h3>
            <div class="kiosk-finance-grid">
                ${GYM_EXPENSE_CATEGORIES.map(c => `
                    <button class="kiosk-finance-cat kiosk-finance-cat--expense" data-kind="expense" data-key="${c.key}" data-label="${c.label}">
                        <i data-lucide="minus-circle"></i>
                        <span>${c.label}</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => overlay.classList.add('is-active'), 10);

    const close = () => {
        overlay.classList.remove('is-active');
        setTimeout(() => overlay.remove(), 300);
    };
    overlay.querySelector('#kiosk-finance-close').onclick = close;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('.kiosk-finance-cat').forEach(btn => {
        btn.onclick = () => {
            const { kind, key, label } = btn.dataset;
            if (kind === 'income') openGymIncomeEntryModal(key, label);
            else openGymExpenseEntryModal(key, label);
        };
    });
}

// One-tap amount shortcuts for the categories that are asked for most often
// at the front desk, so the admin doesn't have to open a keyboard for the
// common case. `shortcutKey` (if set) also fires the same button while the
// modal is open, without needing to touch the screen at all.
const GYM_INCOME_PRESETS = {
    razovye: [{ amount: 250, shortcutKey: 'q', shortcutLabel: 'Q' }],
    napitki: [{ amount: 80 }, { amount: 100 }, { amount: 150 }],
};

/**
 * Explains a failed sheet write with concrete, checkable causes instead of
 * just a toast that's easy to miss and prompts repeat clicking. Points the
 * admin at the feedback tab for anything that isn't self-fixable.
 */
function showGymSheetFailureModal(message) {
    window.showModal({
        title: 'Не удалось записать в таблицу',
        content: `
            <p style="color: var(--fg); font-size: 0.85rem; margin: 0 0 12px; line-height: 1.5;">${message || 'Произошла ошибка при отправке в Google Таблицу.'}</p>
            <p style="color: var(--muted); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; margin: 0 0 6px;">Частые причины</p>
            <ul style="color: var(--muted); font-size: 0.78rem; padding-left: 18px; margin: 0 0 14px; line-height: 1.7;">
                <li>Нет подключения к интернету на этом устройстве</li>
                <li>На этот месяц ещё не подготовлены вкладки в таблице</li>
                <li>Сегодняшние строки/ячейки в таблице уже все заняты</li>
            </ul>
            <p style="color: var(--muted); font-size: 0.78rem; line-height: 1.5; margin: 0;">
                Если проблема повторяется - выйдите из режима киоска и откройте <b>Другое → Идеи/Проблемы</b>, опишите её там. Разработчик разберётся в ближайшее время.
            </p>
        `,
        confirmText: 'Понятно',
        showCancel: false
    });
}

async function submitGymIncome(categoryKey, amount, method) {
    const result = await window.postToGymSheet('addOneTime', { category: categoryKey, amount, method });
    if (!result.ok) { showGymSheetFailureModal(result.message); return false; }
    window.showToast('Успешно добавлено', 'success');
    return true;
}

/** Thin indeterminate progress bar pinned to the top of the screen, standing in for a background request (e.g. a quick-add preset) that closed its own modal already. */
function showKioskTopProgress() {
    let bar = document.querySelector('.kiosk-top-progress');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'kiosk-top-progress';
        document.body.appendChild(bar);
    }
    requestAnimationFrame(() => bar.classList.add('is-active'));
}

function hideKioskTopProgress() {
    const bar = document.querySelector('.kiosk-top-progress');
    if (!bar) return;
    bar.classList.remove('is-active');
    setTimeout(() => bar.remove(), 250);
}

/** Marks today's attendance for a client, same "one row per day" rule the kiosk scan uses. */
async function markAttendanceForClient(clientId) {
    try {
        const today = new Date().toLocaleDateString('en-CA');
        const { data: existing } = await supabaseClient
            .from('attendance')
            .select('id')
            .eq('user_id', clientId)
            .gte('visit_date', `${today}T00:00:00`)
            .lte('visit_date', `${today}T23:59:59`)
            .limit(1);

        if (!existing || existing.length === 0) {
            await supabaseClient.from('attendance').insert([{ user_id: clientId, visit_date: today }]);
        }
    } catch (e) {
        console.error('Attendance mark error:', e);
    }
}

function closeModalOverlay(overlay) {
    overlay.classList.remove('is-active');
    setTimeout(() => overlay.remove(), 300);
}

/**
 * Cash/card picker used in place of a <select> wherever a modal needs a
 * payment method - two icon buttons with a tiny label, one active at a
 * time. Read the choice back with `container.dataset.value`.
 */
function renderMethodToggleHtml(id) {
    return `
        <div class="method-toggle" id="${id}" data-value="cash">
            <button type="button" class="method-toggle-btn is-active" data-value="cash">
                <i data-lucide="banknote"></i>
                <span>Наличные</span>
            </button>
            <button type="button" class="method-toggle-btn" data-value="card">
                <i data-lucide="credit-card"></i>
                <span>Карта</span>
            </button>
        </div>
    `;
}

function wireMethodToggle(container) {
    if (!container) return;
    container.querySelectorAll('.method-toggle-btn').forEach(btn => {
        btn.onclick = () => {
            container.querySelectorAll('.method-toggle-btn').forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            container.dataset.value = btn.dataset.value;
        };
    });
}

// Only "Разовая тренировка" is an actual training visit - drinks/sportpit
// are retail purchases, not a session, so only this category gets the
// client picker (and therefore an attendance mark).
const GYM_INCOME_CATEGORY_NEEDS_CLIENT = { razovye: true };

async function openGymIncomeEntryModal(categoryKey, label) {
    const presets = GYM_INCOME_PRESETS[categoryKey] || [];
    const needsClient = !!GYM_INCOME_CATEGORY_NEEDS_CLIENT[categoryKey];

    let clients = [];
    if (needsClient) {
        const { data } = await supabaseClient.from('profiles').select('id, full_name').order('full_name');
        clients = data || [];
    }

    const presetsHtml = presets.length ? `
        <div class="kf-presets">
            ${presets.map(p => `
                <button type="button" class="kf-preset-btn" data-amount="${p.amount}">
                    Добавить ${p.amount}
                    ${p.shortcutLabel ? `<small>(нажмите ${p.shortcutLabel})</small>` : ''}
                </button>
            `).join('')}
        </div>
    ` : '';

    const clientPickerHtml = needsClient ? `
        <div class="kf-client-picker">
            <input type="text" id="kf-client-search" placeholder="Клиент *" autocomplete="off" />
            <div class="kf-client-results" id="kf-client-results"></div>
        </div>
        <p class="kf-client-hint">Обязательно укажите клиента - без этого посещение не попадёт в его календарь.</p>
    ` : '';

    // Guards against the same amount being submitted twice - e.g. the "Q"
    // shortcut firing again from OS key-repeat, or a second tap landing
    // before the first request (and the modal-closing animation) finishes.
    let submitting = false;
    let selectedClientId = null;

    const guardedSubmit = async (amount, method) => {
        if (submitting) return false;
        if (needsClient && !selectedClientId) {
            window.showToast('Пожалуйста, укажите клиента', 'error');
            return false;
        }
        submitting = true;
        try {
            const ok = await submitGymIncome(categoryKey, amount, method);
            if (ok && selectedClientId) await markAttendanceForClient(selectedClientId);
            return ok;
        } finally {
            submitting = false;
        }
    };

    window.showModal({
        title: label,
        content: `
            ${presetsHtml}
            ${clientPickerHtml}
            <input type="number" id="kf-amount" placeholder="Своя сумма (₽)" inputmode="decimal" />
            ${renderMethodToggleHtml('kf-method')}
        `,
        confirmText: 'Добавить',
        onConfirm: async (overlay) => {
            const amount = parseFloat(overlay.querySelector('#kf-amount').value);
            const method = overlay.querySelector('#kf-method').dataset.value;
            if (!amount || amount <= 0) { window.showToast('Укажите сумму', 'error'); return false; }
            return await guardedSubmit(amount, method);
        }
    });

    setTimeout(() => {
        const overlay = document.querySelector('.modal-overlay.is-active');
        if (!overlay) return;

        if (window.lucide) lucide.createIcons();
        wireMethodToggle(overlay.querySelector('#kf-method'));

        if (needsClient) {
            const searchInput = overlay.querySelector('#kf-client-search');
            const resultsBox = overlay.querySelector('#kf-client-results');
            searchInput.addEventListener('input', () => {
                const term = searchInput.value.toLowerCase().trim();
                selectedClientId = null;
                if (!term) { resultsBox.innerHTML = ''; resultsBox.classList.remove('is-visible'); return; }

                const matches = clients.filter(c => (c.full_name || '').toLowerCase().includes(term)).slice(0, 6);
                resultsBox.innerHTML = matches.length
                    ? matches.map(c => `<div class="kf-client-result" data-id="${c.id}">${c.full_name || 'Без имени'}</div>`).join('')
                    : '<div class="kf-client-result kf-client-result--empty">Никого не найдено</div>';
                resultsBox.classList.add('is-visible');

                resultsBox.querySelectorAll('.kf-client-result[data-id]').forEach(el => {
                    el.onclick = () => {
                        selectedClientId = el.dataset.id;
                        searchInput.value = el.textContent;
                        resultsBox.classList.remove('is-visible');
                        resultsBox.innerHTML = '';
                    };
                });
            });
        }

        if (!presets.length) return;

        const methodSelect = overlay.querySelector('#kf-method');
        let presetSubmitted = false;

        const submitPreset = async (amount) => {
            if (presetSubmitted) return;
            // Validate before closing anything, so a missing required client
            // keeps the form open with an error instead of vanishing and
            // leaving the admin unsure what to fix.
            if (needsClient && !selectedClientId) {
                window.showToast('Пожалуйста, укажите клиента', 'error');
                return;
            }
            presetSubmitted = true;

            // A quick-add preset is meant to be instant: close this form right
            // away and drop the admin back on the category picker, rather than
            // shrinking the clicked button down to a bare spinner in place -
            // the actual request keeps running in the background with a thin
            // progress bar at the top of the screen standing in for it.
            closeModalOverlay(overlay);
            renderKioskFinancePanel();
            showKioskTopProgress();
            try {
                await guardedSubmit(amount, methodSelect.dataset.value);
            } finally {
                hideKioskTopProgress();
            }
        };

        overlay.querySelectorAll('.kf-preset-btn').forEach(btn => {
            btn.onclick = () => submitPreset(parseFloat(btn.dataset.amount));
        });

        const shortcutHandler = (e) => {
            if (e.repeat) return; // ignore OS key-repeat while held down
            const preset = presets.find(p => p.shortcutKey && p.shortcutKey === e.key.toLowerCase());
            if (preset) { e.preventDefault(); submitPreset(preset.amount); }
        };
        document.addEventListener('keydown', shortcutHandler);

        const observer = new MutationObserver(() => {
            if (!document.body.contains(overlay)) {
                document.removeEventListener('keydown', shortcutHandler);
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true });
    }, 50);
}

function openGymExpenseEntryModal(categoryKey, label) {
    window.showModal({
        title: label,
        content: `
            <input type="number" id="kf-exp-amount" placeholder="Сумма (₽)" inputmode="decimal" />
            <input type="text" id="kf-exp-comment" placeholder="Комментарий (необязательно)" />
        `,
        confirmText: 'Добавить',
        onConfirm: async (overlay) => {
            const amount = parseFloat(overlay.querySelector('#kf-exp-amount').value);
            const comment = overlay.querySelector('#kf-exp-comment').value.trim();
            if (!amount || amount <= 0) { window.showToast('Укажите сумму', 'error'); return false; }

            const result = await window.postToGymSheet('addExpense', { category: categoryKey, amount, comment });
            if (!result.ok) { showGymSheetFailureModal(result.message); return false; }
            window.showToast('Расход успешно добавлен', 'success');
            return true;
        }
    });
}

/**
 * Renders the Kiosk sound settings modal.
 */
function renderKioskSettingsModal() {
    const currentAccept = localStorage.getItem('kiosk_accept_sound') || DEFAULT_ACCEPT_SOUND;
    const currentDecline = localStorage.getItem('kiosk_decline_sound') || DEFAULT_DECLINE_SOUND;

    const createOptions = (sounds, type, current) => {
        let html = '<option value="none">Без звука</option>';
        sounds.forEach(s => {
            const fullPath = `${type}/${s}`;
            html += `<option value="${fullPath}" ${fullPath === current ? 'selected' : ''}>${s.replace('.mp3', '')}</option>`;
        });
        return html;
    };

    window.showModal({
        title: 'Настройки звуков киоска',
        content: `
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div>
                    <label style="color: var(--muted); font-size: 0.8rem; font-weight: 700;">Звук успеха</label>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <select id="kiosk-accept-select" style="flex: 1;">${createOptions(ACCEPT_SOUNDS, 'accept', currentAccept)}</select>
                        <button id="preview-accept" class="kiosk-header-btn" style="width: 44px; height: 44px;"><i data-lucide="play"></i></button>
                    </div>
                </div>
                <div>
                    <label style="color: var(--muted); font-size: 0.8rem; font-weight: 700;">Звук отказа</label>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <select id="kiosk-decline-select" style="flex: 1;">${createOptions(DECLINE_SOUNDS, 'decline', currentDecline)}</select>
                        <button id="preview-decline" class="kiosk-header-btn" style="width: 44px; height: 44px;"><i data-lucide="play"></i></button>
                    </div>
                </div>
            </div>
        `,
        confirmText: 'Сохранить',
        onConfirm: (overlay) => {
            const acceptSound = overlay.querySelector('#kiosk-accept-select').value;
            const declineSound = overlay.querySelector('#kiosk-decline-select').value;
            localStorage.setItem('kiosk_accept_sound', acceptSound);
            localStorage.setItem('kiosk_decline_sound', declineSound);
            window.showToast('Настройки сохранены', 'success');
            return true;
        }
    });

    setTimeout(() => {
        if (window.lucide) lucide.createIcons();
        const previewAcceptBtn = document.getElementById('preview-accept');
        const previewDeclineBtn = document.getElementById('preview-decline');
        
        if (previewAcceptBtn) {
            previewAcceptBtn.onclick = () => {
                const soundFile = document.getElementById('kiosk-accept-select').value;
                if (soundFile === 'none') return;
                const audio = new Audio(`${SOUND_PATH}${soundFile}`);
                audio.play();
            };
        }
        if (previewDeclineBtn) {
            previewDeclineBtn.onclick = () => {
                const soundFile = document.getElementById('kiosk-decline-select').value;
                if (soundFile === 'none') return;
                const audio = new Audio(`${SOUND_PATH}${soundFile}`);
                audio.play();
            };
        }
    }, 50);
}

/**
 * Renders the main Kiosk Mode UI.
 */
function renderKioskUI() {
    let kioskContainer = document.getElementById('kiosk-mode-container');
    if (!kioskContainer) {
        kioskContainer = document.createElement('div');
        kioskContainer.id = 'kiosk-mode-container';
        document.body.appendChild(kioskContainer);
    }

    const registrationUrl = `${window.location.origin}${window.location.pathname}?mode=kiosk-register`;
    // On a phone, running a live camera feed *and* showing the registration
    // QR side-by-side doesn't fit and burns battery for no reason - swap the
    // two always-on cards for two buttons instead: one shows the QR on
    // demand, the other opens the camera for a short 10s window only when
    // it's actually needed.
    const isMobileKiosk = window.matchMedia('(max-width: 768px)').matches;

    const kioskMainHtml = isMobileKiosk ? `
        <div class="kiosk-mobile-actions">
            <button class="btn-primary kiosk-mobile-btn" id="kiosk-mobile-register-btn">
                <i data-lucide="user-plus"></i> Показать QR для регистрации
            </button>
            <button class="btn-primary kiosk-mobile-btn kiosk-mobile-btn--scan" id="kiosk-mobile-scan-btn">
                <i data-lucide="scan-line"></i> Сканировать QR-код
            </button>
        </div>
    ` : `
        <div class="kiosk-grid">
            <div class="kiosk-card" id="kiosk-card-register">
                <h2>Новый клиент?</h2>
                <p>Отсканируйте этот QR-код на своём телефоне, чтобы создать аккаунт</p>
                <div class="kiosk-qr-wrapper">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(registrationUrl)}&bgcolor=ffffff" />
                </div>
            </div>
            <div class="kiosk-card" id="kiosk-card-scan">
                <h2>Уже в клубе?</h2>
                <p>Отсканируйте свой QR-код для отметки посещения</p>
                <div id="kiosk-reader" class="kiosk-scanner-wrapper"></div>
            </div>
        </div>
    `;

    kioskContainer.innerHTML = `
        <img src="imgs/GF-logo.png" alt="Gym Fit" class="kiosk-logo" />

        <div class="kiosk-header">
            <button id="kiosk-finance-btn" class="kiosk-header-btn kiosk-header-btn--finance" title="Учёт финансов"><i data-lucide="cup-soda"></i></button>
            <button id="kiosk-settings-btn" class="kiosk-header-btn" title="Настройки"><i data-lucide="sliders-horizontal"></i></button>
            <button id="kiosk-exit-btn" class="kiosk-header-btn" title="Выйти из киоска"><i data-lucide="door-closed"></i></button>
            <button id="kiosk-recents-btn" class="kiosk-header-btn kiosk-header-btn--recents" title="Недавние сканы"><i data-lucide="history"></i></button>
        </div>

        <div id="recent-scans-panel">
            <div class="recent-scans-list"></div>
        </div>

        <div class="kiosk-lightgrid" aria-hidden="true">
            <div class="kiosk-light-cluster kiosk-light-cluster--top">
                <span class="kiosk-light-square kiosk-sq-1"></span>
                <span class="kiosk-light-square kiosk-sq-2"></span>
                <span class="kiosk-light-square kiosk-sq-3"></span>
                <span class="kiosk-light-square kiosk-sq-4"></span>
                <span class="kiosk-light-link kiosk-ln-1"></span>
                <span class="kiosk-light-link kiosk-ln-2"></span>
                <span class="kiosk-light-link kiosk-ln-3"></span>
            </div>
            <div class="kiosk-light-cluster kiosk-light-cluster--bottom">
                <span class="kiosk-light-square kiosk-sq-1"></span>
                <span class="kiosk-light-square kiosk-sq-2"></span>
                <span class="kiosk-light-square kiosk-sq-3"></span>
                <span class="kiosk-light-link kiosk-ln-1"></span>
                <span class="kiosk-light-link kiosk-ln-2"></span>
            </div>
        </div>

        <div class="kiosk-ambient kiosk-ambient--left" aria-hidden="true">
            <img src="imgs/display1.jpeg" alt="" />
        </div>
        <div class="kiosk-ambient kiosk-ambient--right" aria-hidden="true">
            <img src="imgs/display2.jpeg" alt="" />
        </div>

        ${kioskMainHtml}

        <div class="kiosk-feedback-hint">Для админа: если хотите что-то изменить, исправить или добавить новую функцию — выйдите на главную, откройте «Другое» → «Идеи/Проблемы» и опишите это там.</div>
    `;

    if (isMobileKiosk) {
        document.getElementById('kiosk-mobile-register-btn').onclick = () => showKioskMobileRegisterQR(registrationUrl);
        document.getElementById('kiosk-mobile-scan-btn').onclick = () => startKioskMobileScan();
    } else {
        window.kioskScanner = new Html5Qrcode("kiosk-reader");
        const onScanSuccess = (decodedText) => {
            if (isKioskProcessing) return;
            handleKioskCheckIn(decodedText);
        };

        window.kioskScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 200, height: 200 } }, onScanSuccess)
            .catch(err => {
                document.getElementById('kiosk-reader').innerHTML = '<p style="color: #8e959f; padding: 20px;">Не удалось запустить камеру. Убедитесь, что используется HTTPS и есть разрешение.</p>';
            });
    }

    // Add listeners for new buttons
    document.getElementById('kiosk-exit-btn').onclick = () => exitKioskMode();
    document.getElementById('kiosk-finance-btn').onclick = () => renderKioskFinancePanel();
    document.getElementById('kiosk-settings-btn').onclick = () => renderKioskSettingsModal();
    document.getElementById('kiosk-recents-btn').onclick = () => {
        isRecentScansVisible = !isRecentScansVisible;
        document.getElementById('recent-scans-panel').classList.toggle('visible', isRecentScansVisible);
    };
    
    // Initial render of empty recent scans
    renderRecentScans();
    if (window.lucide) lucide.createIcons();

    if (!isMobileKiosk) startKioskBorderChaseLoop();
}

/** Shows the registration QR code on demand (mobile kiosk only). */
function showKioskMobileRegisterQR(registrationUrl) {
    window.showModal({
        title: 'Регистрация нового клиента',
        content: `
            <div style="display:flex; flex-direction:column; align-items:center;">
                <div class="kiosk-qr-wrapper" style="margin-bottom: 14px;">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(registrationUrl)}&bgcolor=ffffff" style="display:block; width: 100%; max-width: 220px;" />
                </div>
                <p style="color: var(--muted); font-size: 0.85rem; text-align:center;">Отсканируйте этот QR-код на телефоне клиента, чтобы создать аккаунт</p>
            </div>
        `,
        confirmText: 'Закрыть',
        showCancel: false
    });
}

/**
 * Opens the camera for a short, explicit 10-second window (mobile kiosk
 * only) instead of leaving it running the whole time kiosk mode is open -
 * this is meant as an occasional fallback, tapped only when actually
 * needed, not a permanently-on scanner.
 */
function startKioskMobileScan() {
    document.querySelectorAll('.kiosk-mobile-scan-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'kiosk-mobile-scan-overlay';
    overlay.innerHTML = `
        <div class="kiosk-mobile-scan-box">
            <div class="kiosk-mobile-scan-timer" id="kiosk-mobile-scan-timer">10</div>
            <div id="kiosk-mobile-reader" class="kiosk-scanner-wrapper"></div>
            <p style="color: var(--muted); font-size: 0.85rem; margin-top: 14px; text-align: center;">Наведите камеру на QR-код клиента</p>
            <button class="btn-logout" id="kiosk-mobile-scan-cancel" style="margin-top: 16px;">Отмена</button>
        </div>
    `;
    document.body.appendChild(overlay);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => overlay.classList.add('is-active'), 10);

    let secondsLeft = 10;
    const timerEl = overlay.querySelector('#kiosk-mobile-scan-timer');
    let stopped = false;

    window.kioskMobileScanner = new Html5Qrcode('kiosk-mobile-reader');

    const stopAndClose = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(countdownInterval);
        if (window.kioskMobileScanner) {
            const scanner = window.kioskMobileScanner;
            window.kioskMobileScanner = null;
            try {
                if (scanner.isScanning) scanner.stop().catch(() => {}).finally(() => scanner.clear());
                else scanner.clear();
            } catch (e) { /* ignore */ }
        }
        overlay.classList.remove('is-active');
        setTimeout(() => overlay.remove(), 300);
    };

    const countdownInterval = setInterval(() => {
        secondsLeft -= 1;
        if (timerEl) timerEl.textContent = String(secondsLeft);
        if (secondsLeft <= 0) stopAndClose();
    }, 1000);

    window.kioskMobileScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
            if (isKioskProcessing) return;
            handleKioskCheckIn(decodedText);
            stopAndClose();
        }
    ).catch(() => {
        const reader = overlay.querySelector('#kiosk-mobile-reader');
        if (reader) reader.innerHTML = '<p style="color: #8e959f; padding: 20px;">Не удалось запустить камеру.</p>';
    });

    overlay.querySelector('#kiosk-mobile-scan-cancel').onclick = stopAndClose;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) stopAndClose(); });
}

// Colors the glow-pulse variant can pick from, cycled randomly per play so
// consecutive glows don't repeat the same hue. No pink/magenta - kept to
// blue, blue-leaning indigo, teal and gold to match the always-on card cycle.
const KIOSK_GLOW_COLORS = ['#7DD3FC', '#38BDF8', '#818CF8', '#34D399', '#FBBF24'];

/**
 * Drives the playful border accents on the two kiosk cards. Each card runs
 * its own independent, randomly-paced loop (not synced with the other) so
 * one might chase clockwise while the other chases counter-clockwise, glows
 * instead of chasing, or sits still for a round entirely - reads as ambient
 * life rather than a mechanical, predictable loop.
 */
function startKioskBorderChaseLoop() {
    stopKioskBorderChaseLoop();
    window.kioskBorderChaseTimers = [];

    const playEffect = (card) => {
        if (!card) return;
        const roll = Math.random();

        if (roll < 0.15) {
            // Skip this round entirely - card stays idle.
            return;
        }

        if (roll < 0.65) {
            // Border-chase sweep, direction picked at random each time.
            const reverse = Math.random() < 0.5;
            card.classList.remove('is-border-chasing', 'is-chase-reverse');
            void card.offsetWidth; // restart the CSS animation
            card.classList.toggle('is-chase-reverse', reverse);
            card.classList.add('is-border-chasing');
            setTimeout(() => card.classList.remove('is-border-chasing', 'is-chase-reverse'), 1150);
        } else {
            // Whole-border color fade in and back out.
            const color = KIOSK_GLOW_COLORS[Math.floor(Math.random() * KIOSK_GLOW_COLORS.length)];
            card.style.setProperty('--kiosk-glow-color', color);
            card.classList.remove('is-glow-pulse');
            void card.offsetWidth;
            card.classList.add('is-glow-pulse');
            setTimeout(() => card.classList.remove('is-glow-pulse'), 1750);
        }
    };

    const scheduleCard = (cardId) => {
        const tick = () => {
            const card = document.getElementById(cardId);
            if (!card) return; // kiosk was exited, stop rescheduling

            playEffect(card);

            const nextDelay = 500 + Math.random() * 2400; // ~0.5s - 2.9s, unpredictable
            window.kioskBorderChaseTimers.push(setTimeout(tick, nextDelay));
        };

        window.kioskBorderChaseTimers.push(setTimeout(tick, 400 + Math.random() * 1500));
    };

    scheduleCard('kiosk-card-register');
    scheduleCard('kiosk-card-scan');
}

function stopKioskBorderChaseLoop() {
    if (window.kioskBorderChaseTimers) {
        window.kioskBorderChaseTimers.forEach(id => clearTimeout(id));
        window.kioskBorderChaseTimers = null;
    }
}

/**
 * Enters Kiosk Mode, hiding the regular UI.
 */
function enterKioskMode() {
    window.lastAdminView = window.currentView;
    document.getElementById('gym-content').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    document.getElementById('top-bar').classList.add('kiosk-active');

    // Kiosk visuals (ambient photos, glow accents) are designed for the
    // default dark+gold theme, so force step 4 while in kiosk mode
    // regardless of the admin's own preference, and restore whatever step
    // they had on exit.
    window.stepBeforeKiosk = currentThemeStep;
    if (currentThemeStep !== 4) {
        applyThemeStep(4, { persist: false, animate: false });
    }

    renderKioskUI();
}

/**
 * Exits Kiosk Mode, restoring the regular admin UI.
 */
function exitKioskMode(callback = null) {
    stopKioskBorderChaseLoop();
    if (window.kioskScanner) {
        try { if (window.kioskScanner.isScanning) window.kioskScanner.stop(); } catch(e) { /* ignore */ }
        window.kioskScanner = null;
    }
    if (window.kioskMobileScanner) {
        try { if (window.kioskMobileScanner.isScanning) window.kioskMobileScanner.stop(); } catch (e) { /* ignore */ }
        window.kioskMobileScanner = null;
    }
    document.querySelectorAll('.kiosk-mobile-scan-overlay').forEach(el => el.remove());

    const kioskContainer = document.getElementById('kiosk-mode-container');
    if (kioskContainer) kioskContainer.remove();

    document.getElementById('gym-content').style.display = 'flex';
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('top-bar').classList.remove('kiosk-active');

    // Restore whatever step the admin had before kiosk mode forced step 4.
    if (window.stepBeforeKiosk && window.stepBeforeKiosk !== 4) {
        applyThemeStep(window.stepBeforeKiosk, { persist: false, animate: false });
    }
    window.stepBeforeKiosk = null;

    // Reset kiosk state
    isInKioskMode = false;
    isRecentScansVisible = false;
    recentScans = [];

    if (callback && typeof callback === 'function') {
        callback();
    } else {
        const lastView = window.lastAdminView || 'Клиенты';
        const navItem = Array.from(document.querySelectorAll('.nav-item')).find(item => item.querySelector('.nav-label').textContent.trim() === lastView);
        if (navItem) navItem.click();
        else document.querySelector('.nav-item')?.click();
    }
}