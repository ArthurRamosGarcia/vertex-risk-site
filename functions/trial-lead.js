// ═══════════════════════════════════════════════════════════════════
// Vertex Risk — Captura de lead do trial grátis (versão Cloudflare Pages)
// ═══════════════════════════════════════════════════════════════════
//
// Mesma lógica da versão Netlify, só que na sintaxe própria da
// Cloudflare (Pages Functions). Fica em functions/trial-lead.js na
// raiz do projeto — isso sozinho já cria a rota /trial-lead
// automaticamente, sem precisar de configuração extra.
//
// CONFIGURAÇÃO NECESSÁRIA (painel Cloudflare Pages → Settings →
// Environment variables):
//   RESEND_API_KEY   -> Chave de API do Resend
//   DOWNLOAD_LINK    -> Link do instalador (agora no Cloudflare R2)
//   NOTIFY_EMAIL     -> vertexrisk@gmail.com
// ═══════════════════════════════════════════════════════════════════

export async function onRequestPost(context) {
  // Captura QUALQUER erro possível, em qualquer ponto — inclusive
  // problemas ao ler o context/request, que ficariam fora de um
  // try/catch mais restrito. Isso garante que a resposta SEMPRE seja
  // um JSON válido, mesmo em caso de falha, com detalhes do que
  // aconteceu — assim dá pra diagnosticar direto pela aba Network do
  // navegador, sem precisar dos logs em tempo real da Cloudflare.
  try {
    const { request, env } = context;

    if (!env || !env.RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ erro: 'RESEND_API_KEY não configurada nas variáveis de ambiente.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (!env.DOWNLOAD_LINK) {
      return new Response(
        JSON.stringify({ erro: 'DOWNLOAD_LINK não configurada nas variáveis de ambiente.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (!env.NOTIFY_EMAIL) {
      return new Response(
        JSON.stringify({ erro: 'NOTIFY_EMAIL não configurada nas variáveis de ambiente.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let dados;
    try {
      dados = await request.json();
    } catch (erroJson) {
      return new Response(
        JSON.stringify({ erro: 'Corpo da requisição não é um JSON válido: ' + erroJson.message }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const nome = (dados.nome || '').trim();
    const email = (dados.email || '').trim();

    if (!nome || !email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ erro: 'Nome e e-mail válidos são obrigatórios.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const linkGuia = 'https://vertexrisk.com.br/Vertex_Risk_Guia_Onboarding.docx';
    const htmlVisitante = `
      <div style="font-family:Arial,sans-serif;background:#F7F8F4;padding:40px 20px;">
        <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DCE1D8;border-radius:8px;overflow:hidden;">
          <div style="background:#0F3D24;padding:28px 36px;">
            <span style="color:#FFFFFF;font-weight:bold;font-size:16px;">VERTEX RISK</span>
          </div>
          <div style="padding:36px;">
            <h1 style="font-family:Georgia,serif;font-size:24px;color:#16201A;margin:0 0 8px;">Seu teste de 15 dias está pronto.</h1>
            <p style="color:#5B655D;font-size:15px;line-height:1.6;">Obrigado pelo interesse, ${nome}! Seguem o instalador e o guia completo pra você começar.</p>
            <p style="text-align:center;margin:28px 0 12px;">
              <a href="${env.DOWNLOAD_LINK}" style="background:#1D7346;color:#FFFFFF;font-weight:bold;font-size:14px;text-decoration:none;padding:14px 32px;border-radius:4px;display:inline-block;">Baixar o instalador →</a>
            </p>
            <p style="text-align:center;margin:0 0 28px;">
              <a href="${linkGuia}" style="color:#1D7346;font-size:13px;text-decoration:underline;">Baixar o Guia de Onboarding completo (Word)</a>
            </p>
            <div style="background:#F7F8F4;border:1px solid #DCE1D8;border-radius:6px;padding:20px 24px;margin-bottom:24px;">
              <p style="font-family:monospace;font-size:11px;color:#8B948A;margin:0 0 10px;">COMO ATIVAR O TRIAL</p>
              <ol style="color:#16201A;font-size:14px;line-height:1.8;margin:0;padding-left:18px;">
                <li>Execute o instalador baixado acima</li>
                <li>Ao final, o ativador abre sozinho</li>
                <li>Escolha a opção <strong>[T] — Testar grátis por 15 dias</strong></li>
                <li>Pronto — sem precisar de chave nem cartão de crédito</li>
              </ol>
            </div>
            <p style="color:#8B948A;font-size:13px;line-height:1.6;margin:0;">Dúvidas? Responda este e-mail ou chame no WhatsApp.</p>
          </div>
        </div>
      </div>`;

    async function enviar(to, subject, html) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: 'Vertex Risk <contato@vertexrisk.com.br>', to, subject, html }),
      });
      const corpoResposta = await resp.text();
      if (!resp.ok) {
        throw new Error(`Resend recusou o envio (status ${resp.status}): ${corpoResposta}`);
      }
      return corpoResposta;
    }

    try {
      await enviar(email, 'Seu trial Vertex Risk — 15 dias grátis', htmlVisitante);
    } catch (erroEnvio) {
      return new Response(
        JSON.stringify({ erro: 'Falha ao enviar e-mail pro visitante: ' + erroEnvio.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      await enviar(env.NOTIFY_EMAIL, `Novo trial: ${nome}`, `<p>${nome} (${email}) acabou de solicitar o trial de 15 dias.</p>`);
    } catch (erroNotify) {
      // Não bloqueia o sucesso pro visitante se só a notificação interna falhar
      console.error('Falha ao notificar Arthur:', erroNotify.message);
    }

    return new Response(
      JSON.stringify({ ok: true, downloadLink: env.DOWNLOAD_LINK }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (erroGeral) {
    return new Response(
      JSON.stringify({ erro: 'Erro inesperado na função: ' + (erroGeral && erroGeral.message ? erroGeral.message : String(erroGeral)) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

"Melhora tratamento de erro"
