import { FileBlob, PresentationFile } from '@oai/artifact-tool';

function safe(fn) {
  try {
    fn();
  } catch (e) {
    console.log('op-failed', e?.message || String(e));
  }
}

try {
  const p = await PresentationFile.importPptx(await FileBlob.load('/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx'));
  const s = p.slides.items[2];
  const shape = s.shapes.items[1];
  console.log('target text', shape.text.paragraphs.toPlainText().slice(0,80));

  safe(() => { shape.text.color = '#0A3A78'; });
  safe(() => { shape.text.bold = true; });
  safe(() => { shape.text.fontSize = 24; });
  safe(() => { shape.text.alignment = 'left'; });
  safe(() => { shape.text.verticalAlignment = 'middle'; });
  safe(() => { shape.text.defaultTextStyle.typeface = 'PingFang SC'; });
  safe(() => { shape.text.defaultTextStyle.fill = '#0A3A78'; });
  safe(() => { shape.text.defaultTextStyle.color = '#0A3A78'; });
  safe(() => { shape.text.defaultTextStyle.family = 'PingFang SC'; });
  safe(() => { shape.text.insets = { left: 10, right: 10, top: 10, bottom: 10 }; });
  safe(() => { shape.fill = '#F2F7FF'; });
  safe(() => { shape.line = { style: 'solid', fill: '#C8DAF8', width: 1 }; });

  for (const para of shape.text.paragraphs.items) {
    safe(() => { para.lineSpacingPercent = 122; });
    safe(() => { para.spaceAfter = 250; });
  }

  const out = await PresentationFile.exportPptx(p);
  await out.save('/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰-test-style.pptx');
  console.log('ok');
} catch (err) {
  console.error('ERR', err?.message || String(err));
}
