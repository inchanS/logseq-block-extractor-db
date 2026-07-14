import {ExtractedNode, PageMeta, SortValue} from "../types";

export function sortResults(filteredResults: ExtractedNode[], sortOrder: string, validSortField: string) {
    if (validSortField === 'filename') {
        // 파일명 정렬 (filename 정렬 시 sortValue는 항상 문자열)
        if (sortOrder === 'desc') {
            filteredResults.sort((a, b) => String(b.sortValue).localeCompare(String(a.sortValue), 'ko', {numeric: true}));
        } else {
            filteredResults.sort((a, b) => String(a.sortValue).localeCompare(String(b.sortValue), 'ko', {numeric: true}));
        }
    } else {
        // 프로퍼티 정렬
        filteredResults.sort((a, b) => {
            if (a.sortValue !== null && b.sortValue !== null) {
                if (typeof a.sortValue === 'number' && typeof b.sortValue === 'number') {
                    return sortOrder === 'desc' ? b.sortValue - a.sortValue : a.sortValue - b.sortValue;
                } else {
                    const comparison = String(a.sortValue).localeCompare(String(b.sortValue), 'ko', {numeric: true});
                    return sortOrder === 'desc' ? -comparison : comparison;
                }
            }

            if (a.sortValue !== null && b.sortValue === null) {
                return sortOrder === 'desc' ? -1 : 1;
            }
            if (a.sortValue === null && b.sortValue !== null) {
                return sortOrder === 'desc' ? 1 : -1;
            }

            const comparison = a.secondarySortValue.localeCompare(b.secondarySortValue, 'ko', {numeric: true});
            return sortOrder === 'desc' ? -comparison : comparison;
        });
    }
}

// DB 그래프의 프로퍼티 값 정규화:
// getPageProperties는 원래 이름을 키로 하는 읽기 쉬운 값을 반환하지만,
// node 타입 프로퍼티는 {title/name/value} 객체이거나 다중 값은 배열일 수 있다.
function normalizePropertyValue(raw: unknown): SortValue {
    if (raw === null || raw === undefined) return null;

    if (Array.isArray(raw)) {
        return raw.length > 0 ? normalizePropertyValue(raw[0]) : null;
    }
    if (typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        return normalizePropertyValue(obj['title'] ?? obj['fullTitle'] ?? obj['name'] ?? obj['value'] ?? null);
    }
    if (typeof raw === 'number' || typeof raw === 'string') return raw;
    if (typeof raw === 'boolean') return raw ? 1 : 0;
    return String(raw);
}

// 대소문자 무시 프로퍼티 조회
function lookupProperty(props: Record<string, any>, field: string): unknown {
    if (field in props) return props[field];
    const lower = field.toLowerCase();
    for (const key of Object.keys(props)) {
        if (key.toLowerCase() === lower) return props[key];
    }
    return undefined;
}

export function getSortValue(
    validSortField: string,
    pageMeta: PageMeta,
    pageProps: Record<string, any> | null
): { sortValue: SortValue; secondarySortValue: string } {
    const secondarySortValue: string = pageMeta.name || 'Unnamed Page';

    if (validSortField === 'filename') {
        return {sortValue: secondarySortValue, secondarySortValue};
    }

    // DB 그래프의 시스템 필드(:block/* 어트리뷰트) 우선 처리
    switch (validSortField) {
        case 'created-at':
        case 'created_at':
            return {sortValue: pageMeta.createdAt, secondarySortValue};
        case 'updated-at':
        case 'updated_at':
            return {sortValue: pageMeta.updatedAt, secondarySortValue};
        case 'journal-day':
        case 'journal_day':
            return {sortValue: pageMeta.journalDay, secondarySortValue};
        case 'date': {
            // 저널 페이지면 journal-day, 아니면 사용자 date 프로퍼티
            if (pageMeta.journalDay) {
                return {sortValue: pageMeta.journalDay, secondarySortValue};
            }
            break;
        }
    }

    let sortValue: SortValue = normalizePropertyValue(
        pageProps ? lookupProperty(pageProps, validSortField) : null
    );

    // 날짜 형태의 값 처리
    if (validSortField.includes('date') || validSortField.includes('created') || validSortField.includes('updated')) {
        if (typeof sortValue === 'string') {
            // 언더스코어를 하이픈으로 변경: 2025_03_29 → 2025-03-29
            const cleanDateString = sortValue.replace(/_/g, '-');
            const dateValue = new Date(cleanDateString).getTime();
            sortValue = isNaN(dateValue) ? null : dateValue;
        } else if (typeof sortValue !== 'number') {
            sortValue = null;
        }
    }

    return {sortValue, secondarySortValue};
}
