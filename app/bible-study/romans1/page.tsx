import { redirect } from "next/navigation";

// 이 라우트는 이전에 "성경 공부" 의 독립 페이지였다. 이제 같은 기능을 기존
// 사이트 레이아웃(헤더 + 본문 + 우측 사이드 메뉴) 안의 모드 드롭다운으로
// 통합했기 때문에, 이 URL 로 직접 들어와도 통합된 자리로 안내한다.
//
// 메뉴/북마크/외부 링크 호환을 위해 라우트 자체는 그대로 유지하고, 서버에서
// /bible-reading?view=study 로 영구 리다이렉트한다. 사용자가 들어가면 자동으로
// 로마서 1장 + 성경 공부 모드가 활성화된 통합 레이아웃이 열린다.
export default function BibleStudyRomans1Redirect() {
  redirect("/bible-reading?view=study");
}
