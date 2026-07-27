'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, Phone, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isValidCnPhone, loginWithSms, sendSmsCode, storePartnerInviteToken, getStoredPartnerInviteToken } from '@/lib/partner-session';

const COOLDOWN_SEC = 60;

function CooldownRing({ progress }: { progress: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  return (
    <svg
      className="absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] -rotate-90"
      viewBox="0 0 40 40"
      aria-hidden
    >
      <circle cx="20" cy="20" r={r} fill="none" className="progress-ring-track" strokeWidth="2.5" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        className="progress-ring-fill"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

function LoginButton({
  className,
  disabled,
  loading,
  children,
  onClick,
  ...props
}: React.ComponentProps<'button'> & { loading?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn('pressable relative', className)}
      onClick={onClick}
      {...props}
    >
      {children}
      {loading && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/[0.06]">
          <Loader2 size={18} className="animate-spin text-accent" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}

export default function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');

  const formCardRef = useRef<HTMLElement>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(true);
  const [shakeForm, setShakeForm] = useState(false);
  const [hasInvite, setHasInvite] = useState(false);

  const phoneOk = isValidCnPhone(phone);
  const canSendSms = phoneOk && cooldown === 0 && !sending;
  const canSubmit = phoneOk && code.length >= 4 && agreed && !submitting;

  useEffect(
    () => () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const invite = searchParams.get('invite')?.trim();
    if (invite) {
      storePartnerInviteToken(invite);
      setHasInvite(true);
    } else {
      setHasInvite(!!getStoredPartnerInviteToken());
    }
  }, [searchParams]);

  useEffect(() => {
    if (!error) return;
    setShakeForm(true);
    const t = setTimeout(() => setShakeForm(false), 450);
    return () => clearTimeout(t);
  }, [error]);

  const startCooldown = useCallback(() => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    setCooldown(COOLDOWN_SEC);
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  const handleSend = async () => {
    if (!phoneOk) {
      setError('请输入正确的 11 位手机号');
      return;
    }
    setError(null);
    setHint(null);
    setSending(true);
    try {
      const res = await sendSmsCode(phone.trim());
      setHint(
        res.debugCode
          ? `开发模式验证码：${res.debugCode}`
          : `验证码已发送至 ${res.phoneMasked ?? '您的手机'}`
      );
      startCooldown();
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  const handleLogin = async () => {
    if (!phoneOk) {
      setError('请输入正确的 11 位手机号');
      return;
    }
    if (!agreed) {
      setError('请先阅读并同意用户协议与隐私政策');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await loginWithSms(phone.trim(), code.trim());
      const { resetOpenApiAdapter } = await import('@/adapters');
      resetOpenApiAdapter();
      const dest =
        nextPath && nextPath.startsWith('/') && !nextPath.startsWith('/login') ? nextPath : '/';
      router.replace(dest);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  const cooldownProgress = cooldown > 0 ? (COOLDOWN_SEC - cooldown) / COOLDOWN_SEC : 0;

  return (
    <div className="login-page safe-top flex min-h-dvh flex-col px-4 pb-10 pt-6">
      <section className="login-hero login-enter-hero relative mb-6 overflow-hidden rounded-[1.75rem] border border-border/70 px-5 py-7 shadow-[var(--shadow-card)]">
        <div className="pointer-events-none absolute -right-6 -top-10 h-36 w-36 rounded-full bg-accent/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-8 left-1/4 h-28 w-28 rounded-full bg-[rgba(232,160,180,0.25)] blur-2xl" />

        <div className="relative flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-sm ring-1 ring-border/50">
            <img src="/brand/grid-icon.svg" alt="" width={36} height={36} className="h-9 w-9" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="chip bg-accent-soft text-accent">
              <Sparkles size={12} className="mr-1 inline" aria-hidden />
              安全登录
            </p>
            <h1 className="mt-2 font-display text-[1.65rem] font-semibold leading-tight text-text text-balance">
              手机号验证
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              登录后商拍项目将同步至云端，换设备也能继续创作。
            </p>
          </div>
        </div>
      </section>

      <section
        ref={formCardRef}
        className={cn('card login-enter-card flex flex-1 flex-col gap-5 p-5', shakeForm && 'login-shake')}
        aria-labelledby="login-form-title"
      >
        <h2 id="login-form-title" className="sr-only">
          短信验证码登录
        </h2>

        {hasInvite && (
          <p className="rounded-xl border border-accent/30 bg-accent-soft/40 px-3 py-2 text-sm text-accent">
            您正在通过邀请链接访问，验证通过后将自动获得访问权限。
          </p>
        )}

        <div data-login-field className="login-enter-field space-y-2">
          <label htmlFor="login-phone" className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
            <Phone size={15} className="text-accent" aria-hidden />
            手机号
          </label>
          <div
            className={cn(
              'flex overflow-hidden rounded-2xl border bg-surface transition-shadow',
              phoneOk && phone.length >= 11
                ? 'border-accent/40 ring-2 ring-accent/10'
                : 'border-border focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20'
            )}
          >
            <span className="flex shrink-0 items-center border-r border-border bg-surface-muted/50 px-3.5 text-sm font-medium text-text-secondary">
              +86
            </span>
            <input
              id="login-phone"
              type="tel"
              inputMode="numeric"
              className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-[15px] tracking-wide text-text outline-none placeholder:text-text-muted"
              placeholder="11 位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\s/g, ''))}
              autoComplete="tel"
              maxLength={13}
              autoFocus
            />
          </div>
        </div>

        <div data-login-field className="login-enter-field space-y-2">
          <label htmlFor="login-code" className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
            <ShieldCheck size={15} className="text-accent" aria-hidden />
            验证码
          </label>
          <div className="flex gap-2.5">
            <input
              id="login-code"
              type="text"
              inputMode="numeric"
              className={cn(
                'input-field min-w-0 flex-1 font-mono text-[17px] tracking-[0.28em]',
                code.length >= 4 && 'border-accent/40 ring-2 ring-accent/10'
              )}
              placeholder="······"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              autoComplete="one-time-code"
            />
            <div className="relative shrink-0">
              {cooldown > 0 && <CooldownRing progress={cooldownProgress} />}
              <LoginButton
                className={cn(
                  'btn-secondary relative z-[1] min-w-[7.5rem] px-3 py-3 text-[13px]',
                  cooldown > 0 && 'text-text-muted'
                )}
                disabled={!canSendSms}
                loading={sending}
                onClick={() => void handleSend()}
              >
                {cooldown > 0 ? `${cooldown}s` : '获取验证码'}
              </LoginButton>
            </div>
          </div>
        </div>

        <label
          data-login-field
          className="login-enter-field flex cursor-pointer items-start gap-2.5 rounded-xl bg-surface-muted/40 px-3 py-2.5 text-xs leading-relaxed text-text-secondary"
        >
          <input
            type="checkbox"
            className="login-checkbox mt-0.5"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            登录即表示同意
            <Link href="/settings" className="mx-0.5 font-medium text-accent underline-offset-2 hover:underline">
              服务条款
            </Link>
            与隐私政策，验证码仅用于身份验证。
          </span>
        </label>

        {hint && (
          <div
            role="status"
            className="login-fade-in flex items-start gap-2 rounded-xl border border-success/25 bg-success-soft/80 px-3 py-2.5 text-xs text-success"
          >
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{hint}</span>
          </div>
        )}

        {error && (
          <p role="alert" className="login-fade-in rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        <LoginButton
          data-login-field
          className="login-enter-field btn-primary mt-auto"
          disabled={!canSubmit}
          loading={submitting}
          onClick={() => void handleLogin()}
        >
          {submitting ? '登录中…' : '登录并进入'}
        </LoginButton>
      </section>

      <p className="mt-5 text-center text-xs leading-relaxed text-text-muted">
        须验证手机号后方可使用本平台
        <br />
        项目将安全保存至您的账户
      </p>
    </div>
  );
}
