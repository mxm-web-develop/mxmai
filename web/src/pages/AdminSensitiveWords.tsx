/**
 * Admin：敏感词库管理
 * 仅负责：敏感词表 CRUD、敏感词条 CRUD
 * 业务挂载（scope/type/subtype 绑定）在「业务管理 -> 基础配置」里操作。
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
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { pageCardTitle } from '../components/PageHint';
import { App, Button, Input, Table, Modal, Space } from 'antd';

export default function AdminSensitiveWords({ embedded }: { embedded?: boolean } = {}) {
  const { message, modal } = App.useApp();
  const { isLoggedIn, isAdmin } = useAuth();
  const [lists, setLists] = useState<{ id: string; name: string; description?: string | null; is_active: boolean }[]>([]);
  const [words, setWords] = useState<{ id: string; list_id: string; word: string }[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalList, setModalList] = useState<'create' | 'edit' | 'words' | null>(null);
  const [editListId, setEditListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [newWord, setNewWord] = useState('');
  const [batchWords, setBatchWords] = useState('');

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

  useEffect(() => {
    if (isLoggedIn && isAdmin) {
      loadLists();
    }
  }, [isLoggedIn, isAdmin, loadLists]);

  useEffect(() => {
    if (selectedListId) loadWords(selectedListId);
    else setWords([]);
  }, [selectedListId, loadWords]);

  if (!isLoggedIn || !isAdmin) {
    return (
      embedded ? (
        <div>
          <p>请先使用 Admin 账号登录。</p>
        </div>
      ) : (
        <div className="page-card">
          <h2>敏感词管理</h2>
          <p>请先使用 Admin 账号登录。</p>
        </div>
      )
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
    modal.confirm({
      title: '确认删除',
      content: '删除敏感词表后，其下所有词条将失效，是否继续？',
      onOk: async () => {
        const res = await deleteSensitiveWordList(listId);
        if (res.error) message.error(res.error);
        else {
          message.success('已删除');
          if (selectedListId === listId) setSelectedListId(null);
          loadLists();
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
    modal.confirm({
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

  // 业务绑定已迁移到「业务管理 -> 基础配置」

  const content = (
    <div className="admin-sensitive-words-page">
      {!embedded && (
        <>
          <h2>
            {pageCardTitle('敏感词管理（Admin）', {
              title: '功能说明',
              description:
                '管理敏感词表、词条，以及按业务 slot (scope / type / subtype) 绑定使用的敏感词表；一个业务可绑定多张表，校验时合并检查。',
            })}
          </h2>
        </>
      )}

      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" onClick={() => { setModalList('create'); setNewListName(''); setNewListDesc(''); }}>
            新建敏感词表
          </Button>
        </Space>
      </div>

      <div className="admin-sensitive-words-content-wrap">
        <div className="admin-sensitive-words-content-inner">
      <h3>敏感词表列表</h3>
      <div className="table-scroll-wrapper">
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
      </div>

      {selectedListId && (
        <>
          <h3 style={{ marginTop: 24 }}>当前表词条：{lists.find((l) => l.id === selectedListId)?.name ?? selectedListId}</h3>
          <Space style={{ marginBottom: 8 }} wrap>
            <Input placeholder="添加一条敏感词" value={newWord} onChange={(e) => setNewWord(e.target.value)} onPressEnter={handleAddWord} style={{ width: 160 }} />
            <Button type="primary" onClick={handleAddWord} loading={loading}>添加</Button>
            <Button onClick={() => { setModalList('words'); setBatchWords(''); }}>批量添加</Button>
          </Space>
          <div className="table-scroll-wrapper">
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
          </div>
        </>
      )}

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

    </div>
  );

  return embedded ? content : <div className="page-card">{content}</div>;
}
