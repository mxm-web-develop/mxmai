import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, PresentationFile } from '@oai/artifact-tool';

const input = '/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx';
const outDir = '/Users/mxm_pro/Desktop/codes/supermxmai/tmp/slides/ppt-beautify/input-preview';
await fs.mkdir(outDir, { recursive: true });

const p = await PresentationFile.importPptx(await FileBlob.load(input));
for (let i = 0; i < p.slides.items.length; i += 1) {
  const slide = p.slides.items[i];
  const pngBlob = await p.export({ slide, format: 'png', scale: 1 });
  const arr = await pngBlob.arrayBuffer();
  const out = path.join(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
  await fs.writeFile(out, Buffer.from(arr));
  console.log(out);
}
