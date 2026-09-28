const mangayomiSources = [{
  name: "TOTAL 토끼 만화",
  lang: "ko",
  baseUrl: "https://dc-toki-mangayomi-manga.pages.dev",
  apiUrl: "",
  iconUrl: "https://dc-toki-mangayomi-manga.pages.dev/icon/ko.total-toki-manga.png",
  typeSource: "single",
  itemType: 0,
  isNsfw: true,
  hasCloudflare: true,
  version: "0.1.13",
  dateFormat: "yyyy-MM-dd",
  dateFormatLocale: "ko_KR",
  pkgPath: "manga/src/ko/total_toki_manga.js"
}];

function dcResolveListCardManifest(data, scope, tab) {
  const source = data && typeof data === "object" ? data : {};
  const currentScope = String(scope || "default").trim().toLowerCase();
  const currentTab = String(tab || "all").trim().toLowerCase();
  const groupByScope = {
    xtoon: "manga", toon11: "manga", goodtoon: "manga", blacktoon: "manga", wolf_manga: "manga", wolf_webtoon: "manga",
    ani24: "media", anilife: "media", dc_iptv: "media", dc_live: "media", samsung_tv_plus: "media", linkkf_anime: "media", tvroom: "media",
    toki31_novel: "novel"
  };
  const currentGroup = groupByScope[currentScope] || "";
  const values = function(value) {
    if (Array.isArray(value)) return value.map(function(item) { return String(item || "").trim().toLowerCase(); }).filter(Boolean);
    const one = String(value || "").trim().toLowerCase();
    return one ? [one] : [];
  };
  let selected = null, selectedIndex = -1, selectedScore = -Infinity;
  const rules = Array.isArray(source.rules) ? source.rules : [];
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index];
    if (!rule || typeof rule !== "object" || rule.enabled === false) continue;
    const match = rule.match && typeof rule.match === "object" ? rule.match : {};
    const targets = values(rule.targets || rule.extensions || rule.scopes || match.targets || match.extensions || match.scopes);
    const groups = values(rule.groups || match.groups);
    const tabs = values(rule.tabs || rule.tab || match.tabs || match.tab);
    let targetScore = 0;
    if (targets.length) {
      if (targets.indexOf(currentScope + ":" + currentTab) >= 0) targetScore = 600;
      else if (targets.indexOf(currentScope) >= 0) targetScore = 500;
      else continue;
    } else if (groups.length) {
      if (!currentGroup || groups.indexOf(currentGroup) < 0) continue;
      targetScore = 300;
    }
    let tabScore = 0;
    if (tabs.length && tabs.indexOf("*") < 0 && tabs.indexOf("all") < 0 && tabs.indexOf("both") < 0) {
      if (tabs.indexOf(currentTab) < 0) continue;
      tabScore = 50;
    }
    const priority = Number(rule.priority) || 0;
    const score = priority * 10000 + targetScore + tabScore;
    if (score > selectedScore) { selected = rule; selectedIndex = index; selectedScore = score; }
  }
  const selectedCards = selected && Array.isArray(selected.cards) && selected.cards.length ? selected.cards : source.cards;
  const rootRotation = source.rotation && typeof source.rotation === "object" ? source.rotation : {};
  const ruleRotation = selected && selected.rotation && typeof selected.rotation === "object" ? selected.rotation : {};
  const revisionParts = [source.revision];
  if (selected) revisionParts.push(selected.revision, selected.id || ("rule-" + selectedIndex));
  return {
    cards: Array.isArray(selectedCards) ? selectedCards : [],
    name: String(selected && (selected.name || selected.title) || source.name || source.title || "").trim(),
    revision: revisionParts.map(function(value) { return String(value || "").trim(); }).filter(Boolean).join(":"),
    rotation: Object.assign({}, rootRotation, ruleRotation)
  };
}

async function dcOfficialListCardSystem(scope, tab, defaultName) {
  if (defaultName === undefined) { defaultName = tab; tab = "all"; }
  const assetBaseUrl = "https://dc-toki-mangayomi-novel.pages.dev";
  const manifestUrl = assetBaseUrl + "/assets/official-random-cards.json";
  let data = null;
  try {
    const response = await new Client({ persistentConnection: false, noProxy: true, timeout: 8, connectTimeout: 5 }).get(
      manifestUrl + "?card_manifest=" + Date.now(),
      { Accept: "application/json, text/plain, */*", Referer: assetBaseUrl + "/", "Cache-Control": "no-cache" }
    );
    if (response && response.statusCode >= 200 && response.statusCode < 300) data = JSON.parse(String(response.body || ""));
  } catch (_) {}
  const config = dcResolveListCardManifest(data, scope, tab);
  const revision = config.revision;
  let cards = config.cards.map(function(value) {
    const rawUrl = typeof value === "string" ? value : value && (value.imageUrl || value.image || value.url);
    let imageUrl = String(rawUrl || "").trim();
    if (imageUrl.startsWith("/")) imageUrl = assetBaseUrl + imageUrl;
    if (imageUrl.toLowerCase().indexOf("https://") !== 0) return null;
    if (revision) imageUrl += (imageUrl.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(revision);
    return { name: String(typeof value === "object" && value && (value.name || value.title) || config.name || defaultName || "오늘의 한 장").trim(), imageUrl: imageUrl };
  }).filter(Boolean);
  if (!cards.length) {
    cards = Array.from({ length: 20 }, function(_, offset) {
      return { name: defaultName || "오늘의 한 장", imageUrl: assetBaseUrl + "/card/shared-random/card-" + String(offset + 1).padStart(2, "0") + ".jpg" };
    });
  }
  const rotation = config.rotation;
  const holdMinutes = String(rotation.mode || "").toLowerCase() === "interval" ? Math.max(1, Number(rotation.intervalMinutes) || 60) : 0;
  const preferences = new SharedPreferences();
  const safeScope = String(scope || "default").replace(/[^a-z0-9_-]/gi, "_");
  const safeTab = String(tab || "all").replace(/[^a-z0-9_-]/gi, "_");
  const key = "dc_list_card_system_last_" + safeScope + "_" + safeTab;
  const timeKey = key + "_time";
  const revisionKey = key + "_revision";
  let previous = 0, previousAt = 0, previousRevision = "";
  try {
    previous = Number(preferences.getString(key, "0"));
    previousAt = Number(preferences.getString(timeKey, "0"));
    previousRevision = String(preferences.getString(revisionKey, "") || "");
  } catch (_) {}
  let index = previous;
  const keepPrevious = holdMinutes > 0 && previous >= 1 && previous <= cards.length && previousAt > 0 && Date.now() - previousAt < holdMinutes * 60 * 1000 && previousRevision === revision;
  if (!keepPrevious) {
    index = Math.floor(Math.random() * cards.length) + 1;
    const avoidImmediateRepeat = rotation.avoidImmediateRepeat !== false;
    if (avoidImmediateRepeat && cards.length > 1 && index === previous) index = index % cards.length + 1;
    try {
      preferences.setString(key, String(index));
      preferences.setString(timeKey, String(Date.now()));
      preferences.setString(revisionKey, revision);
    } catch (_) {}
  }
  return cards[Math.max(1, Math.min(cards.length, index || 1)) - 1];
}

async function dcOfficialEventCard() {
  const manifestUrl = "https://dc-toki-mangayomi-media.pages.dev/assets/official-event-card.json";
  try {
    const response = await new Client({ persistentConnection: false, noProxy: true, timeout: 8, connectTimeout: 5 }).get(
      manifestUrl + "?event_manifest=" + Date.now(),
      { Accept: "application/json, text/plain, */*", Referer: "https://dc-toki-mangayomi-media.pages.dev/" }
    );
    if (!response || response.statusCode < 200 || response.statusCode >= 300) return null;
    const data = JSON.parse(String(response.body || ""));
    if (!data || data.enabled !== true) return null;
    const now = Date.now();
    const startsAt = data.startsAt ? Date.parse(String(data.startsAt)) : null;
    const endsAt = data.endsAt ? Date.parse(String(data.endsAt)) : null;
    if (Number.isFinite(startsAt) && now < startsAt) return null;
    if (Number.isFinite(endsAt) && now >= endsAt) return null;
    let imageUrl = String(data.imageUrl || data.image || "").trim();
    if (imageUrl.toLowerCase().indexOf("https://") !== 0) return null;
    const revision = String(data.revision || "").trim();
    if (revision) imageUrl += (imageUrl.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(revision);
    return { name: String(data.name || data.title || "특별 이벤트").trim(), imageUrl: imageUrl };
  } catch (_) { return null; }
}

const dcTotalWorkMemory = {};
const dcTotalMappingShardMemory = {};

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.signalUrl = "https://wankyo83.github.io/tokki-traffic-light/domains.json";
    this.assetBaseUrl = "https://dc-toki-mangayomi-total-toki-manga-test.pages.dev";
    this.statusUrl = this.assetBaseUrl + "/status/status-latest.json";
    this.mappingUrl = this.assetBaseUrl + "/assets/total-manga-map.json";
    this.mappingShardBaseUrl = this.assetBaseUrl + "/assets/total-manga-map-shards";
    this.providers = {
      newtoki: { name: "Newtoki", fallbackBaseUrl: "https://newtoki1.org", pattern: /^https:\/\/(?:www\.)?newtoki\d+\.(?:org|com)\/?$/i },
      toki: { name: "Toki", fallbackBaseUrl: "https://toki31.com", pattern: /^https:\/\/(?:www\.)?toki\d+\.com\/?$/i },
      sbxh: { name: "SBXH", fallbackBaseUrl: "https://sbxh9.com", pattern: /^https:\/\/(?:www\.)?sbxh\d+\.com\/?$/i }
    };
    this.providerPreference = "total_toki_manga_provider_v1";
    this.autoProviderPreference = "total_toki_manga_auto_provider_enabled_v1";
    this.autoSelectedProviderPreference = "total_toki_manga_auto_selected_provider_v1";
    this.localHealthPreference = "total_toki_manga_local_health_v1";
    this.fallbackBaseUrl = this.providers.toki.fallbackBaseUrl;
    this.userAgent = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
    this.imageAccept = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
    this.weekdayCardBaseUrl = "https://dc-toki-mangayomi-manga.pages.dev/card/weekday-";
    this.popularRulePreference = "total_toki_manga_popular_rule_v1";
    this.latestRulePreference = "total_toki_manga_latest_rule_v1";
    this.pageSize = 24;
    this.requestSequence = 0;
    this.registryMemory = null;
    this.registryMemoryAt = 0;
    this.baseMemory = {};
    this.chapterRouteMemory = {};
    this.genres = ["전체", "순정", "판타지", "러브코미디", "드라마", "17", "학원", "라노벨", "개그", "액션", "백합", "일상", "SF", "이세계", "스릴러", "애니화", "전생", "스포츠", "TS", "소년", "먹방", "붕탁", "게임", "호러", "시대", "로맨스", "추리", "음악", "무협", "BL"];
    this.sections = [["업데이트", "updates"], ["만화", "ongoing"], ["완결", "completed"]];
    this.orders = [["최신순", "new"], ["신작순", "fresh"], ["북마크순", "hot"], ["조회순", "views"], ["평점순", "rating"], ["화수순", "episodes"]];
  }

  _text(value) { return value === null || value === undefined ? "" : String(value); }
  _trimSlash(value) { return this._text(value).trim().replace(/\/+$/, ""); }
  _origin(value) { const match = this._text(value).match(/^(https?:\/\/[^/]+)/i); return match ? match[1] : ""; }
  _relativePath(value) { let raw = this._text(value).trim(); if (/^https?:\/\//i.test(raw)) raw = raw.replace(/^https?:\/\/[^/]+/i, ""); if (!raw.startsWith("/")) raw = "/" + raw; return raw; }
  _canonicalPath(value) { return this._relativePath(value).split("#")[0].split("?")[0].replace(/\/+$/, ""); }
  _preference(key, fallback) { try { const value = new SharedPreferences().get(key); return value === null || value === undefined ? fallback : value; } catch (_) { return fallback; } }
  _preferenceString(key, fallback) { try { const value = new SharedPreferences().getString(key, fallback); return value === null || value === undefined ? fallback : this._text(value); } catch (_) { return fallback; } }
  _boolPreference(key, fallback) { const value = this._preference(key, fallback); if (value === true || value === false) return value; const normalized = this._text(value).trim().toLowerCase(); if (["true", "1", "yes", "on"].indexOf(normalized) >= 0) return true; if (["false", "0", "no", "off"].indexOf(normalized) >= 0) return false; return fallback === true; }
  _manualProvider() { const value = this._text(this._preference(this.providerPreference, "toki")).trim().toLowerCase(); return this.providers[value] ? value : "toki"; }
  _autoProviderEnabled() { return this._boolPreference(this.autoProviderPreference, true); }
  _selectedProvider() { if (!this._autoProviderEnabled()) return this._manualProvider(); const automatic = this._text(this._preferenceString(this.autoSelectedProviderPreference, "")).trim().toLowerCase(); return this.providers[automatic] ? automatic : this._manualProvider(); }
  _providerName(provider) { return this.providers[provider] ? this.providers[provider].name : provider; }
  _connectionLabel(provider) { return (this._autoProviderEnabled() ? "자동 연결: " : "수동 연결: ") + this._providerName(provider || this._selectedProvider()); }
  _isAllowedBaseUrl(value, provider) { const config = this.providers[provider || this._selectedProvider()]; return !!config && config.pattern.test(this._text(value).trim()); }
  _readLocalHealth() { try { const raw = this._preferenceString(this.localHealthPreference, ""); const value = raw ? JSON.parse(raw) : {}; return value && typeof value === "object" ? value : {}; } catch (_) { return {}; } }
  _writeLocalHealth(value) { try { new SharedPreferences().setString(this.localHealthPreference, JSON.stringify(value || {})); } catch (_) {} }
  _localRecord(provider) { const health = this._readLocalHealth(); return health[provider] && typeof health[provider] === "object" ? health[provider] : {}; }
  _recordLocalResult(provider, kind, ok, elapsedMs, error, missing) {
    if (!this.providers[provider] || ["list", "viewer"].indexOf(kind) < 0) return;
    const health = this._readLocalHealth();
    const current = health[provider] && typeof health[provider] === "object" ? health[provider] : {};
    const now = Date.now();
    current[kind] = { ok: ok === true, missing: missing === true, elapsedMs: Math.max(0, Number(elapsedMs) || 0), checkedAt: new Date(now).toISOString(), error: this._text(error && (error.message || error)).slice(0, 240) };
    current[kind + "BlockedUntil"] = ok === true || missing === true ? 0 : now + 30 * 60 * 1000;
    health[provider] = current;
    this._writeLocalHealth(health);
  }
  _localBlockedUntil(provider) { const record = this._localRecord(provider); return Math.max(Number(record.listBlockedUntil || 0), Number(record.viewerBlockedUntil || 0)); }

  async _resolveBaseUrl(requestedProvider) {
    const provider = this.providers[requestedProvider] ? requestedProvider : this._selectedProvider();
    const config = this.providers[provider];
    const manual = this._text(this._preference("total_toki_manga_" + provider + "_domain_url", "")).trim();
    if (this._isAllowedBaseUrl(manual, provider)) return this._trimSlash(manual);
    const cached = this.baseMemory[provider];
    if (cached && Date.now() - cached.at < 10 * 60 * 1000 && this._isAllowedBaseUrl(cached.base, provider)) return cached.base;
    try {
      const response = await new Client({ persistentConnection: false, noProxy: true, timeout: 8, connectTimeout: 5 }).get(this.signalUrl, { "User-Agent": this.userAgent, "Accept": "application/json", "Cache-Control": "no-cache" });
      if (response.statusCode >= 200 && response.statusCode < 300) {
        const data = JSON.parse(response.body);
        const candidate = data && data.domains && data.domains[provider] ? data.domains[provider].baseUrl : "";
        if (this._isAllowedBaseUrl(candidate, provider)) {
          const base = this._trimSlash(candidate);
          this.baseMemory[provider] = { base: base, at: Date.now() };
          return base;
        }
      }
    } catch (_) {}
    this.baseMemory[provider] = { base: config.fallbackBaseUrl, at: Date.now() };
    return config.fallbackBaseUrl;
  }

  _requestHeaders(url, extraHeaders) {
    const headers = { "User-Agent": this.userAgent, "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "Referer": (this._origin(url) || this.fallbackBaseUrl) + "/" };
    if (extraHeaders) Object.assign(headers, extraHeaders);
    return headers;
  }

  _failureCode(response, cause) {
    const status = response && response.statusCode ? Number(response.statusCode) : 0;
    if (status) return "HTTP" + status;
    const text = this._text(cause && (cause.message || cause));
    if (/10054|ECONNRESET|connection reset/i.test(text)) return "RESET";
    if (/timed?\s*out|timeout/i.test(text)) return "TIMEOUT";
    if (/certificate|handshake|TLS|SSL/i.test(text)) return "TLS";
    return "NETWORK";
  }

  async _pause(milliseconds) { if (typeof setTimeout === "function") await new Promise(function(resolve) { setTimeout(resolve, milliseconds); }); }

  async _requestText(method, url, extraHeaders, body, stage) {
    const headers = this._requestHeaders(url, extraHeaders);
    const transports = [{ name: "RHTTP", options: { persistentConnection: false, noProxy: true, timeout: 25, connectTimeout: 10 } }, { name: "DART", options: { useDartHttpClient: true, persistentConnection: false } }];
    const diagnostics = [];
    for (const transport of transports) {
      try {
        const client = new Client(transport.options);
        const response = method === "POST" ? await client.post(url, headers, body) : await client.get(url, headers);
        if (response.statusCode >= 200 && response.statusCode < 300) return response.body;
        diagnostics.push(transport.name + "=" + this._failureCode(response, null));
        if ([401, 403, 429].indexOf(Number(response.statusCode)) >= 0) break;
      } catch (error) {
        diagnostics.push(transport.name + "=" + this._failureCode(null, error));
        if (transport.name === "RHTTP") await this._pause(180);
      }
    }
    throw new Error("toki 만화 " + (stage || "요청") + " 연결에 실패했습니다. 진단: " + diagnostics.join(","));
  }

  async _getText(url, extraHeaders, stage) { return await this._requestText("GET", url, extraHeaders, undefined, stage); }
  async _getJson(url, stage) { const body = await this._getText(url, { "Accept": "application/json" }, stage); try { return JSON.parse(body); } catch (_) { throw new Error("toki 만화 " + stage + " 응답 형식이 올바르지 않습니다."); } }
  async _getJsonFast(url, stage) { let response; try { response = await new Client({ persistentConnection: false, noProxy: true, timeout: 8, connectTimeout: 4 }).get(url, this._requestHeaders(url, { "Accept": "application/json" })); } catch (error) { throw new Error("toki 만화 " + stage + " 연결 실패: " + this._failureCode(null, error)); } if (!response || response.statusCode < 200 || response.statusCode >= 300) throw new Error("toki 만화 " + stage + " 연결 실패: " + this._failureCode(response, null)); try { return JSON.parse(this._text(response.body)); } catch (_) { throw new Error("toki 만화 " + stage + " 응답 형식이 올바르지 않습니다."); } }
  _withQuery(base, path, pairs) { const query = []; for (const pair of pairs) if (pair && pair.length > 1 && this._text(pair[1]) !== "") query.push(encodeURIComponent(pair[0]) + "=" + encodeURIComponent(this._text(pair[1]))); return this._trimSlash(base) + path + (query.length ? "?" + query.join("&") : ""); }

  _defaultPopularRule() { return { section: "ongoing", genre: "", order: "hot" }; }
  _defaultLatestRule() { return { section: "updates", genre: "", order: "new" }; }
  _allowed(value, pairs, fallback) { const text = this._text(value); return pairs.some(function(pair) { return pair[1] === text; }) ? text : fallback; }
  _normalizeRule(rule, fallback) {
    const source = rule || fallback || this._defaultLatestRule();
    const section = this._allowed(source.section, this.sections, "ongoing");
    let order = this._allowed(source.order, this.orders, "new");
    if (section === "updates" && ["new", "views", "episodes"].indexOf(order) < 0) order = "new";
    return {
      section: section,
      genre: this.genres.indexOf(this._text(source.genre)) >= 0 && this._text(source.genre) !== "전체" ? this._text(source.genre) : "",
      order: order
    };
  }
  _encodeRule(rule) { const r = this._normalizeRule(rule, this._defaultLatestRule()); return [r.section, r.genre, r.order].join("|"); }
  _decodeRule(value, fallback) { const parts = this._text(value).split("|"); return parts.length === 3 ? this._normalizeRule({ section: parts[0], genre: parts[1], order: parts[2] }, fallback) : this._normalizeRule(fallback, this._defaultLatestRule()); }
  _tabRule(key, fallback) { const encoded = this._preferenceString(key, ""); return encoded ? this._decodeRule(encoded, fallback) : this._normalizeRule(fallback, this._defaultLatestRule()); }
  _nameFor(pairs, value, fallback) { const found = pairs.find(function(pair) { return pair[1] === value; }); return found ? found[0] : fallback; }
  _ruleSummary(rule) { const r = this._normalizeRule(rule, this._defaultLatestRule()); return [this._nameFor(this.sections, r.section, "만화"), r.genre || "전체", this._nameFor(this.orders, r.order, "최신순")].join(" + "); }

  _identityText(value) { return this._normalizeSearch(value).toLowerCase().replace(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3]/gi, ""); }
  _hash32(value, seed) { let hash = Number(seed) | 0; const text = this._text(value); for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, "0"); }
  _provisionalTotalId(title) { const key = this._identityText(title); return "tm_" + this._hash32(key, 0x811c9dc5) + this._hash32(key, 0x9e3779b9); }
  _workCacheKey(totalId) { return "total_toki_manga_work_v1_" + this._text(totalId).replace(/[^a-z0-9_-]/gi, "_"); }
  _readWorkCache(totalId) {
    const key = this._text(totalId).toLowerCase();
    if (dcTotalWorkMemory[key] && typeof dcTotalWorkMemory[key] === "object") return dcTotalWorkMemory[key];
    try {
      const raw = this._preferenceString(this._workCacheKey(key), "");
      const value = raw ? JSON.parse(raw) : null;
      if (value && typeof value === "object") { value.totalId = key; value.providers = value.providers && typeof value.providers === "object" ? value.providers : {}; dcTotalWorkMemory[key] = value; return value; }
    } catch (_) {}
    const empty = { totalId: key, title: "", providers: {} };
    dcTotalWorkMemory[key] = empty;
    return empty;
  }
  _writeWorkCache(value) {
    if (!value || typeof value !== "object") return;
    const key = this._text(value.totalId).toLowerCase();
    value.totalId = key;
    value.providers = value.providers && typeof value.providers === "object" ? value.providers : {};
    dcTotalWorkMemory[key] = value;
    try { new SharedPreferences().setString(this._workCacheKey(key), JSON.stringify(value)); } catch (_) {}
  }
  _rememberWork(provider, sourceWorkId, title, assignedTotalId) {
    const totalId = assignedTotalId || this._provisionalTotalId(title);
    const cached = this._readWorkCache(totalId);
    cached.totalId = totalId;
    if (!cached.title) cached.title = this._normalizeSearch(title);
    if (!cached.providers || typeof cached.providers !== "object") cached.providers = {};
    cached.providers[provider] = this._text(sourceWorkId).trim();
    this._writeWorkCache(cached);
    return totalId;
  }
  _totalWorkPath(totalId) { return "/__total_toki_manga__/work/" + encodeURIComponent(totalId); }
  _totalChapterPath(totalId, chapterKey) { return this._totalWorkPath(totalId) + "/chapter/" + encodeURIComponent(chapterKey); }
  _parseTotalPath(value) { const path = this._canonicalPath(value); const match = path.match(/^\/__total_toki_manga__\/work\/(tm_[a-f0-9]{16})(?:\/chapter\/(tc_[a-f0-9]{16}))?$/i); return match ? { totalId: match[1].toLowerCase(), chapterKey: match[2] ? match[2].toLowerCase() : "" } : null; }
  _legacyChapterKey(name) { const key = this._identityText(name); return "tc_" + this._hash32(key, 0x811c9dc5) + this._hash32(key, 0x7f4a7c15); }
  _chapterToken(value) { const path = this._canonicalPath(value); const match = path.match(/^\/manhwa\/[^/]+\/([^/]+)$/i); if (!match) return ""; try { return decodeURIComponent(match[1]).trim(); } catch (_) { return match[1].trim(); } }
  _chapterKey(episode) {
    const value = episode && typeof episode === "object" ? episode : { name: episode, url: "" };
    const token = this._chapterToken(value.url);
    const key = token ? "route:" + token.toLowerCase() : "name:" + this._identityText(value.name);
    return "tc_" + this._hash32(key, 0x811c9dc5) + this._hash32(key, 0x7f4a7c15);
  }
  _chapterRouteCacheKey(totalId) { return "total_toki_manga_chapter_routes_v2_" + this._text(totalId).replace(/[^a-z0-9_-]/gi, "_"); }
  _readChapterRoutes(totalId) {
    if (this.chapterRouteMemory[totalId]) return this.chapterRouteMemory[totalId];
    try {
      const raw = this._preferenceString(this._chapterRouteCacheKey(totalId), "");
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.schemaVersion === 2 && parsed.routes && typeof parsed.routes === "object") { this.chapterRouteMemory[totalId] = parsed; return parsed; }
    } catch (_) {}
    const empty = { schemaVersion: 2, routes: {} };
    this.chapterRouteMemory[totalId] = empty;
    return empty;
  }
  _writeChapterRoutes(totalId, cache) { this.chapterRouteMemory[totalId] = cache; try { new SharedPreferences().setString(this._chapterRouteCacheKey(totalId), JSON.stringify(cache)); } catch (_) {} }
  _rememberChapterRoutes(totalId, provider, episodes) {
    const cache = this._readChapterRoutes(totalId);
    let changed = false;
    for (const episode of episodes || []) {
      const token = this._chapterToken(episode.url);
      if (!token) continue;
      const canonicalKey = this._chapterKey(episode);
      const aliases = [canonicalKey, this._legacyChapterKey(episode.name)];
      for (const key of aliases) {
        const previous = cache.routes[key] && typeof cache.routes[key] === "object" ? cache.routes[key] : { token: token, canonicalKey: canonicalKey, providers: {} };
        if (!previous.providers || typeof previous.providers !== "object") previous.providers = {};
        if (previous.token !== token || previous.canonicalKey !== canonicalKey || previous.providers[provider] !== episode.url) changed = true;
        previous.token = token;
        previous.canonicalKey = canonicalKey;
        previous.providers[provider] = episode.url;
        cache.routes[key] = previous;
      }
    }
    if (changed) this._writeChapterRoutes(totalId, cache);
    return cache;
  }
  _chapterRoute(totalId, chapterKey) { const cache = this._readChapterRoutes(totalId); return cache.routes[chapterKey] || null; }
  async _providerChapterPath(totalId, provider, route) {
    const direct = route && route.providers && this._text(route.providers[provider]).trim();
    if (direct) return this._canonicalPath(direct);
    const token = this._text(route && route.token).trim();
    if (!token) return "";
    const resolved = await this._providerWork(totalId, provider);
    return "/manhwa/" + encodeURIComponent(resolved.sourceWorkId) + "/" + encodeURIComponent(token);
  }
  async _recoverChapterRoute(totalId, chapterKey, currentProvider) {
    const order = [currentProvider].concat(Object.keys(this.providers).filter(function(value) { return value !== currentProvider; }));
    for (const provider of order) {
      try {
        await this._loadProviderDetail(totalId, provider);
        const recovered = this._chapterRoute(totalId, chapterKey);
        if (recovered) return recovered;
      } catch (_) {}
    }
    return null;
  }
  async _mappingRegistry() {
    if (this.registryMemory && Date.now() - this.registryMemoryAt < 5 * 60 * 1000) return this.registryMemory;
    const preferences = new SharedPreferences();
    const cacheKey = "total_toki_manga_mapping_cache_v1", timeKey = cacheKey + "_time";
    const cached = this._preferenceString(cacheKey, "");
    const cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000) { try { this.registryMemory = JSON.parse(cached); this.registryMemoryAt = cachedAt; return this.registryMemory; } catch (_) {} }
    try {
      const body = await this._getText(this.mappingUrl + "?mapping=" + Date.now(), { Accept: "application/json", "Cache-Control": "no-cache" }, "토탈 작품 연결표");
      const data = JSON.parse(body);
      if (data && typeof data === "object") { const now = Date.now(); this.registryMemory = data; this.registryMemoryAt = now; try { preferences.setString(cacheKey, JSON.stringify(data)); preferences.setString(timeKey, String(now)); } catch (_) {} return data; }
    } catch (_) {}
    if (cached) { try { this.registryMemory = JSON.parse(cached); this.registryMemoryAt = Date.now(); return this.registryMemory; } catch (_) {} }
    this.registryMemory = { works: {}, providerIndex: {}, titleIndex: {} }; this.registryMemoryAt = Date.now(); return this.registryMemory;
  }
  async _mappingShard(totalId, registry) {
    const match = this._text(totalId).toLowerCase().match(/^tm_([a-f0-9]{2})[a-f0-9]{14}$/i);
    if (!match) return { works: {} };
    const prefix = match[1].toLowerCase();
    const revision = this._text(registry && registry.revision).trim();
    const memory = dcTotalMappingShardMemory[prefix];
    if (memory && memory.data && memory.revision === revision && Date.now() - memory.at < 6 * 60 * 60 * 1000) return memory.data;
    const preferences = new SharedPreferences();
    const cacheKey = "total_toki_manga_mapping_shard_v1_" + prefix;
    const timeKey = cacheKey + "_time";
    const cached = this._preferenceString(cacheKey, "");
    const cachedAt = Number(this._preferenceString(timeKey, "0"));
    let cachedData = null;
    if (cached) { try { cachedData = JSON.parse(cached); } catch (_) {} }
    if (cachedData && this._text(cachedData.revision).trim() === revision && cachedAt > 0 && Date.now() - cachedAt < 6 * 60 * 60 * 1000) {
      dcTotalMappingShardMemory[prefix] = { data: cachedData, revision: revision, at: cachedAt };
      return cachedData;
    }
    try {
      const body = await this._getText(this.mappingShardBaseUrl + "/" + prefix + ".json?mapping_shard=" + Date.now(), { Accept: "application/json", "Cache-Control": "no-cache" }, "토탈 작품 연결 조각");
      const data = JSON.parse(body);
      if (data && typeof data === "object" && data.works && typeof data.works === "object" && this._text(data.prefix).toLowerCase() === prefix) {
        const now = Date.now();
        dcTotalMappingShardMemory[prefix] = { data: data, revision: this._text(data.revision).trim(), at: now };
        try { preferences.setString(cacheKey, JSON.stringify(data)); preferences.setString(timeKey, String(now)); } catch (_) {}
        return data;
      }
    } catch (_) {}
    if (cachedData && cachedData.works && typeof cachedData.works === "object") {
      dcTotalMappingShardMemory[prefix] = { data: cachedData, revision: this._text(cachedData.revision).trim(), at: Date.now() };
      return cachedData;
    }
    return { works: {} };
  }
  async _resolveWorkMapping(totalId) {
    const local = this._readWorkCache(totalId);
    const registry = await this._mappingRegistry();
    const remote = registry && registry.works && registry.works[totalId] && typeof registry.works[totalId] === "object" ? registry.works[totalId] : null;
    const shard = remote ? null : await this._mappingShard(totalId, registry);
    const sharded = shard && shard.works && shard.works[totalId] && typeof shard.works[totalId] === "object" ? shard.works[totalId] : null;
    const merged = { totalId: totalId, title: this._text(remote && remote.title || sharded && sharded.title || local.title).trim(), providers: {} };
    Object.assign(merged.providers, local.providers || {}, sharded && sharded.providers || {}, remote && remote.providers || {});
    if (Object.keys(merged.providers).length) this._writeWorkCache(merged);
    return merged;
  }
  async _providerWork(totalId, provider) {
    const mapping = await this._resolveWorkMapping(totalId);
    let sourceWorkId = this._text(mapping.providers[provider]).trim();
    let assumed = false;
    if (!sourceWorkId) {
      const known = Object.keys(mapping.providers).map((key) => this._text(mapping.providers[key]).trim()).find(Boolean);
      if (known) { sourceWorkId = known; assumed = true; }
    }
    if (!sourceWorkId) throw new Error("이 토탈 작품의 " + this._providerName(provider) + " 연결 정보가 없습니다.");
    return { totalId: totalId, title: mapping.title, provider: provider, sourceWorkId: sourceWorkId, assumed: assumed };
  }

  _registryTotalId(registry, provider, sourceWorkId, title) {
    const index = registry && registry.providerIndex && registry.providerIndex[provider];
    const byProvider = index && this._text(index[this._text(sourceWorkId).trim()]).trim();
    if (/^tm_[a-f0-9]{16}$/i.test(byProvider)) return byProvider.toLowerCase();
    const titleIndex = registry && registry.titleIndex;
    const byTitle = titleIndex && this._text(titleIndex[this._identityText(title)]).trim();
    return /^tm_[a-f0-9]{16}$/i.test(byTitle) ? byTitle.toLowerCase() : this._provisionalTotalId(title);
  }
  _workItem(work, provider, registry) {
    const name = this._text(work.title || work.workTitle).trim();
    const sourceWorkId = this._text(work.sourceWorkId).trim();
    const totalId = this._rememberWork(provider, sourceWorkId, name, this._registryTotalId(registry, provider, sourceWorkId, name));
    return { name: name, link: this._totalWorkPath(totalId), imageUrl: this._text(work.thumbnailUrl).trim(), author: this._text(work.author).trim() };
  }

  async _regularList(page, rule, requestedProvider, fast) {
    const r = this._normalizeRule(rule, this._defaultLatestRule());
    const provider = this.providers[requestedProvider] ? requestedProvider : this._selectedProvider();
    const base = await this._resolveBaseUrl(provider);
    const registry = await this._mappingRegistry();
    const requestUrl = this._withQuery(base, "/api/manhwa-list", [["status", r.section === "completed" ? "completed" : "ongoing"], ["g", r.genre], ["sort", r.order === "new" ? "" : r.order], ["page", Math.max(1, Number(page) || 1)], ["pageSize", this.pageSize], ["withTotal", "1"]]);
    const data = fast === true ? await this._getJsonFast(requestUrl, "목록") : await this._getJson(requestUrl, "목록");
    if (!data || !Array.isArray(data.works)) throw new Error("toki 만화 목록 데이터가 비어 있습니다.");
    const seen = {};
    const list = [];
    for (const work of data.works) {
      const item = this._workItem(work, provider, registry);
      if (!item.name || !this._parseTotalPath(item.link) || seen[item.link]) continue;
      seen[item.link] = true;
      list.push(item);
    }
    return { list: list, hasNextPage: data.hasMore === true };
  }

  async _updatesList(page, rule, requestedProvider, fast) {
    const r = this._normalizeRule(rule, this._defaultLatestRule());
    const provider = this.providers[requestedProvider] ? requestedProvider : this._selectedProvider();
    const base = await this._resolveBaseUrl(provider);
    const registry = await this._mappingRegistry();
    const requestUrl = this._withQuery(base, "/api/manhwa-updates", [["page", Math.max(1, Number(page) || 1)]]);
    const data = fast === true ? await this._getJsonFast(requestUrl, "업데이트 목록") : await this._getJson(requestUrl, "업데이트 목록");
    if (!data || !Array.isArray(data.cards)) throw new Error("toki 만화 업데이트 목록이 비어 있습니다.");
    let cards = data.cards.slice();
    if (r.genre) cards = cards.filter(function(card) { return ("," + String(card.genre || "") + ",").indexOf("," + r.genre + ",") >= 0; });
    if (r.order === "hot" || r.order === "views") cards.sort(function(a, b) { return Number(b.totalViews || 0) - Number(a.totalViews || 0); });
    else if (r.order === "episodes") cards.sort(function(a, b) { return Number(b.entryEpisodeNumber || 0) - Number(a.entryEpisodeNumber || 0); });
    else cards.sort(function(a, b) { return Date.parse(b.registeredAtIso || 0) - Date.parse(a.registeredAtIso || 0); });
    const seen = {};
    const list = [];
    for (const card of cards) { const item = this._workItem(card, provider, registry); if (item.name && !seen[item.link]) { seen[item.link] = true; list.push(item); } }
    return { list: list, hasNextPage: Number(data.page || page) < Number(data.totalPages || 1) };
  }

  async _pagedList(page, rule, requestedProvider, fast) { const r = this._normalizeRule(rule, this._defaultLatestRule()); return r.section === "updates" ? await this._updatesList(page, r, requestedProvider, fast) : await this._regularList(page, r, requestedProvider, fast); }
  _koreaWeekday() { const day = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay(); return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day]; }
  _weekdayCardInfo(slug) { const names = { monday: "월요일", tuesday: "화요일", wednesday: "수요일", thursday: "목요일", friday: "금요일", saturday: "토요일", sunday: "일요일" }; const value = names[slug] ? slug : this._koreaWeekday(); return { name: names[value], slug: value }; }
  _driveDirect(url, image) { const value = this._text(url).trim(); const match = value.match(/drive\.google\.com\/file\/d\/([^/]+)/i); return match ? "https://drive.google.com/uc?export=" + (image ? "view" : "download") + "&id=" + match[1] : value; }
  async _customCardUrl(day) {
    const source = this._text(this._preference("total_toki_manga_custom_card_json_url", "")).trim();
    if (!source) return "";
    const preferences = new SharedPreferences();
    const cacheKey = "total_toki_manga_custom_card_cache", sourceKey = cacheKey + "_source", timeKey = cacheKey + "_time";
    let data = null, cached = "";
    if (this._preferenceString(sourceKey, "") === source) cached = this._preferenceString(cacheKey, "");
    const cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000) { try { data = JSON.parse(cached); } catch (_) {} }
    if (!data) {
      try {
        const direct = this._driveDirect(source, false), join = direct.indexOf("?") >= 0 ? "&" : "?";
        data = JSON.parse(await this._getText(direct + join + "card_json=" + Date.now(), { Accept: "application/json", "Cache-Control": "no-cache" }, "커스텀 목록 카드"));
        preferences.setString(cacheKey, JSON.stringify(data)); preferences.setString(sourceKey, source); preferences.setString(timeKey, String(Date.now()));
      } catch (_) { if (cached) { try { data = JSON.parse(cached); } catch (_) {} } }
    }
    if (!data || typeof data !== "object") return "";
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const dayIndex = Math.max(0, days.indexOf(day));
    const cards = data.cards;
    const value = Array.isArray(cards) && cards.length ? cards[dayIndex % cards.length] : cards && typeof cards === "object" ? cards[day] : data.default || data.card;
    let imageUrl = this._driveDirect(typeof value === "string" ? value : value && (value.imageUrl || value.image || value.url), true);
    if (imageUrl.toLowerCase().indexOf("https://") !== 0) return "";
    const revision = this._text(data.revision).trim();
    if (revision) imageUrl += (imageUrl.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(revision);
    return imageUrl;
  }
  async _tabCard(tab) {
    const currentTab = tab === "latest" ? "latest" : tab === "popular" ? "popular" : "all";
    const info = this._weekdayCardInfo(this._koreaWeekday());
    const customSource = this._text(this._preference("total_toki_manga_custom_card_json_url", "")).trim();
    const customImage = await this._customCardUrl(info.slug);
    const event = customSource ? null : await dcOfficialEventCard();
    const official = customImage || event ? null : await dcOfficialListCardSystem("total_toki_manga", currentTab, "오늘의 만화");
    return { name: customImage ? info.name : event ? event.name : official.name, link: "/__total_toki_manga_card__/" + info.slug + "/" + currentTab, imageUrl: customImage || (event && event.imageUrl) || official.imageUrl };
  }
  _statusColor(value) { const color = this._text(value).trim().toLowerCase(); return ["blue", "yellow", "red", "gray"].indexOf(color) >= 0 ? color : "gray"; }
  async _statusSnapshot() {
    const preferences = new SharedPreferences();
    const cacheKey = "total_toki_manga_status_cache_v1", timeKey = cacheKey + "_time";
    let cached = this._preferenceString(cacheKey, "");
    try {
      const response = await new Client({ persistentConnection: false, noProxy: true, timeout: 8, connectTimeout: 5 }).get(this.statusUrl + "?status=" + Date.now(), { Accept: "application/json", "Cache-Control": "no-cache" });
      if (response && response.statusCode >= 200 && response.statusCode < 300) {
        const data = JSON.parse(this._text(response.body));
        preferences.setString(cacheKey, JSON.stringify(data)); preferences.setString(timeKey, String(Date.now()));
        const generatedAt = Date.parse(this._text(data && data.generatedAt));
        const stale = !Number.isFinite(generatedAt) || Date.now() - generatedAt > 25 * 60 * 1000;
        return { data: data, stale: stale, error: stale ? "상태 갱신이 25분 이상 지연됐습니다." : "" };
      }
    } catch (error) { if (!cached) return { data: null, stale: true, error: this._text(error && (error.message || error)) }; }
    if (cached) { try { return { data: JSON.parse(cached), stale: true, error: "" }; } catch (_) {} }
    return { data: null, stale: true, error: "상태 정보를 아직 받지 못했습니다." };
  }
  _mangaStatusSites(snapshot) {
    const defaults = ["newtoki", "toki", "sbxh"].map((key) => ({ siteKey: key, siteName: this._providerName(key), color: "gray", level: "paused", label: "확인 불가", failedStage: "상태 수신", error: "NAS 상태 정보가 없습니다.", lastSuccessAt: null, checkedAt: null }));
    const cards = snapshot && snapshot.data && Array.isArray(snapshot.data.cards) ? snapshot.data.cards : [];
    const card = cards.find((value) => value && value.id === "total_manga");
    if (!card || !Array.isArray(card.sites)) return defaults;
    const fullSites = snapshot && snapshot.data && Array.isArray(snapshot.data.sites) ? snapshot.data.sites : [];
    return defaults.map((fallback) => {
      const found = card.sites.find((value) => value && value.siteKey === fallback.siteKey);
      if (!found) return fallback;
      const full = fullSites.find((value) => value && value.key === fallback.siteKey) || {};
      const category = full.categories && full.categories.manga || {};
      const failureCounts = [full.root, category.list, category.deep].map((value) => Number(value && value.consecutiveFailures) || 0);
      const responseSeconds = Number(category.list && category.list.responseSeconds);
      return Object.assign({}, fallback, { baseUrl: full.baseUrl || found.baseUrl, consecutiveFailures: Math.max.apply(Math, failureCounts), responseSeconds: Number.isFinite(responseSeconds) ? responseSeconds : null }, found, { color: this._statusColor(found.color) });
    });
  }
  _nasProviderOrder(sites) {
    const current = this._selectedProvider();
    const ranks = { blue: 4, yellow: 3, gray: 2, red: 1 };
    const order = ["newtoki", "toki", "sbxh"];
    const available = (sites || []).filter((site) => this.providers[site && site.siteKey]);
    available.sort((left, right) => {
      const color = (ranks[this._statusColor(right.color)] || 0) - (ranks[this._statusColor(left.color)] || 0);
      if (color) return color;
      const failures = Number(left.consecutiveFailures || 0) - Number(right.consecutiveFailures || 0);
      if (failures) return failures;
      const leftSeconds = left.responseSeconds !== null && left.responseSeconds !== "" && Number.isFinite(Number(left.responseSeconds)) ? Number(left.responseSeconds) : Number.POSITIVE_INFINITY;
      const rightSeconds = right.responseSeconds !== null && right.responseSeconds !== "" && Number.isFinite(Number(right.responseSeconds)) ? Number(right.responseSeconds) : Number.POSITIVE_INFINITY;
      if (leftSeconds !== rightSeconds) return leftSeconds - rightSeconds;
      if (left.siteKey === current) return -1;
      if (right.siteKey === current) return 1;
      return order.indexOf(left.siteKey) - order.indexOf(right.siteKey);
    });
    return available.length ? available.map((site) => site.siteKey) : [current].concat(order.filter((provider) => provider !== current));
  }
  _providerOrder(sites) {
    const now = Date.now();
    const nasOrder = this._nasProviderOrder(sites);
    const siteByKey = {}; for (const site of sites || []) if (site && site.siteKey) siteByKey[site.siteKey] = site;
    const localPreferred = nasOrder.filter((provider) => {
      const record = this._localRecord(provider);
      const checkedAt = Date.parse(this._text(record.list && record.list.checkedAt));
      const nasColor = this._statusColor(siteByKey[provider] && siteByKey[provider].color);
      return record.list && record.list.ok === true && Number.isFinite(checkedAt) && now - checkedAt < 6 * 60 * 60 * 1000 && this._localBlockedUntil(provider) <= now && nasColor !== "red";
    }).sort((left, right) => Date.parse(this._text(this._localRecord(right).list.checkedAt)) - Date.parse(this._text(this._localRecord(left).list.checkedAt)));
    const combined = localPreferred.concat(nasOrder.filter((provider) => localPreferred.indexOf(provider) < 0));
    const ready = combined.filter((provider) => this._localBlockedUntil(provider) <= now);
    const blocked = combined.filter((provider) => this._localBlockedUntil(provider) > now);
    return ready.concat(blocked);
  }
  async _refreshAutoProviderForList() {
    if (!this._autoProviderEnabled()) return { order: [this._manualProvider()], snapshot: null };
    const snapshot = await this._statusSnapshot();
    return { order: this._providerOrder(this._mangaStatusSites(snapshot)), snapshot: snapshot };
  }
  _localStatusText(value, label) {
    if (!value || !value.checkedAt) return label + ": 아직 측정 안 함";
    const elapsed = Number(value.elapsedMs || 0) / 1000;
    if (value.missing === true) return label + ": 해당 회차 없음 · " + this._formatKoreaTime(value.checkedAt);
    const state = value.ok === true ? (elapsed > 3 ? "지연" : "정상") : "실패";
    const suffix = value.ok === true ? " " + elapsed.toFixed(1) + "초" : value.error ? " · " + value.error : "";
    return label + ": " + state + suffix + " · " + this._formatKoreaTime(value.checkedAt);
  }
  _applyLocalStatus(sites) {
    const health = this._readLocalHealth();
    const now = Date.now();
    return (sites || []).map((site) => {
      const item = Object.assign({}, site);
      const record = health[item.siteKey] && typeof health[item.siteKey] === "object" ? health[item.siteKey] : {};
      item.localList = record.list || null;
      item.localViewer = record.viewer || null;
      item.nasColor = item.color;
      item.nasLabel = item.label;
      const checkedAt = Date.parse(this._text(item.localList && item.localList.checkedAt));
      if (item.localList && Number.isFinite(checkedAt) && now - checkedAt < 30 * 60 * 1000) {
        item.color = item.localList.ok === true ? (Number(item.localList.elapsedMs || 0) <= 3000 ? "blue" : "yellow") : "red";
        item.label = item.localList.ok === true ? (item.color === "blue" ? "내 기기 정상" : "내 기기 지연") : "내 기기 접속 실패";
      }
      return item;
    });
  }
  async _statusCard(localFailure, suppliedSnapshot) {
    const snapshot = suppliedSnapshot || await this._statusSnapshot();
    const sites = this._applyLocalStatus(this._mangaStatusSites(snapshot));
    if (localFailure) { const selected = this._selectedProvider(); const item = sites.find((value) => value.siteKey === selected); if (item) { item.color = "red"; item.level = "outage"; item.label = "현재 기기 목록 실패"; item.failedStage = "작품 목록"; item.error = this._text(localFailure && (localFailure.message || localFailure)).slice(0, 300); item.checkedAt = new Date().toISOString(); } }
    const colors = {}; for (const site of sites) colors[site.siteKey] = this._statusColor(site.color);
    const imageUrl = this.assetBaseUrl + "/card/status/manga-" + colors.newtoki + "-" + colors.toki + "-" + colors.sbxh + ".webp?v=small-orb-1";
    return { name: this._connectionLabel(this._selectedProvider()) + (localFailure ? " · 목록 오류" : ""), link: "/__total_toki_manga_status__/manga", imageUrl: imageUrl, _snapshot: snapshot, _sites: sites };
  }
  _statusMarker(color) { return { blue: "🔵", yellow: "🟡", red: "🔴", gray: "⚪" }[this._statusColor(color)] || "⚪"; }
  _formatKoreaTime(value) { const timestamp = Date.parse(this._text(value)); if (!Number.isFinite(timestamp)) return "기록 없음"; const date = new Date(timestamp + 9 * 60 * 60 * 1000); const pad = (number) => String(number).padStart(2, "0"); return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate()) + " " + pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes()) + ":" + pad(date.getUTCSeconds()) + " KST"; }
  _statusEpisodes(card) {
    const selected = this._selectedProvider();
    return (card._sites || []).map((site) => {
      const chosen = site.siteKey === selected ? " · 현재 선택" : "";
      const details = [
        this._localStatusText(site.localList, "내 기기 목록"),
        this._localStatusText(site.localViewer, "내 기기 최근 뷰어"),
        "NAS 상태 " + (site.nasLabel || site.label || site.nasColor || site.color),
        "실패 단계 " + (site.failedStage || "없음"),
        "오류 " + (site.error || "없음"),
        "연속 실패 " + this._text(site.consecutiveFailures === undefined ? 0 : site.consecutiveFailures) + "회",
        "마지막 정상 " + this._formatKoreaTime(site.lastSuccessAt),
        "마지막 검사 " + this._formatKoreaTime(site.checkedAt)
      ];
      const checkedAt = Date.parse(site.checkedAt || "");
      return {
        name: this._statusMarker(site.color) + " " + site.siteName + " · " + (site.label || site.color) + chosen,
        url: "/__total_toki_manga_status__/manga/site/" + encodeURIComponent(site.siteKey),
        dateUpload: String(Number.isFinite(checkedAt) ? checkedAt : Date.now()),
        scanlator: site.siteKey === selected ? this._connectionLabel(selected) : "NAS 토탈 검사기",
        description: details.join(" | "),
        _statusImageUrl: card.imageUrl
      };
    });
  }
  async _autoPagedList(page, rule, order) {
    const errors = [];
    for (const provider of order || []) {
      if (!this.providers[provider]) continue;
      const started = Date.now();
      try {
        const result = await this._pagedList(page, rule, provider, true);
        if (!result || !Array.isArray(result.list) || !result.list.length) throw new Error(this._providerName(provider) + " 작품 목록이 비어 있습니다.");
        this._recordLocalResult(provider, "list", true, Date.now() - started, "", false);
        new SharedPreferences().setString(this.autoSelectedProviderPreference, provider);
        return result;
      } catch (error) {
        this._recordLocalResult(provider, "list", false, Date.now() - started, error, false);
        errors.push(this._providerName(provider) + "=" + this._text(error && (error.message || error)));
      }
    }
    throw new Error("이 기기에서 연결 가능한 토끼를 찾지 못했습니다. " + errors.join(" | "));
  }
  async _tabResult(page, rule, tab, autoContext) {
    if (Number(page) !== 1) return await this._pagedList(page, rule);
    const first = await this._tabCard(tab);
    const started = Date.now();
    try {
      const result = this._autoProviderEnabled()
        ? await this._autoPagedList(page, rule, autoContext && autoContext.order)
        : await this._pagedList(page, rule, this._manualProvider(), false);
      if (!this._autoProviderEnabled()) this._recordLocalResult(this._manualProvider(), "list", true, Date.now() - started, "", false);
      const second = await this._statusCard(null, autoContext && autoContext.snapshot);
      return { list: [first, second].concat(result.list || []), hasNextPage: result.hasNextPage === true };
    } catch (error) {
      if (!this._autoProviderEnabled()) this._recordLocalResult(this._manualProvider(), "list", false, Date.now() - started, error, false);
      return { list: [first, await this._statusCard(error, autoContext && autoContext.snapshot)], hasNextPage: false };
    }
  }
  async getPopular(page) { const refreshed = Number(page) === 1 ? await this._refreshAutoProviderForList() : null; return await this._tabResult(page, this._tabRule(this.popularRulePreference, this._defaultPopularRule()), "popular", refreshed); }
  async getLatestUpdates(page) { const refreshed = Number(page) === 1 ? await this._refreshAutoProviderForList() : null; return await this._tabResult(page, this._tabRule(this.latestRulePreference, this._defaultLatestRule()), "latest", refreshed); }

  _normalizeSearch(value) { let text = this._text(value); try { text = text.normalize("NFKC"); } catch (_) {} return text.trim().replace(/\s+/g, " "); }
  _searchKey(value) { return this._normalizeSearch(value).toLowerCase().replace(/[\s\u00a0\u3000,\.\-()\[\]{}]+/g, ""); }
  _searchChunks(value) { const key = this._searchKey(value).replace(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3]/gi, ""); const result = []; for (const width of [3, 2]) { if (key.length < width) continue; for (let i = 0; i <= key.length - width && result.length < 5; i++) if (result.indexOf(key.slice(i, i + width)) < 0) result.push(key.slice(i, i + width)); } return result; }
  _parseSearch(document, provider, registry) {
    const list = [];
    const seen = {};
    for (const card of document.select('a.card[href^="/manhwa/"]')) {
      const path = this._canonicalPath(card.attr("href"));
      const titleNode = card.selectFirst(".subject");
      const image = card.selectFirst("img");
      const name = this._text(titleNode ? titleNode.text : "").trim();
      if (!name || !/^\/manhwa\/[^/]+$/.test(path) || seen[path]) continue;
      seen[path] = true;
      list.push(this._workItem({ title: name, sourceWorkId: path.split("/").pop(), thumbnailUrl: this._text(image ? image.attr("src") : "").trim() }, provider, registry));
    }
    return { list: list, hasNextPage: document.select("a.pg_next,.pagination li.active + li a").length > 0 };
  }
  _parseLegacySearch(document, provider, registry) {
    const list = [], seen = {};
    for (const row of document.select("#webtoon-list-all > li")) {
      const link = row.selectFirst('a[href^="/manhwa/"]');
      const path = this._canonicalPath(link ? link.attr("href") : "");
      const titleNode = row.selectFirst("span.title");
      const image = row.selectFirst("img.theme-thumb-img");
      const name = this._text(titleNode ? titleNode.text : "").trim();
      if (!name || !/^\/manhwa\/\d+$/.test(path) || seen[path]) continue;
      seen[path] = true;
      list.push(this._workItem({ title: name, sourceWorkId: path.split("/").pop(), thumbnailUrl: this._text(image ? image.attr("data-src") || image.attr("src") : "").trim() }, provider, registry));
    }
    return { list: list, hasNextPage: document.select("a.pg_next,.pagination li.active + li a").length > 0 };
  }
  async _searchRemote(base, provider, query, page, field) {
    const registry = await this._mappingRegistry();
    if (provider === "newtoki") {
      const key = field === "author" ? "author" : "stx";
      const url = this._withQuery(base, "/manhwa", [["kind", "manhwa"], ["sod", "desc"], ["sst", "as_update"], [key, query], ["page", Number(page) > 1 ? page : ""]]);
      return this._parseLegacySearch(new Document(await this._getText(url, null, "Newtoki 검색")), provider, registry);
    }
    const url = this._withQuery(base, "/search", [["q", query], ["kind", "manhwa"], ["field", field], ["match", "contains"], ["page", Number(page) > 1 ? page : ""]]);
    return this._parseSearch(new Document(await this._getText(url, null, "검색")), provider, registry);
  }
  _filterValue(filters, type, fallback) { if (!Array.isArray(filters)) return fallback; for (const filter of filters) { if (!filter || filter.type !== type || !Array.isArray(filter.values)) continue; const option = filter.values[Number(filter.state) || 0]; return option && option.value !== undefined ? this._text(option.value) : fallback; } return fallback; }
  _filterRule(filters) {
    const unset = "__unset__";
    const section = this._filterValue(filters, "section", unset);
    const genre = this._filterValue(filters, "genre", unset);
    const order = this._filterValue(filters, "order", unset);
    if (section === unset && genre === unset && order === unset) return null;
    return this._normalizeRule({ section: section === unset ? "ongoing" : section, genre: genre === unset ? "" : genre, order: order === unset ? "new" : order }, this._defaultLatestRule());
  }
  _applyTabRuleAction(page, filters, rule) {
    if (Number(page) !== 1) return;
    const action = Number(this._filterValue(filters, "tabRuleAction", "0"));
    const preferences = new SharedPreferences();
    if (action === 1) preferences.setString(this.popularRulePreference, this._encodeRule(rule));
    else if (action === 2) preferences.setString(this.latestRulePreference, this._encodeRule(rule));
    else if (action === 3) preferences.setString(this.popularRulePreference, "");
    else if (action === 4) preferences.setString(this.latestRulePreference, "");
    else if (action === 5) { preferences.setString(this.popularRulePreference, ""); preferences.setString(this.latestRulePreference, ""); }
  }

  async search(query, page, filters) {
    const normalized = this._normalizeSearch(query);
    if (normalized) {
      const provider = this._selectedProvider();
      const base = await this._resolveBaseUrl(provider);
      const wanted = this._searchKey(normalized);
      const seen = {};
      const list = [];
      let hasNextPage = false;
      const collect = function(result) { hasNextPage = hasNextPage || result.hasNextPage; for (const item of result.list) if (!seen[item.link]) { seen[item.link] = true; list.push(item); } };
      collect(await this._searchRemote(base, provider, normalized, page, "title"));
      collect(await this._searchRemote(base, provider, normalized, page, "author"));
      let filtered = list.filter((item) => this._searchKey(item.name).indexOf(wanted) >= 0);
      if (!filtered.length && Number(page) === 1) {
        for (const chunk of this._searchChunks(normalized)) { collect(await this._searchRemote(base, provider, chunk, 1, "title")); if (list.some((item) => this._searchKey(item.name).indexOf(wanted) >= 0)) break; }
        filtered = list.filter((item) => this._searchKey(item.name).indexOf(wanted) >= 0);
      }
      return { list: filtered.length ? filtered : list, hasNextPage: hasNextPage };
    }
    const action = Number(this._filterValue(filters, "tabRuleAction", "0"));
    let rule = this._filterRule(filters);
    if (!rule && action >= 3 && action <= 5) rule = action === 3 ? this._defaultPopularRule() : this._defaultLatestRule();
    if (!rule) throw new Error("필터에서 만화·장르·정렬 중 사용할 조건을 선택하세요.");
    this._applyTabRuleAction(page, filters, rule);
    return await this._pagedList(page, rule);
  }

  _decodeFlightHtml(raw) { return this._text(raw).replace(/<script[^>]*>/gi, "").replace(/<\/script>/gi, "").replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">").replace(/\\u0026/gi, "&").replace(/\\u0027/gi, "'").replace(/\\\"/g, '"'); }
  _chapterDate(value) { const match = this._text(value).trim().match(/^(?:(\d{2,4})[.\/-])?(\d{1,2})[.\/-](\d{1,2})$/); if (!match) return "0"; const year = match[1] ? (Number(match[1]) < 100 ? 2000 + Number(match[1]) : Number(match[1])) : new Date().getFullYear(); return String(Date.UTC(year, Number(match[2]) - 1, Number(match[3])) - 9 * 60 * 60 * 1000); }

  _episodePageCount(document) {
    let maximum = 1;
    for (const node of document.select('a[href*="epage="]')) {
      const match = this._text(node.attr("href")).match(/[?&]epage=(\d+)/i);
      if (match) maximum = Math.max(maximum, Number(match[1]) || 1);
    }
    return maximum;
  }

  _collectEpisodes(document, path, episodes, seen) {
    for (const link of document.select('a.ep-row-v2-link[href^="/manhwa/"]')) {
      const chapterPath = this._canonicalPath(link.attr("href"));
      if (!chapterPath.startsWith(path + "/") || seen[chapterPath]) continue;
      const nameNode = link.selectFirst(".ep-row-v2-title strong");
      const subNode = link.selectFirst(".ep-row-v2-title .sub");
      const dateNode = link.selectFirst(".ep-row-v2-date");
      const strongName = this._text(nameNode ? nameNode.text : "").trim();
      const subName = this._text(subNode ? subNode.text : "").trim();
      const escapedStrong = strongName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const subEndsWithStrong = !!strongName && !!subName && new RegExp(escapedStrong + "$").test(subName);
      const name = subName && !subEndsWithStrong ? subName : strongName;
      if (!name) continue;
      seen[chapterPath] = true;
      episodes.push({ name: name, url: chapterPath, dateUpload: this._chapterDate(dateNode ? dateNode.text : "") });
    }
  }

  _collectLegacyEpisodes(document, path, episodes, seen) {
    for (const row of document.select("div.serial-list ul.list-body > li.list-item")) {
      const link = row.selectFirst("a.item-subject");
      const chapterPath = this._canonicalPath(link ? link.attr("href") : "");
      if (!chapterPath.startsWith(path + "/") || seen[chapterPath]) continue;
      const name = this._text(link ? link.text : "").trim();
      if (!name) continue;
      const dateNode = row.selectFirst("div.wr-date");
      seen[chapterPath] = true;
      episodes.push({ name: name, url: chapterPath, dateUpload: this._chapterDate(dateNode ? dateNode.text : "") });
    }
  }

  async _loadNewtokiDetail(resolved, base, path, firstDocument) {
    const titleNode = firstDocument.selectFirst(".theme-detail-title-line");
    const title = this._text(titleNode ? titleNode.text : "").trim();
    if (!title) throw new Error("Newtoki 만화 상세 제목을 찾지 못했습니다.");
    if (resolved.assumed && resolved.title && this._identityText(resolved.title) !== this._identityText(title)) throw new Error("Newtoki의 같은 번호가 다른 작품입니다. 원격 연결표에 이 작품의 사이트별 ID를 등록해 주세요.");
    const cached = this._readWorkCache(resolved.totalId); cached.totalId = resolved.totalId; cached.title = cached.title || title; cached.providers = cached.providers || {}; cached.providers.newtoki = resolved.sourceWorkId; this._writeWorkCache(cached);
    const documents = [firstDocument];
    const totalPages = this._episodePageCount(firstDocument);
    for (let start = 2; start <= totalPages; start += 4) {
      const requests = [];
      for (let page = start; page < start + 4 && page <= totalPages; page += 1) requests.push(this._getText(base + path + "?epage=" + page, null, "Newtoki 상세 회차 " + page));
      const bodies = await Promise.all(requests);
      for (const body of bodies) documents.push(new Document(body));
    }
    const episodes = [], seen = {};
    for (const document of documents) this._collectLegacyEpisodes(document, path, episodes, seen);
    if (!episodes.length) throw new Error("Newtoki 만화 회차를 찾지 못했습니다.");
    const genres = [];
    for (const element of firstDocument.select(".theme-detail-info-row:nth-child(2) .theme-detail-info-value")) { const value = this._text(element.text).replace(/#/g, "").trim(); if (value && genres.indexOf(value) < 0) genres.push(value); }
    const authorNode = firstDocument.selectFirst(".theme-detail-info-row:first-child .theme-detail-info-value");
    const descriptionNode = firstDocument.selectFirst(".theme-detail-description");
    const statusNode = firstDocument.selectFirst(".theme-detail-info-row:nth-child(3) .theme-detail-info-value");
    const coverNode = firstDocument.selectFirst(".col-sm-4 img");
    let imageUrl = this._text(coverNode ? coverNode.attr("src") : "").trim(); if (imageUrl.startsWith("/")) imageUrl = base + imageUrl;
    this._rememberChapterRoutes(resolved.totalId, "newtoki", episodes);
    const totalEpisodes = episodes.map((episode) => ({ name: episode.name, url: this._totalChapterPath(resolved.totalId, this._chapterKey(episode)), dateUpload: episode.dateUpload, scanlator: "Newtoki", description: "현재 연결: Newtoki", _providerUrl: episode.url }));
    return { name: title, imageUrl: imageUrl, author: this._text(authorNode ? authorNode.text : "").trim(), description: this._text(descriptionNode ? descriptionNode.text : "").trim(), genre: genres, status: this._text(statusNode ? statusNode.text : "").indexOf("완결") >= 0 ? 1 : 0, episodes: totalEpisodes, rawEpisodes: episodes, provider: "newtoki", base: base };
  }

  async getDetail(url) {
    const cardMatch = this._text(url).match(/\/__total_toki_manga_card__\/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\/(popular|latest))?/);
    if (cardMatch) { const card = await this._tabCard(cardMatch[2] || "all"); return { name: card.name, link: card.link, imageUrl: card.imageUrl, author: "TOTAL 토끼 만화", description: "목록카드 시스템에서 선택된 카드입니다. 뒤로 돌아가 작품을 선택해 주세요.", genre: ["목록 카드"], status: 0, episodes: [], chapters: [] }; }
    if (/\/__total_toki_manga_status__\/manga/.test(this._text(url))) {
      const card = await this._statusCard(null);
      const lines = [this._connectionLabel(this._selectedProvider()), card._snapshot && card._snapshot.stale ? "상태 자료: 마지막 수신본(갱신 지연)" : "상태 자료: 최신 수신본", ""];
      for (const site of card._sites || []) {
        lines.push(site.siteName + " - " + (site.label || site.color));
        lines.push(this._localStatusText(site.localList, "내 기기 목록"));
        lines.push(this._localStatusText(site.localViewer, "내 기기 최근 뷰어"));
        lines.push("NAS 상태: " + (site.nasLabel || site.label || site.nasColor || site.color));
        lines.push("실패 단계: " + (site.failedStage || "없음"));
        lines.push("오류 내용: " + (site.error || "없음"));
        lines.push("연속 실패: " + this._text(site.consecutiveFailures === undefined ? 0 : site.consecutiveFailures) + "회");
        lines.push("마지막 정상: " + this._formatKoreaTime(site.lastSuccessAt));
        lines.push("마지막 검사: " + this._formatKoreaTime(site.checkedAt));
        lines.push("");
      }
      const statusEpisodes = this._statusEpisodes(card);
      return { name: card.name, link: card.link, imageUrl: card.imageUrl, author: "NAS 토탈 검사기", description: lines.join("\n").trim(), genre: ["사이트 상태", "파랑 정상", "노랑 지연", "빨강 장애", "회색 확인 불가"], status: 0, episodes: statusEpisodes, chapters: statusEpisodes };
    }
    const parsed = this._parseTotalPath(url);
    if (!parsed || parsed.chapterKey) throw new Error("잘못된 TOTAL 토끼 만화 작품 주소입니다.");
    const detail = await this._loadProviderDetail(parsed.totalId);
    const providerName = this._providerName(detail.provider);
    const author = (detail.author ? detail.author + " · " : "") + this._connectionLabel(detail.provider);
    const description = this._connectionLabel(detail.provider) + "\n\n" + (detail.description || "");
    const genres = ["연결: " + providerName].concat((detail.genre || []).filter((value) => value !== "연결: " + providerName));
    return { name: detail.name, link: this._totalWorkPath(parsed.totalId), imageUrl: detail.imageUrl, author: author, description: description.trim(), genre: genres, status: detail.status, episodes: detail.episodes, chapters: detail.episodes };
  }

  async _loadProviderDetail(totalId, requestedProvider) {
    const provider = this.providers[requestedProvider] ? requestedProvider : this._selectedProvider();
    const resolved = await this._providerWork(totalId, provider);
    const path = "/manhwa/" + encodeURIComponent(resolved.sourceWorkId);
    const base = await this._resolveBaseUrl(provider);
    const raw = await this._getText(base + path, null, this._providerName(provider) + " 상세");
    const document = new Document(this._decodeFlightHtml(raw));
    if (provider === "newtoki") return await this._loadNewtokiDetail(resolved, base, path, document);
    const titleNode = document.selectFirst(".hero-v2-title");
    const authorNode = document.selectFirst(".hero-v2-author");
    const coverNode = document.selectFirst(".hero-v2-thumb img");
    const descriptionNode = document.selectFirst(".hero-v2-desc,.hero-v2-description,.expandable-desc");
    const statusNode = document.selectFirst(".pill-status");
    const title = this._text(titleNode ? titleNode.text : "").trim();
    if (!title) throw new Error(this._providerName(provider) + " 만화 상세 제목을 찾지 못했습니다.");
    if (resolved.assumed && resolved.title && this._identityText(resolved.title) !== this._identityText(title)) throw new Error(this._providerName(provider) + "의 같은 번호가 다른 작품입니다. 원격 연결표에 이 작품의 사이트별 ID를 등록해 주세요.");
    const cached = this._readWorkCache(totalId); cached.totalId = totalId; cached.title = cached.title || title; cached.providers = cached.providers || {}; cached.providers[provider] = resolved.sourceWorkId; this._writeWorkCache(cached);
    const genres = [];
    for (const node of document.select(".hero-v2-tag")) { const value = this._text(node.text).replace(/^#/, "").trim(); if (value && genres.indexOf(value) < 0) genres.push(value); }
    const episodes = [];
    const seen = {};
    this._collectEpisodes(document, path, episodes, seen);
    const totalEpisodePages = this._episodePageCount(document);
    for (let start = 2; start <= totalEpisodePages; start += 4) {
      const requests = [];
      for (let page = start; page < start + 4 && page <= totalEpisodePages; page += 1) {
        requests.push(this._getText(base + path + "?epage=" + page, null, "상세 회차 " + page));
      }
      const bodies = await Promise.all(requests);
      for (const body of bodies) this._collectEpisodes(new Document(this._decodeFlightHtml(body)), path, episodes, seen);
    }
    if (!episodes.length) throw new Error(this._providerName(provider) + " 만화 회차를 찾지 못했습니다.");
    const providerName = this._providerName(provider);
    this._rememberChapterRoutes(totalId, provider, episodes);
    const totalEpisodes = episodes.map((episode) => ({ name: episode.name, url: this._totalChapterPath(totalId, this._chapterKey(episode)), dateUpload: episode.dateUpload, scanlator: providerName, description: "현재 연결: " + providerName, _providerUrl: episode.url }));
    return { name: title, imageUrl: this._text(coverNode ? coverNode.attr("src") : "").trim(), author: this._text(authorNode ? authorNode.text : "").trim(), description: this._text(descriptionNode ? descriptionNode.text : "").trim(), genre: genres, status: this._text(statusNode ? statusNode.text : "").indexOf("완결") >= 0 ? 1 : 0, episodes: totalEpisodes, rawEpisodes: episodes, provider: provider, base: base };
  }

  _rabbitEnabled() { const value = this._preference("total_toki_manga_rabbit_enabled", false); return value === true || this._text(value).toLowerCase() === "true" || this._text(value) === "1"; }
  _rabbitEndpoint() { const raw = this._trimSlash(this._preference("total_toki_manga_rabbit_endpoint", "")); if (!raw) throw new Error("외부인증 서버 주소가 비어 있습니다."); if (!/^https?:\/\/(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(raw)) throw new Error("외부인증 서버 주소 형식이 잘못됐습니다. 예: http://192.168.0.10:9870"); return raw; }
  _rabbitHeaders(jsonBody) { const headers = { "Accept": "application/json", "X-Lab-Request": "1" }; if (jsonBody) headers["Content-Type"] = "application/json"; const key = this._text(this._preference("total_toki_manga_rabbit_access_key", "")).trim(); if (key) headers.Authorization = "Bearer " + key; return headers; }
  async _rabbitJson(endpoint, path, body, ignoreFailure) { try { const response = body === undefined ? await new Client().get(endpoint + path, this._rabbitHeaders(false)) : await new Client().post(endpoint + path, this._rabbitHeaders(true), body); if ([401, 403].indexOf(Number(response.statusCode)) >= 0) throw new Error("외부인증 접속 키가 틀렸거나 서버 설정과 다릅니다."); if (response.statusCode < 200 || response.statusCode >= 300) { if (ignoreFailure) return {}; throw new Error("외부인증 서버 요청 실패 (HTTP " + response.statusCode + ")."); } return JSON.parse(response.body); } catch (error) { if (ignoreFailure) return {}; if (error && error.message && error.message.indexOf("외부인증") >= 0) throw error; throw new Error("외부인증 서버에 연결할 수 없습니다. 주소, 포트, 방화벽을 확인하세요."); } }
  _newRequestId() { this.requestSequence++; let seed = Date.now().toString(16).padStart(12, "0") + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0") + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0") + this.requestSequence.toString(16).padStart(4, "0"); seed = (seed + "00000000000000000000000000000000").slice(0, 32); return seed.slice(0, 8) + "-" + seed.slice(8, 12) + "-4" + seed.slice(13, 16) + "-a" + seed.slice(17, 20) + "-" + seed.slice(20, 32); }
  _manifestPages(manifest, id, chapterUrl) { if (!manifest || this._text(manifest.id) !== id || this._text(manifest.chapterUrl) !== chapterUrl) throw new Error("외부인증 결과가 현재 회차와 일치하지 않습니다."); const rows = manifest.pages; if (!Array.isArray(rows) || !rows.length || Number(manifest.expected) !== rows.length) throw new Error("외부인증 서버가 불완전한 이미지 목록을 반환했습니다."); const referer = this._text(manifest.referer).trim(); const userAgent = this._text(manifest.userAgent).trim(); return rows.map((row, index) => { if (!row || Number(row.page) !== index + 1 || !Array.isArray(row.urls)) throw new Error("외부인증 이미지 순서가 올바르지 않습니다."); const imageUrl = row.urls.map(this._text.bind(this)).find(function(value) { return /^https:\/\/[^\s]+$/i.test(value); }); if (!imageUrl) throw new Error("외부인증 이미지 주소가 유효하지 않습니다."); const headers = { "Referer": referer, "User-Agent": userAgent, "Accept": this.imageAccept }; const cookies = Array.isArray(row.cookies) ? row.cookies : []; const cookie = this._text(cookies[0]).trim(); if (cookie && !/[\r\n]/.test(cookie)) headers.Cookie = cookie; return { url: imageUrl, headers: headers }; }); }
  async _rabbitPages(chapterUrl) { const endpoint = this._rabbitEndpoint(); const health = await this._rabbitJson(endpoint, "/health"); if (!health || health.service !== "rabbit-auth-server" || Number(health.protocol) !== 1) throw new Error("호환되는 외부인증 서버(protocol v1)가 아닙니다."); if (health.ready !== true) throw new Error("외부인증 서버가 아직 준비되지 않았습니다."); const opened = await this._rabbitJson(endpoint, "/v1/jobs", { url: chapterUrl, requestId: this._newRequestId(), kind: "images" }); const id = this._text(opened.id); if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("외부인증 작업 번호가 잘못됐습니다."); try { const deadline = Date.now() + 115000; while (Date.now() < deadline) { const state = await this._rabbitJson(endpoint, "/v1/jobs/" + id); if (state.state === "failed") throw new Error("외부인증 토끼 만화 작업이 실패했습니다."); if (state.state === "ready") return this._manifestPages(await this._rabbitJson(endpoint, "/v1/jobs/" + id + "/manifest", {}), id, chapterUrl); await this._pause(750); } throw new Error("외부인증 시간이 초과됐습니다."); } finally { await this._rabbitJson(endpoint, "/v1/jobs/" + id + "/close", {}, true); } }

  _viewerCollectorScript() { return `(function(){
    if(window.__mangayomiTokiManhwaBridgeInstalled)return;
    window.__mangayomiTokiManhwaBridgeInstalled=true;
    var done=false,last='',stable=0,ticks=0,all=[],seenAll={};
    function finish(output){try{window.flutter_inappwebview.callHandler('setResponse',output);}catch(e){}}
    function send(value){
      if(done)return;
      done=true;
      finish(JSON.stringify(value));
    }
    function pages(){
      var nodes=Array.from(document.querySelectorAll('.vw-imgs img,img.viewer-ratio-img,.theme-viewer-image img'));
      var out=[],seen={};
      nodes.forEach(function(img){
        var candidates=[img.getAttribute('data-src'),img.getAttribute('data-original'),img.currentSrc,img.src];
        candidates.forEach(function(src){if(/^https?:\\/\\//i.test(src||'')&&!seen[src]){seen[src]=true;out.push(src);}});
      });
      return out;
    }
    function collect(){
      if(document.querySelector('iframe[src*=captcha],.h-captcha,.g-recaptcha,.cf-turnstile')){send({ok:false,code:'INTERACTIVE_CHALLENGE'});return true;}
      var found=pages();
      found.forEach(function(src){if(!seenAll[src]){seenAll[src]=true;all.push(src);}});
      var root=document.scrollingElement||document.documentElement;
      var height=Math.max(root?root.scrollHeight:0,document.body?document.body.scrollHeight:0);
      var position=Math.max(window.scrollY||0,root?root.scrollTop:0);
      var atBottom=position+Math.max(window.innerHeight||0,600)>=height-8;
      var viewer=document.querySelector('.vw-imgs');
      var expected=Number(viewer&&viewer.getAttribute('data-viewer-image-count')||0);
      var signature=all.join('|');
      if(expected>0&&all.length>=expected){
        if(signature===last)stable++;else stable=0;
        last=signature;
        if(stable>=2){send({ok:true,pages:all.slice(0,expected),userAgent:navigator.userAgent,referer:location.origin+'/'});return true;}
        return false;
      }
      if(found.length&&!atBottom){
        stable=0;
        last='';
        window.scrollBy(0,Math.max(Math.floor((window.innerHeight||800)*1.1),720));
        return false;
      }
      if(signature&&signature===last)stable++;else stable=0;
      last=signature;
      if(all.length&&atBottom&&stable>=5){send({ok:true,pages:all,userAgent:navigator.userAgent,referer:location.origin+'/'});return true;}
      return false;
    }
    if(collect())return;
    var timer=setInterval(function(){ticks++;if(collect()||ticks>=165){clearInterval(timer);if(!done){var root=document.scrollingElement||document.documentElement;send({ok:false,code:'NO_IMAGES',collected:all.length,scrollY:window.scrollY||0,scrollHeight:root?root.scrollHeight:0});}}},200);
  })();`; }
  async _hiddenWebView(chapterUrl, headers) {
    const script = this._viewerCollectorScript();
    const payload = [chapterUrl, headers, [script], 33];
    try { return await sendMessage("evaluateJavascriptViaWebview", JSON.stringify(payload)); }
    catch (error) {
      const detail = this._text(error && (error.message || error));
      if (/String[^\n]{0,80}bool|subtype of type[^\n]{0,80}bool|as bool/i.test(detail)) {
        throw new Error("현재 Mangayomi 버전의 WebView 문자열 반환 오류로 콘텐츠를 받을 수 없습니다. 외부인증 서버를 사용하거나 Mangayomi 업데이트를 확인하세요.");
      }
      throw error;
    }
  }
  async _directPages(chapterUrl) {
    let raw = "";
    let bridgeError = "";
    try {
      raw = await this._hiddenWebView(chapterUrl, { "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Referer": this._origin(chapterUrl) + "/" });
    } catch (error) {
      bridgeError = this._text(error && (error.message || error)).slice(0, 500);
    }
    let result;
    try { result = JSON.parse(this._text(raw)); } catch (_) { throw new Error("토끼 만화 숨김 WebView 응답을 읽지 못했습니다: " + (bridgeError || "NO_RESULT")); }
    if (!result || result.ok !== true || !Array.isArray(result.pages) || !result.pages.length) { if (result && result.code === "INTERACTIVE_CHALLENGE") throw new Error("사이트 인증 화면이 나타났습니다. 필요할 때만 Rabbit을 켜세요."); throw new Error("뷰어 이미지를 찾지 못했습니다. 네트워크를 확인하거나 필요할 때만 Rabbit을 켜세요."); }
    const pages = [];
    const seen = {};
    const userAgent = this._text(result.userAgent).trim();
    const referer = this._text(result.referer).trim() || this._origin(chapterUrl) + "/";
    for (const value of result.pages) { const imageUrl = this._text(value).trim(); if (!/^https:\/\/[^\s]+$/i.test(imageUrl) || seen[imageUrl]) continue; const headers = { "Referer": referer, "Accept": this.imageAccept }; if (userAgent) headers["User-Agent"] = userAgent; pages.push({ url: imageUrl, headers: headers }); seen[imageUrl] = true; }
    if (!pages.length) throw new Error("유효한 이미지 주소가 없습니다.");
    return pages;
  }
  _isContentMissingError(error) {
    return /이 회차를 찾지 못|연결 정보가 없습니다|같은 번호가 다른 작품|잘못된 TOTAL 토끼 만화 회차 주소/.test(this._text(error && (error.message || error)));
  }
  async getPageList(url) {
    if (/\/__total_toki_manga_status__\/manga(?:\/|$)/.test(this._text(url))) { const card = await this._statusCard(null); return [{ url: card.imageUrl, headers: { "Referer": this.assetBaseUrl + "/" } }]; }
    const parsed = this._parseTotalPath(url);
    if (!parsed || !parsed.chapterKey) throw new Error("잘못된 TOTAL 토끼 만화 회차 주소입니다.");
    const provider = this._selectedProvider();
    const started = Date.now();
    try {
      let route = this._chapterRoute(parsed.totalId, parsed.chapterKey);
      if (!route) route = await this._recoverChapterRoute(parsed.totalId, parsed.chapterKey, provider);
      const providerPath = await this._providerChapterPath(parsed.totalId, provider, route);
      if (!providerPath) throw new Error(this._providerName(provider) + "에서 이 회차를 찾지 못했습니다.");
      const chapterUrl = await this._resolveBaseUrl(provider) + providerPath;
      const pages = this._rabbitEnabled() ? await this._rabbitPages(chapterUrl) : await this._directPages(chapterUrl);
      if (!Array.isArray(pages) || !pages.length) throw new Error("뷰어 이미지 목록이 비어 있습니다.");
      this._recordLocalResult(provider, "viewer", true, Date.now() - started, "", false);
      return pages;
    } catch (error) {
      this._recordLocalResult(provider, "viewer", false, Date.now() - started, error, this._isContentMissingError(error));
      throw error;
    }
  }
  getHeaders(url) { return { "User-Agent": this.userAgent, "Referer": (this._origin(url) || this.providers[this._selectedProvider()].fallbackBaseUrl) + "/", "Accept": this.imageAccept }; }
  async getVideoList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }
  _option(name, value) { return { type_name: "SelectOption", name: name, value: value }; }
  _select(type, name, values) { return { type: type, name: name, type_name: "SelectFilter", values: values }; }

  getFilterList() {
    const o = this._option.bind(this);
    const options = function(pairs) { return [o("선택하세요", "__unset__")].concat(pairs.map(function(pair) { return o(pair[0], pair[1]); })); };
    const separator = function(type) { return { type: type, name: "", type_name: "SeparatorFilter" }; };
    const header = function(type, name) { return { type: type, name: name, type_name: "HeaderFilter" }; };
    const popular = this._tabRule(this.popularRulePreference, this._defaultPopularRule());
    const latest = this._tabRule(this.latestRulePreference, this._defaultLatestRule());
    const genrePairs = this.genres.map(function(name) { return [name, name === "전체" ? "" : name]; });
    return [
      separator("sepMain"), header("mainHeader", "만화"),
      this._select("section", "만화", options(this.sections)),
      this._select("genre", "장르", options(genrePairs)),
      this._select("order", "정렬", options(this.orders)),
      header("updatesOrderHelp", "업데이트 목록에서는 최신순·조회순·화수순만 적용됩니다."),
      separator("sepSave"), header("saveHelp", "조건을 고른 뒤 Filter 버튼을 누르면 결과를 보고 Popular/Latest 탭 규칙으로 저장할 수 있습니다."),
      header("popularSummary", "현재 Popular: " + this._ruleSummary(popular)),
      header("latestSummary", "현재 Latest: " + this._ruleSummary(latest)),
      this._select("tabRuleAction", "Popular/Latest 규칙", [o("저장하지 않음 (필터 결과만 보기)", "0"), o("현재 조건을 Popular 탭에 저장", "1"), o("현재 조건을 Latest 탭에 저장", "2"), o("Popular 탭을 기본값으로 복원", "3"), o("Latest 탭을 기본값으로 복원", "4"), o("두 탭 모두 기본값으로 복원", "5")])
    ];
  }

  getSourcePreferences() {
    return [
      { key: this.autoProviderPreference, switchPreferenceCompat: { title: "상태 기반 자동 토끼 선택", summary: "기본 켜짐. 확장앱 목록 진입과 Popular/Latest 전환 때 Cloudflare의 NAS 상태를 읽어 가장 좋은 사이트를 선택합니다. 회차를 열 때는 다시 검사하지 않습니다.", value: true } },
      { key: this.providerPreference, listPreference: { title: "수동으로 연결할 토끼", summary: "자동 선택을 끈 경우에만 이 사이트를 고정 사용합니다. 토탈 작품 ID와 라이브러리는 그대로 유지됩니다.", valueIndex: 1, entries: ["Newtoki", "Toki", "SBXH"], entryValues: ["newtoki", "toki", "sbxh"] } },
      { key: "total_toki_manga_newtoki_domain_url", editTextPreference: { title: "Newtoki 주소 직접 지정 (선택)", summary: "빈 값이면 중앙신호등 주소를 사용합니다.", value: "", dialogTitle: "https://newtoki##.org", dialogMessage: "자동 주소를 사용하려면 빈 값으로 두세요." } },
      { key: "total_toki_manga_toki_domain_url", editTextPreference: { title: "Toki 주소 직접 지정 (선택)", summary: "빈 값이면 중앙신호등 주소를 사용합니다.", value: "", dialogTitle: "https://toki##.com", dialogMessage: "자동 주소를 사용하려면 빈 값으로 두세요." } },
      { key: "total_toki_manga_sbxh_domain_url", editTextPreference: { title: "SBXH 주소 직접 지정 (선택)", summary: "빈 값이면 중앙신호등 주소를 사용합니다.", value: "", dialogTitle: "https://sbxh##.com", dialogMessage: "자동 주소를 사용하려면 빈 값으로 두세요." } },
      { key: "total_toki_manga_custom_card_json_url", editTextPreference: { title: "커스텀 목록 카드 (선택)", summary: "공개 JSON 주소로 개인 목록 카드를 설정합니다.", value: "", dialogTitle: "커스텀 목록 카드 JSON 주소", dialogMessage: "Google Drive 공개 공유 링크 또는 직접 JSON 주소를 넣으세요. 비워 두면 공용 이벤트 또는 원격 랜덤 카드가 표시됩니다." } },
      { key: "total_toki_manga_rabbit_enabled", switchPreferenceCompat: { title: "외부인증 서버 사용", summary: "켜면 Windows/도커 외부인증 서버만 사용합니다. 끄면 이 기기의 숨은 WebView를 사용합니다.", value: false } },
      { key: "total_toki_manga_rabbit_endpoint", editTextPreference: { title: "외부인증 서버 주소", summary: "Windows: localhost 가능 / 모바일: LAN, 역방향 프록시 또는 VPN 주소", value: "", dialogTitle: "예: http://192.168.0.10:9870", dialogMessage: "" } },
      { key: "total_toki_manga_rabbit_access_key", editTextPreference: { title: "외부인증 서버 접속 키 (선택)", summary: "서버에 키를 설정한 경우만 입력", value: "", dialogTitle: "접속 키", dialogMessage: "" } }
    ];
  }
}
