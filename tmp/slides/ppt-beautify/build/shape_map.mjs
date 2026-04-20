import { FileBlob, PresentationFile } from '@oai/artifact-tool';

function clean(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
const p = await PresentationFile.importPptx(await FileBlob.load('/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx'));
for (let i = 0; i < p.slides.items.length; i += 1) {
  const s = p.slides.items[i];
  console.log(`\n=== Slide ${i+1} ===`);
  for (let j = 0; j < s.shapes.items.length; j += 1) {
    const sh = s.shapes.items[j];
    const pos = sh.position || {};
    const txt = clean(sh.text?.paragraphs?.toPlainText?.() || '').slice(0, 120);
    const fs = sh.text?.fontSize;
    const bold = sh.text?.bold;
    console.log(`${String(j+1).padStart(2,'0')} id=${sh.id} name=${sh.name || ''} x=${Math.round(pos.left||0)} y=${Math.round(pos.top||0)} w=${Math.round(pos.width||0)} h=${Math.round(pos.height||0)} fs=${fs ?? 'na'} bold=${bold ?? 'na'} text=${txt}`);
  }
  if (s.images.items.length) {
    console.log(`images=${s.images.items.length}`);
    for (let k=0;k<s.images.items.length;k++) {
      const im=s.images.items[k];
      const pz=im.position||{};
      console.log(`  img${k+1} x=${Math.round(pz.left||0)} y=${Math.round(pz.top||0)} w=${Math.round(pz.width||0)} h=${Math.round(pz.height||0)}`);
    }
  }
}
