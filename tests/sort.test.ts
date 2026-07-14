import {describe, expect, it} from 'vitest';
import {getSortValue, sortResults} from '../src/core/sort';
import type {ExtractedNode, PageMeta} from '../src/types';

const pageMeta = (name: string, extra: Partial<PageMeta> = {}): PageMeta =>
    ({name, createdAt: null, updatedAt: null, journalDay: null, ...extra});

const node = (name: string, sortValue: ExtractedNode['sortValue']): ExtractedNode =>
    ({
        block: {} as any,
        pageMeta: pageMeta(name),
        isPage: false,
        sortValue,
        secondarySortValue: name
    });

describe('getSortValue', () => {
    it('filename: 페이지 표시 이름 사용', () => {
        const {sortValue} = getSortValue('filename', pageMeta('My Page'), null);
        expect(sortValue).toBe('My Page');
    });

    it('created-at / updated-at: 페이지 메타의 타임스탬프 사용', () => {
        const meta = pageMeta('p', {createdAt: 111, updatedAt: 222});
        expect(getSortValue('created-at', meta, null).sortValue).toBe(111);
        expect(getSortValue('updated-at', meta, null).sortValue).toBe(222);
    });

    it('journal-day / date: 저널 페이지의 날짜 사용', () => {
        const meta = pageMeta('Jul 14th, 2026', {journalDay: 20260714});
        expect(getSortValue('journal-day', meta, null).sortValue).toBe(20260714);
        expect(getSortValue('date', meta, null).sortValue).toBe(20260714);
    });

    it('사용자 프로퍼티: 대소문자 무시 조회', () => {
        const {sortValue} = getSortValue('rating', pageMeta('p'), {Rating: 5});
        expect(sortValue).toBe(5);
    });

    it('node 타입 프로퍼티({title}) 값은 제목으로 정규화', () => {
        const {sortValue} = getSortValue('author', pageMeta('p'), {author: {title: 'Jane'}});
        expect(sortValue).toBe('Jane');
    });

    it('다중 값(배열)은 첫 요소 사용', () => {
        const {sortValue} = getSortValue('author', pageMeta('p'), {author: [{title: 'A'}, {title: 'B'}]});
        expect(sortValue).toBe('A');
    });

    it('date 계열 프로퍼티는 타임스탬프로 변환', () => {
        const {sortValue} = getSortValue('pubdate', pageMeta('p'), {pubdate: '2025_03_29'});
        expect(sortValue).toBe(new Date('2025-03-29').getTime());
    });

    it('없는 프로퍼티는 null', () => {
        const {sortValue} = getSortValue('missing', pageMeta('p'), {});
        expect(sortValue).toBeNull();
    });
});

describe('sortResults', () => {
    it('filename 오름차순 정렬', () => {
        const results = [node('b', 'b'), node('a', 'a'), node('c', 'c')];
        sortResults(results, 'asc', 'filename');
        expect(results.map(r => r.sortValue)).toEqual(['a', 'b', 'c']);
    });

    it('filename 내림차순 정렬', () => {
        const results = [node('b', 'b'), node('a', 'a'), node('c', 'c')];
        sortResults(results, 'desc', 'filename');
        expect(results.map(r => r.sortValue)).toEqual(['c', 'b', 'a']);
    });

    it('숫자 프로퍼티 정렬', () => {
        const results = [node('a', 3), node('b', 1), node('c', 2)];
        sortResults(results, 'asc', 'rating');
        expect(results.map(r => r.sortValue)).toEqual([1, 2, 3]);
    });

    it('null 값은 오름차순에서 앞으로', () => {
        const results = [node('a', 5), node('b', null)];
        sortResults(results, 'asc', 'rating');
        expect(results[0].sortValue).toBeNull();
    });

    it('null 값끼리는 페이지 이름으로 2차 정렬', () => {
        const results = [node('b', null), node('a', null)];
        sortResults(results, 'asc', 'rating');
        expect(results.map(r => r.secondarySortValue)).toEqual(['a', 'b']);
    });
});
