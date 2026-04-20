import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const input = "/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx";
const blob = await FileBlob.load(input);
const p = await PresentationFile.importPptx(blob);

console.log("slides", p.slides.count);
for (let i = 0; i < p.slides.count; i += 1) {
  const s = p.slides.getItem(i);
  const keys = Object.keys(s).sort();
  console.log(`slide ${i + 1} keys:`, keys.join(","));
  console.log(`  shapes=${s.shapes?.count ?? "na"} images=${s.images?.count ?? "na"} charts=${s.charts?.count ?? "na"} tables=${s.tables?.count ?? "na"}`);
  if (s.shapes?.count) {
    const sh = s.shapes.getItem(0);
    console.log("  shape0 keys:", Object.keys(sh).sort().join(","));
    if (sh.text) {
      console.log("  shape0 text keys:", Object.keys(sh.text).sort().join(","));
      console.log("  shape0 text:", JSON.stringify(String(sh.text).slice(0, 80)));
    }
  }
}
