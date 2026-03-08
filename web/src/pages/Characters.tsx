import { useState, useEffect, useCallback, useRef } from 'react';
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
        search: search.trim() || undefined,
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
  }, [isLoggedIn, search]);

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
        resetForm();
        loadCharacters();
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
        loadCharacters();
        if (editCharacterId === c.id) setEditModalOpen(false);
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="characters-page">
      {/* 左侧：角色列表 */}
      <section className="characters-list-pane">
        <h3 className="characters-list-title">我的角色</h3>
        <div className="characters-list-search">
          <input
            type="text"
            placeholder="搜索角色..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="characters-search-input"
          />
        </div>
        <div className="characters-list-scroll">
          {!isLoggedIn ? (
            <p className="muted">请先登录以查看角色列表。</p>
          ) : loading ? (
            <p className="muted">加载中...</p>
          ) : characters.length === 0 ? (
            <p className="muted">暂无角色，在右侧新建。</p>
          ) : (
            <ul className="characters-task-list">
              {characters.map((c) => {
                const avatarUrl = resolveAvatarUrl(c);
                const desc =
                  (c.others?.personality as string) ||
                  c.appearance?.description ||
                  (c.description as string);
                return (
                  <li key={c.id} className="characters-task-item">
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
                            className="characters-task-view"
                            title="查看完整数据"
                            onClick={() => handleViewJson(c)}
                          >
                            查看
                          </button>
                          <button
                            type="button"
                            className="characters-task-edit"
                            title="编辑"
                            onClick={() => handleEdit(c)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="characters-task-delete"
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
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* 右侧：新建表单 */}
      <section className="characters-form-pane">
        <h3 className="characters-form-title">新建角色</h3>
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
            <button type="submit" disabled={saving}>
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
      </section>

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

      <style>{`
        .characters-page {
          display: flex;
          flex-direction: row;
          gap: 1.5rem;
          height: 100%;
          min-height: 0;
          align-items: stretch;
        }
        .characters-list-pane {
          flex: 7;
          min-width: 0;
          display: flex;
          flex-direction: column;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 8px;
          overflow: hidden;
        }
        .characters-list-title {
          flex-shrink: 0;
          margin: 0;
          padding: 1rem 1.25rem;
          font-size: 1rem;
          color: #e0e0e0;
          border-bottom: 1px solid #333;
        }
        .characters-list-search {
          flex-shrink: 0;
          padding: 0.5rem 1rem;
          border-bottom: 1px solid #333;
        }
        .characters-search-input {
          width: 100%;
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          border: 1px solid #444;
          background: #262626;
          color: #e0e0e0;
          font-size: 0.875rem;
          box-sizing: border-box;
        }
        .characters-list-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 1rem;
        }
        .characters-list-scroll .muted {
          font-size: 0.875rem;
          color: #888;
          margin: 0;
        }
        .characters-task-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .characters-task-item {
          padding: 0.75rem 1rem;
          margin-bottom: 0.5rem;
          background: #252525;
          border: 1px solid #333;
          border-radius: 6px;
        }
        .characters-task-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .characters-task-avatar-wrap {
          flex-shrink: 0;
        }
        .characters-task-avatar,
        .characters-task-avatar-placeholder {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          object-fit: cover;
        }
        .characters-task-avatar-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #333;
          color: #888;
          font-size: 1.25rem;
        }
        .characters-task-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
        }
        .characters-task-name {
          font-size: 0.95rem;
          font-weight: 500;
          color: #e0e0e0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .characters-task-age {
          font-size: 0.8rem;
          color: #888;
        }
        .characters-task-actions {
          flex-shrink: 0;
          display: flex;
          gap: 0.4rem;
        }
        .characters-task-view {
          font-size: 0.7rem;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          border: 1px solid #444;
          background: transparent;
          color: #a78bfa;
          cursor: pointer;
        }
        .characters-task-view:hover { background: #4c1d9540; }
        .characters-task-edit {
          font-size: 0.7rem;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          border: 1px solid #444;
          background: transparent;
          color: #93c5fd;
          cursor: pointer;
        }
        .characters-task-edit:hover {
          background: #1e3a5f;
        }
        .characters-task-delete {
          font-size: 0.7rem;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          border: 1px solid #7f1d1d;
          background: transparent;
          color: #fca5a5;
          cursor: pointer;
        }
        .characters-task-delete:hover:not(:disabled) {
          background: #7f1d1d;
        }
        .characters-task-delete:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .characters-task-desc {
          margin-top: 0.5rem;
          font-size: 0.8rem;
          color: #888;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .characters-task-tags {
          margin-top: 0.5rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .char-tag {
          font-size: 0.7rem;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }
        .char-tag-cat {
          background: #1e3a5f40;
          color: #93c5fd;
          border: 1px solid #1e3a5f;
        }
        .char-tag-tag {
          background: #16653440;
          color: #86efac;
          border: 1px solid #166534;
        }
        .characters-form-pane {
          flex: 5;
          min-width: 0;
          overflow-y: auto;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 1.5rem;
        }
        .characters-form-title {
          margin: 0 0 1rem 0;
          font-size: 1rem;
          color: #e0e0e0;
        }
        .characters-form .form-row {
          margin-bottom: 1rem;
        }
        .characters-form .form-row label {
          display: block;
          margin-bottom: 0.35rem;
          font-size: 0.9rem;
          color: #aaa;
        }
        .characters-form .form-row input,
        .characters-form .form-row textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px solid #444;
          background: #262626;
          color: #e0e0e0;
          font-size: 0.875rem;
          box-sizing: border-box;
        }
        .characters-form .form-row textarea {
          min-height: 60px;
          resize: vertical;
        }
        .form-ref-images {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }
        .form-ref-image-wrap {
          position: relative;
          width: 72px;
          height: 72px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #444;
        }
        .form-ref-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .form-ref-image-remove {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 22px;
          height: 22px;
          border-radius: 4px;
          border: none;
          background: rgba(0,0,0,0.7);
          color: #fff;
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
        }
        .form-ref-image-remove:hover {
          background: #b91c1c;
        }
        .form-ref-images-hint {
          font-size: 0.8rem;
          color: #888;
          margin: 0.25rem 0 0 0;
        }
        .form-link-image {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }
        .form-link-input {
          flex: 1;
          min-width: 120px;
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          border: 1px solid #444;
          background: #262626;
          color: #e0e0e0;
          font-size: 0.85rem;
        }
        .form-link-select {
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          border: 1px solid #444;
          background: #262626;
          color: #e0e0e0;
          font-size: 0.85rem;
        }
        .form-link-btn {
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          border: 1px solid #555;
          background: #333;
          color: #93c5fd;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .form-link-btn:hover:not(:disabled) {
          background: #1e3a5f;
        }
        .form-link-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .form-link-ok { color: #86efac; font-size: 0.85rem; }
        .form-link-err { color: #fca5a5; font-size: 0.85rem; }
        .form-row-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .form-row-group .form-row {
          margin-bottom: 0;
        }
        .characters-form-actions {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          margin-top: 1rem;
        }
        .characters-form-actions button {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          border: 1px solid #555;
          background: #333;
          color: #e0e0e0;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .characters-form-actions button:hover:not(:disabled) {
          background: #444;
          border-color: #6366f1;
        }
        .btn-cancel {
          border-color: #444 !important;
        }
        .characters-save-result {
          margin-top: 0.75rem;
          font-size: 0.875rem;
        }
        .characters-save-result.success {
          color: #86efac;
        }
        .characters-save-result.error {
          color: #fca5a5;
        }
        .char-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 1000;
        }
        .char-modal {
          position: fixed;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 90%;
          max-width: 560px;
          max-height: 85vh;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 12px;
          z-index: 1001;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .char-json-modal {
          max-width: 720px;
        }
        .char-modal-header {
          flex-shrink: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #333;
        }
        .char-modal-title {
          margin: 0;
          font-size: 1rem;
          color: #e0e0e0;
        }
        .char-modal-close {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          color: #888;
          font-size: 1.5rem;
          cursor: pointer;
          line-height: 1;
        }
        .char-modal-close:hover {
          color: #e0e0e0;
        }
        .char-modal-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 1.25rem;
        }
        .char-edit-form .form-row {
          margin-bottom: 1rem;
        }
        .char-edit-form .form-row label {
          display: block;
          margin-bottom: 0.35rem;
          font-size: 0.9rem;
          color: #aaa;
        }
        .char-edit-form .form-row input,
        .char-edit-form .form-row textarea {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px solid #444;
          background: #262626;
          color: #e0e0e0;
          font-size: 0.875rem;
          box-sizing: border-box;
        }
        .char-json-body {
          padding: 1rem;
        }
        .char-json-pre {
          margin: 0;
          padding: 1rem;
          background: #262626;
          border-radius: 8px;
          font-size: 0.8rem;
          color: #86efac;
          overflow: auto;
          max-height: 60vh;
          white-space: pre-wrap;
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}
