import { FileBlob, PresentationFile } from '@oai/artifact-tool';

try {
  const p = await PresentationFile.importPptx(await FileBlob.load('/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx'));
  const s = p.slides.items[1];
  const sh = s.shapes.add({
    geometry: 'rect',
    position: { left: 0, top: 0, width: 200, height: 40 },
    fill: '#FFFFFF',
    line: { style: 'solid', fill: '#CCCCCC', width: 1 },
  });
  sh.text = 'test';
  const out = await PresentationFile.exportPptx(p);
  await out.save('/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰-test-add.pptx');
  console.log('ok');
} catch (err) {
  console.error('ERR', err?.message || String(err));
}
