import { useState } from 'react';
import { listKnowledgeBases, getKnowledgeBase, searchKnowledgeBase } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Knowledge() {
  const { isLoggedIn } = useAuth();
  const [listRes, setListRes] = useState<string>('');
  const [baseId, setBaseId] = useState('');
  const [detailRes, setDetailRes] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRes, setSearchRes] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleList = async () => {
    if (!isLoggedIn) return setListRes('请先登录');
    setLoading(true);
    const res = await listKnowledgeBases();
    setLoading(false);
    setListRes(JSON.stringify(res, null, 2));
  };

  const handleDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn || !baseId.trim()) return setDetailRes('请先登录并填写知识库 ID');
    setLoading(true);
    const res = await getKnowledgeBase(baseId.trim());
    setLoading(false);
    setDetailRes(JSON.stringify(res, null, 2));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn || !baseId.trim() || !searchQuery.trim()) return setSearchRes('请先登录并填写知识库 ID、检索 query');
    setLoading(true);
    const res = await searchKnowledgeBase(baseId.trim(), { query: searchQuery.trim(), limit: 5 });
    setLoading(false);
    setSearchRes(JSON.stringify(res, null, 2));
  };

  return (
    <section className="page-card">
      <h2>知识库</h2>
      <p className="hint">GET /api/v1/knowledge/bases 列表；GET /api/v1/knowledge/bases/:id 详情；POST /api/v1/knowledge/bases/:id/search 检索。写作/大纲可带 knowledgeBase 参数注入检索结果。</p>
      <div className="form-group">
        <button type="button" onClick={handleList} disabled={loading}>GET 知识库列表</button>
        {listRes && <pre className="response">{listRes}</pre>}
      </div>
      <hr />
      <form onSubmit={handleDetail} className="form-group">
        <label>知识库 ID</label>
        <input value={baseId} onChange={(e) => setBaseId(e.target.value)} placeholder="base uuid" />
        <button type="submit" disabled={loading}>GET 知识库详情</button>
        {detailRes && <pre className="response">{detailRes}</pre>}
      </form>
      <hr />
      <form onSubmit={handleSearch} className="form-group">
        <label>检索 query</label>
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="检索关键词" />
        <button type="submit" disabled={loading}>POST 检索</button>
        {searchRes && <pre className="response">{searchRes}</pre>}
      </form>
    </section>
  );
}
