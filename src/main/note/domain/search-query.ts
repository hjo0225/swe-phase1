const MAX_KEYWORDS = 5;
const MAX_KEYWORD_LENGTH = 100;

/** 공백으로 나뉜 키워드의 AND 검색 (BR-NOTE-06). LIKE 이스케이프는 persistence 책임이다. */
export class SearchQuery {
  private constructor(readonly keywords: readonly string[]) {}

  static parse(raw: string): SearchQuery {
    const keywords = raw
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, MAX_KEYWORDS)
      .map((k) => k.slice(0, MAX_KEYWORD_LENGTH));
    return new SearchQuery(keywords);
  }

  isEmpty(): boolean {
    return this.keywords.length === 0;
  }
}
