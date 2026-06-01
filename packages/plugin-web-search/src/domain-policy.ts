import type { DomainFilterResult, WebSearchResultItem, WebSearchValidationDiagnostic } from "./types";

export function normalizeDomainFilters(values: readonly string[]): { ok: true; domains: string[] } | { ok: false; diagnostics: WebSearchValidationDiagnostic[] } {
  const diagnostics: WebSearchValidationDiagnostic[] = [];
  const domains = new Set<string>();
  for (const [index, value] of values.entries()) {
    const normalized = normalizeDomainFilter(value);
    if (!normalized) {
      diagnostics.push({
        code: "WEB_SEARCH_DOMAIN_INVALID",
        message: `Invalid domain filter at index ${index}: ${value}`,
        path: `[${index}]`
      });
      continue;
    }
    domains.add(normalized);
  }
  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true, domains: [...domains].sort() };
}

export function normalizeDomainFilter(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase().replace(/^\*\./, "");
  if (!trimmed) {
    return undefined;
  }
  let hostname: string;
  try {
    hostname = trimmed.includes("://") ? new URL(trimmed).hostname : new URL(`https://${trimmed}`).hostname;
  } catch {
    return undefined;
  }
  const normalized = hostname.replace(/\.$/, "");
  return domainPattern.test(normalized) ? normalized : undefined;
}

export function applyDomainPolicy(
  results: readonly WebSearchResultItem[],
  options: { allowedDomains?: readonly string[]; blockedDomains?: readonly string[] }
): DomainFilterResult {
  const allowed = new Set(options.allowedDomains ?? []);
  const blocked = new Set(options.blockedDomains ?? []);
  const kept: WebSearchResultItem[] = [];
  const filtered: WebSearchResultItem[] = [];

  for (const result of results) {
    const host = hostForUrl(result.url);
    const allowedByPolicy = allowed.size === 0 || (host ? domainMatchesAny(host, allowed) : false);
    const blockedByPolicy = host ? domainMatchesAny(host, blocked) : true;
    if (allowedByPolicy && !blockedByPolicy) {
      kept.push(result);
    } else {
      filtered.push(result);
    }
  }

  return { results: kept, filtered };
}

export function hostForUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return undefined;
  }
}

export function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function domainMatchesAny(host: string, domains: ReadonlySet<string>): boolean {
  for (const domain of domains) {
    if (domainMatches(host, domain)) {
      return true;
    }
  }
  return false;
}

const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const domainPattern = new RegExp(`^${label}(?:\\.${label})+$`);
