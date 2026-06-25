import nodemailer from "nodemailer";
import { config, isDev } from "../config.js";
import { logger } from "./logger.js";

let transporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  if (isDev && !config.email.host) {
    // Use Ethereal for dev — emails are captured but not actually sent
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    logger.info(`📧 Using Ethereal test email account: ${testAccount.user}`);
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });

  return transporter;
}

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(options: SendMailOptions): Promise<void> {
  const transport = await getTransporter();

  const info = await transport.sendMail({
    from: config.email.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  if (isDev) {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`📧 Preview email: ${previewUrl}`);
    }
  }
}

export async function sendPasswordResetEmail(to: string, name: string, resetToken: string): Promise<void> {
  const resetUrl = `${config.client.url}/reset-password?token=${resetToken}`;

  await sendMail({
    to,
    subject: "Reset your Lumen Suite password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a;">Password Reset</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your password. Click the button below to set a new one:</p>
        <a href="${resetUrl}" style="display: inline-block; background: #0f766e; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">Lumen Suite ERP</p>
      </div>
    `,
  });
}
