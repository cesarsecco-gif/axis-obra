import React, { useEffect, useState } from 'react';
import { KeyRound, Mail, Lock, ArrowLeft, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../api';

const MODULES = [
  { num: '01', title: 'Registro Fotográfico', desc: 'Galeria por etapa construtiva e relatório fotográfico A4' },
  { num: '02', title: 'Diário de Obras (RDO)', desc: 'RDO padrão DER/PR, calendário, lote e folha finalizada' },
  { num: '03', title: 'Registro de Ocorrências', desc: 'Não conformidades, anexos, prazos e indicadores de SLA' },
  { num: '04', title: 'Cadastro de Funcionários', desc: 'Efetivo CLT e terceiros, funções, ASO e NRs' },
  { num: '05', title: 'Cadastro de Equipamentos', desc: 'Patrimônio, locação, custos e manutenção preventiva' },
  { num: '06', title: 'Obras por Usuário', desc: 'Acesso de cada profissional somente às suas obras' },
  { num: '07', title: 'Registro de Pluviometria', desc: 'Chuva em mm por turno, dados INMET e paralisações' },
  { num: '08', title: 'Configurações do Sistema', desc: 'Campos de ocorrência e cabeçalhos dos relatórios' }
];

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm focus:border-amber-500 outline-none';
const primaryBtn =
  'w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/10 transition';
const linkBtn = 'text-xs font-semibold text-amber-400 hover:text-amber-300 transition';

// Modos: PASSWORD (e-mail e senha) | CODE (código por e-mail) | RESET (recuperar senha)
export default function LoginView({ onLoggedIn }) {
  const [mode, setMode] = useState('PASSWORD');
  const [emailCodeEnabled, setEmailCodeEnabled] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest('/api/auth/options')
      .then((opts) => setEmailCodeEnabled(Boolean(opts.emailCodeEnabled)))
      .catch(() => setEmailCodeEnabled(false));
  }, []);

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setInfo('');
    setCode('');
    setCodeSent(false);
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const run = async (fn) => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      onLoggedIn(res);
    });
  };

  const handleRequestCode = (purpose) =>
    run(async () => {
      const res = await apiRequest('/api/auth/request-code', {
        method: 'POST',
        body: JSON.stringify({ email, purpose })
      });
      setCodeSent(true);
      setInfo(res.message || 'Código enviado. Confira sua caixa de entrada e o spam.');
    });

  const handleCodeLogin = (e) => {
    e.preventDefault();
    if (!codeSent) return handleRequestCode('LOGIN');
    run(async () => {
      const res = await apiRequest('/api/auth/login-code', {
        method: 'POST',
        body: JSON.stringify({ email, code })
      });
      onLoggedIn(res);
    });
  };

  const handleResetPassword = (e) => {
    e.preventDefault();
    if (!codeSent) return handleRequestCode('RESET');
    if (newPassword !== confirmPassword) {
      setError('A confirmação não confere com a nova senha.');
      return;
    }
    run(async () => {
      const res = await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, newPassword })
      });
      switchMode('PASSWORD');
      setInfo(res.message || 'Senha alterada com sucesso. Faça login com a nova senha.');
    });
  };

  const emailField = (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-1">E-mail</label>
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        disabled={codeSent && mode !== 'PASSWORD'}
        onChange={(e) => setEmail(e.target.value)}
        className={`${inputClass} disabled:opacity-60`}
      />
    </div>
  );

  const codeField = (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-1">Código recebido por e-mail</label>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        className={`${inputClass} tracking-[0.5em] text-center font-mono text-lg`}
        placeholder="000000"
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => handleRequestCode(mode === 'RESET' ? 'RESET' : 'LOGIN')}
        className={`${linkBtn} mt-2`}
      >
        Reenviar código
      </button>
    </div>
  );

  const titles = {
    PASSWORD: { title: 'Acessar o Sistema', subtitle: 'Entre com seu e-mail e senha.' },
    CODE: { title: 'Entrar com código', subtitle: 'Enviaremos um código de 6 dígitos para o seu e-mail.' },
    RESET: { title: 'Recuperar senha', subtitle: 'Enviaremos um código para você criar uma nova senha.' }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col lg:flex-row">
      {/* Coluna de apresentação */}
      <div className="lg:w-7/12 p-8 lg:p-14 flex flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800">
        <div>
          <div className="inline-flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg shadow-amber-500/20">
              AX
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">AXIS OBRA</h1>
              <p className="text-xs font-medium text-amber-400 uppercase tracking-widest">
                Sistema Integrado de Engenharia e Gestão de Obras
              </p>
            </div>
          </div>

          <h2 className="text-3xl lg:text-4xl font-extrabold mt-10 leading-tight text-white">
            Controle completo do canteiro de obras em uma única plataforma.
          </h2>
          <p className="text-slate-400 mt-3 text-sm lg:text-base max-w-2xl">
            Diário de obras, registro fotográfico, ocorrências, efetivo, equipamentos e pluviometria, com acesso de cada
            usuário somente às obras em que atua.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-8">
            {MODULES.map((m) => (
              <div key={m.num} className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start gap-3">
                <span className="px-2 py-1 rounded bg-amber-500/15 text-amber-400 font-mono text-xs font-bold border border-amber-500/30">
                  {m.num}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">{m.title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>AXIS OBRA v1.1</span>
          <span>RDO Digital • Padrão DER/PR</span>
        </div>
      </div>

      {/* Coluna de acesso */}
      <div className="order-first lg:order-none lg:w-5/12 p-6 sm:p-8 lg:p-12 flex flex-col justify-center bg-slate-950">
        <div className="max-w-md w-full mx-auto space-y-6">
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-slate-950 font-black">AX</div>
            <span className="text-lg font-black tracking-tight">AXIS OBRA</span>
          </div>
          <div>
            {mode !== 'PASSWORD' && (
              <button type="button" onClick={() => switchMode('PASSWORD')} className={`${linkBtn} flex items-center gap-1 mb-3`}>
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar para login com senha
              </button>
            )}
            <h2 className="text-2xl font-bold text-white">{titles[mode].title}</h2>
            <p className="text-xs text-slate-400 mt-1">{titles[mode].subtitle}</p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-medium">
              {error}
            </div>
          )}
          {info && (
            <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium">
              {info}
            </div>
          )}

          {mode === 'PASSWORD' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
              {emailField}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">Senha</label>
                  {emailCodeEnabled && (
                    <button type="button" onClick={() => switchMode('RESET')} className={linkBtn}>
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={loading} className={primaryBtn}>
                <span className="inline-flex items-center gap-2">
                  <Lock className="w-4 h-4" /> {loading ? 'Autenticando...' : 'Entrar no AXIS OBRA'}
                </span>
              </button>

              {emailCodeEnabled && (
                <>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <div className="flex-1 h-px bg-slate-800" /> ou <div className="flex-1 h-px bg-slate-800" />
                  </div>
                  <button
                    type="button"
                    onClick={() => switchMode('CODE')}
                    className="w-full py-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 hover:border-amber-500/60 text-slate-200 font-semibold text-sm transition inline-flex items-center justify-center gap-2"
                  >
                    <Mail className="w-4 h-4 text-amber-400" /> Receber código de acesso por e-mail
                  </button>
                </>
              )}
            </form>
          )}

          {mode === 'CODE' && (
            <form onSubmit={handleCodeLogin} className="space-y-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
              {emailField}
              {codeSent && codeField}
              <button type="submit" disabled={loading} className={primaryBtn}>
                <span className="inline-flex items-center gap-2">
                  {codeSent ? <ShieldCheck className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                  {loading ? 'Aguarde...' : codeSent ? 'Entrar com o código' : 'Enviar código'}
                </span>
              </button>
              {codeSent && (
                <button type="button" onClick={() => switchMode('CODE')} className={linkBtn}>
                  Usar outro e-mail
                </button>
              )}
            </form>
          )}

          {mode === 'RESET' && (
            <form onSubmit={handleResetPassword} className="space-y-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
              {emailField}
              {codeSent && (
                <>
                  {codeField}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nova senha (mínimo 6 caracteres)</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Confirmar nova senha</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </>
              )}
              <button type="submit" disabled={loading} className={primaryBtn}>
                <span className="inline-flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  {loading ? 'Aguarde...' : codeSent ? 'Salvar nova senha' : 'Enviar código de recuperação'}
                </span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
