import {
    clearPagePropsCache,
    getBlocksReferencingTag,
    getPagePropertiesCached,
    resolveTagPage
} from '../data/query';
import {filterBlocksByKeyword} from './filter';
import {getSortValue, sortResults} from './sort';
import {downloadMarkdown, generateFilename, generateMarkdown} from '../utils/markdown';
import {validateAndSetDefaultSortField} from "../utils/validation";
import {BlockEntity, PageEntity} from "@logseq/libs/dist/LSPlugin";
import {ExtractedNode, LinkReplacement, PageMeta} from "../types";

type SortOption = 'ascending' | 'descending';

// datascript pull 결과(kebab-case 키)에서 페이지 메타 정보 정규화
function toPageMeta(p: any): PageMeta {
    return {
        id: p?.id,
        uuid: p?.uuid,
        name: p?.['title'] ?? p?.['original-name'] ?? p?.['name'] ?? 'Unnamed Page',
        createdAt: p?.['created-at'] ?? p?.['createdAt'] ?? null,
        updatedAt: p?.['updated-at'] ?? p?.['updatedAt'] ?? null,
        journalDay: p?.['journal-day'] ?? p?.['journalDay'] ?? null,
    };
}

// 정렬 필드가 페이지 프로퍼티 조회를 필요로 하는지
function needsPageProperties(validSortField: string): boolean {
    return !['filename', 'created-at', 'created_at', 'updated-at', 'updated_at',
        'journal-day', 'journal_day'].includes(validSortField);
}

export async function extractFilteredBlocks(
    primaryTag: string,
    filterKeywords: string[] = [],
    sortOrder: string = 'asc',
    sortField: string = 'filename',
    filterMode: 'and' | 'or' = 'or',
    linkReplacement?: LinkReplacement,
    showFullHierarchy: boolean = false,
    includeOriginalContent: boolean = false
) {
    try {
        const validSortField: string = await validateAndSetDefaultSortField(sortField);

        const hasFilter: boolean = filterKeywords && filterKeywords.length > 0;
        const filterText: string = hasFilter ? `with filter: ${filterKeywords.join(', ')}` : 'without filter (all blocks)';
        const sortText: SortOption = sortOrder === 'asc' ? 'ascending' : 'descending';
        const fieldText: string = validSortField === 'filename' ? 'filename' : `property: ${validSortField}`;

        logseq.UI.showMsg(`Extracting blocks for tag: ${primaryTag} ${filterText} (${sortText} by ${fieldText})`, 'info');

        // DB 그래프에서는 이름 대신 페이지 엔티티 id로 조회한다 (대소문자·이스케이프 문제 회피)
        const tagPage: PageEntity | null = await resolveTagPage(primaryTag);
        if (!tagPage || typeof tagPage.id !== 'number') {
            logseq.UI.showMsg(`Tag/page "${primaryTag}" not found in this graph`, 'warning');
            return;
        }

        const results: any[][] | null = await getBlocksReferencingTag(tagPage.id);

        // 사용자가 원본 포함 옵션을 선택했을 때만 태그 페이지 본문 트리를 가져온다
        let pageBlocksTree: BlockEntity[] | null = null;
        if (includeOriginalContent) {
            try {
                pageBlocksTree = await logseq.Editor.getPageBlocksTree(tagPage.uuid);
            } catch (e) {
                console.warn(`Failed to fetch page blocks for ${primaryTag}`, e);
            }
        }

        if (!results || results.length === 0) {
            logseq.UI.showMsg(`No blocks found referencing "${primaryTag}"`, 'warning');
            return;
        }

        console.log(`Found ${results.length} nodes referencing ${primaryTag}`);
        logseq.UI.showMsg(`Processing ${results.length} nodes...`, 'info');

        clearPagePropsCache();
        const wantsProps = needsPageProperties(validSortField);
        const filteredResults: ExtractedNode[] = [];

        // 블록마다 순차 await하면 대형 그래프에서 매우 느려지므로 배치 단위로 병렬 처리
        const CONCURRENCY = 10;

        for (let i = 0; i < results.length; i += CONCURRENCY) {
            const batch = results.slice(i, i + CONCURRENCY);

            const processed: (ExtractedNode | null)[] = await Promise.all(
                batch.map(async (result): Promise<ExtractedNode | null> => {
                    try {
                        const entity: any = Array.isArray(result) ? result[0] : result;

                        if (!entity || !entity.uuid) {
                            console.warn('Invalid entity found:', entity);
                            return null;
                        }

                        // 태그 페이지 자신은 결과에서 제외
                        if (entity.uuid === tagPage.uuid) return null;

                        // DB 그래프에서는 페이지도 태그(#Tag)될 수 있다.
                        // name 이 있으면 페이지 엔티티 → 페이지 본문 전체를 하나의 결과로 취급
                        const isPage = typeof entity.name === 'string';

                        let treeBlock: BlockEntity | null;
                        let pageMeta: PageMeta;

                        if (isPage) {
                            const tree = await logseq.Editor.getPageBlocksTree(entity.uuid);
                            pageMeta = toPageMeta(entity);
                            // 페이지를 가상 루트 블록으로 감싸서 기존 렌더링/필터 로직 재사용
                            treeBlock = {
                                uuid: entity.uuid,
                                fullTitle: pageMeta.name,
                                children: tree || [],
                            } as unknown as BlockEntity;
                        } else {
                            treeBlock = await logseq.Editor.getBlock(entity.uuid, {
                                includeChildren: true
                            });
                            pageMeta = toPageMeta(entity.page);
                        }

                        if (!treeBlock) return null;

                        const processedBlock: BlockEntity | null = hasFilter
                            ? filterBlocksByKeyword(treeBlock, filterKeywords, filterMode)
                            : treeBlock;

                        if (!processedBlock) return null;

                        const pageProps = (wantsProps && pageMeta.uuid)
                            ? await getPagePropertiesCached(pageMeta.uuid)
                            : null;

                        const {sortValue, secondarySortValue} = getSortValue(validSortField, pageMeta, pageProps);

                        return {
                            block: processedBlock,
                            pageMeta,
                            isPage,
                            sortValue,
                            secondarySortValue
                        };
                    } catch (blockError) {
                        console.error('Error processing entity:', blockError);
                        return null;
                    }
                })
            );

            for (const item of processed) {
                if (item) filteredResults.push(item);
            }
        }

        sortResults(filteredResults, sortOrder, validSortField);

        if (filteredResults.length === 0) {
            logseq.UI.showMsg("No blocks found matching the criteria.", 'warning');
            return;
        }

        const displayTag = (tagPage.title as string) || tagPage.originalName || primaryTag;

        const markdown: string = await generateMarkdown(
            displayTag,
            filterKeywords,
            validSortField,
            sortOrder,
            filteredResults,
            linkReplacement,
            showFullHierarchy,
            pageBlocksTree
        );

        const filename: string = generateFilename(displayTag, filterKeywords, validSortField);

        downloadMarkdown(markdown, filename);

        logseq.UI.showMsg(`Successfully extracted ${filteredResults.length} results!`, 'success');

    } catch (error: unknown) {
        console.error('Error extracting blocks:', error);
        if (error instanceof Error) {
            logseq.UI.showMsg(`Error: ${error.message}`, 'error');
        } else {
            logseq.UI.showMsg(`Error: ${String(error)}`, 'error');
        }
    }
}
