import {ExtractedNode, LinkReplacement} from "../types";
import {BlockEntity, BlockUUIDTuple} from "@logseq/libs/dist/LSPlugin";
import {getBlockText} from "./blockText";

// 블록이 순서형 리스트(numbered list)인지 확인.
// DB 그래프에서는 :logseq.property/order-list-type 프로퍼티로 저장되므로
// 직렬화 형태별 키를 모두 확인하고, 텍스트 문법(파일 그래프 잔재)도 함께 검사한다.
export function hasOrderedListProperty(block: BlockEntity | string): boolean {
    if (!block) return false;

    if (typeof block === 'string') {
        return /logseq\.order-list-type::\s*number/i.test(block);
    }

    const propCandidates = [
        (block as any)['logseq.property/order-list-type'],
        (block as any)[':logseq.property/order-list-type'],
        block.properties?.['order-list-type'],
        block.properties?.['logseq.property/order-list-type'],
        block.properties?.[':logseq.property/order-list-type'],
        block.properties?.['orderListType'],
    ];
    if (propCandidates.some(v => typeof v === 'string' && v.toLowerCase() === 'number')) {
        return true;
    }

    return /logseq\.order-list-type::\s*number/i.test(getBlockText(block));
}

// 파일 그래프 문법의 블록 프로퍼티 라인(예: id:: 1234)이 남아 있으면 제거.
// DB 그래프의 본문에는 원래 없지만, 마이그레이션된 텍스트에 남아 있을 수 있다.
export function cleanLogseqProperties(content: string): string {
    if (!content) return '';
    return content.replace(/^\s*[a-zA-Z0-9_.-]+::[^\n]*(\n|$)/gm, '').trim();
}

// [[링크]]와 #[[여러 단어 태그]]를 치환 문자열로 변환.
// DB 그래프의 full-title 에서 태그는 #태그 또는 #[[여러 단어]] 형태로 나타난다.
export function applyLinkReplacement(text: string, linkReplacement?: LinkReplacement): string {
    if (!linkReplacement) return text;
    return text
        .replace(/#\[\[([^\]]+)\]\]/g, `${linkReplacement.open}$1${linkReplacement.close}`)
        .replace(/\[\[([^\]]+)\]\]/g, `${linkReplacement.open}$1${linkReplacement.close}`);
}

function renderLine(block: BlockEntity, indent: number, linkReplacement?: LinkReplacement): string {
    const indentStr: string = '\t'.repeat(indent);
    const listPrefix = hasOrderedListProperty(block) ? '1. ' : '- ';

    let processedContent: string = cleanLogseqProperties(getBlockText(block));
    processedContent = applyLinkReplacement(processedContent, linkReplacement);

    if (processedContent.trim() === '') return '';
    return indentStr + listPrefix + processedContent + '\n';
}

export function renderBlockWithChildren(
    block: BlockEntity,
    options?: {
        indent?: number;
        maxDepth?: number;
        linkReplacement?: LinkReplacement;
    }
): string {
    const {indent = 0, maxDepth = 10, linkReplacement} = options || {};

    if (!block || indent > maxDepth) return '';

    let content: string = renderLine(block, indent, linkReplacement);

    if (block.children && Array.isArray(block.children) && block.children.length > 0) {
        block.children
            .filter(isBlockEntity)
            .forEach((child: BlockEntity) => {
                content += renderBlockWithChildren(child, {
                    indent: indent + 1,
                    maxDepth,
                    linkReplacement
                });
            });
    }

    return content;
}

export async function renderBlockWithParents(
    block: BlockEntity,
    options?: {
        indent?: number;
        maxDepth?: number;
        linkReplacement?: LinkReplacement;
        showFullHierarchy?: boolean;
    }
): Promise<string> {
    const {indent = 0, maxDepth = 10, linkReplacement, showFullHierarchy} = options || {};

    if (!showFullHierarchy) {
        return renderBlockWithChildren(block, {indent, maxDepth, linkReplacement});
    }

    // 최상위 부모 블록 찾기
    const rootBlock: BlockEntity = await findRootParent(block);

    // 타겟 블록까지의 전체 경로 구성
    const fullPath: BlockEntity[] = buildFullPath(rootBlock, block);

    // 경로를 따라 렌더링하되, 타겟 블록에서는 모든 하위 블록 포함
    return renderFullHierarchy(fullPath, block, {indent, maxDepth, linkReplacement});
}

// 타겟 블록까지의 전체 경로를 구성
// findRootParent가 includeChildren: true로 전체 트리를 이미 로드했으므로
// 블록별 API 재조회 없이 메모리 상의 트리를 탐색한다
function buildFullPath(rootBlock: BlockEntity, targetBlock: BlockEntity): BlockEntity[] {
    const path: BlockEntity[] = [];

    function findPath(currentBlock: BlockEntity): boolean {
        path.push(currentBlock);

        if (currentBlock.uuid === targetBlock.uuid) {
            return true;
        }

        if (currentBlock.children && Array.isArray(currentBlock.children)) {
            for (const childRef of currentBlock.children) {
                if (isBlockEntity(childRef) && findPath(childRef)) {
                    return true;
                }
            }
        }

        path.pop();
        return false;
    }

    findPath(rootBlock);
    return path;
}

// 전체 계층 렌더링
function renderFullHierarchy(
    path: BlockEntity[],
    targetBlock: BlockEntity,
    options: {
        indent?: number;
        maxDepth?: number;
        linkReplacement?: LinkReplacement;
    }
): string {
    const {indent = 0, maxDepth = 10, linkReplacement} = options;

    let content: string = '';

    for (let i = 0; i < path.length; i++) {
        const currentBlock: BlockEntity = path[i];
        const currentIndent: number = indent + i;

        if (currentIndent > maxDepth) break;

        content += renderLine(currentBlock, currentIndent, linkReplacement);

        // 타겟 블록에 도달하면 하위 블록 포함.
        // 이때 API로 재조회한 currentBlock(필터링 안 된 원본)이 아니라
        // 키워드 필터를 통과한 targetBlock의 자식을 렌더링해야 한다.
        if (currentBlock.uuid === targetBlock.uuid) {
            if (targetBlock.children && Array.isArray(targetBlock.children)) {
                targetBlock.children
                    .filter(isBlockEntity)
                    .forEach((child: BlockEntity) => {
                        content += renderBlockWithChildren(child, {
                            indent: currentIndent + 1,
                            maxDepth,
                            linkReplacement
                        });
                    });
            }
            break;
        }
    }

    return content;
}

// DB 그래프에서 페이지도 블록 엔티티이므로, 부모 체인을 따라가다
// 페이지 엔티티(name 속성 보유)를 만나면 그 직전 블록이 루트다.
async function findRootParent(block: BlockEntity): Promise<BlockEntity> {
    let currentBlock = block;

    // 현재 블록의 완전한 정보 먼저 로드
    try {
        const fullBlock = await logseq.Editor.getBlock(block.uuid, {includeChildren: true});
        if (fullBlock) {
            currentBlock = fullBlock;
        }
    } catch (error) {
        // 로드 실패 시 원본 사용
    }

    while (currentBlock.parent && currentBlock.parent.id) {
        try {
            const parentBlock = await logseq.Editor.getBlock(currentBlock.parent.id, {includeChildren: true});
            // 부모가 없거나 페이지 엔티티면 현재 블록이 최상위
            if (!parentBlock || typeof (parentBlock as any).name === 'string') {
                break;
            }
            currentBlock = parentBlock;
        } catch (error) {
            break;
        }
    }

    return currentBlock;
}

// 타입 가드 함수
function isBlockEntity(item: BlockEntity | BlockUUIDTuple): item is BlockEntity {
    return typeof item === 'object' && item !== null && ('id' in item || 'uuid' in item);
}

export function convertPageBlocksToMarkdown(
    blocks: BlockEntity[],
    indentLevel: number = 0,
    linkReplacement?: LinkReplacement
): string {
    if (!blocks || blocks.length === 0) return '';

    let result = '';

    for (const block of blocks) {
        if (isBlockEntity(block)) {
            result += renderLine(block, indentLevel, linkReplacement);

            if (block.children && Array.isArray(block.children) && block.children.length > 0) {
                const childBlocks = block.children.filter(isBlockEntity);
                result += convertPageBlocksToMarkdown(childBlocks, indentLevel + 1, linkReplacement);
            }
        }
    }
    return result;
}

export async function generateMarkdown(
    primaryTag: string,
    filterKeywords: string[],
    validSortField: string,
    sortOrder: string,
    filteredResults: ExtractedNode[],
    linkReplacement?: LinkReplacement,
    showFullHierarchy: boolean = false,
    pageBlocksTree?: BlockEntity[] | null
): Promise<string> {
    const hasFilter = filterKeywords && filterKeywords.length > 0;
    const sortText = sortOrder === 'asc' ? 'ascending' : 'descending';
    const fieldText = validSortField === 'filename' ? 'filename' : `property: ${validSortField}`;

    let markdown = `# Extracting reference blocks **${primaryTag}** \n\n`;
    markdown += `Search conditions:  \n\n`;
    markdown += `1. Blocks and pages that reference the tag "**${primaryTag}**"  \n`;

    if (hasFilter) {
        markdown += `2. Keep the hierarchy, but show all **"${filterKeywords.join(', ')}"** related blocks and their children  \n`;
    } else {
        markdown += `2. Show all blocks and their child blocks (no filter)  \n`;
    }

    markdown += `3. Sort by: **${fieldText}** (${sortText})  \n\n`;
    markdown += `A total of **${filteredResults.length} results** found  \n\n`;

    if (pageBlocksTree && pageBlocksTree.length > 0) {
        const formattedTagTitle = linkReplacement
            ? applyLinkReplacement(`[[${primaryTag}]]`, linkReplacement)
            : `[[${primaryTag}]]`;

        markdown += `### Content of ${formattedTagTitle}\n\n`;
        markdown += convertPageBlocksToMarkdown(pageBlocksTree, 0, linkReplacement);
        markdown += `\n---\n\n`;
    }

    for (let i = 0; i < filteredResults.length; i++) {
        const item = filteredResults[i];
        markdown += `## ${i + 1}. ${item.pageMeta.name}\n\n`;

        if (item.isPage) {
            // 페이지가 태그된 경우(DB 그래프의 객체/클래스 활용): 페이지 본문 전체를 렌더링
            markdown += renderBlockWithChildren(item.block, {linkReplacement});
        } else if (showFullHierarchy) {
            markdown += await renderBlockWithParents(item.block, {linkReplacement, showFullHierarchy});
        } else {
            markdown += renderBlockWithChildren(item.block, {linkReplacement});
        }

        markdown += "\n---\n\n";
    }

    return markdown;
}

export function downloadMarkdown(content: string, filename: string) {
    try {
        const blob = new Blob([content], {type: 'text/markdown;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`Downloaded: ${filename}`);
    } catch (error) {
        console.error('Error downloading file:', error);
        logseq.UI.showMsg('Error downloading file', 'error');
    }
}

export function generateFilename(primaryTag: string, filterKeywords: string[], validSortField: string) {
    // 계층 페이지(project/sub)의 '/' 등 파일명에 쓸 수 없는 문자를 '_'로 치환
    const safeTag = primaryTag.replace(/[\/\\:*?"<>|]/g, '_');
    const hasFilter = filterKeywords && filterKeywords.length > 0;
    const filterSuffix = hasFilter ? `_filtered_${filterKeywords.join('_').replace(/[^a-zA-Z0-9가-힣_]/g, '_')}` : '_all_blocks';
    const sortSuffix = validSortField !== 'filename' ? `_sortBy_${validSortField}` : '';
    return `${safeTag}${filterSuffix}${sortSuffix}.md`;
}
