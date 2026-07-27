#!/usr/bin/env python3
"""
小红书运营分析报告 - MD转PDF
MxM研究部 · 2026-04-23
"""

import markdown
import re
import sys
import os
from pathlib import Path

# ── 内容处理 ──────────────────────────────────────────────

def process_markdown(md_text):
    """将MD内容拆分为配置块、YAML元数据、body"""
    lines = md_text.splitlines()
    body_lines = []
    in_yaml = False
    front_matter = {}

    for line in lines:
        if line.strip() == '---':
            if not in_yaml:
                in_yaml = True
                continue
            else:
                in_yaml = False
                continue
        if not in_yaml:
            body_lines.append(line)

    return '\n'.join(body_lines)


def md_to_html(md_text):
    """Markdown → HTML，带头部和尾部完整文档"""
    body = process_markdown(md_text)

    # 启用必要扩展
    md = markdown.Markdown(
        extensions=[
            'tables',
            'fenced_code',
            'toc',
            'nl2br',
        ],
        extension_configs={
            'toc': {'title': '目录'}
        }
    )

    body_html = md.convert(body)

    # 生成目录（手动构建）
    toc_html = build_toc(body)

    # 封面HTML
    cover = build_cover()

    # 完整文档
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>小红书矩阵账号运营分析报告</title>
<style>
/* ── 全局重置 ── */
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
@page {{
  size: A4;
  margin: 0;
}}
body {{
  font-family: "PingFang SC", "Microsoft YaHei", "Heiti SC",
               "Source Han Sans CN", sans-serif;
  font-size: 10.5pt;
  line-height: 1.75;
  color: #1a1a1a;
  background: #ffffff;
}}

/* ── 封面 ── */
.cover-page {{
  width: 100%;
  height: 297mm;
  background: linear-gradient(160deg, #051C2C 0%, #0d3a5c 55%, #1a6b8a 100%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 0 55mm 0 45mm;
  position: relative;
  overflow: hidden;
  page-break-after: always;
}}
.cover-bg-text {{
  position: absolute;
  right: -20mm;
  top: 50%;
  transform: translateY(-50%);
  font-size: 180mm;
  font-weight: 900;
  color: rgba(255,255,255,0.03);
  letter-spacing: -10mm;
  user-select: none;
  line-height: 1;
  white-space: nowrap;
}}
.cover-org {{
  font-size: 11pt;
  letter-spacing: 3pt;
  color: rgba(255,255,255,0.55);
  text-transform: uppercase;
  margin-bottom: 12mm;
}}
.cover-title {{
  font-size: 26pt;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.3;
  margin-bottom: 10mm;
  max-width: 140mm;
}}
.cover-subtitle {{
  font-size: 12pt;
  color: rgba(255,255,255,0.65);
  margin-bottom: 30mm;
  max-width: 120mm;
  line-height: 1.6;
}}
.cover-meta {{
  display: flex;
  flex-direction: column;
  gap: 4mm;
}}
.cover-meta-item {{
  font-size: 9.5pt;
  color: rgba(255,255,255,0.5);
}}
.cover-meta-item span {{
  color: rgba(255,255,255,0.8);
  margin-left: 3mm;
}}
.cover-sep {{
  width: 35mm;
  height: 1pt;
  background: rgba(255,255,255,0.3);
  margin: 12mm 0;
}}
.cover-badge {{
  position: absolute;
  bottom: 18mm;
  right: 45mm;
  background: rgba(255,255,255,0.1);
  border: 1pt solid rgba(255,255,255,0.2);
  border-radius: 3mm;
  padding: 3mm 6mm;
  font-size: 8.5pt;
  color: rgba(255,255,255,0.6);
  letter-spacing: 1pt;
}}

/* ── 通用页面布局 ── */
.page {{
  width: 100%;
  min-height: 297mm;
  padding: 18mm 22mm 18mm 22mm;
  position: relative;
  page-break-after: always;
}}
.page:last-child {{ page-break-after: avoid; }}

/* ── 页眉 ── */
.header {{
  position: absolute;
  top: 10mm;
  left: 22mm;
  right: 22mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 0.5pt solid #d0d0d0;
  padding-bottom: 4mm;
}}
.header-org {{
  font-size: 8pt;
  color: #888;
  letter-spacing: 1pt;
}}
.header-title {{
  font-size: 8pt;
  color: #888;
}}
.header-page {{
  font-size: 8pt;
  color: #aaa;
}}
.header-accent {{
  width: 3mm;
  height: 3mm;
  background: #006BA6;
  border-radius: 50%;
  margin-right: 2mm;
  display: inline-block;
  vertical-align: middle;
}}

/* ── 章节标题 ── */
h1 {{
  font-size: 18pt;
  font-weight: 700;
  color: #051C2C;
  margin: 18mm 0 6mm 0;
  padding-bottom: 4mm;
  border-bottom: 2pt solid #051C2C;
  line-height: 1.3;
}}
h2 {{
  font-size: 13.5pt;
  font-weight: 700;
  color: #051C2C;
  margin: 10mm 0 4mm 0;
  padding-left: 4mm;
  border-left: 3pt solid #006BA6;
  line-height: 1.4;
}}
h3 {{
  font-size: 11pt;
  font-weight: 700;
  color: #1a3a50;
  margin: 7mm 0 3mm 0;
}}
h4 {{
  font-size: 10pt;
  font-weight: 700;
  color: #333;
  margin: 5mm 0 2mm 0;
}}

/* ── 段落 ── */
p {{
  margin-bottom: 3.5mm;
  text-align: justify;
  text-indent: 0;
}}

/* ── 列表 ── */
ul, ol {{
  margin: 3mm 0 4mm 5mm;
  padding-left: 2mm;
}}
li {{
  margin-bottom: 2mm;
  padding-left: 1mm;
}}
li::marker {{
  color: #006BA6;
  font-weight: 700;
}}

/* ── 强调 ── */
strong {{ color: #051C2C; font-weight: 700; }}
em {{ color: #555; font-style: italic; }}

/* ── 行内代码 ── */
code {{
  font-family: "SF Mono", "Menlo", "Consolas", monospace;
  font-size: 9pt;
  background: #f4f6f8;
  color: #c0392b;
  padding: 0.5mm 1.5mm;
  border-radius: 1mm;
  border: 0.3pt solid #e0e0e0;
}}

/* ── 代码块 ── */
pre {{
  background: #f4f6f8;
  border: 0.5pt solid #e0e0e0;
  border-left: 3pt solid #006BA6;
  border-radius: 2mm;
  padding: 4mm 5mm;
  margin: 4mm 0;
  overflow-x: auto;
  font-size: 8.5pt;
  line-height: 1.65;
  color: #2c3e50;
}}
pre code {{
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
}}

/* ── 表格 ── */
table {{
  width: 100%;
  border-collapse: collapse;
  margin: 5mm 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}}
thead tr {{
  background: #051C2C;
  color: #ffffff;
}}
thead th {{
  padding: 2.5mm 3mm;
  text-align: left;
  font-weight: 700;
  letter-spacing: 0.3pt;
}}
tbody tr:nth-child(even) {{
  background: #f7f9fb;
}}
tbody tr:hover {{
  background: #eef4f8;
}}
td {{
  padding: 2mm 3mm;
  border-bottom: 0.3pt solid #e0e0e0;
  vertical-align: top;
}}
td:first-child, th:first-child {{ border-left: none; }}
td:last-child, th:last-child {{ border-right: none; }}

/* ── 引用块 ── */
blockquote {{
  border-left: 3pt solid #006BA6;
  background: #f0f6fb;
  margin: 5mm 0;
  padding: 4mm 6mm;
  border-radius: 0 2mm 2mm 0;
  color: #34495e;
  font-style: normal;
}}
blockquote p {{ margin-bottom: 0; }}

/* ── 分隔线 ── */
hr {{
  border: none;
  border-top: 0.5pt solid #d0d0d0;
  margin: 8mm 0;
}}

/* ── 核心结论框 ── */
.conclusion-box {{
  background: #f0f6fb;
  border: 0.5pt solid #b8d4e8;
  border-left: 4pt solid #006BA6;
  border-radius: 2mm;
  padding: 5mm 7mm;
  margin: 6mm 0;
  page-break-inside: avoid;
}}
.conclusion-box h4 {{
  color: #006BA6;
  font-size: 10.5pt;
  margin: 0 0 3mm 0;
  border: none;
  padding: 0;
}}
.conclusion-box ul {{
  margin: 2mm 0 0 0;
}}
.conclusion-box li {{
  margin-bottom: 2mm;
}}

/* ── 目录页 ── */
.toc-page {{
  padding: 18mm 22mm;
  page-break-after: always;
}}
.toc-title {{
  font-size: 16pt;
  font-weight: 700;
  color: #051C2C;
  margin-bottom: 8mm;
  padding-bottom: 3mm;
  border-bottom: 2pt solid #051C2C;
}}
.toc-item {{
  display: flex;
  align-items: baseline;
  padding: 2.5mm 0;
  border-bottom: 0.3pt solid #eee;
  font-size: 10.5pt;
  color: #333;
  text-decoration: none;
}}
.toc-item:hover {{
  color: #006BA6;
}}
.toc-item-chapter {{
  color: #051C2C;
  font-weight: 700;
  min-width: 55mm;
}}
.toc-dots {{
  flex: 1;
  border-bottom: 1pt dotted #ccc;
  margin: 0 3mm 0 2mm;
  position: relative;
  top: -2mm;
}}
.toc-page-num {{
  font-size: 9pt;
  color: #999;
  min-width: 10mm;
  text-align: right;
}}

/* ── 核心发现框 ── */
.insight-block {{
  background: #051C2C;
  color: #ffffff;
  border-radius: 3mm;
  padding: 6mm 8mm;
  margin: 7mm 0;
  page-break-inside: avoid;
}}
.insight-block h4 {{
  color: #7ec8e8;
  font-size: 10pt;
  margin-bottom: 4mm;
  border: none;
  padding: 0;
}}
.insight-block p {{
  color: #e8f4f8;
  margin-bottom: 2mm;
  text-align: left;
}}
.insight-block strong {{
  color: #ffd700;
}}

/* ── 表格星标 ── */
.star {{ color: #e67e22; font-weight: 700; }}

/* ── 风险提示框 ── */
.warning-block {{
  background: #fff8f0;
  border: 0.5pt solid #f0d0b0;
  border-left: 3pt solid #e67e22;
  border-radius: 2mm;
  padding: 4mm 6mm;
  margin: 5mm 0;
  font-size: 9.5pt;
  color: #7a4a10;
  page-break-inside: avoid;
}}
.warning-block strong {{ color: #e67e22; }}

/* ── 阶段框 ── */
.phase-block {{
  border: 0.5pt solid #d0d0d0;
  border-radius: 2mm;
  margin: 5mm 0;
  overflow: hidden;
  page-break-inside: avoid;
}}
.phase-header {{
  background: #051C2C;
  color: white;
  padding: 2.5mm 5mm;
  font-size: 10pt;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
}}
.phase-body {{
  padding: 4mm 5mm;
  background: #fafcfe;
}}
.phase-body li {{
  margin-bottom: 1.5mm;
}}

/* ── 流程图样式 ── */
.pipeline {{
  background: #f7f9fb;
  border: 0.5pt solid #d0d0d0;
  border-radius: 2mm;
  padding: 5mm 6mm;
  margin: 5mm 0;
  font-family: "SF Mono", "Menlo", monospace;
  font-size: 8.5pt;
  line-height: 1.8;
  overflow-x: auto;
  white-space: pre;
  color: #2c3e50;
  page-break-inside: avoid;
}}

/* ── 页脚 ── */
.footer {{
  position: absolute;
  bottom: 10mm;
  left: 22mm;
  right: 22mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 8pt;
  color: #bbb;
  border-top: 0.5pt solid #e8e8e8;
  padding-top: 3mm;
}}

/* ── 资源消耗卡片 ── */
.resource-grid {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3mm;
  margin: 4mm 0;
  page-break-inside: avoid;
}}
.resource-card {{
  background: #f7f9fb;
  border: 0.5pt solid #d0d0d0;
  border-radius: 2mm;
  padding: 3mm 4mm;
}}
.resource-card-label {{
  font-size: 8pt;
  color: #888;
  margin-bottom: 1mm;
}}
.resource-card-value {{
  font-size: 12pt;
  font-weight: 700;
  color: #051C2C;
}}
.resource-card-sub {{
  font-size: 8pt;
  color: #888;
  margin-top: 1mm;
}}

/* ── 账号矩阵卡片 ── */
.account-grid {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3mm;
  margin: 4mm 0;
  page-break-inside: avoid;
}}
.account-card {{
  border: 0.5pt solid #d0d0d0;
  border-radius: 2mm;
  padding: 4mm;
  background: white;
}}
.account-card-name {{
  font-size: 10pt;
  font-weight: 700;
  color: #051C2C;
  margin-bottom: 2mm;
}}
.account-card-tag {{
  display: inline-block;
  background: #006BA6;
  color: white;
  font-size: 7.5pt;
  padding: 0.5mm 2mm;
  border-radius: 1mm;
  margin-bottom: 2mm;
}}
.account-card-info {{
  font-size: 8.5pt;
  color: #666;
  line-height: 1.6;
}}

/* ── star rating helper ── */
.stars {{ font-size: 9pt; }}

/* ── 小注释 ── */
.footnote {{
  font-size: 8pt;
  color: #999;
  margin-top: 2mm;
}}

/* ── 打印优化 ── */
@media print {{
  .page {{ page-break-after: always; }}
  .page:last-child {{ page-break-after: avoid; }}
  body {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
}}

/* ── 分栏helper ── */
.two-col {{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6mm;
}}
.three-col {{
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4mm;
}}
.col {{ page-break-inside: avoid; }}
</style>
</head>
<body>

{cover}

<div class="toc-page">
<div class="toc-title">目  录</div>
{toc_html}
</div>

<div class="page">
<div class="header">
  <div><span class="header-accent"></span><span class="header-org">MxM研究部</span></div>
  <div class="header-title">小红书矩阵账号运营分析报告</div>
  <div class="header-page"></div>
</div>

{body_html}

<div class="footer">
  <span>内部资料 · 请勿外传</span>
  <span>MxM研究部 · 2026-04-23</span>
  <span></span>
</div>
</div>

</body>
</html>"""


def build_cover():
    """生成封面HTML"""
    return """
<div class="cover-page">
  <div class="cover-bg-text">XHS</div>
  <div class="cover-org">MxM Research Division</div>
  <div class="cover-title">小红书矩阵账号<br>运营分析报告</div>
  <div class="cover-subtitle">
    基于MiniMax全模态Token Plan生成能力<br>
    × 小红书2025-2026热门内容赛道匹配研究
  </div>
  <div class="cover-sep"></div>
  <div class="cover-meta">
    <div class="cover-meta-item">编制机构 <span>MxM研究部 · AI能力评估组</span></div>
    <div class="cover-meta-item">报告日期 <span>2026年04月23日</span></div>
    <div class="cover-meta-item">报告性质 <span>内部战略研究资料</span></div>
    <div class="cover-meta-item">密级标注 <span>内部参考 · INTERNAL</span></div>
  </div>
  <div class="cover-badge">CONFIDENTIAL · INTERNAL USE ONLY</div>
</div>
"""


def build_toc(body_md):
    """从markdown body提取章节构建目录"""
    lines = body_md.splitlines()
    toc_items = []
    for line in lines:
        m = re.match(r'^(#{1,3})\s+(.+)$', line)
        if m:
            level = len(m.group(1))
            title = m.group(2).strip().rstrip(':：')
            # 清理markdown标记
            title = re.sub(r'\*\*(.+?)\*\*', r'\1', title)
            title = re.sub(r'\*(.+?)\*', r'\1', title)
            title = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', title)
            indent = (level - 1) * 8
            if level == 1:
                toc_items.append(f'<div class="toc-item" style="margin-left:{indent}mm"><span class="toc-item-chapter">{title}</span><span class="toc-dots"></span><span class="toc-page-num"></span></div>')
            elif level == 2:
                toc_items.append(f'<div class="toc-item" style="margin-left:{indent}mm"><span class="toc-item-chapter">{title}</span><span class="toc-dots"></span><span class="toc-page-num"></span></div>')
    return '\n'.join(toc_items)


def post_process_html(html):
    """对HTML做后处理——处理表格、列表、流程图等"""
    # 表格标题行加粗
    html = re.sub(r'<thead>', '<thead>\n<tr>', html)
    html = re.sub(r'</thead>', '</tr>\n</thead>', html)

    # 给结论部分加 conclusion-box
    html = re.sub(
        r'(<h1>九、核心结论</h1>)',
        r'\1\n<div class="conclusion-box">\n<h4>报告核心结论</h4>',
        html
    )
    # 在九结尾前关闭结论框
    html = re.sub(
        r'(<hr>\s*<p><em>本报告由)',
        r'</div>\n\1',
        html
    )

    # 处理流程图/代码块 -> pipeline类
    html = re.sub(
        r'<pre><code>┌─',
        '<div class="pipeline">┌─',
        html
    )
    html = re.sub(
        r'</code></pre>',
        '</div>',
        html
    )

    return html


# ── 主程序 ──────────────────────────────────────────────

def main():
    script_dir = Path(__file__).parent
    md_path = script_dir / 'XIAOHONGSHU_OPERATION_REPORT.md'
    pdf_path = script_dir / 'XIAOHONGSHU_OPERATION_REPORT.pdf'
    html_path = script_dir / 'XIAOHONGSHU_OPERATION_REPORT.html'

    if not md_path.exists():
        print(f"错误: 找不到 {md_path}", file=sys.stderr)
        sys.exit(1)

    md_text = md_path.read_text(encoding='utf-8')
    print(f"读取 MD: {md_path} ({len(md_text)} chars)")

    # MD → HTML
    html = md_to_html(md_text)
    html = post_process_html(html)

    # 保存中间 HTML（调试用）
    html_path.write_text(html, encoding='utf-8')
    print(f"中间 HTML 已保存: {html_path}")

    # HTML → PDF via Chrome headless
    print("正在生成 PDF（Chrome headless）...")
    import subprocess

    html_file = script_dir / 'XIAOHONGSHU_OPERATION_REPORT.html'
    html_file.write_text(html, encoding='utf-8')
    chrome_path = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

    result = subprocess.run(
        [
            str(chrome_path),
            '--headless=new',
            '--disable-gpu',
            '--no-pdf-header-footer',
            f'--print-to-pdf={pdf_path}',
            '--print-to-pdf-no-header',
            str(html_file),
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        print(f"Chrome stderr: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    if not pdf_path.exists():
        print(f"PDF 未生成: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    print(f"✅ PDF 生成成功: {pdf_path}")
    print(f"   文件大小: {pdf_path.stat().st_size / 1024:.1f} KB")


if __name__ == '__main__':
    main()
