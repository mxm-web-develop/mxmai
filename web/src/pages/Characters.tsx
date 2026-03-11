import { useState, useEffect, useCallback, useRef } from 'react';
import { Drawer, notification } from 'antd';
import {
  listCharacters,
  getCharacter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  linkCharacterImageTask,
  uploadAssets,
  type CharacterItem,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AuthImage } from '../components/AuthImage';
import { normalizeUrl, toRelativeMediaUrl } from '../utils/url';

function resolveAvatarUrl(c: CharacterItem): string | null {
  const mediaUrls = c.mediaUrls as { avatar?: string } | undefined;
  if (mediaUrls?.avatar) return toRelativeMediaUrl(normalizeUrl(mediaUrls.avatar) || mediaUrls.avatar);
  const appearanceImgs = c.appearance?.reference_images;
  const clothingImgs = c.clothing_style?.reference_images;
  const raw =
    (appearanceImgs?.length ? appearanceImgs[0] : undefined) ??
    (clothingImgs?.length ? clothingImgs[0] : undefined);
  if (!raw) return null;
  const url = normalizeUrl(raw) || raw;
  const withSlash = url.startsWith('http') ? url : url.startsWith('/') ? url : `/${url}`;
  return toRelativeMediaUrl(withSlash);
}

export default function Characters() {
  const { isLoggedIn } = useAuth();
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    nickname: '',
    age: '',
    description: '',
    appearanceDesc: '',
    clothingDesc: '',
    voiceDesc: '',
    personality: '',
    background: '',
    category: '',
    tags: '',
    appearanceRefImages: [] as string[],
    clothingRefImages: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [linkTaskId, setLinkTaskId] = useState('');
  const [linkImageType, setLinkImageType] = useState<'appearance' | 'clothing_style'>('appearance');
  const [linking, setLinking] = useState(false);
  const [linkResult, setLinkResult] = useState('');
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editCharacterId, setEditCharacterId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    nickname: '',
    age: '',
    description: '',
    appearanceDesc: '',
    clothingDesc: '',
    voiceDesc: '',
    personality: '',
    background: '',
    category: '',
    tags: '',
    appearanceRefImages: [] as string[],
    clothingRefImages: [] as string[],
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editSaveResult, setEditSaveResult] = useState('');

  const [viewJsonOpen, setViewJsonOpen] = useState(false);
  const [viewJsonData, setViewJsonData] = useState<string>('');

  const loadCharacters = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const res = await listCharacters({
        is_public: false,
        page: 1,
        limit: 100,
      });
      const body = res.data as { data?: { characters?: CharacterItem[] } } | undefined;
      const list = body?.data?.characters ?? [];
      setCharacters(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('加载角色失败:', e);
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  const resetForm = () => {
    setFormData({
      name: '',
      nickname: '',
      age: '',
      description: '',
      appearanceDesc: '',
      clothingDesc: '',
      voiceDesc: '',
      personality: '',
      background: '',
      category: '',
      tags: '',
      appearanceRefImages: [],
      clothingRefImages: [],
    });
    setSaveResult('');
  };

  const handleEdit = async (c: CharacterItem) => {
    setEditCharacterId(c.id);
    setEditSaveResult('');
    setEditModalOpen(true);
    try {
      const res = await getCharacter(c.id);
      const body = res.data as Record<string, unknown> | undefined;
      const data = (body?.data ?? body) as CharacterItem | undefined;
      if (data) {
        setEditFormData({
          name: data.name || '',
          nickname: data.nickname || '',
          age: data.age != null ? String(data.age) : '',
          description: (data.description as string) || '',
          appearanceDesc: data.appearance?.description || '',
          clothingDesc: data.clothing_style?.description || '',
          voiceDesc:
            data.voice?.description ||
            (data.voice?.voice_example as string) ||
            '',
          personality: (data.others?.personality as string) || '',
          background: (data.others?.background as string) || '',
          category: Array.isArray(data.category) ? data.category.join(', ') : '',
          tags: Array.isArray(data.tags) ? data.tags.join(', ') : '',
          appearanceRefImages: data.appearance?.reference_images?.slice() ?? [],
          clothingRefImages: data.clothing_style?.reference_images?.slice() ?? [],
        });
      }
    } catch (e) {
      setEditSaveResult(e instanceof Error ? e.message : '加载失败');
    }
  };

  const handleViewJson = (c: CharacterItem) => {
    setViewJsonData(JSON.stringify(c, null, 2));
    setViewJsonOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCharacterId || !isLoggedIn) return;
    if (!editFormData.name.trim()) {
      setEditSaveResult('请输入角色名称');
      return;
    }
    setEditSaving(true);
    setEditSaveResult('');
    try {
      const appearance = {
        description: editFormData.appearanceDesc.trim() || undefined,
        reference_images: editFormData.appearanceRefImages,
      };
      const clothing_style = {
        description: editFormData.clothingDesc.trim() || undefined,
        reference_images: editFormData.clothingRefImages,
      };
      const body: Record<string, unknown> = {
        name: editFormData.name.trim(),
        nickname: editFormData.nickname.trim() || undefined,
        age: editFormData.age.trim() ? (isNaN(Number(editFormData.age)) ? editFormData.age : Number(editFormData.age)) : undefined,
        description: editFormData.description.trim() || undefined,
        appearance,
        clothing_style,
        voice: editFormData.voiceDesc.trim() ? { description: editFormData.voiceDesc.trim() } : undefined,
        others: {
          ...(editFormData.personality.trim() && { personality: editFormData.personality.trim() }),
          ...(editFormData.background.trim() && { background: editFormData.background.trim() }),
        },
        category: editFormData.category.trim()
          ? editFormData.category.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
          : undefined,
        tags: editFormData.tags.trim()
          ? editFormData.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
          : undefined,
        is_public: false,
      };
      if (Object.keys(body.others as object).length === 0) delete body.others;

      const res = await updateCharacter(editCharacterId, body);
      const err = (res as { error?: string }).error;
      if (err) {
        setEditSaveResult(err);
      } else {
        setEditSaveResult('保存成功');
        loadCharacters();
        setTimeout(() => {
          setEditModalOpen(false);
        }, 500);
      }
    } catch (err) {
      setEditSaveResult(err instanceof Error ? err.message : String(err));
    } finally {
      setEditSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      setSaveResult('请先登录');
      return;
    }
    if (!formData.name.trim()) {
      setSaveResult('请输入角色名称');
      return;
    }
    setSaving(true);
    setSaveResult('');
    try {
      // 编辑时始终传 appearance/clothing_style，以便能清空参考图
      const appearance =
        formData.appearanceDesc.trim() || formData.appearanceRefImages.length > 0
          ? {
              description: formData.appearanceDesc.trim() || undefined,
              reference_images: formData.appearanceRefImages,
            }
          : undefined;

      const clothing_style =
        formData.clothingDesc.trim() || formData.clothingRefImages.length > 0
          ? {
              description: formData.clothingDesc.trim() || undefined,
              reference_images: formData.clothingRefImages,
            }
          : undefined;

      const body: Record<string, unknown> = {
        name: formData.name.trim(),
        nickname: formData.nickname.trim() || undefined,
        age: formData.age.trim() ? (isNaN(Number(formData.age)) ? formData.age : Number(formData.age)) : undefined,
        description: formData.description.trim() || undefined,
        appearance,
        clothing_style,
        voice: formData.voiceDesc.trim()
          ? { description: formData.voiceDesc.trim() }
          : undefined,
        others: {
          ...(formData.personality.trim() && { personality: formData.personality.trim() }),
          ...(formData.background.trim() && { background: formData.background.trim() }),
        },
        category: formData.category.trim()
          ? formData.category.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
          : undefined,
        tags: formData.tags.trim()
          ? formData.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
          : undefined,
        is_public: false,
      };
      if (Object.keys(body.others as object).length === 0) delete body.others;

      const res = await createCharacter(body);
      const err = (res as { error?: string }).error;
      if (err) {
        setSaveResult(err);
      } else {
        setSaveResult('创建成功');
        notification.success({
          message: '角色已创建',
          description: formData.name.trim(),
          placement: 'top',
        });
        resetForm();
        loadCharacters();
        setCreateDrawerOpen(false);
      }
    } catch (err) {
      setSaveResult(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: CharacterItem) => {
    if (!window.confirm(`确定删除角色「${c.name}」吗？此操作不可恢复。`)) return;
    setDeletingId(c.id);
    try {
      const res = await deleteCharacter(c.id);
      const err = (res as { error?: string }).error;
      if (err) {
        alert(err);
      } else {
        notification.success({
          message: '角色已删除',
          description: c.name,
          placement: 'top',
        });
        loadCharacters();
        if (editCharacterId === c.id) setEditModalOpen(false);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const visibleCharacters = characters.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const name = (c.name || '').toLowerCase();
    const nickname = (c.nickname || '').toLowerCase();
    const id = c.id.toLowerCase();
    const category = Array.isArray(c.category) ? c.category.join(',') : '';
    const tags = Array.isArray(c.tags) ? c.tags.join(',') : '';
    return (
      name.includes(q) ||
      nickname.includes(q) ||
      id.includes(q) ||
      category.toLowerCase().includes(q) ||
      tags.toLowerCase().includes(q)
    );
  });

  const renderCreateForm = () => (
    <form onSubmit={handleSubmit} className="form-group characters-form">
      <div className="form-row">
        <label>角色名称 *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
          placeholder="例如：喵小游"
          required
        />
      </div>
      <div className="form-row-group">
        <div className="form-row">
          <label>昵称</label>
          <input
            type="text"
            value={formData.nickname}
            onChange={(e) => setFormData((p) => ({ ...p, nickname: e.target.value }))}
            placeholder="例如：小游"
          />
        </div>
        <div className="form-row">
          <label>年龄</label>
          <input
            type="text"
            value={formData.age}
            onChange={(e) => setFormData((p) => ({ ...p, age: e.target.value }))}
            placeholder="例如：24"
          />
        </div>
      </div>
      <div className="form-row">
        <label>简介</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
          placeholder="角色简介..."
          rows={2}
        />
      </div>
      <div className="form-row">
        <label>外表描述</label>
        <textarea
          value={formData.appearanceDesc}
          onChange={(e) => setFormData((p) => ({ ...p, appearanceDesc: e.target.value }))}
          placeholder="外貌特征、参考图说明..."
          rows={2}
        />
      </div>
      <div className="form-row">
        <label>外表参考图</label>
        {formData.appearanceRefImages.length > 0 && (
          <div className="form-ref-images">
            {formData.appearanceRefImages.map((url, i) => (
              <div key={i} className="form-ref-image-wrap">
                <AuthImage
                  src={toRelativeMediaUrl(normalizeUrl(url) || url)}
                  alt=""
                  className="form-ref-image"
                  referrerPolicy="no-referrer"
                />
                <button
                  type="button"
                  className="form-ref-image-remove"
                  onClick={() =>
                    setFormData((p) => ({
                      ...p,
                      appearanceRefImages: p.appearanceRefImages.filter((_, idx) => idx !== i),
                    }))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {(formData.appearanceRefImages.length === 0 && formData.clothingRefImages.length === 0) && (
          <p className="form-ref-images-hint">可上传图片作为参考图</p>
        )}
        <div className="form-link-image">
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              setLinkResult('');
              try {
                const res = await uploadAssets(file);
                const err = (res as { error?: string }).error;
                const d = (res.data as any)?.data;
                if (err || !d?.url) {
                  setLinkResult(err || '上传失败');
                } else {
                  const url = d.proxyPath || d.url;
                  setFormData((p) =>
                    linkImageType === 'appearance'
                      ? { ...p, appearanceRefImages: [...p.appearanceRefImages, url] }
                      : { ...p, clothingRefImages: [...p.clothingRefImages, url] }
                  );
                  setLinkResult('上传成功，请保存');
                }
              } catch (e) {
                setLinkResult(e instanceof Error ? e.message : '上传失败');
              } finally {
                setUploading(false);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            className="form-link-btn"
            disabled={uploading}
            onClick={() => uploadInputRef.current?.click()}
          >
            {uploading ? '上传中...' : '上传图片'}
          </button>
          <select
            value={linkImageType}
            onChange={(e) => setLinkImageType(e.target.value as 'appearance' | 'clothing_style')}
            className="form-link-select"
          >
            <option value="appearance">外表</option>
            <option value="clothing_style">服装</option>
          </select>
          {linkResult && (
            <span className={linkResult.includes('成功') ? 'form-link-ok' : 'form-link-err'}>
              {linkResult}
            </span>
          )}
        </div>
      </div>
      <div className="form-row">
        <label>服装风格</label>
        <input
          type="text"
          value={formData.clothingDesc}
          onChange={(e) => setFormData((p) => ({ ...p, clothingDesc: e.target.value }))}
          placeholder="服装、配饰等"
        />
      </div>
      <div className="form-row">
        <label>服装参考图</label>
        {formData.clothingRefImages.length > 0 && (
          <div className="form-ref-images">
            {formData.clothingRefImages.map((url, i) => (
              <div key={i} className="form-ref-image-wrap">
                <AuthImage
                  src={toRelativeMediaUrl(normalizeUrl(url) || url)}
                  alt=""
                  className="form-ref-image"
                  referrerPolicy="no-referrer"
                />
                <button
                  type="button"
                  className="form-ref-image-remove"
                  onClick={() =>
                    setFormData((p) => ({
                      ...p,
                      clothingRefImages: p.clothingRefImages.filter((_, idx) => idx !== i),
                    }))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {formData.clothingRefImages.length === 0 && (
          <p className="form-ref-images-hint">暂无参考图</p>
        )}
      </div>
      <div className="form-row">
        <label>声音描述</label>
        <input
          type="text"
          value={formData.voiceDesc}
          onChange={(e) => setFormData((p) => ({ ...p, voiceDesc: e.target.value }))}
          placeholder="声音特点、配音说明"
        />
      </div>
      <div className="form-row">
        <label>性格</label>
        <textarea
          value={formData.personality}
          onChange={(e) => setFormData((p) => ({ ...p, personality: e.target.value }))}
          placeholder="性格、行事风格..."
          rows={2}
        />
      </div>
      <div className="form-row">
        <label>背景</label>
        <textarea
          value={formData.background}
          onChange={(e) => setFormData((p) => ({ ...p, background: e.target.value }))}
          placeholder="角色背景、经历..."
          rows={2}
        />
      </div>
      <div className="form-row">
        <label>分类</label>
        <input
          type="text"
          value={formData.category}
          onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
          placeholder="逗号分隔，如：主角, 女性"
        />
      </div>
      <div className="form-row">
        <label>标签</label>
        <input
          type="text"
          value={formData.tags}
          onChange={(e) => setFormData((p) => ({ ...p, tags: e.target.value }))}
          placeholder="逗号分隔，如：温柔, 开朗"
        />
      </div>
      <div className="characters-form-actions">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? '创建中...' : '新建'}
        </button>
      </div>
      {saveResult && (
        <p
          className={`characters-save-result ${
            saveResult.includes('成功') ? 'success' : 'error'
          }`}
        >
          {saveResult}
        </p>
      )}
    </form>
  );

  return (
    <section className="page-card characters-page">
      <div className="characters-header">
        <div className="characters-header-main">
          <div className="characters-search">
            <input
              type="text"
              placeholder="搜索角色名称 / 标签 / ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="characters-header-actions">
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={() => loadCharacters()}
            disabled={loading}
          >
            {loading ? '刷新中…' : '刷新列表'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setCreateDrawerOpen(true)}
            disabled={!isLoggedIn}
          >
            新建角色
          </button>
        </div>
      </div>

      <div className="characters-list-scroll">
        {!isLoggedIn ? (
          <p className="muted">请先登录以查看角色列表。</p>
        ) : loading ? (
          <p className="muted">加载中...</p>
        ) : visibleCharacters.length === 0 ? (
          <p className="muted">
            未找到匹配角色，可尝试更短的关键词，或点击右上角「新建角色」创建。
          </p>
        ) : (
          <ul className="characters-task-list">
            {visibleCharacters.map((c) => {
              const avatarUrl = resolveAvatarUrl(c);
              const desc =
                (c.others?.personality as string) ||
                c.appearance?.description ||
                (c.description as string);
              return (
                <li
                  key={c.id}
                  className="characters-task-item"
                >
                  <div className="characters-task-header">
                    <div className="characters-task-avatar-wrap">
                      {avatarUrl ? (
                        <AuthImage
                          src={avatarUrl}
                          alt=""
                          className="characters-task-avatar"
                          referrerPolicy="no-referrer"
                          fallback={
                            <div className="characters-task-avatar-placeholder">
                              {c.name?.slice(0, 1) || '?'}
                            </div>
                          }
                        />
                      ) : (
                        <div className="characters-task-avatar-placeholder">
                          {c.name?.slice(0, 1) || '?'}
                        </div>
                      )}
                    </div>
                    <div className="characters-task-info">
                      <span className="characters-task-name" title={c.name}>
                        {c.name}
                        {c.nickname && ` (${c.nickname})`}
                      </span>
                      {c.age != null && (
                        <span className="characters-task-age">{c.age}岁</span>
                      )}
                      <span className="characters-task-actions">
                        <button
                          type="button"
                          className="btn-secondary btn-small"
                          title="查看完整数据"
                          onClick={() => handleViewJson(c)}
                        >
                          查看
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-small"
                          title="编辑"
                          onClick={() => handleEdit(c)}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="btn-danger btn-small"
                          title="删除"
                          onClick={() => handleDelete(c)}
                          disabled={deletingId === c.id}
                        >
                          {deletingId === c.id ? '…' : '删除'}
                        </button>
                      </span>
                    </div>
                  </div>
                  {desc && (
                    <div className="characters-task-desc">{desc}</div>
                  )}
                  {((c.category?.length ?? 0) > 0 || (c.tags?.length ?? 0) > 0) && (
                    <div className="characters-task-tags">
                      {c.category?.slice(0, 3).map((cat, i) => (
                        <span key={`c-${i}`} className="char-tag char-tag-cat">
                          {cat}
                        </span>
                      ))}
                      {c.tags?.slice(0, 3).map((tag, i) => (
                        <span key={`t-${i}`} className="char-tag char-tag-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="characters-task-meta">
                    <code className="characters-task-id">{c.id}</code>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 编辑弹窗 */}
      {editModalOpen && editCharacterId && (
        <>
          <div className="char-modal-overlay" onClick={() => setEditModalOpen(false)} aria-hidden="true" />
          <div className="char-modal" onClick={(e) => e.stopPropagation()}>
            <div className="char-modal-header">
              <h3 className="char-modal-title">编辑角色</h3>
              <button type="button" className="char-modal-close" onClick={() => setEditModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="char-modal-body">
              <form onSubmit={handleEditSave} className="form-group characters-form char-edit-form">
                <div className="form-row">
                  <label>角色名称 *</label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData((p) => ({ ...p, name: e.target.value }))}
                    placeholder="例如：喵小游"
                    required
                  />
                </div>
                <div className="form-row-group">
                  <div className="form-row">
                    <label>昵称</label>
                    <input
                      type="text"
                      value={editFormData.nickname}
                      onChange={(e) => setEditFormData((p) => ({ ...p, nickname: e.target.value }))}
                      placeholder="例如：小游"
                    />
                  </div>
                  <div className="form-row">
                    <label>年龄</label>
                    <input
                      type="text"
                      value={editFormData.age}
                      onChange={(e) => setEditFormData((p) => ({ ...p, age: e.target.value }))}
                      placeholder="例如：24"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <label>简介</label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData((p) => ({ ...p, description: e.target.value }))}
                    placeholder="角色简介..."
                    rows={2}
                  />
                </div>
                <div className="form-row">
                  <label>外表描述</label>
                  <textarea
                    value={editFormData.appearanceDesc}
                    onChange={(e) => setEditFormData((p) => ({ ...p, appearanceDesc: e.target.value }))}
                    placeholder="外貌特征、参考图说明..."
                    rows={2}
                  />
                </div>
                <div className="form-row">
                  <label>外表参考图</label>
                  {editFormData.appearanceRefImages.length > 0 && (
                    <div className="form-ref-images">
                      {editFormData.appearanceRefImages.map((url, i) => (
                        <div key={i} className="form-ref-image-wrap">
                          <AuthImage src={toRelativeMediaUrl(normalizeUrl(url) || url)} alt="" className="form-ref-image" referrerPolicy="no-referrer" />
                          <button type="button" className="form-ref-image-remove" onClick={() => setEditFormData((p) => ({ ...p, appearanceRefImages: p.appearanceRefImages.filter((_, idx) => idx !== i) }))}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="form-link-image">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      style={{ display: 'none' }}
                      id="edit-upload-input"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        try {
                          const res = await uploadAssets(file);
                          const d = (res.data as any)?.data;
                          if (d?.url) {
                            const url = d.proxyPath || d.url;
                            setEditFormData((p) =>
                              linkImageType === 'appearance'
                                ? { ...p, appearanceRefImages: [...p.appearanceRefImages, url] }
                                : { ...p, clothingRefImages: [...p.clothingRefImages, url] }
                            );
                          }
                        } finally {
                          setUploading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                    <button type="button" className="form-link-btn" disabled={uploading} onClick={() => document.getElementById('edit-upload-input')?.click()}>
                      {uploading ? '上传中...' : '上传图片'}
                    </button>
                    <select value={linkImageType} onChange={(e) => setLinkImageType(e.target.value as 'appearance' | 'clothing_style')} className="form-link-select">
                      <option value="appearance">外表</option>
                      <option value="clothing_style">服装</option>
                    </select>
                    <input type="text" placeholder="图片任务 ID" value={linkTaskId} onChange={(e) => setLinkTaskId(e.target.value)} className="form-link-input" />
                    <button
                      type="button"
                      className="form-link-btn"
                      disabled={linking || !linkTaskId.trim()}
                      onClick={async () => {
                        if (!editCharacterId || !linkTaskId.trim()) return;
                        setLinking(true);
                        setLinkResult('');
                        try {
                          const res = await linkCharacterImageTask(editCharacterId, linkTaskId.trim(), linkImageType);
                          if (!(res as { error?: string }).error) {
                            setLinkResult('链接成功');
                            setLinkTaskId('');
                            const detail = await getCharacter(editCharacterId);
                            const d = (detail.data as any)?.data ?? detail.data;
                            if (d) setEditFormData((p) => ({ ...p, appearanceRefImages: d.appearance?.reference_images?.slice() ?? p.appearanceRefImages, clothingRefImages: d.clothing_style?.reference_images?.slice() ?? p.clothingRefImages }));
                            loadCharacters();
                          } else setLinkResult((res as { error?: string }).error || '');
                        } catch (e) {
                          setLinkResult(e instanceof Error ? e.message : '链接失败');
                        } finally {
                          setLinking(false);
                        }
                      }}
                    >
                      {linking ? '链接中...' : '链接'}
                    </button>
                    {linkResult && <span className={linkResult.includes('成功') ? 'form-link-ok' : 'form-link-err'}>{linkResult}</span>}
                  </div>
                </div>
                <div className="form-row">
                  <label>服装风格</label>
                  <input type="text" value={editFormData.clothingDesc} onChange={(e) => setEditFormData((p) => ({ ...p, clothingDesc: e.target.value }))} placeholder="服装、配饰等" />
                </div>
                <div className="form-row">
                  <label>服装参考图</label>
                  {editFormData.clothingRefImages.length > 0 && (
                    <div className="form-ref-images">
                      {editFormData.clothingRefImages.map((url, i) => (
                        <div key={i} className="form-ref-image-wrap">
                          <AuthImage src={toRelativeMediaUrl(normalizeUrl(url) || url)} alt="" className="form-ref-image" referrerPolicy="no-referrer" />
                          <button type="button" className="form-ref-image-remove" onClick={() => setEditFormData((p) => ({ ...p, clothingRefImages: p.clothingRefImages.filter((_, idx) => idx !== i) }))}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-row">
                  <label>声音描述</label>
                  <input type="text" value={editFormData.voiceDesc} onChange={(e) => setEditFormData((p) => ({ ...p, voiceDesc: e.target.value }))} placeholder="声音特点、配音说明" />
                </div>
                <div className="form-row">
                  <label>性格</label>
                  <textarea value={editFormData.personality} onChange={(e) => setEditFormData((p) => ({ ...p, personality: e.target.value }))} placeholder="性格、行事风格..." rows={2} />
                </div>
                <div className="form-row">
                  <label>背景</label>
                  <textarea value={editFormData.background} onChange={(e) => setEditFormData((p) => ({ ...p, background: e.target.value }))} placeholder="角色背景、经历..." rows={2} />
                </div>
                <div className="form-row">
                  <label>分类</label>
                  <input type="text" value={editFormData.category} onChange={(e) => setEditFormData((p) => ({ ...p, category: e.target.value }))} placeholder="逗号分隔，如：主角, 女性" />
                </div>
                <div className="form-row">
                  <label>标签</label>
                  <input type="text" value={editFormData.tags} onChange={(e) => setEditFormData((p) => ({ ...p, tags: e.target.value }))} placeholder="逗号分隔，如：温柔, 开朗" />
                </div>
                <div className="characters-form-actions">
                  <button type="button" className="btn-cancel" onClick={() => setEditModalOpen(false)}>取消</button>
                  <button type="submit" disabled={editSaving}>{editSaving ? '保存中...' : '保存'}</button>
                </div>
                {editSaveResult && (
                  <p className={`characters-save-result ${editSaveResult.includes('成功') ? 'success' : 'error'}`}>{editSaveResult}</p>
                )}
              </form>
            </div>
          </div>
        </>
      )}

      {/* 查看完整数据弹窗 */}
      {viewJsonOpen && (
        <>
          <div className="char-modal-overlay" onClick={() => setViewJsonOpen(false)} aria-hidden="true" />
          <div className="char-modal char-json-modal" onClick={(e) => e.stopPropagation()}>
            <div className="char-modal-header">
              <h3 className="char-modal-title">完整角色数据</h3>
              <button type="button" className="char-modal-close" onClick={() => setViewJsonOpen(false)}>×</button>
            </div>
            <div className="char-modal-body char-json-body">
              <pre className="char-json-pre">{viewJsonData}</pre>
            </div>
          </div>
        </>
      )}
      <Drawer
        title="新建角色"
        placement="right"
        width={520}
        open={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        destroyOnClose
      >
        {renderCreateForm()}
      </Drawer>
    </section>
  );
}
