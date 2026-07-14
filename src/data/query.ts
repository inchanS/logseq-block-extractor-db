import {PageEntity} from "@logseq/libs/dist/LSPlugin";

// 다이얼로그를 열 때마다 전체 그래프를 재조회하지 않도록 짧은 TTL 캐시 사용
const CACHE_TTL_MS = 60_000;
let pagesCache: { data: string[]; fetchedAt: number } | null = null;
let propertiesCache: { data: string[]; fetchedAt: number } | null = null;

// 정렬 필드로 항상 쓸 수 있는 시스템 필드 (DB 그래프의 :block/* 어트리뷰트 기반)
export const SYSTEM_SORT_FIELDS: string[] = ['filename', 'created-at', 'updated-at', 'journal-day', 'date'];

function pageDisplayName(page: PageEntity): string | null {
    const name = (page.title as string) || page.originalName || page.name;
    return name && typeof name === 'string' && name.trim() ? name : null;
}

export async function getAllPages(): Promise<string[]> {
    if (pagesCache && Date.now() - pagesCache.fetchedAt < CACHE_TTL_MS) {
        return pagesCache.data;
    }
    try {
        const pages: PageEntity[] | null = await logseq.Editor.getAllPages();
        if (!pages || !Array.isArray(pages)) {
            console.warn('No pages found or invalid response format');
            return [];
        }

        // DB 그래프의 내부(hidden/property) 페이지는 자동완성에서 제외.
        // class(태그) 페이지는 DB 버전에서 핵심적인 태그 대상이므로 포함한다.
        const pageNames = pages
            .filter(page => page.type !== 'hidden' && page.type !== 'property')
            .map(pageDisplayName)
            .filter((name): name is string => !!name)
            .sort((a, b) => a.localeCompare(b, 'ko', {numeric: true}));

        pagesCache = {data: pageNames, fetchedAt: Date.now()};
        return pageNames;
    } catch (error) {
        console.error('Error fetching pages:', error);
        logseq.UI.showMsg('An error occurred while fetching the page list.', 'warning');
        return [];
    }
}

export async function getAllPropertyNames(): Promise<string[]> {
    if (propertiesCache && Date.now() - propertiesCache.fetchedAt < CACHE_TTL_MS) {
        return propertiesCache.data;
    }
    try {
        // DB 그래프에서 프로퍼티는 일급 엔티티다. 전용 API로 목록을 가져온다.
        const properties: PageEntity[] | null = await logseq.Editor.getAllProperties();

        const names = new Set<string>();
        if (properties && Array.isArray(properties)) {
            for (const prop of properties) {
                const ident = (prop.ident as string) || '';
                // 사용자 정의(:user.property/*)와 플러그인 프로퍼티만 노출하고
                // 내부(:logseq.property/*) 프로퍼티는 제외한다
                if (ident && !ident.includes('user.property') && !ident.includes('plugin.property')) {
                    continue;
                }
                const name = pageDisplayName(prop);
                if (name) names.add(name);
            }
        }

        const finalProperties = [...SYSTEM_SORT_FIELDS, ...[...names].sort()];
        propertiesCache = {data: finalProperties, fetchedAt: Date.now()};
        return finalProperties;
    } catch (error) {
        console.error('Critical error in getAllPropertyNames:', error);
        logseq.UI.showMsg('An error occurred while fetching the property list.', 'error');
        return [...SYSTEM_SORT_FIELDS];
    }
}

// 태그로 입력된 이름을 페이지 엔티티로 해석 (대소문자 무시)
export async function resolveTagPage(primaryTag: string): Promise<PageEntity | null> {
    try {
        return await logseq.Editor.getPage(primaryTag);
    } catch (error) {
        console.error('Error resolving tag page:', error);
        return null;
    }
}

// DB 그래프에서 "태그를 참조하는 블록" 조회.
// - [[링크]] 참조는 :block/refs
// - #태그 는 :block/tags (DB 버전에서 태그는 일급 클래스 관계)
// 두 경우를 모두 포함한다. 페이지 엔티티(id)를 기준으로 조회하므로 이름 이스케이프가 필요 없다.
export async function getBlocksReferencingTag(tagPageId: number): Promise<any[][] | null> {
    const id = Math.trunc(tagPageId);
    return await logseq.DB.datascriptQuery(`
      [:find (pull ?b [:db/id :block/uuid :block/title :block/name
                       :block/created-at :block/updated-at :block/journal-day
                       {:block/page [:db/id :block/uuid :block/name :block/title
                                     :block/created-at :block/updated-at :block/journal-day]}])
       :where
       (or [?b :block/refs ${id}]
           [?b :block/tags ${id}])]
    `);
}

// 정렬 필드가 사용자 프로퍼티일 때 페이지 프로퍼티를 조회 (페이지별 캐시)
const pagePropsCache = new Map<string, Record<string, any>>();

export async function getPagePropertiesCached(pageUuid: string): Promise<Record<string, any>> {
    const cached = pagePropsCache.get(pageUuid);
    if (cached) return cached;
    try {
        // DB 그래프 전용 API: 프로퍼티를 원래 이름을 키로 하는 읽기 쉬운 형태로 반환
        const props = (await logseq.Editor.getPageProperties(pageUuid)) || {};
        pagePropsCache.set(pageUuid, props);
        return props;
    } catch (error) {
        console.warn('Failed to fetch page properties:', pageUuid, error);
        const empty = {};
        pagePropsCache.set(pageUuid, empty);
        return empty;
    }
}

export function clearPagePropsCache() {
    pagePropsCache.clear();
}
