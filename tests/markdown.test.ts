import {describe, expect, it} from 'vitest';
import {
    applyLinkReplacement,
    cleanLogseqProperties,
    convertPageBlocksToMarkdown,
    generateFilename,
    hasOrderedListProperty,
    renderBlockWithChildren
} from '../src/utils/markdown';
import type {BlockEntity} from '@logseq/libs/dist/LSPlugin';

const block = (text: string, children: BlockEntity[] = [], extra: Record<string, any> = {}): BlockEntity =>
    ({id: Math.floor(Math.random() * 1e9), uuid: 'test-uuid', fullTitle: text, children, ...extra} as unknown as BlockEntity);

describe('hasOrderedListProperty', () => {
    it('DB 그래프의 :logseq.property/order-list-type 프로퍼티 감지', () => {
        expect(hasOrderedListProperty(block('item', [], {'logseq.property/order-list-type': 'number'}))).toBe(true);
        expect(hasOrderedListProperty(block('item', [], {properties: {'order-list-type': 'number'}}))).toBe(true);
        expect(hasOrderedListProperty(block('item', [], {properties: {':logseq.property/order-list-type': 'number'}}))).toBe(true);
        expect(hasOrderedListProperty(block('plain item'))).toBe(false);
    });

    it('파일 그래프 문법(텍스트) 폴백 감지', () => {
        expect(hasOrderedListProperty('item\nlogseq.order-list-type:: number')).toBe(true);
        expect(hasOrderedListProperty('plain item')).toBe(false);
        expect(hasOrderedListProperty('')).toBe(false);
    });
});

describe('cleanLogseqProperties', () => {
    it('블록 프로퍼티 라인 제거', () => {
        expect(cleanLogseqProperties('content\nlogseq.order-list-type:: number')).toBe('content');
        expect(cleanLogseqProperties('id:: 1234\ncontent')).toBe('content');
    });

    it('일반 본문은 그대로 유지', () => {
        expect(cleanLogseqProperties('just text')).toBe('just text');
    });
});

describe('applyLinkReplacement', () => {
    it('[[링크]] 치환', () => {
        expect(applyLinkReplacement('see [[Some Page]]', {open: '**', close: '**'})).toBe('see **Some Page**');
    });

    it('DB 그래프의 #[[여러 단어 태그]] 치환 시 # 제거', () => {
        expect(applyLinkReplacement('tagged #[[My Tag]]', {open: '**', close: '**'})).toBe('tagged **My Tag**');
    });

    it('plain text 모드: 괄호 제거', () => {
        expect(applyLinkReplacement('see [[abc]]', {open: '', close: ''})).toBe('see abc');
    });

    it('치환 옵션 없으면 원문 유지', () => {
        expect(applyLinkReplacement('see [[abc]]')).toBe('see [[abc]]');
    });
});

describe('renderBlockWithChildren', () => {
    it('자식 블록은 탭 인덴트로 렌더링', () => {
        const tree = block('parent', [block('child', [block('grandchild')])]);
        const md = renderBlockWithChildren(tree);
        expect(md).toBe('- parent\n\t- child\n\t\t- grandchild\n');
    });

    it('순서형 리스트 블록은 1. 접두사 사용', () => {
        const tree = block('item', [], {'logseq.property/order-list-type': 'number'});
        expect(renderBlockWithChildren(tree)).toBe('1. item\n');
    });

    it('링크 치환 적용', () => {
        const tree = block('see [[Some Page]]');
        const md = renderBlockWithChildren(tree, {linkReplacement: {open: '**', close: '**'}});
        expect(md).toBe('- see **Some Page**\n');
    });

    it('maxDepth 초과 시 렌더링 중단', () => {
        const tree = block('parent', [block('child')]);
        expect(renderBlockWithChildren(tree, {maxDepth: 0})).toBe('- parent\n');
    });
});

describe('renderBlockWithParents (필터 결과 유지)', () => {
    it('showFullHierarchy에서 타겟 블록은 필터링된 자식을 렌더링 (재조회 원본이 아님)', async () => {
        // findRootParent가 logseq.Editor.getBlock으로 원본(필터링 안 된) 트리를 재조회하는 상황을 재현
        const unfilteredTree = block('parent', [block('keep me'), block('excluded draft')], {uuid: 'target-1'});
        (globalThis as any).logseq = {
            Editor: {getBlock: async () => unfilteredTree}
        };

        // 키워드 필터를 통과한 트리 (draft 자식이 제거된 상태)
        const filteredTarget = block('parent', [block('keep me')], {uuid: 'target-1'});

        const {renderBlockWithParents} = await import('../src/utils/markdown');
        const md = await renderBlockWithParents(filteredTarget, {showFullHierarchy: true});

        expect(md).toContain('keep me');
        expect(md).not.toContain('excluded draft');
    });
});

describe('convertPageBlocksToMarkdown', () => {
    it('페이지 본문도 동일하게 탭 인덴트로 렌더링', () => {
        const blocks = [block('top', [block('nested')])];
        expect(convertPageBlocksToMarkdown(blocks)).toBe('- top\n\t- nested\n');
    });

    it('빈 입력은 빈 문자열', () => {
        expect(convertPageBlocksToMarkdown([])).toBe('');
    });
});

describe('generateFilename', () => {
    it('기본 형식', () => {
        expect(generateFilename('tag', [], 'filename')).toBe('tag_all_blocks.md');
    });

    it('계층 페이지의 슬래시 등 금지 문자를 _로 치환', () => {
        expect(generateFilename('project/sub', [], 'filename')).toBe('project_sub_all_blocks.md');
        expect(generateFilename('a:b?c', [], 'filename')).toBe('a_b_c_all_blocks.md');
    });

    it('필터 키워드와 정렬 필드 반영', () => {
        expect(generateFilename('tag', ['kw1', 'kw2'], 'date')).toBe('tag_filtered_kw1_kw2_sortBy_date.md');
    });
});
