// 더 이상 사용하지 않는 레거시 export.
// 과거 /admin · /teacher 가 `<style jsx>{dashStyles}</style>` 패턴으로 이 문자열을
// 가져다 썼지만, Next.js + SWC 환경에서 외부 변수를 styled-jsx 에 넘기면 스코프
// hash 가 undefined 가 되어 스타일이 주입되지 않는 문제가 있었음(jsx-undefined).
//
// 이를 해결하기 위해 .dash-* 규칙 전체를 app/globals.css 에 글로벌 클래스로
// 이전했고, /admin 은 이 모듈을 더 이상 import 하지 않는다.
//
// /teacher 는 아직 본 라운드 디자인 갱신 범위 밖이라 옛 import 줄이 남아 있는데,
// 이 파일이 빈 문자열을 export 하므로 `<style jsx>{dashStyles}</style>` 가
// 무해한 no-op 가 되고, 실제 시각 스타일은 globals.css 의 .dash-* 에서 공급된다.
//
// 다음 라운드에서 /teacher 를 정식으로 정리할 때 이 import 와 함께 본 파일도
// 삭제할 것.
export const dashStyles = "";
