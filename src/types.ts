import {BlockEntity} from "@logseq/libs/dist/LSPlugin";

export interface LinkReplacement {
    open: string;
    close: string;
}

// 정렬 값: filename 정렬은 문자열, 프로퍼티 정렬은 숫자(타임스탬프)·문자열·null 모두 가능
export type SortValue = string | number | null;

// DB 그래프에서 결과 블록이 속한 페이지의 메타 정보
// (datascript pull 결과의 kebab-case 키를 정규화해 담는다)
export interface PageMeta {
    id?: number;
    uuid?: string;
    name: string;
    createdAt: number | null;
    updatedAt: number | null;
    journalDay: number | null;
}

export interface ExtractedNode {
    block: BlockEntity;
    pageMeta: PageMeta;
    // DB 그래프에서는 페이지 자체가 태그(#Tag)될 수 있으므로 페이지 결과를 구분
    isPage: boolean;
    sortValue: SortValue;
    secondarySortValue: string;
}
