/**
 * SCRIPT3.JS: USER/CUSTOMER MODULE
 * Contains personal QR code display, attendance tracking, subscription status, and profile split.
 */
 
window.escapeHtml = function(str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '>')
        .replaceAll('"', '"')
        .replaceAll("'", '&#039;');
}

window.renderUserQRCode = function(user, profile) {
    const name = profile?.full_name || user?.user_metadata?.full_name || 'Спортсмен';
    const hasSub = profile?.subscription_status === true;

    const userId = profile?.id || user?.id;
    document.getElementById('gym-content').innerHTML = `
        <div class="qr-container">
            <h1 class="qr-title" style="letter-spacing: 2px;">ВАШ ПРОПУСК</h1>
            <div class="qr-wrapper" style="position: relative; padding: 15px; background: #fff; border-radius: 25px; box-shadow: 0 0 50px rgba(212, 175, 55, 0.22); overflow: hidden; margin-bottom: 20px; width: 80%; max-width: 230px;">
                <img id="dynamic-qr" src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${userId}&bgcolor=ffffff" 
                     style="display: block; border-radius: 10px; width: 100%; height: auto;" />
            </div>
            ${!hasSub ? `
            <div style="background: rgba(15, 23, 42, 0.06); border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 18px; padding: 15px; margin-bottom: 20px; color: #475569; font-size: 0.85rem; font-weight: 700; line-height: 1.4; max-width: 280px; text-align: center;">
                У вас нет активного абонемента.
            </div>
            ` : ''}
            <p class="qr-description" style="opacity: 0.7; font-size: 0.9rem; font-family: system-ui, sans-serif;">Предъявите код на ресепшене</p>
            <div class="qr-user-info" style="background: var(--glass); border-radius: 20px; padding: 20px; margin-top: 30px; width: 100%;">
                <div class="qr-user-name">${name}</div>
                <div class="qr-user-id">Карта: #${userId || '0'}</div>
            </div>
        </div>
    `;
}

window.renderSchedule = async function(targetDate = new Date(), specificUserId = null, backProfile = null) {
    const content = document.getElementById('gym-content');
    if (window.currentView !== 'Расписание' && !backProfile) return;
    const now = new Date();
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

    // Если ID пользователя не передан (например, при прямом переходе), берем ID текущей сессии
    if (!specificUserId && supabaseClient) {
        const { data: authData } = await supabaseClient.auth.getUser();
        specificUserId = authData?.user?.id;
    }

    let attendedDays = [];

    if (specificUserId) {
        const { data } = await supabaseClient
            .from('attendance')
            .select('visit_date')
            .eq('user_id', specificUserId)
            .gte('visit_date', `${year}-${String(month+1).padStart(2,'0')}-01`)
            .lte('visit_date', `${year}-${String(month+1).padStart(2,'0')}-${lastDayOfMonth}`);

        if (window.currentView !== 'Расписание' && !backProfile) return;

        if (data) {
            // Надежное извлечение дня месяца, разделяя по дефису, букве T или пробелу
            attendedDays = data.map(d => {
                const parts = d.visit_date.split(/[-T ]/);
                return parseInt(parts[2], 10);
            });
        }
    }

    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const shift = (new Date(year, month, 1).getDay() || 7) - 1;

    let daysHTML = '';
    for (let i = 0; i < shift; i++) daysHTML += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
        const isToday = new Date(year, month, d).toDateString() === now.toDateString();
        daysHTML += `<div class="calendar-day ${isToday ? 'today' : ''} ${attendedDays.includes(d) ? 'attended' : ''}" style="font-family: system-ui, sans-serif;">${d}</div>`;
    }

    content.innerHTML = `
        <div class="schedule-container">
            <div class="planner-header">
                ${backProfile ? `
                    <button id="schedule-back" class="back-arrow-btn" style="left:0"><i data-lucide="arrow-left" style="width: 24px; height: 24px;"></i></button>` : ''}
                <h2 class="planner-title">${backProfile ? 'Посещаемость' : 'Моя посещаемость'}</h2>
            </div>
            <div class="schedule-header">
                <select id="month-select" class="calendar-select">${monthNames.map((m,i)=>`<option value="${i}" ${i===month?'selected':''}>${m}</option>`).join('')}</select>
                <select id="year-select" class="calendar-select">
                    <option value="2024" ${year === 2024 ? 'selected' : ''}>2024</option>
                    <option value="2025" ${year === 2025 ? 'selected' : ''}>2025</option>
                    <option value="2026" ${year === 2026 ? 'selected' : ''}>2026</option>
                </select>
                <button id="calendar-today-btn" class="btn-link" style="padding: 10px 16px; background: var(--surface-soft); border: 1px solid var(--border); border-radius: 14px;">Сегодня</button>
            </div>
            <div class="weekdays-grid"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span></div>
            <div class="calendar-grid">${daysHTML}</div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();

    const updateCalendar = () => {
        const m = document.getElementById('month-select').value;
        const y = document.getElementById('year-select').value;
        renderSchedule(new Date(y, m, 1), specificUserId, backProfile);
    };

    document.getElementById('month-select').addEventListener('change', updateCalendar);
    document.getElementById('year-select').addEventListener('change', updateCalendar);
    document.getElementById('calendar-today-btn').addEventListener('click', () => renderSchedule(new Date(), specificUserId, backProfile));
    if (backProfile) document.getElementById('schedule-back').addEventListener('click', () => renderClientDetail(backProfile));
}

window.renderSubscription = function(user, profile) {
    const hasSub = profile?.subscription_status === true;
    let html = '';
    
    if (hasSub) {
        const expires = new Date(profile.subscription_expires_at);
        html = `
        <div class="subscription-overlay">
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: flex-start;">
                <div class="presence-text" style="font-size: 0.8rem; color: var(--accent);">СТАТУС: АКТИВЕН</div>
                <div style="width: 12px; height: 12px; background: var(--accent); border-radius: 50%; box-shadow: 0 0 10px rgba(212, 175, 55, 0.35);"></div>
            </div>
            <div style="margin-top: 40px;">
                <div class="expiration-days" style="font-size: 0.8rem; opacity: 0.8; margin-bottom: 5px; font-family: system-ui, sans-serif; font-weight: 500;">Действует до:</div>
                <div style="font-size: 0.8rem; color: var(--accent);">${expires.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
        </div>`;
    } else {
        html = `<div class="subscription-overlay" style="justify-content: center; align-items: center; border: 1px dashed rgba(255,255,255,0.12);">
            <div style="color: #374151; text-align: center; letter-spacing: 1px;">АБОНЕМЕНТ НЕ НАЙДЕН</div>
        </div>`;
    }

    document.getElementById('gym-content').innerHTML = `
        <div class="subscription-container">
            <h2 class="subscription-title">Моя Карта</h2>
            <div class="subscription-card">${html}</div>
            <p style="margin-top: 30px; font-size: 0.85rem; color: #8e959f; text-align: center; line-height: 1.5; max-width: 260px; font-family: system-ui, sans-serif;">
                Для приобретения карты обратитесь к менеджеру на входе.
            </p>
        </div>
    `;
}

const RANKS = [
  { min: 0, max: 4, label: 'Базовый I', accent: '#8e959f', key: 'base_1' },
  { min: 5, max: 14, label: 'Базовый II', accent: '#a4abb6', key: 'base_2' },
  { min: 15, max: 29, label: 'Прогресс I', accent: '#d4af37', key: 'progress_1' },
  { min: 30, max: 54, label: 'Прогресс II', accent: '#d4af37', key: 'progress_2' },
  { min: 55, max: 89, label: 'Уверенный I', accent: '#d4af37', key: 'confident_1' },
  { min: 90, max: 139, label: 'Уверенный II', accent: '#d4af37', key: 'confident_2' },
  { min: 140, max: 209, label: 'Интенсив I', accent: 'var(--accent)', key: 'intensive_1' },
  { min: 210, max: 299, label: 'Интенсив II', accent: 'var(--accent)', key: 'intensive_2' },
  { min: 300, max: 424, label: 'Высший ранг', accent: 'var(--accent)', key: 'high_rank' },
  { min: 425, max: 599, label: 'Профи', accent: 'var(--accent)', key: 'pro' },
  { min: 600, max: 849, label: 'Ультра', accent: 'var(--accent)', key: 'ultra' },
  { min: 850, max: 1199, label: 'Элита', accent: 'var(--accent)', key: 'elite' },
  { min: 1200, max: 9999, label: 'Максимум', accent: 'var(--accent)', key: 'maximum' }
];


function computeRankFromScore(score) {
  const s = Number(score || 0);
  const index = RANKS.findIndex(r => s >= r.min && s <= r.max);
  const current = RANKS[index] || RANKS[0];
  const next = RANKS[index + 1] || null;

  return {
    ...current,
    score: s,
    next: next ? next.min : current.max,
    isLast: !next
  };
}

function renderRankCard(rank) {
  const nextGoal = rank.next;
  const currentScore = rank.score;
  const isPremium = rank.min >= 8;

  const bg = isPremium
    ? 'linear-gradient(135deg, rgba(28,28,30,0.8) 0%, rgba(10,10,10,0.9) 100%)'
    : 'var(--surface-soft)';
  // The premium card is intentionally always-dark (its own gradient), so its
  // text stays hardcoded white; the regular card uses the page's surface
  // colors and needs theme-aware text instead, or it goes invisible in light mode.
  const textColor = isPremium ? '#fff' : 'var(--fg)';

  const progress = rank.isLast ? 100 : Math.min(100, Math.round((currentScore / nextGoal) * 100));

  return `
    <div id="rank-card" style="position: relative; border-radius: 16px; border: 1px solid ${isPremium ? rank.accent + '44' : 'var(--border)'}; background: ${bg}; padding: 12px; margin-bottom: 12px; backdrop-filter: blur(10px); width: 100%;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
        <div style="flex:1;">
          <div style="font-size:0.6rem; font-weight:800; color:${rank.accent}; text-transform:uppercase; letter-spacing:1px;">${rank.label}</div>
          <div style="font-size:0.9rem; font-weight:700; color:${textColor}; margin-top:1px;">Ваш ранг</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.8rem; font-weight:900; color:${textColor};">
            ${currentScore} <span style="font-size: 0.6rem; color:#8e959f;">ПОС.</span>
          </div>
        </div>
      </div>
      <div style="height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; margin-bottom: 6px;">
        <div style="width: ${progress}%; height: 100%; background: ${rank.accent}; box-shadow: 0 0 10px ${rank.accent}44; transition: width 1s ease-out;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 0.65rem; color: #8e959f; font-weight: 500;">
            ${rank.isLast ? 'Максимум' : `До цели: ${nextGoal - currentScore}`}
        </div>
        <button id="view-all-ranks-btn" style="background:none; border:none; padding:0; color:${rank.accent}; font-size:0.65rem; font-weight:800; cursor:pointer; text-transform:uppercase;">
            Ранги &raquo;
        </button>
      </div>
    </div>
  `;
}


function showAllRanksModal() {
    const content = `
        <div style="display: flex; flex-direction: column; gap: 10px; max-height: 350px; overflow-y: auto; scrollbar-width: none; padding-right: 5px;">
            ${RANKS.map(r => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--surface-soft); padding: 12px 16px; border-radius: 14px; border: 1px solid var(--border);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${r.accent}; box-shadow: 0 0 8px ${r.accent}66;"></div>
                        <span style="color: var(--fg); font-weight: 700; font-size: 0.9rem;">${r.label}</span>
                    </div>
                    <div style="color: #8e959f; font-size: 0.8rem; font-weight: 600;">
                        ${r.min}+ пос.
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    window.showModal({
        title: 'Система рангов',
        content: content,
        confirmText: 'Понятно',
        showCancel: false
    });
}

/**
 * Streak leaderboard: shows the top current streaks across all clients via
 * the get_streak_leaderboard() SQL function (see streak_leaderboard.sql -
 * a client can only see its own attendance rows under RLS, so a real
 * cross-user ranking has to be computed server-side). Styled as a plain,
 * structured ranking list - a clear rank column, name and streak, with a
 * restrained top-3 accent - rather than a decorated "podium".
 */
function formatLeaderboardName(fullName) {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Без имени';
    return parts.map(p => window.escapeHtml(p)).join(' ');
}

function renderLeaderboardAvatar(row) {
    const initial = (row.full_name || 'С').trim().charAt(0).toUpperCase() || 'С';
    return row.avatar_url
        ? `<img src="${row.avatar_url}" class="leaderboard-avatar-img" alt="" />`
        : `<div class="leaderboard-avatar-fallback">${window.escapeHtml(initial)}</div>`;
}

function renderLeaderboardRow(row, place, isMe) {
    const rankClass = place <= 3 ? `rank-${place}` : '';
    return `
        <div class="leaderboard-row ${rankClass} ${isMe ? 'is-me' : ''}">
            <div class="leaderboard-rank">${place}</div>
            <div class="leaderboard-row-avatar">${renderLeaderboardAvatar(row)}</div>
            <div class="leaderboard-row-name">${formatLeaderboardName(row.full_name)}${isMe ? ' <span class="leaderboard-you-tag">ВЫ</span>' : ''}</div>
            <div class="leaderboard-row-streak"><i data-lucide="flame"></i>${row.streak}</div>
        </div>
    `;
}

/** Client-side mirror of calculateAndDisplayStreak's math, but returns a number instead of writing to the DOM - used when the viewer isn't in the top of the leaderboard themselves. */
async function computeCurrentStreakForUser(userId) {
    const { data, error } = await supabaseClient
        .from('attendance')
        .select('visit_date')
        .eq('user_id', userId)
        .order('visit_date', { ascending: false });
    if (error || !data) return 0;

    const uniqueDates = [...new Set(data.map(d => d.visit_date.split('T')[0]))];
    if (uniqueDates.length === 0) return 0;

    const today = new Date().toLocaleDateString('en-CA');
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
    if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

    let streak = 1;
    let current = new Date(uniqueDates[0]);
    for (let i = 1; i < uniqueDates.length; i++) {
        const prev = new Date(uniqueDates[i]);
        current.setHours(0, 0, 0, 0);
        prev.setHours(0, 0, 0, 0);
        const diff = (current - prev) / 86400000;
        if (diff === 1) { streak++; current = prev; }
        else if (diff === 0) continue;
        else break;
    }
    return streak;
}

/**
 * Full-page streak leaderboard - deliberately a real "section" (like
 * Профиль or Расписание) rather than a popup, so it reads as a permanent
 * part of the gym experience worth checking regularly, not a one-off toast.
 * @param {string} currentUserId
 * @param {() => void} onBack Called when the back arrow is pressed - the
 *   caller decides what "back" means (whichever view/nav-tab was active).
 */
window.renderStreakLeaderboard = async function(currentUserId, onBack) {
    const content = document.getElementById('gym-content');
    if (window.currentView !== 'Рейтинг') return;

    content.innerHTML = `
        <div class="leaderboard-container">
            <div class="planner-header">
                <button class="back-arrow-btn" id="leaderboard-back" style="left: 0;"><i data-lucide="arrow-left" style="width: 24px; height: 24px;"></i></button>
                <h2 class="planner-title">Рейтинг стриков</h2>
            </div>
            <p class="leaderboard-subtitle">Кто дольше всех не пропускает зал ни дня</p>
            <div id="leaderboard-body" class="leaderboard-body">
                <div class="leaderboard-loading">Загрузка...</div>
            </div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();

    const backBtn = document.getElementById('leaderboard-back');
    if (backBtn) backBtn.onclick = () => { if (onBack) onBack(); };

    const body = document.getElementById('leaderboard-body');

    try {
        const { data, error } = await supabaseClient.rpc('get_streak_leaderboard', { limit_count: 50 });
        if (window.currentView !== 'Рейтинг') return;
        if (error) throw error;

        const rows = data || [];
        if (rows.length === 0) {
            body.innerHTML = '<p class="leaderboard-empty">Пока ни у кого нет активного стрика. Стань первым!</p>';
            return;
        }

        const isInList = rows.some(r => r.user_id === currentUserId);

        let ownCardHtml = '';
        if (currentUserId && !isInList) {
            const ownStreak = await computeCurrentStreakForUser(currentUserId);
            if (window.currentView !== 'Рейтинг') return;
            const lowestOnBoard = rows[rows.length - 1].streak;
            const toGo = Math.max(1, lowestOnBoard - ownStreak + 1);
            ownCardHtml = `
                <div class="leaderboard-own-card">
                    <div class="leaderboard-own-label">Ваш текущий стрик</div>
                    <div class="leaderboard-own-streak"><i data-lucide="flame"></i>${ownStreak}</div>
                    <div class="leaderboard-own-hint">${ownStreak > 0
                        ? `Ещё ${toGo} ${toGo === 1 ? 'день' : 'дня'} подряд — и вы в рейтинге!`
                        : 'Придите сегодня, чтобы начать свой стрик!'}</div>
                </div>
            `;
        }

        const bestStreak = rows[0].streak;
        body.innerHTML = `
            <div class="leaderboard-stats">
                <div class="leaderboard-stat">
                    <span class="leaderboard-stat-value">${bestStreak}</span>
                    <span class="leaderboard-stat-label">лучший стрик</span>
                </div>
                <div class="leaderboard-stat-sep"></div>
                <div class="leaderboard-stat">
                    <span class="leaderboard-stat-value">${rows.length}</span>
                    <span class="leaderboard-stat-label">участников</span>
                </div>
            </div>
            <div class="leaderboard-list-header">
                <span>Место</span><span>Участник</span><span>Стрик</span>
            </div>
            <div class="leaderboard-list">
                ${rows.map((r, i) => renderLeaderboardRow(r, i + 1, r.user_id === currentUserId)).join('')}
            </div>
            ${ownCardHtml}
        `;
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('Leaderboard error:', err);
        if (window.currentView === 'Рейтинг') body.innerHTML = '<p class="leaderboard-empty">Не удалось загрузить рейтинг. Попробуйте позже.</p>';
    }
};

async function computeAndRenderRank(profile, user) {
    try {
        if (window.currentView !== 'Профиль') return;
        if (!supabaseClient || !profile?.id) return;
        const userId = profile.id;

        // Считаем ОБЩЕЕ количество посещений для ранга
        const { count, error } = await supabaseClient
            .from('attendance')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (error) throw error;
        
        if (window.currentView !== 'Профиль') return;

        const rank = computeRankFromScore(count || 0);

        const holder = document.getElementById('rank-insert');
        if (holder) holder.innerHTML = renderRankCard(rank);
        if (holder) {
            holder.innerHTML = renderRankCard(rank);
            const btn = holder.querySelector('#view-all-ranks-btn');
            if (btn) btn.onclick = showAllRanksModal;
        }
    } catch (e) {
        console.error(e);
    }
}


window.renderProfile = async function(user, profile) {
    const isAdmin = profile?.is_admin === true;
    const name = profile?.full_name || 'Спортсмен';

    // We must fetch the note separately. A non-admin's request will be blocked by RLS on the view
    // and will return an empty array. This is now only for the admin's OWN profile page.
    // Client notes are fetched in renderClientDetail.
    let adminNote = null;
    if (isAdmin) {
        try {
            // This fetches the note for the currently logged-in user (the admin themselves)
            const { data: noteData, error: noteError } = await supabaseClient
                .from('profiles')
                .select('admin_note')
                .eq('id', user.id)
                .maybeSingle();

            if (noteError) throw noteError;
            if (noteData) adminNote = noteData.admin_note;
        } catch (e) { console.error("Could not fetch admin note:", e); }
    }

    const avatar = profile?.avatar_url;

    if (window.currentView !== 'Профиль') return;
    const regDate = user?.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : '—';

    const gymContent = document.getElementById('gym-content');
    gymContent.innerHTML = `
        <div class="profile-container">
            <div style="position: relative; width: 112px; height: 112px; margin-bottom: 18px;">
                <div class="profile-avatar" style="width: 112px; height: 112px; margin: 0;">
                    ${avatar
                        ? `<img src="${avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`
                        : name.charAt(0).toUpperCase()
                    }
                </div>

                <button id="avatar-trigger" aria-label="Изменить фото профиля" style="position: absolute; top: -2px; right: -2px; width: 34px; height: 34px; background: var(--accent); border: 3px solid var(--bg); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #000; cursor: pointer; z-index: 10;">
                    <i data-lucide="plus" style="width: 18px; height: 18px;"></i>
                </button>

                ${(avatar && isAdmin) ? `
                    <button id="avatar-delete" aria-label="Удалить фото профиля" style="position: absolute; bottom: -2px; right: -2px; width: 34px; height: 34px; background: rgba(248, 250, 252, 0.92); border: 3px solid rgba(15, 23, 42, 0.16); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #7f1d1d; cursor: pointer; z-index: 10;">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                ` : ''}
            </div>

            <h2 class="profile-name" style="margin-bottom: 6px; font-size: 0.8rem;">${name}</h2>
            <p class="profile-email" style="margin-bottom: 18px; font-size: 0.8rem;">${user?.email || ''}</p>

            <div id="rank-insert" style="width: 100%; margin-bottom: 16px;"></div>

            <div class="card profile-info-card" style="text-align: left; margin-bottom: 18px;">
                <div class="info-row">
                    <span class="info-label">Регистрация:</span>
                    <span class="info-value">${regDate}</span>
                </div>
            </div>

            <div class="profile-actions">
                <button id="logout-btn" class="btn-logout" style="border-radius: 14px; padding: 10px; font-size: 0.95rem; font-weight: 700;">
                    Выйти из аккаунта
                </button>
            </div>

            ${isAdmin ? `
                <div class="card profile-info-card profile-info-card--note" style="text-align: left; margin-top: 20px;">
                    <div class="info-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span class="info-label" style="color: var(--accent);">Моя заметка</span>
                        <button id="save-my-admin-note-btn" class="btn-link" title="Сохранить заметку" style="color: var(--fg); background: rgba(212, 175, 55, 0.1); border-radius: 12px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; padding: 0;">
                                <i data-lucide="check" style="width: 18px; height: 18px;"></i>
                            </button>
                        </div>
                        <textarea id="my-admin-note-textarea" class="plan-textarea" style="min-height: 80px; font-size: 0.85rem; background: transparent; border-color: rgba(255,255,255,0.1);">${adminNote || ''}</textarea>
                    </div>
                </div>
            ` : ''}
            <input type="file" id="avatar-input" style="display:none;" accept="image/*" />
        </div>
    `;

    if (window.lucide) lucide.createIcons();

    // Rank (не для админов)
    if (!isAdmin) {
        const holder = document.getElementById('rank-insert');
        if (holder) holder.innerHTML = `<div style="color:#8e959f; font-size:0.85rem; font-weight:700; text-align:center;">Загрузка ранга...</div>`;
        await computeAndRenderRank(profile, user);
    } else {
        const holder = document.getElementById('rank-insert');
        if (holder) holder.innerHTML = '';
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await supabaseClient.auth.signOut();
            window.location.reload();
        };
    }

    // Save admin's own note
    const saveMyAdminNoteBtn = document.getElementById('save-my-admin-note-btn');
    if (saveMyAdminNoteBtn) {
        saveMyAdminNoteBtn.onclick = async (e) => {
            const noteText = document.getElementById('my-admin-note-textarea').value.trim();
            const btn = e.currentTarget;
            try {
                const { error } = await supabaseClient
                    .from('profiles')
                    .update({ admin_note: noteText || null }) // Use null if empty
                    .eq('id', user.id);
                
                if (error) throw error;
                window.showToast('Заметка сохранена!', 'success');
                window.applyBtnCooldown(btn, 3, true); // Pass true for icon button
            } catch (err) {
                console.error("Failed to save admin note:", err);
                window.showToast('Ошибка сохранения заметки', 'error');
            }
        };
    }

    // Avatar upload/crop/delete
    const avatarTrigger = document.getElementById('avatar-trigger');
    const avatarInput = document.getElementById('avatar-input');
    const avatarDelete = document.getElementById('avatar-delete');

    if (avatarTrigger && avatarInput) avatarTrigger.onclick = () => avatarInput.click();

    if (avatarDelete) {
        avatarDelete.onclick = () => {
            showModal({
                title: 'Удалить фото?',
                content: '<p style="color: #8e959f; font-size: 0.9rem;">Вы действительно хотите удалить фото профиля?</p>',
                confirmText: 'Удалить',
                onConfirm: async () => {
                    try {
                        const { error } = await supabaseClient.from('profiles').update({ avatar_url: null }).eq('id', user.id);
                        if (error) throw error;
                        showToast('Фото удалено');
                        window.renderProfile(user, { ...profile, avatar_url: null });
                        return true;
                    } catch (err) {
                        console.error(err);
                        showToast('Ошибка при удалении', 'error');
                        return false;
                    }
                }
            });
        };
    }

    if (avatarInput) {
        avatarInput.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                const imgData = readerEvent.target.result;

                const overlay = document.createElement('div');
                overlay.className = 'cropper-modal-overlay';
                overlay.style.cssText = [
                    'position:fixed;inset:0;background:rgba(0,0,0,0.72);backdrop-filter:blur(8px);z-index:10000;display:flex;align-items:center;justify-content:center;opacity:1;'
                ].join('');

                overlay.innerHTML = `
                    <div class="cropper-modal-box" style="width: 92%; max-width: 420px; background: var(--surface); border:1px solid rgba(15, 23, 42, 0.08); border-radius:24px; padding:18px 16px;">
                        <div style="font-weight:900; font-size:1.1rem; margin-bottom:10px; color: var(--accent);">Редактирование фото</div>

                        <div style="position:relative; width: 100%; aspect-ratio: 1 / 1; border-radius: 20px; overflow:hidden; background: rgba(15, 23, 42, 0.92);">
                            <img id="cropper-src" src="${imgData}" style="position:absolute; left:50%; top:50%; transform: translate(-50%, -50%) scale(1); transform-origin:center; user-select:none; touch-action:none; max-width:none;" />

                            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none;">
                                <div style="width: 64%; height: 64%; border-radius: 50%; border: 2px solid rgba(255,221,32,0.9); box-shadow: 0 0 0 6px rgba(255,221,32,0.06);"></div>
                            </div>

                            <canvas id="cropper-dim" style="position:absolute; inset:0; width:100%; height:100%;"></canvas>
                        </div>

                        <div style="margin-top:14px; display:flex; flex-direction:column; gap:10px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="color:#8e959f; font-size:0.85rem; font-weight:700;">Масштаб</span>
                                <span id="cropper-zoom-label" style="color: var(--accent); font-size:0.85rem; font-weight:900;">100%</span>
                            </div>
                            <input id="cropper-zoom" type="range" min="1" max="3" step="0.01" value="1" style="width:100%;" />
                        </div>

                        <div style="display:flex; gap:10px; margin-top:16px;">
                            <button type="button" class="btn-logout" id="cropper-cancel" style="flex:1; border-radius:14px; padding:12px 10px;">Отмена</button>
                            <button type="button" class="btn-primary" id="cropper-save" style="flex:1; border-radius:14px; padding:12px 10px;">Сохранить</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(overlay);

                const imgEl = overlay.querySelector('#cropper-src');
                const zoomInput = overlay.querySelector('#cropper-zoom');
                const zoomLabel = overlay.querySelector('#cropper-zoom-label');
                const saveBtn = overlay.querySelector('#cropper-save');
                const cancelBtn = overlay.querySelector('#cropper-cancel');

                const frame = overlay.querySelector('div[style*="aspect-ratio"]');
                const canvasDim = overlay.querySelector('#cropper-dim');

                let zoom = 1;
                let offsetX = 0;
                let offsetY = 0;

                const MIN_ZOOM = 1;
                const MAX_ZOOM = 3;

                const updateTransform = () => {
                    imgEl.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${zoom})`;
                    if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
                    drawDim();
                };

                const drawDim = () => {
                    if (!canvasDim) return;
                    const rect = canvasDim.getBoundingClientRect();
                    canvasDim.width = Math.round(rect.width * devicePixelRatio);
                    canvasDim.height = Math.round(rect.height * devicePixelRatio);

                    const ctx = canvasDim.getContext('2d');
                    if (!ctx) return;
                    ctx.clearRect(0, 0, canvasDim.width, canvasDim.height);

                    const w = canvasDim.width;
                    const h = canvasDim.height;
                    const cx = w / 2;
                    const cy = h / 2;
                    const r = Math.min(w, h) * 0.32;

                    ctx.fillStyle = 'rgba(0,0,0,0.35)';
                    ctx.fillRect(0, 0, w, h);

                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalCompositeOperation = 'source-over';

                    ctx.strokeStyle = 'rgba(212, 175, 55, 0.95)';
                    ctx.lineWidth = Math.max(2, Math.round(2.5 * devicePixelRatio));
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.stroke();
                };

                let dragging = false;
                let lastX = 0;
                let lastY = 0;

                const onPointerDown = (ev) => {
                    dragging = true;
                    lastX = ev.clientX;
                    lastY = ev.clientY;
                    imgEl.setPointerCapture?.(ev.pointerId);
                };

                const onPointerMove = (ev) => {
                    if (!dragging) return;
                    offsetX += ev.clientX - lastX;
                    offsetY += ev.clientY - lastY;
                    lastX = ev.clientX;
                    lastY = ev.clientY;
                    updateTransform();
                };

                const onPointerUp = () => {
                    dragging = false;
                };

                imgEl.addEventListener('pointerdown', onPointerDown);
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);

                zoomInput.addEventListener('input', () => {
                    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parseFloat(zoomInput.value)));
                    updateTransform();
                });

                cancelBtn.onclick = () => overlay.remove();

                const loadImageForCrop = async () => {
                    return new Promise((resolve, reject) => {
                        const im = new Image();
                        im.onload = () => resolve(im);
                        im.onerror = reject;
                        im.src = imgData;
                    });
                };

                saveBtn.onclick = async () => {
                    try {
                        saveBtn.disabled = true;
                        showToast('Сохранение...', 'success');

                        const frameBox = frame.getBoundingClientRect();
                        const srcBox = imgEl.getBoundingClientRect();

                        const cropSizePx = 400;
                        const cxFrame = frameBox.width / 2;
                        const cyFrame = frameBox.height / 2;
                        const rFrame = Math.min(frameBox.width, frameBox.height) * 0.32;

                        const img = await loadImageForCrop();

                        const exportCanvas = document.createElement('canvas');
                        exportCanvas.width = cropSizePx;
                        exportCanvas.height = cropSizePx;
                        const ctx = exportCanvas.getContext('2d');

                        ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);

                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(cropSizePx / 2, cropSizePx / 2, cropSizePx / 2, 0, Math.PI * 2);
                        ctx.clip();

                        const scaleX = img.width / srcBox.width;
                        const scaleY = img.height / srcBox.height;

                        const cropLeftInFrame = cxFrame - rFrame;
                        const cropTopInFrame = cyFrame - rFrame;

                        const cropLeftInImg = cropLeftInFrame - (srcBox.left - frameBox.left);
                        const cropTopInImg = cropTopInFrame - (srcBox.top - frameBox.top);

                        const cropWInImg = rFrame * 2;

                        ctx.drawImage(
                            img,
                            cropLeftInImg * scaleX,
                            cropTopInImg * scaleY,
                            cropWInImg * scaleX,
                            cropWInImg * scaleY,
                            0,
                            0,
                            cropSizePx,
                            cropSizePx
                        );
                        ctx.restore();

                        const blob = await new Promise((res) => exportCanvas.toBlob(res, 'image/jpeg', 0.7));
                        if (!blob) throw new Error('Не удалось создать изображение');

                        overlay.remove();

                        const fileName = `${user.id}.jpg`;
                        showToast('Загрузка фото...', 'success');

                        const { error: upErr } = await supabaseClient.storage.from('avatars').upload(
                            fileName,
                            blob,
                            { contentType: 'image/jpeg', upsert: true }
                        );
                        if (upErr) throw upErr;

                        const { data: urlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
                        const avatarUrl = urlData.publicUrl;

                        const { error: dbErr } = await supabaseClient.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
                        if (dbErr) throw dbErr;

                        showToast('Фото обновлено!');
                        window.renderProfile(user, { ...profile, avatar_url: avatarUrl });
                    } catch (err) {
                        console.error(err);
                        showToast('Ошибка сохранения', 'error');
                        saveBtn.disabled = false;
                    }
                };

                zoom = parseFloat(zoomInput.value);
                updateTransform();
                window.addEventListener('resize', () => updateTransform());
            };

            reader.readAsDataURL(file);
            e.target.value = '';
        };
    }
}


window.renderOther = function(user, profile) {
    const isAdmin = profile?.is_admin === true || profile?.is_admin === 'true';

    document.getElementById('gym-content').innerHTML = `
        <div class="other-container" style="height:100%; display:flex; flex-direction:column; gap:16px;">
            <div class="card menu-card" id="open-weekly-plan">
                <div class="menu-card-info">
                    <span class="menu-card-title">Тренировочный сплит</span>
                    <span class="menu-card-desc">Распределите тренировки по группам мышц на всю неделю</span>
                </div>
                <i data-lucide="chevron-right" class="menu-card-arrow"></i>
            </div>

            <div class="card menu-card" id="open-faq">
                <div class="menu-card-info">
                    <span class="menu-card-title">FAQ (частые вопросы)</span>
                    <span class="menu-card-desc">Ответы на популярные вопросы по абонементу и посещениям</span>
                </div>
                <i data-lucide="chevron-right" class="menu-card-arrow"></i>
            </div>

            ${isAdmin ? `
            <div class="card menu-card" id="open-issues-ideas">
                <div class="menu-card-info">
                    <span class="menu-card-title">Идеи/Проблемы</span>
                    <span class="menu-card-desc">Нашли баг или есть идея? Напишите сюда — разработчик разберётся</span>
                </div>
                <i data-lucide="chevron-right" class="menu-card-arrow"></i>
            </div>
            ` : ''}
        </div>
    `;

    if (window.lucide) lucide.createIcons();

    document.getElementById('open-weekly-plan').addEventListener('click', () => renderWeeklySchedule(user));
    document.getElementById('open-faq').addEventListener('click', () => renderFaq(user, profile));
    const issuesBtn = document.getElementById('open-issues-ideas');
    if (issuesBtn) issuesBtn.addEventListener('click', () => renderIssuesIdeas(user, profile));
}

async function renderIssuesIdeas(user, profile) {
    const content = document.getElementById('gym-content');
    if (window.currentView !== 'Другое') return;

    const isAdmin = profile?.is_admin === true || profile?.is_admin === 'true';
    if (!isAdmin) { renderOther(user, profile); return; }

    content.innerHTML = `
        <div class="planner-container" style="height:100%; display:flex; flex-direction:column;">
            <div class="planner-header">
                <button id="issues-back" class="back-arrow-btn" style="left:0"><i data-lucide="arrow-left" style="width: 24px; height: 24px;"></i></button>
                <h2 class="planner-title">Идеи/Проблемы</h2>
            </div>

            <p style="color: var(--muted); font-size: 0.82rem; text-align: center; margin: 14px 0 18px; line-height: 1.5;">
                Нашли баг, или есть идея, как сделать приложение лучше? Опишите здесь — разработчик получит сообщение и разберётся в ближайшее время.
            </p>

            <textarea id="issue-message" class="plan-textarea" placeholder="Опишите проблему или идею..." style="min-height: 120px;"></textarea>
            <button id="issue-submit-btn" class="btn-primary" style="margin-top: 12px;">Отправить</button>

            <div id="issues-history" style="margin-top: 28px;"></div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();

    document.getElementById('issues-back').addEventListener('click', () => renderOther(user, profile));

    const historyEl = document.getElementById('issues-history');
    const loadHistory = async () => {
        try {
            const { data, error } = await supabaseClient
                .from('feedback_issues')
                .select('message, status, created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(10);
            if (window.currentView !== 'Другое' || error || !data) return;

            if (data.length === 0) { historyEl.innerHTML = ''; return; }

            historyEl.innerHTML = `
                <div style="color: var(--muted); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">Ваши обращения</div>
                ${data.map(item => `
                    <div class="plan-item" style="flex-direction: column; align-items: flex-start; gap: 6px;">
                        <div style="display:flex; justify-content: space-between; align-items:center; width:100%;">
                            <span style="font-size: 0.7rem; color: var(--muted);">${new Date(item.created_at).toLocaleDateString('ru-RU')}</span>
                            <span style="font-size: 0.65rem; font-weight: 800; padding: 3px 8px; border-radius: 8px; text-transform: uppercase; background: ${item.status === 'resolved' ? 'rgba(74,222,128,0.15)' : 'rgba(212,175,55,0.15)'}; color: ${item.status === 'resolved' ? '#4ADE80' : 'var(--accent)'};">${item.status === 'resolved' ? 'Решено' : 'В работе'}</span>
                        </div>
                        <div style="color: var(--fg); font-size: 0.82rem; text-align: left;">${escapeHtml(item.message)}</div>
                    </div>
                `).join('')}
            `;
        } catch (e) { console.error('Issue history error:', e); }
    };
    loadHistory();

    document.getElementById('issue-submit-btn').addEventListener('click', async (e) => {
        const textarea = document.getElementById('issue-message');
        const message = textarea.value.trim();
        if (!message) { window.showToast('Опишите проблему или идею', 'error'); return; }

        const btn = e.currentTarget;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.innerHTML = '<div class="btn-spinner"></div>';

        try {
            const { error } = await supabaseClient.from('feedback_issues').insert([{
                user_id: user.id,
                full_name: profile?.full_name || null,
                message
            }]);
            if (error) throw error;

            window.showToast('Спасибо! Сообщение отправлено разработчику', 'success');
            textarea.value = '';
            loadHistory();
        } catch (err) {
            console.error('Issue submit error:', err);
            window.showToast('Не удалось отправить. Попробуйте ещё раз', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

async function renderFaq(user, profile) {
    const content = document.getElementById('gym-content');
    if (window.currentView !== 'Другое') return;

    const isAdmin = profile?.is_admin === true || profile?.is_admin === 'true';

    content.innerHTML = `
        <div class="planner-container" style="height:100%; display:flex; flex-direction:column;">
            <div class="planner-header">
                <button id="faq-back" class="back-arrow-btn" style="left:0"><i data-lucide="arrow-left" style="width: 24px; height: 24px;"></i></button>
                <h2 class="planner-title">FAQ</h2>
            </div>

            ${isAdmin ? `
              <button id="faq-edit-btn" class="faq-edit-fab" aria-label="Редактировать FAQ"><i data-lucide="file-pen-line" style="width: 22px; height: 22px;"></i></button>
            ` : ''}

            <div style="margin-top: 10px; overflow-y:auto; height: auto;" id="faq-list"></div>



            <div style="color:#8e959f; font-size:0.85rem; text-align:center; margin-top: 0px; padding: 6px 0 0 0; opacity:0.9;">
                Если у вас остались вопросы, подойдите ко входу и спросите сотрудника.
            </div>


        </div>
    `;

    if (window.lucide) lucide.createIcons();

    let faqItems = [];
    try {
        const { data, error } = await supabaseClient
            .from('faq_items')
            .select('id, question, answer, sort_order, is_active')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (window.currentView !== 'Другое') return;

        if (error) throw error;
        faqItems = data || [];
    } catch (e) {
        console.error(e);
        content.querySelector('#faq-list').innerHTML = '<div style="text-align:center; color: var(--accent); padding: 25px;">Ошибка загрузки FAQ</div>';
        return;
    }

    const renderCustomerList = () => {
        const listEl = content.querySelector('#faq-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        faqItems.forEach((item, idx) => {
            const sign = '+';
            listEl.innerHTML += `
                <div class="faq-item" style="border:1px solid rgba(255,255,255,0.05); border-radius: 18px; background: var(--glass); padding: 14px; margin-bottom: 12px;">
                    <button class="faq-toggle" data-idx="${idx}" style="width:100%; background:transparent; border:none; padding:0; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                        <div style="font-weight:900; color: var(--accent); text-align:left;">${escapeHtml(item.question)}</div>
                        <div style="color: var(--accent); font-weight:900;">${sign}</div>
                    </button>
                    <div class="faq-answer" data-idx="${idx}" style="max-height:0; overflow:hidden; margin-top: 0px; transition: max-height 0.25s ease, margin-top 0.25s ease; color:#8e959f; line-height:1.5;">
                        <div style="padding-top:8px;">${escapeHtml(item.answer)}</div>
                    </div>

                </div>
            `;
        });

        listEl.querySelectorAll('.faq-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = btn.getAttribute('data-idx');
                const answer = listEl.querySelector(`.faq-answer[data-idx="${i}"]`);
                if (!answer) return;

                const isOpen = answer.style.maxHeight && answer.style.maxHeight !== '0px' && answer.style.maxHeight !== '0';
                const contentInner = answer.firstElementChild;
                const targetHeight = contentInner ? contentInner.scrollHeight : answer.scrollHeight;
                answer.style.maxHeight = isOpen ? '0px' : (targetHeight + 24) + 'px';

                const signEl = btn.querySelector('div:last-child');
                if (signEl) signEl.textContent = isOpen ? '+' : '−';
            });
        });
    };

    const renderAdminEditor = () => {
        const listEl = content.querySelector('#faq-list');
        listEl.innerHTML = '';

        faqItems.forEach((item, idx) => {
            listEl.innerHTML += `
                <div class="faq-item" data-row="${item.id}" style="border:1px solid rgba(255,255,255,0.05); border-radius: 18px; background: var(--glass); padding: 14px; margin-bottom: 12px;">
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: 12px;">
                        <button type="button" class="faq-delete-btn" data-row="${item.id}" aria-label="Удалить FAQ" style="flex:0 0 auto; width: 42px; height: 42px; border-radius: 14px; border: 1px solid rgba(15, 23, 42, 0.12); background: rgba(248, 250, 252, 0.56); color:#475569; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                          <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
                        </button>

                        <div style="flex:1;">
                          <div style="color: #8e959f; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; margin-bottom: 6px;">Редактирование</div>
                          <input class="faq-question-input" data-row="${item.id}" type="text" value="${item.question.replace(/"/g,'"')}" style="width:100%; background: var(--surface-soft); border: 1px solid var(--border); border-radius: 14px; padding: 12px; color:var(--fg); outline:none; font-weight: 700;" />
                          <textarea class="faq-answer-input" data-row="${item.id}" style="width:100%; margin-top: 10px; min-height: 96px; background: var(--surface-soft); border: 1px solid var(--border); border-radius: 14px; padding: 12px; color:var(--fg); outline:none; resize: vertical;">${item.answer}</textarea>
                        </div>
                    </div>

                    <div style="display:flex; gap: 10px; margin-top: 12px;">
                  <button type="button" class="faq-save-btn" data-row="${item.id}" style="flex:1; padding: 12px 10px; border-radius: 14px; border: 1px solid rgba(212,175,55,0.25); background: rgba(212,175,55,0.12); color: var(--fg); font-weight: 900; cursor:pointer;">Сохранить</button>
                    </div>
                </div>
            `;
        });

        if (window.lucide) lucide.createIcons();

        // plus row
        listEl.innerHTML += `
            <div class="faq-item" style="border:1px dashed rgba(212,175,55,0.35); border-radius: 18px; background: rgba(212,175,55,0.06); padding: 14px; margin-bottom: 12px;">
                <button type="button" id="faq-add-btn" style="width:100%; background:transparent; border:none; color: var(--accent); font-weight: 900; cursor:pointer; display:flex; align-items:center; justify-content:center; gap: 10px; padding: 10px 0;">
                    <span style="font-size: 1.3rem; line-height: 1;">+</span>
                    <span>Добавить вопрос</span>
                </button>

                <div style="margin-top: 10px; display:none;" id="faq-add-form">
                    <input id="faq-new-question" type="text" placeholder="Заголовок вопроса" style="width:100%; background: var(--surface-soft); border: 1px solid var(--border); border-radius: 14px; padding: 12px; color:var(--fg); outline:none; font-weight: 700;" />
                    <textarea id="faq-new-answer" placeholder="Ответ" style="width:100%; margin-top: 10px; min-height: 96px; background: var(--surface-soft); border: 1px solid var(--border); border-radius: 14px; padding: 12px; color:var(--fg); outline:none; resize: vertical;"></textarea>
                    <div style="display:flex; gap: 10px; margin-top: 12px;">
                        <button id="faq-add-cancel" type="button" style="flex:1; padding: 12px 10px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color:#8e959f; font-weight: 900; cursor:pointer;">Отмена</button>
                    <button id="faq-add-confirm" type="button" style="flex:1; padding: 12px 10px; border-radius: 14px; border: 1px solid rgba(212,175,55,0.25); background: rgba(212,175,55,0.12); color: var(--fg); font-weight: 900; cursor:pointer;">Добавить</button>
                    </div>
                </div>
            </div>
        `;

        // delete/update handlers
        listEl.querySelectorAll('.faq-save-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const rowId = btn.getAttribute('data-row');
                const qInput = listEl.querySelector(`.faq-question-input[data-row="${rowId}"]`);
                const aInput = listEl.querySelector(`.faq-answer-input[data-row="${rowId}"]`);
                const question = qInput?.value?.trim();
                const answer = aInput?.value?.trim();
                if (!question || !answer) return showToast('Заполните вопрос и ответ', 'error');

                const { error } = await supabaseClient
                    .from('faq_items')
                    .update({ question, answer })
                    .eq('id', rowId);

                if (error) return showToast('Ошибка сохранения', 'error');
                showToast('FAQ обновлено', 'success');

                // reload list data to keep order/values
                await loadFaqAndReRenderAdmin();
            });
        });

        listEl.querySelectorAll('.faq-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const rowId = btn.getAttribute('data-row');
                showModal({
                    title: 'Удалить FAQ?',
                    content: '<p style="color:#8e959f; font-size:0.9rem;">Это действие удалит строку FAQ.</p>',
                    confirmText: 'Удалить',
                    onConfirm: async () => {
                        const { error } = await supabaseClient.from('faq_items').delete().eq('id', rowId);
                        if (error) {
                            showToast('Ошибка удаления', 'error');
                            return false;
                        }
                        showToast('FAQ удалён', 'success');
                        await loadFaqAndReRenderAdmin();
                        return true;
                    }
                });
            });
        });

        const addBtn = document.getElementById('faq-add-btn');
        const addForm = document.getElementById('faq-add-form');
        const addCancel = document.getElementById('faq-add-cancel');
        const addConfirm = document.getElementById('faq-add-confirm');

        if (addBtn && addForm) {
            addBtn.addEventListener('click', () => {
                addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none';
            });
        }
        if (addCancel) addCancel.addEventListener('click', () => { if (addForm) addForm.style.display = 'none'; });
        if (addConfirm) {
            addConfirm.addEventListener('click', async () => {
                const question = document.getElementById('faq-new-question')?.value?.trim();
                const answer = document.getElementById('faq-new-answer')?.value?.trim();
                if (!question || !answer) return showToast('Заполните вопрос и ответ', 'error');

                // compute next sort_order
                const maxSort = (faqItems || []).reduce((m, it) => Math.max(m, Number(it.sort_order) || 0), 0);

                const { error } = await supabaseClient.from('faq_items').insert({
                    question,
                    answer,
                    sort_order: maxSort + 1,
                    is_active: true
                });

                if (error) return showToast('Ошибка добавления', 'error');
                showToast('FAQ добавлен', 'success');
                await loadFaqAndReRenderAdmin();
            });
        }
    };

    const loadFaqAndReRenderAdmin = async () => {
        try {
            const { data, error } = await supabaseClient
                .from('faq_items')
                .select('id, question, answer, sort_order, is_active')
                .eq('is_active', true)
                .order('sort_order', { ascending: true });

            if (window.currentView !== 'Другое') return;

            if (error) throw error;
            faqItems = data || [];
            renderAdminEditor();
        } catch (e) {
            console.error(e);
            content.querySelector('#faq-list').innerHTML = '<div style="text-align:center; color: var(--accent); padding: 25px;">Ошибка загрузки FAQ</div>';
        }
    };

    const backBtn = document.getElementById('faq-back');
    if (backBtn) backBtn.addEventListener('click', () => renderOther(user, profile));

    // pencil toggles admin mode (expand all into editor)
    const editBtn = document.getElementById('faq-edit-btn');
    if (editBtn && isAdmin) {
        let isAdminEditing = false;
        editBtn.addEventListener('click', () => {
            isAdminEditing = !isAdminEditing;
            if (isAdminEditing) {
                renderAdminEditor();
            } else {
                renderCustomerList();
            }
        });
    }

    // default (customer view)
    renderCustomerList();
}



function renderWeeklySchedule(user) {
    const saved = localStorage.getItem('gym_fit_split');
    const split = saved ? JSON.parse(saved) : [{d:'Пн',m:''},{d:'Вт',m:''},{d:'Ср',m:''},{d:'Чт',m:''},{d:'Пт',m:''},{d:'Сб',m:''},{d:'Вс',m:''}];

    document.getElementById('gym-content').innerHTML = `
        <div class="planner-container">
            <div class="planner-header">
                <button id="planner-back" class="back-arrow-btn" style="left:0"><i data-lucide="arrow-left" style="width: 24px; height: 24px;"></i></button>
                <h2 class="planner-title">Мой Сплит</h2>
            </div>
            <div class="planner-list">${split.map((item, i) => `
                <div class="plan-item"><span>${item.d}</span><input class="plan-input" data-index="${i}" value="${item.m}" /></div>
            `).join('')}</div>
            <p class="planner-hint">Изменения сохраняются автоматически</p>
        </div>
    `;

    if (window.lucide) lucide.createIcons();

    document.getElementById('planner-back').addEventListener('click', async () => {
        const { data } = await supabaseClient.auth.getUser();
        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', data.user.id).single();
        renderOther(data.user, profile);
    });

    document.querySelectorAll('.plan-input').forEach(input => {
        input.addEventListener('input', (e) => {
            split[e.target.dataset.index].m = e.target.value;
            localStorage.setItem('gym_fit_split', JSON.stringify(split));
        });
    });
}

async function renderCustomerInbox(user, profile) {
    const content = document.getElementById('gym-content');
    if (window.currentView !== 'Уведомления') return;
    content.innerHTML = `
        <div class="planner-container" style="height: 100%; display: flex; flex-direction: column;">
            <div class="planner-header">
                <h2 class="planner-title">Уведомления</h2>
            </div>
            <div id="messages-list" style="margin-top: 20px; display: flex; flex-direction: column; gap: 12px;">
                <div style="text-align: center; color: #8e959f; padding: 20px;">Загрузка сообщений...</div>
            </div>
        </div>
    `;

    const { data: messages, error } = await supabaseClient
        .from('message_recipients')
        .select('*, messages(*)')
        .eq('recipient_id', profile.id)
        .order('id', { ascending: false });

    const listContainer = document.getElementById('messages-list');
    if (!listContainer) return; // Guard against tab switching
    if (window.currentView !== 'Уведомления') return;

    if (error || !messages || messages.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; color: #8e959f; padding: 40px 0;">У вас пока нет уведомлений</div>';
        return;
    }

    listContainer.innerHTML = '';
    messages.forEach(m => {
        const msgData = m.messages || {};
        
        const item = document.createElement('div');
        item.className = 'plan-item';
        item.style.flexDirection = 'column';
        item.style.alignItems = 'flex-start';
        item.style.cursor = 'pointer';
        item.innerHTML = `
            <div style="color: var(--accent); font-size: 0.7rem; font-weight: 700;">${formatRelativeDate(msgData.created_at)}</div>
            <div style="color: var(--fg); font-size: 1rem; font-weight: 700;">${msgData.title || 'Без темы'}</div>
        `;
        item.addEventListener('click', () => renderMessageDetail(m, user, profile));
        listContainer.appendChild(item);
    });
}

async function renderMessageDetail(msg, user, profile) {
    // Отмечаем как прочитанное, если еще не прочитано
    if (!msg.read_at) {
        await supabaseClient.from('message_recipients').update({ read_at: new Date().toISOString() }).eq('id', msg.id);
    }

    if (window.currentView !== 'Уведомления') return;
    const msgData = msg.messages || {};

    document.getElementById('gym-content').innerHTML = `
        <div class="planner-container">
            <div class="planner-header">
                <button class="back-arrow-btn" id="msg-detail-back" style="left: 0;"><i data-lucide="arrow-left" style="width: 24px; height: 24px;"></i></button>
                <h2 class="planner-title">Сообщение</h2>
            </div>
            <div style="margin-top: 20px; text-align: left;">
                <div style="color: var(--accent); font-size: 0.7rem; font-weight: 700; margin-bottom: 5px;">${formatRelativeDate(msgData.created_at)}</div>
                <h1 style="font-size: 1.4rem; margin-bottom: 15px; color: var(--fg);">${msgData.title || 'Без темы'}</h1>
                <div style="color: #8e959f; line-height: 1.6;">${msgData.content || 'Нет содержимого'}</div>
            </div>
        </div>
    `;

    if (window.lucide) lucide.createIcons();
    document.getElementById('msg-detail-back').addEventListener('click', () => renderCustomerInbox(user, profile));
}