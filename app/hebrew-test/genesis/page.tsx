import { redirect } from "next/navigation";

// 히브리어 PoC — 창세기 진입 시 1장으로 안내.
export default function HebrewTestGenesisIndex() {
  redirect("/hebrew-test/genesis/1");
}
