# Block Extractor DB

![plugin-ui](asset/plugin-ui-day.png)  

![plugin-ui](asset/plugin-ui-day-extended.png)  


특정 태그/페이지를 참조하는 블록들을 필터링해 마크다운 파일로 다운로드하는 [Logseq](https://logseq.com) 플러그인 — **Logseq DB 그래프(2.x 베타, sqlite 기반) 전용**입니다.

[logseq-block-extractor](https://github.com/inchanS/logseq-block-extractor)의 DB 그래프 버전입니다. 파일(마크다운) 기반 그래프에서는 원본 플러그인을 사용하세요.

## 왜 별도 플러그인인가?

Logseq 2.x DB 그래프는 sqlite/datascript 기반의 완전히 다른 스키마를 사용하므로 기존 플러그인의 쿼리와 본문 처리 방식이 동작하지 않습니다:

| | 파일 기반 그래프 | DB 그래프 (이 플러그인) |
|---|---|---|
| 블록 텍스트 | `:block/content` | `:block/title` (raw 텍스트에 `[[uuid]]` 참조 토큰 포함) — SDK가 해석해 주는 `full-title` 사용 |
| 태그 참조 | `[[태그]]` / `#태그` → `:block/refs` | `[[태그]]` → `:block/refs`, `#태그` → `:block/tags` (둘 다 조회) |
| 프로퍼티 | 블록 내 `key:: value` 텍스트 | 일급 DB 엔티티(`:user.property/*`), `getPageProperties`로 조회 |
| 태그된 페이지 | 없음 | `#태그`가 붙은 페이지(객체)도 본문 전체와 함께 결과에 포함 |
| 순서형 리스트 | `logseq.order-list-type::` 텍스트 | `:logseq.property/order-list-type` 프로퍼티 |

## 기능

- **Primary Tag**를 참조하는 모든 블록(과 페이지)을 계층 구조를 유지한 채 추출
- 포함/제외(`-키워드`)와 Any/All 매칭을 지원하는 **키워드 필터**
- 페이지 이름, `created-at`, `updated-at`, `journal-day` 또는 임의 사용자 프로퍼티 기준 **정렬**
- **링크 치환**: `[[링크]]` / `#[[여러 단어 태그]]` → 볼드, 일반 텍스트, 사용자 지정 문자, 원문 유지
- 옵션: 태그 페이지 본문 포함, 부모 경로 제외
- 태그·키워드·정렬 프로퍼티 자동완성
- 결과를 `.md` 파일로 다운로드

## 설치 (베타 기간 수동 설치)

1. `npm install && npm run build`
2. Logseq에서 **설정 → 고급 → 개발자 모드** 활성화
3. **플러그인 → Load unpacked plugin** → 이 폴더 선택

## 사용법

다음 방법으로 다이얼로그를 엽니다:

- 툴바의 다운로드 버튼
- 커맨드 팔레트: `Extract Filtered Blocks` (`mod+shift+e`)
- 슬래시 커맨드 `/Extract Filtered Blocks` 또는 블록 컨텍스트 메뉴

## 개발

```bash
npm run dev     # vite 개발 서버
npm run watch   # 변경 시 재빌드
npm test        # vitest
npm run pack    # 빌드 + 배포용 zip
```

## 요구 사항

- Logseq 2.0.x 베타 (DB 그래프)
- `@logseq/libs` ^0.3.4

## 라이선스

GPL-3.0
