import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bookPath = path.resolve(__dirname, "..", "app", "bible-reading", "john3.json");

const CONTENT = {
  1: {
    1: "장로가 — 사랑하는 가이오에게 [편지합니다] — [내가] 진리 안에서 — 사랑하는 자입니다.",
    2: "사랑하는 자여, 모든 [것]에 관해 — [내가] 네가 — 잘되며, 또 건강하기를 — 기도합니다 — 너의 영혼이 — 잘되는 그대로 [말입니다].",
    3: "이는 [내가] 매우 — 기뻐했기 [때문입니다] — 곧 형제들이 — 와서 — 너의 진리에 대해 — 증언하고 있고, 또 네가 — 진리 안에서 — 걸어가고 있는 그대로 [증언합니다].",
    4: "[내게] — 이것들보다 — 더 — 큰 — 기쁨이 — 없습니다 — 곧 내 자녀들이 — 진리 안에서 — 걸어가고 있다는 [말]을 — 듣는 것 [말입니다].",
    5: "사랑하는 자여, [네가] 무엇이든 — 형제들에게 — 또 그것도 — 나그네들에게 — 행한다면, 신실하게 — 행하는 것입니다.",
    6: "[그들이] 너의 사랑에 대해 — 교회 앞에서 — 증언했습니다. 그들을 — 하나님께 — 합당하게 — 길로 — 배웅해 주는 것이 — [네가] 좋게 — 행할 [일]입니다 —",
    7: "이는 [그들이] 그 이름을 위해 — 이방인들에게서 — 아무것도 — 받지 — 않고 — 나갔기 [때문입니다].",
    8: "그러므로 우리는 — 그러한 자들을 — 받아들여야 합니다 — 우리가 — 진리에 — 함께 — 일하는 자가 — 되도록 [하기 위해서입니다].",
    9: "[내가] 교회에 — 어떤 [것]을 — 썼습니다 — 그러나 그들 가운데서 — 으뜸을 — 사랑하는 — 디오드레베가 — 우리를 — 받아들이지 — 않습니다.",
    10: "이러므로 만일 — [내가] 간다면, 그가 — 행하는 — 일들을 — 회상시킬 것입니다 — 곧 [그가] 악한 말들로 — 우리에게 대항해 — 헛소리하고 있습니다. 또 이것들에 — 만족하지 — 않고, [그는] 자기 자신이 — 형제들을 — 받아들이지 — 않을 뿐 아니라, [그들을] 받아들이기를 — 원하는 자들도 — 막으며, 교회 밖으로 — 던져 내고 있습니다.",
    11: "사랑하는 자여, 악한 [것]을 — 본받지 — 말고, 도리어 좋은 [것]을 [본받으십시오]. 좋게 행하는 자는 — 하나님에게서 — 났습니다. 악을 행하는 자는 — 하나님을 — 본 적이 — 없습니다.",
    12: "데메드리오가 — 모든 자에 의해, 또 진리 자체에 의해 — 증언을 — 받았습니다. 또 우리도 — 증언합니다. 또 너는 — 우리의 증언이 — 참되다는 [것]을 — 압니다.",
    13: "[내가] 너에게 — 쓸 — 많은 [것]을 — 가지고 있었지만, 잉크와 펜으로 — 너에게 — 쓰기를 — 원하지 — 않습니다.",
    14: "도리어 [내가] 곧 — 너를 — 보기를 — 소망합니다. 그러면 입에 — 입을 [맞대고] — 말할 것입니다.",
    15: "[너에게] — 평강이 [있기를 빕니다]. 친구들이 — 너에게 — 인사합니다. 친구들에게 — 이름으로 — 인사하라.",
  },
};

function main() {
  const data = JSON.parse(fs.readFileSync(bookPath, "utf8"));
  let total = 0;
  for (const ch of data.chapters) {
    const chCnt = CONTENT[ch.chapter];
    if (!chCnt) continue;
    const greekKrArr = ch.verses.greekKr ?? [];
    const greekKrMap = new Map(greekKrArr.map((e) => [e.n, e]));
    for (const verse of ch.verses.krv) {
      const kr = chCnt[verse.n];
      if (!kr) continue;
      if (greekKrMap.has(verse.n)) greekKrMap.get(verse.n).t = kr;
      else greekKrArr.push({ n: verse.n, t: kr });
      total += 1;
    }
    greekKrArr.sort((a, b) => a.n - b.n);
    ch.verses.greekKr = greekKrArr;
  }
  fs.writeFileSync(bookPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`✅ 요한삼서 갱신: ${total}절`);
}

main();
