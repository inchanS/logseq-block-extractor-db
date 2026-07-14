// DB 그래프에서 raw :block/title 은 참조를 [[uuid]] 형태의 내부 토큰으로 담고 있다.
// SDK가 참조를 사람이 읽을 수 있는 이름으로 풀어낸 fullTitle(:block/full-title)을
// 함께 직렬화해 주므로 항상 그것을 우선 사용한다.
// - Editor.getBlock() 결과: camelCase 키 (fullTitle)
// - DB.datascriptQuery() 결과: kebab-case 키 (full-title)
export function getBlockText(block: unknown): string {
    if (!block || typeof block !== 'object') return '';
    const b = block as Record<string, unknown>;
    const text = b['fullTitle'] ?? b['full-title'] ?? b['title'] ?? b['content'] ?? '';
    return typeof text === 'string' ? text : String(text);
}
