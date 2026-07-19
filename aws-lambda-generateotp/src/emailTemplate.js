const BRAND = {
  primary: "#5856EB",
  accent: "#7c4dff",
  bg: "#f5f7ff",
  text: "#1f2937",
  muted: "#6b7280",
};

function wrapEmail({ title, preheader, bodyHtml, ctaUrl, ctaLabel, footerEmail }) {
  const safeEmail = (footerEmail || "").trim().toLowerCase();
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#f3f4f6; font-family:'Segoe UI',Arial,sans-serif; color:${BRAND.text}; }
    .wrap { max-width:560px; margin:0 auto; padding:24px 16px; }
    .card { background:#fff; border-radius:20px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,.08); border:1px solid #e5e7eb; }
    .hero { background:linear-gradient(135deg, ${BRAND.primary}, #8b5cf6); color:#fff; padding:28px 24px; text-align:center; }
    .hero h1 { margin:0; font-size:28px; font-weight:800; letter-spacing:-.02em; }
    .hero p { margin:8px 0 0; opacity:.92; font-size:14px; }
    .content { padding:28px 24px; }
    .content h2 { margin:0 0 12px; font-size:22px; }
    .content p { margin:0 0 14px; line-height:1.6; color:${BRAND.muted}; font-size:15px; }
    .btn { display:inline-block; margin:18px 0 8px; padding:14px 28px; border-radius:999px; background:${BRAND.primary}; color:#fff !important; text-decoration:none; font-weight:700; font-size:15px; }
    .note { font-size:12px; color:#9ca3af; margin-top:16px; }
    .footer { padding:18px 24px 24px; text-align:center; font-size:12px; color:#9ca3af; background:#fafafa; }
    .footer a { color:${BRAND.primary}; text-decoration:none; }
    .pill { display:inline-block; padding:6px 12px; border-radius:999px; background:${BRAND.bg}; color:${BRAND.primary}; font-size:12px; font-weight:700; margin-bottom:12px; }
  </style>
</head>
<body>
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;">${preheader || title}</span>
  <div class="wrap">
    <div class="card">
      <div class="hero">
        <h1>Do<span style="opacity:.85">•</span>events</h1>
        <p>Tu comunidad de eventos cerca de ti</p>
      </div>
      <div class="content">
        ${bodyHtml}
        ${ctaUrl ? `<a class="btn" href="${ctaUrl}" target="_blank" rel="noopener">${ctaLabel || "Continuar"}</a>` : ""}
      </div>
      <div class="footer">
        <p>Este correo fue enviado a ${safeEmail || "tu cuenta"}.</p>
        <p>¿Necesitas ayuda? <a href="mailto:support@doeventsapp.com">support@doeventsapp.com</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildOtpEmail(email, otp, minutes) {
  return wrapEmail({
    title: "Código de verificación DoEvents",
    preheader: `Tu código DoEvents es ${otp}`,
    footerEmail: email,
    bodyHtml: `
      <span class="pill">Verificación</span>
      <h2>Confirma tu identidad</h2>
      <p>Usa este código para continuar en DoEvents. Válido por ${minutes} minutos.</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:.24em;color:${BRAND.primary};background:${BRAND.bg};padding:16px;border-radius:16px;text-align:center;">${otp}</div>
    `,
  });
}

function buildActivationEmail(email, link) {
  return wrapEmail({
    title: "Activa tu cuenta DoEvents",
    preheader: "Confirma tu correo para empezar a descubrir eventos",
    footerEmail: email,
    ctaUrl: link,
    ctaLabel: "Activar mi cuenta",
    bodyHtml: `
      <span class="pill">Bienvenido</span>
      <h2>Activa tu cuenta</h2>
      <p>Gracias por unirte a DoEvents. Confirma tu correo para configurar tus gustos y empezar a descubrir eventos cerca de ti.</p>
      <p class="note">Si no creaste esta cuenta, ignora este mensaje.</p>
    `,
  });
}

function buildResetPasswordEmail(email, link) {
  return wrapEmail({
    title: "Restablecer contraseña DoEvents",
    preheader: "Solicitud de cambio de contraseña",
    footerEmail: email,
    ctaUrl: link,
    ctaLabel: "Crear nueva contraseña",
    bodyHtml: `
      <span class="pill">Seguridad</span>
      <h2>Restablece tu contraseña</h2>
      <p>Recibimos una solicitud para cambiar la contraseña de tu cuenta. El enlace expira en 60 minutos.</p>
      <p class="note">Si no solicitaste este cambio, puedes ignorar este correo.</p>
    `,
  });
}

module.exports = {
  buildOtpEmail,
  buildActivationEmail,
  buildResetPasswordEmail,
};
