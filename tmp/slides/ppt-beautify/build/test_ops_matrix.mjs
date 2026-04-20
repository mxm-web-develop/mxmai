import { FileBlob, PresentationFile } from '@oai/artifact-tool';

const ops = {
  text_color: (shape) => { shape.text.color = '#0A3A78'; },
  text_bold: (shape) => { shape.text.bold = true; },
  text_size: (shape) => { shape.text.fontSize = 24; },
  text_align: (shape) => { shape.text.alignment = 'left'; },
  text_valign: (shape) => { shape.text.verticalAlignment = 'middle'; },
  default_typeface: (shape) => { shape.text.defaultTextStyle.typeface = 'PingFang SC'; },
  default_fill: (shape) => { shape.text.defaultTextStyle.fill = '#0A3A78'; },
  default_color: (shape) => { shape.text.defaultTextStyle.color = '#0A3A78'; },
  default_family: (shape) => { shape.text.defaultTextStyle.family = 'PingFang SC'; },
  text_insets: (shape) => { shape.text.insets = { left: 10, right: 10, top: 10, bottom: 10 }; },
  shape_fill: (shape) => { shape.fill = '#F2F7FF'; },
  shape_line: (shape) => { shape.line = { style: 'solid', fill: '#C8DAF8', width: 1 }; },
  para_linespace: (shape) => {
    for (const para of shape.text.paragraphs.items) para.lineSpacingPercent = 122;
  },
  para_space_after: (shape) => {
    for (const para of shape.text.paragraphs.items) para.spaceAfter = 250;
  },
};

for (const [name, op] of Object.entries(ops)) {
  try {
    const p = await PresentationFile.importPptx(await FileBlob.load('/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx'));
    const shape = p.slides.items[2].shapes.items[1];
    op(shape);
    const out = await PresentationFile.exportPptx(p);
    await out.save(`/Users/mxm_pro/Desktop/codes/supermxmai/tmp/slides/ppt-beautify/${name}.pptx`);
    console.log('PASS', name);
  } catch (err) {
    console.log('FAIL', name, '-', err?.message || String(err));
  }
}
