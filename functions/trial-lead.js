// ═══════════════════════════════════════════════════════════════════
// Vertex Risk — Captura de lead do trial grátis
// ═══════════════════════════════════════════════════════════════════
//
// O QUE ESSA FUNÇÃO FAZ:
//   1. Recebe nome + e-mail de quem pediu o trial grátis no site
//   2. Envia um e-mail pro VISITANTE, com o link de download + o guia
//      de onboarding + instruções de ativação (opção [T] no ativador)
//   3. Envia um e-mail simples pro Arthur, avisando quem baixou
//      (com nome e e-mail reais, não mais anônimo)
//
// CONFIGURAÇÃO NECESSÁRIA (Netlify → Site settings → Environment variables):
//   RESEND_API_KEY   -> Chave de API do Resend (resend.com, plano grátis)
//   DOWNLOAD_LINK    -> Link de download do VertexRisk_Setup.exe
//   NOTIFY_EMAIL     -> vertexrisk@gmail.com (ou o e-mail que quiser)
//
// O guia de onboarding precisa estar publicado no site em:
//   https://vertexrisk.com.br/Vertex_Risk_Guia_Onboarding.docx
// (basta subir o arquivo .docx junto com o index.html, termos.html etc.
//  no mesmo deploy do Netlify — sem pasta especial, direto na raiz)
// ═══════════════════════════════════════════════════════════════════

async function enviarEmail({ to, subject, html }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Vertex Risk <contato@vertexrisk.com.br>',
      to,
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const erro = await resp.text();
    throw new Error(`Erro ao enviar e-mail: ${erro}`);
  }
}

function emailBoasVindas(nome) {
  const linkGuia = 'https://vertexrisk.com.br/Vertex_Risk_Guia_Onboarding.docx';
  return `
    <div style="font-family:Arial,sans-serif;background:#F7F8F4;padding:40px 20px;">
      <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DCE1D8;border-radius:8px;overflow:hidden;">
        <div style="background:#0F3D24;padding:28px 36px;">
          <span style="color:#FFFFFF;font-weight:bold;font-size:16px;">VERTEX RISK</span>
        </div>
        <div style="padding:36px;">
          <h1 style="font-family:Georgia,serif;font-size:24px;color:#16201A;margin:0 0 8px;">Seu teste de 15 dias está pronto.</h1>
          <p style="color:#5B655D;font-size:15px;line-height:1.6;">Obrigado pelo interesse, ${nome}! Seguem o instalador e o guia completo pra você começar.</p>

          <p style="text-align:center;margin:28px 0 12px;">
            <a href="${process.env.DOWNLOAD_LINK}" style="background:#1D7346;color:#FFFFFF;font-weight:bold;font-size:14px;text-decoration:none;padding:14px 32px;border-radius:4px;display:inline-block;">Baixar o instalador →</a>
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

          <p style="color:#8B948A;font-size:13px;line-height:1.6;margin:0;">Dúvidas? Responda este e-mail ou chame no WhatsApp — o guia completo (link acima) também cobre configuração do Excel e solução de problemas comuns.</p>
        </div>
      </div>
    </div>`;
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const dados = JSON.parse(event.body);
    const nome = (dados.nome || '').trim();
    const email = (dados.email || '').trim();

    if (!nome || !email || !email.includes('@')) {
      return { statusCode: 400, body: JSON.stringify({ erro: 'Nome e e-mail válidos são obrigatórios.' }) };
    }

    // E-mail pro visitante, com o guia + instruções
    await enviarEmail({
      to: email,
      subject: 'Seu trial Vertex Risk — 15 dias grátis',
      html: emailBoasVindas(nome),
    });

    // Aviso simples pro Arthur, com quem baixou
    await enviarEmail({
      to: process.env.NOTIFY_EMAIL,
      subject: `Novo trial: ${nome}`,
      html: `<p>${nome} (${email}) acabou de solicitar o trial de 15 dias.</p>`,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, downloadLink: process.env.DOWNLOAD_LINK }),
    };
  } catch (erro) {
    console.error('Erro na captura de trial:', erro);
    return { statusCode: 500, body: JSON.stringify({ erro: erro.message }) };
  }
};
