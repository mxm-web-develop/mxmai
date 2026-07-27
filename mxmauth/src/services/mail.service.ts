/**
 * SMTP 发信（nodemailer，兼容阿里云邮件推送等）
 */

import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { type AppLocale, normalizeAppLocale } from '@mxmai/mxmdata';

export type MailLocale = AppLocale;

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      process.env.MAIL_FROM?.trim()
  );
}

export function isSmtpConfigured(): boolean {
  return smtpConfigured();
}

function getAppPublicUrl(): string {
  return (process.env.APP_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT || 465);
  const secureEnv = process.env.SMTP_SECURE;
  const secure = secureEnv != null ? secureEnv === 'true' || secureEnv === '1' : port === 465;
  const options: SMTPTransport.Options = {
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  };
  return nodemailer.createTransport(options);
}

const VERIFY: Record<
  AppLocale,
  { subject: string; text: (link: string) => string; html: (link: string) => string }
> = {
  en: {
    subject: 'Verify your MXM AI email',
    text: (link) => `Open this link to verify your email:\n${link}\n\nThis link expires in 24 hours.`,
    html: (link) =>
      `<p>Open this link to verify your email:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
  },
  zh: {
    subject: '验证你的 MXM AI 邮箱',
    text: (link) => `请打开以下链接完成邮箱验证：\n${link}\n\n链接 24 小时内有效。`,
    html: (link) =>
      `<p>请打开以下链接完成邮箱验证：</p><p><a href="${link}">${link}</a></p><p>链接 24 小时内有效。</p>`,
  },
  'zh-TW': {
    subject: '驗證你的 MXM AI 信箱',
    text: (link) => `請開啟以下連結完成信箱驗證：\n${link}\n\n連結 24 小時內有效。`,
    html: (link) =>
      `<p>請開啟以下連結完成信箱驗證：</p><p><a href="${link}">${link}</a></p><p>連結 24 小時內有效。</p>`,
  },
  ja: {
    subject: 'MXM AI メールアドレスの確認',
    text: (link) =>
      `次のリンクを開いてメールアドレスを確認してください：\n${link}\n\nリンクの有効期限は 24 時間です。`,
    html: (link) =>
      `<p>次のリンクを開いてメールアドレスを確認してください：</p><p><a href="${link}">${link}</a></p><p>リンクの有効期限は 24 時間です。</p>`,
  },
};

const RESET: Record<
  AppLocale,
  { subject: string; text: (link: string) => string; html: (link: string) => string }
> = {
  en: {
    subject: 'Reset your MXM AI password',
    text: (link) =>
      `Open this link to reset your password:\n${link}\n\nThis link expires in 1 hour. If you did not request this, ignore the email.`,
    html: (link) =>
      `<p>Open this link to reset your password:</p><p><a href="${link}">${link}</a></p><p>This link expires in 1 hour. If you did not request this, ignore the email.</p>`,
  },
  zh: {
    subject: '重置你的 MXM AI 密码',
    text: (link) => `请打开以下链接重置密码：\n${link}\n\n链接 1 小时内有效。如非本人操作请忽略。`,
    html: (link) =>
      `<p>请打开以下链接重置密码：</p><p><a href="${link}">${link}</a></p><p>链接 1 小时内有效。如非本人操作请忽略。</p>`,
  },
  'zh-TW': {
    subject: '重設你的 MXM AI 密碼',
    text: (link) => `請開啟以下連結重設密碼：\n${link}\n\n連結 1 小時內有效。如非本人操作請忽略。`,
    html: (link) =>
      `<p>請開啟以下連結重設密碼：</p><p><a href="${link}">${link}</a></p><p>連結 1 小時內有效。如非本人操作請忽略。</p>`,
  },
  ja: {
    subject: 'MXM AI パスワードのリセット',
    text: (link) =>
      `次のリンクを開いてパスワードをリセットしてください：\n${link}\n\nリンクの有効期限は 1 時間です。心当たりがない場合はこのメールを無視してください。`,
    html: (link) =>
      `<p>次のリンクを開いてパスワードをリセットしてください：</p><p><a href="${link}">${link}</a></p><p>リンクの有効期限は 1 時間です。心当たりがない場合はこのメールを無視してください。</p>`,
  },
};

export class MailService {
  async sendMail(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    if (!smtpConfigured()) {
      console.warn('[MailService] SMTP not configured; skip send to', params.to, params.subject);
      if (process.env.NODE_ENV !== 'production') {
        console.info('[MailService] DEV mail body:\n', params.text);
      }
      const err = new Error('SMTP is not configured');
      (err as Error & { code?: string }).code = 'SMTP_NOT_CONFIGURED';
      throw err;
    }

    const transport = createTransport();
    await transport.sendMail({
      from: process.env.MAIL_FROM!,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
  }

  buildVerifyEmail(params: { token: string; locale?: MailLocale | string }): {
    subject: string;
    html: string;
    text: string;
    link: string;
  } {
    const locale = normalizeAppLocale(params.locale);
    const link = `${getAppPublicUrl()}/?verify_email=${encodeURIComponent(params.token)}`;
    const t = VERIFY[locale];
    return { subject: t.subject, link, text: t.text(link), html: t.html(link) };
  }

  buildResetPassword(params: { token: string; locale?: MailLocale | string }): {
    subject: string;
    html: string;
    text: string;
    link: string;
  } {
    const locale = normalizeAppLocale(params.locale);
    const link = `${getAppPublicUrl()}/?reset_password=${encodeURIComponent(params.token)}`;
    const t = RESET[locale];
    return { subject: t.subject, link, text: t.text(link), html: t.html(link) };
  }
}

export const mailService = new MailService();
