/**
 * 补齐 talk / 网文 / 短剧 / 财经 / 时政 / 自媒体 / 口播 在 zh-TW · en · ja 的平台热门参考叶子。
 * 由 build-writing-voice-packs.ts 合并进 packs + catalog。
 */
export type I18n = { zh: string; 'zh-TW': string; en: string; ja: string };

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

export type ExtraVoice = {
  id: string;
  language: string;
  region: string;
  label: I18n;
  uiAuthorHint: I18n;
  blurb: I18n;
  topic_hints: string[];
  craft: ReturnType<typeof craft>;
  referenceParagraph: I18n;
  talkPack?: Record<string, unknown>;
  fictionPack?: Record<string, unknown>;
  reportPack?: Record<string, unknown>;
  mediaPack?: Record<string, unknown>;
};

// ── talk_brief：zh-TW / ja（zh·en 已有）────────────────────────────────
export const talkExtra: ExtraVoice[] = [
  {
    id: 'talk_tw_keymoment',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('關鍵時刻式硬訪核對', 'Key Moment–style hard probe', '關鍵時刻式硬訪核對', 'キーモーメント式検証'),
    uiAuthorHint: t('參考：關鍵時刻式硬訪', 'Ref: Key Moment–style hard interview', '參考：關鍵時刻式硬訪', 'キーモーメント系'),
    blurb: t('矛盾對照、時間線追問', 'Contradiction + timeline pressure', '矛盾對照、時間線追問', '矛盾と時系列'),
    topic_hints: ['矛盾对照硬核实', '时间线压力追问', '题材跟检索热议走'],
    craft: craft({
      sentence: '問題極短；先甩對照事實再追問',
      stance: '核實優先，硬但不羞辱',
      opening: '資料稿第一條必須是矛盾點',
      avoid: '陰謀論、人身攻擊、無材料質問',
      lexicon: '您曾表示、然而、對照、時間點',
    }),
    referenceParagraph: ref(
      '先並置兩句公開表述，再問「完成」是否包含驗收——不要先罵謊言。',
      'Hold two public lines, then ask whether “done” includes acceptance—before calling anyone a liar.',
      '先並置兩句公開表述，再問「完成」是否包含驗收。',
      '二つの公言を並べ、「完了」に検収が含まれるかから入る。'
    ),
    talkPack: {
      format: 'hard_one_on_one',
      dossier_goal: '硬訪談追問清單：逼清事實',
      dossier_sections: ['矛盾對照表', '時間線', '核心追問 8 條', '未澄清清單'],
      host_moves: ['先復述再指出衝突', '遁詞回到某一天'],
      tension_style: '冷硬：壓力來自材料',
      sample_beats: ['矛盾開場', '口徑定義', '未答收束'],
      guest_prompt_patterns: ['是或否：承諾是否到期未兌現？'],
    },
  },
  {
    id: 'talk_tw_dinner',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('誰來晚餐式生命切片', 'Who’s Dinner–style life slice', '誰來晚餐式生命切片', '誰來晚餐式人物'),
    uiAuthorHint: t('參考：誰來晚餐式人物訪談', 'Ref: Who’s Dinner–style life chat', '參考：誰來晚餐式人物訪談', '誰來晚餐系'),
    blurb: t('日常場景帶出選擇與代價', 'Daily scene → choice & cost', '日常場景帶出選擇與代價', '日常から選択へ'),
    topic_hints: ['生命叙事时间线', '日常切片柔追问', '题材跟检索热议走'],
    craft: craft({
      sentence: '柔和完整句；時間連接多',
      stance: '陪伴式傾聽，鋒利藏在追問時機',
      opening: '先給生命時間線與情緒高點',
      avoid: '八卦獵奇、逼哭、道德宣判',
      lexicon: '那時、後來、選擇、沒說出口',
    }),
    referenceParagraph: ref(
      '時間線先落到「拒絕那通電話的晚上」，問誰先掛斷，不問「你後悔嗎」。',
      'Pin the night they rejected the call; ask who hung up first—not “do you regret it?”',
      '時間線先落到「拒絕那通電話的晚上」，問誰先掛斷。',
      '電話を切った夜に固定。後悔ではなく、先に切ったのは誰か。'
    ),
    talkPack: {
      format: 'one_on_one_life',
      dossier_goal: '人物生命敘事資料',
      dossier_sections: ['時間線', '關係圖譜', '情緒節拍', '安全收尾題'],
      host_moves: ['用具體物打開大話題', '允許沉默'],
      tension_style: '低壓高密度',
      sample_beats: ['暖場物', '選擇點', '關係'],
      guest_prompt_patterns: ['若只能留三個場景？'],
    },
  },
  {
    id: 'talk_tw_newsdeep',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('新聞深一度式機制拆', 'News Deep–style mechanisms', '新聞深一度式機制拆', '報道深掘り式'),
    uiAuthorHint: t('參考：新聞深一度式議題訪', 'Ref: News Deep–style issue talk', '參考：新聞深一度式議題訪', '報道深掘り系'),
    blurb: t('一題多切面，禁段子大賽', 'Multi-facet issue; no joke contest', '一題多切面', '多断面の議題'),
    topic_hints: ['热议议题可抬杠', '追问清单资料角', '题材跟检索热议走'],
    craft: craft({
      sentence: '完整短句；多切面少互嗆',
      stance: '認真好奇，代際寫成結構差異',
      opening: '先定義今天不聊什麼',
      avoid: '段子堆砌、偽共識',
      lexicon: '切面、機制、代價、樣本',
    }),
    referenceParagraph: ref(
      '今天不聊該不該努力，只聊回報曲線變平時人們用哪些敘事說服自己上班。',
      'Not hustle-morality—which stories people use when returns flatten.',
      '今天不聊該不該努力，只聊回報變平時的自我說服敘事。',
      '頑張るべきかではなく、報酬が平坦なときの自己説得の物語。'
    ),
    talkPack: {
      format: 'roundtable_issue',
      dossier_goal: '議題深挖圓桌資料',
      dossier_sections: ['議題邊界', '切面 A/B/C', '深挖題 5 問'],
      host_moves: ['追問個例還是結構', '逼出代價'],
      tension_style: '溫而韌',
      sample_beats: ['邊界', '三切面', '分歧保留'],
      guest_prompt_patterns: ['指出自己立場最弱一環'],
    },
  },
  {
    id: 'talk_tw_roundfire',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('台灣談話性節目式交鋒', 'TW talk-show roundtable clash', '台灣談話性節目式交鋒', '台湾トーク円卓式'),
    uiAuthorHint: t('參考：台灣談話性節目圓桌', 'Ref: TW talk-show roundtable', '參考：台灣談話性節目圓桌', '台湾トーク円卓'),
    blurb: t('輕嗆快轉，趣味綁觀點', 'Light clash; fun tied to ideas', '輕嗆快轉', '軽口と論点'),
    topic_hints: ['热议议题可抬杠', '追问清单资料角', '题材跟检索热议走'],
    craft: craft({
      sentence: '短句、半截話、一人抛梗一人接刺',
      stance: '可偏激但對準機制，不人身貶損',
      opening: '一句刺耳判斷再列多方立場',
      avoid: '通稿腔、雞湯、正確廢話',
      lexicon: '接話、抬槓、市井比喻',
    }),
    referenceParagraph: ref(
      '今晚不談抽象內卷。先問：勸人多睡一小時，是不是在勸他接受更低出價？',
      'Skip abstract burnout: is “sleep more” asking someone to take a lower bid?',
      '今晚不談抽象內卷。先問勸人多睡是不是勸他接受更低出價。',
      '抽象的過労はやめ、睡眠勧奨が安い入札を飲めと言っていないか。'
    ),
    talkPack: {
      format: 'roundtable_three',
      dossier_goal: '圓桌交鋒談話資料',
      dossier_sections: ['開場刺點', '多方立場', '可抬槓例子', '開放收束'],
      host_moves: ['共識時引入刺耳反例', '市井類比打斷學術腔'],
      tension_style: '輕嗆快轉',
      sample_beats: ['刺點', '反例', '代價'],
      guest_prompt_patterns: ['用一句能上熱搜的刺話重述觀點'],
    },
  },
  {
    id: 'talk_ja_tetsuko',
    language: 'ja',
    region: 'ja',
    label: t('徹子の部屋式人物長訪', 'Tetsuko’s Room–style portrait', '徹子の部屋式人物長訪', '徹子の部屋式人物長訪'),
    uiAuthorHint: t('參考：徹子の部屋式人物訪談', 'Ref: Tetsuko’s Room–style', '參考：徹子の部屋式', '参考：徹子の部屋系'),
    blurb: t('日常細節帶出人生轉折', 'Daily detail → life turns', '日常細節帶出轉折', '日常細部から転機へ'),
    topic_hints: ['Debatable hot issue', 'Probe-list dossier angle', 'Topics follow trending talk'],
    craft: craft({
      sentence: 'やさしい完全文。時間の接続詞を多用',
      stance: '傾聴。鋭さはタイミングに隠す',
      opening: '年表と感情の山を先に置く',
      avoid: 'ゴシップ強要、泣かせ指示',
      lexicon: 'そのとき、あとで、言えなかった',
    }),
    referenceParagraph: ref(
      '先問「辭職前夜打給了誰」，不要先問後悔。',
      'Ask who they called the night before quitting—not regret first.',
      '先問辭職前夜打給誰。',
      '退職前夜に誰へ電話したかから。後悔は後。'
    ),
    talkPack: {
      format: 'one_on_one_life',
      dossier_goal: '人物長訪用資料',
      dossier_sections: ['年表', '関係図', '感情ビート', '安全な締め'],
      host_moves: ['物から大問へ', '沈黙を許す'],
      tension_style: '低圧高密度',
      sample_beats: ['物', '選択', '関係'],
      guest_prompt_patterns: ['残すなら三場面は？'],
    },
  },
  {
    id: 'talk_ja_closeup',
    language: 'ja',
    region: 'ja',
    label: t('クローズアップ現代式硬訪', 'Close-up Gendai–style hard probe', 'クローズアップ現代式硬訪', 'クローズアップ現代式硬訪'),
    uiAuthorHint: t('參考：クローズアップ現代式', 'Ref: Close-up Gendai–style', '參考：クローズアップ現代式', '参考：クローズアップ現代系'),
    blurb: t('材料密度施壓，禁空話', 'Document pressure; no fog', '材料密度施壓', '資料密度で追う'),
    topic_hints: ['Debatable hot issue', 'Probe-list dossier angle', 'Topics follow trending talk'],
    craft: craft({
      sentence: '短い質問。事実節を先に置く',
      stance: '説明責任。人格攻撃しない',
      opening: '最大の矛盾から',
      avoid: '陰謀飛躍、侮辱',
      lexicon: 'あなたは述べた、しかし、定義は',
    }),
    referenceParagraph: ref(
      '把「局勢穩定」與同年傷亡並置，追問穩定是否包含平民傷害下降。',
      'Place “stable” beside casualty trends; ask if stable requires harm to fall.',
      '並置「局勢穩定」與傷亡趨勢，追問定義。',
      '「安定」と被害推移を並べ、定義を問う。'
    ),
    talkPack: {
      format: 'hard_one_on_one',
      dossier_goal: '報道硬訪ブリーフ',
      dossier_sections: ['矛盾表', '時系列', '追問8', '未解明'],
      host_moves: ['空語を日付へ戻す', '定義を強制'],
      tension_style: '静かで鋭い',
      sample_beats: ['矛盾', '定義', '未答'],
      guest_prompt_patterns: ['Yes/No：期限は過ぎたか'],
    },
  },
  {
    id: 'talk_ja_honma',
    language: 'ja',
    region: 'ja',
    label: t('ホンマでっか式雜學圓桌', 'Honma Dekka–style panel', 'ホンマでっか式雜學圓桌', 'ホンマでっか式円卓'),
    uiAuthorHint: t('參考：ホンマでっか!?式圓桌', 'Ref: Honma Dekka–style panel', '參考：ホンマでっか式', '参考：ホンマでっか系'),
    blurb: t('趣味鉤子綁機制爭論', 'Fun hooks + mechanism debate', '趣味鉤子綁機制', '面白さと機制'),
    topic_hints: ['Debatable hot issue', 'Probe-list dossier angle', 'Topics follow trending talk'],
    craft: craft({
      sentence: '短句とツッコミ。一人一つの尖った立場',
      stance: '偏ってよいが人格攻撃禁止',
      opening: '刺さる一句で議題を開く',
      avoid: '正しい空虚、百科羅列',
      lexicon: 'それは違う、仕組み、たとえ',
    }),
    referenceParagraph: ref(
      '別談抽象過勞，先問勸人多睡是不是在勸低價。',
      'Skip burnout slogans—is “sleep more” a lower bid?',
      '別談抽象過勞，先問勸睡是否勸低價。',
      '過労の抽象論はやめ、睡眠勧奨が安値入札か問う。'
    ),
    talkPack: {
      format: 'roundtable_three',
      dossier_goal: '雑学円卓用資料',
      dossier_sections: ['刺しポイント', '三立場', '抬槓例', '開放結尾'],
      host_moves: ['合意を壊す反例', '市井比喩'],
      tension_style: '軽口と論点',
      sample_beats: ['刺', '反例', '代価'],
      guest_prompt_patterns: ['一言で刺せ'],
    },
  },
  {
    id: 'talk_ja_news_dinner',
    language: 'ja',
    region: 'ja',
    label: t('報道系餐敘式議題深挖', 'News-dinner deep issue', '報道系餐敘式議題深挖', '報道餐敘式深掘り'),
    uiAuthorHint: t('參考：報道系餐敘對談', 'Ref: news-dinner issue talk', '參考：報道系餐敘', '参考：報道餐敘系'),
    blurb: t('一題三切面，留下分歧', 'One issue, three facets', '一題三切面', '一題三断面'),
    topic_hints: ['Life-timeline dossier', 'Soft probe via daily slice', 'Topics follow trending talk'],
    craft: craft({
      sentence: '層のある短文。冗談大会にしない',
      stance: '真剣な好奇心',
      opening: '今日話さないことを先に宣言',
      avoid: '偽の合意',
      lexicon: '断面、機制、代価',
    }),
    referenceParagraph: ref(
      '不聊該不該努力，只聊回報變平時的自我說服。',
      'Not whether to hustle—which stories when returns flatten.',
      '不聊該不該努力，只聊回報變平時的敘事。',
      '頑張るべきかではなく、平坦化した報酬下の物語。'
    ),
    talkPack: {
      format: 'roundtable_issue',
      dossier_goal: '議題深挖資料',
      dossier_sections: ['境界', '断面ABC', '深掘り5'],
      host_moves: ['個例か構造か', '代価を言わせる'],
      tension_style: '温く粘る',
      sample_beats: ['境界', '三断面', '分岐'],
      guest_prompt_patterns: ['最弱の環は'],
    },
  },
];

// ── 网文连载 fanqie_web：zh-TW / en / ja ────────────────────────────────
export const fanqieExtra: ExtraVoice[] = [
  {
    id: 'fq_tw_chuanyue',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('穿越重生·信息差爽點', 'Transmigration info-gap beats', '穿越重生·資訊差爽點', '転生情報差'),
    uiAuthorHint: t('參考：華文連載穿越/重生熱門筆法', 'Ref: CJK web transmigration hits', '參考：華文連載穿越/重生', '華語転生系'),
    blurb: t('先知優勢可見，章末鉤硬', 'Visible foresight; hard hooks', '先知優勢可見', '先見が見える'),
    topic_hints: ['短篇开局设定钩', '反转与章末疑问', '题材跟检索热门走'],
    craft: craft({
      sentence: '短句推進；資訊差用行動兌現',
      stance: '爽點清楚，不陰濕虐主',
      opening: '身份錯位或死亡回歸的第一場',
      avoid: '無邏輯開掛、灌水日常',
      lexicon: '這次、我記得、來不及、下一章',
    }),
    referenceParagraph: ref(
      '電梯門開的瞬間他認出那張臉——上次輪迴裡，這人三天後會毀約。',
      'The elevator opened on a face he knew—last loop, this person voided the deal in three days.',
      '電梯門開的瞬間他認出那張臉——上次輪迴裡，這人三天後會毀約。',
      'エレベーターが開いた顔を知っていた。前回、三日後に契約を破棄する人だ。'
    ),
    fictionPack: { platform: 'web_tw', pace: 'info_gap', must_have: ['先知優勢', '章末鉤'], chapter_end: '更大未兌現信息' },
  },
  {
    id: 'fq_tw_office_cool',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('職場逆襲·打臉節拍', 'Office reverse slap-beat', '職場逆襲·打臉節拍', '職場逆転'),
    uiAuthorHint: t('參考：華文職場爽文連載', 'Ref: CJK office power fantasy', '參考：華文職場爽文', '華語職場爽'),
    blurb: t('業績可見，當眾翻盤', 'Visible metrics; public flip', '業績可見', '数字で翻す'),
    topic_hints: ['短篇开局设定钩', '反转与章末疑问', '题材跟检索热门走'],
    craft: craft({
      sentence: '對話交鋒；數字清楚',
      stance: '理性報復，有底線',
      opening: '被低估的場景',
      avoid: '違法教唆、歧視取樂',
      lexicon: '數據、合同、你看、結束了',
    }),
    referenceParagraph: ref(
      '他把備份投影打開：「被換掉的那頁，客戶章還在。」會議室安靜了一秒。',
      'He opened the backup deck: “The page you swapped still has the client stamp.” The room stilled.',
      '他把備份投影打開：「被換掉的那頁，客戶章還在。」',
      'バックアップを映した。「差し替えた頁に、客の印がある。」'
    ),
    fictionPack: { platform: 'web_tw', pace: 'office_slap', must_have: ['可見業績', '當眾翻盤'], chapter_end: '更大對手' },
  },
  {
    id: 'fq_tw_romance_pull',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('言情拉扯·情緒刀', 'Romance pull angst', '言情拉扯·情緒刀', '恋愛緊張'),
    uiAuthorHint: t('參考：華文言情連載拉扯筆法', 'Ref: CJK romance tension serials', '參考：華文言情拉扯', '華語恋愛張力'),
    blurb: t('誤會短可控，悔意延後', 'Short misunderstandings; delayed regret', '誤會可控', '誤解は短く'),
    topic_hints: ['生活化轻误会', '高密度互动升温', '可解开冲突'],
    craft: craft({
      sentence: '短句冷；崩潰才放長句',
      stance: '刀要準，不無意義折磨',
      opening: '傷害結果先行',
      avoid: '純虐無解、貶低工具人',
      lexicon: '算了、你自由、來不及',
    }),
    referenceParagraph: ref(
      '請柬還在抽屜最上層。他沒拆，只把燈關掉。',
      'The invitation sat unopened; he only killed the light.',
      '請柬還在抽屜最上層。他沒拆，只把燈關掉。',
      '招待状は引き出しの上。開けず、灯だけ消した。'
    ),
    fictionPack: { platform: 'web_tw', pace: 'angst_delay', must_have: ['信息差傷害', '反轉鉤'], chapter_end: '誤判真相的一句' },
  },
  {
    id: 'fq_tw_suspense',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('懸疑連載·線索投放', 'Suspense serial clue drops', '懸疑連載·線索投放', '連載サスペンス'),
    uiAuthorHint: t('參考：華文懸疑連載', 'Ref: CJK suspense web serials', '參考：華文懸疑連載', '華語サスペンス'),
    blurb: t('線索可回收，章末疑問', 'Reclaimable clues; end questions', '線索可回收', '回収可能な手がかり'),
    topic_hints: ['短篇开局设定钩', '反转与章末疑问', '题材跟检索热门走'],
    craft: craft({
      sentence: '細節具體；疑問句收段',
      stance: '讀者可推理，不靠超能力',
      opening: '異常細節先於解釋',
      avoid: '無限逆轉無規則',
      lexicon: '不對、時間點、誰還知道',
    }),
    referenceParagraph: ref(
      '鬧鐘定在案後十分鐘。死人不會定未來——除非有人用過這支手機。',
      'Alarm set for ten minutes after the crime. The dead don’t schedule the future.',
      '鬧鐘定在案後十分鐘。死人不會定未來。',
      '事件後十分のアラーム。死人は未来を予約しない。'
    ),
    fictionPack: { platform: 'web_tw', pace: 'clue_drop', must_have: ['可回收線索', '章末疑問'], chapter_end: '推翻假設的新細節' },
  },
  {
    id: 'fq_en_litrpg',
    language: 'en',
    region: 'en',
    label: t('升级体系·战力可读', 'LitRPG readable power ladder', '升級體系·戰力可讀', 'LitRPG戦力段階'),
    uiAuthorHint: t('參考：Royal Road 升级流热门', 'Ref: Royal Road LitRPG hits', '參考：Royal Road 升級流', '参考：Royal Road系'),
    blurb: t('规则清楚、战斗结算即时', 'Clear rules; instant fight ledger', '規則清楚', 'ルール明確'),
    topic_hints: ['Readable power rules', 'Instant growth payoff', 'Bigger challenge hook'],
    craft: craft({
      sentence: 'Short beats; stats serve drama, not spreadsheets',
      stance: 'Growth visible; no vague epiphanies',
      opening: 'Power gap or exam under pressure',
      avoid: 'Rule-breaking cheats, endless travel logs',
      lexicon: 'level, cooldown, party, rank, this hit',
    }),
    referenceParagraph: ref(
      '考核读数报出时场下静了。他抬手，第二道纹路比嘲讽亮得更快。',
      'When the exam read his value, the yard went still. The second rune lit faster than the mockery.',
      '考核讀數報出時場下靜了。',
      '測定値が読まれ、場が止まった。二本目の紋が嘲笑より速い。'
    ),
    fictionPack: { platform: 'royal_road', pace: 'power_ladder', must_have: ['rule clarity', 'fight feedback'], chapter_end: 'stronger foe or new map' },
  },
  {
    id: 'fq_en_enemies_romance',
    language: 'en',
    region: 'en',
    label: t('冤家拉扯·慢燃亲密', 'Enemies-to-lovers slow burn', '冤家拉扯·慢燃親密', '敵から恋人へ'),
    uiAuthorHint: t('參考：Kindle/Wattpad 冤家甜虐', 'Ref: Kindle/Wattpad enemies-to-lovers', '參考：Kindle/Wattpad 冤家', '参考：敵恋トロペ'),
    blurb: t('摩擦密、误会可解、亲密升级', 'Dense friction; solvable misread; intimacy ladder', '摩擦密', '摩擦が密'),
    topic_hints: ['Light daily misunderstanding', 'Dense warm banter', 'Resolvable conflict'],
    craft: craft({
      sentence: 'Dialogue-heavy; body language light; interior brief',
      stance: 'Heat without cruelty cosplay',
      opening: 'Competing interests in one room',
      avoid: 'Endless third-party melodrama, oily boss lines',
      lexicon: 'you again, temporary, don’t read into it, fine',
    }),
    referenceParagraph: ref(
      '电梯门开两人都停了一秒。他把伞递过去：「合同的事，出去说。」',
      'The elevator opened; both froze. He offered the umbrella: “We’ll talk contract outside.”',
      '電梯門開兩人都停了一秒。',
      'エレベーターが開き、二人とも止まった。傘を先に出した。'
    ),
    fictionPack: { platform: 'kindle_wattpad', pace: 'slow_burn', must_have: ['friction', 'solvable misread'], chapter_end: 'unfinished care' },
  },
  {
    id: 'fq_en_portal',
    language: 'en',
    region: 'en',
    label: t('异世界门·生存节奏', 'Portal fantasy survival pace', '異世界門·生存節奏', '異世界サバイバル'),
    uiAuthorHint: t('參考：Royal Road / Kindle 异世界门', 'Ref: portal-fantasy serial hits', '參考：portal fantasy 熱門', '参考：異世界門系'),
    blurb: t('规则发现、资源焦虑、章末危机', 'Rule discovery, resource dread, end crisis', '規則發現', 'ルール発見'),
    topic_hints: ['Short-premises hook', 'Twist + chapter-end Q', 'Topics follow trending hits'],
    craft: craft({
      sentence: 'Concrete sensory; stakes per chapter',
      stance: 'Curious survival, not tourist montage',
      opening: 'Wrong-world consequence in scene one',
      avoid: 'Encyclopedia dumps, harem derails',
      lexicon: 'rule, ration, gate, cost, not home',
    }),
    referenceParagraph: ref(
      '门在身后合上时，手机还显示着未接来电——那边的世界仍在催债。',
      'The door sealed behind him with a missed-call banner still lit—the other world was still collecting.',
      '門在身後合上時，手機還顯示未接來電。',
      '扉が閉じて、不在着信がまだ光っていた。あちらの借金取りは止まらない。'
    ),
    fictionPack: { platform: 'royal_road', pace: 'survival_hook', must_have: ['rule discover', 'chapter crisis'], chapter_end: 'worse scarcity' },
  },
  {
    id: 'fq_en_thriller_serial',
    language: 'en',
    region: 'en',
    label: t('连载惊悚·线索回收', 'Serial thriller clue reclaim', '連載驚悚·線索回收', '連載スリラー'),
    uiAuthorHint: t('參考：英文连载惊悚/神秘', 'Ref: EN serial thriller/mystery', '參考：英文連載驚悚', '参考：英連載スリラー'),
    blurb: t('不可靠叙述、章末翻盘疑问', 'Unreliable narrator; end flip questions', '不可靠叙述', '信頼できない語り'),
    topic_hints: ['Short-premises hook', 'Twist + chapter-end Q', 'Topics follow trending hits'],
    craft: craft({
      sentence: 'Specific detail; end on a question',
      stance: 'Reader can play detective',
      opening: 'Anomaly before explanation',
      avoid: 'Rule-free infinite twists',
      lexicon: 'off, timestamp, who else, again',
    }),
    referenceParagraph: ref(
      '闹钟定在案后十分钟。死人不会定未来。',
      'The alarm was set for ten minutes after the crime. The dead don’t schedule the future.',
      '鬧鐘定在案後十分鐘。',
      '事件後十分のアラーム。死人は未来を予約しない。'
    ),
    fictionPack: { platform: 'en_serial', pace: 'clue_drop', must_have: ['reclaimable clue', 'end question'], chapter_end: 'detail that kills last theory' },
  },
  {
    id: 'fq_ja_tensei',
    language: 'ja',
    region: 'ja',
    label: t('异世界转生·成长阶梯', 'Isekai growth ladder', '異世界轉生·成長階梯', '異世界転生・成長階段'),
    uiAuthorHint: t('參考：なろう系转生热门', 'Ref: Narou isekai hits', '參考：なろう系轉生', '参考：なろう転生系'),
    blurb: t('能力可见、任务回报清楚', 'Visible skill; clear quest payout', '能力可見', '能力が見える'),
    topic_hints: ['Short-premises hook', 'Twist + chapter-end Q', 'Topics follow trending hits'],
    craft: craft({
      sentence: '戦力情報を先に。技能名は短く',
      stance: '成長が見える。曖昧な悟り禁止',
      opening: '実力差か試験から',
      avoid: '無規則チート、後宮で本線切断',
      lexicon: 'レベル、スキル、報酬、この一撃',
    }),
    referenceParagraph: ref(
      '测定值报出时场地静了。第二道纹路比嘲笑亮得更快。',
      'The reading silenced the yard. The second rune beat the mockery.',
      '測定値で場が止まった。',
      '測定値が読まれ、場が止まった。二本目の紋が嘲笑より速い。'
    ),
    fictionPack: { platform: 'narou', pace: 'power_ladder', must_have: ['成長可視化', '任務回報'], chapter_end: 'より強い敵' },
  },
  {
    id: 'fq_ja_akuyaku',
    language: 'ja',
    region: 'ja',
    label: t('恶役千金·信息战', 'Villainess info-war', '惡役千金·資訊戰', '悪役令嬢・情報戦'),
    uiAuthorHint: t('參考：悪役令嬢系热门笔法', 'Ref: villainess otome-game hits', '參考：惡役令嬢系', '参考：悪役令嬢系'),
    blurb: t('剧透优势、社交牌局、反旗号', 'Meta foresight; social cards; flag cuts', '劇透優勢', 'メタ先見'),
    topic_hints: ['Short-premises hook', 'Twist + chapter-end Q', 'Topics follow trending hits'],
    craft: craft({
      sentence: '会話で札を切る。独白は短く',
      stance: '賢く生き残る。無意味な虐げ禁止',
      opening: '旗が見えた瞬間',
      avoid: '無限ざまぁだけで構造なし',
      lexicon: 'フラグ、破棄、立場、次の手',
    }),
    referenceParagraph: ref(
      '她把婚约文件推回去：「毁掉我的剧本，从这一页撕开。」',
      'She pushed the engagement papers back: “Your ruin-script starts when this page tears.”',
      '她把婚約文件推回去。',
      '婚約の書類を戻した。「破滅の台本は、この頁から裂く。」'
    ),
    fictionPack: { platform: 'narou_kakuyomu', pace: 'flag_cut', must_have: ['メタ情報', '社交勝負'], chapter_end: '新しい旗' },
  },
  {
    id: 'fq_ja_slowlife',
    language: 'ja',
    region: 'ja',
    label: t('慢生活·治愈节拍', 'Slow-life comfort pace', '慢生活·治癒節拍', 'スローライフ・癒し'),
    uiAuthorHint: t('參考：なろう慢生活/治愈系', 'Ref: Narou slow-life comfort', '參考：なろう慢生活', '参考：スローライフ系'),
    blurb: t('冲突轻、生活密、温暖收束', 'Light conflict; dense daily; warm close', '衝突輕', '衝突は軽く'),
    topic_hints: ['Short-premises hook', 'Twist + chapter-end Q', 'Topics follow trending hits'],
    craft: craft({
      sentence: '対話多め。動作は軽い',
      stance: '癒し優先。長引き虐げ禁止',
      opening: '生活の小さな詰まり',
      avoid: '強行な闇落ち、テンプレ霸總',
      lexicon: '今日は、手伝お、ちょうど',
    }),
    referenceParagraph: ref(
      '电梯门开两人都停了一秒。他把伞递过去。',
      'The elevator opened; both froze. He offered the umbrella first.',
      '電梯門開兩人都停了一秒。',
      'エレベーターが開き、二人とも止まった。傘を先に出した。'
    ),
    fictionPack: { platform: 'narou', pace: 'soft_daily', must_have: ['日常密度', '可解误会'], chapter_end: '言い切れない優しさ' },
  },
  {
    id: 'fq_ja_workplace',
    language: 'ja',
    region: 'ja',
    label: t('职场转生·局与筹码', 'Workplace isekai mind-game', '職場轉生·局與籌碼', '職場転生・駆け引き'),
    uiAuthorHint: t('參考：日式职场/转生智斗', 'Ref: JP workplace / reincarnated office', '參考：日式職場智鬥', '参考：職場転生系'),
    blurb: t('对白交锋、可见筹码', 'Dialogue duels; visible stakes', '對白交鋒', '対話で勝負'),
    topic_hints: ['Short-premises hook', 'Twist + chapter-end Q', 'Topics follow trending hits'],
    craft: craft({
      sentence: '対話で殴る。動作は少ない',
      stance: '計算と原則の両立',
      opening: '利害衝突の現場から',
      avoid: '暴力で商事を解決',
      lexicon: '条件、録音、賭け、何が欲しい',
    }),
    referenceParagraph: ref(
      '他把文件夹推到桌心：「附件三不是原件。你们要的是时间。」',
      'He slid the folder over: “Annex three isn’t original. You want time.”',
      '他把文件夾推到桌心。',
      'フォルダを中央へ。「別紙三は原本じゃない。欲しいのは時間だ。」'
    ),
    fictionPack: { platform: 'kakuyomu', pace: 'mind_game', must_have: ['可見籌碼', '對白交鋒'], chapter_end: '裏切りの兆し' },
  },
];

// ── 短剧 hongguo_drama ────────────────────────────────────────────────
export const hongguoExtra: ExtraVoice[] = [
  {
    id: 'hg_tw_conflict',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('華文短劇強衝突開鉤', 'CJK short-drama hard open', '華文短劇強衝突開鉤', '華語縦型強衝突'),
    uiAuthorHint: t('參考：華文短劇強衝突寫手', 'Ref: CJK vertical short-drama conflict', '參考：華文短劇強衝突', '華語縦型強衝突'),
    blurb: t('前三十秒衝突，對白可拍', 'Conflict in 30s; shootable lines', '前三十秒衝突', '30秒で衝突'),
    topic_hints: ['前三十秒可视冲突', '短促可拍对白', '集末更大钩'],
    craft: craft({
      sentence: '對白短促；旁白極少',
      stance: '情緒濃但因果清',
      opening: '衝突已爆發的第一句',
      avoid: '長內心、慢熱超過兩場',
      lexicon: '你憑什麼、當著大家、從今天起',
    }),
    referenceParagraph: ref(
      '紅毯麥克風還亮著。她把證件舉起來：「婚，我拒絕。」',
      'The mic was still live. She raised the papers: “I refuse this marriage.”',
      '紅毯麥克風還亮著。她把證件舉起來：「婚，我拒絕。」',
      'マイクはまだ生きていた。書類を掲げた。「結婚、拒否します。」'
    ),
    fictionPack: { platform: 'short_drama_tw', pace: 'episode_hook', must_have: ['可視衝突', '集末反轉'], chapter_end: '更大醜聞將爆' },
  },
  {
    id: 'hg_tw_identity',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('身份反轉·打臉連擊', 'Identity twist slap chain', '身份反轉·打臉連擊', '身分逆転連打'),
    uiAuthorHint: t('參考：華文馬甲短劇', 'Ref: CJK hidden-identity shorts', '參考：華文馬甲短劇', '華語身分劇'),
    blurb: t('馬甲層層揭，嘲諷變慘', 'Layered reveal; mockers fall', '馬甲層層揭', 'カミングアウト段階'),
    topic_hints: ['被错待后物证揭穿', '分层马甲连击', '更大马甲未揭钩'],
    craft: craft({
      sentence: '物證揭身份；少解釋段',
      stance: '爽感來自信息對稱瞬間',
      opening: '被錯待的場景',
      avoid: '無鋪墊神豪空降',
      lexicon: '你認錯人了、合同在這',
    }),
    referenceParagraph: ref(
      '保安還想攔，門口卻響起職稱。她把工牌翻面。',
      'Security moved as the title was announced at the door. She flipped her badge.',
      '保安還想攔，門口卻響起職稱。她把工牌翻面。',
      '止めに来た警備の横で肩書が呼ばれた。名札を裏返した。'
    ),
    fictionPack: { platform: 'short_drama_tw', pace: 'reveal_ladder', must_have: ['錯待', '物證'], chapter_end: '更大馬甲' },
  },
  {
    id: 'hg_tw_payback',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('逆襲證據局·可圍觀', 'Payback evidence spectacle', '逆襲證據局·可圍觀', '逆転証拠劇'),
    uiAuthorHint: t('參考：華文短劇反击局', 'Ref: CJK payback short drama', '參考：華文短劇反擊', '華語逆転劇'),
    blurb: t('證據鏈短平快，公開場面', 'Short evidence chain; public scene', '證據鏈短平快', '短い証拠連鎖'),
    topic_hints: ['证据链短平快公开', '围观场面反击', '幕后黑手集末钩'],
    craft: craft({
      sentence: '證據出示即轉折',
      stance: '合法框架內反擊',
      opening: '被逼到牆角',
      avoid: '教唆犯罪細節',
      lexicon: '證據、公證、你們看',
    }),
    referenceParagraph: ref(
      '大屏切到郵件時間戳。他只說：「誣陷我的人也在邀請名單裡。」',
      'The screen cut to email timestamps: “The people who framed me are also invited.”',
      '大屏切到郵件時間戳。',
      '画面がメールの時刻印へ。「陥れた人も、招待リストにいる。」'
    ),
    fictionPack: { platform: 'short_drama_tw', pace: 'payback', must_have: ['證據', '公開場面'], chapter_end: '幕後黑手' },
  },
  {
    id: 'hg_en_reel_conflict',
    language: 'en',
    region: 'en',
    label: t('ReelShort式强冲突冷开场', 'ReelShort hard-conflict cold open', 'ReelShort式強衝突冷開場', 'ReelShort式強衝突'),
    uiAuthorHint: t('參考：ReelShort/DramaBox 强冲突', 'Ref: ReelShort/DramaBox conflict hits', '參考：ReelShort 強衝突', '参考：縦型ドラマ衝突'),
    blurb: t('开场即撕，对白可拍', 'Tear open cold; shootable dialogue', '開場即撕', '冒頭で裂く'),
    topic_hints: ['Conflict in first 30s', 'Shootable short lines', 'Bigger episode-end hook'],
    craft: craft({
      sentence: 'Staccato dialogue; almost no VO',
      stance: 'Big emotion, clear cause',
      opening: 'First line already mid-fight',
      avoid: 'Long interior monologue',
      lexicon: 'how dare you, in front of everyone, from today',
    }),
    referenceParagraph: ref(
      '红毯麦还亮着。她举起证件：「婚，我拒绝。」',
      'The red-carpet mic was still live. She raised the papers: “I refuse this marriage.”',
      '紅毯麥還亮著。',
      'マイクはまだ生きていた。「結婚、拒否します。」'
    ),
    fictionPack: { platform: 'reelshort', pace: 'episode_hook', must_have: ['visual conflict', 'episode twist'], chapter_end: 'bigger scandal incoming' },
  },
  {
    id: 'hg_en_ceo_twist',
    language: 'en',
    region: 'en',
    label: t('隐藏身份·打脸连击', 'Hidden CEO slap chain', '隱藏身份·打臉連擊', '隠し身分連打'),
    uiAuthorHint: t('參考：英文竖屏马甲爽剧', 'Ref: EN vertical hidden-CEO tropes', '參考：英文豎屏馬甲', '参考：隠しCEO系'),
    blurb: t('错待→物证→连击', 'Mistreat → proof → chain slap', '錯待→物證', '誤解→証拠'),
    topic_hints: ['Wronged then proof reveal', 'Layered identity slap', 'Bigger mask still hidden'],
    craft: craft({
      sentence: 'Reveal via props/third party',
      stance: 'Pleasure from information symmetry',
      opening: 'Wronged in public',
      avoid: 'Unforeshadowed billionaire drop',
      lexicon: 'wrong person, contract, let them in',
    }),
    referenceParagraph: ref(
      '保安还想拦，门口却响起董事长到。她把工牌翻面。',
      'Security moved as “Chair’s here” hit the door. She flipped her badge.',
      '保安還想攔，門口卻響起職稱。',
      '警備が動いた瞬間、肩書が呼ばれた。名札を裏返した。'
    ),
    fictionPack: { platform: 'dramabox', pace: 'reveal_ladder', must_have: ['mistreatment', 'proof'], chapter_end: 'bigger mask' },
  },
  {
    id: 'hg_en_revenge_ep',
    language: 'en',
    region: 'en',
    label: t('反击证据·公开处刑感', 'Revenge evidence public beat', '反擊證據·公開處刑感', '復讐証拠の公開'),
    uiAuthorHint: t('參考：英文竖屏反击集', 'Ref: EN vertical payback episodes', '參考：英文豎屏反擊', '参考：縦型復讐回'),
    blurb: t('短证据链、可围观场面', 'Short proof chain; crowd scene', '短證據鏈', '短い証拠'),
    topic_hints: ['Conflict in first 30s', 'Shootable short lines', 'Bigger episode-end hook'],
    craft: craft({
      sentence: 'Proof = plot turn',
      stance: 'Legalistic payback frame',
      opening: 'Cornered',
      avoid: 'Crime how-to detail',
      lexicon: 'evidence, notary, watch this',
    }),
    referenceParagraph: ref(
      '大屏切到邮件时间戳：「诬陷我的人也在邀请名单里。」',
      'The launch screen cut to timestamps: “The people who framed me are also on the invite list.”',
      '大屏切到郵件時間戳。',
      '時刻印が映った。「陥れた人も招待されている。」'
    ),
    fictionPack: { platform: 'reelshort', pace: 'payback', must_have: ['proof', 'public'], chapter_end: 'bigger villain' },
  },
  {
    id: 'hg_ja_tate_conflict',
    language: 'ja',
    region: 'ja',
    label: t('縦型強衝突·冒頭フック', 'Vertical conflict cold hook', '豎型強衝突·冒頭鉤', '縦型強衝突・冒頭フック'),
    uiAuthorHint: t('參考：日式縦型ショートドラマ', 'Ref: JP vertical short-drama hits', '參考：日式縱型短劇', '参考：縦型ショートドラマ'),
    blurb: t('三十秒内撕裂关系', 'Relationship tear in 30s', '三十秒撕裂', '30秒で関係が裂ける'),
    topic_hints: ['Conflict in first 30s', 'Shootable short lines', 'Bigger episode-end hook'],
    craft: craft({
      sentence: '短い台詞。ナレほぼ無し',
      stance: '感情は濃いが因果は明確',
      opening: 'すでに壊れている第一声',
      avoid: '長い独白',
      lexicon: '何の権利で、皆の前で、今日から',
    }),
    referenceParagraph: ref(
      '麦克风还亮着。她举起证件拒绝婚礼。',
      'The mic was still live. She raised the papers and refused the marriage.',
      '麥克風還亮著。她拒絕婚禮。',
      'マイクは生きていた。書類を掲げ、結婚を拒んだ。'
    ),
    fictionPack: { platform: 'jp_vertical', pace: 'episode_hook', must_have: ['可視衝突', '話末反轉'], chapter_end: 'より大きい醜聞' },
  },
  {
    id: 'hg_ja_kakushi',
    language: 'ja',
    region: 'ja',
    label: t('隠し身分·逆転連打', 'Hidden identity slap chain', '隱藏身分·逆轉連打', '隠し身分・逆転連打'),
    uiAuthorHint: t('參考：日式身分逆転短劇', 'Ref: JP identity-twist shorts', '參考：日式身分劇', '参考：身分逆転系'),
    blurb: t('誤解待遇→証拠→連打', 'Mistreat → proof → chain', '誤解→證據', '誤解→証拠'),
    topic_hints: ['Conflict in first 30s', 'Shootable short lines', 'Bigger episode-end hook'],
    craft: craft({
      sentence: '物証で明かす',
      stance: '対称が快感',
      opening: '不当な扱い',
      avoid: '伏線ゼロの大富豪',
      lexicon: '人違い、契約はここ',
    }),
    referenceParagraph: ref(
      '保安要拦时门口响起职称，她翻过工牌。',
      'Security moved as the title was called; she flipped her badge.',
      '保安要攔時門口響起職稱。',
      '止めに来た横で肩書が呼ばれ、名札を裏返した。'
    ),
    fictionPack: { platform: 'jp_vertical', pace: 'reveal_ladder', must_have: ['錯待', '物證'], chapter_end: '更大面具' },
  },
  {
    id: 'hg_ja_gyakushu',
    language: 'ja',
    region: 'ja',
    label: t('逆転証拠·公開局面', 'Payback proof public turn', '逆轉證據·公開局面', '逆転証拠・公開局面'),
    uiAuthorHint: t('參考：日式逆転劇集末', 'Ref: JP payback episode closes', '參考：日式逆轉集', '参考：逆転ドラマ系'),
    blurb: t('短い証拠鎖と見物空間', 'Short proof chain + crowd', '短證據鏈', '短い証拠連鎖'),
    topic_hints: ['Conflict in first 30s', 'Shootable short lines', 'Bigger episode-end hook'],
    craft: craft({
      sentence: '証拠提示＝転換',
      stance: '合法枠の反撃',
      opening: '追い詰め',
      avoid: '犯罪手順',
      lexicon: '証拠、公证、見て',
    }),
    referenceParagraph: ref(
      '大屏切到时间戳：「诬陷我的人也在名单里。」',
      'Timestamps hit the screen: “My framers are also invited.”',
      '大屏切到時間戳。',
      '時刻印が映った。「陥れた人も招待されている。」'
    ),
    fictionPack: { platform: 'jp_vertical', pace: 'payback', must_have: ['證據', '公開'], chapter_end: '黒幕' },
  },
];

// ── finance / political / self_media / voiceover ───────────────────────
function reportLeaf(p: {
  id: string;
  language: string;
  region: string;
  label: I18n;
  hint: I18n;
  blurb: I18n;
  hints: string[];
  craft: ReturnType<typeof craft>;
  para: I18n;
  reportPack?: Record<string, unknown>;
  mediaPack?: Record<string, unknown>;
}): ExtraVoice {
  return {
    id: p.id,
    language: p.language,
    region: p.region,
    label: p.label,
    uiAuthorHint: p.hint,
    blurb: p.blurb,
    topic_hints: p.hints,
    craft: p.craft,
    referenceParagraph: p.para,
    ...(p.reportPack ? { reportPack: p.reportPack } : {}),
    ...(p.mediaPack ? { mediaPack: p.mediaPack } : {}),
  };
}

export const financeExtra: ExtraVoice[] = [
  reportLeaf({
    id: 'fin_tw_deal',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('財訊式交易條款拆解', 'Wealth Mag–style deal clauses', '財訊式交易條款拆解', '財経誌式ディール解剖'),
    hint: t('參考：華文一級市場/併購拆解', 'Ref: CJK deal-breakdown writers', '參考：華文併購拆解', '華語ディール分解'),
    blurb: t('條款結構清楚，少雞湯', 'Clear clauses; little soup', '條款清楚', '条項が明確'),
    hints: ['反直觉条款先抛', '机制对照谁受益', '风险边界写清楚'],
    craft: craft({
      sentence: '定義→機制→誰受益',
      stance: '中性解剖，結論謹慎',
      opening: '最反直覺的一條條款',
      avoid: '陰謀論、假內部人士精確引語',
      lexicon: '交割、或有、控制權、稀釋',
    }),
    para: ref(
      '表面是業績對賭，真正改變控制權的是未能完成時的代持解除條件。',
      'The headline is an earnout; control shifts on the escrow-release if targets miss.',
      '表面是業績對賭，真正改變控制權的是代持解除條件。',
      '見出しはアーンアウト。支配が動くのは未達時の解除条件だ。'
    ),
    reportPack: { evidence: 'required', forbid: ['假引語'], shape: ['條款對照', '受益方', '風險邊界'] },
  }),
  reportLeaf({
    id: 'fin_tw_floor',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('經濟日報式市場現場', 'Economic Daily–style floor', '經濟日報式市場現場', '市場紙面式フロア'),
    hint: t('參考：華文交易員現場感專欄', 'Ref: CJK trader-floor columns', '參考：華文交易現場', '華語フロア感'),
    blurb: t('預期差與群像，不薦股', 'Expectation gaps; no tips', '預期差，不薦股', '期待差・推奨なし'),
    hints: ['时间切片盘口转折', '流动性与预期差', '克制不下荐股'],
    craft: craft({
      sentence: '時間戳意識；感官服務機制',
      stance: '現場感強，判斷克制',
      opening: '某一刻盤口轉折',
      avoid: '買賣點、目標價',
      lexicon: '流動性、預期差、擁擠',
    }),
    para: ref(
      '十四點二十買盤變薄。不是崩，是大家想起「穩了」沒有擔保函。',
      'At 14:20 bids thinned—not a crash, just memory that “it’s fine” had no guarantee.',
      '十四點二十買盤變薄。',
      '14:20、買いが薄くなった。「大丈夫」に保証はなかった。'
    ),
    reportPack: { evidence: 'soft_required', forbid: ['薦股'], shape: ['時間切片', '流動性'] },
  }),
  reportLeaf({
    id: 'fin_tw_governance',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('鏡週刊式公司人物', 'Mirror–style company profile', '鏡週刊式公司人物', '企業人物ルポ式'),
    hint: t('參考：華文公司深度人物稿', 'Ref: CJK company-profile features', '參考：華文公司人物', '華語企業人物'),
    blurb: t('人以帶出激勵，禁英雄傳', 'People → incentives; no hagiography', '人以帶出激勵', '人物からインセンティブ'),
    hints: ['反常人事带出治理', '人物动作→激励含义', '未知项标明边界'],
    craft: craft({
      sentence: '人物動作→治理含義',
      stance: '理解動機，不神化',
      opening: '反常人事決定',
      avoid: '編造私生活、侮辱標籤',
      lexicon: '治理、激勵、投票權、披露',
    }),
    para: ref(
      '減持聲明寫個人資金需求，同日公司宣布回購——激勵方向相反。',
      'His filing said personal liquidity; the same day a buyback—incentives point opposite ways.',
      '減持與回購同一天，激勵方向相反。',
      '個人資金需要の開示と同日の自社株買い。インセンティブは逆向き。'
    ),
    reportPack: { evidence: 'required', forbid: ['誹謗性私生活'], shape: ['人物動作', '治理含義'] },
  }),
  reportLeaf({
    id: 'fin_en_deal',
    language: 'en',
    region: 'en',
    label: t('FT式交易条款拆解', 'FT-style deal clause breakdown', 'FT式交易條款拆解', 'FT式ディール分解'),
    hint: t('參考：英文并购/PE 拆解写手', 'Ref: EN M&A / PE breakdown writers', '參考：英文併購拆解', '参考：英M&A分解'),
    blurb: t('条款清楚，结论谨慎', 'Clear clauses; cautious close', '條款清楚', '慎重な結論'),
    hints: ['Counterintuitive clause first', 'Mechanism who benefits', 'Clear risk boundary'],
    craft: craft({
      sentence: 'Define → mechanism → who benefits',
      stance: 'Neutral anatomy',
      opening: 'Most counterintuitive clause',
      avoid: 'Conspiracy, fake precise quotes',
      lexicon: 'closing, contingent, control, dilution',
    }),
    para: ref(
      '表面是对赌，控制权在未完成时的代持解除条件上移动。',
      'The headline is an earnout; control moves on the escrow-release if targets miss.',
      '表面是對賭，控制權在解除條件上移動。',
      '見出しはアーンアウト。支配は未達時の解除で動く。'
    ),
    reportPack: { evidence: 'required', forbid: ['fake quotes'], shape: ['clause contrast', 'beneficiaries'] },
  }),
  reportLeaf({
    id: 'fin_en_floor',
    language: 'en',
    region: 'en',
    label: t('Bloomberg式市场现场', 'Bloomberg-style market floor', 'Bloomberg式市場現場', 'Bloomberg式フロア'),
    hint: t('參考：英文交易现场专栏', 'Ref: EN trader-floor columns', '參考：英文交易現場', '参考：英フロアコラム'),
    blurb: t('流动性与预期差，不荐股', 'Liquidity & gaps; no tips', '不薦股', '推奨なし'),
    hints: ['Timestamp floor turn', 'Liquidity vs expectation gap', 'No stock tips'],
    craft: craft({
      sentence: 'Timestamped; sensory serves mechanism',
      stance: 'Scene-rich, judgment light',
      opening: 'One tape turn',
      avoid: 'Buy/sell calls, price targets',
      lexicon: 'liquidity, crowded, basis, roll',
    }),
    para: ref(
      '十四点二十买盘变薄——「稳了」没有担保函。',
      'At 14:20 bids thinned—yesterday’s “it’s fine” came with no guarantee letter.',
      '十四點二十買盤變薄。',
      '14:20、買いが薄くなった。「大丈夫」に保証はなかった。'
    ),
    reportPack: { evidence: 'soft_required', forbid: ['stock tips'], shape: ['time slice', 'liquidity'] },
  }),
  reportLeaf({
    id: 'fin_en_governance',
    language: 'en',
    region: 'en',
    label: t('WSJ式公司人物', 'WSJ-style company profile', 'WSJ式公司人物', 'WSJ式企業人物'),
    hint: t('參考：英文公司人物深度', 'Ref: EN company-profile features', '參考：英文公司人物', '参考：英企業人物'),
    blurb: t('人带出治理，禁英雄传', 'People → governance; no hagiography', '禁英雄傳', '英雄伝禁止'),
    hints: ['Odd HR → governance', 'Action → incentive meaning', 'Mark unknowns'],
    craft: craft({
      sentence: 'Action → governance meaning',
      stance: 'Motive without myth',
      opening: 'Odd HR decision',
      avoid: 'Invented private life',
      lexicon: 'governance, incentive, disclosure, vote',
    }),
    para: ref(
      '减持称个人资金需求，同日回购——激励相反。',
      'Filing: personal liquidity. Same day: buyback. Incentives point opposite ways.',
      '減持與回購同一天。',
      '個人流動性開示と同日の自社株買い。向きが逆。'
    ),
    reportPack: { evidence: 'required', forbid: ['defamation'], shape: ['action', 'governance'] },
  }),
  reportLeaf({
    id: 'fin_ja_deal',
    language: 'ja',
    region: 'ja',
    label: t('東洋経済式取引解剖', 'Toyo Keizai–style deal anatomy', '東洋経済式交易解剖', '東洋経済式ディール解剖'),
    hint: t('參考：日式并购/投资拆解', 'Ref: JP deal-breakdown writers', '參考：日式併購拆解', '参考：日本ディール分解'),
    blurb: t('条项结构清楚', 'Clear clause structure', '條款清楚', '条項構造が明確'),
    hints: ['Counterintuitive clause first', 'Mechanism who benefits', 'Clear risk boundary'],
    craft: craft({
      sentence: '定義→機制→受益者',
      stance: '中立。結論は慎重',
      opening: '最も反直感な条項',
      avoid: '陰謀、偽の内部筋',
      lexicon: 'クロージング、偶発、支配、希薄化',
    }),
    para: ref(
      '表面是对赌，控制权在未达时的解除条件上。',
      'Earnout headline; control moves on miss-triggered release.',
      '表面是對賭，控制權在解除條件上。',
      '見出しはアーンアウト。支配は未達時の解除で動く。'
    ),
    reportPack: { evidence: 'required', forbid: ['偽引用'], shape: ['条項対照', '受益者'] },
  }),
  reportLeaf({
    id: 'fin_ja_floor',
    language: 'ja',
    region: 'ja',
    label: t('日経式市場現場', 'Nikkei-style market floor', '日経式市場現場', '日経式市場現場'),
    hint: t('參考：日式市场现场专栏', 'Ref: JP market-floor columns', '參考：日式市場現場', '参考：日本フロア感'),
    blurb: t('期待差と群像。推奨なし', 'Expectation gaps; no tips', '不薦股', '推奨なし'),
    hints: ['Timestamp floor turn', 'Liquidity vs expectation gap', 'No stock tips'],
    craft: craft({
      sentence: '時刻意識。感覚は機制のため',
      stance: '現場感、判断は抑える',
      opening: '板の転換点',
      avoid: '売買指示',
      lexicon: '流動性、期待差、過密',
    }),
    para: ref(
      '十四点二十买盘变薄。',
      'At 14:20 bids thinned.',
      '十四點二十買盤變薄。',
      '14:20、買いが薄くなった。「大丈夫」に保証はなかった。'
    ),
    reportPack: { evidence: 'soft_required', forbid: ['推奨'], shape: ['時間切片', '流動性'] },
  }),
  reportLeaf({
    id: 'fin_ja_governance',
    language: 'ja',
    region: 'ja',
    label: t('日経ビジネス式企業人物', 'Nikkei Business–style profile', '日経ビジネス式企業人物', '日経ビジネス式企業人物'),
    hint: t('參考：日式企業人物稿', 'Ref: JP company features', '參考：日式企業人物', '参考：日本企業人物'),
    blurb: t('人物からインセンティブへ', 'People → incentives', '人以帶出激勵', '人物→インセンティブ'),
    hints: ['Odd HR → governance', 'Action → incentive meaning', 'Mark unknowns'],
    craft: craft({
      sentence: '動作→統治の意味',
      stance: '神格化しない',
      opening: '奇妙な人事',
      avoid: '私生活捏造',
      lexicon: '統治、インセンティブ、開示',
    }),
    para: ref(
      '减持与回购同一天，激励相反。',
      'Sale filing and buyback same day—opposite incentives.',
      '減持與回購同一天。',
      '個人売却開示と同日の自社株買い。向きが逆。'
    ),
    reportPack: { evidence: 'required', forbid: ['誹謗'], shape: ['動作', '統治'] },
  }),
];

export const politicalExtra: ExtraVoice[] = [
  reportLeaf({
    id: 'pol_tw_wire',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('中央社電訊體·事實序', 'CNA wire–style fact order', '中央社電訊體·事實序', '通信社電信体'),
    hint: t('參考：華文主流時政電訊', 'Ref: CJK political wire style', '參考：華文時政電訊', '華語時事電信'),
    blurb: t('時間-主體-動作-口徑', 'Time–actor–action–line', '時間-主體-動作', '時刻-主体-動作'),
    hints: ['事实序少形容词', '口径可核对', '未知项单列'],
    craft: craft({
      sentence: '誰在何時做了什麼',
      stance: '中立克制，判斷後置',
      opening: '最新動作，不先抒情',
      avoid: '煽動、陰謀、假引語',
      lexicon: '表示、指出、截至、口徑',
    }),
    para: ref(
      '主管部門發布通知稱措施「穩妥實施」，未披露時間表與範圍。',
      'The regulator said measures would proceed “prudently,” with no timeline or scope.',
      '通知稱「穩妥實施」，未披露時間表。',
      '「着実に実施」と通知。日程も範囲もなし。'
    ),
    reportPack: { evidence: 'required', forbid: ['假引語', '煽動'], shape: ['事實序', '口徑', '未知'] },
  }),
  reportLeaf({
    id: 'pol_tw_explain',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('報導者式政策拆解', 'The Reporter–style policy explainer', '報導者式政策拆解', '調査媒体式政策解説'),
    hint: t('參考：華文政策解讀寫手', 'Ref: CJK policy explainers', '參考：華文政策解讀', '華語政策解説'),
    blurb: t('誰受益/誰承壓', 'Who benefits / who pays', '誰受益誰承壓', '誰が得て誰が負う'),
    hints: ['谁受益谁承压拆解', '机制句完整', '未决细则写明'],
    craft: craft({
      sentence: '機制句完整；例子生活化',
      stance: '解說清楚，不煽動',
      opening: '讀者能感知的變化',
      avoid: '民粹口號、恐嚇預測',
      lexicon: '適用、門檻、過渡期、承壓',
    }),
    para: ref(
      '表面優化流程：少蓋兩章，多準備可抽查台賬。',
      'Billed as streamlining: fewer stamps, one more auditable ledger.',
      '表面優化流程：少蓋兩章，多一套台賬。',
      '「簡素化」の実態は、判が二つ減り台帳が一つ増えること。'
    ),
    reportPack: { evidence: 'soft_required', forbid: ['恐嚇預測'], shape: ['機制', '分層影響'] },
  }),
  reportLeaf({
    id: 'pol_tw_local',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('天下雜誌式地方溫差', 'CommonWealth–style local gaps', '天下雜誌式地方溫差', '現場ルポ式温度差'),
    hint: t('參考：華文地方落實觀察', 'Ref: CJK local-implementation notes', '參考：華文地方落實', '華語現場観察'),
    blurb: t('中央表述與窗口執行差', 'Center wording vs window practice', '表述與窗口差', '文言と窓口の差'),
    hints: ['中央表述与窗口温差', '对照两组做法', '慎下全国判断'],
    craft: craft({
      sentence: '對比兩組做法，不升格陰謀',
      stance: '記錄溫差，慎下全國判斷',
      opening: '具體窗口/具體一天',
      avoid: '地域歧視、偽造對話',
      lexicon: '窗口、細則、過渡、排隊',
    }),
    para: ref(
      '同一指南：甲區要預審，乙區說直接提交——讀者需要差異不是站隊。',
      'Same guide: A wants pre-check; B says submit directly—readers need the gap, not a team.',
      '同一指南兩個窗口兩套做法。',
      '同じ指針で、事前審査と直提出が並ぶ。必要なのは差であり陣営ではない。'
    ),
    reportPack: { evidence: 'required', forbid: ['偽造對話'], shape: ['對照', '範圍限制'] },
  }),
  reportLeaf({
    id: 'pol_en_wire',
    language: 'en',
    region: 'en',
    label: t('Reuters式电讯事实序', 'Reuters-style wire order', 'Reuters式電訊事實序', 'Reuters式電信体'),
    hint: t('參考：AP/Reuters 式时政电讯', 'Ref: AP/Reuters-style political wire', '參考：英美電訊體', '参考：通信社電信体'),
    blurb: t('时间-主体-动作-口径', 'Time–actor–action–line', '時間主體動作', '時刻-主体-動作'),
    hints: ['Fact order, few adjectives', 'Verifiable lines', 'List unknowns'],
    craft: craft({
      sentence: 'Who did what when; short attributable lines',
      stance: 'Neutral; judgment last',
      opening: 'Newest action, not lyric',
      avoid: 'Incitement, conspiracy, fake quotes',
      lexicon: 'said, as of, according to, declined to',
    }),
    para: ref(
      '主管部门称措施稳妥实施，未披露时间表。',
      'The agency said measures would proceed “prudently,” without publishing a timeline or scope.',
      '稱措施穩妥實施，未披露時間表。',
      '「着実に実施」と発表。日程も範囲もなし。'
    ),
    reportPack: { evidence: 'required', forbid: ['fake quotes'], shape: ['fact order', 'unknowns'] },
  }),
  reportLeaf({
    id: 'pol_en_explain',
    language: 'en',
    region: 'en',
    label: t('Vox式政策拆解', 'Vox-style policy explainer', 'Vox式政策拆解', 'Vox式政策解説'),
    hint: t('參考：英文政策解说媒体', 'Ref: EN policy-explainer desks', '參考：英文政策解說', '参考：英政策解説'),
    blurb: t('谁受益谁承压', 'Who benefits / who bears cost', '誰受益誰承壓', '得と負担'),
    hints: ['Who benefits / bears cost', 'Full mechanism sentences', 'Name open rules'],
    craft: craft({
      sentence: 'Full mechanism sentences; lived examples',
      stance: 'Explain, don’t whip',
      opening: 'A change readers can feel',
      avoid: 'Populist slogans, scare forecasts',
      lexicon: 'applies to, threshold, transition, carve-out',
    }),
    para: ref(
      '表面优化流程：少盖章，多一套可抽查台账。',
      'Sold as streamlining: fewer stamps—and one more ledger that can be audited.',
      '表面優化：少蓋章多台賬。',
      '簡素化の看板の裏で、判が減り台帳が増える。'
    ),
    reportPack: { evidence: 'soft_required', forbid: ['scare forecasts'], shape: ['mechanism', 'layered impact'] },
  }),
  reportLeaf({
    id: 'pol_en_brief',
    language: 'en',
    region: 'en',
    label: t('白宫简报式问答速写', 'White House briefing–style Q&A', '白宮簡報式問答速寫', '会見ブリーフィング式'),
    hint: t('參考：英文发布会报道结构', 'Ref: EN press-conference writeups', '參考：英文發布會稿', '参考：英会見稿'),
    blurb: t('要点+未答，禁标题党', 'Key points + unanswered; no bait', '要點+未答', '要点と未回答'),
    hints: ['Bullet the briefing', 'Q&A separated', 'Unanswered list close'],
    craft: craft({
      sentence: 'Bullet the news; separate Q&A',
      stance: 'Accuracy over snark',
      opening: 'Hardest new fact',
      avoid: 'Out-of-context headlines',
      lexicon: 'briefed, asked, declined, further notice',
    }),
    para: ref(
      '要点三条；时间表问题被转到另行通知——列入未答。',
      'Three bulletin points. Timeline questions deferred to “further notice”—listed as unanswered.',
      '要點三條；時間表列入未答。',
      '三点。日程は「追って」へ。未回答に入れる。'
    ),
    reportPack: { evidence: 'required', forbid: ['bait headlines'], shape: ['points', 'Q&A', 'unanswered'] },
  }),
  reportLeaf({
    id: 'pol_ja_wire',
    language: 'ja',
    region: 'ja',
    label: t('共同通信式電信体', 'Kyodo wire–style order', '共同通信式電信體', '共同通信式電信体'),
    hint: t('參考：日式通信社電信体', 'Ref: JP wire-style reporting', '參考：日式電信體', '参考：通信社電信体'),
    blurb: t('時刻-主體-動作-口径', 'Time–actor–action–line', '時間主體動作', '時刻-主体-動作-文言'),
    hints: ['Fact order, few adjectives', 'Verifiable lines', 'List unknowns'],
    craft: craft({
      sentence: '誰がいつ何をしたか',
      stance: '抑制。判断は後',
      opening: '最新の動作から',
      avoid: '扇動、陰謀、偽引用',
      lexicon: '発表した、時点で、応じる',
    }),
    para: ref(
      '称稳妥实施，未披露时间表与范围。',
      'Said “prudently,” with no timeline or scope.',
      '稱穩妥實施，未披露時間表。',
      '「着実に実施」と通知。日程も範囲も示さず。'
    ),
    reportPack: { evidence: 'required', forbid: ['偽引用'], shape: ['事実順', '未知'] },
  }),
  reportLeaf({
    id: 'pol_ja_explain',
    language: 'ja',
    region: 'ja',
    label: t('NHK解説式政策拆解', 'NHK explainer–style policy', 'NHK解説式政策拆解', 'NHK解説式政策'),
    hint: t('參考：日式政策解說媒體', 'Ref: JP policy explainers', '參考：日式政策解說', '参考：日本の政策解説'),
    blurb: t('誰が得て誰が負う', 'Who benefits / who pays', '誰受益誰承壓', '得と負担の切り分け'),
    hints: ['Who benefits / bears cost', 'Full mechanism sentences', 'Name open rules'],
    craft: craft({
      sentence: '機制を完結文で。例は生活へ',
      stance: '解説。扇動しない',
      opening: '読者が感じる変化',
      avoid: 'ポピュリズム、恫喝予測',
      lexicon: '適用、閾値、経過、例外',
    }),
    para: ref(
      '表面简化：少盖章，多一套台账。',
      'Sold as simpler: fewer stamps, one more ledger.',
      '表面簡化：少蓋章多台賬。',
      '簡素化の実態は、判が減り台帳が増えること。'
    ),
    reportPack: { evidence: 'soft_required', forbid: ['恫喝予測'], shape: ['機制', '層別影響'] },
  }),
  reportLeaf({
    id: 'pol_ja_local',
    language: 'ja',
    region: 'ja',
    label: t('地方紙式現場溫差', 'Local-paper practice gap', '地方紙式現場溫差', '地方紙式温度差'),
    hint: t('參考：日式地方落实观察', 'Ref: JP local-implementation notes', '參考：日式地方落實', '参考：自治体運用観察'),
    blurb: t('文言と窓口の差', 'Wording vs window practice', '表述與窗口差', '文言と窓口の差を記録'),
    hints: ['Center line vs window gap', 'Contrast two practices', 'Avoid national overclaim'],
    craft: craft({
      sentence: '二つの運用を対照。陰謀に昇格しない',
      stance: '差を記録。全国断定を慎む',
      opening: '具体的な窓口の一日',
      avoid: '地域差別、偽対話',
      lexicon: '窓口、細則、経過、行列',
    }),
    para: ref(
      '同一指南两区两套做法——需要差异不是站队。',
      'Same guide, two queues—readers need the gap, not a team.',
      '同一指南兩套做法。',
      '同じ指針で事前審査と直提出が並ぶ。必要なのは差だ。'
    ),
    reportPack: { evidence: 'required', forbid: ['偽対話'], shape: ['対照', '範囲'] },
  }),
];

export const selfMediaExtra: ExtraVoice[] = [
  reportLeaf({
    id: 'sm_tw_sharp',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('鏡週刊式銳評立場', 'Mirror-style sharp take', '鏡週刊式銳評立場', '鋭い意見・立場'),
    hint: t('參考：華文判斷型銳評', 'Ref: CJK judgment-first opinion', '參考：華文銳評', '華語オピニオン'),
    blurb: t('立場清楚、例子狠、可轉發', 'Clear stance; hard example; shareable', '立場清楚', '立場が明確'),
    hints: ['刺耳判断靠前', '短例支撑可转发', '给反方公平转述'],
    craft: craft({
      sentence: '判斷句靠前；例子短',
      stance: '有立場，給反方一句公平轉述',
      opening: '刺耳判斷',
      avoid: '人身攻擊、造謠',
      lexicon: '本質是、別被、一句說清',
    }),
    para: ref(
      '別再把用戶體驗當遮羞布。這版規則改的是誰能說話。',
      'Stop using “UX” as cover. This rule change is about who may speak.',
      '別再把用戶體驗當遮羞布。',
      'UXを言い訳にするな。誰が話せるかの変更だ。'
    ),
    mediaPack: { channel: 'feed_article', share_close: true },
  }),
  reportLeaf({
    id: 'sm_tw_story',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('報導者式個案故事', 'Reporter-style case feature', '報導者式個案故事', '事例物語'),
    hint: t('參考：以人帶出結構的非虛構', 'Ref: person→structure nonfiction', '參考：華文人物故事', '華語人物物語'),
    blurb: t('一個人帶出結構問題', 'One person → structural issue', '以人帶結構', '一人から構造へ'),
    hints: ['具体一天白描开场', '一人带出结构问题', '共情不消费苦难'],
    craft: craft({
      sentence: '場景白描→問題→輕判斷',
      stance: '共情但不代立誓',
      opening: '具體一天',
      avoid: '消費苦難、編造細節',
      lexicon: '那天、她說、合同、空白',
    }),
    para: ref(
      '排班表連上十三天，中間只有調休待定——待定的是休息不是訂單。',
      'Thirteen days on the roster, one “comp day TBD”—TBD was rest, not orders.',
      '連上十三天，調休待定。',
      '十三日連続。代休は「未定」——未定なのは休みであり注文ではない。'
    ),
    mediaPack: { channel: 'feed_article', share_close: true },
  }),
  reportLeaf({
    id: 'sm_tw_list',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('數位時代式實用清單', 'DigiTimes-style checklist', '數位時代式實用清單', '実行チェックリスト'),
    hint: t('參考：可照做的工具文', 'Ref: actionable how-to', '參考：華文清單體', '華語ハウツー'),
    blurb: t('步驟清楚，少雞湯', 'Clear steps; little soup', '步驟清楚', '手順が明確'),
    hints: ['当下可做第一步', '条目短可照做', '不贩卖焦虑'],
    craft: craft({
      sentence: '祈使句+條件句；條目短',
      stance: '助手心態，不販賣焦慮',
      opening: '當下能做的第一步',
      avoid: '恐嚇營銷',
      lexicon: '第一步、如果、核對、不要',
    }),
    para: ref(
      '先別寫長文道歉。第一步：導出近7日發帖與私信關鍵詞。',
      'Don’t draft a long apology yet. Step one: export 7-day posts/DMs and cluster the anger.',
      '先別寫長文道歉。先導出關鍵詞。',
      '長い謝罪文はまだ。まず7日分の投稿とDM語を出す。'
    ),
    mediaPack: { channel: 'feed_article', share_close: false },
  }),
  reportLeaf({
    id: 'sm_en_sharp',
    language: 'en',
    region: 'en',
    label: t('Substack锐评短论', 'Substack sharp note', 'Substack銳評短論', 'Substack鋭評'),
    hint: t('參考：英文判断型短论', 'Ref: EN judgment-first notes', '參考：英文銳評', '参考：英オピニオン'),
    blurb: t('立场清、例子狠、收尾硬', 'Clear stance; hard example; hard close', '立場清', '立場明確'),
    hints: ['Judgment first', 'Short examples, shareable close', 'Fair steelman of other side'],
    craft: craft({
      sentence: 'Judgment first; short examples',
      stance: 'Take a side; steelman one clause for the other',
      opening: 'Abrasive claim',
      avoid: 'Personal attacks, rumors',
      lexicon: 'actually, stop, the point is',
    }),
    para: ref(
      '别再用用户体验遮羞。规则改的是谁能说话。',
      'Stop using “UX” as cover. This rule change is about who may speak—not who loads faster.',
      '別再用 UX 遮羞。',
      'UXを言い訳にするな。誰が話せるかの変更だ。'
    ),
    mediaPack: { channel: 'feed_article', share_close: true },
  }),
  reportLeaf({
    id: 'sm_en_story',
    language: 'en',
    region: 'en',
    label: t('Atlantic式人物个案', 'Atlantic-style case feature', 'Atlantic式人物個案', '事例物語'),
    hint: t('參考：英文人物特稿', 'Ref: EN character features', '參考：英文人物故事', '参考：英人物フィーチャー'),
    blurb: t('一人带出结构问题', 'One person → structure', '以人帶結構', '一人から構造'),
    hints: ['One concrete day open', 'Person → structure', 'Empathy without spectacle'],
    craft: craft({
      sentence: 'Scene → problem → light judgment',
      stance: 'Empathy without ventriloquism',
      opening: 'One concrete day',
      avoid: 'Trauma tourism, invented detail',
      lexicon: 'that day, she said, contract, blank',
    }),
    para: ref(
      '排班十三天，调休待定——待定的是休息。',
      'Thirteen days on; one “comp day TBD.” What was TBD was rest—not orders.',
      '十三天，調休待定。',
      '十三日連続。代休は未定——未定なのは休みだ。'
    ),
    mediaPack: { channel: 'feed_article', share_close: true },
  }),
  reportLeaf({
    id: 'sm_en_hot',
    language: 'en',
    region: 'en',
    label: t('Twitter热搜快评体', 'X/Twitter hot-take', 'Twitter熱搜快評體', 'ホットテイク短文'),
    hint: t('參考：英文短帖记忆点', 'Ref: EN short memorable takes', '參考：英文熱點快評', '参考：英ホットテイク'),
    blurb: t('快、准、一句记忆点', 'Fast, precise, one memorable line', '快准記憶點', '速く正確に一句'),
    hints: ['One-line hot contradiction', 'Memorable fast take', 'Verifiable, no rumor'],
    craft: craft({
      sentence: '200–600 words mindset; close on a line',
      stance: 'Fast but checkable',
      opening: 'Core conflict in one sentence',
      avoid: 'Unverified indictments',
      lexicon: 'the core is, first separate, remember',
    }),
    para: ref(
      '这波不是道德剧，是规则剧：谁有权定义适度。',
      'This trend isn’t a morality play—it’s a rules play: who defines “appropriate.”',
      '這波是規則劇：誰定義適度。',
      '道徳劇ではなくルール劇だ。誰が「適切」を定義するか。'
    ),
    mediaPack: { channel: 'feed_short', share_close: true },
  }),
  reportLeaf({
    id: 'sm_ja_sharp',
    language: 'ja',
    region: 'ja',
    label: t('東洋経済式鋭評', 'Toyo Keizai–style take', '東洋經濟式銳評', '東洋経済式鋭評'),
    hint: t('參考：日式論説・判斷靠前', 'Ref: JP judgment-first opinion', '參考：日式銳評', '参考：日本のオピニオン'),
    blurb: t('立場明確、例が鋭い', 'Clear stance; sharp example', '立場明確', '立場が明確で例が鋭い'),
    hints: ['Judgment first', 'Short examples, shareable close', 'Fair steelman of other side'],
    craft: craft({
      sentence: '判断を先に。例は短く',
      stance: '立場を取る。相手にも一文の公平',
      opening: '刺さる判断',
      avoid: '人身攻撃、デマ',
      lexicon: '本質は、騙されるな、一言で',
    }),
    para: ref(
      '别再用UX遮羞。规则改的是谁能说话。',
      'Stop using UX as cover. It’s about who may speak.',
      '別再用 UX 遮羞。',
      'UXを言い訳にするな。誰が話せるかの変更だ。'
    ),
    mediaPack: { channel: 'feed_article', share_close: true },
  }),
  reportLeaf({
    id: 'sm_ja_story',
    language: 'ja',
    region: 'ja',
    label: t('新潮ノンフィクション式', 'Shincho nonfiction-style', '新潮非虛構式', '新潮ノンフィクション式'),
    hint: t('參考：日式人物非虛構', 'Ref: JP character nonfiction', '參考：日式人物故事', '参考：日本の人物物語'),
    blurb: t('一人から構造問題へ', 'One person → structure', '以人帶結構', '一人の話から構造へ'),
    hints: ['One concrete day open', 'Person → structure', 'Empathy without spectacle'],
    craft: craft({
      sentence: '場面→問題→軽い判断',
      stance: '共感。代弁の誓いをしない',
      opening: '具体的な一日',
      avoid: '苦難消費、細部捏造',
      lexicon: 'あの日、彼女は、契約、空白',
    }),
    para: ref(
      '连上十三天，调休待定。',
      'Thirteen days on; rest still TBD.',
      '十三天，調休待定。',
      '十三日連続。代休は未定——未定なのは休みだ。'
    ),
    mediaPack: { channel: 'feed_article', share_close: true },
  }),
  reportLeaf({
    id: 'sm_ja_list',
    language: 'ja',
    region: 'ja',
    label: t('ライフハッカー式リスト', 'Lifehacker-style checklist', 'Lifehacker式清單', 'ライフハッカー式リスト'),
    hint: t('參考：日式可執行ハウツー', 'Ref: JP actionable how-to', '參考：日式清單體', '参考：日本ハウツー'),
    blurb: t('手順清楚，少雞湯', 'Clear steps; little soup', '步驟清楚', '手順が明確で精神論なし'),
    hints: ['First actionable step', 'Short doable items', 'No fear marketing'],
    craft: craft({
      sentence: '命令形＋条件。項目は短く',
      stance: '助手。不安を売らない',
      opening: '今できる第一步',
      avoid: '恐怖マーケティング',
      lexicon: '第一步、もし、確認、しないで',
    }),
    para: ref(
      '先别写长文道歉。先导出近7日关键词。',
      'Don’t draft a long apology yet. Export 7-day keywords first.',
      '先別寫長文道歉。',
      '長い謝罪はまだ。まず7日分の語を出す。'
    ),
    mediaPack: { channel: 'feed_article', share_close: false },
  }),
];

export const voiceoverExtra: ExtraVoice[] = [
  reportLeaf({
    id: 'vo_tw_news',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('公視新聞式穩準清', 'PTS news-desk VO', '公視新聞式穩準清', 'ニュース口播'),
    hint: t('參考：華文資訊口播帳號', 'Ref: CJK news VO desks', '參考：華文資訊口播', '華語ニュースVO'),
    blurb: t('可播、少從句、數字友好', 'Speakable; few clauses; number-friendly', '可播少從句', '読み上げやすい'),
    hints: ['可播少从句', '数字朗读友好', '中性播报轻判断'],
    craft: craft({
      sentence: '一句一意；逗號可換氣',
      stance: '中性播報，判斷輕',
      opening: '問候+今日焦點一句',
      avoid: '書面倒裝、難讀堆砌',
      lexicon: '今天、首先、同時、最後',
    }),
    para: ref(
      '今天關注一項新規。它影響三類人。我們用三分鐘說清變化。',
      'Today’s focus is a new rule. It hits three groups. Three minutes to make the change clear.',
      '今天關注一項新規，三分鐘說清。',
      '今日の焦点は新ルール。三分で変化を言う。'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '180' },
  }),
  reportLeaf({
    id: 'vo_tw_story',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('故事FM台式鉤子講述', 'StoryFM TW hook narration', '故事FM台式鉤子講述', '物語口播'),
    hint: t('參考：人物故事可停頓口播', 'Ref: pause-friendly story VO', '參考：華文故事口播', '華語ストーリーVO'),
    blurb: t('開口有鉤，段落可停頓', 'Hook open; pause-friendly', '開口有鉤', '冒頭フック'),
    hints: ['开口冲突结果先行', '段落可停顿', '口语连接不装旁白'],
    craft: craft({
      sentence: '口語連接詞；懸念句可獨立成段',
      stance: '講述感，不裝紀錄片旁白',
      opening: '衝突結果先行',
      avoid: '書面成語堆',
      lexicon: '你聽、後來、沒想到、停一下',
    }),
    para: ref(
      '故事從一個拒絕開始。她掛斷時以為只丟一單——後來才知道丟了一整條路。',
      'It starts with a no. She thought she’d lost one job—later she learned she’d lost a whole road.',
      '故事從一個拒絕開始。',
      '拒否から始まる。一件の仕事だと思った失注が、道ごと消えた。'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '180' },
  }),
  reportLeaf({
    id: 'vo_tw_knowledge',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('百靈果式知識解說', 'BilingualNews-style explainer', '百靈果式知識解說', '知識口播'),
    hint: t('參考：一次講清一個概念', 'Ref: one-concept explainer', '參考：華文知識口播', '華語知識VO'),
    blurb: t('一次只攻一個概念', 'One concept at a time', '一概念', '概念は一つずつ'),
    hints: ['一概念定义例子误区', '生活类比可复述', '不恐吓科普'],
    craft: craft({
      sentence: '定義→例子→誤區',
      stance: '老師感但不說教',
      opening: '聽眾以為自己懂的一點',
      avoid: '堆術語、恐嚇科普',
      lexicon: '簡單說、比如、別誤會、記住',
    }),
    para: ref(
      '別先背定義。菜場覺得貴，不一定是通膨三個字能概括。',
      'Don’t start with the textbook. Feeling prices at the market isn’t just “inflation.”',
      '別先背定義。',
      '定義から入るな。市場の高さは「インフレ」一語では足りない。'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '120' },
  }),
  reportLeaf({
    id: 'vo_en_news',
    language: 'en',
    region: 'en',
    label: t('NPR式资讯口播', 'NPR news-desk VO', 'NPR式資訊口播', 'NPRニュースVO'),
    hint: t('參考：英文资讯播客口播', 'Ref: EN news-podcast VO', '參考：英文資訊口播', '参考：英ニュースVO'),
    blurb: t('可播、数字友好', 'Speakable; number-friendly', '可播', '読み上げやすい'),
    hints: ['Speakable short clauses', 'Number-friendly VO', 'Neutral light judgment'],
    craft: craft({
      sentence: 'One idea per sentence; breath commas',
      stance: 'Neutral; light judgment',
      opening: 'Greeting + today’s focus',
      avoid: 'Written inversions, unreadable stacks',
      lexicon: 'today, first, also, finally',
    }),
    para: ref(
      '今天关注一项新规，三类人，三分钟说清。',
      'Today’s focus is a new rule. It hits three groups. Three minutes to make the change clear.',
      '今天關注一項新規。',
      '今日の焦点は新ルール。三分で変化を言う。'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '180' },
  }),
  reportLeaf({
    id: 'vo_en_story',
    language: 'en',
    region: 'en',
    label: t('This American Life式钩子', 'This American Life–style hook', 'TAL式鉤子講述', 'TAL式フック'),
    hint: t('參考：英文故事播客口播', 'Ref: EN story-podcast VO', '參考：英文故事口播', '参考：英ストーリーVO'),
    blurb: t('开口有钩，可停顿', 'Hook open; pause-friendly', '開口有鉤', 'フックと間'),
    hints: ['Result-first open', 'Pause-friendly beats', 'Spoken, not documentary VO'],
    craft: craft({
      sentence: 'Oral connectives; suspense lines can stand alone',
      stance: 'Storyteller, not fake documentary VO',
      opening: 'Result of conflict first',
      avoid: 'Idiom piles, heavy parentheses',
      lexicon: 'listen, later, then, hold on',
    }),
    para: ref(
      '故事从一个拒绝开始——后来才知道丢的是整条路。',
      'It starts with a no. She thought she’d lost one job—later she learned she’d lost a whole road.',
      '故事從一個拒絕開始。',
      '拒否から始まる。一件の失注が道ごと消えた。'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '180' },
  }),
  reportLeaf({
    id: 'vo_en_chat',
    language: 'en',
    region: 'en',
    label: t('晚间脱口秀式伴聊', 'Late-night companion chat VO', '晚間脫口秀式伴聊', 'トークショー伴聊'),
    hint: t('參考：英文第二人称伴聊口播', 'Ref: EN second-person companion VO', '參考：英文伴聊口播', '参考：英雑談VO'),
    blurb: t('像跟听众说话', 'Talk-with-listener tone', '伴聊感', '聴者と話す感'),
    hints: ['Second-person warmth', 'Timeline before take', 'Light meme use'],
    craft: craft({
      sentence: 'Second person; controlled filler',
      stance: 'Intimate not oily',
      opening: 'Did you also…',
      avoid: 'Dense slang, discriminatory memes',
      lexicon: 'you see, honestly, right?',
    }),
    para: ref(
      '你是不是也刷到了？先别站队，我们把时间线捋直。',
      'Did you see that trending post too? Don’t pick a side yet—we’ll straighten the timeline first.',
      '你是不是也刷到了？先別站隊。',
      'それ、見た？まだ陣営を決めない。まず時系列をまっすぐにする。'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '90' },
  }),
  reportLeaf({
    id: 'vo_ja_news',
    language: 'ja',
    region: 'ja',
    label: t('NHKニュース式安定明瞭', 'NHK news-desk VO', 'NHK新聞式穩準清', 'NHKニュース式'),
    hint: t('參考：日式資訊旁白稿', 'Ref: JP news VO desks', '參考：日式資訊口播', '参考：日本ニュースVO'),
    blurb: t('読み上げやすく数字に優しい', 'Speakable; number-friendly', '可播', '読み上げやすく数字に優しい'),
    hints: ['Speakable short clauses', 'Number-friendly VO', 'Neutral light judgment'],
    craft: craft({
      sentence: '一文一意。読点で呼吸',
      stance: '中立。判断は薄い',
      opening: '挨拶＋今日の焦点',
      avoid: '書き言葉の倒装',
      lexicon: '今日、まず、同時に、最後に',
    }),
    para: ref(
      '今天关注新规，三类人，三分钟说清。',
      'Today’s focus is a new rule affecting three groups—three minutes.',
      '今天關注新規。',
      '今日の焦点は新ルール。三分で変化を言う。'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '180' },
  }),
  reportLeaf({
    id: 'vo_ja_story',
    language: 'ja',
    region: 'ja',
    label: t('物語ラジオ式フック', 'Story-radio hook VO', '故事電台式鉤子', '物語ラジオ式フック'),
    hint: t('參考：日式故事口播', 'Ref: JP story VO', '參考：日式故事口播', '参考：日本ストーリーVO'),
    blurb: t('冒頭フック、間が取れる', 'Hook open; pause-friendly', '開口有鉤', '冒頭フックと間'),
    hints: ['Result-first open', 'Pause-friendly beats', 'Spoken, not documentary VO'],
    craft: craft({
      sentence: '話し言葉の接続。悬念文を独立させてもよい',
      stance: '語り。偽ドキュメンタリー禁止',
      opening: '結果から入る',
      avoid: '硬い成語の山',
      lexicon: '聞いて、あとで、まさか、一度止まって',
    }),
    para: ref(
      '故事从一个拒绝开始——丢的是整条路。',
      'It starts with a no—and later the whole road is gone.',
      '故事從一個拒絕開始。',
      '拒否から始まる。一件の失注が道ごと消えた。'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '180' },
  }),
  reportLeaf({
    id: 'vo_ja_knowledge',
    language: 'ja',
    region: 'ja',
    label: t('両学長式知識解說', 'Both-Gakucho–style explainer', '兩學長式知識解說', '両学長式解説'),
    hint: t('參考：日式一次一概念解說', 'Ref: JP one-concept explainer', '參考：日式知識口播', '参考：日本知識VO'),
    blurb: t('概念は一つずつ', 'One concept at a time', '一概念', '概念は一つずつ'),
    hints: ['One concept: def→ex→trap', 'Lived analogy retellable', 'No scare-science'],
    craft: craft({
      sentence: '定義→例→誤解',
      stance: '先生感だが説教しない',
      opening: '分かったつもりを突く',
      avoid: '用語の山、恫喝科普',
      lexicon: '簡単に、たとえば、誤解しないで、覚えて',
    }),
    para: ref(
      '别先背定义。菜场觉得贵，不一定是通胀三个字。',
      'Don’t start with the textbook. Market prices aren’t just “inflation.”',
      '別先背定義。',
      '定義から入るな。市場の高さはインフレ一語では足りない。'
    ),
    mediaPack: { channel: 'voiceover', seconds_hint: '120' },
  }),
];

// ── course_tutorial：网课教程多语言叶子 ────────────────────────────────
export const courseExtra: ExtraVoice[] = [
  reportLeaf({
    id: 'course_tw_hahow',
    language: 'zh-TW',
    region: 'zh_gat',
    label: t('Hahow式專題課精講', 'Hahow-style topic lesson', 'Hahow式專題課精講', 'Hahow式レッスン'),
    hint: t('參考：華文線上專題課', 'Ref: CJK online topic courses', '參考：華文線上專題課', '華語オンライン講座'),
    blurb: t('一課一交付，步驟可跟練', 'One lesson, one deliverable; followable steps', '一課一交付', '一回一成果'),
    hints: ['一课只攻一个可带走概念', '误区先于定义', '结尾可复述金句'],
    craft: craft({
      sentence: '目標→步驟→示範→練習；短段',
      stance: '教練感，鼓勵但不空喊',
      opening: '學完能交出什麼',
      avoid: '堆術語、無練習的空講',
      lexicon: '這一課、先做、常見錯、交作業',
    }),
    para: ref(
      '這一課結束你要交出一頁大綱，不是「聽懂了」。我們拆成四步，每步不超過八分鐘。',
      'By the end you hand in a one-page outline—not “I get it.” Four steps, each under eight minutes.',
      '這一課結束你要交出一頁大綱。',
      '終わりに一枚のアウトラインを出す。「わかった」ではない。'
    ),
    mediaPack: { channel: 'course_lesson', seconds_hint: '1800' },
  }),
  reportLeaf({
    id: 'course_en_masterclass',
    language: 'en',
    region: 'en',
    label: t('MasterClass式叙事精讲', 'MasterClass-style narrative teach', 'MasterClass式敘事精講', 'MasterClass式講義'),
    hint: t('參考：英文大师叙事课', 'Ref: EN master narrative lessons', '參考：英文大師課', '参考：英マスター授業'),
    blurb: t('故事带方法，可迁移练习', 'Story carries method; transferable drills', '故事帶方法', '物語で方法'),
    hints: ['One takeaway concept', 'Misconception before definition', 'Retellable close line'],
    craft: craft({
      sentence: 'Anecdote → principle → try-this',
      stance: 'Authoritative but inviting',
      opening: 'A vivid failure or win',
      avoid: 'Name-dropping without a drill',
      lexicon: 'watch this, try this, the rule is',
    }),
    para: ref(
      '先看一段失败开场，再抽出那条可复用的规则，最后你改自己的第一段。',
      'First a failed opening, then the reusable rule, then you rewrite your own first paragraph.',
      '先看失敗開場，再抽規則，最後改你的第一段。',
      '失敗の冒頭→再利用できる法則→自分の一段を直す。'
    ),
    mediaPack: { channel: 'course_lesson', seconds_hint: '1200' },
  }),
  reportLeaf({
    id: 'course_en_coursera',
    language: 'en',
    region: 'en',
    label: t('Coursera式模块课', 'Coursera-style modular lesson', 'Coursera式模組課', 'Coursera式モジュール'),
    hint: t('參考：英文平台模块课', 'Ref: EN modular platform courses', '參考：英文模組課', '参考：英モジュール講座'),
    blurb: t('学习目标→概念→测验感练习', 'LO → concept → quiz-like drill', '目標→概念→練習', '目標→概念→演習'),
    hints: ['One takeaway concept', 'Misconception before definition', 'Retellable close line'],
    craft: craft({
      sentence: 'Learning objective first; short definitions',
      stance: 'Academic-clear, not dry',
      opening: 'What you can do after this module',
      avoid: 'Wall of theory without checks',
      lexicon: 'by the end, key term, self-check',
    }),
    para: ref(
      '本模块结束你能：用自己的话解释 X，并完成一道自测。',
      'By module end you can explain X in your own words and pass a short self-check.',
      '本模組結束你能解釋 X 並完成自測。',
      '終了時、X を自分の言葉で説明し、小テストを通す。'
    ),
    mediaPack: { channel: 'course_lesson', seconds_hint: '2400' },
  }),
  reportLeaf({
    id: 'course_en_khan',
    language: 'en',
    region: 'en',
    label: t('Khan Academy式小步拆解', 'Khan Academy micro-steps', 'Khan Academy式小步拆解', 'Khan式マイクロステップ'),
    hint: t('參考：可汗小步讲解', 'Ref: Khan-style micro teaching', '參考：可汗小步講解', '参考：Khan式小分け'),
    blurb: t('一步一屏，错误可回退', 'One step per screen; rewind-friendly', '一步一屏', '一歩一画面'),
    hints: ['One takeaway concept', 'Misconception before definition', 'Retellable close line'],
    craft: craft({
      sentence: 'Tiny steps; speak the working',
      stance: 'Patient tutor',
      opening: 'What we’re solving in one line',
      avoid: 'Skipping algebra / hidden leaps',
      lexicon: 'next, pause, try it, common mistake',
    }),
    para: ref(
      '别一次跳三步。我们只做下一步：把式子移项，然后你暂停自己算。',
      'Don’t leap three steps. Only the next move: rearrange, then pause and compute yourself.',
      '別一次跳三步。只做移項，然後暫停自算。',
      '三段飛ばし禁止。次の一手だけ：移項して、自分で止めて計算。'
    ),
    mediaPack: { channel: 'course_lesson', seconds_hint: '900' },
  }),
  reportLeaf({
    id: 'course_ja_schoo',
    language: 'ja',
    region: 'ja',
    label: t('Schoo式ビジネス講座', 'Schoo-style business lesson', 'Schoo式商務講座', 'Schoo式ビジネス講座'),
    hint: t('參考：日式在线商务课', 'Ref: JP online business lessons', '參考：日式商務課', '参考：日本ビジネス講座'),
    blurb: t('職場可落地，案例短', 'Workplace-ready; short cases', '職場可落地', '職場で使える'),
    hints: ['One takeaway concept', 'Misconception before definition', 'Retellable close line'],
    craft: craft({
      sentence: '場面→型→練習',
      stance: '実務コーチ',
      opening: '明日の会議で使えるか',
      avoid: '抽象理論の山',
      lexicon: '型、明日、よくある失敗、宿題',
    }),
    para: ref(
      '明天会上直接可用的一句模板，比再讲一遍理论重要。',
      'A sentence you can use in tomorrow’s meeting beats another theory slide.',
      '明天會議能用的一句模板，勝過再講理論。',
      '明日の会議で使える一句が、理論スライドより大事。'
    ),
    mediaPack: { channel: 'course_lesson', seconds_hint: '1800' },
  }),
  reportLeaf({
    id: 'course_ja_study',
    language: 'ja',
    region: 'ja',
    label: t('スタディサプリ式考点精讲', 'Study Sapuri exam-point teach', 'スタディサプリ式考點精講', 'スタディサプリ式要点'),
    hint: t('參考：日式应试精讲课', 'Ref: JP exam-prep micro lessons', '參考：日式應試精講', '参考：受験精講'),
    blurb: t('考点清楚，例题跟练', 'Clear exam points; worked examples', '考點清楚', '要点と例題'),
    hints: ['One takeaway concept', 'Misconception before definition', 'Retellable close line'],
    craft: craft({
      sentence: '考点→例题→变式',
      stance: '应试清晰但不恐吓',
      opening: '这一题考什么',
      avoid: '题海恐吓、超纲炫技',
      lexicon: '得点、ひっかけ、類題、ここだけ',
    }),
    para: ref(
      '这题只考一个点：读题干里的限定词。我们先拆真题，再做一道变式。',
      'This item tests one thing: the limiter in the stem. Real item first, then a twin.',
      '這題只考限定詞。先拆真題再做變式。',
      '問うのは一点：題幹の限定。本問→類題。'
    ),
    mediaPack: { channel: 'course_lesson', seconds_hint: '1200' },
  }),
  reportLeaf({
    id: 'course_ja_udemy',
    language: 'ja',
    region: 'ja',
    label: t('Udemy式项目跟练课', 'Udemy-style project follow-along', 'Udemy式專案跟練', 'Udemy式プロジェクト'),
    hint: t('參考：日式项目跟练课', 'Ref: JP project follow-along courses', '參考：日式專案跟練', '参考：プロジェクト講座'),
    blurb: t('边做边学，里程碑可见', 'Learn by building; visible milestones', '邊做邊學', '作りながら学ぶ'),
    hints: ['One takeaway concept', 'Misconception before definition', 'Retellable close line'],
    craft: craft({
      sentence: '交付物倒推步骤',
      stance: '工坊教练',
      opening: '最终文件长什么样',
      avoid: '只讲不练',
      lexicon: '完成物、マイルストーン、今やる',
    }),
    para: ref(
      '先定义完成文件长什么样，再倒推今天三十分钟必须做完的第一步。',
      'Define the finished file, then reverse-plan the first thirty minutes you must finish today.',
      '先定義完成檔，再倒推今天三十分鐘的第一步。',
      '完成物の姿を先に決め、今日30分で終わる一手へ逆算。'
    ),
    mediaPack: { channel: 'course_lesson', seconds_hint: '2400' },
  }),
];
