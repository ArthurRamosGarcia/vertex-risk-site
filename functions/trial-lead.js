// ═══════════════════════════════════════════════════════════════════
// Vertex Risk — Trial com CHAVE enviada por e-mail (Cloudflare Pages)
// Arquivo: functions/trial-lead.js  (substitui a versão atual)
//
// Variáveis de ambiente (Settings → Variables and secrets):
//   RESEND_API_KEY   (Secret)
//   LICENSE_SECRET   (Secret) -> MESMO valor do _LICENSE_SECRET do risco.py
//   DOWNLOAD_LINK    -> link do instalador
//   NOTIFY_EMAIL     -> seu e-mail
// Opcional (recomendado): KV namespace ligado como TRIAL_KV
//   -> impede o mesmo e-mail de pedir trial várias vezes.
//   (Pages → Settings → Bindings → KV namespace → Variable name: TRIAL_KV)
// ═══════════════════════════════════════════════════════════════════

const DIAS_TRIAL = 15;
const JSON_HDR = { 'Content-Type': 'application/json' };
const resp = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: JSON_HDR });

// Mesmo formato do gerar_chave_licenca.py / ativador: base64url(payload).base64url(HMAC-SHA256)
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function gerarChaveTrial(secret, email, dias) {
  const hoje = new Date();
  const validade = new Date(hoje.getTime() + dias * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  const payload = {
    cliente: `Trial (${dias} dias) - ${email}`,
    validade: iso(validade),
    machine_id: null,            // trial roda em qualquer PC; ver nota sobre vínculo no documento
    gerado_em: iso(hoje),
  };
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return { chave: `${payloadB64}.${b64url(sig)}`, validade: payload.validade };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    for (const v of ['RESEND_API_KEY', 'LICENSE_SECRET', 'DOWNLOAD_LINK', 'NOTIFY_EMAIL']) {
      if (!env[v]) return resp({ erro: `${v} não configurada nas variáveis de ambiente.` }, 500);
    }

    let dados;
    try { dados = await request.json(); }
    catch (e) { return resp({ erro: 'Corpo da requisição não é um JSON válido.' }, 400); }

    const nome = String(dados.nome || '').trim().slice(0, 120);
    const email = String(dados.email || '').trim().toLowerCase().slice(0, 200);
    if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return resp({ erro: 'Nome e e-mail válidos são obrigatórios.' }, 400);
    }

    // 1 trial por e-mail (só se o KV estiver ligado)
    if (env.TRIAL_KV) {
      const ja = await env.TRIAL_KV.get(`trial:${email}`);
      if (ja) return resp({ erro: 'Este e-mail já recebeu um teste. Fale com a gente pelo WhatsApp para estender.' }, 409);
    }

    const { chave, validade } = await gerarChaveTrial(env.LICENSE_SECRET, email, DIAS_TRIAL);
    const [a, m, d] = validade.split('-');
    const validadeBR = `${d}/${m}/${a}`;
    const linkGuia = 'https://vertexrisk.com.br/Vertex_Risk_Guia_Onboarding.docx';

    const html = `
    <div style="font-family:Arial,sans-serif;background:#F7F8F4;padding:40px 20px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #DCE1D8;border-radius:8px;overflow:hidden;">
        <div style="background:#0F3D24;padding:28px 36px;"><span style="color:#fff;font-weight:bold;font-size:16px;">VERTEX RISK</span></div>
        <div style="padding:36px;">
          <h1 style="font-family:Georgia,serif;font-size:24px;color:#16201A;margin:0 0 8px;">Seu teste de ${DIAS_TRIAL} dias está pronto.</h1>
          <p style="color:#5B655D;font-size:15px;line-height:1.6;">Olá, ${esc(nome)}! Abaixo estão o instalador e a sua chave de teste, válida até <strong>${validadeBR}</strong>.</p>
          <p style="text-align:center;margin:24px 0 8px;"><a href="${esc(env.DOWNLOAD_LINK)}" style="background:#1D7346;color:#fff;font-weight:bold;font-size:14px;text-decoration:none;padding:14px 32px;border-radius:4px;display:inline-block;">Baixar o instalador →</a></p>
          <p style="text-align:center;margin:0 0 24px;"><a href="${linkGuia}" style="color:#1D7346;font-size:13px;">Guia de Onboarding (Word)</a></p>
          <p style="font-family:monospace;font-size:11px;color:#8B948A;margin:0 0 6px;">SUA CHAVE DE TESTE</p>
          <div style="background:#F7F8F4;border:1px solid #DCE1D8;border-radius:6px;padding:14px;font-family:monospace;font-size:12px;word-break:break-all;color:#16201A;">${chave}</div>
          <div style="background:#F7F8F4;border:1px solid #DCE1D8;border-radius:6px;padding:20px 24px;margin:24px 0;">
            <p style="font-family:monospace;font-size:11px;color:#8B948A;margin:0 0 10px;">COMO ATIVAR</p>
            <ol style="color:#16201A;font-size:14px;line-height:1.8;margin:0;padding-left:18px;">
              <li>Execute o instalador</li>
              <li>No ativador, escolha a opção de colar a chave</li>
              <li>Cole a chave acima (inteira, sem espaços) e confirme</li>
            </ol>
          </div>
          <p style="color:#8B948A;font-size:13px;margin:0;">Dúvidas? Responda este e-mail.</p>
        </div>
      </div>
    </div>`;

    const enviar = async (to, subject, body) => {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Vertex Risk <contato@vertexrisk.com.br>', to, subject, html: body }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    };

    try { await enviar(email, `Sua chave de teste Vertex Risk — ${DIAS_TRIAL} dias grátis`, html); }
    catch (e) { return resp({ erro: 'Falha ao enviar e-mail: ' + e.message }, 500); }

    // só marca como usado DEPOIS de enviar com sucesso
    if (env.TRIAL_KV) await env.TRIAL_KV.put(`trial:${email}`, JSON.stringify({ nome, em: new Date().toISOString(), validade }));

    try { await enviar(env.NOTIFY_EMAIL, `Novo trial: ${esc(nome)}`, `<p>${esc(nome)} (${esc(email)}) pediu o trial. Validade: ${validadeBR}.</p>`); }
    catch (e) { console.error('Falha ao notificar:', e.message); }

    // O link do instalador continua na resposta (o site usa no botão "Baixar agora").
    // A CHAVE nunca vai no JSON: só por e-mail, o que confirma que o e-mail é real.
    return resp({ ok: true, downloadLink: env.DOWNLOAD_LINK });
  } catch (e) {
    return resp({ erro: 'Erro inesperado: ' + (e && e.message ? e.message : String(e)) }, 500);
  }
}

