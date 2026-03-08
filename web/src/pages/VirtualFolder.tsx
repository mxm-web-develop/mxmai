import { useAuth } from '../context/AuthContext';

export default function VirtualFolder() {
  const { isLoggedIn } = useAuth();

  return (
    <section className="page-card">
      <h2>虚拟文件夹</h2>
      <p className="hint">
        虚拟文件夹功能：管理或展示按文件夹组织的资源（与 mobile 端文件夹能力对应）。
      </p>
      {!isLoggedIn ? (
        <p className="muted">请先登录。</p>
      ) : (
        <p className="muted">功能开发中，敬请期待。</p>
      )}
    </section>
  );
}
