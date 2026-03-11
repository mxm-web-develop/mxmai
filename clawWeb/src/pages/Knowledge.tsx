import { useState } from 'react';
import { useI18n } from '../context/I18nContext';

export function KnowledgePage() {
  const { t } = useI18n();
  const [documents, setDocuments] = useState<any[]>([
    { id: 1, title: '产品文档', type: '文档', size: '2.4MB', date: '2024-03-09' },
    { id: 2, title: '用户手册', type: 'PDF', size: '1.8MB', date: '2024-03-08' },
    { id: 3, title: '技术规范', type: '文档', size: '3.2MB', date: '2024-03-07' },
  ]);

  return (
    <div className="knowledge-page">
      <div className="page-header">
        <h1>{t('sidebar.knowledge')}</h1>
        <p>管理知识库文档和资料</p>
      </div>

      <div className="knowledge-content">
        <div className="knowledge-actions">
          <button className="btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            上传文档
          </button>
          <button className="btn-secondary">创建文件夹</button>
        </div>

        <div className="documents-table">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>类型</th>
                <th>大小</th>
                <th>上传时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.title}</td>
                  <td>
                    <span className={`doc-type ${doc.type}`}>
                      {doc.type}
                    </span>
                  </td>
                  <td>{doc.size}</td>
                  <td>{doc.date}</td>
                  <td>
                    <div className="doc-actions">
                      <button className="btn-small">查看</button>
                      <button className="btn-small">下载</button>
                      <button className="btn-small btn-danger">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}