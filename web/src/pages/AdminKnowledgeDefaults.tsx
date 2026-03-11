/**
 * Admin：系统知识库管理
 * 配置各业务 (scope, category, sub_type) 默认使用的知识库
 */
import { useState, useEffect, useCallback } from 'react';
import {
  getKnowledgeAdminDefaults,
  setKnowledgeAdminDefault,
  deleteKnowledgeAdminDefault,
  listKnowledgeBases,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Table, message, Modal, Select, Input } from 'antd';

interface DefaultRow {
  scope: string;
  category: string;
  sub_type: string;
  knowledge_base_id: string;
}

export default function AdminKnowledgeDefaults() {
  const { isLoggedIn, isAdmin } = useAuth();
  const [defaults, setDefaults] = useState<DefaultRow[]>([]);
  const [bases, setBases] = useState<{ id: string; name?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [scope, setScope] = useState('writing');
  const [category, setCategory] = useState('articles');
  const [subType, setSubType] = useState('');
  const [knowledgeBaseId, setKnowledgeBaseId] = useState('');

  const loadDefaults = useCallback(async (scopeFilter?: string) => {
    const res = await getKnowledgeAdminDefaults(scopeFilter);
    if (!res.error && res.data) {
      const raw = res.data as any;
      const list = raw?.data?.defaults ?? raw?.defaults ?? [];
      if (Array.isArray(list)) setDefaults(list as DefaultRow[]);
    }
  }, []);

  const loadBases = useCallback(async () => {
    const res = await listKnowledgeBases();
    if (!res.error && res.data) {
      const raw = res.data as { data?: { knowledge_bases?: { id: string; name?: string }[] }; knowledge_bases?: { id: string; name?: string }[] };
      const list = raw?.data?.knowledge_bases ?? raw?.knowledge_bases ?? [];
      setBases(Array.isArray(list) ? list : []);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && isAdmin) {
      loadDefaults();
      loadBases();
    }
  }, [isLoggedIn, isAdmin, loadDefaults, loadBases]);

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="page-card">
        <h2>系统知识库管理</h2>
        <p>请先使用 Admin 账号登录。</p>
      </div>
    );
  }

  const handleAdd = () => {
    setScope('writing');
    setCategory('articles');
    setSubType('');
    setKnowledgeBaseId('');
    setModalOpen(true);
  };

  const handleSaveDefault = async () => {
    const sub = subType.trim();
    if (!scope || !category || !knowledgeBaseId) {
      message.warning('请填写 scope、category 和选择知识库');
      return;
    }
    setLoading(true);
    const res = await setKnowledgeAdminDefault({
      scope,
      category,
      sub_type: sub || category,
      knowledge_base_id: knowledgeBaseId,
    });
    setLoading(false);
    if (res.error) message.error(res.error);
    else {
      message.success('已保存');
      setModalOpen(false);
      loadDefaults();
    }
  };

  const handleDelete = (scopeVal: string, categoryVal: string, subTypeVal: string) => {
    Modal.confirm({
      title: '确认删除',
      content: `删除绑定：${scopeVal} / ${categoryVal} / ${subTypeVal}？`,
      onOk: async () => {
        const res = await deleteKnowledgeAdminDefault(scopeVal, categoryVal, subTypeVal);
        if (res.error) message.error(res.error);
        else {
          message.success('已删除');
          loadDefaults();
        }
      },
    });
  };

  return (
    <div className="page-card admin-knowledge-defaults-page">
      <h2>系统知识库管理（Admin）</h2>
      <p className="hint">
        配置各业务 (scope, category, sub_type) 默认使用的知识库。写作/图文等业务在「提示词工程」中开启知识库后，会按此处绑定召回对应知识库内容。
      </p>

      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={handleAdd}>新增默认绑定</Button>
      </div>

      <div className="admin-knowledge-defaults-table-wrap">
        <div className="admin-knowledge-defaults-table-inner">
      <Table
        size="small"
        dataSource={defaults}
        rowKey={(r) => `${r.scope}-${r.category}-${r.sub_type}`}
        columns={[
          { title: 'scope', dataIndex: 'scope', width: 100 },
          { title: 'category', dataIndex: 'category', width: 120 },
          { title: 'sub_type', dataIndex: 'sub_type', width: 140 },
          { title: 'knowledge_base_id', dataIndex: 'knowledge_base_id' },
          {
            title: '操作',
            width: 80,
            render: (_: unknown, r: DefaultRow) => (
              <Button size="small" danger onClick={() => handleDelete(r.scope, r.category, r.sub_type)}>删除</Button>
            ),
          },
        ]}
        pagination={false}
      />
        </div>
      </div>

      <Modal
        title="新增/编辑默认知识库绑定"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSaveDefault}
        confirmLoading={loading}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label>scope</label>
            <Select value={scope} onChange={setScope} style={{ width: '100%' }}>
              <Select.Option value="writing">writing</Select.Option>
              <Select.Option value="graph">graph</Select.Option>
            </Select>
          </div>
          <div>
            <label>category（如 writing_type：articles / outlines）</label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="articles / outlines / photograph" />
          </div>
          <div>
            <label>sub_type（细分，如 outline_type：tech-article）</label>
            <Input value={subType} onChange={(e) => setSubType(e.target.value)} placeholder="可选，留空则用 category" />
          </div>
          <div>
            <label>知识库</label>
            <Select
              value={knowledgeBaseId}
              onChange={setKnowledgeBaseId}
              style={{ width: '100%' }}
              placeholder="选择知识库"
              showSearch
              optionFilterProp="label"
              options={bases.map((b) => ({ value: b.id, label: b.name ? `${b.name} (${b.id})` : b.id }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
