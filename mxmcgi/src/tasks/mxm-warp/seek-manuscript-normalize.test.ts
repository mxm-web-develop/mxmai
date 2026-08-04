import { describe, expect, it } from 'vitest';
import {
  breakWallOfText,
  collapseParallelVersionPack,
  demoteAbusiveBold,
  ensureLeadingH1,
  extractSingleVoiceSection,
  normalizeSeekManuscript,
  stripSeekMetaLeak,
  stripVariantMarkers,
} from './seek-manuscript-normalize';

describe('ensureLeadingH1', () => {
  it('缺标题时用 fallback 补 #', () => {
    const out = ensureLeadingH1('井边那只猫又来了。', 'AGI元年');
    expect(out.startsWith('# AGI元年')).toBe(true);
    expect(out).toContain('井边那只猫');
  });

  it('元标题替换为话题', () => {
    const out = ensureLeadingH1('# 四种笔法，写同一场风\n\n正文', '台风损失');
    expect(out.startsWith('# 台风损失')).toBe(true);
    expect(out).not.toContain('四种笔法');
  });

  it('短讯速报·三篇元标题替换', () => {
    const out = ensureLeadingH1('# 短讯速报 · 感官密集版（三篇）\n\n正文', '股市真有牛行情吗');
    expect(out.startsWith('# 股市真有牛行情吗')).toBe(true);
  });

  it('首个 ## 升为 #', () => {
    expect(ensureLeadingH1('## 小节\n\n正文', '话题')).toMatch(/^# 小节/);
  });
});

describe('stripSeekMetaLeak / extractSingleVoiceSection', () => {
  const pack = `# 四种笔法，写同一场风

按合约配置（\`seek_count: 4\`, \`voice_ids\` 四档），下面分别为 白描烟火气 / 荒诞理性 / 冷峻残酷 / 调查克制 四种文风各写一版，事实底色一致（倒树、积水）。

① **cn_plain_warm** · 白描烟火气，闲笔有味

早上起来，锅里的粥还是昨晚那锅。台风过了，巷口的树倒着。

② **cn_absurd_reason** · 荒诞理性

有人说十七级是个整数。整数不负责解释地库里的水。

③ **cn_cold_cruelty** · 冷峻残酷

水退以后，数字还在跑。

④ **cn_investigative_restraint** · 调查克制

官方通报仍在核实。
`;

  it('剥掉合约泄漏与 voice_id 行', () => {
    const out = stripSeekMetaLeak(pack);
    expect(out).not.toMatch(/seek_count/);
    expect(out).not.toMatch(/voice_ids/);
    expect(out).not.toMatch(/cn_plain_warm/);
    expect(out).not.toMatch(/按合约配置/);
  });

  it('合集只留本路正文', () => {
    const section = extractSingleVoiceSection(pack, 'cn_plain_warm');
    expect(section).toContain('锅里的粥');
    expect(section).not.toContain('整数不负责');
    expect(section).not.toContain('cn_absurd_reason');
  });
});

describe('stripVariantMarkers / collapseParallelVersionPack', () => {
  it('剥掉【variant N】与英文变量名', () => {
    const raw =
      '【variant 1】没有底料，先别上菜。```---```【variant 2】牛不牛，看四样东西。';
    const out = stripVariantMarkers(raw);
    expect(out).not.toMatch(/variant/i);
    expect(out).not.toContain('【');
    expect(out).toContain('没有底料');
    expect(out).toContain('牛不牛');
  });

  it('多版本短讯只留最长一路', () => {
    const pack = `# 股市真有牛行情吗——三则短讯

---
## ① 无为而牛
据说判断牛市的最高境界，是把行情软件全卸了。眼不见，心不烦。
可惜卸软件解决不了三个问题：钱从哪来，估值贵不贵，公司赚不赚。
---
## ② 牛市探测器
有人发明了一种「牛市探测器」。
---
## ③ 营养不良的牛
牛不牛，不是散户的情绪投票。
`;
    const out = collapseParallelVersionPack(pack);
    expect(out).toContain('行情软件');
    expect(out).not.toMatch(/牛市探测器/);
    expect(out).not.toMatch(/①|②|③/);
  });
});

describe('demoteAbusiveBold', () => {
  it('粗体过多时剥标记', () => {
    const md =
      '**甲** **乙** **丙** **丁** **戊** **己** **庚** **辛** **壬** 普通';
    const out = demoteAbusiveBold(md, { maxBoldSpans: 8 });
    expect(out).not.toContain('**');
    expect(out).toContain('甲');
  });

  it('少量粗体保留', () => {
    const md = '这里有 **重点** 一词。';
    expect(demoteAbusiveBold(md)).toContain('**重点**');
  });
});

describe('breakWallOfText', () => {
  it('长墙字拆段', () => {
    const wall = Array.from({ length: 12 }, (_, i) => `这是第${i + 1}句用来凑长度拆段落。`).join('');
    const out = breakWallOfText(`# 题\n\n${wall}`, 100);
    const paras = out.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    expect(paras.length).toBeGreaterThanOrEqual(3);
  });
});

describe('normalizeSeekManuscript', () => {
  it('合集泄漏 → 单篇读者稿', () => {
    const md = `# 四种笔法，写同一场风

按合约配置（\`seek_count: 4\`, \`voice_ids\` 四档），下面分别为四种文风各写一版。

① **cn_plain_warm** · 白描烟火气

早上起来，锅里的粥还是昨晚那锅。巷口的树倒着。菜场晚开了半个时辰。

② **cn_absurd_reason** · 荒诞理性

有人说十七级是个整数。
`;
    const out = normalizeSeekManuscript(md, {
      fallbackTitle: '江浙沪一场17级台风带来的损失',
      voiceId: 'cn_plain_warm',
    });
    expect(out.startsWith('# 江浙沪一场17级台风带来的损失')).toBe(true);
    expect(out).toContain('锅里的粥');
    expect(out).not.toMatch(/seek_count|voice_ids|cn_plain_warm|四种笔法|按合约/);
    expect(out).not.toContain('十七级是个整数');
  });

  it('HK 实稿：variant 拼贴 → 一篇无泄漏', () => {
    const md = `# 股市真有牛行情吗

【variant 1】没有底料，先别上菜今天的话题摆在桌上：「牛行情」。但灶台是冷的。没有底料，先别上菜。市场是不是真在走牛，得等数据坐稳了再开口。

指数走几步、个股翻几翻，这些都没拿到台面上核对。目前能确认的，只有一句话：这是一个判断，不是事实。材料不齐，锅就先别揭盖。

\`\`\`---\`\`\`【variant 2】牛不牛，看四样东西有人问行情是不是牛。有人已经替行情回答了。行情是不是牛，得看四样东西一起抬：价格、宽度、成交、盈利预期。

少一样，都只能算个半成品。价格抬了，宽度没跟上，那是少数人的游戏。成交没跟上，那是无声的拉升。盈利预期没跟上，那是空心的柱子。

现在四项都到位了吗？没人递话。\`\`\`---\`\`\`【variant 3】结论先按住「牛来了」，这三个字在屏幕上出现得越来越频繁。

结论先按住。等材料齐了再放出来，比先说一句再回头改口要体面。市场要回答的问题很简单：价格中枢上没上去，行业涨跌是窄是宽，成交量有没有放量，盈利预期有没有跟着调。

这四样东西摆出来，答案自己会走出门。没摆出来之前，谁喊都白喊。
`;
    const out = normalizeSeekManuscript(md, { fallbackTitle: '股市真有牛行情吗' });
    expect(out.startsWith('# 股市真有牛行情吗')).toBe(true);
    expect(out).toContain('没有底料');
    expect(out).toContain('四样东西');
    expect(out).toContain('结论先按住');
    expect(out).not.toMatch(/variant/i);
    expect(out).not.toContain('【');
    expect(out).not.toContain('```');
  });

  it('HK 实稿：三则短讯合集 → 单篇 + 读者标题', () => {
    const md = `# 股市真有牛行情吗——三则短讯

---
## ① 无为而牛
据说判断牛市的最高境界，是把行情软件全卸了。眼不见，心不烦，账户曲线自动变直——这叫「无为而牛」。
可惜卸软件解决不了三个问题：钱从哪来，估值贵不贵，公司赚不赚。三样不齐，再清净的账户也是一潭死水。
所以别急着喊牛，先把放大镜递过来——资金、估值、盈利，三件证据齐全再开口，否则就是对着空气说相声。
---
## ② 牛市探测器
有人发明了一种「牛市探测器」：往市场里一扔，红灯亮就是熊，绿灯亮就是牛。
---
## ③ 营养不良的牛
牛不牛，不是散户的情绪投票。
`;
    const out = normalizeSeekManuscript(md, { fallbackTitle: '股市真有牛行情吗' });
    expect(out.startsWith('# 股市真有牛行情吗')).toBe(true);
    expect(out).toContain('行情软件');
    expect(out).not.toMatch(/三则|①|②|③|牛市探测器/);
  });

  it('HK 实稿：版本一/二/三 + 文末附言剥离', () => {
    const md = `# 短讯速报 · 感官密集版（三篇）

---
## 版本一 · 大厅汗味
大厅里还留着一股没散尽的咸汗味，电子屏的红绿交替像血浆冲进静脉——七月的热浪没走，开盘的铃声早被几百台手机震动盖过去了。资金没空坐下来喝杯凉茶。

成交额往上抬，换手率跟着快，融资余额也像被热风喂肥，三件套并排站着，冒汽，烫手。资金面的汗味已经窜到嘴边。可锅底下蹲着的不是同一锅水。

业绩面还在磨底，热得像隔夜的冷饭，端上桌没人敢动第一筷。板块像赶集的骡子，一会这头吃草，一会那头被抽鞭，轮动快得连影子都追不上。

散户眼里带着血色冲进大厅，K线一抖，胆子又像湿柴一样软下来。乐观和悲观像两股不同味的酒在杯里对撞，谁也没把谁灌倒。资金面烫、基本面凉、情绪面还在冒烟——三味没合一锅，不叫牛市，也不叫熊市，只叫"还活着"。

---
## 版本二 · 骡子与鞭
麦茬还没割净，K线就一茬一茬往上冒。

---
## 版本三 · 三味酒
酒气混着土腥。
---*三篇皆以"资金面—基本面—情绪面"三味不齐为底，统一回到底线判断：不轻言牛市，也不轻言熊市，未编造具体数字与引语。

*
`;
    const out = normalizeSeekManuscript(md, { fallbackTitle: '股市真有牛行情吗' });
    expect(out.startsWith('# 股市真有牛行情吗')).toBe(true);
    expect(out).toContain('咸汗味');
    expect(out).not.toMatch(/版本一|版本二|版本三|三篇皆以|感官密集/);
‘’  });
});
