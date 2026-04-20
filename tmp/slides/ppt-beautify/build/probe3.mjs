import { FileBlob, PresentationFile } from "@oai/artifact-tool";
const p = await PresentationFile.importPptx(await FileBlob.load('/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx'));
const s = p.slides.getItem(0);
console.log('shape count', s.shapes.count);
console.log('image count', s.images.count);
console.log('table count', s.tables.count);
console.log('chart count', s.charts.count);
const sh = s.shapes.getItem(0);
console.log('shape proto', Object.getOwnPropertyNames(Object.getPrototypeOf(sh)).slice(0,120));
console.log('shape geometry', sh.geometry);
console.log('has text', !!sh.text);
if (sh.text) {
  console.log('text value type', typeof sh.text.value, JSON.stringify(sh.text.value?.slice?.(0,60)));
  console.log('text object keys', Object.getOwnPropertyNames(Object.getPrototypeOf(sh.text)).slice(0,150));
}
