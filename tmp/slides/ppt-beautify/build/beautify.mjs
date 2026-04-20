import { FileBlob, PresentationFile } from '@oai/artifact-tool';

const INPUT = '/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰.pptx';
const OUTPUT = '/Users/mxm_pro/Desktop/晋升答辩模板-张瀚峰-美化版.pptx';

const COLORS = {
  bg: '#F7FAFC',
  title: '#0A3A78',
  titleDark: '#082C5C',
  text: '#1F2A37',
  muted: '#4B5B72',
  accent: '#1D5FBF',
  accentSoft: '#EAF2FF',
  card: '#F2F7FF',
  cardLine: '#C8DAF8',
  white: '#FFFFFF',
  whiteSoft: '#E8EFFA',
};

const FONT = {
  title: 'PingFang SC',
  body: 'PingFang SC',
};

function safeText(shape) {
  try {
    return String(shape?.text?.paragraphs?.toPlainText?.() ?? '').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

function safePosition(shape) {
  try {
    return shape?.position || {};
  } catch {
    return {};
  }
}

function applyTypeface(textObj, face) {
  try {
    if (textObj?.defaultTextStyle) {
      textObj.defaultTextStyle.typeface = face;
      textObj.defaultTextStyle.family = face;
    }
  } catch {
    // no-op
  }
  try {
    const paras = textObj?.paragraphs?.items || [];
    for (const para of paras) {
      const runs = para?.runs?.items || [];
      for (const run of runs) {
        if (!run?.textStyle) continue;
        run.textStyle.typeface = face;
        run.textStyle.family = face;
      }
    }
  } catch {
    // no-op
  }
}

function styleTextBox(shape, { color, bold, fontSize, align, valign, insets }) {
  const text = shape?.text;
  if (!text) return;

  applyTypeface(text, FONT.body);

  if (color) {
    try {
      text.color = color;
    } catch {
      // no-op
    }
    try {
      text.defaultTextStyle.color = color;
      text.defaultTextStyle.fill = color;
    } catch {
      // no-op
    }
  }
  if (bold !== undefined) {
    try {
      text.bold = bold;
    } catch {
      // no-op
    }
  }
  if (fontSize !== undefined) {
    try {
      text.fontSize = fontSize;
    } catch {
      // no-op
    }
    try {
      text.defaultTextStyle.fontSize = fontSize;
    } catch {
      // no-op
    }
  }
  if (align) {
    try {
      text.alignment = align;
    } catch {
      // no-op
    }
  }
  if (valign) {
    try {
      text.verticalAlignment = valign;
    } catch {
      // no-op
    }
  }
  if (insets) {
    try {
      text.insets = insets;
      text.defaultTextStyle.insets = insets;
    } catch {
      // no-op
    }
  }
}

function addTopDecoration(slide, pageNo, total) {
  const topBand = slide.shapes.add({
    geometry: 'rect',
    position: { left: 0, top: 0, width: 1280, height: 110 },
    fill: COLORS.white,
    line: { style: 'solid', fill: COLORS.white, width: 0 },
  });
  topBand.zIndex = 0;

  const accentLine = slide.shapes.add({
    geometry: 'rect',
    position: { left: 0, top: 108, width: 1280, height: 4 },
    fill: COLORS.accent,
    line: { style: 'solid', fill: COLORS.accent, width: 0 },
  });
  accentLine.zIndex = 0;

  const pageTag = slide.shapes.add({
    geometry: 'roundRect',
    position: { left: 1110, top: 24, width: 130, height: 44 },
    fill: COLORS.accentSoft,
    line: { style: 'solid', fill: COLORS.cardLine, width: 1 },
  });
  pageTag.text = `${String(pageNo).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  styleTextBox(pageTag, {
    color: COLORS.accent,
    bold: true,
    fontSize: 18,
    align: 'center',
    valign: 'middle',
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
  pageTag.zIndex = 5;
}

function styleCoverSlide(slide, isLast = false) {
  const shapes = slide.shapes.items || [];
  if (!shapes.length) return;

  const title = shapes[0];
  const subtitle = shapes[1];

  if (title?.text) {
    styleTextBox(title, {
      color: COLORS.white,
      bold: true,
      fontSize: isLast ? 64 : 58,
      align: 'left',
      valign: 'middle',
      insets: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    applyTypeface(title.text, FONT.title);
  }

  if (subtitle?.text && !isLast) {
    const panel = slide.shapes.add({
      geometry: 'roundRect',
      position: { left: 72, top: 350, width: 1138, height: 152 },
      fill: '#0A376F88',
      line: { style: 'solid', fill: '#7BA6E8', width: 1 },
    });
    panel.zIndex = 0;

    styleTextBox(subtitle, {
      color: COLORS.whiteSoft,
      bold: false,
      fontSize: 23,
      align: 'left',
      valign: 'middle',
      insets: { left: 26, right: 26, top: 8, bottom: 8 },
    });
    applyTypeface(subtitle.text, FONT.body);
  }
}

function shouldCardify(shape, text) {
  if (!text || text.length < 80) return false;
  const pos = safePosition(shape);
  if ((pos.width || 0) < 320) return false;
  if ((pos.height || 0) < 70) return false;
  if ((pos.top || 0) < 120) return false;
  if (/^\d+\.|^[一二三四五六七八九十]+\./.test(text)) return false;
  if (text.includes('P9及10晋升答辩') || text === 'Thanks') return false;
  return true;
}

function looksLikeHeading(text, shape) {
  const pos = safePosition(shape);
  const size = shape?.text?.fontSize || 0;
  if ((pos.top || 0) < 120 && text.length < 36) return true;
  if (size >= 26) return true;
  if (/^\d+\./.test(text) && text.length < 70) return true;
  if (/^[一二三四五六七八九十]+\./.test(text) && text.length < 70) return true;
  return false;
}

const presentation = await PresentationFile.importPptx(await FileBlob.load(INPUT));
const totalSlides = presentation.slides.items.length;

for (let i = 0; i < totalSlides; i += 1) {
  const slide = presentation.slides.items[i];
  const slideNo = i + 1;

  if (slideNo === 1 || slideNo === totalSlides) {
    styleCoverSlide(slide, slideNo === totalSlides);
    continue;
  }

  slide.background.fill = COLORS.bg;
  addTopDecoration(slide, slideNo, totalSlides);

  const shapes = slide.shapes.items || [];
  for (let j = 0; j < shapes.length; j += 1) {
    const shape = shapes[j];
    const text = safeText(shape);
    if (!text) continue;

    const isTitleBox = j === 0 || ((safePosition(shape).top || 0) < 120 && text.length < 40);
    const heading = looksLikeHeading(text, shape);

    if (isTitleBox) {
      styleTextBox(shape, {
        color: COLORS.title,
        bold: true,
        fontSize: 36,
        align: 'left',
        valign: 'middle',
      });
      applyTypeface(shape.text, FONT.title);
      continue;
    }

    if (heading) {
      styleTextBox(shape, {
        color: COLORS.titleDark,
        bold: true,
        fontSize: shape.text?.fontSize || 28,
        align: 'left',
        valign: 'middle',
      });
    } else {
      styleTextBox(shape, {
        color: COLORS.text,
        bold: false,
        fontSize: shape.text?.fontSize || 20,
        align: 'left',
        valign: 'top',
      });
      if (shape.text?.paragraphs?.items?.length) {
        for (const para of shape.text.paragraphs.items) {
          try {
            para.lineSpacingPercent = 122;
          } catch {
            // no-op
          }
          try {
            para.spaceAfter = 250;
          } catch {
            // no-op
          }
        }
      }
    }

    if (shouldCardify(shape, text)) {
      try {
        shape.fill = COLORS.card;
      } catch {
        // no-op
      }
      try {
        shape.line = { style: 'solid', fill: COLORS.cardLine, width: 1 };
      } catch {
        // no-op
      }
      styleTextBox(shape, {
        color: COLORS.text,
        insets: { left: 14, right: 14, top: 10, bottom: 10 },
      });
    }

    if (text === '照片') {
      try {
        shape.fill = '#EFF5FF';
        shape.line = { style: 'dashed', fill: '#7DA2DD', width: 1.5 };
      } catch {
        // no-op
      }
      styleTextBox(shape, {
        color: '#4E6B98',
        bold: true,
        fontSize: 28,
        align: 'center',
        valign: 'middle',
      });
    }
  }
}

const outBlob = await PresentationFile.exportPptx(presentation);
await outBlob.save(OUTPUT);
console.log(OUTPUT);
