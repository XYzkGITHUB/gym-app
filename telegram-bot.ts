import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendTelegramMessage(chat_id, text, options = {}) {
  const { photo = null, reply_markup = null } = options;
  const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!TELEGRAM_BOT_TOKEN) throw new Error('Telegram Bot Token not set.')

  const endpoint = photo ? 'sendPhoto' : 'sendMessage';
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${endpoint}`;
  
  let payload = photo 
    ? { chat_id, photo, caption: text, parse_mode: 'Markdown' }
    : { chat_id, text, parse_mode: 'Markdown' };

  if (reply_markup) {
    payload.reply_markup = reply_markup;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error(`Telegram API error (${endpoint}):`, errorData.description);
    // If sending a photo fails, fall back to a text-only message
    if (photo) {
      const { photo: _p, ...fallbackOptions } = options;
      await sendTelegramMessage(chat_id, text, fallbackOptions);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // --- Direct call from client to send credentials ---
    if (body.action === 'send_credentials') {
      const { chat_id, email, password, user_id } = body;
      if (!chat_id || !email || !password || !user_id) {
        throw new Error('Missing parameters for send_credentials');
      }

      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${user_id}&bgcolor=ffffff`;
      const message = `
🎉 *Аккаунт успешно создан!*

Вот ваши данные для входа в приложение. Сохраните их!

*Логин (почта):*
\`${email}\`

*Пароль:*
\`${password}\`

Используйте команды /qr и /login, чтобы получить эти данные в будущем (кроме пароля).
      `.trim();

      await sendTelegramMessage(chat_id, message, { photo: qrUrl });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- Webhook call from Telegram for commands ---
    if (body.update_id) {
      const { message } = body;
      if (!message || !message.text) return new Response('ok');

      const chatId = message.chat.id;
      const command = message.text.toLowerCase().trim();

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .eq('telegram_chat_id', String(chatId)) // Use string comparison for robustness
        .single();

      if (profileError || !profile) {
        if (profileError) {
          console.error('Error fetching profile by chat ID:', profileError);
        }
        await sendTelegramMessage(chatId, '😕 Не могу найти ваш профиль. Убедитесь, что вы зарегистрировались в киоске, указав ваш Telegram ID, и запустили бота командой /start.');
        return new Response('ok');
      }

      const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
      if (userError || !user) {
        await sendTelegramMessage(chatId, '😕 Ошибка при поиске вашего аккаунта. Пожалуйста, свяжитесь с администратором.');
        return new Response('ok');
      }

      if (command === '/start') {
        await sendTelegramMessage(chatId, `
👋 Привет, ${profile.full_name}!

Я ваш помощник в Gym Fit. Вот что я умею:
/qr - Показать ваш QR-код для входа.
/login - Показать ваш логин для приложения.
        `.trim());
      } else if (command === '/qr') {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${profile.id}&bgcolor=ffffff`;
        await sendTelegramMessage(chatId, '✅ *Ваш QR-код для входа*\n\nПредъявите его на ресепшене.', { photo: qrUrl });
      } else if (command === '/login') {
        // By removing the 'redirectTo' option, Supabase will automatically use the
        // "Site URL" you configured in the Authentication -> URL Configuration settings.
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: user.email
        });

        if (linkError || !linkData?.properties?.action_link) {
          console.error('Error generating magic link:', linkError);
          await sendTelegramMessage(chatId, '😕 Не удалось создать ссылку для входа. Попробуйте позже.');
          return new Response('ok');
        }

        const messageText = `
✅ *Ваша ссылка для входа*

Нажмите на кнопку ниже, чтобы автоматически войти в свой аккаунт. Ссылка одноразовая и действует недолго.

_Никому не передавайте эту ссылку._
        `.trim();

        await sendTelegramMessage(chatId, messageText, {
          reply_markup: { inline_keyboard: [[{ text: '🚀 Войти в аккаунт', url: linkData.properties.action_link }]] }
        });
      } else {
        await sendTelegramMessage(chatId, 'Неизвестная команда. Используйте /start, чтобы увидеть список команд.');
      }

      return new Response('ok');
    }

    throw new Error('Invalid request');
  } catch (error) {
    console.error('Function Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
  }
});