import { useState } from 'react';
import { useI18n } from '../context/I18nContext';

export function GraphPage() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [images, setImages] = useState<any[]>([
    { id: 1, url: 'https://via.placeholder.com/300x200', prompt: '美丽的风景画', date: '2024-03-09' },
    { id: 2, url: 'https://via.placeholder.com/300x200', prompt: '未来城市', date: '2024-03-08' },
    { id: 3, url: 'https://via.placeholder.com/300x200', prompt: '抽象艺术', date: '2024-03-07' },
  ]);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    
    setGenerating(true);
    // 模拟生成过程
    setTimeout(() => {
      const newImage = {
        id: images.length + 1,
        url: 'https://via.placeholder.com/300x200',
        prompt,
        date: new Date().toISOString().split('T')[0],
      };
      setImages([newImage, ...images]);
      setPrompt('');
      setGenerating(false);
    }, 2000);
  };

  return (
    <div className="graph-page">
      <div className="page-header">
        <h1>{t('sidebar.graph')}</h1>
        <p>使用AI生成图片</p>
      </div>

      <div className="graph-generator">
        <div className="generator-input">
          <textarea
            className="prompt-input"
            placeholder="描述你想要生成的图片..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />
          <button
            className={`generate-btn ${generating ? 'generating' : ''}`}
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
          >
            {generating ? '生成中...' : '生成图片'}
          </button>
        </div>

        <div className="generator-options">
          <div className="option-group">
            <label>风格</label>
            <select defaultValue="realistic">
              <option value="realistic">写实风格</option>
              <option value="anime">动漫风格</option>
              <option value="oil-painting">油画风格</option>
              <option value="watercolor">水彩风格</option>
            </select>
          </div>
          
          <div className="option-group">
            <label>尺寸</label>
            <select defaultValue="1024x1024">
              <option value="512x512">512x512</option>
              <option value="768x768">768x768</option>
              <option value="1024x1024">1024x1024</option>
              <option value="1024x768">1024x768</option>
            </select>
          </div>
          
          <div className="option-group">
            <label>数量</label>
            <select defaultValue="4">
              <option value="1">1张</option>
              <option value="2">2张</option>
              <option value="4">4张</option>
              <option value="8">8张</option>
            </select>
          </div>
        </div>
      </div>

      <div className="images-grid">
        <h2>生成的图片</h2>
        <div className="images-container">
          {images.map((image) => (
            <div key={image.id} className="image-card">
              <img src={image.url} alt={image.prompt} />
              <div className="image-info">
                <p className="image-prompt">{image.prompt}</p>
                <p className="image-date">{image.date}</p>
                <div className="image-actions">
                  <button className="btn-secondary">下载</button>
                  <button className="btn-secondary">编辑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}