/**
 * Admin：敏感词管理
 * 敏感词表 CRUD、敏感词条 CRUD、按业务 slot 绑定敏感词表
 */
import { useState, useEffect, useCallback } from 'react';
import {
  listSensitiveWordLists,
  createSensitiveWordList,
  updateSensitiveWordList,
  deleteSensitiveWordList,
  listSensitiveWords,
  addSensitiveWord,
  addSensitiveWordsBatch,
  deleteSensitiveWord,
  listSensitiveWordBindings,
  setSensitiveWordBindingsForSlot,
  removeSensitiveWordBinding,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Table, message, Modal, Select, Space } from 'antd';

/** 敏感词绑定 slot：type 下拉选项（按 scope 分） */
const SENSITIVE_TYPE_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  writing: [
    { value: '*', label: '全局（该 scope 通用）' },
    { value: 'articles', label: '文章' },
    { value: 'outlines', label: '大纲' },
    { value: 'lyrics', label: '歌词' },
    { value: 'suno-lyrics', label: '歌词(Suno)' },
    { value: 'voice-scripts', label: '口播稿' },
    { value: 'storyboard-scripts', label: '分镜脚本' },
    { value: 'media-post', label: '媒体帖' },
    { value: 'reviews', label: '评论' },
    { value: 'resumes', label: '简历' },
  ],
  graph: [
    { value: '*', label: '全局（该 scope 通用）' },
    { value: 'photograph', label: '摄影' },
    { value: 'design', label: '设计' },
    { value: 'painting', label: '绘画' },
  ],
};

/** 敏感词绑定 slot：subtype 下拉选项（按 scope + type 分），空字符串表示「该 type 下通用」 */
const SENSITIVE_SUBTYPE_OPTIONS: Record<string, Record<string, Array<{ value: string; label: string }>>> = {
  writing: {
    articles: [
      { value: 'tech-article', label: '科技文章' },
      { value: 'story-novel', label: '故事小说' },
      { value: 'academic-paper', label: '学术论文' },
    ],
    outlines: [
      { value: 'academic-paper', label: '学术论文' },
      { value: 'story-novel', label: '故事小说' },
      { value: 'tech-article', label: '科技文章' },
    ],
    'voice-scripts': [
      { value: 'sales-voice', label: '带货口播' },
      { value: 'emotional-story-voice', label: '情感故事口播' },
      { value: 'knowledge-sharing-voice', label: '知识分享口播' },
    ],
    'storyboard-scripts': [
      { value: 'short-video-storyboard', label: '短视频分镜' },
      { value: 'movie-storyboard', label: '电影分镜' },
      { value: 'animation-storyboard', label: '动画分镜' },
      { value: 'music-video-storyboard', label: '音乐视频分镜' },
      { value: 'commercial-storyboard', label: '广告分镜' },
      { value: 'documentary-storyboard', label: '纪录片分镜' },
      { value: 'motion-graphics-storyboard', label: '概念动效分镜' },
    ],
    lyrics: [],
    'suno-lyrics': [],
    'media-post': [],
    reviews: [],
    resumes: [],
  },
  graph: {
    photograph: [
      { value: 'portrait', label: '人像' },
      { value: 'landscape', label: '风景' },
      { value: 'cinematic', label: '电影画面' },
      { value: 'commercial', label: '产品商业拍摄' },
      { value: 'documentary', label: '纪事' },
    ],
    design: [
      { value: '3d', label: '3D' },
      { value: 'manual', label: '使用手册' },
      { value: 'poster', label: '画报' },
      { value: 'icon', label: '图标' },
      { value: 'coverImage', label: '封面图片' },
      { value: 'ui-design', label: 'UI 设计' },
    ],
    painting: [
      { value: 'illustration', label: '插图' },
      { value: 'comic', label: '漫画' },
      { value: 'conceptArt', label: '原画' },
      { value: 'cartoon', label: '卡通' },
    ],
  },
};

export default function AdminSensitiveWords() {
  const { isLoggedIn, isAdmin } = useAuth();
  const [lists, setLists] = useState<{ id: string; name: string; description?: string | null; is_active: boolean }[]>([]);
  const [words, setWords] = useState<{ id: string; list_id: string; word: string }[]>([]);
  const [bindings, setBindings] = useState<{ id: string; scope: string; type: string; subtype: string | null; list_id: string; sort_order: number }[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalList, setModalList] = useState<'create' | 'edit' | 'words' | 'binding' | null>(null);
  const [editListId, setEditListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [newWord, setNewWord] = useState('');
  const [batchWords, setBatchWords] = useState('');
  const [bindingScope, setBindingScope] = useState('writing');
  const [bindingType, setBindingType] = useState('articles');
  const [bindingSubtype, setBindingSubtype] = useState('');
  const [bindingListIds, setBindingListIds] = useState<string[]>([]);

  const loadLists = useCallback(async () => {
    const res = await listSensitiveWordLists();
    const items = (res.data as { data?: { items?: typeof lists } })?.data?.items;
    if (!res.error && items) setLists(items);
  }, []);

  const loadWords = useCallback(async (listId: string) => {
    const res = await listSensitiveWords(listId);
    const items = (res.data as { data?: { items?: typeof words } })?.data?.items;
    if (!res.error && items) setWords(items);
  }, []);

  const loadBindings = useCallback(async () => {
    const res = await listSensitiveWordBindings();
    const items = (res.data as { data?: { items?: typeof bindings } })?.data?.items;
    if (!res.error && items) setBindings(items);
  }, []);

  useEffect(() => {
    if (isLoggedIn && isAdmin) {
      loadLists();
      loadBindings();
    }
  }, [isLoggedIn, isAdmin, loadLists, loadBindings]);

  useEffect(() => {
    if (selectedListId) loadWords(selectedListId);
    else setWords([]);
  }, [selectedListId, loadWords]);

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="page-card">
        <h2>敏感词管理</h2>
        <p>请先使用 Admin 账号登录。</p>
      </div>
    );
  }

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      message.warning('请输入表名称');
      return;
    }
    setLoading(true);
    const res = await createSensitiveWordList({ name: newListName.trim(), description: newListDesc.trim() || null });
    setLoading(false);
    if (res.error) message.error(res.error);
    else {
      message.success('创建成功');
      setModalList(null);
      setNewListName('');
      setNewListDesc('');
      await loadLists();
      // 若接口返回了新建的表，可乐观更新，避免依赖二次请求
      const created = (res.data as { data?: { id?: string; name?: string } })?.data;
      if (created?.id && created?.name && !lists.some((l) => l.id === created.id)) {
        setLists((prev) => [...prev, { id: created.id!, name: created.name!, description: null, is_active: true }]);
      }
    }
  };

  const handleUpdateList = async () => {
    if (!editListId) return;
    setLoading(true);
    const res = await updateSensitiveWordList(editListId, { name: newListName.trim(), description: newListDesc.trim() || null });
    setLoading(false);
    if (res.error) message.error(res.error);
    else {
      message.success('更新成功');
      setModalList(null);
      setEditListId(null);
      loadLists();
    }
  };

  const handleDeleteList = (listId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除敏感词表后，其下所有词条及绑定关系将失效，是否继续？',
      onOk: async () => {
        const res = await deleteSensitiveWordList(listId);
        if (res.error) message.error(res.error);
        else {
          message.success('已删除');
          if (selectedListId === listId) setSelectedListId(null);
          loadLists();
          loadBindings();
        }
      },
    });
  };

  const handleAddWord = async () => {
    if (!selectedListId || !newWord.trim()) {
      message.warning('请选择表并输入敏感词');
      return;
    }
    setLoading(true);
    const res = await addSensitiveWord(selectedListId, newWord.trim());
    setLoading(false);
    if (res.error) message.error(res.error);
    else {
      message.success('已添加');
      setNewWord('');
      loadWords(selectedListId);
    }
  };

  const handleBatchWords = async () => {
    if (!selectedListId) {
      message.warning('请先选择敏感词表');
      return;
    }
    const arr = batchWords.split(/[\n,，\s]+/).map((w) => w.trim()).filter(Boolean);
    if (arr.length === 0) {
      message.warning('请输入至少一个词（多词换行或逗号分隔）');
      return;
    }
    setLoading(true);
    const res = await addSensitiveWordsBatch(selectedListId, arr);
    setLoading(false);
    if (res.error) message.error(res.error);
    else {
      message.success(`已添加 ${(res.data as { added?: number })?.added ?? 0} 条`);
      setModalList(null);
      setBatchWords('');
      loadWords(selectedListId);
    }
  };

  const handleDeleteWord = (wordId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定删除该敏感词？',
      onOk: async () => {
        const res = await deleteSensitiveWord(wordId);
        if (res.error) message.error(res.error);
        else {
          message.success('已删除');
          if (selectedListId) loadWords(selectedListId);
        }
      },
    });
  };

  const handleSetBinding = async () => {
    setLoading(true);
    const normalizedType = bindingType.trim() || '*'; // 空 type 表示整个 scope 通用绑定
    const res = await setSensitiveWordBindingsForSlot({
      scope: bindingScope,
      type: normalizedType,
      // scope 级绑定不支持 subtype（统一按 subtype=null 存储）
      subtype: normalizedType === '*' ? null : (bindingSubtype.trim() || null),
      list_ids: bindingListIds,
    });
    setLoading(false);
    if (res.error) message.error(res.error);
    else {
      message.success('绑定已更新');
      setModalList(null);
      loadBindings();
    }
  };

  const handleRemoveBinding = (bindingId: string) => {
    Modal.confirm({
      title: '确认解除绑定',
      onOk: async () => {
        const res = await removeSensitiveWordBinding(bindingId);
        if (res.error) message.error(res.error);
        else {
          message.success('已解除');
          loadBindings();
        }
      },
    });
  };

  return (
    <div className="page-card admin-sensitive-words-page">
      <h2>敏感词管理（Admin）</h2>
      <p className="hint">
        管理敏感词表、词条，以及按业务 slot (scope / type / subtype) 绑定使用的敏感词表；一个业务可绑定多张表，校验时合并检查。
      </p>

      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" onClick={() => { setModalList('create'); setNewListName(''); setNewListDesc(''); }}>
            新建敏感词表
          </Button>
          <Button onClick={() => { setModalList('binding'); setBindingScope('writing'); setBindingType('*'); setBindingSubtype(''); setBindingListIds([]); }}>
            为业务绑定敏感词表
          </Button>
        </Space>
      </div>

      <div className="admin-sensitive-words-content-wrap">
        <div className="admin-sensitive-words-content-inner">
      <h3>敏感词表列表</h3>
      <Table
        size="small"
        dataSource={lists}
        rowKey="id"
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '说明', dataIndex: 'description', render: (v: string | null) => v ?? '-' },
          { title: '启用', dataIndex: 'is_active', render: (v: boolean) => (v ? '是' : '否') },
          {
            title: '操作',
            render: (_: unknown, r: { id: string; name: string; description?: string | null }) => (
              <Space wrap>
                <Button size="small" onClick={() => { setSelectedListId(r.id); }}>查看词条</Button>
                <Button size="small" type="primary" onClick={() => { setSelectedListId(r.id); setModalList('words'); setBatchWords(''); }}>添加敏感词</Button>
                <Button size="small" onClick={() => { setModalList('edit'); setEditListId(r.id); setNewListName(r.name); setNewListDesc(r.description ?? ''); }}>编辑</Button>
                <Button size="small" danger onClick={() => handleDeleteList(r.id)}>删除</Button>
              </Space>
            ),
          },
        ]}
        pagination={false}
      />

      {selectedListId && (
        <>
          <h3 style={{ marginTop: 24 }}>当前表词条：{lists.find((l) => l.id === selectedListId)?.name ?? selectedListId}</h3>
          <Space style={{ marginBottom: 8 }}>
            <Input placeholder="添加一条敏感词" value={newWord} onChange={(e) => setNewWord(e.target.value)} onPressEnter={handleAddWord} style={{ width: 200 }} />
            <Button type="primary" onClick={handleAddWord} loading={loading}>添加</Button>
            <Button onClick={() => { setModalList('words'); setBatchWords(''); }}>批量添加</Button>
          </Space>
          <Table
            size="small"
            dataSource={words}
            rowKey="id"
            columns={[
              { title: '敏感词', dataIndex: 'word' },
              {
                title: '操作',
                width: 80,
                render: (_: unknown, r: { id: string }) => (
                  <Button size="small" danger onClick={() => handleDeleteWord(r.id)}>删除</Button>
                ),
              },
            ]}
            pagination={{ pageSize: 20 }}
          />
        </>
      )}

      <h3 style={{ marginTop: 24 }}>业务绑定</h3>
      <Table
        size="small"
        dataSource={bindings}
        rowKey="id"
        columns={[
          { title: 'scope', dataIndex: 'scope', width: 100 },
          { title: 'type', dataIndex: 'type', width: 120 },
          { title: 'subtype', dataIndex: 'subtype', width: 120, render: (v: string | null) => v ?? '-' },
          { title: 'list_id', dataIndex: 'list_id' },
          { title: '顺序', dataIndex: 'sort_order', width: 60 },
          {
            title: '操作',
            width: 100,
            render: (_: unknown, r: { id: string }) => (
              <Button size="small" danger onClick={() => handleRemoveBinding(r.id)}>解除</Button>
            ),
          },
        ]}
        pagination={false}
      />
        </div>
      </div>

      <Modal
        title={modalList === 'create' ? '新建敏感词表' : '编辑敏感词表'}
        open={modalList === 'create' || modalList === 'edit'}
        onCancel={() => { setModalList(null); setEditListId(null); }}
        onOk={modalList === 'create' ? handleCreateList : handleUpdateList}
        confirmLoading={loading}
      >
        <div style={{ marginBottom: 8 }}>
          <label>名称</label>
          <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="如：通用政治" />
        </div>
        <div>
          <label>说明（可选）</label>
          <Input value={newListDesc} onChange={(e) => setNewListDesc(e.target.value)} placeholder="可选" />
        </div>
      </Modal>

      <Modal
        title={selectedListId ? `批量添加敏感词 - ${lists.find((l) => l.id === selectedListId)?.name ?? '当前表'}` : '批量添加敏感词'}
        open={modalList === 'words'}
        onCancel={() => setModalList(null)}
        onOk={handleBatchWords}
        confirmLoading={loading}
      >
        <p>每行一个词，或使用逗号/空格分隔</p>
        <textarea
          value={batchWords}
          onChange={(e) => setBatchWords(e.target.value)}
          rows={10}
          style={{ width: '100%' }}
          placeholder="词1&#10;词2&#10;词3"
        />
      </Modal>

      <Modal
        title="为业务绑定敏感词表"
        open={modalList === 'binding'}
        onCancel={() => setModalList(null)}
        onOk={handleSetBinding}
        confirmLoading={loading}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <label>scope</label>
            <Select
              value={bindingScope}
              onChange={(v) => {
                setBindingScope(v);
                const first = SENSITIVE_TYPE_OPTIONS[v]?.[0];
                setBindingType(first?.value ?? '');
                setBindingSubtype('');
              }}
              style={{ width: '100%' }}
            >
              <Select.Option value="writing">writing</Select.Option>
              <Select.Option value="graph">graph</Select.Option>
            </Select>
          </div>
          <div>
            <label>type</label>
            <Select
              value={bindingType || undefined}
              onChange={(v) => {
                setBindingType(v ?? '');
                setBindingSubtype('');
              }}
              style={{ width: '100%' }}
              placeholder="选择 type（可选全局）"
              allowClear
            >
              {(SENSITIVE_TYPE_OPTIONS[bindingScope] ?? []).map((o) => (
                <Select.Option key={o.value} value={o.value}>{o.label}（{o.value}）</Select.Option>
              ))}
            </Select>
          </div>
          <div>
            <label>subtype（可选，留空表示该 type 下通用）</label>
            <Select
              value={bindingSubtype === '' ? '__empty__' : bindingSubtype}
              onChange={(v) => setBindingSubtype(v === '__empty__' || v == null ? '' : (v ?? ''))}
              style={{ width: '100%' }}
              placeholder="留空表示该 type 下通用"
              allowClear
              disabled={!bindingType || bindingType === '*'}
            >
              <Select.Option value="__empty__">留空表示该 type 下通用</Select.Option>
              {(SENSITIVE_SUBTYPE_OPTIONS[bindingScope]?.[bindingType] ?? []).map((o) => (
                <Select.Option key={o.value} value={o.value}>{o.label}（{o.value}）</Select.Option>
              ))}
            </Select>
          </div>
          <div>
            <label>绑定的敏感词表（多选，顺序即合并顺序）</label>
            <Select
              mode="multiple"
              value={bindingListIds}
              onChange={setBindingListIds}
              style={{ width: '100%' }}
              placeholder="选择要绑定的敏感词表"
            >
              {lists.filter((l) => l.is_active).map((l) => (
                <Select.Option key={l.id} value={l.id}>{l.name}</Select.Option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
