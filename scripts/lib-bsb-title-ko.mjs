/**
 * BSB 영어 \s1 → 한국어 소제목 (뜻 번역, 4–14자)
 * 개역한글 고유명사·신앙 용어 표기 유지, 일반 낱말은 지금 말 가능
 */
export function normEn(s) {
  return String(s)
    .normalize("NFKC")
    .replace(/['’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** @type {Record<string, string>} */
const WORD = {
  // articles/prep skipped in assembly
  the: "",
  a: "",
  an: "",
  of: "의",
  and: "과",
  to: "",
  for: "위한",
  in: "가운데",
  on: "위의",
  at: "",
  from: "에서",
  with: "와",
  by: "",
  against: "대적",
  into: "으로",
  over: "위의",
  after: "후에",
  before: "앞에",
  about: "관한",
  among: "가운데",
  between: "사이",
  under: "아래",
  through: "통하여",
  // deities / faith
  god: "하나님",
  lord: "여호와",
  jesus: "예수",
  christ: "그리스도",
  messiah: "메시야",
  spirit: "성령",
  holy: "거룩한",
  father: "아버지",
  son: "아들",
  "son of man": "인자",
  // people
  moses: "모세",
  david: "다윗",
  solomon: "솔로몬",
  abraham: "아브라함",
  abram: "아브람",
  isaac: "이삭",
  jacob: "야곱",
  israel: "이스라엘",
  judah: "유다",
  joseph: "요셉",
  noah: "노아",
  adam: "아담",
  eve: "하와",
  cain: "가인",
  abel: "아벨",
  sarah: "사라",
  sarai: "사래",
  rebekah: "리브가",
  rachel: "라헬",
  leah: "레아",
  esau: "에서",
  lot: "롯",
  samuel: "사무엘",
  saul: "사울",
  jonathan: "요나단",
  elijah: "엘리야",
  elisha: "엘리사",
  isaiah: "이사야",
  jeremiah: "예레미야",
  ezekiel: "에스겔",
  daniel: "다니엘",
  hosea: "호세아",
  joel: "요엘",
  amos: "아모스",
  jonah: "요나",
  micah: "미가",
  nahum: "나훔",
  habakkuk: "하박국",
  zephaniah: "스바냐",
  haggai: "학개",
  zechariah: "스가랴",
  malachi: "말라기",
  job: "욥",
  esther: "에스더",
  ruth: "룻",
  naomi: "나오미",
  boaz: "보아스",
  nehemiah: "느헤미야",
  ezra: "에스라",
  peter: "베드로",
  paul: "바울",
  john: "요한",
  "john the baptist": "세례 요한",
  matthew: "마태",
  mark: "마가",
  luke: "누가",
  james: "야고보",
  andrew: "안드레",
  philip: "빌립",
  thomas: "도마",
  judas: "유다",
  pilate: "빌라도",
  herod: "헤롯",
  caiaphas: "가야바",
  nicodemus: "니고데모",
  lazarus: "나사로",
  mary: "마리아",
  martha: "마르다",
  timothy: "디모데",
  titus: "디도",
  philemon: "빌레몬",
  stephen: "스데반",
  barnabas: "바나바",
  silas: "실라",
  apollo: "아볼로",
  apollos: "아볼로",
  // places (KRV)
  egypt: "애굽",
  egyptian: "애굽",
  pharaoh: "바로",
  canaan: "가나안",
  jerusalem: "예루살렘",
  zion: "시온",
  babylon: "바벨론",
  assyria: "앗수르",
  nineveh: "니느웨",
  samaria: "사마리아",
  galilee: "갈릴리",
  nazareth: "나사렛",
  bethlehem: "베들레헴",
  bethany: "베다니",
  gethsemane: "겟세마네",
  calvary: "골고다",
  sinai: "시내",
  jordan: "요단",
  red: "홍해",
  sea: "바다",
  wilderness: "광야",
  desert: "광야",
  temple: "성전",
  tabernacle: "성막",
  ark: "궤",
  "ark of the covenant": "언약궤",
  // common nouns
  birth: "탄생",
  death: "죽음",
  genealogy: "족보",
  descendants: "후손",
  covenant: "언약",
  law: "율법",
  laws: "규례",
  prayer: "기도",
  praise: "찬양",
  prophecy: "예언",
  prophet: "선지자",
  prophets: "선지자들",
  priest: "제사장",
  priests: "제사장들",
  king: "왕",
  kings: "왕들",
  queen: "왕후",
  reign: "통치",
  reigns: "통치함",
  judgment: "심판",
  warning: "경고",
  vision: "환상",
  dream: "꿈",
  dreams: "꿈",
  parable: "비유",
  parables: "비유",
  miracle: "기적",
  miracles: "기적",
  faith: "믿음",
  love: "사랑",
  hope: "소망",
  peace: "화평",
  sword: "검",
  cross: "십자가",
  resurrection: "부활",
  crucifixion: "십자가에 못 박히심",
  baptism: "세례",
  temptation: "시험",
  ministry: "사역",
  mission: "파송",
  disciple: "제자",
  disciples: "제자들",
  apostle: "사도",
  apostles: "사도들",
  church: "교회",
  churches: "교회들",
  gospel: "복음",
  sermon: "설교",
  mount: "산",
  mountain: "산",
  song: "노래",
  psalm: "시",
  plague: "재앙",
  plagues: "재앙",
  offering: "제물",
  offerings: "제물",
  sacrifice: "제사",
  sacrifices: "제사",
  feast: "절기",
  passover: "유월절",
  sabbath: "안식일",
  widow: "과부",
  widows: "과부들",
  oil: "기름",
  bush: "떨기나무",
  burning: "불붙은",
  fire: "불",
  water: "물",
  bread: "떡",
  wine: "포도주",
  lamp: "등불",
  light: "빛",
  salt: "소금",
  shepherd: "목자",
  sheep: "양",
  wolf: "이리",
  wolves: "이리",
  vine: "포도나무",
  vineyard: "포도원",
  harvest: "추수",
  seed: "씨",
  sower: "씨 뿌리는 자",
  soil: "땅",
  rock: "반석",
  house: "집",
  door: "문",
  gate: "문",
  way: "길",
  truth: "진리",
  life: "생명",
  word: "말씀",
  words: "말씀",
  prologue: "머리말",
  greeting: "문안",
  greetings: "문안",
  farewell: "작별",
  benediction: "축도",
  doxology: "송영",
  call: "부르심",
  calling: "부르심",
  return: "귀환",
  flight: "피하심",
  escape: "도피",
  victory: "승리",
  defeat: "패배",
  war: "전쟁",
  battle: "전투",
  siege: "포위",
  exile: "사로잡힘",
  captivity: "포로",
  restoration: "회복",
  repentance: "회개",
  forgiveness: "용서",
  sin: "죄",
  sins: "죄",
  salvation: "구원",
  deliverance: "구원",
  healing: "고치심",
  heals: "고치심",
  healed: "고치심",
  raises: "살리심",
  raised: "살리심",
  walks: "걸으심",
  calms: "잔잔케 하심",
  feeds: "먹이심",
  feeding: "먹이심",
  cleanses: "깨끗케 하심",
  cleansed: "깨끗케 하심",
  teaches: "가르치심",
  teaching: "가르침",
  teachings: "가르침",
  prays: "기도하심",
  prayer: "기도",
  denies: "부인함",
  betrayal: "배반",
  betrays: "배반함",
  arrest: "잡히심",
  trial: "심문",
  burial: "장사",
  tomb: "무덤",
  empty: "빈",
  commission: "사명",
  ascension: "승천",
  pentecost: "오순절",
  creation: "천지 창조",
  flood: "홍수",
  tower: "탑",
  babel: "바벨",
  promise: "약속",
  blessing: "축복",
  curse: "저주",
  wrath: "진노",
  mercy: "긍휼",
  grace: "은혜",
  glory: "영광",
  power: "능력",
  authority: "권세",
  kingdom: "나라",
  heaven: "하늘",
  heavens: "하늘",
  earth: "땅",
  world: "세상",
  nations: "열방",
  people: "백성",
  man: "사람",
  woman: "여자",
  child: "아이",
  children: "아이들",
  brother: "형제",
  brothers: "형제들",
  sister: "자매",
  mother: "어머니",
  father: "아버지",
  family: "가족",
  servant: "종",
  servants: "종들",
  slave: "종",
  master: "주인",
  enemy: "원수",
  enemies: "원수",
  friend: "친구",
  fools: "어리석은 자",
  fool: "어리석은 자",
  wise: "지혜로운 자",
  wisdom: "지혜",
  rich: "부자",
  poor: "가난한 자",
  blind: "소경",
  mute: "벙어리",
  lame: "저는 자",
  leper: "문둥병자",
  lepers: "문둥병자",
  demon: "귀신",
  demons: "귀신",
  angel: "천사",
  angels: "천사들",
  devil: "마귀",
  satan: "사탄",
  // verbs / gerunds as nouns
  preparing: "예비함",
  preparation: "예비",
  coming: "오심",
  return: "돌아옴",
  going: "감",
  sending: "보내심",
  sent: "보내심",
  choosing: "택하심",
  chosen: "택하신",
  anointing: "기름 부음",
  anointed: "기름 부음",
  building: "건축",
  rebuild: "재건",
  rebuilding: "재건",
  destruction: "멸망",
  destroyed: "멸망",
  deliverance: "건지심",
  inquiry: "물음",
  request: "청원",
  answer: "응답",
  report: "보고",
  plot: "음모",
  plans: "계획",
  plan: "계획",
  instructions: "가르침",
  instruction: "가르침",
  qualifications: "자격",
  warning: "경고",
  woe: "화",
  woes: "화",
  lament: "탄식",
  lamentation: "애가",
  mourning: "애통",
  rejoicing: "기뻐함",
  thanksgiving: "감사",
  confession: "시인",
  denial: "부인",
  persecution: "핍박",
  suffering: "고난",
  passion: "고난",
  triumph: "승리",
  triumphant: "승리의",
  final: "마지막",
  first: "처음",
  second: "둘째",
  third: "셋째",
  last: "마지막",
  new: "새",
  old: "옛",
  true: "참",
  false: "거짓",
  great: "큰",
  greatest: "가장 큰",
  good: "선한",
  evil: "악한",
  wicked: "악한",
  righteous: "의로운",
  ungodly: "경건치 않은",
  day: "날",
  night: "밤",
  year: "해",
  years: "해",
  time: "때",
  times: "때",
  hour: "때",
  // numbers
  two: "두",
  three: "세",
  four: "네",
  five: "다섯",
  seven: "일곱",
  ten: "열",
  twelve: "열두",
  forty: "사십",
  thousand: "천",
  // misc heading words
  message: "말씀",
  letter: "편지",
  epistle: "편지",
  book: "책",
  scroll: "두루마리",
  sign: "표적",
  signs: "표적",
  wonders: "기사",
  authority: "권세",
  division: "분쟁",
  unity: "하나 됨",
  fellowship: "교제",
  communion: "교제",
  supper: "만찬",
  "lord's supper": "성찬",
  "last supper": "마지막 만찬",
  passover: "유월절",
  magi: "동방 박사",
  wise: "박사",
  star: "별",
  flight: "피하심",
  return: "돌아옴",
  beheading: "목 베임",
  transfiguration: "변형되심",
  entry: "입성",
  triumphal: "승리의",
  cleansing: "깨끗케 하심",
  barren: "열매 없는",
  fig: "무화과",
  tree: "나무",
  talent: "달란트",
  talents: "달란트",
  virgin: "처녀",
  virgins: "처녀",
  bridegroom: "신랑",
  wedding: "혼인",
  banquet: "잔치",
  net: "그물",
  pearl: "진주",
  treasure: "보화",
  mustard: "겨자",
  leaven: "누룩",
  weeds: "가라지",
  wheat: "밀",
  goats: "염소",
  sheep: "양",
  widow: "과부",
  persistent: "간구하는",
  prodigal: "탕자",
  lost: "잃은",
  found: "찾은",
  rich: "부자",
  young: "젊은",
  man: "사람",
  centurion: "백부장",
  canaanite: "가나안",
  syrophoenician: "수로보니게",
  samaritan: "사마리아 사람",
  pharisee: "바리새인",
  pharisees: "바리새인",
  sadducees: "사두개인",
  scribes: "서기관",
  lawyers: "율법사",
  herodians: "헤롯 당원",
  gentiles: "이방인",
  jews: "유대인",
  israelites: "이스라엘 자손",
  levites: "레위인",
  levite: "레위인",
  aaron: "아론",
  miriam: "미리암",
  korah: "고라",
  balak: "발락",
  balaam: "발람",
  joshua: "여호수아",
  caleb: "갈렙",
  gideon: "기드온",
  samson: "삼손",
  delilah: "들릴라",
  eli: "엘리",
  hannah: "한나",
  nathan: "나단",
  bathsheba: "밧세바",
  absalom: "압살롬",
  rehoboam: "르호보암",
  jeroboam: "여로보암",
  ahab: "아합",
  jezebel: "이세벨",
  hezekiah: "히스기야",
  josiah: "요시야",
  nebuchadnezzar: "느부갓네살",
  belshazzar: "벨사살",
  darius: "다리오",
  cyrus: "고레스",
  mordecai: "모르드개",
  haman: "하만",
  job: "욥",
  elihu: "엘리후",
  // short function words already covered
  not: "아니요",
  but: "오직",
  no: "없는",
  all: "모든",
  every: "모든",
  some: "어떤",
  many: "많은",
  more: "더",
  most: "가장",
  other: "다른",
  another: "다른",
  same: "같은",
  own: "자기",
  self: "자신",
  my: "나의",
  your: "너의",
  his: "그의",
  her: "그의",
  their: "그들의",
  our: "우리",
  its: "그",
  who: "누구",
  whom: "누구",
  whose: "누구의",
  what: "무엇",
  when: "언제",
  where: "어디",
  why: "어찌하여",
  how: "어떻게",
  is: "",
  are: "",
  was: "",
  were: "",
  be: "",
  been: "",
  being: "",
  has: "",
  have: "",
  had: "",
  do: "",
  does: "",
  did: "",
  will: "",
  shall: "",
  may: "",
  can: "",
  must: "",
  o: "",
  oh: "",
  yes: "",
  let: "",
  us: "우리",
  me: "나를",
  him: "그를",
  them: "그들",
  it: "",
  this: "이",
  that: "그",
  these: "이들",
  those: "그들",
};

/** 구나 구 단위 우선 치환 */
const PHRASES = [
  [/john the baptist/gi, "세례 요한"],
  [/son of man/gi, "인자"],
  [/son of god/gi, "하나님의 아들"],
  [/kingdom of heaven/gi, "천국"],
  [/kingdom of god/gi, "하나님의 나라"],
  [/day of the lord/gi, "여호와의 날"],
  [/holy spirit/gi, "성령"],
  [/holy ghost/gi, "성령"],
  [/burning bush/gi, "불붙은 떨기나무"],
  [/widow'?s oil/gi, "과부의 기름"],
  [/poor widow/gi, "가난한 과부"],
  [/lord'?s prayer/gi, "주기도"],
  [/lord'?s supper/gi, "성찬"],
  [/last supper/gi, "마지막 만찬"],
  [/great commission/gi, "만민에게 가라"],
  [/sermon on the mount/gi, "산상 설교"],
  [/golden calf/gi, "금송아지"],
  [/promised land/gi, "약속의 땅"],
  [/red sea/gi, "홍해"],
  [/ten commandments/gi, "십계명"],
  [/new covenant/gi, "새 언약"],
  [/old covenant/gi, "옛 언약"],
  [/ark of the covenant/gi, "언약궤"],
  [/table of nations/gi, "민족 계보"],
  [/tower of babel/gi, "바벨탑"],
  [/garden of eden/gi, "에덴동산"],
  [/tree of life/gi, "생명나무"],
  [/bread of life/gi, "생명의 떡"],
  [/living water/gi, "생수"],
  [/good shepherd/gi, "선한 목자"],
  [/true vine/gi, "참 포도나무"],
  [/narrow gate/gi, "좁은 문"],
  [/wide gate/gi, "넓은 문"],
  [/prodigal son/gi, "탕자의 비유"],
  [/good samaritan/gi, "선한 사마리아인"],
  [/rich young (man|ruler)/gi, "부자 청년"],
  [/persistent widow/gi, "간구하는 과부"],
  [/ten virgins/gi, "열 처녀"],
  [/mustard seed/gi, "겨자씨"],
  [/fig tree/gi, "무화과나무"],
  [/mount of olives/gi, "감람산"],
  [/upper room/gi, "다락방"],
  [/early church/gi, "초대 교회"],
  [/false teachers?/gi, "거짓 선생"],
  [/false prophets?/gi, "거짓 선지자"],
  [/antichrist/gi, "적그리스도"],
  [/new jerusalem/gi, "새 예루살렘"],
  [/lake of fire/gi, "불못"],
  [/book of life/gi, "생명책"],
  [/seven churches/gi, "일곱 교회"],
  [/seven seals/gi, "일곱 인"],
  [/seven trumpets/gi, "일곱 나팔"],
  [/seven bowls/gi, "일곱 대접"],
  [/thousand years/gi, "천년"],
  [/final judgment/gi, "최후 심판"],
  [/call to repentance/gi, "회개로의 부르심"],
  [/call to /gi, ""],
];

function clip14(s) {
  const chars = [...String(s).replace(/\s+/g, " ").trim()];
  if (chars.length <= 14) return chars.join("");
  // 단어 경계에서 자르기
  let cut = chars.slice(0, 14).join("");
  const sp = cut.lastIndexOf(" ");
  if (sp >= 4) cut = cut.slice(0, sp);
  return cut.trim();
}

function titleCaseTokens(en) {
  let s = String(en).replace(/['']/g, "'");
  for (const [re, rep] of PHRASES) s = s.replace(re, rep);
  return s;
}

/**
 * 간단 구문 번역 — 완벽하진 않으나 절 절단이 아닌 '뜻' 제목을 만듦
 */
export function translateBsbHeading(en) {
  const original = String(en).trim();
  let s = titleCaseTokens(original);

  // 이미 한국어가 섞인 경우(구 치환 결과)
  if (/[가-힣]{2,}/.test(s) && !/[A-Za-z]{3,}/.test(s)) {
    return clip14(s.replace(/\s+/g, " ").trim());
  }

  const key = normEn(original);

  // 패턴: The Parable of X
  let m = key.match(/^the parable of (?:the )?(.+)$/);
  if (m) return clip14(`${translateNounPhrase(m[1])} 비유`);

  m = key.match(/^the song of (.+)$/);
  if (m) return clip14(`${translateNounPhrase(m[1])}의 노래`);

  m = key.match(/^the death of (.+)$/);
  if (m) return clip14(`${translateNounPhrase(m[1])}의 죽음`);

  m = key.match(/^the birth of (.+)$/);
  if (m) return clip14(`${translateNounPhrase(m[1])}의 탄생`);

  m = key.match(/^the call of (.+)$/);
  if (m) return clip14(`${translateNounPhrase(m[1])}을 부르심`);

  m = key.match(/^jesus (.+)$/);
  if (m) {
    const rest = translateVerbPhrase(m[1]);
    return clip14(rest.includes("예수") ? rest : `예수${rest ? " " + rest : ""}`.replace(/\s+/g, " "));
  }

  m = key.match(/^paul'?s? (.+)$/);
  if (m) return clip14(`바울의 ${translateNounPhrase(m[1])}`);

  m = key.match(/^peter'?s? (.+)$/);
  if (m) return clip14(`베드로의 ${translateNounPhrase(m[1])}`);

  m = key.match(/^john'?s? (.+)$/);
  if (m) return clip14(`요한의 ${translateNounPhrase(m[1])}`);

  m = key.match(/^woe to (.+)$/);
  if (m) return clip14(`${translateNounPhrase(m[1])}에게 화`);

  m = key.match(/^woes to (.+)$/);
  if (m) return clip14(`${translateNounPhrase(m[1])}에게 화`);

  m = key.match(/^a warning to (.+)$/);
  if (m) return clip14(`${translateNounPhrase(m[1])}에게 경고`);

  m = key.match(/^warning(?:s)? (?:to|against) (.+)$/);
  if (m) return clip14(`${translateNounPhrase(m[1])}에 대한 경고`);

  m = key.match(/^greetings? from (.+)$/);
  if (m) return clip14(`${translateNounPhrase(m[1])}의 문안`);

  m = key.match(/^(.+) greets? (.+)$/);
  if (m) return clip14(`${translateNounPhrase(m[1])}의 문안`);

  m = key.match(/^the (.+) of (.+)$/);
  if (m) {
    const head = translateNounPhrase(m[1]);
    const tail = translateNounPhrase(m[2]);
    if (head && tail) return clip14(`${tail}의 ${head}`);
  }

  // 일반 토큰 조립
  return clip14(translateNounPhrase(key));
}

function lookupWord(w) {
  const k = w.toLowerCase().replace(/[^a-z'-]/g, "");
  if (!k) return "";
  if (k in WORD) return WORD[k];
  // possessive trailing 's
  if (k.endsWith("'s") || k.endsWith("s'")) {
    const base = k.replace(/'?s$/i, "");
    if (base in WORD) return `${WORD[base]}의`;
  }
  if (k.endsWith("s") && WORD[k.slice(0, -1)] !== undefined) return WORD[k.slice(0, -1)];
  return "";
}

function translateNounPhrase(phrase) {
  const raw = String(phrase).toLowerCase().replace(/['']/g, "'");
  // try full phrase
  const full = lookupWord(raw.replace(/\s+/g, " ").trim());
  if (full) return full;

  const tokens = raw.split(/[\s/]+/).filter(Boolean);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    // bigram
    if (i + 1 < tokens.length) {
      const bi = `${tokens[i]} ${tokens[i + 1]}`;
      const hit = lookupWord(bi) || WORD[bi];
      if (hit) {
        if (hit) out.push(hit);
        i += 1;
        continue;
      }
    }
    const w = lookupWord(tokens[i]);
    if (w) out.push(w);
  }
  // 조사 정리
  let s = out.join(" ").replace(/\s+/g, " ").trim();
  s = s.replace(/의 의/g, "의").replace(/과 과/g, "과");
  // 비어 있으면 핵심 영어 단어를 음역하지 말고 짧은 요약
  if (!s) {
    // 마지막 수단: 주요 명사만
    const important = tokens.filter((t) => !["the", "a", "an", "of", "and", "to", "for", "in", "on"].includes(t));
    s = important
      .map((t) => lookupWord(t))
      .filter(Boolean)
      .join(" ");
  }
  if (!s) s = "본문 단락";
  return s;
}

function translateVerbPhrase(phrase) {
  const p = String(phrase).toLowerCase();
  if (/^heals?\b/.test(p)) return `${translateNounPhrase(p.replace(/^heals?\s*/, ""))}을 고치심`.replace(/을을/g, "을");
  if (/^raises?\b/.test(p)) return `${translateNounPhrase(p.replace(/^raises?\s*/, ""))}을 살리심`;
  if (/^walks? on/.test(p)) return "물 위로 걸으심";
  if (/^calms?\b/.test(p)) return "바람과 바다를 잔잔케 하심";
  if (/^feeds?\b|^feeding\b/.test(p)) return `${translateNounPhrase(p.replace(/^(feeds?|feeding)\s*/, ""))}을 먹이심`;
  if (/^prays?\b/.test(p)) return "기도하심";
  if (/^teaches?\b/.test(p)) return "가르치심";
  if (/^enters?\b/.test(p)) return `${translateNounPhrase(p.replace(/^enters?\s*/, ""))}에 들어가심`;
  if (/^cleanses?\b/.test(p)) return "성전을 깨끗케 하심";
  if (/^predicts?\b|^foretells?\b/.test(p)) return "예고하심";
  if (/^denies?\b/.test(p)) return "부인함";
  if (/^betrays?\b/.test(p)) return "배반함";
  if (/^sends?\b/.test(p)) return "보내심";
  if (/^calls?\b/.test(p)) return `${translateNounPhrase(p.replace(/^calls?\s*/, ""))}을 부르심`;
  if (/^blesses?\b/.test(p)) return "축복하심";
  if (/^curses?\b/.test(p)) return "저주하심";
  if (/^anoints?\b/.test(p)) return "기름을 부으심";
  if (/^appears?\b/.test(p)) return "나타나심";
  if (/^ascends?\b/.test(p)) return "승천하심";
  if (/^is baptized|baptized\b/.test(p)) return "세례를 받으심";
  if (/^is tempted|tempted\b/.test(p)) return "시험받으심";
  if (/^is born|born\b/.test(p)) return "탄생";
  if (/^dies?\b|^death\b/.test(p)) return "죽으심";
  if (/^is crucified|crucified\b/.test(p)) return "십자가에 못 박히심";
  if (/^is buried|buried\b/.test(p)) return "장사되심";
  if (/^rises?\b|^is risen|resurrection\b/.test(p)) return "부활하심";
  return translateNounPhrase(phrase);
}
