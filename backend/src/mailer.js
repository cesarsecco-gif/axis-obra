// Envio de e-mails (códigos de acesso e recuperação de senha).
// Configurado por variáveis de ambiente SMTP_*. Sem SMTP configurado, fora de produção,
// o código é apenas exibido no log do servidor para facilitar testes locais.
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || (SMTP_USER ? `AXIS OBRA <${SMTP_USER}>` : 'AXIS OBRA <no-reply@axisobra.local>');

const isProduction = process.env.NODE_ENV === 'production';
const emailConfigured = Boolean(SMTP_HOST);

let transporter = null;
if (emailConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
}

// Disponível quando há SMTP, ou em desenvolvimento (código vai para o log).
const emailAvailable = emailConfigured || !isProduction;

const PURPOSE_TEXT = {
  LOGIN: {
    subject: 'Seu código de acesso ao AXIS OBRA',
    intro: 'Use o código abaixo para entrar no AXIS OBRA.'
  },
  RESET: {
    subject: 'Recuperação de senha do AXIS OBRA',
    intro: 'Use o código abaixo para criar uma nova senha no AXIS OBRA.'
  }
};

async function sendAuthCode({ to, name, code, purpose, minutes }) {
  const texts = PURPOSE_TEXT[purpose] || PURPOSE_TEXT.LOGIN;

  if (!emailConfigured) {
    if (isProduction) throw new Error('Envio de e-mail não configurado no servidor.');
    console.log(`[AXIS OBRA][DEV] Código ${purpose} para ${to}: ${code} (válido por ${minutes} min)`);
    return;
  }

  const text = `Olá${name ? `, ${name}` : ''}!\n\n${texts.intro}\n\nCódigo: ${code}\n\nO código vale por ${minutes} minutos e só pode ser usado uma vez. Se você não pediu este código, ignore este e-mail.\n\nAXIS OBRA`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <div style="background:#0f172a;color:#f59e0b;padding:16px 20px;font-weight:900;font-size:18px;border-radius:8px 8px 0 0">AXIS OBRA</div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 8px 8px">
        <p>Olá${name ? `, <b>${String(name).replace(/[<>&]/g, '')}</b>` : ''}!</p>
        <p>${texts.intro}</p>
        <p style="font-size:32px;font-weight:900;letter-spacing:8px;text-align:center;background:#fef3c7;border-radius:8px;padding:12px 0">${code}</p>
        <p style="font-size:13px;color:#475569">O código vale por ${minutes} minutos e só pode ser usado uma vez. Se você não pediu este código, ignore este e-mail.</p>
      </div>
    </div>`;

  await transporter.sendMail({ from: SMTP_FROM, to, subject: texts.subject, text, html });
}

module.exports = { sendAuthCode, emailAvailable, emailConfigured };
