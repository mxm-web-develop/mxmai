import { useState, useEffect } from 'react';
import { useI18n } from '../context/I18nContext';
import { useAuth } from '../context/AuthContext';
import * as CharacterAPI from '../api/character';
import type { Character } from '../api/character';

export function CharactersPage() {
  const { t } = useI18n();
  const { isLoggedIn } = useAuth();
  
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_public: false,
  });

  // 加载角色列表
  const loadCharacters = async () => {
    if (!isLoggedIn) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await CharacterAPI.listCharacters({
        search: searchQuery || undefined,
        is_public: false, // 只加载用户自己的角色
        page: 1,
        limit: 100,
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      if (response.data) {
        setCharacters(response.data.characters || []);
      }
    } catch (err: any) {
      console.error('加载角色失败:', err);
      setError(err.message || '加载角色列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCharacters();
  }, [isLoggedIn, searchQuery]);

  // 创建角色
  const handleCreateCharacter = async () => {
    if (!formData.name.trim()) {
      setError('请输入角色名称');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await CharacterAPI.createCharacter({
        name: formData.name,
        description: formData.description,
        is_public: formData.is_public,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.data) {
        // 重新加载列表
        await loadCharacters();
        // 重置表单并关闭模态框
        setFormData({ name: '', description: '', is_public: false });
        setShowCreateModal(false);
      }
    } catch (err: any) {
      console.error('创建角色失败:', err);
      setError(err.message || '创建角色失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除角色
  const handleDeleteCharacter = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await CharacterAPI.deleteCharacter(id);

      if (response.error) {
        throw new Error(response.error);
      }

      // 重新加载列表
      await loadCharacters();
      setShowDeleteConfirm(null);
    } catch (err: any) {
      console.error('删除角色失败:', err);
      setError(err.message || '删除角色失败');
    } finally {
      setLoading(false);
    }
  };

  // 编辑角色（跳转到编辑页面）
  const handleEditCharacter = (character: Character) => {
    // 这里可以跳转到编辑页面，或者打开编辑模态框
    console.log('编辑角色:', character);
    // 暂时先显示一个提示
    alert(`编辑角色: ${character.name}`);
  };

  // 查看角色详情
  const handleViewCharacter = (character: Character) => {
    // 这里可以跳转到详情页面
    console.log('查看角色详情:', character);
    // 暂时先显示一个提示
    alert(`角色详情:\n名称: ${character.name}\n描述: ${character.description || '无'}`);
  };

  if (!isLoggedIn) {
    return (
      <div className="characters-page">
        <div className="page-header">
          <h1>{t('sidebar.characters')}</h1>
          <p>管理故事中的角色设定和属性</p>
        </div>
        <div className="login-prompt">
          <p>请先登录以管理角色</p>
        </div>
      </div>
    );
  }

  return (
    <div className="characters-page">
      <div className="page-header">
        <h1>{t('sidebar.characters')}</h1>
        <p>管理故事中的角色设定和属性</p>
      </div>

      <div className="page-content">
        {/* 搜索和操作栏 */}
        <div className="characters-actions">
          <div className="search-box">
            <input
              type="text"
              placeholder="搜索角色..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
            disabled={loading}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新建角色
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* 加载状态 */}
        {loading && !characters.length && (
          <div className="loading-indicator">
            加载中...
          </div>
        )}

        {/* 角色列表 */}
        {!loading && characters.length === 0 ? (
          <div className="empty-state">
            <p>暂无角色，点击"新建角色"开始创建</p>
          </div>
        ) : (
          <div className="characters-grid">
            {characters.map((character) => (
              <div key={character.id} className="character-card">
                <div className="character-header">
                  <h3>{character.name}</h3>
                  <span className={`character-status ${character.is_public ? 'active' : 'inactive'}`}>
                    {character.is_public ? '公开' : '私有'}
                  </span>
                </div>
                <p className="character-description">
                  {character.description || '暂无描述'}
                </p>
                <div className="character-meta">
                  {character.category && character.category.length > 0 && (
                    <div className="character-tags">
                      {character.category.map((cat, index) => (
                        <span key={index} className="character-tag">{cat}</span>
                      ))}
                    </div>
                  )}
                  {character.created_at && (
                    <div className="character-date">
                      创建: {new Date(character.created_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="character-actions">
                  <button 
                    className="btn-secondary"
                    onClick={() => handleViewCharacter(character)}
                  >
                    查看
                  </button>
                  <button 
                    className="btn-secondary"
                    onClick={() => handleEditCharacter(character)}
                  >
                    编辑
                  </button>
                  <button 
                    className="btn-danger"
                    onClick={() => setShowDeleteConfirm(character.id)}
                    disabled={loading}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建角色模态框 */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>新建角色</h3>
              <button 
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label>角色名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="请输入角色名称"
                />
              </div>
              <div className="form-group">
                <label>角色描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="请输入角色描述"
                  rows={4}
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.is_public}
                    onChange={(e) => setFormData({...formData, is_public: e.target.checked})}
                  />
                  设为公开角色
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={loading}
              >
                取消
              </button>
              <button 
                className="btn-primary"
                onClick={handleCreateCharacter}
                disabled={loading || !formData.name.trim()}
              >
                {loading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认模态框 */}
      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>确认删除</h3>
              <button 
                className="modal-close"
                onClick={() => setShowDeleteConfirm(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <p>确定要删除这个角色吗？此操作不可撤销。</p>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowDeleteConfirm(null)}
                disabled={loading}
              >
                取消
              </button>
              <button 
                className="btn-danger"
                onClick={() => handleDeleteCharacter(showDeleteConfirm)}
                disabled={loading}
              >
                {loading ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}