import util from "node:util";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const p = await PresentationFile.importPptx(await FileBlob.load("/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx"));
console.log("presentation proto methods", Object.getOwnPropertyNames(Object.getPrototypeOf(p)).slice(0,80));
console.log("slides type", typeof p.slides, util.inspect(p.slides, {depth: 2, showHidden: true, maxArrayLength: 20}));
console.log("slides proto", Object.getOwnPropertyNames(Object.getPrototypeOf(p.slides)).slice(0,80));
const s = p.slides.getItem(0);
console.log("slide inspect", util.inspect(s, {depth:2, showHidden:true, maxArrayLength:20}));
console.log("slide proto", Object.getOwnPropertyNames(Object.getPrototypeOf(s)).slice(0,120));
try {
  console.log("slide objects", s.objects?.count, util.inspect(s.objects, {depth:2, showHidden:true, maxArrayLength:20}));
  console.log("slide objects proto", s.objects ? Object.getOwnPropertyNames(Object.getPrototypeOf(s.objects)).slice(0,80):null);
} catch (e) {
  console.log("objects err", e.message);
}
