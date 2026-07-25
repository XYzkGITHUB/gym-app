/**
 * Shows a special toast notification that allows an action to be cancelled.
 * @param {string} message - The message to display.
 * @param {function} onCancel - The function to execute when "Cancel" is clicked.
 */
function showCancellableToast(message, onCancel) {
    const toastId = `toast-${Date.now()}`;
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = 'custom-toast success'; // Use success style
    toast.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 20px;">
            <span>${message}</span>
            <button id="cancel-${toastId}" style="background: rgba(0,0,0,0.3); color: #fff; border: none; padding: 6px 12px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; cursor: pointer;">Отмена</button>
        </div>
    `;
    document.body.appendChild(toast);

    const removeToast = () => {
        toast.classList.remove('is-visible');
        setTimeout(() => toast.remove(), 400);
    };

    const autoDismissTimer = setTimeout(removeToast, 4000); // Auto-dismiss after 4 seconds

    document.getElementById(`cancel-${toastId}`).onclick = () => {
        clearTimeout(autoDismissTimer);
        onCancel();
        removeToast();
    };

    setTimeout(() => toast.classList.add('is-visible'), 10);
}

/**
 * SCRIPT2.JS: ADMIN MODULE
 * Contains functionality for scanning QR codes, managing client profiles, and broadcasting messages.
 */

let isProcessingScan = false;

async function handleAttendance(scannedUserId) {
    if (isProcessingScan) return;
    isProcessingScan = true;
    // Блокируем повторные сканирования на 3 секунды, чтобы избежать спама
    setTimeout(() => { isProcessingScan = false; }, 3000);

    try {
        // Используем ID напрямую, так как теперь QR-коды статические
        const finalUserId = scannedUserId;
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*') // Fetch the full profile for the detail view
            .eq('id', finalUserId)
            .maybeSingle();

        if (profileError || !profile) {
            showToast('Ошибка: пользователь не найден', 'error');
            isProcessingScan = false; // Allow scanning again
            return;
        }

        // --- PRIMARY ACTION: Show the client's profile immediately ---
        stopScanner();
        window.currentView = 'Клиенты';
        renderClientDetail(profile);

        // --- SECONDARY ACTION: Mark attendance in the background ---
        const userName = profile?.full_name || 'Клиент';
        const today = new Date().toLocaleDateString('en-CA');
        const hasSub = profile?.subscription_status === true;

        if (!hasSub) {
            // Show a toast to inform the admin why attendance was not marked.
            showToast('Абонемент не активен', 'error');
            return;
        }

        // Проверяем наличие посещений за сегодня (надежная проверка для любых типов колонок)
        const { data: existingAttendance } = await supabaseClient
            .from('attendance')
            .select('id')
            .eq('user_id', finalUserId)
            .gte('visit_date', today + 'T00:00:00')
            .lte('visit_date', today + 'T23:59:59')
            .limit(1);

        const registerVisit = async () => {
            const { data: newAttendance, error } = await supabaseClient
                .from('attendance')
                .insert([{ 
                    user_id: finalUserId,
                    visit_date: today
                }])
                .select('id') // Select the ID of the new record
                .single();
            
            if (error || !newAttendance) throw error || new Error("Failed to get new attendance ID");

            // Show the new cancellable toast
            showCancellableToast('Посещение отмечено', async () => {
                // This is the onCancel function
                const { error: deleteError } = await supabaseClient
                    .from('attendance')
                    .delete()
                    .eq('id', newAttendance.id);
                if (deleteError) showToast('Ошибка отмены', 'error');
                else showToast('Посещение отменено', 'success');
            });
        };

        if (existingAttendance && existingAttendance.length > 0) {
            // User has already visited today. We don't need to do anything.
            // The profile is already being displayed.
            showToast(`Абонемент активен. ${userName} уже в зале.`, 'success');
        } else {
            // Если сегодня еще не был — отмечаем сразу
            await registerVisit();
        }
    } catch (err) {
        console.error(err);
        showToast('Ошибка при обработке посещения', 'error');
    }
}

window.stopScanner = function() {
    try {
        if (html5QrScanner) {
            if (html5QrScanner.isScanning) {
                html5QrScanner.stop().catch(e => console.error('Stop error', e));
            }
        }
    } catch (err) {
        console.error('Scanner clear error', err);
    }
    html5QrScanner = null;
}

function renderAdminQRCode() {
    const content = document.getElementById('gym-content');
    content.innerHTML = `
        <div class="qr-container">
            <h1 class="qr-title">СКАНЕР</h1>
            <div style="position: relative; width: 100%; max-width: 350px; margin-top: 40px;">
                <button id="custom-file-scan" class="scan-image-file-btn">Сканировать файл</button>
                <div id="reader" style="width: 100%; aspect-ratio: 1 / 1; border-radius: 20px; overflow: hidden; background: #000; border: none; margin-top: 10px;"></div>
            </div>
            <p class="qr-description" style="margin-top: 20px;">Наведите камеру на QR-код клиента для отметки посещения</p>
        </div>
    `;

    stopScanner();

    // Используем низкоуровневый Html5Qrcode для мгновенного запуска
    html5QrScanner = new Html5Qrcode("reader");

    const config = { 
        fps: 20, 
        qrbox: (viewfinderWidth, viewfinderHeight) => {
            const size = Math.min(viewfinderWidth, viewfinderHeight) * 0.75;
            return { width: size, height: size };
        },
        aspectRatio: 1.0 
    };

    // Запуск камеры (facingMode: environment использует заднюю камеру смартфона)
    html5QrScanner.start(
        { facingMode: "environment" }, 
        config, 
        (decodedText) => handleAttendance(decodedText)
    ).catch(err => {
        console.error("Camera start error:", err);
        if (err.includes("NotAllowedError") || !window.isSecureContext) {
            showToast('Доступ к камере заблокирован. Используйте HTTPS.', 'error');
        } else {
            showToast('Ошибка при запуске камеры', 'error');
        }
    });

    // Обработка кнопки "Сканировать файл"
    document.getElementById('custom-file-scan').onclick = () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await html5QrScanner.scanFile(file, true);
                if (text) handleAttendance(text);
            } catch (err) {
                showToast('QR-код не найден на фото', 'error');
            }
        };
        fileInput.click();
    };
}


async function renderClients() {
    const content = document.getElementById('gym-content');
    if (window.currentView !== 'Клиенты') return;
    content.innerHTML = `
        <div class="schedule-container" style="height: 100%; display: flex; flex-direction: column;">
            <h2 class="schedule-title">Список клиентов</h2>

            <div class="input-group" style="margin: 15px 0 10px 0; display: flex; gap: 10px; align-items: center;">
                <input type="text" id="client-search" placeholder="Поиск по имени или ID..." style="flex: 1; height: 46px; margin: 0; padding: 0 15px; font-family: system-ui, sans-serif; font-size: 0.8rem;" />
                <button id="add-client-btn" style="background: var(--accent); color: #000; border: none; width: 46px; height: 46px; min-width: 46px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; margin: 0;" title="Добавить клиента"><i data-lucide="plus"></i></button>
            </div>

            <div id="clients-list-container" style="flex: 1 1 auto; min-height: 0; overflow-y: auto; margin-top: 5px; padding-bottom: 120px; scrollbar-width: none;">
                <div id="clients-list-loading" style="color: #8e959f; text-align: center; margin-top: 20px;">Загрузка...</div>
            </div>
        <button class="admin-clients-inbox-fab" id="admin-inbox-btn" aria-label="Сообщения">
                <i data-lucide="mail" style="width: 26px; height: 26px;"></i>
            </button>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
    document.getElementById('admin-inbox-btn').addEventListener('click', renderInbox);
    

    document.getElementById('add-client-btn').onclick = () => {
        let selectedFile = null;
        window.showModal({
            title: 'Регистрация клиента',
            content: `
                <div style="display: flex; flex-direction: column; gap: 15px; align-items: center;">
                    <div style="position: relative; width: 80px; height: 80px;">
                        <div id="new-client-preview" class="profile-avatar" style="width: 80px; height: 80px; margin: 0; font-size: 1.5rem; background: var(--surface-soft); color: var(--muted); border: 2px dashed var(--border);">?</div>
                        <button id="new-client-photo-trigger" style="position: absolute; bottom: -5px; right: -5px; width: 30px; height: 30px; background: var(--accent); border: 3px solid rgba(15, 23, 42, 0.16); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #000; cursor: pointer;">
                            <i data-lucide="camera" style="width: 16px; height: 16px;"></i>
                        </button>
                        <input type="file" id="new-client-file" style="display: none;" accept="image/*" />
                    </div>
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
                        <input type="text" id="new-client-name" placeholder="Имя и Фамилия" />
                        <input type="text" id="new-client-email" placeholder="Gmail или Username" />
                        <div style="position: relative;">
                            <input type="password" id="new-client-pass" placeholder="Пароль" />
                            <button type="button" class="password-toggle" id="toggle-new-client-pass" style="position: absolute; height: 34px; width: 34px; border-radius: 12px; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #666; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: color 0.3s;">
                                <i data-lucide="eye" class="eye-icon" style="width: 20px; height: 20px;"></i>
                                <i data-lucide="eye-off" class="eye-off-icon" style="width: 20px; height: 20px; display: none;"></i>
                            </button>
                        </div>
                        
                        <div style="margin-top: 10px; padding: 12px; background: var(--surface-soft); border-radius: 16px; border: 1px solid var(--border);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-size: 0.85rem; font-weight: 700; color: var(--fg);">Выдать абонемент?</span>
                                <input type="checkbox" id="new-client-sub-check" style="width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer;" checked />
                            </div>
                            <div id="sub-days-container" style="display: flex; align-items: center; gap: 10px; transition: opacity 0.3s;">
                                <span style="font-size: 0.8rem; color: #8e959f;">Срок:</span>
                                <input type="number" id="new-client-sub-days" value="30" style="flex: 1; margin: 0; padding: 8px; font-size: 0.9rem;" />
                                <span style="font-size: 0.8rem; color: #8e959f;">дн.</span>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            confirmText: 'Создать',
            onConfirm: async (overlay) => {
                const name = overlay.querySelector('#new-client-name').value.trim();
                const emailOrUser = overlay.querySelector('#new-client-email').value.trim();
                const password = overlay.querySelector('#new-client-pass').value.trim();
                const giveSub = overlay.querySelector('#new-client-sub-check').checked;
                const subDays = parseInt(overlay.querySelector('#new-client-sub-days').value) || 30;

                if (!name || !emailOrUser || !password) {
                    window.showToast('Заполните все поля', 'error');
                    return false;
                }

                const finalEmail = emailOrUser.includes('@') ? emailOrUser : `${emailOrUser}@gymfit.local`;

                try {
                    const tempClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                        auth: { persistSession: false }
                    });

                    const { data: authData, error: signUpError } = await tempClient.auth.signUp({
                        email: finalEmail,
                        password: password,
                        options: { data: { full_name: name } }
                    });

                    if (signUpError) { window.showToast(window.translateError(signUpError.message), 'error'); return false; }
                    
                    const newUserId = authData.user.id;
                    let updates = {};
                    
                    if (giveSub) {
                        const expiresAt = new Date();
                        expiresAt.setDate(expiresAt.getDate() + subDays);
                        updates.subscription_status = true;
                        updates.subscription_expires_at = expiresAt.toISOString();
                    }

                    if (selectedFile) {
                        const fileName = `${newUserId}_${Date.now()}.jpg`;
                        const { error: uploadError } = await supabaseClient.storage.from('avatars').upload(fileName, selectedFile);
                        if (!uploadError) {
                            const { data: urlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
                            updates.avatar_url = urlData.publicUrl;
                        }
                    }

                    if (Object.keys(updates).length > 0) {
                        // Ждем немного, пока триггер создаст запись в profiles
                        await new Promise(r => setTimeout(r, 500));
                        await supabaseClient.from('profiles').update(updates).eq('id', newUserId);
                    }

                    window.showToast('Клиент успешно создан!');
                    renderClients();
                    return true;
                } catch (err) {
                    window.showToast('Ошибка при создании', 'error');
                    return false;
                }
            }
        });

        setTimeout(() => {
            if (window.lucide) lucide.createIcons();
            const overlay = document.querySelector('.modal-overlay.is-active');
            if (!overlay) return;
            const photoTrigger = overlay.querySelector('#new-client-photo-trigger');
            const fileInput = overlay.querySelector('#new-client-file');
            const preview = overlay.querySelector('#new-client-preview');
            const subCheck = overlay.querySelector('#new-client-sub-check');
            const subDaysInput = overlay.querySelector('#new-client-sub-days');
            const subDaysContainer = overlay.querySelector('#sub-days-container');
            const passInput = overlay.querySelector('#new-client-pass');
            const passToggle = overlay.querySelector('#toggle-new-client-pass');

            photoTrigger.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    selectedFile = file;
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        preview.innerHTML = `<img src="${re.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
                        preview.style.border = '2px solid var(--accent)';
                    };
                    reader.readAsDataURL(file);
                }
            };
            subCheck.onchange = () => {
                subDaysInput.disabled = !subCheck.checked;
                subDaysContainer.style.opacity = subCheck.checked ? '1' : '0.5';
            };
            
            // Password toggle functionality
            passToggle.onclick = (e) => {
                e.preventDefault();
                const eyeIcon = passToggle.querySelector('.eye-icon');
                const eyeOffIcon = passToggle.querySelector('.eye-off-icon');
                if (passInput.type === 'password') {
                    passInput.type = 'text';
                    passToggle.classList.add('is-visible');
                    eyeIcon.style.display = 'none';
                    eyeOffIcon.style.display = 'block';
                } else {
                    passInput.type = 'password';
                    passToggle.classList.remove('is-visible');
                    eyeIcon.style.display = 'block';
                    eyeOffIcon.style.display = 'none';
                }
            };
        }, 50);
    };

    // Fetch clients with count, sorted by last activity (most recent first)
    const { data, error, count: totalCount } = await supabaseClient.from('profiles')
        .select('*', { count: 'exact' })
        .order('last_seen_at', { ascending: false, nullsFirst: false });
    const listContainer = document.getElementById('clients-list-container');
    if (!listContainer) return; // Exit if the user switched tabs during the 'await'
    if (window.currentView !== 'Клиенты') return;

    // Update title with total members count
    const titleEl = content.querySelector('.schedule-title');
    if (titleEl && totalCount !== null) titleEl.innerText = `Список клиентов (${totalCount})`;

    if (error) {
        listContainer.innerHTML = '<div style="color: var(--muted); text-align: center; margin-top: 20px;">Ошибка загрузки данных</div>';
        return;
    }

    const allClients = data || [];

    const displayClients = (filtered) => {
        listContainer.innerHTML = '';
        if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="color: #8e959f; text-align: center; margin-top: 20px;">Клиенты не найдены</div>';
            return;
        }
        filtered.forEach(client => {
            const item = document.createElement('div');
            item.className = 'plan-item';
            item.style.cssText = 'justify-content: flex-start; gap: 14px; padding: 10px 16px; cursor: pointer; border: 1px solid var(--border); margin-bottom: 10px; border-radius: 16px; background: var(--surface-soft);';
            const avatarHtml = client.avatar_url 
                ? `<img src="${client.avatar_url}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;" />`
                : `<div class="profile-avatar" style="width: 40px; height: 40px; font-size: 1rem; margin-bottom: 0;">${(client.full_name || 'С').charAt(0).toUpperCase()}</div>`;
            
            // Calculate activity status
            const lastSeen = client.last_seen_at ? new Date(client.last_seen_at) : null;
            const isOnline = lastSeen && (new Date() - lastSeen < 300000); // Online if active in last 5 minutes
            const activityText = isOnline ? 'В СЕТИ' : (lastSeen ? formatRelativeDate(lastSeen) : 'Не заходил');
            const statusColor = isOnline ? 'var(--accent)' : '#8e959f';

            item.innerHTML = `
                ${avatarHtml}
                <div style="text-align: left; flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="color: var(--fg); display: flex; align-items: center; gap: 8px; font-size: 0.8rem;">
                            ${client.full_name || 'Без имени'}
                            ${isOnline ? 
                                '<span style="width:10px; height:10px; flex-shrink: 0; background: var(--accent); border-radius:50%; box-shadow: 0 0 8px rgba(212, 175, 55, 0.35); border: 2px solid rgba(15, 23, 42, 0.18);"></span>' : 
                                '<span style="width:10px; height:10px; flex-shrink: 0; background:#4e555e; border-radius:50%; border: 2px solid rgba(15, 23, 42, 0.18);"></span>'
                            }
                        </div>
                        <div style="font-size: 0.8rem; color: ${statusColor}; letter-spacing: 0.5px; font-weight: 500;">
                            ${activityText.toUpperCase()}
                        </div>
                    </div>
                    <div style="font-size: 0.8rem; color: #8e959f; opacity: 0.8; font-family: system-ui, sans-serif; font-weight: 500;">ID: #${client.id.split('-')[0]}... • ${client.subscription_status ? 'С абонементом' : 'Без абонемента'}</div>
                </div>
            `;
            item.addEventListener('click', () => renderClientDetail(client));
            listContainer.appendChild(item);
        });
    };

    // Изначальный показ всех клиентов
    displayClients(allClients);

    // Логика поиска
    const searchInput = document.getElementById('client-search');
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        const filtered = allClients.filter(c => 
            (c.full_name || '').toLowerCase().includes(term) || 
            c.id.toLowerCase().includes(term)
        );
        displayClients(filtered);
    });
}

async function renderClientDetail(client) {
    const content = document.getElementById('gym-content');
    if (window.currentView !== 'Клиенты') return;
    const hasSub = client.subscription_status === true;
    
    const { count } = await supabaseClient
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', client.id);
    if (window.currentView !== 'Клиенты') return;

    // Securely fetch the admin_note for this specific client
    let adminNote = null;
    try {
        const { data: noteData, error: noteError } = await supabaseClient
            .from('profiles')
            .select('admin_note')
            .eq('id', client.id)
            .maybeSingle();
        if (noteError) throw noteError;
        if (noteData) adminNote = noteData.admin_note;
    } catch (e) { console.error("Could not fetch admin note for client:", e); }
    if (window.currentView !== 'Клиенты') return;

    const photoHtml = client.avatar_url 
        ? `<div style="position: relative; width: 90px; height: 90px; margin: 0 auto 20px;">
             <img src="${client.avatar_url}" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 3px solid var(--accent);" />
             <button id="client-avatar-delete" style="position: absolute; bottom: -2px; right: -2px; width: 32px; height: 32px; background: rgba(185, 28, 28, 0.95); border: 3px solid rgba(15, 23, 42, 0.16); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; cursor: pointer; z-index: 10;">
                <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
             </button>
           </div>`
        : `<div class="profile-avatar">${(client.full_name || 'С').charAt(0).toUpperCase()}</div>`;

    content.innerHTML = `
        <div class="planner-container" style="height: 100%; display: flex; flex-direction: column; overflow-y: auto; padding-bottom: 100px; scrollbar-width: none;">
            <div class="planner-header">
                <button class="back-arrow-btn" id="client-detail-back" style="top: 0; left: 0;"><i data-lucide="arrow-left" style="width: 28px; height: 28px;"></i></button>
                <h2 class="planner-title">Карточка клиента</h2>
                <button class="back-arrow-btn" id="client-qr-btn" style="top: 0; right: 0; left: auto;"><i data-lucide="qr-code" style="width: 26px; height: 26px;"></i></button>
                <button class="back-arrow-btn" id="client-edit-btn" style="top: 45px; right: 0; left: auto;"><i data-lucide="file-pen-line" style="width: 24px; height: 24px;"></i></button>
            </div>
            <div class="profile-container" style="margin-top: 30px;">
                ${photoHtml}
                <h2 class="profile-name">${client.full_name || 'Без имени'}</h2>
                <p class="profile-email" style="margin-bottom: 15px;">${client.id}</p>
                <div class="card profile-info-card" style="text-align: left;">
                    <div class="info-row"><span class="info-label">Статус:</span><span class="info-value" style="color: ${hasSub ? 'var(--accent)' : 'var(--muted)'}">${hasSub ? 'Активен' : 'Не активен'}</span></div>
                    ${hasSub ? `<div class="info-row"><span class="info-label">Истекает:</span><span class="info-value">${new Date(client.subscription_expires_at).toLocaleDateString('ru-RU')}</span></div>` : ''}
                    <div class="info-row"><span class="info-label">Посещений:</span><span class="info-value">${count || 0}</span></div>
                </div>
                
                <div class="card profile-info-card profile-info-card--note" style="text-align: left; margin-bottom: 15px;">
                    <div class="info-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span class="info-label" style="color: var(--accent);">Заметка Админа:</span>
                            <button id="save-admin-note-btn" class="btn-link" title="Сохранить заметку" style="color: var(--fg); background: rgba(212, 175, 55, 0.1); border-radius: 12px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; padding: 0;">
                                <i data-lucide="check" style="width: 18px; height: 18px;"></i>
                            </button>
                        </div>
                        <textarea id="admin-note-textarea" class="plan-textarea" style="min-height: 80px; font-size: 0.85rem; background: transparent; border-color: rgba(255,255,255,0.1);">${adminNote || ''}</textarea>
                    </div>
                </div>

                <div class="profile-actions">
                    <button class="btn-primary" id="grant-sub-btn">Выдать абонемент</button>
                    <button class="btn-logout" id="cancel-sub-btn" style="border-color: rgba(255,255,255,0.1); color: #8e959f;">Аннулировать доступ</button>
                    <button class="btn-primary" id="view-attendance-btn" style="background: transparent; border: 1px solid var(--accent); color: var(--accent);">Посещаемость</button>
                </div>
            </div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();

    document.getElementById('client-detail-back').addEventListener('click', renderClients);
    document.getElementById('view-attendance-btn').addEventListener('click', () => renderSchedule(new Date(), client.id, client));

    document.getElementById('save-admin-note-btn').addEventListener('click', async (e) => {
        const noteText = document.getElementById('admin-note-textarea').value.trim();
        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update({ admin_note: noteText || null }) // Use null if empty
                .eq('id', client.id);
            
            if (error) throw error;
            window.showToast('Заметка сохранена!', 'success');
            window.applyBtnCooldown(e.target, 3);
        } catch (err) {
            console.error("Failed to save admin note:", err);
            window.showToast('Ошибка сохранения заметки', 'error');
        }
    });

    const deleteAvatarBtn = document.getElementById('client-avatar-delete');
    if (deleteAvatarBtn) {
        deleteAvatarBtn.onclick = () => {
            window.showModal({
                title: 'Удалить фото?',
                content: '<p style="color: #8e959f; font-size: 0.9rem;">Вы действительно хотите удалить фото профиля этого клиента?</p>',
                confirmText: 'Удалить',
                onConfirm: async () => {
                    try {
                        const { error } = await supabaseClient.from('profiles').update({ avatar_url: null }).eq('id', client.id);
                        if (error) throw error;
                        window.showToast('Фото удалено');
                        renderClientDetail({ ...client, avatar_url: null });
                        return true;
                    } catch (err) {
                        window.showToast('Ошибка при удалении', 'error');
                        return false;
                    }
                }
            });
        };
    }

    document.getElementById('client-qr-btn').onclick = () => {
        window.showModal({
            title: `QR-код клиента`,
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
    
    document.getElementById('client-edit-btn').onclick = () => {
        let selectedFile = null;
        window.showModal({
            title: 'Изменение данных',
            content: `
                <div style="display: flex; flex-direction: column; gap: 15px; align-items: center;">
                    <div style="position: relative; width: 80px; height: 80px;">
                        <div id="edit-preview" class="profile-avatar" style="width: 80px; height: 80px; margin: 0; overflow: hidden; border: 2px solid var(--accent);">
                            ${client.avatar_url 
                                ? `<img src="${client.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" />`
                                : `<span style="font-size: 1.5rem;">${(client.full_name || 'С').charAt(0).toUpperCase()}</span>`
                            }
                        </div>
                        <button id="edit-photo-trigger" style="position: absolute; bottom: -5px; right: -5px; width: 30px; height: 30px; background: var(--accent); border: 3px solid rgba(15, 23, 42, 0.16); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #000; cursor: pointer;">
                            <i data-lucide="camera" style="width: 16px; height: 16px;"></i>
                        </button>
                        <input type="file" id="edit-file" style="display: none;" accept="image/*" />
                    </div>
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
                        <label style="color: #8e959f; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Имя и Фамилия</label>
                        <input type="text" id="edit-name" placeholder="Имя и Фамилия" value="${(client.full_name || '').replace(/"/g, '&quot;')}" />
                    </div>
                </div>
            `,
            confirmText: 'Сохранить',
            onConfirm: async (overlay) => {
                const newName = overlay.querySelector('#edit-name').value.trim();
                if (!newName) {
                    window.showToast('Имя не может быть пустым', 'error');
                    return false;
                }

                try {
                    let updates = { full_name: newName };

                    if (selectedFile) {
                        const fileName = `avatar_${client.id}_${Date.now()}.jpg`;
                        const { error: upErr } = await supabaseClient.storage.from('avatars').upload(fileName, selectedFile);
                        if (upErr) throw upErr;

                        const { data: urlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
                        updates.avatar_url = urlData.publicUrl;
                    }

                    const { data: updated, error: updateErr } = await supabaseClient
                        .from('profiles')
                        .update(updates)
                        .eq('id', client.id)
                        .select()
                        .single();

                    if (updateErr) throw updateErr;

                    window.showToast('Данные обновлены');
                    renderClientDetail(updated);
                    return true;
                } catch (err) {
                    console.error(err);
                    window.showToast('Ошибка при обновлении', 'error');
                    return false;
                }
            }
        });

        setTimeout(() => {
            if (window.lucide) lucide.createIcons();
            const overlay = document.querySelector('.modal-overlay.is-active');
            if (!overlay) return;
            const trigger = overlay.querySelector('#edit-photo-trigger');
            const fileInput = overlay.querySelector('#edit-file');
            const preview = overlay.querySelector('#edit-preview');

            if (trigger && fileInput) trigger.onclick = () => fileInput.click();
            if (fileInput) fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    selectedFile = file;
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        preview.innerHTML = `<img src="${re.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`;
                    };
                    reader.readAsDataURL(file);
                }
            };
        }, 50);
    };

    document.getElementById('grant-sub-btn').addEventListener('click', async () => {
        showModal({
            title: 'Выдача абонемента',
            content: `
                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn-link sub-preset-days" data-days="1" data-amount="250" style="flex:1; background: var(--surface-soft); border: 1px solid var(--border); border-radius:12px; padding:10px; font-size:0.78rem; cursor:pointer;">1 день</button>
                    <button type="button" class="btn-link sub-preset-days" data-days="30" data-amount="2000" style="flex:1; background: var(--surface-soft); border: 1px solid var(--border); border-radius:12px; padding:10px; font-size:0.78rem; cursor:pointer;">30 дней</button>
                </div>
                <input type="number" id="m-days" placeholder="Срок (дней)" value="30" />
                <input type="number" id="m-amount" placeholder="Сумма (₽)" value="2000" />
                ${renderMethodToggleHtml('m-method')}
                <input type="text" id="m-info" placeholder="Заметка (необязательно)" />
            `,
            confirmText: 'Подтвердить',
            onConfirm: async (overlay) => {
                const days = parseInt(overlay.querySelector('#m-days').value) || 30;
                const amount = overlay.querySelector('#m-amount').value;
                const method = overlay.querySelector('#m-method').dataset.value;
                const info = overlay.querySelector('#m-info').value;
                if (!amount) { showToast('Укажите сумму', 'error'); return false; }

                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + days);

                const { data: updated, error } = await supabaseClient.from('profiles').update({
                    subscription_status: true,
                    subscription_expires_at: expiresAt.toISOString(),
                    last_payment_received_at: new Date().toISOString()
                }).eq('id', client.id).select().single();

                if (error) {
                    showToast('Ошибка обновления профиля', 'error');
                    return false;
                }

                const { error: payError } = await supabaseClient.from('payments').insert([{
                        user_id: client.id,
                        amount: parseFloat(amount),
                        info: info
                    }]);

                if (payError) {
                    showToast('Ошибка записи платежа: ' + window.translateError(payError.message), 'error');
                    return false;
                }

                showToast('Доступ предоставлен');

                if (typeof markAttendanceForClient === 'function') {
                    // Granting a subscription in person (1 day or 30) means the
                    // client is here today, and since they now have a sub they
                    // won't scan their QR - mark today's attendance ourselves so
                    // their calendar and streak still count the visit.
                    markAttendanceForClient(client.id);
                }

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

                renderClientDetail(updated);
                return true;
            }
        });

        setTimeout(() => {
            const overlay = document.querySelector('.modal-overlay.is-active');
            if (!overlay) return;
            if (window.lucide) lucide.createIcons();
            wireMethodToggle(overlay.querySelector('#m-method'));
            overlay.querySelectorAll('.sub-preset-days').forEach(btn => {
                btn.onclick = () => {
                    overlay.querySelector('#m-days').value = btn.dataset.days;
                    overlay.querySelector('#m-amount').value = btn.dataset.amount;
                };
            });
        }, 50);
    });

    document.getElementById('cancel-sub-btn').addEventListener('click', async () => {
        showModal({
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
                    showToast('Доступ закрыт'); 
                    renderClientDetail(updated); 
                }
                return true;
            }
        });
    });
}

async function renderInbox() {
    const content = document.getElementById('gym-content');
    if (window.currentView !== 'Клиенты') return;
    content.innerHTML = `
        <div class="planner-container" style="height: 100%; display: flex; flex-direction: column;">
            <div class="planner-header">
                <button class="back-arrow-btn" id="inbox-back" style="top: 0; left: 0;"><i data-lucide="arrow-left" style="width: 28px; height: 28px;"></i></button>
                <h2 class="planner-title">Отправленные</h2>
            </div>
            <div id="admin-messages-list" style="flex: 1; overflow-y: auto; margin-top: 20px; padding-bottom: 80px; scrollbar-width: none;">
                <div style="text-align: center; color: #8e959f; padding: 20px;">Загрузка сообщений...</div>
            </div>
            <button class="inbox-action-fab" id="admin-new-msg"><i data-lucide="plus" style="width: 24px; height: 24px;"></i></button>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
    document.getElementById('inbox-back').onclick = renderClients;
    document.getElementById('admin-new-msg').onclick = renderComposeMessage;

    const { data: messages, error } = await supabaseClient
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false });

    const listContainer = document.getElementById('admin-messages-list');
    if (!listContainer) return;
    if (window.currentView !== 'Клиенты') return;

    if (error || !messages || messages.length === 0) {
        listContainer.innerHTML = `
            <div style="margin-top: auto; margin-bottom: auto; text-align: center; color: #8e959f; padding: 0 40px;">
                <p>Здесь будут сообщения, которые вы отправили</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = '';
    messages.forEach(m => {
        const item = document.createElement('div');
        item.className = 'plan-item';
        item.style.cssText = 'flex-direction: column; align-items: flex-start; gap: 5px; cursor: pointer; margin-bottom: 10px; padding: 15px;';
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center; margin-bottom: 5px;">
                <div style="color: var(--accent); font-size: 0.7rem; font-weight: 700; text-transform: uppercase;">Рассылка</div>
                <div style="color: #8e959f; font-size: 0.7rem;">${formatRelativeDate(m.created_at)}</div>
            </div>
            <div style="color: var(--fg); font-size: 0.8rem; font-weight: 700;">${m.title || 'Без темы'}</div>
            <div style="color: #8e959f; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; opacity: 0.7;">${m.content}</div>
        `;
        item.onclick = () => renderAdminMessageDetail(m);
        listContainer.appendChild(item);
    });
}

function renderComposeMessage() {
    const content = document.getElementById('gym-content');
    content.innerHTML = `
        <div class="planner-container" style="height: 100%; display: flex; flex-direction: column;">
            <div class="planner-header">
                <button class="back-arrow-btn" id="compose-back" style="top: 0; left: 0;"><i data-lucide="arrow-left" style="width: 28px; height: 28px;"></i></button>
                <h2 class="planner-title">Рассылка</h2>
            </div>
            <div style="margin-top: 30px; display: flex; flex-direction: column; gap: 20px;">
                <div class="input-group">
                    <input type="text" id="msg-title" placeholder="Тема сообщения" style="font-weight: 600;" />
                </div>
                <textarea id="msg-body" class="plan-textarea" placeholder="Текст для всех клиентов..." style="min-height: 150px;"></textarea>
                <button class="btn-primary" id="send-broadcast-btn" style="box-shadow: 0 10px 20px rgba(212, 175, 55, 0.2);">Отправить всем</button>
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
    document.getElementById('compose-back').addEventListener('click', renderInbox);
    document.getElementById('send-broadcast-btn').addEventListener('click', async () => {
        const btn = document.getElementById('send-broadcast-btn');
        if (btn) btn.disabled = true;

        try {
            const title = document.getElementById('msg-title').value.trim();
            const body = document.getElementById('msg-body').value.trim();
            if (!title || !body) return showToast('Заполните все поля', 'error');

            // 1) Защита от повторных кликов: кнопка отключена до завершения.
            // 2) (На всякий случай) добавим мягкую задержку, чтобы не сработали двойные события на медленных устройствах.
            await new Promise(r => setTimeout(r, 2000));

            // Создаем один экземпляр сообщения
            const { data: msgRow, error: msgErr } = await supabaseClient
                .from('messages')
                .insert([{ title, content: body }])
                .select()
                .single();
            if (msgErr) return showToast('Ошибка БД', 'error');

            // Рассылаем ссылки всем пользователям
            const { data: p } = await supabaseClient.from('profiles').select('id');
            const links = (p || []).map(u => ({ message_id: msgRow.id, recipient_id: u.id }));
            if (links.length) {
                await supabaseClient.from('message_recipients').insert(links);
            }

            showToast('Сообщения отправлены');
            renderInbox();
        } finally {
            if (btn) btn.disabled = false;
        }
    });
}

async function renderAdminReports() {
    const content = document.getElementById('gym-content');
    if (window.currentView !== 'Отчеты') return;
    content.innerHTML = '<div style="text-align:center; margin-top:50px; color:#8e959f;">Загрузка аналитики...</div>';

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const todayStr = new Date().toLocaleDateString('en-CA');

    // Загружаем все данные параллельно для скорости
    const [
        { count: activeCount },
        { count: todayVisits },
        { data: paymentsData }
    ] = await Promise.all([
        supabaseClient.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_status', true),
        supabaseClient.from('attendance').select('*', { count: 'exact', head: true }).eq('visit_date', todayStr),
        supabaseClient.from('payments').select('amount').gte('created_at', firstDayOfMonth)
    ]);
    
    if (window.currentView !== 'Отчеты') return;

    // Считаем общую выручку за месяц
    const totalRevenue = paymentsData ? paymentsData.reduce((sum, p) => sum + Number(p.amount), 0) : 0;

    content.innerHTML = `
        <div class="planner-container" style="height: 100%; display: flex; flex-direction: column; animation: sectionFade 0.4s ease-out; padding: 0 10px;">
            <div class="planner-header" style="margin-bottom: 20px;">
                <h2 class="planner-title">Аналитика</h2>
                <button id="view-history-btn" class="back-arrow-btn" style="right: 0; left: auto; padding: 5px;">
                    <i data-lucide="history" style="width: 24px; height: 24px;"></i>
                </button>
            </div>

            <div style="background: linear-gradient(135deg, rgba(212, 175, 55, 0.16) 0%, rgba(212, 175, 55, 0.08) 100%); border: 1px solid rgba(212, 175, 55, 0.24); border-radius: 24px; padding: 25px; margin-bottom: 15px;">
                <div style="font-size: 0.7rem; color: var(--fg); text-transform: uppercase; letter-spacing: 1.5px; font-weight: 800; margin-bottom: 8px; opacity: 0.95;">Выручка (Месяц)</div>
                <div style="font-size: 1.5rem; font-weight: 900; color: var(--fg);">${totalRevenue.toLocaleString('ru-RU')} ₽</div>
                <div style="font-size: 0.75rem; color: var(--accent); margin-top: 5px; display: flex; align-items: center; gap: 6px;">
                    <span style="width: 6px; height: 6px; background: var(--accent); border-radius: 50%;"></span> Данные актуальны
                </div>
            </div>

            <button class="btn-primary" id="manual-adjust-btn" style="margin-bottom: 15px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #8e959f; font-weight: 700; box-shadow: none; width: fit-content; padding: 8px 12px; font-size: 0.7rem; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="coins" style="width: 14px; height: 14px;"></i>
                <span style="font-size:0.8rem;">Добавить / Списать</span>
            </button>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                <div class="plan-item" style="flex-direction: column; align-items: center; padding: 20px; background: var(--glass); border-radius: 20px; margin: 0;">
                    <div style="font-size: 0.8rem; font-weight: 900; color: var(--accent);">${activeCount || 0}</div>
                    <div style="font-size: 0.65rem; color: #8e959f; font-weight: 700; text-transform: uppercase;">Активных</div>
                </div>
                <div class="plan-item" style="flex-direction: column; align-items: center; padding: 20px; background: var(--glass); border-radius: 20px; margin: 0;">
                    <div style="font-size: 0.8rem; font-weight: 900; color: var(--fg);">${todayVisits || 0}</div>
                    <div style="font-size: 0.65rem; color: #8e959f; font-weight: 700; text-transform: uppercase;">Посещений</div>
                </div>
            </div>
        </div>
    `;

    // Инициализация иконок Lucide после вставки HTML
    if (window.lucide) lucide.createIcons();

    document.getElementById('view-history-btn').onclick = () => renderPaymentHistory();

    document.getElementById('manual-adjust-btn').addEventListener('click', async () => {
        showModal({
            title: 'Изменение кассы',
            content: `
                <select id="m-type" style="color: var(--accent); font-weight: 700;">
                    <option value="plus">➕ Приход (Добавить деньги)</option>
                    <option value="minus">➖ Расход (Списать деньги)</option>
                </select>
                <input type="number" id="m-amount" placeholder="Сумма (₽)" />
                <textarea id="m-info" placeholder="Описание операции (заметка)..." style="height: 100px;"></textarea>
            `,
            confirmText: 'Сохранить',
            onConfirm: async (overlay) => {
                const type = overlay.querySelector('#m-type').value;
                const amountVal = overlay.querySelector('#m-amount').value;
                const info = overlay.querySelector('#m-info').value;

                if (!amountVal) return false;
                let amount = parseFloat(amountVal);
                if (type === 'minus') amount = -amount;

                const { data: auth } = await supabaseClient.auth.getUser();
                const { error } = await supabaseClient.from('payments').insert([{
                    user_id: auth.user.id,
                    amount: amount,
                    info: info
                }]);

                if (!error) {
                    showToast('Касса обновлена');
                    renderAdminReports();
                    return true;
                } else {
                    showToast('Ошибка: ' + window.translateError(error.message), 'error');
                    return false;
                }
            }
        });
    });
}

async function renderPaymentHistory() {
    const content = document.getElementById('gym-content');
    if (window.currentView !== 'Отчеты') return;
    content.innerHTML = `
        <div class="planner-container" style="height: 100%; display: flex; flex-direction: column;">
            <div class="planner-header">
                <button class="back-arrow-btn" id="history-back" style="top: 0; left: 0;"><i data-lucide="arrow-left" style="width: 28px; height: 28px;"></i></button>
                <h2 class="planner-title">История транзакций</h2>
            </div>
            <div id="history-list" style="flex: 1; overflow-y: auto; margin-top: 20px; padding-bottom: 20px; scrollbar-width: none;">
                <div style="text-align: center; color: #8e959f; padding: 20px;">Загрузка истории...</div>
            </div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
    document.getElementById('history-back').onclick = () => renderAdminReports();

    const { data: payments, error } = await supabaseClient
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });

    const listContainer = document.getElementById('history-list');
    if (!listContainer) return;
    if (window.currentView !== 'Отчеты') return;

    if (error || !payments || payments.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; color: #8e959f; padding: 40px 0;">Транзакции не найдены</div>';
        return;
    }

    listContainer.innerHTML = '';
    payments.forEach(p => {
        const isPositive = Number(p.amount) >= 0;
        const item = document.createElement('div');
        item.className = 'plan-item';
        item.style.cssText = 'flex-direction: column; align-items: flex-start; gap: 8px; padding: 15px; margin-bottom: 12px; border: 1px solid var(--border);';

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                <div style="font-size: 1.1rem; font-weight: 800; color: ${isPositive ? 'var(--accent)' : '#b91c1c'};">
                    ${isPositive ? '+' : ''}${p.amount.toLocaleString('ru-RU')} ₽
                </div>
                <button class="btn-link undo-btn" style="color: #b91c1c; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Отменить</button>
            </div>
            <div style="color: var(--fg); font-size: 0.85rem; line-height: 1.4;">${p.info || 'Нет описания'}</div>
            <div style="color: #8e959f; font-size: 0.7rem;">${formatRelativeDate(p.created_at)}</div>
        `;

        item.querySelector('.undo-btn').onclick = () => {
            showModal({
                title: 'Отмена транзакции',
                content: `<p style="color: #8e959f; font-size: 0.9rem;">Вы уверены? Это действие удалит запись об этой операции и изменит баланс.</p>`,
                confirmText: 'Да, удалить',
                onConfirm: async () => {
                    const { error: delError } = await supabaseClient.from('payments').delete().eq('id', p.id);
                    if (!delError) {
                        showToast('Транзакция отменена');
                        renderPaymentHistory();
                    } else {
                        showToast('Ошибка при удалении', 'error');
                    }
                    return true;
                }
            });
        };
        listContainer.appendChild(item);
    });
}

/**
 * View details of a sent message with Edit/Delete options
 */
async function renderAdminMessageDetail(msg) {
    const messageId = msg.id;
    if (window.currentView !== 'Клиенты') return;

    // Получаем общее количество просмотров для всей рассылки (сообщения)
    const { count: seenCount } = await supabaseClient
        .from('message_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('message_id', messageId)
        .not('read_at', 'is', null);
    if (window.currentView !== 'Клиенты') return;

    const content = document.getElementById('gym-content');
    content.innerHTML = `
        <div class="planner-container" style="height: 100%; display: flex; flex-direction: column;">
            <div class="planner-header">
                <button class="back-arrow-btn" id="msg-detail-back" style="top: 0; left: 0;"><i data-lucide="arrow-left" style="width: 24px; height: 24px;"></i></button>
                <h2 class="planner-title">Просмотр</h2>
            </div>
            <div style="margin-top: 20px; text-align: left; padding-bottom: 30px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="color: var(--accent); font-size: 0.7rem; font-weight: 700; text-transform: uppercase;">Тип: Общая рассылка</div>
                    <div style="color: var(--muted); font-size: 0.7rem; font-weight: 700;">ОТПРАВЛЕНО: ${formatRelativeDate(msg.created_at)}</div>
                </div>
                <h1 style="font-size: 1.4rem; margin-top: 10px; margin-bottom: 15px; color: var(--fg);">${msg.title || 'Без темы'}</h1>
                <div style="color: #8e959f; line-height: 1.6; margin-bottom: 40px; white-space: pre-wrap; font-size: 1rem;">${msg.content}</div>
                <div style="margin-top: -20px; margin-bottom: 30px; border-bottom: 1px solid rgba(255,255,255,0.1);"></div>

                <div style="margin-top: auto; margin-bottom: 20px;">
                    <button id="view-readers-btn" class="btn-link" style="color: var(--accent); font-weight: 700; font-size: 0.85rem; padding: 12px; background: rgba(212, 175, 55, 0.08); border: 1px solid rgba(212, 175, 55, 0.18); border-radius: 12px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
                        <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
                        Просмотрено: ${seenCount || 0}
                    </button>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: auto;">
                    <button class="btn-primary" id="edit-msg-btn" style="flex: 1; opacity: 1;">Правка контента</button>

                    <button class="btn-logout" id="delete-msg-btn" style="flex: 1; border-color: rgba(212, 175, 55, 0.25); color: var(--accent);">Удалить</button>
                </div>
            </div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();

    document.getElementById('msg-detail-back').onclick = renderInbox;
    document.getElementById('view-readers-btn').onclick = () => showMessageReaders(messageId);

    document.getElementById('edit-msg-btn').onclick = () => {
        showModal({
            title: 'Правка контента',
            content: `
                <input type="text" id="edit-msg-title" placeholder="Тема" value="${(msg.title || '').replace(/"/g, '"')}" />
                <textarea id="edit-msg-content" placeholder="Описание" style="height: 140px;">${(msg.content || '').replace(/</g, '<')}</textarea>
            `,
            confirmText: 'Сохранить',
            onConfirm: async (overlay) => {
                const title = overlay.querySelector('#edit-msg-title').value.trim();
                const contentText = overlay.querySelector('#edit-msg-content').value.trim();
                if (!title || !contentText) {
                    showToast('Заполните тему и описание', 'error');
                    return false;
                }

                try {
                    const { error: updateErr } = await supabaseClient.from('messages').update({
                        title: title,
                        content: contentText
                    }).eq('id', messageId);

                    if (updateErr) {
                        showToast('Ошибка обновления', 'error');
                        return false;
                    }

                    showToast('Контент обновлён');
                    renderInbox();
                    return true;
                } catch (e) {
                    console.error(e);
                    showToast('Ошибка', 'error');
                    return false;
                }
            }
        });
    };

    document.getElementById('delete-msg-btn').onclick = () => {
        showModal({
            title: 'Удаление',
            content: '<p style="color: #8e959f; font-size: 0.9rem;">Вы действительно хотите удалить это сообщение?</p>',
            confirmText: 'Удалить',
            onConfirm: async () => {
                const { error: delRecipientsError } = await supabaseClient.from('message_recipients').delete().eq('message_id', msg.id);
                const { error: delMsgError } = await supabaseClient.from('messages').delete().eq('id', msg.id);
                
                if (!delMsgError) {
                    showToast('Удалено');
                    renderInbox();
                }
                return true;
            }
        });
    };
}

/**
 * Displays a modal with a searchable/scrollable list of users who viewed the message.
 */
async function showMessageReaders(messageId) {
    const { data: readers, error } = await supabaseClient
        .from('message_recipients')
        .select('read_at, profiles:recipient_id(full_name, avatar_url)')
        .eq('message_id', messageId)
        .not('read_at', 'is', null)
        .order('read_at', { ascending: false });

    if (error) return showToast('Ошибка загрузки списка', 'error');

    const renderList = (list) => {
        if (!list || list.length === 0) return '<div style="text-align:center; padding:20px; color:#8e959f;">Никто еще не видел</div>';
        return list.map(r => {
            const name = r.profiles?.full_name || 'Спортсмен';
            const avatar = r.profiles?.avatar_url 
                ? `<img src="${r.profiles.avatar_url}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;" />`
                : `<div class="profile-avatar" style="width:30px; height:30px; font-size:0.7rem; margin:0;">${name.charAt(0)}</div>`;
            return `
                <div style="display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border);">
                    ${avatar}
                    <div style="flex:1;">
                        <div style="color:var(--fg); font-size:0.85rem; font-weight:600;">${name}</div>
                        <div style="color:#8e959f; font-size:0.7rem;">${formatRelativeDate(r.read_at)}</div>
                    </div>
                </div>
            `;
        }).join('');
    };

    showModal({
        title: 'Кто прочитал',
        content: `
            <input type="text" id="reader-search" placeholder="Поиск по имени..." style="margin-bottom: 15px; font-size: 0.9rem;" />
            <div id="readers-modal-list" style="max-height: 250px; overflow-y: auto; scrollbar-width: none;">
                ${renderList(readers)}
            </div>
        `,
        confirmText: 'Закрыть',
        showCancel: false,
        onConfirm: () => true
    });

    const searchInput = document.getElementById('reader-search');
    const listDiv = document.getElementById('readers-modal-list');
    if (searchInput && listDiv) {
        searchInput.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = readers.filter(r => (r.profiles?.full_name || '').toLowerCase().includes(term));
            listDiv.innerHTML = renderList(filtered);
        };
    }
}