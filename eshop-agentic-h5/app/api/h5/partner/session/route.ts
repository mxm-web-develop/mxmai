import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** H5 已禁用匿名 Partner 会话，须短信登录 */
export async function POST() {
  return NextResponse.json(
    { success: false, error: '请先手机号登录', code: 'ANONYMOUS_DISABLED' },
    { status: 403 }
  );
}
