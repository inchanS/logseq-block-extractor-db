import {BlockEntity, BlockUUIDTuple} from "@logseq/libs/dist/LSPlugin";
import {getBlockText} from "../utils/blockText";

// 키워드 배열에서 제외 키워드('-' 접두사)만 추출 (빈 문자열은 모든 블록을 제외시키므로 걸러냄)
function extractExcludeKeywords(keywords: string[]): string[] {
    return keywords
        .filter(keyword => keyword.startsWith('-'))
        .map(keyword => keyword.substring(1).toLowerCase())
        .filter(keyword => keyword.length > 0);
}

function isExcludedBlock(block: BlockEntity, excludeKeywords: string[]): boolean {
    if (excludeKeywords.length === 0) return false;
    const content = getBlockText(block).toLowerCase();
    return excludeKeywords.some(keyword => content.includes(keyword));
}

export function blockContainsKeywords(block: BlockEntity, keywords: string[], filterMode: 'and' | 'or' = 'or') {
    const text = getBlockText(block);
    if (!text) return false;

    const content = text.toLowerCase();

    // 포함 키워드와 제외 키워드 분리
    const includeKeywords = keywords.filter(keyword => !keyword.startsWith('-')).map(keyword => keyword.toLowerCase());
    const excludeKeywords = extractExcludeKeywords(keywords);

    // 제외 키워드가 하나라도 포함되어 있으면 바로 false 반환
    if (excludeKeywords.some(keyword => content.includes(keyword))) {
        return false;
    }

    // 포함 키워드에 대한 처리
    if (includeKeywords.length === 0) {
        // 포함 키워드가 없고 제외 키워드만 있는 경우, 제외 키워드가 없으면 true
        return true;
    }

    if (filterMode === 'or') {
        return includeKeywords.some(keyword => content.includes(keyword));
    } else { // and 방식
        return includeKeywords.every(keyword => content.includes(keyword));
    }
}

// 타입 가드 함수 정의
function isBlockEntity(item: BlockEntity | BlockUUIDTuple): item is BlockEntity {
    return typeof item === 'object' && item !== null && ('id' in item || 'uuid' in item);
}

// 제외 키워드에 걸리는 블록을 서브트리째 제거한다.
// 매칭된 블록의 자식들은 포함 키워드와 무관하게 유지되지만, 제외 키워드는 끝까지 전파되어야 한다.
function pruneExcludedSubtrees(block: BlockEntity, excludeKeywords: string[]): BlockEntity | null {
    if (!block) return null;
    if (isExcludedBlock(block, excludeKeywords)) return null;

    let children: BlockEntity[] = [];
    if (block.children && Array.isArray(block.children)) {
        children = block.children
            .filter(isBlockEntity)
            .map((child: BlockEntity) => pruneExcludedSubtrees(child, excludeKeywords))
            .filter((child): child is BlockEntity => child !== null);
    }

    return {...block, children};
}

export function filterBlocksByKeyword(block: BlockEntity, keywords: string[], filterMode: 'and' | 'or' = 'or'): BlockEntity | null {
    if (!block) return null;

    const excludeKeywords = extractExcludeKeywords(keywords);

    // 제외 키워드에 걸린 블록은 자식이 매칭되더라도 서브트리 전체를 제거
    if (isExcludedBlock(block, excludeKeywords)) {
        return null;
    }

    const contentIncludesKeyword: boolean = blockContainsKeywords(block, keywords, filterMode);

    if (contentIncludesKeyword) {
        // 매칭된 블록: 자식은 유지하되 제외 키워드에 걸린 서브트리는 걸러낸다
        return pruneExcludedSubtrees(block, excludeKeywords);
    } else {
        let filteredChildren: BlockEntity[] = [];
        if (block.children && Array.isArray(block.children)) {
            filteredChildren = block.children
                .filter(isBlockEntity)
                .map((child: BlockEntity) => filterBlocksByKeyword(child, keywords, filterMode))
                .filter((child): child is BlockEntity => child !== null);
        }

        if (filteredChildren.length > 0) {
            return {
                ...block,
                children: filteredChildren
            };
        } else {
            return null;
        }
    }
}
