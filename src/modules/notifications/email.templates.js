/**
 * Email bodies, as plain text and HTML.
 *
 * One registry keyed by the same template names the notification service
 * already passes around, so adding an email is adding an entry here rather
 * than threading copy through a call site.
 *
 * Every interpolated value is HTML-escaped. A customer's own name reaches these
 * templates from a signup form, so `<script>` in a full name must not become
 * live markup in a mail client — and the same escaping protects against a name
 * chosen to impersonate the rest of the message.
 */

function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  /**
   * A plain, single-column layout.
   *
   * No images, no external CSS, no web fonts: a transactional mail has to be
   * readable with images blocked, which is the default in a good many clients,
   * and a password-reset code is the last thing that should depend on a remote
   * asset loading.
   */
  function wrap({ heading, bodyHtml }) {
    return `<!doctype html>
  <html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e1;padding:32px;">
      <p style="margin:0 0 24px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#6b6b66;">vaapsi</p>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;line-height:1.3;">${escapeHtml(heading)}</h1>
      ${bodyHtml}
    </div>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#8a8a85;">
      Sent by Vaapsi. If this was not you, no action is needed.
    </p>
  </body>
  </html>`;
  }
  
  /** The code itself — large, spaced, and selectable as one token. */
  function codeBlock(code) {
    return `<p style="margin:0 0 24px;padding:16px;background:#f6f6f4;border:1px solid #e5e5e1;font-size:28px;font-weight:600;letter-spacing:0.18em;text-align:center;font-variant-numeric:tabular-nums;">${escapeHtml(
      code,
    )}</p>`;
  }
  
  const templates = {
    /**
     * The password-reset code.
     *
     * Says what to do, how long it lasts, and what to do if it was not them.
     * It carries **no reset link** — only a code the customer types back into a
     * page they opened themselves. A clickable link in a reset mail is the single
     * most phished pattern in existence, and a code cannot be turned into one.
     */
    password_reset_otp: ({ code, minutes, name }) => ({
      subject: 'Your Vaapsi password reset code',
      text: [
        name ? `Hi ${name},` : 'Hi,',
        '',
        `Your password reset code is ${code}`,
        '',
        `It expires in ${minutes} minutes and can be used once.`,
        '',
        'Type it into the page you started the reset from. We will never ask you for this code by phone, chat or email reply.',
        '',
        'If you did not ask to reset your password, you can ignore this message — your password has not changed.',
      ].join('\n'),
      html: wrap({
        heading: 'Your password reset code',
        bodyHtml: `
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${
            name ? `Hi ${escapeHtml(name)},` : 'Hi,'
          } use this code to set a new password.</p>
          ${codeBlock(code)}
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4a4a45;">
            It expires in ${escapeHtml(minutes)} minutes and can be used once. Type it into the page you
            started the reset from &mdash; we will never ask you for it by phone, chat or email reply.
          </p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#6b6b66;">
            If you did not ask to reset your password, ignore this message. Your password has not changed.
          </p>`,
      }),
    }),
  
    /**
     * Sent after a successful reset.
     *
     * This is the one that catches an account takeover: if someone else reset the
     * password, this mail is the owner's only signal, so it goes out even though
     * nothing is being asked of the reader.
     */
    password_changed: ({ name, when }) => ({
      subject: 'Your Vaapsi password was changed',
      text: [
        name ? `Hi ${name},` : 'Hi,',
        '',
        `Your Vaapsi password was changed${when ? ` on ${when}` : ''}.`,
        '',
        'You have been signed out everywhere else as a precaution.',
        '',
        'If this was not you, reset your password immediately and contact us.',
      ].join('\n'),
      html: wrap({
        heading: 'Your password was changed',
        bodyHtml: `
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${
            name ? `Hi ${escapeHtml(name)},` : 'Hi,'
          } your Vaapsi password was changed${when ? ` on ${escapeHtml(when)}` : ''}.</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#4a4a45;">
            You have been signed out on every other device as a precaution.
          </p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#6b6b66;">
            If this was not you, reset your password immediately and get in touch.
          </p>`,
      }),
    }),
  
    /** Phone OTP delivered by email, where that is the channel on file. */
    login_otp: ({ code }) => ({
      subject: 'Your Vaapsi sign-in code',
      text: `Your sign-in code is ${code}. It expires in 5 minutes.`,
      html: wrap({
        heading: 'Your sign-in code',
        bodyHtml: `${codeBlock(code)}<p style="margin:0;font-size:14px;color:#6b6b66;">It expires in 5 minutes.</p>`,
      }),
    }),
  
    /**
     * Sent on signup.
     *
     * A welcome, not a gate: nothing in the confirmed scope blocks an account
     * until an address is confirmed, so this must not imply the customer has to
     * act before they can shop.
     */
    verify_email: ({ fullName }) => ({
      subject: 'Welcome to Vaapsi',
      text: [
        fullName ? `Hi ${fullName},` : 'Hi,',
        '',
        'Your Vaapsi account is ready. You can shop, and anything you buy from us can be sent back to be sold on later.',
      ].join('\n'),
      html: wrap({
        heading: 'Your account is ready',
        bodyHtml: `<p style="margin:0;font-size:15px;line-height:1.6;">${
          fullName ? `Hi ${escapeHtml(fullName)},` : 'Hi,'
        } you can shop now &mdash; and anything you buy from us can be sent back to be sold on later.</p>`,
      }),
    }),
  
    order_confirmation: ({ orderId, total, pointsEarned }) => ({
      subject: 'Your Vaapsi order is confirmed',
      text: [
        'Thanks — your order is confirmed.',
        '',
        `Order: ${orderId}`,
        `Paid: ${total}`,
        `Points earned: ${pointsEarned}`,
      ].join('\n'),
      html: wrap({
        heading: 'Your order is confirmed',
        bodyHtml: `
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Thanks &mdash; we have your order.</p>
          <p style="margin:0;font-size:14px;line-height:1.8;color:#4a4a45;">
            Order <strong>${escapeHtml(orderId)}</strong><br>
            Paid ${escapeHtml(total)}<br>
            Points earned ${escapeHtml(pointsEarned)}
          </p>`,
      }),
    }),
  };
  
  /**
   * Render a template, or fall back to something honest.
   *
   * An unknown name is a bug, but dropping the mail silently would hide it. The
   * fallback sends a minimal, readable message and the caller logs the name.
   */
  function renderEmail(template, payload = {}) {
    const build = templates[template];
    if (build === undefined) {
      return {
        subject: 'A message from Vaapsi',
        text: `We tried to send you a notification (${template}) and could not render it. Please get in touch.`,
        html: undefined,
        known: false,
      };
    }
    return { ...build(payload), known: true };
  }
  
  module.exports = { renderEmail, escapeHtml };
  