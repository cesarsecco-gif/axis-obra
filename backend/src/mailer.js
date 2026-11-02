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
  },
  INVITE: {
    subject: 'Convite para acessar o AXIS OBRA',
    intro: 'Você recebeu acesso ao AXIS OBRA. Clique no botão abaixo (ou use o código na opção "Esqueci minha senha") para criar a sua senha.'
  }
};

const escapeHtml = (v) => String(v || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

function validityText(minutes) {
  if (minutes >= 24 * 60) {
    const days = Math.round(minutes / (24 * 60));
    return `${days} dia${days > 1 ? 's' : ''}`;
  }
  return `${minutes} minutos`;
}

async function sendAuthCode({ to, name, code, purpose, minutes, link, invitedBy }) {
  const texts = PURPOSE_TEXT[purpose] || PURPOSE_TEXT.LOGIN;
  const validity = validityText(minutes);

  if (!emailConfigured) {
    if (isProduction) throw new Error('Envio de e-mail não configurado no servidor.');
    console.log(`[AXIS OBRA][DEV] Código ${purpose} para ${to}: ${code} (válido por ${validity})${link ? ` — ${link}` : ''}`);
    return;
  }

  const intro = invitedBy ? `${invitedBy} cadastrou você no AXIS OBRA. ${texts.intro}` : texts.intro;
  const text = `Olá${name ? `, ${name}` : ''}!\n\n${intro}\n\n${link ? `Criar senha: ${link}\n\n` : ''}Código: ${code}\n\nO código vale por ${validity} e só pode ser usado uma vez. Se você não esperava este e-mail, ignore-o.\n\nAXIS OBRA`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <div style="background:#0f172a;color:#f59e0b;padding:16px 20px;font-weight:900;font-size:18px;border-radius:8px 8px 0 0">AXIS OBRA</div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 8px 8px">
        <p>Olá${name ? `, <b>${escapeHtml(name)}</b>` : ''}!</p>
        <p>${escapeHtml(intro)}</p>
        ${link ? `<p style="text-align:center;margin:20px 0"><a href="${escapeHtml(link)}" style="background:#f59e0b;color:#0f172a;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block">Criar minha senha</a></p>` : ''}
        <p style="font-size:32px;font-weight:900;letter-spacing:8px;text-align:center;background:#fef3c7;border-radius:8px;padding:12px 0">${code}</p>
        <p style="font-size:13px;color:#475569">O código vale por ${validity} e só pode ser usado uma vez. Se você não esperava este e-mail, ignore-o.</p>
      </div>
    </div>`;

  await transporter.sendMail({ from: SMTP_FROM, to, subject: texts.subject, text, html });
}

module.exports = { sendAuthCode, emailAvailable, emailConfigured };
