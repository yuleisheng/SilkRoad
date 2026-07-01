const WEB_SEARCH_INTENT_PATTERN =
  /\b(today|current|latest|recent|news|search|web|internet|source|sources|cite|citation|lookup|look up|who is|what is|when did|where is|background)\b|最新|最近|今天|新闻|搜索|联网|网上|查一下|查找|来源|引用|资料|背景/i;

export function shouldUseWebSearch(query: string): boolean {
  return WEB_SEARCH_INTENT_PATTERN.test(query);
}
