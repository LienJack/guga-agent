import type { WebSearchBackendResponse, WebSearchFormatOptions, WebSearchResultItem } from "./types";

export function formatWebSearchResult(response: WebSearchBackendResponse, options: WebSearchFormatOptions = {}): string {
  const lines = [
    `Web search results for "${response.query}" via ${response.provider}`,
    `Fetched: ${response.fetchedAt}`,
    `Results: ${response.results.length}`,
    ""
  ];

  for (const result of response.results) {
    lines.push(formatItem(result));
  }

  const content = lines.join("\n").trimEnd();
  return options.maxCharacters === undefined || content.length <= options.maxCharacters
    ? content
    : truncateWithNotice(content, options.maxCharacters);
}

function truncateWithNotice(content: string, maxCharacters: number): string {
  const omitted = content.length - maxCharacters;
  const notice = `\n\n[web_search formatter omitted ${omitted} characters before runtime budgeting]`;
  if (maxCharacters <= notice.length) {
    return content.slice(0, maxCharacters);
  }
  return `${content.slice(0, maxCharacters - notice.length).trimEnd()}${notice}`;
}

function formatItem(result: WebSearchResultItem): string {
  return [
    `${result.rank}. ${result.title}`,
    `URL: ${result.url}`,
    `Snippet: ${result.snippet}`,
    `Fetched: ${result.fetchedAt}`,
    ...(result.publishedAt ? [`Published: ${result.publishedAt}`] : []),
    ""
  ].join("\n");
}
