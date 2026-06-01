// 임시 텍스트 워드마크. 정식 SVG 로고가 나오면 이 컴포넌트만 바꾸면 됨.
// 스타일은 모두 app/globals.css 의 .wordmark / .wordmark--{size} 토큰 기반.
// "하루치" + 작은 영어 "Haruchi" — 에디토리얼 톤의 한·영 병기.
export type WordmarkSize = "sm" | "md" | "lg" | "xl";

export default function Wordmark({
  size = "md",
  className = "",
}: {
  size?: WordmarkSize;
  className?: string;
}) {
  return (
    <span className={`wordmark wordmark--${size}${className ? ` ${className}` : ""}`}>
      <span className="wordmark-ko">하루치</span>
      <span className="wordmark-en" aria-hidden="true">Haruchi</span>
    </span>
  );
}
