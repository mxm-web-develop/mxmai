import util from 'node:util';
import { FileBlob, PresentationFile } from '@oai/artifact-tool';
const p = await PresentationFile.importPptx(await FileBlob.load('/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx'));
const sh = p.slides.items[0].shapes.items[0];
console.log('defaultTextStyle', util.inspect(sh.text.defaultTextStyle, {depth:3, showHidden:true, maxArrayLength:20}));
console.log('defaultTextStyle proto', Object.getOwnPropertyNames(Object.getPrototypeOf(sh.text.defaultTextStyle)).slice(0,220));
const para = sh.text.paragraphs.items[0];
console.log('para inspect', util.inspect(para, {depth:3, showHidden:true, maxArrayLength:20}));
console.log('para proto', Object.getOwnPropertyNames(Object.getPrototypeOf(para)).slice(0,220));
if (para.runs?.items?.length) {
  const run = para.runs.items[0];
  console.log('run inspect', util.inspect(run, {depth:3, showHidden:true, maxArrayLength:20}));
  console.log('run proto', Object.getOwnPropertyNames(Object.getPrototypeOf(run)).slice(0,220));
}
