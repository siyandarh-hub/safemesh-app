/**
 * Sends one-time codes by e-mail and/or SMS.
 *
 * Pick providers in .env (all optional — see .env.example):
 *   SAFEMESH_MAIL_PROVIDER = smtp | resend          (e-mail)
 *   SAFEMESH_SMS_PROVIDER  = twilio | bulksms       (SMS — popular in South Africa)
 *
 * With nothing configured, in development the code is printed in the server console so you can test.
 * In production (NODE_ENV=production) nothing is printed and no code can be delivered until you configure a provider.
 */
const env = (k, d = '') => (process.env[k] === undefined ? d : String(process.env[k]));

function toE164(phone, defaultCc = env('SAFEMESH_DEFAULT_COUNTRY_CODE', '27')) {
  let d = String(phone || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) return d;
  if (d.startsWith('00')) return '+' + d.slice(2);
  if (d.startsWith('0')) return '+' + defaultCc + d.slice(1);
  return '+' + d;
}

const mailProvider = () => env('SAFEMESH_MAIL_PROVIDER').toLowerCase();
const smsProvider = () => env('SAFEMESH_SMS_PROVIDER').toLowerCase();
function isConfigured() { return !!(mailProvider() || smsProvider()); }
const isProd = () => env('NODE_ENV') === 'production';

async function postJson(url, body, headers) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, { method: 'POST', signal: ctl.signal, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${url.split('/')[2]} answered ${r.status}`);
    return r;
  } finally { clearTimeout(tm); }
}

async function sendEmail(to, subject, text) {
  const p = mailProvider();
  const from = env('MAIL_FROM', 'SafeMesh <no-reply@localhost>');
  if (p === 'resend') {
    await postJson('https://api.resend.com/emails', { from, to: [to], subject, text }, { Authorization: 'Bearer ' + env('RESEND_API_KEY') });
    return true;
  }
  if (p === 'smtp') {
    let nodemailer; try { nodemailer = require('nodemailer'); } catch { throw new Error('nodemailer is not installed (run npm install in backend)'); }
    const t = nodemailer.createTransport({
      host: env('SMTP_HOST'), port: Number(env('SMTP_PORT', '587')), secure: env('SMTP_SECURE') === 'true',
      auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
    });
    await t.sendMail({ from, to, subject, text });
    return true;
  }
  return false;
}

async function sendSms(to, text) {
  const p = smsProvider();
  const num = toE164(to);
  if (!num) return false;
  if (p === 'twilio') {
    const sid = env('TWILIO_ACCOUNT_SID'), tok = env('TWILIO_AUTH_TOKEN');
    const body = new URLSearchParams({ To: num, From: env('TWILIO_FROM'), Body: text });
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 10000);
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST', signal: ctl.signal,
        headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!r.ok) throw new Error('twilio answered ' + r.status);
    } finally { clearTimeout(tm); }
    return true;
  }
  if (p === 'bulksms') {
    await postJson('https://api.bulksms.com/v1/messages', { to: num, body: text },
      { Authorization: 'Basic ' + Buffer.from(`${env('BULKSMS_TOKEN_ID')}:${env('BULKSMS_TOKEN_SECRET')}`).toString('base64') });
    return true;
  }
  return false;
}

/** Returns { channels: ['email','sms'] } — empty when nothing could be delivered. Never throws. */
async function sendResetCode({ email, phone, code, name, minutes }) {
  const channels = [];
  const text = `SafeMesh password reset code: ${code}\nIt expires in ${minutes} minutes. If you did not ask for this, ignore this message — nobody can reset your password without the code.`;
  try { if (mailProvider() && email && await sendEmail(email, 'Your SafeMesh password reset code', `Hi ${name || ''},\n\n${text}\n`)) channels.push('email'); }
  catch (e) { console.warn('  e-mail send failed:', e.message); }
  try { if (smsProvider() && phone && await sendSms(phone, text)) channels.push('sms'); }
  catch (e) { console.warn('  SMS send failed:', e.message); }
  if (!channels.length && !isConfigured() && !isProd()) {
    console.log(`\n  [DEV ONLY] Password reset code for ${email}: ${code}  (configure a mail/SMS provider in .env for real delivery)\n`);
    channels.push('console');
  }
  return { channels };
}

module.exports = { sendResetCode, isConfigured, toE164 };
