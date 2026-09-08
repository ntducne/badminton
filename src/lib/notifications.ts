import nodemailer from 'nodemailer';

export async function sendTelegramAlert(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('[Telegram Alert Skipped - Token/ChatId not set]:', message);
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('[Telegram Error]:', err);
    return false;
  }
}

export async function sendEmailAlert(to: string, subject: string, html: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.log('[Email Alert Skipped - SMTP Credentials not set]:', subject);
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"Cầu Lông Club" <${user}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error('[SMTP Error]:', err);
    return false;
  }
}

