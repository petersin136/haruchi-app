/**
 * BSB 영어 제목 → 문장형 한국어 (4–14자)
 * 낱말 사전을 이어 붙이지 않고, 확정·문형만 사용. 확신 없으면 "".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function normEn(s) {
  return String(s)
    .normalize("NFKC")
    .replace(/['’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function clip14(s) {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  const len = (x) => [...x].length;
  if (len(t) <= 14) return t;
  // 높임 어미 축약: 하심→함 등
  const shorten = (x) =>
    x
      .replace(/하게 하심$/, "케 함")
      .replace(/깨끗케 하심$/, "깨끗케 함")
      .replace(/잔잔케 하심$/, "잔잔케 함")
      .replace(/하심$/, "함")
      .replace(/으심$/, "음")
      .replace(/시심$/, "심")
      .replace(/리심$/, "림")
      .replace(/받으심$/, "받음")
      .replace(/가르치심$/, "가르침")
      .replace(/나타나심$/, "나타남");
  let u = shorten(t);
  if (len(u) <= 14) return u;
  // 목적어 조사 축약 시도: "…을/를 " 유지하되 수식 축소
  u = u.replace(/많은 병자를 /, "병자를 ").replace(/걷지 못하던 사람을 /, "앉은뱅이를 ");
  if (len(u) <= 14) return u;
  return "";
}

function batchim(word) {
  const ch = [...word].at(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}
export function iGa(n) {
  return n + (batchim(n) ? "이" : "가");
}
export function eulReul(n) {
  return n + (batchim(n) ? "을" : "를");
}
export function ege(n) {
  return n + "에게";
}
export function ui(n) {
  return n + "의";
}
export function eseo(n) {
  return n + "에서";
}

/** 인명·지명·용어 (개역한글 표기) */
export const NAME = {
  jesus: "예수",
  christ: "그리스도",
  "jesus christ": "예수 그리스도",
  god: "하나님",
  "the lord": "여호와",
  lord: "여호와",
  peter: "베드로",
  paul: "바울",
  john: "요한",
  "john the baptist": "세례 요한",
  moses: "모세",
  david: "다윗",
  elijah: "엘리야",
  elisha: "엘리사",
  solomon: "솔로몬",
  abraham: "아브라함",
  abram: "아브람",
  sarah: "사라",
  sarai: "사래",
  isaac: "이삭",
  jacob: "야곱",
  esau: "에서",
  joseph: "요셉",
  noah: "노아",
  aaron: "아론",
  joshua: "여호수아",
  samuel: "사무엘",
  saul: "사울",
  nathan: "나단",
  absalom: "압살롬",
  joab: "요압",
  jeremiah: "예레미야",
  isaiah: "이사야",
  ezekiel: "에스겔",
  daniel: "다니엘",
  nehemiah: "느헤미야",
  ezra: "에스라",
  job: "욥",
  ruth: "룻",
  esther: "에스더",
  mordecai: "모르드개",
  deborah: "드보라",
  barak: "바락",
  gideon: "기드온",
  samson: "삼손",
  jephthah: "입다",
  jael: "야엘",
  sisera: "시스라",
  hezekiah: "히스기야",
  josiah: "요시야",
  ahab: "아합",
  ahaziah: "아하시야",
  jehu: "예후",
  jezebel: "이세벨",
  nabal: "나발",
  abigail: "아비가일",
  jonathan: "요나단",
  bathsheba: "밧세바",
  uri: "우리아",
  cain: "가인",
  abel: "아벨",
  lot: "롯",
  laban: "라반",
  rachel: "라헬",
  leah: "레아",
  rebekah: "리브가",
  hagar: "하갈",
  ishmael: "이스마엘",
  pharaoh: "바로",
  egypt: "애굽",
  melchizedek: "멜기세덱",
  balaam: "발람",
  balak: "발락",
  caleb: "갈렙",
  rahab: "라합",
  goliath: "골리앗",
  naaman: "나아만",
  jonah: "요나",
  hosea: "호세아",
  amos: "아모스",
  micah: "미가",
  nahum: "나훔",
  habakkuk: "하박국",
  zephaniah: "스바냐",
  haggai: "학개",
  zechariah: "스가랴",
  malachi: "말라기",
  mary: "마리아",
  martha: "마르다",
  lazarus: "나사로",
  pilate: "빌라도",
  herod: "헤롯",
  stephen: "스데반",
  philip: "빌립",
  barnabas: "바나바",
  timothy: "디모데",
  titus: "디도",
  silas: "실라",
  aquila: "아굴라",
  priscilla: "브리스길라",
  cornelius: "고넬료",
  ananias: "아나니아",
  sapphira: "삽비라",
  nicodemus: "니고데모",
  thomas: "도마",
  matthew: "마태",
  levi: "레위",
  mark: "마가",
  luke: "누가",
  james: "야고보",
  jude: "유다",
  judas: "가룟 유다",
  cyrus: "고레스",
  darius: "다리오",
  nebuchadnezzar: "느부갓네살",
  belshazzar: "벨사살",
  zerubbabel: "스룹바벨",
  vashti: "와스디",
  haman: "하만",
  boaz: "보아스",
  naomi: "나오미",
  eli: "엘리",
  hannah: "한나",
  goliath: "골리앗",
  goliath: "골리앗",
  israel: "이스라엘",
  judah: "유다",
  jerusalem: "예루살렘",
  elah: "엘라",
  zimri: "시므리",
  omri: "오므리",
  shallum: "살룸",
  menahem: "므나헴",
  pekahiah: "브가히야",
  pekah: "베가",
  hoshea: "호세아",
  rehoboam: "르호보암",
  jeroboam: "여로보암",
  asa: "아사",
  jehoshaphat: "여호사밧",
  jehoram: "여호람",
  ahaz: "아하스",
  manasseh: "므낫세",
  amon: "아몬",
  jehoiakim: "여호야김",
  jehoiachin: "여호야긴",
  zedekiah: "시드기야",
  adonijah: "아도니야",
  shimei: "시므이",
  amaziah: "아마샤",
  uzziah: "웃시야",
  azariah: "아사랴",
  jotham: "요담",
  joash: "요아스",
  jehoash: "요아스",
  athaliah: "아달랴",
  jehoiada: "여호야다",
  nadab: "나답",
  baasha: "바아사",
  abijah: "아비야",
  abijam: "아비얌",
  gedaliah: "그다랴",
  hilkiah: "힐기야",
  cyrus: "고레스",
  boaz: "보아스",
  ruth: "룻",
  naomi: "나오미",
  abner: "아브넬",
  absalom: "압살롬",
  ananias: "아나니아",
  balak: "발락",
  balaam: "발람",
  benhadad: "벤하닷",
  "ben-hadad": "벤하닷",
  bildad: "빌닷",
  jethro: "이드로",
  pharaoh: "바로",
  eg: "애굽",
  egypt: "애굽",
  moab: "모압",
  ammon: "암몬",
  gog: "곡",
  sidon: "시돈",
  zion: "시온",
  cush: "구스",
  shebna: "셉나",
  eli: "엘리",
  timothy: "디모데",
  crete: "그레데",
  malta: "멜리데",
  james: "야고보",
  jude: "유다",
  elder: "장로",
  "the elder": "장로",
  arad: "아랏",
  sihon: "시혼",
  og: "옥",
  kohathites: "고핫 자손",
  gershonites: "게르손 자손",
  merarites: "므라리 자손",
  kedar: "게달",
  hazor: "하솔",
  elam: "엘람",
  gallio: "갈리오",
  bartimaeus: "바디매오",
  nathanael: "나다나엘",
  magdalene: "막달라 마리아",
  "mary magdalene": "막달라 마리아",
  gethsemane: "겟세마네",
  olives: "감람산",
  "mount of olives": "감람산",
  gennesaret: "게네사렛",
  bethsaida: "벳새다",
  laodicea: "라오디게아",
  philadelphia: "빌라델비아",
  sardis: "사데",
  pergamum: "버가모",
  smyrna: "서머나",
  thyatira: "두아디라",
  patmos: "밧모",
  enoch: "에녹",
  methuselah: "므두셀라",
  shem: "셈",
  ham: "함",
  japheth: "야벳",
  nahor: "나홀",
  terah: "데라",
  potiphar: "보디발",
  pharaoh: "바로",
  abimelech: "아비멜렉",
  abimelech: "아비멜렉",
  babylon: "바벨론",
  nineveh: "니느웨",
  sodom: "소돔",
  gomorrah: "고모라",
  jericho: "여리고",
  bethlehem: "베들레헴",
  nazareth: "나사렛",
  galilee: "갈릴리",
  samaria: "사마리아",
  canaan: "가나안",
  midian: "미디안",
  moab: "모압",
  edom: "에돔",
  assyria: "앗수르",
  syria: "아람",
  aram: "아람",
  egypt: "애굽",
  sinai: "시내",
  zion: "시온",
  shiloh: "실로",
  bethel: "벧엘",
  beersheba: "브엘세바",
  shechem: "세겜",
  hebron: "헤브론",
  samaria: "사마리아",
  corinth: "고린도",
  ephesus: "에베소",
  rome: "로마",
  athens: "아덴",
  antioch: "안디옥",
  damascus: "다메섹",
  palestine: "팔레스틴",
  pharisees: "바리새인",
  sadducees: "사두개인",
  scribes: "서기관",
  gentiles: "이방인",
  israelites: "이스라엘 자손",
  "the holy spirit": "성령",
  satan: "사단",
  devil: "마귀",
  abraham: "아브라함",
  temple: "성전",
  storm: "풍랑",
  water: "물",
  ark: "궤",
  serpent: "뱀",
  mankind: "인생",
  enoch: "에녹",
  zoar: "소알",
  sodom: "소돔",
  bethel: "벧엘",
  beersheba: "브엘세바",
  ararat: "아라랏",
  laban: "라반",
  dinah: "디나",
  seir: "세일",
  tamar: "다말",
  potiphar: "보디발",
  famine: "흉년",
  sanhedrin: "공회",
  caesar: "가이사",
  barabbas: "바라바",
  nazareth: "나사렛",
  assyrians: "앗수르",
  jerusalem: "예루살렘",
  sheba: "스바",
  "queen of sheba": "스바 여왕",
  rehoboam: "르호보암",
  ahab: "아합",
  baasha: "바아사",
  edom: "에돔",
  libnah: "립나",
  uzzah: "웃사",
  sennacherib: "산헤립",
  hezekiah: "히스기야",
  micaiah: "미가야",
  hormah: "호르마",
  levites: "레위 사람",
  philistines: "블레셋",
  showbread: "진설병",
  "mercy seat": "시은소",
  ephod: "에봇",
  breastpiece: "흉패",
  lampstand: "등대",
  courtyard: "뜰",
  cherubim: "그룹",
  "bronze altar": "놋 제단",
  "bronze basin": "놋 물두멍",
  tabernacle: "성막",
  passover: "유월절",
  discipleship: "제자",
  transfiguration: "변형되심",
  "twelve apostles": "열두 사도",
  "the twelve apostles": "열두 사도",
};

function nameOf(en) {
  const k = normEn(en);
  if (NAME[k]) return NAME[k];
  // strip articles
  const k2 = k.replace(/^(the|a|an)\s+/, "");
  return NAME[k2] || "";
}

/** 확정 번역 (문장형) — 파일·오버레이에서 보강 */
const EXACT = {
  "the creation": "천지 창조",
  "the seventh day": "일곱째 날의 안식",
  "the genealogy of jesus": "예수 그리스도의 족보",
  "the birth of jesus": "예수 그리스도의 나심",
  "the pilgrimage of the magi": "동방 박사의 경배",
  "the flight to egypt": "애굽으로 피하심",
  "weeping and great mourning": "라마의 애곡",
  "the return to nazareth": "나사렛으로 돌아옴",
  "the mission of john the baptist": "세례 요한의 전파",
  "the baptism of jesus": "예수께서 세례를 받으심",
  "the temptation of jesus": "광야에서 시험받으심",
  "jesus begins his ministry": "예수께서 전도하심",
  "the first disciples": "처음 부르신 제자들",
  "jesus heals the multitudes": "예수께서 병을 고치심",
  "the sermon on the mount": "산상 설교",
  "the beatitudes": "복 있는 자",
  "salt and light": "소금과 빛",
  "the fulfillment of the law": "율법을 이루심",
  "anger and reconciliation": "노여움과 화해",
  adultery: "간음하지 말라",
  divorce: "이혼의 규례",
  "oaths and vows": "맹세하지 말라",
  "an eye for an eye": "눈은 눈으로",
  "love your enemies": "원수를 사랑하라",
  "giving to the needy": "구제하는 일",
  "the lord's prayer": "이렇게 기도하라",
  "proper fasting": "금식하는 일",
  "treasures in heaven": "하늘에 쌓은 보화",
  "the lamp of the body": "몸의 등불",
  "do not worry": "염려하지 말라",
  "judging others": "비판하지 말라",
  "ask, seek, knock": "구하라 찾으라",
  "the narrow gate": "좁은 문으로 들어가라",
  "a tree and its fruit": "나무와 열매",
  "the house on the rock": "반석 위의 집",
  "not peace but a sword": "화평이 아니요 검",
  "the triumphant messiah": "기름 받은 자",
  "the psalm of the cross": "어찌 나를 버리셨나이까",
  "the lord is my shepherd": "여호와는 나의 목자",
  "moses at the burning bush": "불붙은 떨기나무",
  "the widow's oil": "과부의 기름",
  prologue: "책의 머리말",
  "moses leaves for egypt": "모세가 애굽으로 감",
  "moses' staff": "모세의 지팡이",
  "moses' hand": "모세의 손",
  "dan and naphtali": "단과 납달리",
  "gad and asher": "갓과 아셀",
  "issachar, zebulun, and dinah": "잇사갈과 스불론과 디나",
  joseph: "요셉의 출생",
  "jacob prospers": "야곱이 창성함",
  "the people respond": "백성의 응답",
  "jeremiah weeps for his people": "예레미야의 울음",
  "god's testimony about his son": "하나님의 아들의 증거",
  "god’s testimony about his son": "하나님의 아들의 증거",
  "effective prayer": "응답받는 기도",
  "preparing the passover": "유월절을 예비함",
  "the great flood": "큰 홍수",
  "the tower of babel": "바벨탑",
  "cain and abel": "가인과 아벨",
  "the serpent's deception": "뱀의 속임",
  "god arraigns adam and eve": "아담과 하와를 심문하심",
  "jael kills sisera": "야엘이 시스라를 죽임",
  "elijah denounces ahaziah": "엘리야가 아하시야를 꾸짖음",
  "elisha raises the shunammite's son": "수넴 여인의 아들을 살림",
  "elisha raises the shunammite’s son": "수넴 여인의 아들을 살림",
  "peter addresses the crowd": "베드로가 무리에게 말함",
  "a lame man walks": "걷지 못하던 사람이 걸음",
  "the last supper": "마지막 만찬",
  "the new jerusalem": "새 예루살렘",
  "the showbread": "진설하는 떡",
  "rest for the weary": "수고한 자의 쉼",
  "god takes up enoch": "하나님이 에녹을 데려가심",
  "jacob wrestles with god": "야곱이 하나님과 씨름함",
  "jacob flees from laban": "야곱이 라반을 떠남",
  "jacob returns to bethel": "야곱이 벧엘로 돌아옴",
  "judas agrees to betray jesus": "유다가 예수를 팔기로 함",
  "the famine begins": "흉년이 시작됨",
  "jesus cleanses the temple": "예수께서 성전을 깨끗케 함",
  "jesus calms the storm": "예수께서 풍랑을 잔잔케 함",
  "jesus walks on water": "예수께서 물 위로 걸으심",
  "jesus before the sanhedrin": "예수께서 공회 앞에",
  "the soldiers mock jesus": "군병들이 예수를 조롱함",
  "the plot to kill jesus": "예수를 죽이려 함",
  "final greetings": "마지막 문안",
  "the transfiguration": "변형되심",
  "david conquers jerusalem": "다윗이 예루살렘을 이김",
  "uzzah touches the ark": "웃사가 궤를 만짐",
  "joseph sold into egypt": "요셉이 애굽에 팔림",
  "lot flees to zoar": "롯이 소알로 도망함",
  "sennacherib threatens jerusalem": "산헤립이 예루살렘을 위협함",
  "sennacherib invades judah": "산헤립이 유다를 침입함",
  "micaiah prophesies against ahab": "미가야가 아합을 예언함",
  "david fetches the ark": "다윗이 궤를 가져옴",
  "hezekiah shows his treasures": "히스기야가 보화를 보임",
};

try {
  const p = path.join(__dirname, "..", ".cache", "headings-sentence-exact.json");
  if (fs.existsSync(p)) Object.assign(EXACT, JSON.parse(fs.readFileSync(p, "utf8")));
} catch { /* ignore */ }

/** 동사 문형: EN verb → { human, god } 한국어 어간+어미 */
const VERB = {
  kills: { h: "죽임", g: "죽이심" },
  kills: { h: "죽임", g: "죽이심" },
  raises: { h: "살림", g: "살리심" },
  heals: { h: "고침", g: "고치심" },
  addresses: { h: "에게 말함", g: "에게 말씀하심" },
  speaks: { h: "말함", g: "말씀하심" },
  sends: { h: "보냄", g: "보내심" },
  calls: { h: "부름", g: "부르심" },
  blesses: { h: "축복함", g: "축복하심" },
  prays: { h: "기도함", g: "기도하심" },
  teaches: { h: "가르침", g: "가르치심" },
  feeds: { h: "먹임", g: "먹이심" },
  calms: { h: "잔잔케 함", g: "잔잔케 하심" },
  cleanses: { h: "깨끗케 함", g: "깨끗케 하심" },
  appears: { h: "나타남", g: "나타나심" },
  preaches: { h: "전파함", g: "전파하심" },
  delivers: { h: "건짐", g: "건지심" },
  defeats: { h: "이김", g: "이기심" },
  captures: { h: "사로잡음", g: "사로잡으심" },
  denounces: { h: "꾸짖음", g: "꾸짖으심" },
  anoints: { h: "기름 부음", g: "기름 부으심" },
  appoints: { h: "세움", g: "세우심" },
  rebukes: { h: "책망함", g: "책망하심" },
  builds: { h: "쌓음", g: "쌓으심" },
  restores: { h: "회복함", g: "회복하심" },
  offers: { h: "드림", g: "드리심" },
  mocks: { h: "조롱함", g: "조롱하심" },
  succeeds: { h: "이어받음", g: "이어받으심" },
  leaves: { h: "떠남", g: "떠나심" },
  greets: { h: "문안함", g: "문안하심" },
  washes: { h: "씻김", g: "씻기심" },
  defends: { h: "변호함", g: "변호하심" },
  intercedes: { h: "중보함", g: "중보하심" },
  welcomes: { h: "영접함", g: "영접하심" },
  rescues: { h: "구함", g: "구하심" },
  marries: { h: "결혼함", g: "결혼하심" },
  meets: { h: "만남", g: "만나심" },
  laughs: { h: "웃음", g: "웃으심" },
  pursues: { h: "쫓음", g: "쫓으심" },
  settles: { h: "머묾", g: "머물르심" },
  mourns: { h: "슬퍼함", g: "슬퍼하심" },
  comforts: { h: "위로함", g: "위로하심" },
  interprets: { h: "해석함", g: "해석하심" },
  reigns: { h: "다스림", g: "다스리심" },
  proclaims: { h: "선포함", g: "선포하심" },
  celebrates: { h: "지킴", g: "지키심" },
  predicts: { h: "예고함", g: "예고하심" },
  ministers: { h: "섬김", g: "섬기심" },
  warns: { h: "경고함", g: "경고하심" },
  deceives: { h: "속임", g: "속이심" },
  confounds: { h: "패함", g: "패하게 하심" },
  destroys: { h: "멸함", g: "멸하심" },
  chooses: { h: "택함", g: "택하심" },
  commands: { h: "명령함", g: "명령하심" },
  forgives: { h: "용서함", g: "용서하심" },
  walks: { h: "걸음", g: "걸으심" },
  flees: { h: "도망함", g: "피하심" },
  returns: { h: "돌아옴", g: "돌아오심" },
  wrestles: { h: "씨름함", g: "씨름하심" },
  conquers: { h: "이김", g: "이기심" },
  touches: { h: "만짐", g: "만지심" },
  takes: { h: "취함", g: "취하심" },
  gives: { h: "줌", g: "주심" },
  sells: { h: "팜", g: "파심" },
  renews: { h: "새롭게 함", g: "새롭게 하심" },
  confirms: { h: "견고케 함", g: "견고케 하심" },
  begins: { h: "시작함", g: "시작하심" },
  proceeds: { h: "나아감", g: "나아가심" },
  invades: { h: "침입함", g: "침입하심" },
  threatens: { h: "위협함", g: "위협하심" },
  prophesies: { h: "예언함", g: "예언하심" },
  fetches: { h: "가져옴", g: "가져오심" },
  shows: { h: "보임", g: "보이심" },
  agrees: { h: "약속함", g: "약속하심" },
  betrays: { h: "배반함", g: "배반하심" },
  chooses: { h: "택함", g: "택하심" },
  challenges: { h: "대적함", g: "대적하심" },
  turns: { h: "대적함", g: "대적하심" },
  rests: { h: "머묾", g: "머무심" },
  dies: { h: "죽음", g: "죽으심" },
  born: { h: "태어남", g: "나심" },
};

const GOD = new Set(["jesus", "god", "the lord", "christ", "jesus christ", "lord"]);

/**
 * 문장성 불량 여부
 * @returns {string[]}
 */
export function sentenceIssues(ko, en = "") {
  const t = String(ko ?? "").trim();
  const reasons = [];
  if (!t) return ["blank"];
  if (/이야기$/.test(t) || /에 대하여$/.test(t)) reasons.push("틀문구");
  if (
    /^[가-힣]+\s+(죽임|이김|구함|쌓음|만남|결혼함|속임|쫓음|축복함|간구함|영접함|부르심|보내심|고침|살림|잡음|회복함|해석함|중보함|예고함)\s+[가-힣]/.test(
      t,
    )
  ) {
    reasons.push("어순");
  }
  const parts = t.split(/\s+/).filter(Boolean);
  const hasParticle = /[은는이가을를의와과도만께에로부터까지]|에게|께서|에서|으로|로$|며|고$|후에/.test(t);
  const hasVerbal = /(함|임|음|됨|옴|림|짐|심|님|함|케|린|은|는|한|된|인|할|일|받|내|갇|걸|살|죽|구|이김|다스림|시작|나뉨)$/.test(
    t,
  ) || /(내린|받은|지은|감추인|뿌리는|잃은|선한|값진|하는|된|인|한)\s/.test(t);
  if (parts.length >= 3 && !hasParticle && !hasVerbal) reasons.push("명사나열");
  // 조사 없이 이어진 두 명사 — 수식·관용·명령형은 허용
  if (
    parts.length === 2 &&
    parts.every((p) => /^[가-힣]+$/.test(p)) &&
    !hasParticle &&
    !hasVerbal &&
    !/(하라|말라|소서|나이까|치라|외치라|예비하라|들어가라|찾으라)$/.test(t) &&
    !/(은|는|운|린|픈|한|된|인|할|히)$/.test(parts[0]) && // 관형·부사 수식
    !/^(세|새|큰|두|열|첫|놋|금|일곱째|여섯|열두|마지막|바깥|게르손|고핫|므라리|스바|히브리|진설병|제사장)$/.test(
      parts[0],
    ) &&
    !/(비유|지파|재앙|언약|제사|성전|기도|창조|홍수|만찬|설교|등불|족보|탄생|출생|죽음|노래|규례|절기|인|안식|손님|문안|제단|물두멍|에봇|흉패|등대|뜰|휘장|그룹|여왕|자손|해|날|종|상|집|길|땅|하늘|보화|징조|논쟁|섬김|귀환|조서|내부|예물|받침|경고|성읍|전쟁|반역|도피성|돌판|위임식|유월절|모세|문|나팔|번제|소제|화목제|속죄제|속건제)$/.test(
      parts[1],
    ) &&
    !/(쪽)$/.test(parts[0])
  ) {
    reasons.push("조사부족");
  }
  if (/^예수가\s/.test(t)) reasons.push("예수높임");
  if (en) {
    // 인물빠짐: 영어가 인물+타동사이고, 한국어가 조사·서술 없이 인물명도 없을 때만
    const m = String(en).match(
      /^(Jael|Jehu|Peter|Paul|David|Elijah|Elisha|Moses|Jesus|Noah|Abraham|Jacob|Joseph|Solomon|Samuel|Saul|Jeremiah|Isaiah|Nehemiah|Ezra|Jonah|Job|Ruth|Esther|Deborah|Gideon|Samson|Hezekiah|Josiah|Aaron|Mary|Stephen|Philip|Barnabas|Cyrus|Mordecai|Herod|Pilate|Isaac|Cain|Abel|Lot|Laban|Sarah|Rebekah|Rachel|Leah|Hagar|Melchizedek|Balaam|Balak|Nathan|Absalom|Joab|Jonathan|Abigail|Vashti|Haman|Boaz|Naomi|Eli|Hannah|Zerubbabel)\b/,
    );
    if (
      m &&
      /\b(Kills|Raises|Heals|Addresses|Speaks|Sends|Calls|Blesses|Prays|Teaches|Feeds|Calms|Cleanses|Appears|Preaches|Delivers|Defeats|Captures|Denounces|Anoints|Appoints|Rebukes|Builds|Restores|Offers|Mocks|Succeeds|Leaves|Greets|Washes|Defends|Intercedes|Welcomes|Rescues|Marries|Meets|Laughs|Pursues|Settles|Mourns|Comforts|Interprets|Reigns|Proclaims|Celebrates|Predicts|Ministers|Warns|Deceives|Destroys|Chooses|Commands|Forgives)\b/i.test(
        en,
      )
    ) {
      const kn = nameOf(m[1]);
      if (kn && !t.includes(kn) && !hasParticle && !hasVerbal) reasons.push("인물빠짐");
    }
  }
  return [...new Set(reasons)];
}

function godSubj(subjKey) {
  return GOD.has(normEn(subjKey));
}

function subjParticle(koName, isGod) {
  if (koName === "예수") return "예수께서 ";
  if (koName === "여호와") return "여호와께서 ";
  if (isGod && koName === "하나님") return "하나님이 ";
  return iGa(koName) + " ";
}

/**
 * @param {string} en
 * @returns {string} 한국어 또는 ""
 */
export function writeHeadingSentence(en) {
  const raw = String(en || "").trim();
  if (!raw) return "";
  const key = normEn(raw);
  if (EXACT[key]) return clip14(EXACT[key]) || EXACT[key];

  // A Prophecy/Warning/Lament/Greeting …
  let m = key.match(/^a prophecy against (?:the )?(?:house of )?(.+)$/);
  if (m) {
    const place = {
      ammon: "암몬", babylon: "바벨론", edom: "에돔", gog: "곡", moab: "모압",
      "mount seir": "세일 산", sidon: "시돈", zedekiah: "시드기야",
      philistines: "블레셋", south: "남방", eli: "엘리", egypt: "애굽",
    };
    const x = nameOf(m[1]) || place[m[1]] || "";
    if (x) return clip14(`${x}에 대한 예언`);
  }
  m = key.match(/^a warning against (.+)$/);
  if (m) {
    const topics = {
      idolatry: "우상 숭배 경고",
      apostasy: "배교에 대한 경고",
      favoritism: "차별에 대한 경고",
      idleness: "게으름에 대한 경고",
      pride: "교만에 대한 경고",
      "going to egypt": "애굽으로 가지 말라",
    };
    if (topics[m[1]]) return topics[m[1]];
  }
  m = key.match(/^a greeting from (.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x) return clip14(`${ui(x)} 문안`);
    if (m[1] === "the elder") return "장로의 문안";
    if (m[1] === "james") return "야고보의 문안";
    if (m[1] === "jude") return "유다의 문안";
  }
  m = key.match(/^a lament (?:for|over) (.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x) return clip14(`${eulReul(x)} 위한 애곡`);
  }

  // To the Church in X
  m = key.match(/^to the church in (.+)$/);
  if (m) {
    const place = nameOf(m[1]) || "";
    if (place) return clip14(`${place} 교회에`);
  }

  // Woe to X
  m = key.match(/^woes? to (.+)$/);
  if (m) {
    const x = nameOf(m[1]) || "";
    if (x) return clip14(`${ege(x)} 화`);
  }

  // The Parable of (the) X
  m = key.match(/^the parable of (?:the )?(.+)$/);
  if (m) {
    const known = {
      sower: "씨 뿌리는 비유",
      weeds: "가라지 비유",
      "mustard seed": "겨자씨 비유",
      "hidden treasure": "감추인 보화 비유",
      "pearl of great price": "값진 진주 비유",
      net: "그물 비유",
      "good samaritan": "선한 사마리아인",
      "prodigal son": "탕자의 비유",
      "rich fool": "부자의 비유",
      "lost sheep": "잃은 양의 비유",
      "lost coin": "잃은 드라크마",
      "ten virgins": "열 처녀 비유",
      talents: "달란트 비유",
      "sheep and the goats": "양과 염소 비유",
      yeast: "누룩 비유",
      leaven: "누룩 비유",
    };
    if (known[m[1]]) return known[m[1]];
    return "";
  }

  // The Song of X
  m = key.match(/^the song of (.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x) return clip14(`${ui(x)} 노래`);
    if (m[1] === "moses") return "모세의 노래";
    if (m[1] === "deborah and barak") return "드보라와 바락의 노래";
  }

  // The Death/Birth/Call of X
  m = key.match(/^the (death|birth|call|genealogy|descendants|sons?|duties|execution|defeat|judgment|restoration|rebellion|fall|doom) of (.+)$/);
  if (m) {
    const x = nameOf(m[2]) || "";
    const map = {
      death: "죽음",
      birth: "탄생",
      call: null, // special
      genealogy: "족보",
      descendants: "후손",
      son: "아들",
      sons: "아들들",
      duties: "직무",
      execution: "처형",
      defeat: "패배",
      judgment: "심판",
      restoration: "회복",
      rebellion: "반역",
      fall: "멸망",
      doom: "멸망",
    };
    if (m[1] === "call" && x) {
      const isG = true; // usually God calls
      return clip14(`${eulReul(x)} 부르심`);
    }
    const head = map[m[1]];
    if (x && head) return clip14(`${ui(x)} ${head}`);
  }

  // X Reigns in Y
  m = raw.match(/^([A-Za-z][A-Za-z'-]*)\s+Reigns?\s+in\s+(.+)$/i);
  if (m) {
    const who = nameOf(m[1]);
    const where = nameOf(m[2]);
    if (who && where) return clip14(`${iGa(who)} ${eseo(where)} 다스림`);
    if (who) return clip14(`${iGa(who)} 다스림`);
  }

  // NAME VERB rest
  m = raw.match(
    /^((?:The\s+LORD)|(?:Jesus(?:\s+Christ)?)|(?:John\s+the\s+Baptist)|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(Kills|Raises|Heals|Addresses|Speaks|Sends|Calls|Blesses|Prays|Teaches|Feeds|Calms|Cleanses|Appears|Preaches|Delivers|Defeats|Captures|Denounces|Anoints|Appoints|Rebukes|Builds|Restores|Offers|Mocks|Succeeds|Leaves|Greets|Washes|Defends|Intercedes|Welcomes|Rescues|Marries|Meets|Laughs|Pursues|Settles|Mourns|Comforts|Interprets|Reigns|Proclaims|Celebrates|Predicts|Ministers|Warns|Deceives|Destroys|Chooses|Commands|Forgives|Flees|Returns|Wrestles|Conquers|Touches|Takes|Gives|Sells|Renews|Confirms|Begins|Proceeds|Invades|Threatens|Prophesies|Fetches|Shows|Agrees|Betrays|Turns|Rests|Dies)\b(?:\s+(.*))?$/i,
  );
  if (m) {
    const subjEn = m[1];
    const verbEn = m[2].toLowerCase();
    const rest = (m[3] || "").trim();
    const subj = nameOf(subjEn);
    const v = VERB[verbEn];
    if (!subj || !v) return "";
    const isG = godSubj(subjEn);
    const ending = isG ? v.g : v.h;
    const sp = subjParticle(subj, isG);

    // object extraction (simple)
    let obj = "";
    if (rest) {
      // "the Multitudes" / "Ahaziah" / "at Peter's House" / "Sisera"
      const om = rest.match(/^(?:the\s+|a\s+|his\s+|her\s+|their\s+)?(.+?)(?:\s+(?:in|at|on|from|to|for|with|before|of)\s+.*)?$/i);
      const objEn = (om ? om[1] : rest).replace(/['’]s$/i, "");
      obj = nameOf(objEn);
      // special phrases
      if (/^multitudes?/i.test(objEn)) obj = "많은 병자";
      if (/^crowd/i.test(objEn)) obj = "무리";
      if (/^paralytic/i.test(objEn)) obj = "중풍병자";
      if (/^children/i.test(objEn)) obj = "어린이";
      if (/^temple/i.test(objEn)) obj = "성전";
      if (/^storm/i.test(objEn)) obj = "풍랑";
      if (/^passover/i.test(objEn)) obj = "유월절";
      if (/shunammite/i.test(rest)) obj = "수넴 여인의 아들";
      if (/^blind/i.test(objEn)) obj = "맹인";
      if (/^lame/i.test(objEn)) obj = "걷지 못하던 사람";
      if (/^widow/i.test(objEn)) obj = "과부";
      if (/^altar/i.test(objEn)) obj = "제단";
      if (/^staff/i.test(objEn)) obj = "지팡이";
      if (/^ark/i.test(objEn)) obj = "궤";
      if (/^sisera/i.test(objEn)) obj = "시스라";
      if (/^jerusalem/i.test(objEn)) obj = "예루살렘";
      if (/^judah/i.test(objEn)) obj = "유다";
      if (/^ahaziah/i.test(objEn)) obj = "아하시야";
      if (/^jesus/i.test(objEn)) obj = "예수";
      if (/^enoch/i.test(objEn)) obj = "에녹";
      if (/^laban/i.test(objEn)) obj = "라반";
      if (/^hagar/i.test(objEn)) obj = "하갈";
      if (/^god$/i.test(objEn)) obj = "하나님";
    }

    if (verbEn === "addresses" && obj) {
      return clip14(`${sp}${ege(obj)} 말함`.replace(/^예수께서 /, "예수께서 "));
    }
    if (verbEn === "appears") {
      if (obj) return clip14(`${sp}${ege(obj)} 나타나심`);
      return clip14(`${sp}나타나심`);
    }
    if (verbEn === "reigns") {
      return clip14(`${sp}다스림`.replace("께서 다스림", "께서 다스리심"));
    }
    if (obj) {
      const title = `${sp}${eulReul(obj)} ${ending}`.replace(/\s+/g, " ").trim();
      // 예수께서 … 고치심
      return clip14(title);
    }
    return clip14(`${sp}${ending}`);
  }

  // The Feast/Laws/Plague of X — need specific
  m = key.match(/^the feast of (.+)$/);
  if (m) {
    const feasts = {
      firstfruits: "초실절",
      weeks: "칠칠절",
      trumpets: "나팔절",
      "tabernacles": "초막절",
      booths: "초막절",
      unleavened: "무교절",
      passover: "유월절",
      dedication: "수전절",
    };
    for (const [enK, ko] of Object.entries(feasts)) if (m[1].includes(enK)) return ko;
    return "";
  }

  m = key.match(/^the (?:fifth|sixth|first|second|third|fourth|seventh|eighth|ninth|tenth) plague[:\s]+(.+)$/);
  if (m) {
    const plagues = {
      livestock: "가축의 재앙",
      boils: "독종의 재앙",
      blood: "피의 재앙",
      frogs: "개구리 재앙",
      gnats: "이 재앙",
      flies: "파리 재앙",
      hail: "우박 재앙",
      locusts: "메뚜기 재앙",
      darkness: "흑암 재앙",
      "firstborn": "장자의 재앙",
    };
    for (const [enK, ko] of Object.entries(plagues)) if (m[1].includes(enK)) return ko;
    return "";
  }

  // Tribe of X
  m = key.match(/^the tribe of (.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x) return clip14(`${ui(x)} 지파`);
    // transliterate common tribes
    const tribes = {
      gad: "갓 지파",
      issachar: "잇사갈 지파",
      zebulun: "스불론 지파",
      dan: "단 지파",
      asher: "아셀 지파",
      naphtali: "납달리 지파",
      reuben: "르우벤 지파",
      simeon: "시므온 지파",
      levi: "레위 지파",
      judah: "유다 지파",
      ephraim: "에브라임 지파",
      manasseh: "므낫세 지파",
      benjamin: "베냐민 지파",
    };
    if (tribes[m[1]]) return tribes[m[1]];
  }

  // Judgment on X
  m = key.match(/^judgment on (?:the )?(.+)$/);
  if (m) {
    const place = {
      nations: "열방",
      cush: "구스",
      "cush and assyria": "구스와 앗수르",
      "kedar and hazor": "게달과 하솔",
      "moab and ammon": "모압과 암몬",
      ammonites: "암몬",
      "both sisters": "두 자매",
    };
    const x = nameOf(m[1]) || place[m[1]] || "";
    if (x) return clip14(`${x}에 내린 심판`);
  }

  // Single-word / short topical
  const SHORT = {
    love: "사랑",
    forgiveness: "용서",
    thanksgiving: "감사",
    "the sabbath": "안식일",
    "the beginning": "태초",
    othniel: "옷니엘",
    shamgar: "삼갈",
    tola: "돌라",
    "the word became flesh": "말씀이 육신이 되심",
    "the way, the truth, and the life": "길과 진리와 생명",
    "the wedding at cana": "가나의 혼인 잔치",
    "jesus the bread of life": "생명의 떡이신 예수",
    "jesus the light of the world": "세상의 빛이신 예수",
    "jesus and zacchaeus": "예수와 삭개오",
    "jesus and the samaritan woman": "예수와 사마리아 여자",
    "jesus weeps over jerusalem": "예수께서 예루살렘을 위해 우심",
    "peace i leave with you": "평안을 너희에게 주노라",
    "stand firm": "굳게 서라",
    "preach the word": "말씀을 전파하라",
    "no other gospel": "다른 복음은 없느니라",
    "the stoning of stephen": "스데반을 돌로 침",
    "the road to damascus": "다메섹으로 가는 길",
    "the road to emmaus": "엠마오로 가는 길",
    "the pool of bethesda": "베데스다 못",
    "the valley of dry bones": "마른 뼈 골짜기",
    "satan bound": "사단이 잡힘",
    "the fiery furnace": "불타는 풀무",
    "daniel in the lions' den": "사자 굴의 다니엘",
    "daniel in the lions’ den": "사자 굴의 다니엘",
    "naaman cured of leprosy": "나아만이 나음을 얻음",
    "david slays goliath": "다윗이 골리앗을 죽임",
    "crossing the jordan": "요단을 건넘",
    "the walls of jericho": "여리고 성벽",
    "the sin of achan": "아간의 죄",
    "the conquest of ai": "아이의 점령",
    "the defeat at ai": "아이에서의 패배",
  };
  if (SHORT[key]) return clip14(SHORT[key]) || SHORT[key];

  // X before Y
  m = raw.match(/^([A-Za-z ]+?)\s+before\s+(.+)$/i);
  if (m) {
    const a = nameOf(m[1]);
    const b = nameOf(m[2]);
    if (a === "예수" && b) return clip14(`예수께서 ${b} 앞에`);
    if (a && b) return clip14(`${iGa(a)} ${b} 앞에`);
  }

  // Laws about X / Property Laws
  m = key.match(/^laws? (?:about|of|for) (.+)$/);
  if (m) {
    const topics = {
      "skin diseases": "피부병의 규례",
      mildew: "곰팡이의 규례",
      "burnt offerings": "번제의 규례",
      "social responsibility": "이웃의 규례",
      "property": "재물의 규례",
    };
    for (const [enK, ko] of Object.entries(topics)) if (m[1].includes(enK)) return ko;
    return "";
  }

  // The X Gate / Court
  m = key.match(/^the (north|south|east|west|outer|inner) (gate|court)$/);
  if (m) {
    const dir = { north: "북쪽", south: "남쪽", east: "동쪽", west: "서쪽", outer: "바깥", inner: "안" };
    const thing = { gate: "문", court: "뜰" };
    return `${dir[m[1]]} ${thing[m[2]]}`;
  }

  // Seal
  m = key.match(/^the (fifth|sixth|seventh) seal[:\s]*(.*)$/);
  if (m) {
    const n = { fifth: "다섯째", sixth: "여섯째", seventh: "일곱째" };
    return `${n[m[1]]} 인`;
  }

  // Imperatives already OK in EXACT; generic "Do not X" 
  if (/^(do not|don't)\b/.test(key)) return "";

  // Walks on Water / on the sea
  m = key.match(/^(.+) walks on (?:the )?(water|sea)$/);
  if (m) {
    const who = nameOf(m[1]);
    if (who === "예수") return "예수께서 물 위로 걸으심";
    if (who) return clip14(`${iGa(who)} 물 위로 걸음`);
  }

  // God Takes Up Enoch
  m = key.match(/^god takes up (.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x) return clip14(`하나님이 ${eulReul(x)} 데려가심`);
  }

  // The Fate/Punishment/Defiling/Plot of/to X
  m = key.match(/^the fate of (?:the )?(.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x) return clip14(`${ege(x)} 내린 저주`);
  }
  m = key.match(/^the punishment of (?:the )?(.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x) return clip14(`${ege(x)} 내린 벌`);
  }
  m = key.match(/^the plot to kill (.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x === "예수") return "예수를 죽이려 함";
    if (x) return clip14(`${eulReul(x)} 죽이려 함`);
  }
  m = key.match(/^the defiling of (.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x) return clip14(`${ui(x)} 욕됨`);
  }

  // X Sold into Y / Falsely Imprisoned / Given Charge of
  m = key.match(/^(.+) sold into (.+)$/);
  if (m) {
    const a = nameOf(m[1]);
    const b = nameOf(m[2]);
    if (a && b) return clip14(`${a}이 ${b}에 팔림`);
  }
  m = key.match(/^(.+) falsely imprisoned$/);
  if (m) {
    const a = nameOf(m[1]);
    if (a) return clip14(`${a}이 옥에 갇힘`);
  }
  m = key.match(/^(.+) given charge of (.+)$/);
  if (m) {
    const a = nameOf(m[1]);
    const b = nameOf(m[2]);
    if (a && b) return clip14(`${a}이 ${b}을 다스림`);
  }

  // X and Y Part Ways
  m = key.match(/^(.+) and (.+) part ways$/);
  if (m) {
    const a = nameOf(m[1]);
    const b = nameOf(m[2]);
    if (a && b) return clip14(`${a}과 ${b}이 갈라짐`);
  }

  // Genealogy from X to Y
  m = key.match(/^genealogy from (.+) to (.+)$/);
  if (m) {
    const a = nameOf(m[1]);
    const b = nameOf(m[2]);
    if (a && b) return clip14(`${a}에서 ${b}까지 족보`);
  }

  // The Covenant at X / Stone of X / Ark Rests on X
  m = key.match(/^the covenant at (.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x) return clip14(`${eseo(x)} 세운 언약`);
  }
  m = key.match(/^the stone of (.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x) return clip14(`${ui(x)} 돌기둥`);
  }
  m = key.match(/^the ark rests on (.+)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x) return clip14(`궤가 ${eseo(x)} 머묾`);
  }

  // The Famine Begins / X Begins
  if (key === "the famine begins") return "흉년이 시작됨";
  if (key === "final greetings") return "마지막 문안";
  if (key === "the transfiguration") return "변형되심";
  if (key === "the twelve apostles") return "열두 사도";
  if (key === "a house divided") return "갈라진 집";
  if (key === "the lampstand") return "등대";
  if (key === "the courtyard") return "바깥뜰";
  if (key === "the ephod") return "에봇";
  if (key === "the breastpiece") return "흉패";
  if (key === "the cherubim") return "그룹";
  if (key === "the bronze altar") return "놋 제단";
  if (key === "the bronze basin") return "놋 물두멍";
  if (key === "the mercy seat") return "시은소";
  if (key === "the table of showbread") return "진설병 상";
  if (key === "the queen of sheba") return "스바 여왕";
  if (key === "the kingdom divided") return "나라가 나뉨";
  if (key === "water from the rock") return "반석에서 난 물";
  if (key === "cities of refuge") return "도피성";
  if (key === "six cities of refuge") return "여섯 도피성";
  if (key === "hebrew servants") return "히브리 종";
  if (key === "clean and unclean animals") return "정한 짐승과 부정한 짐승";
  if (key === "new stone tablets") return "새 돌판";
  if (key === "the seventh year") return "일곱째 해";
  if (key === "the daily offerings") return "날마다 드리는 제사";
  if (key === "questions about fasting") return "금식에 대한 물음";
  if (key === "paying taxes to caesar") return "가이사에게 세금";
  if (key === "whose son is the christ?") return "그리스도는 누구의 아들";
  if (key === "the cost of discipleship") return "제자의 길";
  if (key === "a promise of restoration") return "회복의 약속";
  if (key === "readiness at any hour") return "깨어 예비하라";
  if (key === "serving with honor") return "존귀히 섬김";
  if (key === "witnessing to all nations") return "만민에게 증거함";
  if (key === "the greatest in the kingdom") return "천국에서 큰 자";
  if (key === "temptations and trespasses") return "실족케 하는 일";
  if (key === "jesus' authority challenged" || key === "jesus’ authority challenged") return "예수의 권세를 물음";
  if (key === "jesus' mother and brothers" || key === "jesus’ mother and brothers") return "예수의 모친과 형제";
  if (key === "the rejection at nazareth") return "나사렛에서 배척받음";
  if (key === "the demons and the pigs") return "귀신과 돼지 떼";
  if (key === "the sadducees and the resurrection") return "사두개인의 부활 논쟁";
  if (key === "temple destruction and other signs") return "성전 파괴와 징조";
  if (key === "judas agrees to betray jesus") return "유다가 예수를 팔기로 함";
  if (key === "the crowd chooses barabbas") return "무리가 바라바를 택함";
  if (key === "the soldiers mock jesus") return "군병들이 예수를 조롱함";
  if (key === "passover and the feast of unleavened bread") return "유월절과 무교절";
  if (key === "jerusalem delivered from the assyrians") return "예루살렘이 구원받음";
  if (key === "benjamin born, rachel dies") return "베냐민 나고 라헬이 죽음";
  if (key === "lot and his daughters") return "롯과 그의 딸들";
  if (key === "abraham, sarah, and abimelech") return "아브라함과 아비멜렉";
  if (key === "joseph and potiphar's wife" || key === "joseph and potiphar’s wife") return "요셉과 보디발의 아내";
  if (key === "judah and tamar") return "유다와 다말";
  if (key === "reuben, simeon, levi, and judah") return "르우벤부터 유다까지";
  if (key === "the three visitors") return "세 손님";
  if (key === "abram and sarai in egypt") return "아브람이 애굽에 내려감";
  if (key === "sarah turns against hagar") return "사라가 하갈을 미워함";
  if (key === "lot flees to zoar") return "롯이 소알로 도망함";
  if (key === "lot proceeds toward sodom") return "롯이 소돔으로 향함";
  if (key === "jacob returns to bethel") return "야곱이 벧엘로 돌아옴";
  if (key === "jacob flees from laban") return "야곱이 라반을 떠남";
  if (key === "jacob wrestles with god") return "야곱이 하나님과 씨름함";
  if (key === "god renews the promise to abram") return "하나님이 아브람에게 언약하심";
  if (key === "god confirms his promise") return "하나님이 언약을 견고케 하심";

  // X and Y (two names)
  m = key.match(/^([a-z][a-z'-]*) and ([a-z][a-z'-]*)$/);
  if (m) {
    const a = nameOf(m[1]);
    const b = nameOf(m[2]);
    if (a && b) {
      const conj = batchim(a) ? "과" : "와";
      return clip14(`${a}${conj} ${b}`);
    }
  }

  // The X (single known noun)
  m = key.match(/^the ([a-z][a-z'-]*)$/);
  if (m) {
    const x = nameOf(m[1]);
    if (x && [...x].length >= 2) return clip14(x);
  }

  // confidence low
  return "";
}

export function setExact(en, ko) {
  EXACT[normEn(en)] = ko;
}

export function getExactMap() {
  return { ...EXACT };
}
