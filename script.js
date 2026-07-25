/**
 * SCRIPT.JS: CORE & AUTHENTICATION
 * This file handles Supabase initialization, user login/registration, and the main dashboard logic.
 */

// --- SUPABASE CONFIGURATION ---
// SUPABASE_URL / SUPABASE_KEY are defined in config.js (see config.example.js)

let body = document.body;
let loader = document.getElementById('gym-loader');

// Auth Elements (will be (re)assigned in start())
let authContainer = document.querySelector('.auth-container');
let authForm = document.getElementById('auth-form');
let authTitle = document.getElementById('auth-title');
let authSubtitle = document.getElementById('auth-subtitle');
let authSubmitBtn = document.getElementById('auth-submit');
let toggleAuthBtn = document.getElementById('toggle-auth');
let forgotPassBtn = document.getElementById('forgot-password');
let resendVerificationBtn = document.getElementById('resend-verification');
let identifierInput = document.getElementById('auth-identifier');
let firstNameInput = document.getElementById('auth-first-name');
let lastNameInput = document.getElementById('auth-last-name');
let passwordInput = document.getElementById('auth-password');
let confirmPasswordInput = document.getElementById('auth-confirm-password');
let nameGroup = document.getElementById('name-group');
let identifierGroup = document.getElementById('identifier-group');
let passwordGroup = document.getElementById('password-group');
let confirmPasswordGroup = document.getElementById('confirm-password-group');
let togglePassBtn = document.getElementById('toggle-pass');
let toggleConfirmPassBtn = document.getElementById('toggle-confirm-pass');
window.currentView = '';
let themeToggleBtn = null;
let themeIconSun = null;
let themeIconMoon = null;
let currentThemeStep = 4;
let isThemeScaleOpen = false;
let themeScaleEls = null;

// --- Theme Step Switch (4 fixed stops) ---
// Theme switching happens ONLY through this scale, never by a plain button
// press: the button just opens/closes the popup. Unlike a continuous slider,
// the scale now snaps to exactly 4 discrete looks, top (step 1) to bottom
// (step 4, the default): light+blue, light+purple, dark+blue-purple, and
// dark+gold. Each step is just a body class combo - see the
// body.light-theme(.theme-purple) / body.theme-blue-purple rules in
// style2.css for the actual palettes.
const THEME_STEPS = [
  { step: 1, classes: ['light-theme'] },
  { step: 2, classes: ['light-theme', 'theme-purple'] },
  { step: 3, classes: ['theme-blue-purple'] },
  { step: 4, classes: [] },
];
const THEME_STEP_CLASSES = ['light-theme', 'theme-purple', 'theme-blue-purple'];

function getStoredThemeStep() {
  const stored = parseInt(localStorage.getItem('gym-theme-step') || '', 10);
  if (stored >= 1 && stored <= THEME_STEPS.length) return stored;
  return localStorage.getItem('gym-theme') === 'light' ? 1 : 4;
}

function updateThemeScaleUI() {
  if (!themeScaleEls) return;
  const fraction = (currentThemeStep - 1) / (THEME_STEPS.length - 1);
  themeScaleEls.thumb.style.top = `${fraction * 100}%`;
}

/**
 * The single entry point for switching theme via the scale. This is the
 * ONLY place theme state changes - the toggle button itself never switches
 * theme directly, it just opens/closes the popup that hosts this scale.
 * `animate: false` is for the initial page-load restore, which should apply
 * silently rather than crossfading colors and bouncing the thumb.
 */
function applyThemeStep(step, { persist = true, animate = true } = {}) {
  const clamped = Math.max(1, Math.min(THEME_STEPS.length, Math.round(step)));
  const changed = clamped !== currentThemeStep;
  currentThemeStep = clamped;
  const config = THEME_STEPS[clamped - 1];
  const isLight = config.classes.includes('light-theme');

  if (changed && animate) body.classList.add('theme-transitioning');
  THEME_STEP_CLASSES.forEach((c) => body.classList.remove(c));
  config.classes.forEach((c) => body.classList.add(c));
  if (themeIconSun) themeIconSun.style.display = isLight ? 'none' : 'block';
  if (themeIconMoon) themeIconMoon.style.display = isLight ? 'block' : 'none';
  if (changed && animate) setTimeout(() => body.classList.remove('theme-transitioning'), 500);

  if (persist) {
    localStorage.setItem('gym-theme-step', String(clamped));
    localStorage.setItem('gym-theme', isLight ? 'light' : 'dark');
  }

  updateThemeScaleUI();
  if (changed && animate && themeScaleEls) {
    const thumb = themeScaleEls.thumb;
    thumb.classList.remove('is-bouncing');
    // Force reflow so re-adding the class restarts the animation even if
    // the previous bounce is still finishing.
    void thumb.offsetWidth;
    thumb.classList.add('is-bouncing');
  }
}

function positionThemeScale() {
  if (!themeScaleEls || !themeToggleBtn) return;
  const rect = themeToggleBtn.getBoundingClientRect();
  themeScaleEls.popup.style.right = `${window.innerWidth - rect.right}px`;
  themeScaleEls.popup.style.bottom = `${window.innerHeight - rect.top + 14}px`;
}

function buildThemeScalePopup() {
  const popup = document.createElement('div');
  popup.className = 'theme-scale-popup';
  popup.id = 'theme-scale-popup';
  const dots = THEME_STEPS.map((s) => `<div class="theme-scale-dot theme-scale-dot--${s.step}"></div>`).join('');
  popup.innerHTML = `
    <i data-lucide="sun" class="theme-scale-icon theme-scale-icon--top"></i>
    <div class="theme-scale-track" id="theme-scale-track">
      ${dots}
      <div class="theme-scale-thumb" id="theme-scale-thumb"></div>
    </div>
    <i data-lucide="moon" class="theme-scale-icon theme-scale-icon--bottom"></i>
  `;
  document.body.appendChild(popup);
  if (window.lucide) lucide.createIcons();

  const track = popup.querySelector('#theme-scale-track');
  const thumb = popup.querySelector('#theme-scale-thumb');
  themeScaleEls = { popup, track, thumb };

  // Maps a pointer Y position to the nearest of the 4 fixed stops (1 = top,
  // THEME_STEPS.length = bottom) - this is a stepped switch, not a
  // continuous drag, so every point along the track resolves to one dot.
  const stepFromClientY = (clientY) => {
    const rect = track.getBoundingClientRect();
    let fraction = (clientY - rect.top) / rect.height; // 0 = top, 1 = bottom
    fraction = Math.max(0, Math.min(1, fraction));
    return Math.round(fraction * (THEME_STEPS.length - 1)) + 1;
  };

  let dragging = false;
  const onPointerMove = (e) => { if (dragging) applyThemeStep(stepFromClientY(e.clientY)); };
  const onPointerUp = () => {
    dragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };
  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    applyThemeStep(stepFromClientY(e.clientY));
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });

  track.addEventListener('wheel', (e) => {
    e.preventDefault();
    applyThemeStep(currentThemeStep + (e.deltaY > 0 ? 1 : -1)); // scroll down = later/darker step
  }, { passive: false });

  document.addEventListener('pointerdown', (e) => {
    if (!isThemeScaleOpen) return;
    if (popup.contains(e.target) || (themeToggleBtn && themeToggleBtn.contains(e.target))) return;
    closeThemeScale();
  });

  return themeScaleEls;
}

function openThemeScale() {
  if (!themeScaleEls) buildThemeScalePopup();
  positionThemeScale();
  isThemeScaleOpen = true;
  themeScaleEls.popup.classList.add('is-visible');
  updateThemeScaleUI();
}

function closeThemeScale() {
  isThemeScaleOpen = false;
  if (themeScaleEls) themeScaleEls.popup.classList.remove('is-visible');
}

let authMode = 'login'; // 'login', 'register', 'reset', or 'update_password'
let html5QrScanner = null;
let isLockedOut = false;
let isInKioskMode = false; 
window.kioskScanner = null;
window.lastAdminView = 'Клиенты';
let supabaseClient = null;

// --- UTILS ---

/**
 * Translates Supabase Auth error messages to Russian.
 */
window.translateError = function(msg) {
  if (!msg) return 'Произошла неизвестная ошибка';
  
  const m = msg.toLowerCase();
  if (m.includes('security reasons')) {
    const seconds = msg.match(/\d+/);
    return `В целях безопасности подождите ${seconds ? seconds[0] : 'немного'} сек. перед следующей попыткой.`;
  }
  if (m.includes('user already registered') || m.includes('already been registered')) return 'Этот пользователь уже зарегистрирован';
  if (m.includes('invalid login credentials')) return 'Неверный email или пароль';
  if (m.includes('email not confirmed')) return 'Почта не подтверждена';
  if (m.includes('password should be at least')) return 'Пароль должен содержать минимум 6 символов';
  if (m.includes('email rate limit exceeded')) return 'Слишком много запросов. Попробуйте позже.';
  if (m.includes('network error')) return 'Ошибка сети. Проверьте интернет-соединение.';
  
  return msg; // Return original if no translation found
};

/**
 * Formats a date to "Сегодня/Вчера/Nd ago" + "HH:mm"
 */
window.formatRelativeDate = function(dateInput) {
  if (!dateInput) return '...';
  const date = new Date(dateInput);
  const now = new Date();
  
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const thatDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffInDays = Math.floor((todayStart - thatDayStart) / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (diffInDays === 0) return `Сегодня, ${timeStr}`;
  if (diffInDays === 1) return `Вчера, ${timeStr}`;
  if (diffInDays > 1 && diffInDays < 30) return `${diffInDays}дн. назад, ${timeStr}`;
  return date.toLocaleDateString('ru-RU') + ' ' + timeStr;
};

/**
 * Simple transliteration for Cyrillic to Latin characters.
 * @param {string} text - The text to transliterate.
 * @returns {string} Transliterated text.
 */
function transliterate(text) {
    const a = {"Ё":"YO","Й":"I","Ц":"TS","У":"U","К":"K","Е":"E","Н":"N","Г":"G","Ш":"SH","Щ":"SCH","З":"Z","Х":"H","Ъ":"","Ф":"F","Ы":"I","В":"V","А":"A","П":"P","Р":"R","О":"O","Л":"L","Д":"D","Ж":"ZH","Э":"E","Я":"Ya","Ч":"CH","С":"S","М":"M","И":"I","Т":"T","Ь":"","Б":"B","Ю":"YU","ё":"yo","й":"i","ц":"ts","у":"u","к":"k","е":"e","н":"n","г":"g","ш":"sh","щ":"sch","з":"z","х":"h","ъ":"","ф":"f","ы":"i","в":"v","а":"a","п":"p","р":"r","о":"o","л":"l","д":"d","ж":"zh","э":"e","я":"ya","ч":"ch","с":"s","м":"m","и":"i","т":"t","ь":"","б":"b","ю":"yu"};
    return text.split('').map(char => a[char] || char).join("");
}

// --- CUSTOM UI COMPONENTS (POPUPS & MODALS) ---

/**
 * Modern toast notification that fades away fast.
 */
window.showToast = function(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `custom-toast ${type}`;
  toast.innerText = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('is-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 400);
  }, 2000);
};

/**
 * Modern modal for inputs (replacing prompt/alert).
 */
window.showModal = function({ title, content, onConfirm, confirmText = 'Ок', showCancel = true, onClose = null }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <h3>${title}</h3>
      <div class="modal-content">${content}</div>
      <div class="modal-actions">
        ${showCancel ? '<button class="btn-link" id="modal-cancel">Отмена</button>' : ''}
        <button class="btn-primary" id="modal-confirm">${confirmText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  const close = () => {
    overlay.classList.remove('is-active');
    setTimeout(() => {
        overlay.remove();
        if (onClose) onClose();
    }, 300);
  };

  setTimeout(() => overlay.classList.add('is-active'), 10);
  const cancelBtn = overlay.querySelector('#modal-cancel');
  if (cancelBtn) cancelBtn.onclick = close;

  const confirmBtn = overlay.querySelector('#modal-confirm');
  confirmBtn.onclick = async () => {
    if (!onConfirm) { close(); return; }

    // onConfirm(overlay) is often an async function - a Promise is always
    // truthy, so without awaiting it here the modal used to close instantly
    // regardless of whether the request actually succeeded, giving no
    // feedback while it was in flight and silently swallowing failures
    // (returning false could no longer keep the modal open, since it had
    // already closed). Now we wait for the real result, show a spinner
    // while it's pending, and only close on an actual success.
    const originalHtml = confirmBtn.innerHTML;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<div class="btn-spinner"></div>';
    if (cancelBtn) cancelBtn.disabled = true;

    let result;
    try {
      result = await onConfirm(overlay);
    } catch (err) {
      console.error('Modal confirm error:', err);
      result = false;
    }

    if (result) {
      close();
    } else {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = originalHtml;
      if (cancelBtn) cancelBtn.disabled = false;
    }
  };
};

// Injecting necessary styles for popups
const style = document.createElement('style');
style.textContent = `
  .custom-toast { position: fixed; top: 90px; right: 20px; left: auto; transform: translateX(130%); background: rgba(0, 0, 0, 0.98); backdrop-filter: blur(18px); color: var(--fg); padding: 12px 24px; border-radius: 18px; z-index: 10000; font-size: 0.8rem; border: 1px solid rgba(255, 255, 255, 0.1); opacity: 0; transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease; pointer-events: none; box-shadow: none; text-align: left; width: max-content; max-width: min(85vw, 320px); }
  .custom-toast.is-visible { opacity: 1; transform: translateX(0); }
  .custom-toast.error { border-color: rgba(239, 68, 68, 0.4); color: #ef4444; }
  .custom-toast.success { border-color: rgba(212, 175, 55, 0.4); color: var(--accent); }
  
  .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(18px); z-index: 9999; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s var(--ease, ease); }
  .modal-overlay.is-active { opacity: 1; }
  .modal-box { background: var(--surface); width: 85%; max-width: 360px; max-height: 85vh; overflow-y: auto; scrollbar-width: none; border-radius: 26px; padding: 26px; border: 1px solid var(--border); transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); color: var(--fg); box-shadow: var(--shadow-lift, 0 10px 30px -10px rgba(0,0,0,0.2)); }
  .modal-overlay.is-active .modal-box { transform: scale(1); }
  .modal-box h3 { margin-bottom: 15px; font-size: 0.8rem; color: var(--accent); }
  .modal-content { margin-bottom: 20px; font-family: system-ui, sans-serif; font-size: 0.8rem; }
  .modal-content input, .modal-content select, .modal-content textarea { width: 100%; background: var(--surface-soft); border: 1px solid var(--border); border-radius: 16px; padding: 16px; color: var(--fg); margin-top: 12px; font-family: system-ui, sans-serif; font-size: 0.8rem; outline: none; transition: all 0.3s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.1) inset; }
  .modal-content select { -webkit-appearance: none; -moz-appearance: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23d4af37' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 15px center; background-size: 18px; padding-right: 45px; cursor: pointer; }
  .modal-content select::-ms-expand { display: none; }
  .modal-content select option { background-color: #151821; color: #f2f4f7; }
  .modal-content input:focus, .modal-content select:focus, .modal-content textarea:focus { border-color: var(--accent); background: var(--surface-soft); box-shadow: 0 0 0 3px var(--accent-soft), 0 1px 2px rgba(0,0,0,0.1) inset; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
  .modal-actions button { padding: 10px 20px; font-size: 0.8rem; border-radius: 14px; }
`;
document.head.appendChild(style);

/**
 * Reusable button cooldown helper to prevent double-clicks or accidental double-sends.
 */
window.applyBtnCooldown = function(btn, seconds = 3, isIconButton = false) {
  if (!btn) return;
  const originalContent = btn.innerHTML;
  btn.disabled = true;
  let timeLeft = seconds;
  
  if (isIconButton) btn.style.opacity = '0.5';

  const timer = setInterval(() => {
    timeLeft--;
    if (!isIconButton) btn.innerText = `Ждите ${timeLeft}с`;
    if (timeLeft <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      if (isIconButton) btn.style.opacity = '1';
      btn.innerHTML = originalContent;
    }
  }, 1000);
};

function setupToggle(btn, input) {
  if (!btn || !input) return;
  // Support both lucide icons and class-based icons
  const eyeIcon = btn.querySelector('[data-lucide="eye"], .eye-icon');
  const eyeOffIcon = btn.querySelector('[data-lucide="eye-off"], .eye-off-icon');

  btn.addEventListener('click', (e) => {
    e.preventDefault(); // Good practice for buttons in forms
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    
    if (eyeIcon && eyeOffIcon) {
        eyeIcon.style.display = isPass ? 'none' : 'block';
        eyeOffIcon.style.display = isPass ? 'block' : 'none';
    }
    
    btn.classList.toggle('is-visible', !isPass);
  });
}

function startLockout() {
  isLockedOut = true;
  authSubmitBtn.disabled = true;
  let secondsLeft = 3;

  const originalText = authSubmitBtn.innerText;
  const interval = setInterval(() => {
    secondsLeft--;
    authSubmitBtn.innerText = `Попробуйте через ${secondsLeft}с`;

    if (secondsLeft <= 0) {
      clearInterval(interval);
      isLockedOut = false;
      authSubmitBtn.disabled = false;
      // Вернем текст через updateAuthUI()
      updateAuthUI();
    }
  }, 1000);
}

function updateAuthUI() {
  if (!authContainer) return;
  authContainer.style.display = 'block';

  passwordGroup.style.display = authMode === 'reset' ? 'none' : 'block';
  identifierGroup.style.display = authMode === 'update_password' ? 'none' : 'block';
  nameGroup.style.display = authMode === 'register' ? 'block' : 'none';
  confirmPasswordGroup.style.display = (authMode === 'register' || authMode === 'update_password') ? 'block' : 'none';

  passwordInput.required = authMode !== 'reset';
  if (firstNameInput) firstNameInput.required = authMode === 'register';
  if (lastNameInput) lastNameInput.required = authMode === 'register';
  confirmPasswordInput.required = (authMode === 'register' || authMode === 'update_password');

  if (forgotPassBtn) forgotPassBtn.style.display = 'none';
  if (resendVerificationBtn) resendVerificationBtn.style.display = 'none';

  if (authMode === 'login') {
    authTitle.innerText = 'Вход';
    authSubtitle.innerText = 'С возвращением';
    authSubmitBtn.innerText = 'Войти';
    // toggleAuthBtn.innerText = 'Нет аккаунта? Регистрация';
    if (toggleAuthBtn) toggleAuthBtn.style.display = 'none';
    passwordInput.placeholder = 'Пароль';
  } else if (authMode === 'register') {
    authTitle.innerText = 'Регистрация';
    authSubtitle.innerText = 'Присоединяйтесь к нам';
    authSubmitBtn.innerText = 'Создать аккаунт';
    if (toggleAuthBtn) {
      toggleAuthBtn.innerText = 'Уже есть аккаунт? Войти';
      toggleAuthBtn.style.display = 'block';
    }
    passwordInput.placeholder = 'Пароль';
  } else if (authMode === 'reset') {
    authTitle.innerText = 'Сброс пароля';
    authSubtitle.innerText = 'Введите вашу почту';
    authSubmitBtn.innerText = 'Отправить ссылку';
    if (toggleAuthBtn) {
      toggleAuthBtn.innerText = 'Вернуться к входу';
      toggleAuthBtn.style.display = 'block';
    }
  } else if (authMode === 'update_password') {
    authTitle.innerText = 'Новый пароль';
    authSubtitle.innerText = 'Каким должен быть новый пароль?';
    authSubmitBtn.innerText = 'Сохранить';
    passwordInput.placeholder = 'Новый пароль';
    if (toggleAuthBtn) toggleAuthBtn.style.display = 'none';
  }
}

async function renderKioskRegistrationPage() {
    // Hide the main loader and content
    if (loader) loader.style.display = 'none';
    if (authContainer) authContainer.style.display = 'none';
    document.body.classList.remove('is-loading');
    document.body.innerHTML = ''; // Clear the body to build the new UI

    let currentStep = 1;

    const updateUI = () => {
        let html = '';
        if (currentStep === 1) {
            // Step 1: Collect user info + credentials
            html = `
                <div class="auth-container" style="margin: auto; max-width: 400px; animation: content-fade-in 0.5s ease-out;">
                    <div class="auth-header">
                        <h1>Регистрация</h1>
                        <p>Придумайте имя пользователя и пароль</p>
                    </div>
                    <div class="auth-form">
                        <div class="input-group">
                            <div style="display:flex; gap:10px;">
                                <input type="text" id="kiosk-reg-first-name" placeholder="Имя" />
                                <input type="text" id="kiosk-reg-last-name" placeholder="Фамилия" />
                            </div>
                        </div>
                        <div class="input-group">
                            <input type="text" id="kiosk-reg-username" placeholder="Имя пользователя" autocapitalize="none" autocomplete="username" />
                        </div>
                        <div class="input-group">
                            <input type="password" id="kiosk-reg-password" placeholder="Пароль" autocomplete="new-password" />
                        </div>
                        <button id="kiosk-reg-submit-btn" class="btn-primary">Создать аккаунт</button>
                    </div>
                </div>
            `;
        } else if (currentStep === 'success') {
            // Final step: account created, logging the user in
            html = `
                <div class="auth-container" style="margin: auto; max-width: 400px; animation: content-fade-in 0.5s ease-out; text-align: center;">
                    <div class="auth-header">
                        <h1>Аккаунт создан!</h1>
                        <p>Выполняем вход...</p>
                    </div>
                    <div class="btn-spinner" style="margin: 20px auto;"></div>
                </div>
            `;
        }
        document.body.innerHTML = `<div class="page">${html}</div>`;
        attachHandlers();
    };

    const attachHandlers = () => {
        if (currentStep === 1) {
            const btn = document.getElementById('kiosk-reg-submit-btn');
            btn.onclick = async () => {
                const firstName = document.getElementById('kiosk-reg-first-name').value.trim();
                const lastName = document.getElementById('kiosk-reg-last-name').value.trim();
                const fullName = `${firstName} ${lastName}`.trim();
                const usernameRaw = document.getElementById('kiosk-reg-username').value.trim();
                const password = document.getElementById('kiosk-reg-password').value;

                if (!firstName || !lastName || !usernameRaw || !password) {
                    return showToast('Заполните все поля', 'error');
                }
                if (password.length < 6) {
                    return showToast('Пароль должен содержать не менее 6 символов', 'error');
                }

                const username = transliterate(usernameRaw).toLowerCase().replace(/[^a-z0-9_]/g, '');
                if (username.length < 3) {
                    return showToast('Имя пользователя должно содержать хотя бы 3 латинских символа, цифры или "_"', 'error');
                }

                btn.disabled = true;
                btn.innerHTML = '<div class="btn-spinner"></div>';

                try {
                    const email = `${username}@gymfit.local`;
                    const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                        email,
                        password,
                        options: { data: { full_name: fullName, username } }
                    });

                    if (signUpError) throw signUpError;

                    // Fake emails can never be confirmed, so if the project requires confirmation, sign in explicitly.
                    if (!signUpData.session) {
                        const { error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });
                        if (signInError) throw signInError;
                    }

                    currentStep = 'success';
                    updateUI();

                    // supabaseClient persists the session, so reloading lands the user straight in the dashboard.
                    setTimeout(() => {
                        window.location.href = window.location.origin + window.location.pathname;
                    }, 1200);
                } catch (err) {
                    console.error('Kiosk registration error:', err);
                    showToast(window.translateError(err.message), 'error');
                    btn.disabled = false;
                    btn.innerText = 'Создать аккаунт';
                }
            };
        }
    };

    updateUI();
    if (window.lucide) lucide.createIcons();
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  if (!supabaseClient) return showToast('Ошибка: база данных не подключена', 'error');
  if (isLockedOut) return;

  const originalBtnText = authSubmitBtn.innerText;
  authSubmitBtn.disabled = true;
  authSubmitBtn.innerHTML = '<div class="btn-spinner"></div>';

  const identifier = identifierInput.value.trim();
  const firstNameValue = (firstNameInput?.value || '').trim();
  const lastNameValue = (lastNameInput?.value || '').trim();
  const fullNameValue = [firstNameValue, lastNameValue].filter(Boolean).join(' ');
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if ((authMode === 'register' || authMode === 'update_password') && password !== confirmPassword) {
    authSubmitBtn.disabled = false;
    authSubmitBtn.innerText = originalBtnText;
    return showToast('Пароли не совпадают', 'error');
  }

  try {
    let result;

    if (authMode === 'register') {
      result = await supabaseClient.auth.signUp({
        email: identifier,
        password,
        options: {
          data: { full_name: fullNameValue }
        }
      });
    } else if (authMode === 'login') {
      result = await supabaseClient.auth.signInWithPassword({ email: identifier, password });
    } else if (authMode === 'reset') {
      // This will now use the "Site URL" you configured in the Supabase dashboard.
      // Make sure your site URL is also in the "Redirect URLs" allowlist (see next steps).
      await supabaseClient.auth.resetPasswordForEmail(identifier);
      showToast('Ссылка отправлена на почту');
      return;
    } else if (authMode === 'update_password') {
      result = await supabaseClient.auth.updateUser({ password });
      if (!result.error) {
        showToast('Пароль успешно обновлен!');
        // After successful password update, the user is automatically signed in.
        // We should now redirect them to the dashboard.
        const { data: userAfterUpdate } = await supabaseClient.auth.getUser();
        const { data: profileAfterUpdate, error: profileError } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', userAfterUpdate.user.id)
          .maybeSingle();
        if (profileError) console.error('Profile fetch error after password update:', profileError);
        showDashboard(userAfterUpdate.user, profileAfterUpdate);
        return;
      }
    }

    if (result?.error) {
      const translatedMsg = window.translateError(result.error.message);
      showToast(translatedMsg, 'error');
      startLockout();
      return;
    }

    if (authMode === 'register' && !result.data?.session) {
      showToast('Пожалуйста, подтвердите свою почту! Мы отправили письмо.');
      authMode = 'login';
      updateAuthUI();
      return;
    }

    showToast(authMode === 'register' ? 'Регистрация успешна!' : 'Успешный вход!');
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', result.data.user.id)
      .maybeSingle();

    if (profileError) console.error('Login profile fetch error:', profileError);
    showDashboard(result.data.user, profile);
  } catch (err) {
    console.error(err);
    showToast('Ошибка сервера', 'error');
  } finally {
    // Only re-enable button and update UI if we are still on the auth screen
    // (i.e., showDashboard was not called and authContainer is still visible)
    if (!isLockedOut && authContainer.style.display !== 'none') {
      authSubmitBtn.disabled = false;
      updateAuthUI();
    }
  }
}

async function start() {
  // Initialize DOM references
  body = document.body;
  loader = document.getElementById('gym-loader');
  authContainer = document.querySelector('.auth-container');
  authForm = document.getElementById('auth-form');
  authTitle = document.getElementById('auth-title');
  authSubtitle = document.getElementById('auth-subtitle');
  authSubmitBtn = document.getElementById('auth-submit');
  toggleAuthBtn = document.getElementById('toggle-auth');
  forgotPassBtn = document.getElementById('forgot-password');
  resendVerificationBtn = document.getElementById('resend-verification');
  nameGroup = document.getElementById('name-group');
  identifierGroup = document.getElementById('identifier-group');
  lastNameInput = document.getElementById('auth-last-name');
  passwordInput = document.getElementById('auth-password');
  confirmPasswordInput = document.getElementById('auth-confirm-password');
  passwordGroup = document.getElementById('password-group');
  confirmPasswordGroup = document.getElementById('confirm-password-group');
  togglePassBtn = document.getElementById('toggle-pass');
  toggleConfirmPassBtn = document.getElementById('toggle-confirm-pass');
  themeToggleBtn = document.getElementById('theme-toggle');
  themeIconSun = document.getElementById('theme-icon-sun');
  themeIconMoon = document.getElementById('theme-icon-moon');

  // Init supabase
  if (window.supabase && SUPABASE_URL.startsWith('https')) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        detectSessionInUrl: true,
        autoRefreshToken: true,
        persistSession: true
      }
    });

    supabaseClient.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // When PASSWORD_RECOVERY event occurs, always switch to update_password mode.
        // The user object might not be immediately available via getUser()
        // but the event itself confirms the recovery state.
        authMode = 'update_password';
        showToast('Пожалуйста, введите новый пароль.'); // More direct message
        updateAuthUI();
      }
    });
  } else {
    console.error('Supabase not available (window.supabase missing or URL invalid)');
  }

  // Immediate check for password recovery in URL
  if (window.location.hash.includes('type=recovery')) {
    authMode = 'update_password';
  }

  // Setup UI Interactions
  if (togglePassBtn) setupToggle(togglePassBtn, passwordInput);
  if (toggleConfirmPassBtn) setupToggle(toggleConfirmPassBtn, confirmPasswordInput);

  // Initial render for static icons
  if (window.lucide) lucide.createIcons();

  // Theme Toggler Logic
  if (themeToggleBtn) {
    applyThemeStep(getStoredThemeStep(), { persist: false, animate: false });

    // The button only opens/closes the step switch - it never switches
    // theme by itself. Clicking/dragging a dot on the scale is the only way
    // to move between steps (see applyThemeStep).
    themeToggleBtn.addEventListener('click', () => {
      if (isThemeScaleOpen) closeThemeScale();
      else openThemeScale();
    });
  }

  // if (toggleAuthBtn) {
  //   toggleAuthBtn.addEventListener('click', () => {
  //     authMode = authMode === 'login' ? 'register' : 'login';
  //     updateAuthUI();
  //   });
  // }

  // if (forgotPassBtn) {
  //   forgotPassBtn.addEventListener('click', () => {
  //     authMode = 'reset';
  //     updateAuthUI();
  //   });
  // }

  if (resendVerificationBtn) {
    resendVerificationBtn.addEventListener('click', async () => {
      const email = identifierInput.value.trim();
      if (!email) return showToast('Введите почту для повторной отправки', 'error');

      let redirectUrl = window.location.origin + window.location.pathname;
      redirectUrl = redirectUrl.split('#')[0].split('?')[0];

      const { error } = await supabaseClient.auth.resend({
        type: 'signup',
        email: email,
        options: { emailRedirectTo: redirectUrl }
      });

      if (error) showToast(window.translateError(error.message), 'error');
      else {
        showToast('Письмо отправлено повторно');
        window.applyBtnCooldown(resendVerificationBtn, 3);
      }
    });
  }

  if (authForm) {
    // Avoid double-binding if start() is ever called twice
    authForm.onsubmit = (e) => handleAuthSubmit(e);
  }

  // Extra safety: bind click explicitly for update_password mode.
  // Some UI implementations recreate/replace auth button outside of the original form submit flow.
  if (authSubmitBtn) {
    authSubmitBtn.addEventListener('click', (e) => {
      if (authMode !== 'update_password') return;
      // If button isn't inside the form submit flow, ensure we still submit.
      e.preventDefault();
      handleAuthSubmit(e);
    });
  }

  body.classList.add('is-loading');

  // Check if user is already remembered
  let currentUser = null;
  let currentProfile = null;

  if (supabaseClient) {
    const { data } = await supabaseClient.auth.getUser();
    currentUser = data?.user || null;

    if (currentUser) {
      const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error) console.error('Initial profile fetch error:', error);
      currentProfile = profile;
    }
  }

  requestAnimationFrame(() => {
    const totalEntranceTime = 1200;
    setTimeout(() => {
      if (currentUser && authMode !== 'update_password') {
        showDashboard(currentUser, currentProfile, false);
      } else {
        updateAuthUI();
      }

      body.classList.add('is-ready');

      setTimeout(() => {
        body.classList.remove('is-loading');
        if (loader) loader.style.display = 'none';
      }, 650);
    }, totalEntranceTime);
  });
}

/**
 * Decide whether to show the Scanning interface (Admin) or the personal QR Code (User)
 */
function renderQRCode(user, profile) {
  if (profile?.is_admin) {
    renderAdminQRCode();
  } else {
    renderUserQRCode(user, profile);
  }
}

/**
 * Calculates attendance streak (consecutive days)
 */
async function calculateAndDisplayStreak(userId) {
  if (!supabaseClient) return;
  
  const { data, error } = await supabaseClient
    .from('attendance')
    .select('visit_date')
    .eq('user_id', userId)
    .order('visit_date', { ascending: false });

  if (error || !data) {
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Get unique local dates (YYYY-MM-DD)
  const uniqueDates = [...new Set(data.map(d => d.visit_date.split('T')[0]))];
  if (uniqueDates.length === 0) {
    document.getElementById('streak-count').innerText = '0';
    if (window.lucide) lucide.createIcons();
    return;
  }

  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');

  // Streak is dead if no visit today AND no visit yesterday
  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) {
    document.getElementById('streak-count').innerText = '0';
    if (window.lucide) lucide.createIcons();
    return;
  }

  let streak = 1;
  let current = new Date(uniqueDates[0]);

  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i]);
    current.setHours(0,0,0,0);
    prev.setHours(0,0,0,0);
    
    const diff = (current - prev) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      streak++;
      current = prev;
    } else if (diff === 0) {
      continue; // Multiple visits same day
    } else {
      break; // Gap found
    }
  }

  document.getElementById('streak-count').innerText = streak;
  if (window.lucide) lucide.createIcons();
}

/**
 * Main Navigation and UI entry point after login
 */
  async function showDashboard(user, profile, showGreeting = true) {
    // Remove radial gradient by adding a specific class to body
    body.classList.add('is-logged-in');
    
    const content = document.getElementById('gym-content');
    const hero = document.querySelector('.hero');
    const navItems = document.querySelectorAll('.nav-item');

    // Если профиль не передан, пробуем получить его еще раз
    if (user && !profile) {
      const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
      if (error) {
        console.error("Dashboard profile fetch error:", error.message, error.details);
      }
      profile = data;
    }

    // Update 'last_seen_at' for non-admin users to track activity periodically
    if (user && profile && !(profile.is_admin === true || profile.is_admin === 'true')) {
      const updateActivity = () => {
        supabaseClient.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id).then(() => {});
      };
      
      updateActivity(); // Initial update
      setInterval(updateActivity, 120000); // Heartbeat every 2 minutes
    }

    // Show/Update Top Bar
    const topBar = document.getElementById('top-bar');
    if (topBar) {
      topBar.style.display = 'flex';

      const trophyBtn = document.getElementById('streak-trophy-btn');
      if (trophyBtn && window.renderStreakLeaderboard) {
        trophyBtn.onclick = (e) => {
          e.stopPropagation();
          stopScanner();
          const activeNavItem = document.querySelector('.nav-item.is-active');
          const previousView = window.currentView;
          window.currentView = 'Рейтинг';
          window.renderStreakLeaderboard(user?.id, () => {
            window.currentView = previousView;
            if (activeNavItem) activeNavItem.click();
          });
        };
      }

      if (profile?.is_admin) {
        document.getElementById('streak-badge').style.display = 'none';
      } else {
        document.getElementById('streak-badge').style.display = 'flex';
        if (window.lucide) lucide.createIcons();
        calculateAndDisplayStreak(user.id);

        // Setup streak info listener
        const infoBtn = document.getElementById('streak-info-btn');
        if (infoBtn) {
          infoBtn.onclick = (e) => {
            e.stopPropagation();
            showModal({
              title: 'Что такое стрик?',
              content: '<p style="color: #8e959f; font-size: 0.9rem; line-height: 1.5;">Стрик — это ваша серия посещений! Посещайте зал каждый день, чтобы поддерживать огонь. Если пропустить хотя бы один день, стрик сбросится.</p>',
              confirmText: 'Понятно',
              showCancel: false
            });
          };
        }
      }
    }

    // Kiosk Mode Toggle for Admins
    const kioskToggleBtn = document.getElementById('kiosk-mode-toggle');
    const adminActionsContainer = document.getElementById('admin-actions');
    if (kioskToggleBtn && adminActionsContainer) {
        if (profile?.is_admin) {
            adminActionsContainer.style.display = 'block';
            if (window.lucide) lucide.createIcons();
            kioskToggleBtn.onclick = () => {
                if (!isInKioskMode && window.innerWidth < 768) {
                    showModal({
                        title: 'Нужен экран побольше',
                        content: '<p>Режим киоска рассчитан на планшет или компьютер. Откройте эту страницу на устройстве с более широким экраном, чтобы им пользоваться.</p>',
                        confirmText: 'Понятно',
                        showCancel: false
                    });
                    return;
                }
                isInKioskMode = !isInKioskMode;
                if (isInKioskMode) {
                    enterKioskMode();
                } else {
                    exitKioskMode();
                }
            };
        }
    }

    // Если зашел админ — показываем баннер сверху, иначе убираем
    if ((profile?.is_admin === true || profile?.is_admin === 'true') && navItems.length > 0) {
      // Hide the customer notification FAB if it exists
      const userFab = document.getElementById('user-notification-fab');
      if (userFab) userFab.style.display = 'none';

      let banner = document.querySelector('.admin-status-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'admin-status-banner';
        document.body.appendChild(banner);
      }
      banner.innerText = 'Привет, Админ!';
      banner.classList.remove('is-visible');
      setTimeout(() => banner.classList.add('is-visible'), 10);

      setTimeout(() => {
        if (banner) {
          banner.classList.remove('is-visible');
          banner.style.visibility = 'hidden';
          setTimeout(() => banner.remove(), 500);
        }
      }, 2000);

      const firstLabel = navItems[0].querySelector('.nav-label');
      if (firstLabel) firstLabel.innerText = 'Сканер';

      const secondItem = navItems[1]; 
      secondItem.querySelector('.nav-label').innerText = 'Клиенты';
      secondItem.querySelector('.nav-icon').outerHTML = `
        <i data-lucide="users" class="nav-icon"></i>
      `;

      // Reports/analytics button removed - there's already a separate
      // analytics app in use, no need to duplicate that here.
      const thirdItem = navItems[2];
      thirdItem.style.display = 'none';
      if (window.lucide) lucide.createIcons();
    } else {
      const banner = document.querySelector('.admin-status-banner');
      if (banner) banner.remove();

      // Persistent Notification FAB for Customers
      let userInboxFab = document.getElementById('user-notification-fab');
      if (!userInboxFab) {
        userInboxFab = document.createElement('button');
        userInboxFab.id = 'user-notification-fab';
        userInboxFab.className = 'inbox-fab';
        userInboxFab.style.zIndex = '2001'; // Above bottom-nav
        userInboxFab.innerHTML = `
          <i data-lucide="mail" style="width: 26px; height: 26px;"></i>
        `;
        document.body.appendChild(userInboxFab);
        userInboxFab.addEventListener('click', () => {
          navItems.forEach(i => i.classList.remove('is-active'));
          window.currentView = 'Уведомления';
          renderCustomerInbox(user, profile);
        });
      }
      userInboxFab.style.display = 'flex';
      if (window.lucide) lucide.createIcons();
    }

    // Initialize nav click handlers
    navItems.forEach(item => {
      item.onclick = () => {
        navItems.forEach(i => i.classList.remove('is-active'));
        item.classList.add('is-active');
        
        // Stop scanner if it's running before switching views
        stopScanner();
        
        // Use textContent instead of innerText to bypass CSS uppercase transformations
        // and trim to ensure no hidden whitespace breaks the comparison.
        const label = item.querySelector('.nav-label').textContent.trim();
        window.currentView = label;

        if (label === 'Мой QR-код' || label === 'Сканер') {
          renderQRCode(user, profile);
        } else if (label === 'Расписание') {
          renderSchedule(new Date(), profile?.id);
        } else if (label === 'Клиенты') {
          renderClients();
        } else if (label === 'Абонемент') {
          renderSubscription(user, profile);
        } else if (label === 'Отчеты') {
          renderAdminReports();
        } else if (label === 'Профиль') {
          renderProfile(user, profile);
        } else if (label === 'Другое') {
          renderOther(user, profile);
        }
      };
    });

    if (showGreeting) {
      const name = profile?.is_admin ? 'Админ' : (profile?.full_name || user.user_metadata?.full_name || user.email);
      content.innerHTML = `
        <div class="auth-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; text-align: center;">
          <h1 style="font-size: 2.5rem; font-weight: 400; margin-bottom: 10px; background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Привет, ${name.split(' ')[0]}!</h1>
          <p style="color: #8e959f; font-size: 1.1rem;">Готовы к тренировке?</p>
        </div>
      `;

      setTimeout(() => {
        content.style.opacity = '0';
        setTimeout(() => {
          content.innerHTML = '';
          content.style.opacity = '1';
          hero.classList.add('is-blurred');
          body.classList.add('show-nav');
          navItems[0].classList.add('is-active');
          window.currentView = navItems[0].querySelector('.nav-label').textContent.trim();
          renderQRCode(user, profile);
        }, 400);
      }, 1500);
    } else {
      content.innerHTML = '';
      hero.classList.add('is-blurred');
      body.classList.add('show-nav');
      if(navItems.length > 0) {
        navItems[0].classList.add('is-active');
        window.currentView = navItems[0].querySelector('.nav-label').textContent.trim();
        renderQRCode(user, profile);
      }
    }
  }

/**
 * Admin Utility: Send message to user with a 3-second cooldown to prevent double-sends.
 */
window.adminSendMessage = async (userId, content, btnElement) => {
  if (!content || !content.trim()) return showToast('Введите текст сообщения', 'error');
  
  const { error } = await supabaseClient
    .from('messages')
    .insert([{
      recipient_id: userId,
      content: content.trim(),
      sender_id: (await supabaseClient.auth.getUser()).data.user?.id
    }]);

  if (error) {
    showToast('Ошибка отправки: ' + window.translateError(error.message), 'error');
  } else {
    showToast('Сообщение отправлено!');
    window.applyBtnCooldown(btnElement, 3);
  }
};

// --- APP INITIALIZATION ---

// Check for Kiosk Registration mode immediately.
const earlyUrlParams = new URLSearchParams(window.location.search);
if (earlyUrlParams.get('mode') === 'kiosk-register') {
  // If in kiosk registration mode, run a minimal setup just for that page.
  const initKioskRegistration = () => {
    // Initialize necessary DOM references that are used before the UI is cleared.
    // This is crucial because this flow bypasses the main `start()` function.
    body = document.body;
    loader = document.getElementById('gym-loader');
    authContainer = document.querySelector('.auth-container');

    // The registration page needs its own Supabase client.
    if (window.supabase && SUPABASE_URL.startsWith('https')) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
      console.error('Supabase client could not be initialized for Kiosk Registration.');
      document.body.innerHTML = '<h1>Ошибка конфигурации</h1>';
      return;
    }
    // Also need to initialize theme for the auth-container styles
    const kioskStep = THEME_STEPS[getStoredThemeStep() - 1];
    kioskStep.classes.forEach((c) => document.body.classList.add(c));
    renderKioskRegistrationPage();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKioskRegistration, { once: true });
  } else {
    initKioskRegistration();
  }

} else {
  // Otherwise, run the full application startup.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}