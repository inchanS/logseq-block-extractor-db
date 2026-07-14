import {describe, expect, it} from 'vitest';
import {blockContainsKeywords, filterBlocksByKeyword} from '../src/core/filter';
import type {BlockEntity} from '@logseq/libs/dist/LSPlugin';

// DB 그래프의 getBlock 결과 형태(fullTitle)를 흉내낸다
const block = (text: string, children: BlockEntity[] = []): BlockEntity =>
    ({id: Math.floor(Math.random() * 1e9), uuid: crypto.randomUUID(), fullTitle: text, children} as unknown as BlockEntity);

describe('blockContainsKeywords', () => {
    it('빈 콘텐츠는 false', () => {
        expect(blockContainsKeywords(block(''), ['a'])).toBe(false);
    });

    it('or 모드: 키워드 중 하나만 포함해도 true', () => {
        expect(blockContainsKeywords(block('coding note'), ['coding', 'music'], 'or')).toBe(true);
        expect(blockContainsKeywords(block('travel log'), ['coding', 'music'], 'or')).toBe(false);
    });

    it('and 모드: 모든 키워드를 포함해야 true', () => {
        expect(blockContainsKeywords(block('coding music note'), ['coding', 'music'], 'and')).toBe(true);
        expect(blockContainsKeywords(block('coding note'), ['coding', 'music'], 'and')).toBe(false);
    });

    it('대소문자 무시', () => {
        expect(blockContainsKeywords(block('CODING Note'), ['coding'])).toBe(true);
    });

    it('- 접두사 키워드는 제외 조건으로 동작', () => {
        expect(blockContainsKeywords(block('coding draft'), ['coding', '-draft'])).toBe(false);
        expect(blockContainsKeywords(block('coding final'), ['coding', '-draft'])).toBe(true);
    });

    it('제외 키워드만 있는 경우: 제외 키워드가 없으면 true', () => {
        expect(blockContainsKeywords(block('final version'), ['-draft'])).toBe(true);
        expect(blockContainsKeywords(block('draft version'), ['-draft'])).toBe(false);
    });

    it('datascript 결과의 kebab-case(full-title) 키도 지원', () => {
        const kebab = {id: 1, uuid: 'u', 'full-title': 'coding note'} as unknown as BlockEntity;
        expect(blockContainsKeywords(kebab, ['coding'])).toBe(true);
    });

    it('레거시 content 키도 지원', () => {
        const legacy = {id: 1, uuid: 'u', content: 'coding note'} as unknown as BlockEntity;
        expect(blockContainsKeywords(legacy, ['coding'])).toBe(true);
    });
});

describe('filterBlocksByKeyword', () => {
    it('본문이 매칭되면 자식까지 그대로 유지', () => {
        const child = block('child content');
        const parent = block('coding note', [child]);

        const result = filterBlocksByKeyword(parent, ['coding']);
        expect(result).not.toBeNull();
        expect(result!.children).toHaveLength(1);
    });

    it('본문이 매칭되지 않아도 매칭되는 자식이 있으면 계층 유지', () => {
        const matching = block('coding tip');
        const nonMatching = block('random');
        const parent = block('daily note', [matching, nonMatching]);

        const result = filterBlocksByKeyword(parent, ['coding']);
        expect(result).not.toBeNull();
        expect(result!.children).toHaveLength(1);
        expect((result!.children![0] as any).fullTitle).toBe('coding tip');
    });

    it('본문·자식 모두 매칭되지 않으면 null', () => {
        const parent = block('daily note', [block('random')]);
        expect(filterBlocksByKeyword(parent, ['coding'])).toBeNull();
    });
});
