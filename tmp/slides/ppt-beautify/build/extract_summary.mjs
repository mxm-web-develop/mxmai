import { FileBlob, PresentationFile } from '@oai/artifact-tool';

const input = '/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx';
const p = await PresentationFile.importPptx(await FileBlob.load(input));

for (let i = 0; i < p.slides.items.length; i += 1) {
  const s = p.slides.items[i];
  const shapeCount = s.shapes.items.length;
  const imgCount = s.images.items.length;
  const chartCount = s.charts.items.length;
  const tableCount = s.tables.items.length;
  const textBits = [];
  for (const sh of s.shapes.items) {
    const txt = sh.text?.paragraphs?.toPlainText?.() ?? '';
    const t = String(txt).replace(/\s+/g, ' ').trim();
    if (t) textBits.push(t.slice(0, 80));
  }
  console.log(`slide ${String(i + 1).padStart(2, '0')}: shapes=${shapeCount}, images=${imgCount}, charts=${chartCount}, tables=${tableCount}`);
  if (textBits.length) {
    console.log(`  text: ${textBits.slice(0, 6).join(' | ')}`);
  }
}
