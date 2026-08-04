/**
 * 生成 / 刷新 writing-style-presets 的 catalog + 各 category pack。
 * 用法：pnpm exec tsx src/scripts/build-writing-voice-packs.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  courseExtra,
  fanqieExtra,
  financeExtra,
  hongguoExtra,
  politicalExtra,
  selfMediaExtra,
  talkExtra,
  voiceoverExtra,
  type ExtraVoice,
} from './writing-voice-extra-leaves';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../tasks/writing-style-presets');
const packsDir = path.join(root, 'packs');
const webUiPath = path.join(__dirname, '../../../web/src/lib/writingVoicePresets.json');

type I18n = { zh: string; 'zh-TW': string; en: string; ja: string };
const t = (zh: string, en: string, tw = zh, ja = en): I18n => ({
  zh,
  'zh-TW': tw,
  en,
  ja,
});

function craft(p: {
  sentence: string;
  stance: string;
  opening: string;
  avoid: string;
  lexicon: string;
}) {
  return p;
}

function ref(zh: string, en: string, tw = zh, ja = en): I18n {
  return t(zh, en, tw, ja);
}

type CatVoice = {
  id: string;
  language: string;
  region: string;
  label: I18n;
  uiAuthorHint: I18n;
  blurb: I18n;
  topic_hints: string[];
  /** 检索题材类型角；缺省则 rebuild 时从旧 catalog 保留 */
  search_angles?: string[];
  craft: ReturnType<typeof craft>;
  referenceParagraph: I18n;
  talkPack?: Record<string, unknown>;
  fictionPack?: Record<string, unknown>;
  reportPack?: Record<string, unknown>;
  mediaPack?: Record<string, unknown>;
};

type AnyVoice = CatVoice | ExtraVoice;

function packBodies(voices: AnyVoice[]) {
  return voices.map((v) => {
    const { craft: c, referenceParagraph, talkPack, fictionPack, reportPack, mediaPack, id } = v;
    return {
      id,
      craft: c,
      referenceParagraph,
      ...(talkPack ? { talkPack } : {}),
      ...(fictionPack ? { fictionPack } : {}),
      ...(reportPack ? { reportPack } : {}),
      ...(mediaPack ? { mediaPack } : {}),
    };
  });
}

function writePack(category: string, notes: string[], voices: AnyVoice[]) {
  const pack = {
    schemaVersion: 1,
    kind: 'writing-voice-pack',
    voice_category: category,
    notes,
    voices: packBodies(voices),
  };
  fs.writeFileSync(path.join(packsDir, `${category}.json`), JSON.stringify(pack, null, 2) + '\n');
  return voices;
}

function appendPack(category: string, notes: string[], base: AnyVoice[], extra: ExtraVoice[]) {
  return writePack(category, notes, [...base, ...extra]);
}

// —— fanqie ——
const fanqie: CatVoice[] = [
  {
    id: 'fq_zs_huigui',
    language: 'zh',
    region: 'cn_mainland',
    label: t('战神回归·打脸节拍', 'War-god return slap-beat'),
    uiAuthorHint: t('参考：番茄热门战神/兵王回归写手笔法', 'Ref: Fanqie war-god return writers'),
    blurb: t('身份差拉满，三章内打脸，章末钩子硬', 'Status gap, slap within 3 chapters, hard hooks'),
    topic_hints: ['身份差当众打脸节拍', '三章内兑现羞辱反转', '章末更大身份钩'],
    craft: craft({
      sentence: '短句推进；对话承载打脸；少风景描写',
      stance: '爽点优先，正义报复清晰，不阴湿虐主',
      opening: '开场即羞辱场景或身份错位',
      avoid: '文艺独白、无节制修罗场、主角无脑圣母',
      lexicon: '目光一凝、众人哗然、你算什么、下一章见',
    }),
    referenceParagraph: ref(
      '门口保安拦住他时，大厅里刚好有人起哄。他没解释，只把旧证件往桌上一拍——反响比骂声来得更快。',
      'Security stopped him as the lobby jeered. He slapped an old ID on the desk—the room turned faster than the insults.'
    ),
    fictionPack: {
      platform: 'fanqie',
      pace: 'fast_hook',
      must_have: ['身份差', '当众打脸', '章末悬念'],
      chapter_end: '未兑现的更大身份或敌人现身',
    },
  },
  {
    id: 'fq_shenhao',
    language: 'zh',
    region: 'cn_mainland',
    label: t('神豪捡漏·金流爽点', 'Tycoon windfall money-beats'),
    uiAuthorHint: t('参考：番茄热门神豪/重生捡漏写手', 'Ref: Fanqie tycoon / rebirth writers'),
    blurb: t('清单式升级，金流可见，嘲讽变捧场', 'List upgrades, visible cashflow, mockers flip'),
    topic_hints: ['可见金流升级清单', '势利态度翻转节拍', '下一笔更大标的钩'],
    craft: craft({
      sentence: '数字与清单清楚；对话刺对方势利',
      stance: '金钱改变态度，主角冷静不巨婴',
      opening: '先给一个被低估的价格或机会',
      avoid: '无逻辑暴富、灌水重复买买买、歧视弱势群体取乐',
      lexicon: '账户、估值、看走眼、翻倍、闭嘴',
    }),
    referenceParagraph: ref(
      '他把报价单折好，推回去：「这个价，留给还在看笑话的人。」旁桌笑声停了一拍。',
      'He folded the quote back: “Leave that price for the people still laughing.” The next table went quiet.'
    ),
    fictionPack: {
      platform: 'fanqie',
      pace: 'money_ladder',
      must_have: ['可见收益', '势利反转', '信息差'],
      chapter_end: '下一笔更大标的曝光',
    },
  },
  {
    id: 'fq_tianchong',
    language: 'zh',
    region: 'cn_mainland',
    label: t('甜宠日常·轻冲突', 'Sweet-romance daily light conflict'),
    uiAuthorHint: t('参考：番茄热门甜宠写手笔法', 'Ref: Fanqie sweet-romance writers'),
    blurb: t('误会短、互动密、情绪暖', 'Short misunderstandings, dense banter, warm tone'),
    topic_hints: ['生活化轻误会开场', '高密度暖互动', '可解开冲突不撕破'],
    craft: craft({
      sentence: '对话占比高；动作轻；心理点到为止',
      stance: '宠不是无脑，冲突可解且不撕破',
      opening: '生活化尴尬开场',
      avoid: '强行虐、第三者拉扯过长、油腻霸总台词',
      lexicon: '你怎么在这、别误会、我帮你、正好',
    }),
    referenceParagraph: ref(
      '电梯门开时两人都停了一秒。他先把伞递过去：「下雨了。合同的事，出来再说。」',
      'The elevator opened; both froze. He offered the umbrella first: “It’s raining. We’ll talk about the contract outside.”'
    ),
    fictionPack: {
      platform: 'fanqie',
      pace: 'soft_daily',
      must_have: ['高密度互动', '可解开的误会', '稳定升温'],
      chapter_end: '一个未说完的关心',
    },
  },
  {
    id: 'fq_nuelian',
    language: 'zh',
    region: 'cn_mainland',
    label: t('虐恋拉扯·情绪刀', 'Angst pull emotional knife'),
    uiAuthorHint: t('参考：番茄热门虐恋/拉扯写手', 'Ref: Fanqie angst writers'),
    blurb: t('压抑、反转、悔意延后兑现', 'Suppression, reversals, delayed regret'),
    topic_hints: ['伤害结果先行再回放', '压抑情绪延后兑现', '误判真相的章末钩'],
    craft: craft({
      sentence: '短句冷；长句只用于崩溃瞬间',
      stance: '刀要准，不无意义折磨；给后悔留钩',
      opening: '已发生的伤害结果，再回放原因',
      avoid: '纯虐无解、贬低女性成工具、血腥暴力炫技',
      lexicon: '算了、你自由、当时、来不及',
    }),
    referenceParagraph: ref(
      '请柬还在抽屉最上层。他没有拆，只是把灯关掉——好像暗处能把那个名字藏短一点。',
      'The invitation sat on the top of the drawer. He didn’t open it—only killed the light, as if dark could shorten the name.'
    ),
    fictionPack: {
      platform: 'fanqie',
      pace: 'angst_delay',
      must_have: ['信息差伤害', '情绪压抑', '可预期的反转钩'],
      chapter_end: '一句让读者误判真相的话',
    },
  },
  {
    id: 'fq_xuanhuan_lv',
    language: 'zh',
    region: 'cn_mainland',
    label: t('玄幻升级·战力信息', 'Xuanhuan level-up power info'),
    uiAuthorHint: t('参考：番茄热门玄幻升级写手', 'Ref: Fanqie xuanhuan leveling writers'),
    blurb: t('境界清楚、战斗可读、奖励即时', 'Clear realms, readable fights, instant rewards'),
    topic_hints: ['战力标尺清楚可读', '战后即时结算', '晋级/强敌章末钩'],
    craft: craft({
      sentence: '战力信息前置；技能名短；战后结算清楚',
      stance: '成长可见，不靠含糊「顿悟」灌水',
      opening: '压迫性战力差或考核',
      avoid: '无规则开挂、流水账赶路、后宫打断主线',
      lexicon: '境界、灵力、裂开、晋级、这一击',
    }),
    referenceParagraph: ref(
      '考核官报出他的灵力值时，场下安静了一秒。他抬手，第二道纹路才亮——比嘲讽更快。',
      'When the examiner read his spirit value, the yard went still. He raised a hand; the second rune lit faster than the mockery.'
    ),
    fictionPack: {
      platform: 'fanqie',
      pace: 'power_ladder',
      must_have: ['战力标尺', '战斗反馈', '晋级收益'],
      chapter_end: '更强敌或新地图入口',
    },
  },
  {
    id: 'fq_dushi_zhi',
    language: 'zh',
    region: 'cn_mainland',
    label: t('都市智斗·局与筹码', 'Urban mind-game stakes'),
    uiAuthorHint: t('参考：番茄热门都市权谋/职场智斗', 'Ref: Fanqie urban intrigue writers'),
    blurb: t('对话交锋、筹码交换、少玄学', 'Dialogue duels, stake trades, little mysticism'),
    topic_hints: ['对白交锋换筹码', '信息反转推进局', '新条件或背叛迹象'],
    craft: craft({
      sentence: '交锋靠对白；动作少而准',
      stance: '理性算计，主角有原则底线',
      opening: '利益冲突场景，不先讲身世',
      avoid: '靠打脸解决一切商业问题、违法教唆细节',
      lexicon: '筹码、条件、录音、对赌、你想要什么',
    }),
    referenceParagraph: ref(
      '他把文件夹推到桌心：「附件三不是原件。你们要的不是签字，是时间。」',
      'He slid the folder to the center: “Annex three isn’t original. You don’t want a signature—you want time.”'
    ),
    fictionPack: {
      platform: 'fanqie',
      pace: 'mind_game',
      must_have: ['可见筹码', '反转信息', '对白交锋'],
      chapter_end: '新条件或背叛迹象',
    },
  },
  {
    id: 'fq_xuanyi_naodong',
    language: 'zh',
    region: 'cn_mainland',
    label: t('悬疑脑洞·线索投放', 'Suspense puzzle clue drops'),
    uiAuthorHint: t('参考：番茄热门悬疑/脑洞写手', 'Ref: Fanqie suspense puzzle writers'),
    blurb: t('信息差、线索可回收、章末疑问', 'Info gaps, reclaimable clues, end questions'),
    topic_hints: ['可回收线索投放', '异常细节先于解释', '推翻假设的章末问'],
    craft: craft({
      sentence: '细节具体；疑问句收段；少全知剧透',
      stance: '读者可参与推理，不靠超能力开图',
      opening: '异常细节先于尸体解释',
      avoid: '无限逆转无规则、歧视受害者、血腥炫技',
      lexicon: '不对、时间点、谁还知道、第二次',
    }),
    referenceParagraph: ref(
      '闹钟定在案发后十分钟。他盯着屏幕：死人不会定未来的时间——除非有人用过这只手机。',
      'The alarm was set for ten minutes after the crime. A dead man doesn’t schedule the future—unless someone else used the phone.'
    ),
    fictionPack: {
      platform: 'fanqie',
      pace: 'clue_drop',
      must_have: ['可回收线索', '不可靠叙述者或信息差', '章末疑问'],
      chapter_end: '推翻上一章假设的新细节',
    },
  },
];

// —— hongguo ——
const hongguo: CatVoice[] = [
  {
    id: 'hg_conflict_hook',
    language: 'zh',
    region: 'cn_mainland',
    label: t('红果强冲突开钩', 'Hongguo hard-conflict cold open'),
    uiAuthorHint: t('参考：红果热门强冲突短剧写手', 'Ref: Hongguo high-conflict short drama'),
    blurb: t('前三十秒冲突，对白刀快，情绪外放', 'Conflict in 30s, sharp dialogue, big emotion'),
    topic_hints: ['前三十秒可视冲突', '短促可拍对白', '集末更大丑闻钩'],
    craft: craft({
      sentence: '对白短促；旁白极少；场面可拍',
      stance: '情绪浓但因果清楚',
      opening: '冲突已爆发的第一句',
      avoid: '长内心独白、慢热铺垫超过两场',
      lexicon: '你凭什么、当着大家、从今天起、我不同意',
    }),
    referenceParagraph: ref(
      '红毯麦克风还亮着。她把证件举起来：「婚，我拒绝。」掌声卡住，像被掐断。',
      'The red-carpet mic was still live. She raised the papers: “I refuse this marriage.” Applause died mid-clap.'
    ),
    fictionPack: {
      platform: 'hongguo',
      pace: 'episode_hook',
      must_have: ['可视冲突', '可拍对白', '集末反转'],
      chapter_end: '更大丑闻或身份将爆',
    },
  },
  {
    id: 'hg_identity_twist',
    language: 'zh',
    region: 'cn_mainland',
    label: t('身份反转·打脸连击', 'Identity twist slap chain'),
    uiAuthorHint: t('参考：红果隐藏身份/马甲短剧', 'Ref: Hongguo hidden-identity dramas'),
    blurb: t('马甲一层层揭，反派越嘲越惨', 'Layered reveal; mockers fall harder'),
    topic_hints: ['被错待后物证揭穿', '分层马甲连击打脸', '更大马甲未揭钩'],
    craft: craft({
      sentence: '揭身份用物证/第三人；少解释段落',
      stance: '爽感来自信息对称瞬间',
      opening: '被错待的场景',
      avoid: '无铺垫神豪空降、羞辱弱势群体',
      lexicon: '你认错人了、合同在这、请他进来',
    }),
    referenceParagraph: ref(
      '保安还想拦，门口却响起「董事长到」。她把工牌翻面，字不需要念出声。',
      'Security moved to stop her as “Chair’s here” rang at the door. She flipped her badge—no one needed it read aloud.'
    ),
    fictionPack: {
      platform: 'hongguo',
      pace: 'reveal_ladder',
      must_have: ['错误对待', '物证揭穿', '连击打脸'],
      chapter_end: '更大马甲未揭',
    },
  },
  {
    id: 'hg_emotion_wall',
    language: 'zh',
    region: 'cn_mainland',
    label: t('情绪墙哭戏·关系决裂', 'Emotion-wall breakup beat'),
    uiAuthorHint: t('参考：红果家庭/姻亲冲突短剧', 'Ref: Hongguo family-conflict dramas'),
    blurb: t('关系决裂台词硬，哭点可停格', 'Hard breakup lines; freeze-frame cry beats'),
    topic_hints: ['关系决裂硬台词', '关键词重复砸伤口', '反击资源集末预告'],
    craft: craft({
      sentence: '一句一句砸；重复关键词强化伤口',
      stance: '站在被压迫者情绪，但不煽动违法报复',
      opening: '不公平条款或当众贬低',
      avoid: '儿童伤害细节、过度血腥',
      lexicon: '我退出、你选吧、从今以后、别再叫我',
    }),
    referenceParagraph: ref(
      '她把钥匙放在茶几上：「孩子跟我。房子你们争。从今以后，别再用家人两个字叫我回来。」',
      'She set the keys on the table: “The child comes with me. Fight over the house. Don’t call me family to pull me back.”'
    ),
    fictionPack: {
      platform: 'hongguo',
      pace: 'emotion_peak',
      must_have: ['决裂台词', '关系重组', '集末反击预告'],
      chapter_end: '反击资源出现',
    },
  },
  {
    id: 'hg_counterattack',
    language: 'zh',
    region: 'cn_mainland',
    label: t('逆袭反击·证据局', 'Counterattack evidence game'),
    uiAuthorHint: t('参考：红果职场/婚姻反击短剧', 'Ref: Hongguo counterattack dramas'),
    blurb: t('证据链短平快，反击场面可围观', 'Short evidence chain; public payback'),
    topic_hints: ['证据链短平快公开', '围观场面反击', '幕后黑手集末钩'],
    craft: craft({
      sentence: '证据出示即转折；台词服务围观',
      stance: '合法合规的反击框架',
      opening: '被陷害或被逼到墙角',
      avoid: '教唆犯罪细节、仇恨动员',
      lexicon: '证据、公证、直播、你们看、结束了',
    }),
    referenceParagraph: ref(
      '发布会大屏切到邮件时间戳。他只说：「诬陷我的人，也在今天的邀请名单里。」',
      'The launch screen cut to email timestamps. He said only: “The people who framed me are also on today’s invite list.”'
    ),
    fictionPack: {
      platform: 'hongguo',
      pace: 'payback',
      must_have: ['证据出示', '公开场面', '反派失措'],
      chapter_end: '更大幕后黑手',
    },
  },
];

// —— finance ——
const finance: CatVoice[] = [
  {
    id: 'fin_bu_mian_night',
    language: 'zh',
    region: 'cn_mainland',
    label: t('资本永不眠式博弈人性', 'Never Sleeps–style capital stakes'),
    uiAuthorHint: t('参考：资本永不眠写手群像', 'Ref: Capital Never Sleeps–style storytellers'),
    blurb: t('交易细节+动机，故事化但不编造财报', 'Deal detail + motive; storied, no fake filings'),
    topic_hints: ['交易夜场景切入', '激励不相容的人性博弈', '故事化禁编造财报'],
    craft: craft({
      sentence: '先场面后机制；数字带不确定表述',
      stance: '冷静叙事，揭示激励不相容',
      opening: '一个具体谈判或砸盘夜',
      avoid: '荐股、保证收益、伪造精确财务数据',
      lexicon: '对赌、稀释、回购、动机、筹码',
    }),
    referenceParagraph: ref(
      '午夜的会议室只剩两瓶水。他问的不是估值，而是：谁愿意在下一轮把自己变成少数股东。',
      'Two water bottles left in the midnight room. He didn’t ask valuation—he asked who would volunteer to become the minority next round.'
    ),
    reportPack: {
      evidence: 'soft_required',
      forbid: ['精确假财报', '荐股'],
      shape: ['场景', '激励结构', '未证实边界'],
    },
  },
  {
    id: 'fin_deal_anatomy',
    language: 'zh',
    region: 'cn_mainland',
    label: t('财新式交易条款拆解', 'Caixin-style deal clause breakdown'),
    uiAuthorHint: t('参考：财新硬核并购/一级市场拆解', 'Ref: Caixin-style deal breakdown'),
    blurb: t('条款结构清楚，少鸡汤，多对照', 'Clear clause structure; little soup; more contrast'),
    topic_hints: ['反直觉条款先抛', '机制对照谁受益', '风险边界写清楚'],
    craft: craft({
      sentence: '定义→机制→谁受益；短段',
      stance: '中性解剖，结论谨慎',
      opening: '先抛最反直觉的一条条款',
      avoid: '阴谋论、无来源的「内部人士称」精确引语',
      lexicon: '交割、或有、控制权、稀释、附表',
    }),
    referenceParagraph: ref(
      '表面是「业绩对赌」，真正改变控制权的是未能完成时的代持解除条件——多数报道停在第一句。',
      'The headline is an earnout; control actually shifts on the escrow-release trigger if targets miss—most coverage stops at the first sentence.'
    ),
    reportPack: {
      evidence: 'required',
      forbid: ['假引语'],
      shape: ['条款对照', '受益方', '风险边界'],
    },
  },
  {
    id: 'fin_market_scene',
    language: 'zh',
    region: 'cn_mainland',
    label: t('华尔街见闻式市场现场', 'WallStreetCN-style market floor'),
    uiAuthorHint: t('参考：华尔街见闻/交易员现场专栏', 'Ref: WallStreetCN / trader-floor columns'),
    blurb: t('流动性、预期差、群像，不报明牌荐股', 'Liquidity, expectation gaps, crowd—no stock tips'),
    topic_hints: ['时间切片盘口转折', '流动性与预期差', '现场感克制不下荐股'],
    craft: craft({
      sentence: '时间戳意识；感官细节服务机制',
      stance: '现场感强，判断克制',
      opening: '某一刻盘口/情绪转折',
      avoid: '买卖点、目标价、保证收益',
      lexicon: '流动性、预期差、盘口、展期、拥挤',
    }),
    referenceParagraph: ref(
      '十四点二十，买盘突然变薄。不是崩，是大家同时想起：昨天那句「稳了」并没有担保函。',
      'At 14:20 bids thinned. Not a crash—just everyone remembering yesterday’s “it’s fine” came with no guarantee letter.'
    ),
    reportPack: {
      evidence: 'soft_required',
      forbid: ['荐股', '目标价'],
      shape: ['时间切片', '流动性', '叙事与事实差'],
    },
  },
  {
    id: 'fin_company_story',
    language: 'zh',
    region: 'cn_mainland',
    label: t('晚点LatePost式公司人物', 'LatePost-style company profile'),
    uiAuthorHint: t('参考：晚点/公司深度人物财经稿', 'Ref: LatePost-style company features'),
    blurb: t('人以带出激励与治理，禁英雄传', 'People reveal incentives/governance; no hagiography'),
    topic_hints: ['反常人事带出治理', '人物动作→激励含义', '未知项标明边界'],
    craft: craft({
      sentence: '人物动作→治理含义',
      stance: '理解动机，不神化不妖魔化',
      opening: '一个反常人事决定',
      avoid: '编造私生活细节、侮辱性标签',
      lexicon: '治理、激励、投票权、披露、口径',
    }),
    referenceParagraph: ref(
      '他减持的声明写「个人资金需求」。同日公司宣布回购——两件事可以都真，但激励方向相反。',
      'His filing said “personal liquidity.” The same day the company announced a buyback—both can be true; the incentives point opposite ways.'
    ),
    reportPack: {
      evidence: 'required',
      forbid: ['诽谤性私生活'],
      shape: ['人物动作', '治理含义', '未知项'],
    },
  },
];

// —— political ——
const political: CatVoice[] = [
  {
    id: 'pol_wire_restraint',
    language: 'zh',
    region: 'cn_mainland',
    label: t('新华社电讯体·事实序', 'Xinhua wire–style fact order'),
    uiAuthorHint: t('参考：新华社/主流电讯体', 'Ref: Xinhua-style political wire'),
    blurb: t('时间-主体-动作-口径，少形容词', 'Time–actor–action–line; few adjectives'),
    topic_hints: ['事实序少形容词', '口径可核对意识', '未知项单列'],
    craft: craft({
      sentence: '谁在何时做了什么；引语短且可核对意识',
      stance: '中立克制，判断后置',
      opening: '最新动作，不先抒情',
      avoid: '煽动、阴谋论、伪造官员引语',
      lexicon: '表示、指出、截至、口径、回应',
    }),
    referenceParagraph: ref(
      '3日下午，主管部门发布通知，称相关措施「稳妥实施」。通知未披露具体时间表与适用范围。',
      'On the afternoon of the 3rd, the regulator said measures would be carried out “prudently.” No timeline or scope was published.'
    ),
    reportPack: {
      evidence: 'required',
      forbid: ['假引语', '煽动'],
      shape: ['事实序', '口径', '未知'],
    },
  },
  {
    id: 'pol_policy_explain',
    language: 'zh',
    region: 'cn_mainland',
    label: t('澎湃新闻式政策拆解', 'The Paper–style policy explainer'),
    uiAuthorHint: t('参考：澎湃政策解读', 'Ref: The Paper policy explainers'),
    blurb: t('把政策拆成谁受益/谁承压', 'Who benefits / who bears cost'),
    topic_hints: ['谁受益谁承压拆解', '机制句完整生活化', '未决细则写明'],
    craft: craft({
      sentence: '机制句完整；例子生活化但不煽情',
      stance: '解说清楚，不下煽动结论',
      opening: '读者能感知的变化',
      avoid: '民粹口号、恐吓式预测',
      lexicon: '适用、门槛、过渡期、承压、例外',
    }),
    referenceParagraph: ref(
      '表面是「优化流程」，对企业来说变化是：少盖两个章，多准备一套可抽查的台账。',
      'Billed as “streamlining,” the real shift is fewer stamps—and one more ledger that can be audited.'
    ),
    reportPack: {
      evidence: 'soft_required',
      forbid: ['恐吓预测'],
      shape: ['机制', '分层影响', '未决细则'],
    },
  },
  {
    id: 'pol_local_implement',
    language: 'zh',
    region: 'cn_mainland',
    label: t('南方周末式地方温差', 'Southern Weekly–style local gaps'),
    uiAuthorHint: t('参考：南方周末地方观察', 'Ref: Southern Weekly local notes'),
    blurb: t('中央表述与窗口执行的差异', 'Center wording vs window practice'),
    topic_hints: ['中央表述与窗口温差', '对照两组做法', '慎下全国性判断'],
    craft: craft({
      sentence: '对比两组做法；不升格为阴谋',
      stance: '记录温差，慎下全国性判断',
      opening: '具体窗口/具体一天',
      avoid: '地域歧视、伪造基层对话',
      lexicon: '窗口、细则、过渡、排队、口径',
    }),
    referenceParagraph: ref(
      '同一份指南，甲区要预审材料，乙区说「直接提交」。两边都拿出截图——读者需要的是差异，不是站队。',
      'Same guide: District A wants pre-check; District B says “submit directly.” Both show screenshots—readers need the gap, not a team.'
    ),
    reportPack: {
      evidence: 'required',
      forbid: ['伪造对话'],
      shape: ['对照', '材料', '范围限制'],
    },
  },
  {
    id: 'pol_press_brief',
    language: 'zh',
    region: 'cn_mainland',
    label: t('央视发布会式问答速写', 'CCTV briefing–style Q&A'),
    uiAuthorHint: t('参考：央视/主流发布会报道', 'Ref: CCTV-style press briefs'),
    blurb: t('发布要点+未答问题，禁标题党', 'Key points + unanswered; no clickbait'),
    topic_hints: ['发布要点条目化', '问答分开写', '未答清单收束'],
    craft: craft({
      sentence: '要点条目化；问答分开写',
      stance: '准确优先于犀利',
      opening: '最硬的新信息',
      avoid: '断章取义、夸张标题',
      lexicon: '通报、答问、未披露、进一步',
    }),
    referenceParagraph: ref(
      '发布要点三条。追问环节里，关于时间表的问题被转引至「另行通知」——本文将其列入未答清单。',
      'Three bulletin points. On timeline questions, answers deferred to “further notice”—listed here as unanswered.'
    ),
    reportPack: {
      evidence: 'required',
      forbid: ['断章标题'],
      shape: ['要点', '问答', '未答'],
    },
  },
];

// —— self_media ——
const selfMedia: CatVoice[] = [
  {
    id: 'sm_opin_sharp',
    language: 'zh',
    region: 'cn_mainland',
    label: t('虎嗅式锐评立场', 'Huxiu-style sharp take'),
    uiAuthorHint: t('参考：判断句靠前的互联网锐评', 'Ref: judgment-first online opinion'),
    blurb: t('立场清楚、例子狠、收尾可转发', 'Clear stance, hard examples, shareable close'),
    topic_hints: ['刺耳判断靠前', '短例支撑可转发收尾', '给反方一句公平转述'],
    craft: craft({
      sentence: '判断句靠前；例子短；少学术腔；比喻少而准，不硬凑金句',
      stance: '有立场，但要给反方一句公平转述',
      opening: '刺耳判断',
      avoid:
        '人身攻击、造谣、煽动对抗；假精确「概率约等于」金句；脱语境城市梗（早高峰空出租等）；比喻与论点不同构（例如要用证据证「编排」却拿稀缺偶遇类比）',
      lexicon: '本质是、别被、真正、一句说清',
    }),
    referenceParagraph: ref(
      '别再把「用户体验」当遮羞布。这版规则改的是谁能说话，不是谁加载更快。',
      'Stop using “UX” as cover. This rule change is about who may speak—not who loads faster.'
    ),
    mediaPack: { channel: 'feed_article', share_close: true },
  },
  {
    id: 'sm_story_case',
    language: 'zh',
    region: 'cn_mainland',
    label: t('正午故事式个案', 'NoonStory-style case feature'),
    uiAuthorHint: t('参考：以人带出结构问题的非虚构', 'Ref: person→structure narrative nonfiction'),
    blurb: t('一个人带出结构问题，禁煽情滥俗', 'One person → structural issue; no melodrama'),
    topic_hints: ['具体一天白描开场', '一人带出结构问题', '共情不消费苦难'],
    craft: craft({
      sentence: '场景白描→问题→轻判断',
      stance: '共情但不代受害者立誓',
      opening: '具体一天',
      avoid: '消费苦难、编造细节',
      lexicon: '那天、她说、合同、空白',
    }),
    referenceParagraph: ref(
      '她把排班表拍给我看：连上十三天，中间只有一个「调休待定」。待定的是休息，不是订单。',
      'She showed the roster: thirteen days on, one “comp day TBD.” What was TBD was rest—not orders.'
    ),
    mediaPack: { channel: 'feed_article', share_close: true },
  },
  {
    id: 'sm_list_practical',
    language: 'zh',
    region: 'cn_mainland',
    label: t('少数派式实用清单', 'SSPai-style checklist'),
    uiAuthorHint: t('参考：可照做的工具文清单体', 'Ref: actionable how-to checklists'),
    blurb: t('步骤清楚、可照做、少鸡汤', 'Clear steps, actionable, little soup'),
    topic_hints: ['当下可做第一步', '条目短可照做', '不贩卖焦虑'],
    craft: craft({
      sentence: '祈使句+条件句；条目短',
      stance: '助手心态，不贩卖焦虑',
      opening: '读者当下能做的第一步',
      avoid: '恐吓营销、虚假功效',
      lexicon: '第一步、如果、核对、不要',
    }),
    referenceParagraph: ref(
      '先别写长文道歉。第一步：导出近7日发帖与私信关键词，看怒点集中在哪一条规则。',
      'Don’t draft a long apology yet. Step one: export 7-day posts/DMs and see which rule the anger clusters on.'
    ),
    mediaPack: { channel: 'feed_article', share_close: false },
  },
  {
    id: 'sm_hot_take_fast',
    language: 'zh',
    region: 'cn_mainland',
    label: t('微博热搜快评体', 'Weibo hot-search quick take'),
    uiAuthorHint: t('参考：短平快记忆点快评', 'Ref: short memorable hot takes'),
    blurb: t('快、准、留一句记忆点', 'Fast, precise, one memorable line'),
    topic_hints: ['热点核心矛盾一句', '快准留记忆点', '可核对不造谣'],
    craft: craft({
      sentence: '200～600字意识；金句收束',
      stance: '快反但可核对，不造谣',
      opening: '热点核心矛盾一句',
      avoid: '跟风脏话、未证实 indictments',
      lexicon: '核心是、先分清、记住',
    }),
    referenceParagraph: ref(
      '这波热搜不是道德剧，是规则剧：谁有权定义「适度」。记住这句就够转发。',
      'This trend isn’t a morality play—it’s a rules play: who defines “appropriate.” That line is enough to share.'
    ),
    mediaPack: { channel: 'feed_short', share_close: true },
  },
];

// —— voiceover ——
const voiceover: CatVoice[] = [
  {
    id: 'vo_news_host',
    language: 'zh',
    region: 'cn_mainland',
    label: t('抖音资讯号·稳准清', 'Douyin news-desk VO'),
    uiAuthorHint: t('参考：平台资讯口播账号', 'Ref: feed news VO accounts'),
    blurb: t('可播、少从句、数字朗读友好', 'Speakable, few clauses, number-friendly'),
    topic_hints: ['可播少从句', '数字朗读友好', '中性播报轻判断'],
    craft: craft({
      sentence: '一句一意；逗号可换气；避免超长定语',
      stance: '中性播报，判断轻',
      opening: '问候+今日焦点一句',
      avoid: '书面倒装、难读英文堆砌、表情包文字',
      lexicon: '今天、首先、同时、最后',
    }),
    referenceParagraph: ref(
      '今天关注一项新规。它影响三类人：从业者、平台，还有普通用户。我们用三分钟说清变化。',
      'Today’s focus is a new rule. It hits three groups: workers, platforms, and users. Three minutes to make the change clear.'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '180' },
  },
  {
    id: 'vo_story_host',
    language: 'zh',
    region: 'cn_mainland',
    label: t('故事FM式钩子讲述', 'StoryFM-style hook narration'),
    uiAuthorHint: t('参考：人物故事可停顿口播', 'Ref: pause-friendly story VO'),
    blurb: t('开口有钩，段落可停顿', 'Hook open; pause-friendly paragraphs'),
    topic_hints: ['开口冲突结果先行', '段落可停顿', '口语连接不装旁白'],
    craft: craft({
      sentence: '口语连接词；悬念句可独立成段',
      stance: '讲述感，不装纪录片旁白',
      opening: '冲突结果先行',
      avoid: '书面成语堆、复杂括号注释',
      lexicon: '你听、后来、没想到、停一下',
    }),
    referenceParagraph: ref(
      '故事从一个拒绝开始。她挂断电话的时候，以为只是丢了一单——后来才知道丢的是一整条路。',
      'It starts with a no. When she hung up, she thought she’d lost one job—later she learned she’d lost a whole road.'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '180' },
  },
  {
    id: 'vo_knowledge',
    language: 'zh',
    region: 'cn_mainland',
    label: t('罗翔式普法解说', 'Luo Xiang–style legal explainer'),
    uiAuthorHint: t('参考：一次只讲清一个概念', 'Ref: one-concept-at-a-time explainer'),
    blurb: t('概念一次只攻一个，类比生活化', 'One concept at a time; lived analogies'),
    topic_hints: ['一概念定义例子误区', '生活类比可复述', '不恐吓科普'],
    craft: craft({
      sentence: '定义→例子→误区；可复述',
      stance: '老师感但不说教',
      opening: '听众以为自己懂的一点',
      avoid: '堆术语、恐吓式科普',
      lexicon: '简单说、比如、别误会、记住',
    }),
    referenceParagraph: ref(
      '别先背定义。你去菜场觉得贵，不一定是「通胀」三个字能概括——我们拆成价格、预期和替代品。',
      'Don’t start with the textbook. Feeling prices at the market isn’t just “inflation”—we’ll split price, expectation, and substitutes.'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '120' },
  },
  {
    id: 'vo_hot_chat',
    language: 'zh',
    region: 'cn_mainland',
    label: t('小红书伴聊式热梗', 'Xiaohongshu companion hot-chat'),
    uiAuthorHint: t('参考：第二人称亲密度口播', 'Ref: second-person companion VO'),
    blurb: t('像跟听众说话，梗点到为止', 'Talk-with-listener; light meme use'),
    topic_hints: ['第二人称亲密度', '时间线先捋直', '梗点到为止'],
    craft: craft({
      sentence: '第二人称多；语气词可控',
      stance: '亲密但不油',
      opening: '你是不是也…',
      avoid: '过度网络黑话、歧视梗',
      lexicon: '你看、其实、说真的、对吧',
    }),
    referenceParagraph: ref(
      '你是不是也刷到那条热搜了？别急着站队。我们先把时间线捋直，再决定气什么。',
      'Did you see that trending post too? Don’t pick a side yet. We’ll straighten the timeline—then decide what to be mad at.'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '90' },
  },
];

// —— course_tutorial（网课教程）——
const courseTutorial: CatVoice[] = [
  {
    id: 'course_dedao',
    language: 'zh',
    region: 'cn_mainland',
    label: t('得到式知识精讲', 'Dedao-style knowledge lecture'),
    uiAuthorHint: t('参考：得到知识服务课', 'Ref: Dedao-style knowledge courses'),
    blurb: t('概念一次讲透，带走可复述金句', 'One concept clear; takeaway lines'),
    // hints 只写课型工艺，题材由检索「当前热门课」决定
    topic_hints: ['一课只攻一个可带走概念', '误区先于定义', '结尾可复述金句'],
    craft: craft({
      sentence: '定义→例子→误区→带走一句',
      stance: '知识服务感，不装学院腔',
      opening: '听众以为自己懂的一点',
      avoid: '鸡汤空转、无例题、写死某一学科清单',
      lexicon: '简单说、记住、别误会、这一课',
    }),
    referenceParagraph: ref(
      '别先背定义。先戳破一个常见误解，再用生活例子拆开，最后留一句学员能转述的话。',
      'Don’t start with the textbook. Bust a common misunderstanding, unpack with a lived example, leave one line they can retell.'
    ),
    mediaPack: { channel: 'course_lesson', seconds_hint: '1200' },
  },
  {
    id: 'course_bilibili',
    language: 'zh',
    region: 'cn_mainland',
    label: t('B站知识区式跟练教程', 'Bilibili knowledge follow-along'),
    uiAuthorHint: t('参考：B站知识区跟练向', 'Ref: Bilibili knowledge follow-along'),
    blurb: t('边看边做，卡点给绕行', 'Watch-and-do; detours at stuck points'),
    topic_hints: ['成品预览后只跟练一步', '卡点绕行不跳步', '小交付可当场验收'],
    craft: craft({
      sentence: '步骤编号；口播同步动作',
      stance: '同伴教练，允许暂停',
      opening: '成品预览 + 今天只做哪一步',
      avoid: '炫技跳步、羞辱新手、写死编程/摄影等固定学科',
      lexicon: '暂停、跟上、常见卡点、先别管',
    }),
    referenceParagraph: ref(
      '先看成品十秒。今天只做到「能验收的一小步」。卡住别慌——给出三步绕行再继续。',
      'Ten seconds of the finished thing. Today only one checkable step. Stuck? Offer a three-step detour, then continue.'
    ),
    mediaPack: { channel: 'course_lesson', seconds_hint: '900' },
  },
  {
    id: 'course_openuni',
    language: 'zh',
    region: 'cn_mainland',
    label: t('网易公开课式系统讲解', 'NetEase Open Course–style system teach'),
    uiAuthorHint: t('参考：网易公开课/系统讲解', 'Ref: NetEase Open Course–style'),
    blurb: t('体系清楚，章节可衔接', 'Clear system; chapter-linkable'),
    topic_hints: ['先给课程地图再落本章', '与上一章如何衔接', '预告下一章可练什么'],
    craft: craft({
      sentence: '地图→本章位置→核心论证→预告下一章',
      stance: '课堂讲师，节奏稳',
      opening: '把学习者放回课程地图',
      avoid: '碎片爽点、无衔接、写死学科清单',
      lexicon: '上一章、本节、因此、下一章你会',
    }),
    referenceParagraph: ref(
      '先看地图：你卡在哪一环。本节只解决这一环，案例与练习留给下一章。',
      'Map first: which link are you stuck on? This section clears only that link; drills wait for next chapter.'
    ),
    mediaPack: { channel: 'course_lesson', seconds_hint: '2400' },
  },
  {
    id: 'course_project',
    language: 'zh',
    region: 'cn_mainland',
    label: t('实战项目式交付课', 'Project-delivery workshop course'),
    uiAuthorHint: t('参考：实战营/项目交付课', 'Ref: project-delivery workshops'),
    blurb: t('交付物倒推，里程碑可验收', 'Deliverable-first; checkable milestones'),
    topic_hints: ['先定义完成物再倒推', '里程碑必须可验收', '卡住时给降级交付'],
    craft: craft({
      sentence: '完成定义→里程碑→示范→验收',
      stance: '工坊教练，结果导向',
      opening: '最终交付物长什么样',
      avoid: '只讲理念不交件、写死必须是代码仓库',
      lexicon: '完成物、里程碑、验收、今天必须',
    }),
    referenceParagraph: ref(
      '完成物先说清楚。今天三十分钟只做一个可验收的里程碑，其余降级。',
      'Define done first. Today’s thirty minutes: one checkable milestone; everything else can degrade.'
    ),
    mediaPack: { channel: 'course_lesson', seconds_hint: '1800' },
  },
];

/** 谈话资料：主名改为节目具名（catalog 叶子来自旧表，构建时覆盖展示名） */

/** 谈话叶子：hints 只定工艺角度，题材跟检索热议走 */
const TALK_HINT_OVERRIDES: Record<string, string[]> = {
  talk_qq_three: ['交锋闲谈可抬杠', '多声部对立议题', '题材跟检索热议走'],
  talk_yuanzhuo: ['议题深挖可追问', '圆桌资料清单角', '题材跟检索热议走'],
  talk_luyu: ['生命叙事时间线', '情绪高点柔追问', '题材跟检索热议走'],
  talk_face_probe: ['矛盾对照硬核实', '时间线压力追问', '题材跟检索热议走'],
  talk_yanglan_salon: ['格局提问带出选择', '访谈资料可展开', '题材跟检索热议走'],
  talk_fresh_air: ['细读追问文本/作品', '慢热深挖角度', '题材跟检索热议走'],
  talk_hardtalk: ['立场对峙是非题', '短问逼清口径', '题材跟检索热议走'],
  talk_oprah_arc: ['情感揭示弧线', '陪伴式再抬矛盾', '题材跟检索热议走']
};

const TALK_LABEL_OVERRIDES: Record<string, I18n> = {
  talk_qq_three: t('锵锵三人行式交锋闲谈', 'Qiangqiang Three–style clash chat'),
  talk_yuanzhuo: t('圆桌派式议题深挖', 'Round Table–style issue dig'),
  talk_luyu: t('鲁豫有约式生命叙事', 'A Date with Luyu–style life narrative'),
  talk_face_probe: t('面对面式追问核实', 'Face to Face–style hard probe'),
  talk_yanglan_salon: t('杨澜访谈录式格局提问', 'Yang Lan One-on-One–style salon'),
  talk_fresh_air: t('Fresh Air式细读追问', 'Fresh Air–style close reading'),
  talk_hardtalk: t('HARDtalk式立场对峙', 'HARDtalk-style confrontation'),
  talk_oprah_arc: t('Oprah式情感揭示弧线', 'Oprah-style reveal arc'),
};

function catalogEntry(v: AnyVoice, voice_category: string) {
  return {
    id: v.id,
    voice_category,
    language: v.language,
    region: v.region,
    label: v.label,
    uiAuthorHint: v.uiAuthorHint,
    blurb: v.blurb,
    topic_hints: v.topic_hints,
    ...(v.search_angles?.length ? { search_angles: v.search_angles } : {}),
  };
}

async function main() {
  fs.mkdirSync(packsDir, { recursive: true });

  // keep literary_column if already built from seek
  const literaryPath = path.join(packsDir, 'literary_column.json');
  let literaryCatalog: ReturnType<typeof catalogEntry>[] = [];
  if (fs.existsSync(literaryPath)) {
    const lit = JSON.parse(fs.readFileSync(literaryPath, 'utf8'));
    const seek = JSON.parse(
      fs.readFileSync(path.join(root, 'seek-voice-presets.json'), 'utf8')
    ) as { voices: Array<{ id: string; region: string; label: I18n; blurb: I18n }> };
    literaryCatalog = seek.voices.map((v) => ({
      id: v.id,
      voice_category: 'literary_column',
      language:
        v.region === 'cn_mainland'
          ? 'zh'
          : v.region === 'zh_gat'
            ? 'zh-TW'
            : v.region === 'ja'
              ? 'ja'
              : 'en',
      region: v.region,
      label: v.label,
      uiAuthorHint: v.label,
      blurb: v.blurb,
      // 工艺角度；具体专栏题材由检索热门决定
      topic_hints: ['意象/场景钩可展开', '专栏标题向切入', '题材跟检索热门走'],
    }));
    console.log('reuse literary_column pack', lit.voices?.length);
  }

  const talkPackPath = path.join(packsDir, 'talk_brief.json');
  if (!fs.existsSync(talkPackPath)) {
    throw new Error('packs/talk_brief.json missing — keep handcrafted pack');
  }
  const oldTalkPack = JSON.parse(fs.readFileSync(talkPackPath, 'utf8')) as {
    notes?: string[];
    voices: Array<Record<string, unknown> & { id: string }>;
  };
  const oldCatalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8')) as {
    voices: Array<{
      voice_category: string;
      id: string;
      language: string;
      region: string;
      label: I18n;
      uiAuthorHint?: I18n;
      blurb: I18n;
      topic_hints?: string[];
      search_angles?: string[];
    }>;
    languages: unknown[];
  };
  const oldAnglesById = new Map(
    oldCatalog.voices
      .filter((v) => Array.isArray(v.search_angles) && v.search_angles!.length > 0)
      .map((v) => [v.id, v.search_angles!.slice(0, 4)])
  );
  const talkBaseCatalog = oldCatalog.voices
    .filter((v) => v.voice_category === 'talk_brief')
    .map((v) => {
      const override = TALK_LABEL_OVERRIDES[v.id];
      const hints = TALK_HINT_OVERRIDES[v.id];
      let next = v;
      if (override) next = { ...next, label: override, uiAuthorHint: v.uiAuthorHint || override };
      if (hints) next = { ...next, topic_hints: hints };
      return next;
    });
  const talkBaseIds = new Set(talkBaseCatalog.map((v) => v.id));
  const talkExtraFiltered = talkExtra.filter((v) => !talkBaseIds.has(v.id));
  // 合并 talk pack：保留原详参，追加多语言叶子
  const talkExtraIds = new Set(talkExtraFiltered.map((v) => v.id));
  const mergedTalkPackVoices = [
    ...oldTalkPack.voices.filter((v) => !talkExtraIds.has(v.id)),
    ...packBodies(talkExtraFiltered),
  ];
  fs.writeFileSync(
    talkPackPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'writing-voice-pack',
        voice_category: 'talk_brief',
        notes: oldTalkPack.notes || [
          '谈话资料稿本地详参：仅在用户选中某 voice_id 时注入对应条目。',
        ],
        voices: mergedTalkPackVoices,
      },
      null,
      2
    ) + '\n'
  );

  const allFanqie = appendPack(
    'fanqie_web',
    ['短篇网文：各语言环境平台热门笔法叶子；UI 可含平台助记，模型无姓名。长篇连载另见 series。'],
    fanqie,
    fanqieExtra
  );
  const allHongguo = appendPack(
    'hongguo_drama',
    ['短剧节拍：番茄/红果/ReelShort/縦型等环境热门叶子。'],
    hongguo,
    hongguoExtra
  );
  const allFinance = appendPack('finance_narrative', ['财经叙事多语言叶子。'], finance, financeExtra);
  const allPolitical = appendPack(
    'political_report',
    ['时政报道多语言叶子。'],
    political,
    politicalExtra
  );
  const allSelfMedia = appendPack('self_media', ['自媒体多语言叶子。'], selfMedia, selfMediaExtra);
  const allVoiceover = appendPack(
    'voiceover_brief',
    ['短视频解说多语言叶子。'],
    voiceover,
    voiceoverExtra
  );
  const allCourse = appendPack(
    'course_tutorial',
    ['网课教程：知识精讲/跟练/系统课/项目交付；各语言平台热门课型叶子。'],
    courseTutorial,
    courseExtra
  );

  const categories = [
    {
      id: 'talk_brief',
      label: t('谈话资料', 'Talk-show dossier', '談話資料', 'トーク番組用資料'),
      blurb: t(
        '圆桌/访谈资料稿，不是综艺逐字稿；风格步按语言露出当地热门节目笔法',
        'Interview dossier — not a variety transcript; style step shows local hit-show crafts',
        '圓桌/訪談資料稿；風格步依語言露出當地熱門節目筆法',
        '座談資料。スタイル段で各言語の人気番組筆法を出す'
      ),
      packFile: 'talk_brief',
      // hints 只定工艺；具体议题由检索「当前热议」决定
      topic_hints: ['热议议题可抬杠矛盾', '追问清单式资料角度', '题材跟检索热门走'],
    },
    {
      id: 'literary_column',
      label: t('文学·专栏', 'Literary / column', '文學·專欄', '文学・コラム'),
      blurb: t(
        '文学/专栏笔法底座；各语言作家向叶子',
        'Literary/column base; author-craft leaves per language',
        '文學/專欄筆法底座',
        '文学・コラム筆法の土台'
      ),
      packFile: 'literary_column',
      topic_hints: ['意象/场景钩可展开', '专栏标题向切入', '题材跟检索热门走'],
    },
    {
      id: 'fanqie_web',
      label: t('短篇网文', 'Short web fiction', '短篇網文', '短編ネット小説'),
      blurb: t(
        '番茄热门短篇笔法；各语言短篇网文叶子（连载长篇另见 series）',
        'Short-form web fiction craft per locale (long serials → series)',
        '番茄熱門短篇筆法；各語言短篇網文（連載長篇另見 series）',
        '短編ネット小説の筆法（長編連載は series）'
      ),
      packFile: 'fanqie_web',
      topic_hints: ['短篇开局设定钩', '反转与章末疑问', '题材跟检索热门走'],
    },
    {
      id: 'hongguo_drama',
      label: t('短剧节拍', 'Vertical short drama', '短劇節拍', '縦型ショートドラマ'),
      blurb: t(
        '强冲突/身份/反击；各语言竖屏短剧热门节拍',
        'Conflict / identity / payback — vertical short-drama hits per locale',
        '強衝突/身份/反擊；各語言豎屏短劇熱門節拍',
        '強衝突・身分・逆転。各言語の縦型ヒット節拍'
      ),
      packFile: 'hongguo_drama',
      topic_hints: ['竖屏冲突可拍节拍', '集末身份/反击钩', '题材跟检索热门走'],
    },
    {
      id: 'finance_narrative',
      label: t('财经叙事', 'Finance narrative', '財經敘事', '金融ナラティブ'),
      blurb: t('博弈、条款、现场与公司治理', 'Games, clauses, floor, governance'),
      packFile: 'finance_narrative',
      topic_hints: ['专栏文章选题角度', '条款/激励/现场切入', '题材跟检索热门走'],
    },
    {
      id: 'political_report',
      label: t('时政报道', 'Public-affairs reporting', '時政報道', '時事報道'),
      blurb: t('电讯、政策解说、地方温差、发布会', 'Wire, explainer, local gap, press brief'),
      packFile: 'political_report',
      topic_hints: ['报道角度材料边界', '现场/口径/温差', '题材跟检索热门走'],
    },
    {
      id: 'self_media',
      // 与「财经叙事/时政报道」同平面：题材是热点观点文，不是渠道名「自媒体」
      label: t('热点锐评', 'Hot-take commentary', '熱點銳評', 'ホットテイク評論'),
      blurb: t(
        '锐评立场、个案故事、清单拆解、热点快反',
        'Sharp takes, case stories, checklists, hot reactions',
        '銳評立場、個案故事、清單拆解、熱點快反',
        '鋭い論評・事例・チェックリスト・即時反応'
      ),
      packFile: 'self_media',
      topic_hints: ['判断向锐评切入', '个案或清单可展开', '题材跟检索热门走'],
    },
    {
      id: 'voiceover_brief',
      // 与「短剧节拍」同平面：形态是短视频可播解说，不是笼统「口播资料」
      label: t('短视频解说', 'Short-video explainer', '短視頻解說', 'ショート解説'),
      blurb: t(
        '资讯播报、故事讲述、知识科普等可播解说稿',
        'News / story / knowledge explainer scripts for short video',
        '資訊播報、故事講述、知識科普等可播解說稿',
        'ニュース・物語・知識のショート解説原稿'
      ),
      packFile: 'voiceover_brief',
      topic_hints: ['开口一点说清', '可播短句钩子', '题材跟检索热门走'],
    },
    {
      id: 'course_tutorial',
      label: t('网课教程', 'Online course lesson', '網課教程', 'オンライン講座'),
      blurb: t(
        '知识精讲、跟练教程、系统课与项目交付课稿',
        'Knowledge lectures, follow-along drills, system courses, project workshops',
        '知識精講、跟練教程、系統課與專案交付課稿',
        '知識精講・追従演習・体系講座・プロジェクト授業'
      ),
      packFile: 'course_tutorial',
      topic_hints: ['热门一课可带走点', '跟练/精讲课型工艺', '题材跟检索热门走'],
    },
  ];

  const voices = [
    ...talkBaseCatalog,
    ...talkExtraFiltered.map((v) => catalogEntry(v, 'talk_brief')),
    ...literaryCatalog,
    ...allFanqie.map((v) => catalogEntry(v, 'fanqie_web')),
    ...allHongguo.map((v) => catalogEntry(v, 'hongguo_drama')),
    ...allFinance.map((v) => catalogEntry(v, 'finance_narrative')),
    ...allPolitical.map((v) => catalogEntry(v, 'political_report')),
    ...allSelfMedia.map((v) => catalogEntry(v, 'self_media')),
    ...allVoiceover.map((v) => catalogEntry(v, 'voiceover_brief')),
    ...allCourse.map((v) => catalogEntry(v, 'course_tutorial')),
  ].map((v) => {
    const existing = (v as { search_angles?: string[] }).search_angles;
    if (Array.isArray(existing) && existing.length > 0) return v;
    const preserved = oldAnglesById.get(v.id);
    if (!preserved?.length) return v;
    return { ...v, search_angles: preserved };
  });

  const catalog = {
    schemaVersion: 1,
    kind: 'writing-voice-catalog',
    notes: [
      '轻量目录：类别方向全语言完整；写作风格按 language + voice_category 过滤。',
      '详参在 packs/<category>.json，resolveVoiceForModelAsync 只注入选中一条。',
      'topic_hints=提炼合同工艺角；search_angles=web 检索题材类型角（禁止节目名）。',
      '统一合同字段见 topic-article：language/voice_category/voice_id/topic/purpose/article_length/structure_id/outline。',
    ],
    languages: oldCatalog.languages,
    categories,
    voices,
  };

  fs.writeFileSync(path.join(root, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');

  // 同步前端瘦 catalog（仅列表展示字段）
  const uiCatalog = {
    schemaVersion: 1,
    kind: 'writing-voice-catalog-ui',
    languages: catalog.languages,
    categories: categories.map(({ id, label, blurb }) => ({ id, label, blurb })),
    voices: voices.map((v) => ({
      id: v.id,
      voice_category: v.voice_category,
      language: v.language,
      region: v.region,
      label: v.label,
      uiAuthorHint: v.uiAuthorHint,
      blurb: v.blurb,
    })),
  };
  fs.writeFileSync(webUiPath, JSON.stringify(uiCatalog, null, 2) + '\n');

  console.log(
    'catalog voices',
    voices.length,
    'by cat',
    Object.fromEntries(
      categories.map((c) => [c.id, voices.filter((v) => v.voice_category === c.id).length])
    )
  );
  console.log('synced web UI catalog', webUiPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
