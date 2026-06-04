import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bookPath = path.resolve(__dirname, "..", "app", "bible-reading", "john2.json");

const CONTENT = {
  1: {
    1: "장로가 — 택함받은 부인과 그녀의 자녀들에게 [편지합니다] — 내가 — 진리 안에서 — 사랑하고 있는 자들이며, 나만이 아니라, 또한 — 진리를 — 깨달은 모든 자도 [사랑합니다] —",
    2: "[그] 진리 때문입니다 — [그것이] 우리 가운데 — 머무르며, 우리와 함께 — 영원토록 — 있을 [것입니다] —",
    3: "우리에게 — 은혜와 자비와 평강이 — 아버지 하나님과 — 아버지의 아들 예수 그리스도로부터 — 진리와 사랑 안에서 — [있을 것입니다].",
    4: "[내가] 매우 — 기뻐했습니다 — 곧 [내가] 너의 자녀들 가운데 — 우리가 — 아버지로부터 — 명령을 — 받은 그대로 — 진리 안에서 — 걷고 있는 자들을 — 발견했기 [때문입니다].",
    5: "또 지금 — 부인이여, [내가] 너에게 — 새 명령으로서가 아니라, 도리어 처음부터 — 우리가 — 가지고 있던 [명령]으로 — 청합니다 — 곧 [우리가] 서로 — 사랑하자는 [것입니다].",
    6: "또 이것이 — 사랑입니다 — 곧 우리가 — 그분의 명령들을 따라 — 걷는 것입니다. 이것이 — 명령이며, 너희가 — 처음부터 — 들은 그대로, 너희가 — 그 안에서 — 걸어야 합니다.",
    7: "이는 많은 — 미혹하는 자들이 — 세상으로 — 나갔기 [때문입니다] — 곧 예수 그리스도께서 — 살로 — 오신 [분]임을 — 고백하지 — 않는 자들입니다. 이 자가 — 미혹하는 자이며 — 적그리스도입니다.",
    8: "[너희는] 자기 자신을 — 살피십시오 — 우리가 — 일한 [것들]을 — 잃어버리지 — 않고, 도리어 — 충만한 — 삯을 — 받도록 [하기 위해서입니다].",
    9: "그리스도의 가르침 안에 — 머무르지 — 않고, 그것에서 — 더 — 앞서 나가는 — 모든 자는 — 하나님을 — 가지고 있지 — 않습니다. 그 가르침 안에 — 머무르는 자는 — 그가 — 아버지와 아들도 — 가지고 있습니다.",
    10: "만일 — 누가 — 너희에게 — 와서, 이 가르침을 — 가져오지 — 않는다면, 그를 — 집으로 — 받아들이지 — 말고, 그에게 — ‘기뻐하라’고 — 말하지도 — 마십시오.",
    11: "이는 ‘기뻐하라’고 — 말하는 자는 — 그의 — 악한 일들에 — 함께 — 참여하기 [때문입니다].",
    12: "[내가] 너희에게 — 많은 [것을] — 쓸 [말]이 — 있지만, 종이와 잉크를 통해 [쓰기를] — 원하지 — 않았습니다. 도리어 [내가] 너희에게로 — 가서, 입에 — 입을 [맞대고] — 말하기를 — 소망합니다 — 우리의 기쁨이 — 가득 채워지도록 [하기 위해서입니다].",
    13: "너의 택함받은 자매의 자녀들이 — 너에게 — 인사합니다.",
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
  console.log(`✅ 요한이서 갱신: ${total}절`);
}

main();
