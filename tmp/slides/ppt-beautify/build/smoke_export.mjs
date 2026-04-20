import { FileBlob, PresentationFile } from '@oai/artifact-tool';

try {
  const p = await PresentationFile.importPptx(await FileBlob.load('/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx'));
  const out = await PresentationFile.exportPptx(p);
  await out.save('/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰-smoke.pptx');
  console.log('ok');
} catch (err) {
  console.error('ERR', err?.message || String(err));
}
