import nodemailer from 'nodemailer';
import { db } from './pg-db.js';

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    // Development fallback: creates a simulated Ethereal test account or local logger
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log(`[Email] Configured Ethereal test account: ${testAccount.user}`);
    } catch {
      transporter = {
        sendMail: async (opts) => {
          console.log(`[Email-Simulated] To: ${opts.to} | Subject: ${opts.subject}`);
          return { messageId: 'simulated_' + Date.now() };
        }
      };
    }
  }

  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  try {
    const t = await getTransporter();
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM || '"OTTM Connect" <no-reply@ottmconnect.com>',
      to,
      subject,
      html: html || text,
      text: text || ''
    });

    console.log(`[Email] Sent to ${to} (${subject}): ${info.messageId}`);

    // Log email activity in entity_activitylog
    try {
      await db.create('ActivityLog', {
        action: 'email_sent',
        description: `Email sent to ${to}: ${subject}`,
        entity_type: 'Email',
        entity_id: info.messageId,
        metadata: { to, subject }
      });
    } catch {}

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.warn(`[Email] Failed to send email to ${to}:`, err.message);
    return { ok: false, error: err.message };
  }
}
