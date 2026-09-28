const mangayomiSources = [{
  name: "애니라이프",
  lang: "ko",
  baseUrl: "https://anilife01.tv",
  apiUrl: "",
  iconUrl: "https://dc-toki-mangayomi-media.pages.dev/icon/ko.media.png",
  typeSource: "single",
  itemType: 1,
  isNsfw: false,
  hasCloudflare: false,
  version: "0.1.13",
  dateFormat: "",
  dateFormatLocale: "",
  pkgPath: "anime/src/ko/anilife.js",
  notes: "목록·상세 제목 한국어/일본어 전환 · 제목 언어 설정 캐시 키 갱신 · Anissia 일본어 원제 우선 + AniList 보조 · 새로고침 즉시 반영 · Popular/Latest 첫 번째 미디어 요일 카드 · 커스텀 목록 카드 · 공용 이벤트 카드 · 목록/상세 10분 캐시 · 실제 회차 번호 유지 · 재생 시 최신 HLS 확인 · 상위 HLS 자동 해석 다운로드 · 사이트 자막 끄기 옵션 · Mangayomi WebView bool 오류 우회 · 중앙신호등 주소 자동 적용"
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

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.fallbackBaseUrl = "https://anilife01.tv";
    this.signalUrl = "https://wankyo83.github.io/tokki-traffic-light/domains.json";
    this.assetBaseUrl = "https://dc-toki-mangayomi-media.pages.dev";
    this.eventManifestUrl = this.assetBaseUrl + "/assets/official-event-card.json";
    this.cacheMs = 10 * 60 * 1000;
    this.popularRulePreference = "anilife_popular_rule_v1";
    this.latestRulePreference = "anilife_latest_rule_v1";
    this.titleLanguagePreference = "anilife_title_language_v2";
    this.titleCachePrefix = "anilife_title_meta_v3_";
  }

  get supportsLatest() { return true; }
  get base() { return this.fallbackBaseUrl; }

  _text(value) { return value === null || value === undefined ? "" : String(value); }
  _trimSlash(value) { return this._text(value).trim().replace(/\/+$/, ""); }
  _origin(value) { const match = this._text(value).match(/^(https?:\/\/[^/]+)/i); return match ? match[1] : ""; }
  _isHttpsOrigin(value) { return /^https:\/\/[^\s/]+\/?$/i.test(this._text(value).trim()); }
  _preference(key, fallback) {
    try { const value = new SharedPreferences().get(key); return value === null || value === undefined ? fallback : value; }
    catch (_) { return fallback; }
  }
  _preferenceString(key, fallback) {
    try { const value = new SharedPreferences().getString(key, fallback); return value === null || value === undefined ? fallback : this._text(value); }
    catch (_) { return fallback; }
  }
  _siteSubtitlesDisabled() {
    const value = this._preference("anilife_disable_site_subtitles", false);
    return value === true || this._text(value).toLowerCase() === "true" || this._text(value) === "1";
  }
  _setPreferenceString(key, value) {
    try { new SharedPreferences().setString(key, this._text(value)); } catch (_) {}
  }
  _titleLanguage() {
    const value = this._text(this._preference(this.titleLanguagePreference, this._preferenceString(this.titleLanguagePreference, "ko"))).trim().toLowerCase();
    return value === "ja" || value === "1" || value.indexOf("일본") >= 0 ? "ja" : "ko";
  }
  async _freshDetailTitleLanguage() { if (typeof setTimeout === "function") await new Promise(function(resolve) { setTimeout(resolve, 250); }); return this._titleLanguage(); }
  _titleBridgeKey(value) { let text = this._text(value); try { text = text.normalize("NFKC"); } catch (_) {} return text.toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ヶ一-龯]+/g, ""); }
  _anissiaSearchNames(value) { const original = this._text(value).trim(), cleaned = original.replace(/\s*[\(\[]?\d{4}[\)\]]?\s*$/g, "").replace(/\s*[\(\[](더빙|자막|무삭제)[\)\]]\s*$/g, "").replace(/^\s*\((고화질|저화질)\)\s*/g, "").replace(/\s+BD\s*$/i, "").trim(), plain = cleaned.replace(/[~～!！「」『』…:：·・,]+/g, " ").replace(/\s+/g, " ").trim(), season = plain.replace(/시즌\s*(\d+)/g, "$1기"), numbered = season.replace(/\s+(\d+)$/g, " $1기"), korean = (season.match(/^[가-힣0-9][가-힣0-9\s:：\-·・~～!?！？'’.,]*/) || [""])[0].replace(/[\s:：\-·・~～!?！？'’.,]+$/g, "").trim(); return [original, cleaned, plain, season, numbered, korean].filter(function(item, index, list) { return item && list.indexOf(item) === index; }); }
  async _anissiaMetadata(original) { const names = this._anissiaSearchNames(original); for (const query of names) { try { const response = await new Client({persistentConnection: false, noProxy: true, timeout: 7, connectTimeout: 4}).get("https://api.anissia.net/anime/list/0?q=" + encodeURIComponent(query), {Accept: "application/json", Referer: "https://anissia.net/anime"}); if (!response || response.statusCode < 200 || response.statusCode >= 300) continue; const payload = JSON.parse(this._text(response.body)), items = payload && payload.data && Array.isArray(payload.data.content) ? payload.data.content : [], wanted = this._titleBridgeKey(query), match = items.find((item) => this._titleBridgeKey(item && item.subject) === wanted); if (match && this._text(match.originalSubject).trim()) return {ko: original, ja: this._text(match.originalSubject).trim(), anissiaId: Number(match.animeNo) || 0, confidence: 500}; } catch (_) {} } return null; }
  _plainEnglishTitle(value) {
    const text = this._text(value).trim();
    return /[a-z]/i.test(text) && !/[가-힣ぁ-んァ-ヶ一-龯]/.test(text) ? text : "";
  }

  _decodeTitleText(value) {
    return this._text(value).replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(Number(code)); }).replace(/&#x([0-9a-f]+);/gi, function(_, code) { return String.fromCharCode(parseInt(code, 16)); }).replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, " ").trim();
  }

  _anilistIdFromText(value) {
    const match = this._text(value).match(/(?:\/|%2f)anime(?:\/|%2f)(\d{4,})/i);
    return match ? Number(match[1]) : 0;
  }

  _titleBridgeMetadataFromItem(original, item) {
    if (!item) return null;
    const japanese = this._text(item.titleJp).trim();
    const english = this._plainEnglishTitle(item.titleOriginal);
    if (!japanese && !english) return null;
    return {ko: original, ja: japanese, en: english, romaji: english, sourceId: Number(item.id) || 0, confidence: 200};
  }

  _metadataFromAniListMedia(original, media) {
    if (!media || !media.id) return null;
    const title = media.title || {};
    return {ko: original, ja: this._text(title.native).trim(), en: this._text(title.english || title.romaji).trim(), romaji: this._text(title.romaji).trim(), anilistId: Number(media.id), confidence: 300};
  }

  async _aniListMetadata(original, candidate, anilistId) {
    try {
      const byId = Number(anilistId) > 0;
      const query = byId ? "query($id:Int!){Media(id:$id,type:ANIME){id synonyms title{romaji english native}}}" : "query($search:String!){Page(page:1,perPage:12){media(search:$search,type:ANIME){id synonyms title{romaji english native}}}}";
      const variables = byId ? {id: Number(anilistId)} : {search: this._text(candidate).trim()};
      if (!byId && !variables.search) return null;
      const response = await new Client({persistentConnection: false, noProxy: true, timeout: 12, connectTimeout: 6}).post("https://graphql.anilist.co", {"Content-Type": "application/json", Accept: "application/json"}, JSON.stringify({query, variables}));
      if (!response || response.statusCode < 200 || response.statusCode >= 300) return null;
      const payload = JSON.parse(this._text(response.body));
      if (byId) return this._metadataFromAniListMedia(original, payload && payload.data && payload.data.Media);
      const media = payload && payload.data && payload.data.Page && Array.isArray(payload.data.Page.media) ? payload.data.Page.media : [], wanted = this._titleBridgeKey(variables.search);
      const match = media.find((item) => [item && item.title && item.title.native, item && item.title && item.title.romaji, item && item.title && item.title.english].concat(Array.isArray(item && item.synonyms) ? item.synonyms : []).some((value) => this._titleBridgeKey(value) === wanted));
      return this._metadataFromAniListMedia(original, match);
    } catch (_) { return null; }
  }

  _linkkfOriginCandidates(body) {
    const raw = this._text(body), match = raw.match(/원제[\s\S]{0,100}?<\/span>\s*([^<]+)/i);
    if (!match) return [];
    return this._decodeTitleText(match[1]).split(/\s*,\s*/).map((value) => value.trim()).filter(Boolean);
  }

  async _linkkfMetadata(original, url) {
    if (!/^https:\/\/(?:www\.)?linkkf\.(?:tv|com)\/ani\/\d+\/?/i.test(this._text(url).trim())) return null;
    try {
      const response = await new Client({persistentConnection: false, noProxy: true, timeout: 10, connectTimeout: 6}).get(this._text(url).trim(), {Accept: "text/html,application/xhtml+xml", Referer: "https://linkkf.tv/"});
      if (!response || response.statusCode < 200 || response.statusCode >= 300) return null;
      const body = this._text(response.body), id = this._anilistIdFromText(body);
      if (id) { const direct = await this._aniListMetadata(original, "", id); if (direct) return direct; }
      const candidates = this._linkkfOriginCandidates(body), ordered = candidates.filter((value) => /[ぁ-んァ-ヶ一-龯]/.test(value)).concat(candidates.filter((value) => this._plainEnglishTitle(value)));
      for (const candidate of ordered) { const data = await this._aniListMetadata(original, candidate, 0); if (data) return data; }
    } catch (_) {}
    return null;
  }

  async _titleBridgeMetadata(name) {
    const anissia = await this._anissiaMetadata(name);
    if (anissia) return anissia;
    try {
      const base = await this._resolveBaseUrl();
      for (const query of this._anissiaSearchNames(name)) {
        const response = await new Client({persistentConnection: false, noProxy: true, timeout: 10, connectTimeout: 6}).get(base + "/api/anime?page=1&limit=10&q=" + encodeURIComponent(query), {Accept: "application/json, text/plain, */*", Referer: base + "/"});
        if (!response || response.statusCode < 200 || response.statusCode >= 300) continue;
        const data = JSON.parse(this._text(response.body)), items = Array.isArray(data && data.items) ? data.items : [], wanted = this._titleBridgeKey(query);
        const match = items.find((item) => this._titleBridgeKey(item && item.title) === wanted || this._titleBridgeKey(item && item.titleOriginal) === wanted);
        if (!match) continue;
        const direct = await this._fillBridgeMetadata(this._titleBridgeMetadataFromItem(name, match));
        if (direct && direct.ja) return direct;
        const linked = await this._linkkfMetadata(name, match.sourceUrl);
        if (linked) return linked;
        if (direct) return direct;
      }
      return null;
    } catch (_) { return null; }
  }
  async _fillBridgeMetadata(data) {
    if (!data) return data;
    if (data.ja) return data;
    const filled = await this._aniListMetadata(data.ko || "", data.ja || data.romaji || data.en, data.anilistId);
    return filled || data;
  }
  async _titleMetadata(name) {
    const original = this._text(name).trim();
    if (!original) return null;
    const key = this.titleCachePrefix + this._cacheToken(original), timeKey = key + "_time";
    const cached = this._preferenceString(key, ""), cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0) { try { const parsed = JSON.parse(cached), ttl = parsed && parsed.miss ? 6 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000; if (Date.now() - cachedAt < ttl) return parsed && parsed.miss ? null : parsed; } catch (_) {} }
    try {
      const data = await this._fillBridgeMetadata(await this._titleBridgeMetadata(original));
      if (!data || !data.ja) { this._setPreferenceString(key, JSON.stringify({miss: true})); this._setPreferenceString(timeKey, String(Date.now())); return null; }
      this._setPreferenceString(key, JSON.stringify(data)); this._setPreferenceString(timeKey, String(Date.now()));
      return data;
    } catch (_) { return null; }
  }
  async _localizedTitle(name, directMetadata, languageOverride) {
    const original = this._text(name).trim(), language = languageOverride || this._titleLanguage();
    if (!original || language === "ko") return original;
    const direct = directMetadata ? this._text(directMetadata[language]).trim() : "";
    if (direct) return direct;
    const data = await this._titleMetadata(original), localized = data ? this._text(data[language]).trim() : "";
    return localized || original;
  }
  async _localizeResult(result) {
    if (!result || !Array.isArray(result.list)) return result;
    const items = result.list, language = this._titleLanguage(), workers = []; let cursor = 0;
    const work = async () => { while (true) { const index = cursor++; if (index >= items.length) return; const item = items[index]; if (!item) continue; const direct = item.__dcTitleMeta || null; delete item.__dcTitleMeta; if (language === "ko" || /\/__anilife_(?:weekday|event)_card__\//.test(this._text(item.link))) continue; item.name = await this._localizedTitle(item.name, direct); } };
    for (let index = 0; index < Math.min(4, items.length); index++) workers.push(work());
    await Promise.all(workers); return result;
  }

  getHeaders(url) {
    const origin = this._origin(url) || this.fallbackBaseUrl;
    return { Referer: origin + "/", Origin: origin, Accept: "application/json, text/plain, */*" };
  }

  async _requestText(url, referer, timeout) {
    const headers = this.getHeaders(url);
    if (referer) headers.Referer = referer;
    const response = await new Client({persistentConnection: false, noProxy: true, timeout: timeout || 10, connectTimeout: 6}).get(url, headers);
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error("HTTP " + response.statusCode);
    return this._text(response.body);
  }

  async _resolveBaseUrl() {
    const manual = this._trimSlash(this._preference("anilife_domain_url", ""));
    if (this._isHttpsOrigin(manual)) return manual;
    const cached = this._trimSlash(this._preferenceString("anilife_resolved_base", ""));
    const cachedAt = Number(this._preferenceString("anilife_resolved_base_time", "0"));
    if (this._isHttpsOrigin(cached) && cachedAt > 0 && Date.now() - cachedAt < this.cacheMs) return cached;
    try {
      const join = this.signalUrl.indexOf("?") >= 0 ? "&" : "?";
      const data = JSON.parse(await this._requestText(this.signalUrl + join + "anilife=" + Date.now(), this.signalUrl, 8));
      const candidate = this._trimSlash(data && data.domains && data.domains.anilife && data.domains.anilife.baseUrl);
      if (this._isHttpsOrigin(candidate)) {
        this._setPreferenceString("anilife_resolved_base", candidate);
        this._setPreferenceString("anilife_resolved_base_time", String(Date.now()));
        return candidate;
      }
    } catch (_) {}
    return this._isHttpsOrigin(cached) ? cached : this.fallbackBaseUrl;
  }

  get formatOptions() {
    return [["전체", ""], ["TV", "TV"], ["극장판", "Movie"], ["OVA", "OVA"], ["ONA", "ONA"]];
  }
  get statusOptions() {
    return [["전체", ""], ["방영중", "방영중"], ["완결", "완결"], ["방영예정", "방영예정"]];
  }
  get dayOptions() {
    return [["전체", ""], ["월요일", "월"], ["화요일", "화"], ["수요일", "수"], ["목요일", "목"], ["금요일", "금"], ["토요일", "토"], ["일요일", "일"]];
  }
  get genreOptions() {
    return [
      "코미디", "액션", "판타지", "드라마", "로맨스", "일상", "모험", "SF", "초자연", "미스터리",
      "스포츠", "음악", "메카", "심리", "호러", "마법소녀", "스릴러", "소년", "학원", "서스펜스",
      "이세계", "미식", "중국 애니", "청년", "역사", "초능력", "BL", "GL", "환생", "밀리터리",
      "우주", "아방가르드", "웹툰원작", "신화", "소녀", "무술", "수상작", "탐정", "하렘", "시간여행",
      "패러디", "레이싱", "직장", "치유", "게임", "공연예술", "오타쿠", "팀 스포츠"
    ].map(function(value) { return [value, value]; });
  }
  get yearOptions() {
    const years = [["전체", ""]];
    for (let year = new Date().getFullYear() + 1; year >= 1977; year -= 1) years.push([String(year) + "년", String(year)]);
    return years;
  }
  get scopeOptions() { return [["전체 작품", ""], ["인기 작품", "popular"], ["최근 7일 업데이트", "updates"]]; }
  get sortOptions() { return [["최신순", "latest"], ["인기순", "popular"], ["평점순", "rating"], ["이름순", "title"]]; }

  _option(name, value) { return {type_name: "SelectOption", name, value}; }
  _select(type, name, pairs, includeUnset) {
    const values = pairs.map((pair) => this._option(pair[0], pair[1]));
    if (includeUnset !== false) values.unshift(this._option("선택하세요", "__unset__"));
    return {type, name, type_name: "SelectFilter", values};
  }
  _filterValue(filters, type, fallback) {
    if (!Array.isArray(filters)) return fallback;
    for (const filter of filters) {
      if (!filter || filter.type !== type || !Array.isArray(filter.values)) continue;
      const option = filter.values[Number(filter.state) || 0];
      if (!option || option.value === undefined) return fallback;
      const value = this._text(option.value);
      return value === "__unset__" ? fallback : value;
    }
    return fallback;
  }
  _normalizeCriteria(criteria, fallback) {
    const base = fallback || {scope: "", format: "", status: "", day: "", year: "", genre: "", sort: "latest"};
    const value = criteria || {};
    const allowed = (candidate, pairs, otherwise) => pairs.some(function(pair) { return pair[1] === candidate; }) ? candidate : otherwise;
    return {
      scope: allowed(this._text(value.scope), this.scopeOptions, base.scope),
      format: allowed(this._text(value.format), this.formatOptions, base.format),
      status: allowed(this._text(value.status), this.statusOptions, base.status),
      day: allowed(this._text(value.day), this.dayOptions, base.day),
      year: allowed(this._text(value.year), this.yearOptions, base.year),
      genre: allowed(this._text(value.genre), [["전체", ""]].concat(this.genreOptions), base.genre),
      sort: allowed(this._text(value.sort), this.sortOptions, base.sort)
    };
  }
  _filterCriteria(filters) {
    return this._normalizeCriteria({
      scope: this._filterValue(filters, "scope", ""), format: this._filterValue(filters, "format", ""),
      status: this._filterValue(filters, "status", ""), day: this._filterValue(filters, "day", ""),
      year: this._filterValue(filters, "year", ""), genre: this._filterValue(filters, "genre", ""),
      sort: this._filterValue(filters, "sort", "latest")
    });
  }
  _defaultPopularRule() { return {scope: "popular", format: "", status: "", day: "", year: "", genre: "", sort: "popular"}; }
  _defaultLatestRule() { return {scope: "updates", format: "", status: "", day: "", year: "", genre: "", sort: "latest"}; }
  _tabRule(key, fallback) {
    const raw = this._preferenceString(key, "");
    if (!raw) return this._normalizeCriteria(fallback, fallback);
    try { return this._normalizeCriteria(JSON.parse(raw), fallback); } catch (_) { return this._normalizeCriteria(fallback, fallback); }
  }
  _nameFor(pairs, value, fallback) {
    const item = pairs.find(function(pair) { return pair[1] === value; });
    return item ? item[0] : fallback;
  }
  _ruleSummary(rule) {
    const r = this._normalizeCriteria(rule);
    const parts = [this._nameFor(this.scopeOptions, r.scope, "전체 작품")];
    if (r.format) parts.push(this._nameFor(this.formatOptions, r.format, r.format));
    if (r.status) parts.push(r.status);
    if (r.day) parts.push(this._nameFor(this.dayOptions, r.day, r.day));
    if (r.year) parts.push(r.year + "년");
    if (r.genre) parts.push(r.genre);
    parts.push(this._nameFor(this.sortOptions, r.sort, "최신순"));
    return parts.join(" · ");
  }
  _applyTabRuleAction(page, filters, rule) {
    if (Number(page) !== 1) return;
    const action = Number(this._filterValue(filters, "tabRuleAction", "0"));
    if (action === 1) this._setPreferenceString(this.popularRulePreference, JSON.stringify(rule));
    else if (action === 2) this._setPreferenceString(this.latestRulePreference, JSON.stringify(rule));
    else if (action === 3) this._setPreferenceString(this.popularRulePreference, "");
    else if (action === 4) this._setPreferenceString(this.latestRulePreference, "");
    else if (action === 5) { this._setPreferenceString(this.popularRulePreference, ""); this._setPreferenceString(this.latestRulePreference, ""); }
  }

  getFilterList() {
    const separator = (type) => ({type, name: "", type_name: "SeparatorFilter"});
    const header = (type, name) => ({type, name, type_name: "HeaderFilter"});
    const popular = this._tabRule(this.popularRulePreference, this._defaultPopularRule());
    const latest = this._tabRule(this.latestRulePreference, this._defaultLatestRule());
    return [
      header("filterHelp", "원하는 조건만 선택하세요. 선택하지 않은 항목은 전체로 처리하며 여러 조건은 함께 적용됩니다."),
      this._select("scope", "목록 종류", this.scopeOptions),
      this._select("format", "작품 형식", this.formatOptions),
      this._select("status", "방영 상태", this.statusOptions),
      this._select("day", "방영 요일", this.dayOptions),
      this._select("year", "방영 연도", this.yearOptions),
      this._select("genre", "주요 장르", [["전체", ""]].concat(this.genreOptions)),
      separator("sortSeparator"),
      this._select("sort", "정렬", this.sortOptions),
      header("genreHelp", "제목·원제·제작사·감독도 검색창에서 함께 검색됩니다."),
      separator("saveSeparator"),
      header("cardHelp", "미디어 요일 카드는 Popular/Latest 첫 페이지에만 표시되며 검색·필터 결과에서는 숨깁니다."),
      header("popularSummary", "현재 Popular: " + this._ruleSummary(popular)),
      header("latestSummary", "현재 Latest: " + this._ruleSummary(latest)),
      this._select("tabRuleAction", "Popular/Latest 규칙", [
        ["저장하지 않음 (필터 결과만 보기)", "0"], ["현재 조건을 Popular 탭에 저장", "1"],
        ["현재 조건을 Latest 탭에 저장", "2"], ["Popular 탭을 기본값으로 복원", "3"],
        ["Latest 탭을 기본값으로 복원", "4"], ["두 탭 모두 기본값으로 복원", "5"]
      ], false)
    ];
  }

  getSourcePreferences() {
    return [
      {key: "anilife_title_language_v2", listPreference: {title: "작품 제목 언어", summary: "한국어와 일본어 중에서 선택합니다. 변경 후 현재 화면을 새로고침하세요. Anissia에서 매칭되지 않는 작품은 한국어를 유지합니다.", valueIndex: 0, entries: ["한국어", "일본어"], entryValues: ["ko", "ja"]}},
      {key: "anilife_domain_url", editTextPreference: {title: "애니라이프 주소 직접 지정 (선택)", summary: "빈 값이면 토끼 중앙신호등에 등록된 주소를 사용합니다.", value: "", dialogTitle: "애니라이프 주소", dialogMessage: "https://로 시작하는 사이트 주소를 입력하세요. 자동 주소를 쓰려면 비워 두세요."}},
      {key: "anilife_custom_card_json_url", editTextPreference: {title: "커스텀 목록 카드 (선택)", summary: "개인 JSON 주소로 요일별 카드 7장을 설정합니다. 설정한 사용자는 공용 이벤트 카드가 표시되지 않습니다.", value: "", dialogTitle: "커스텀 목록 카드 JSON 주소", dialogMessage: "Google Drive 공개 공유 링크 또는 직접 JSON 주소를 넣으세요. 비워 두면 공용 이벤트 또는 기본 미디어 요일 카드가 표시됩니다."}},
      {key: "anilife_disable_site_subtitles", switchPreferenceCompat: {title: "사이트 자막 끄기", summary: "기본은 꺼짐. 켜면 사이트가 제공하는 외부 자막을 플레이어에 전달하지 않습니다. 영상에 포함된 자막은 제거되지 않습니다.", value: false}}
    ];
  }

  absolute(base, path) {
    const value = this._text(path).trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return this._trimSlash(base) + (value.startsWith("/") ? value : "/" + value);
  }
  contentUrl(base, id, episode) { return this._trimSlash(base) + "/content/" + id + "/" + (episode || 1); }
  idFromUrl(url) {
    const match = this._text(url).match(/\/content\/(\d+)(?:\/|$)/);
    if (!match) throw new Error("작품 주소에서 ID를 찾지 못했습니다: " + url);
    return match[1];
  }
  episodeFromPlaybackUrl(url) {
    const match = this._text(url).match(/\/api\/playback\/(\d+)\/(\d+)(?:\?|$)/);
    if (!match) throw new Error("회차 주소 형식이 올바르지 않습니다: " + url);
    return {animeId: match[1], episode: match[2]};
  }
  _hlsOriginalUrl(value) {
    const url = this._text(value).trim().replace(/#.*$/, "");
    if (!url) return "";
    return /\.(?:m3u8|m3u)$/i.test(url) ? url : url + "#download.m3u8";
  }

  _absoluteMediaUrl(base, value) {
    const url = this._text(value).trim();
    if (!url) return "";
    if (url.startsWith("//")) return "https:" + url;
    if (/^https?:\/\//i.test(url)) return url;
    const origin = this._origin(base);
    if (url.startsWith("/")) return origin + url;
    const match = url.match(/^([^?#]*)([?#].*)?$/);
    const relativePath = match ? match[1] : url;
    const suffix = match && match[2] ? match[2] : "";
    const basePath = this._text(base).replace(origin, "").replace(/[?#].*$/, "").replace(/[^/]*$/, "");
    const parts = (basePath + relativePath).split("/");
    const normalized = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") normalized.pop();
      else normalized.push(part);
    }
    return origin + "/" + normalized.join("/") + suffix;
  }

  async _expandHls(stream, pageUrl, quality) {
    try {
      const manifest = await this._requestText(stream, pageUrl, 15);
      const lines = this._text(manifest).split(/\r?\n/);
      const variants = [];
      for (let index = 0; index < lines.length; index += 1) {
        if (lines[index].trim().indexOf("#EXT-X-STREAM-INF:") !== 0) continue;
        let child = "";
        for (let next = index + 1; next < lines.length; next += 1) {
          const candidate = lines[next].trim();
          if (candidate && !candidate.startsWith("#")) { child = candidate; break; }
        }
        if (!child) continue;
        const info = lines[index];
        const height = (info.match(/RESOLUTION=\d+x(\d+)/i) || [])[1];
        const bandwidth = Number((info.match(/BANDWIDTH=(\d+)/i) || [])[1] || 0);
        const label = height ? height + "p" : bandwidth > 0 ? Math.round(bandwidth / 1000) + "kbps" : quality;
        variants.push({url: this._absoluteMediaUrl(stream, child), quality: label});
      }
      if (variants.length) return variants;
    } catch (_) {}
    return [{url: stream, quality}];
  }

  _proxyApiUrl(base, apiUrl) {
    const path = this._text(apiUrl).replace(/^https?:\/\/[^/]+/i, "");
    if (!/^\/api\/(?:anime(?:\/\d+)?|playback\/\d+\/\d+)(?:\?|$)/.test(path)) throw new Error("허용되지 않은 애니라이프 API 주소입니다.");
    const join = path.indexOf("?") >= 0 ? "&" : "?";
    return this.assetBaseUrl + "/anilife-api" + path.slice(4) + join + "origin=" + encodeURIComponent(this._trimSlash(base));
  }
  async proxyJson(base, apiUrl) {
    const proxyUrl = this._proxyApiUrl(base, apiUrl);
    const body = await this._requestText(proxyUrl, this.assetBaseUrl + "/", 20);
    try { return JSON.parse(body); }
    catch (_) { throw new Error("애니라이프 API가 JSON 대신 다른 내용을 반환했습니다."); }
  }

  _cacheToken(value) {
    const text = this._text(value); let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16);
  }
  async _cachedJson(namespace, apiUrl, ttl) {
    const key = "anilife_cache_" + namespace + "_" + this._cacheToken(apiUrl);
    const timeKey = key + "_time";
    const cached = this._preferenceString(key, "");
    const cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < ttl) {
      try { return JSON.parse(cached); } catch (_) {}
    }
    try {
      const data = await this.proxyJson(this._origin(apiUrl) || this.fallbackBaseUrl, apiUrl);
      this._setPreferenceString(key, JSON.stringify(data));
      this._setPreferenceString(timeKey, String(Date.now()));
      return data;
    } catch (error) {
      if (cached) { try { return JSON.parse(cached); } catch (_) {} }
      throw error;
    }
  }

  _koreaWeekday() {
    return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay()];
  }
  _weekdayName(slug) {
    return ({monday: "월요일", tuesday: "화요일", wednesday: "수요일", thursday: "목요일", friday: "금요일", saturday: "토요일", sunday: "일요일"})[slug] || "오늘";
  }
  _driveDirect(url, image) {
    const value = this._text(url).trim();
    const match = value.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    return match ? "https://drive.google.com/uc?export=" + (image ? "view" : "download") + "&id=" + match[1] : value;
  }
  _customCardSource() { return this._text(this._preference("anilife_custom_card_json_url", "")).trim(); }
  async _customCardUrl(slug, source) {
    if (!source) return "";
    const cacheKey = "anilife_custom_card_cache", sourceKey = cacheKey + "_source", timeKey = cacheKey + "_time";
    let data = null;
    const cached = this._preferenceString(sourceKey, "") === source ? this._preferenceString(cacheKey, "") : "";
    const cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000) { try { data = JSON.parse(cached); } catch (_) {} }
    if (!data) {
      try {
        const direct = this._driveDirect(source, false), join = direct.indexOf("?") >= 0 ? "&" : "?";
        data = JSON.parse(await this._requestText(direct + join + "card_json=" + Date.now(), source, 10));
        this._setPreferenceString(cacheKey, JSON.stringify(data));
        this._setPreferenceString(sourceKey, source);
        this._setPreferenceString(timeKey, String(Date.now()));
      } catch (_) { if (cached) { try { data = JSON.parse(cached); } catch (_) {} } }
    }
    if (!data || typeof data !== "object") return "";
    const cards = data.cards && typeof data.cards === "object" ? data.cards : {};
    let image = this._text(cards[slug] || data.default || data.card).trim();
    if (!image) return "";
    image = this._driveDirect(image, true);
    if (data.revision !== undefined && this._text(data.revision).trim()) image += (image.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(this._text(data.revision));
    return image;
  }
  _parseTime(value) {
    if (!value) return null;
    const time = Date.parse(this._text(value));
    return Number.isFinite(time) ? time : null;
  }
  async _activeEventCard() {
    try {
      const join = this.eventManifestUrl.indexOf("?") >= 0 ? "&" : "?";
      const data = JSON.parse(await this._requestText(this.eventManifestUrl + join + "event_manifest=" + Date.now(), this.eventManifestUrl, 8));
      if (!data || data.enabled !== true) return null;
      const now = Date.now(), startsAt = this._parseTime(data.startsAt), endsAt = this._parseTime(data.endsAt);
      if (startsAt !== null && now < startsAt) return null;
      if (endsAt !== null && now >= endsAt) return null;
      const imageUrl = this._text(data.imageUrl || data.image).trim();
      if (!/^https:\/\//i.test(imageUrl)) return null;
      const revision = this._text(data.revision).trim();
      return {name: this._text(data.name || data.title || "특별 이벤트").trim(), imageUrl: imageUrl + (revision ? (imageUrl.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(revision) : "")};
    } catch (_) { return null; }
  }
  async _tabCard(slug, tab) {
    const day = slug || this._koreaWeekday();
    const customSource = this._customCardSource();
    if (customSource) {
      const customImage = await this._customCardUrl(day, customSource);
      if (customImage) return {name: this._weekdayName(day), link: "/__anilife_weekday_card__/" + day, imageUrl: customImage};
    }
    const event = customSource ? null : await this._activeEventCard();
    if (event) return {name: event.name, link: "/__anilife_event_card__/official", imageUrl: event.imageUrl};
    const official = await dcOfficialListCardSystem("anilife", tab, "오늘의 애니");
    return {name: official.name, link: "/__anilife_weekday_card__/" + day, imageUrl: official.imageUrl};
  }
  async _prependCard(result, page, tab) {
    if (Number(page) !== 1) return result;
    return {list: [await this._tabCard(undefined, tab)].concat(result.list || []), hasNextPage: result.hasNextPage === true};
  }

  toListItem(base, item) {
    const original = item.title || ("작품 " + item.id);
    return {name: original, link: this.contentUrl(base, item.id, 1), imageUrl: this.absolute(base, item.image), __dcTitleMeta: this._titleBridgeMetadataFromItem(original, item)};
  }
  async catalog(page, criteria, query) {
    const base = await this._resolveBaseUrl();
    const rule = this._normalizeCriteria(criteria);
    const params = ["page=" + encodeURIComponent(page), "limit=24", "sort=" + encodeURIComponent(rule.sort), "v=mangayomi-anilife-v1"];
    if (rule.scope) params.push("scope=" + encodeURIComponent(rule.scope));
    if (query) params.push("q=" + encodeURIComponent(query));
    for (const key of ["format", "status", "day", "year", "genre"]) if (rule[key]) params.push(key + "=" + encodeURIComponent(rule[key]));
    const apiUrl = base + "/api/anime?" + params.join("&");
    const data = await this._cachedJson("list", apiUrl, this.cacheMs);
    const items = Array.isArray(data.items) ? data.items : [];
    const pagination = data.pagination || {};
    return {list: items.map((item) => this.toListItem(base, item)), hasNextPage: Number(pagination.page || page) < Number(pagination.pages || 1)};
  }
  async getPopular(page) { return this._localizeResult(await this._prependCard(await this.catalog(page, this._tabRule(this.popularRulePreference, this._defaultPopularRule()), ""), page, "popular")); }
  async getLatestUpdates(page) { return this._localizeResult(await this._prependCard(await this.catalog(page, this._tabRule(this.latestRulePreference, this._defaultLatestRule()), ""), page, "latest")); }
  async search(query, page, filters) {
    const criteria = this._filterCriteria(filters);
    const result = await this.catalog(page, criteria, this._text(query).trim());
    this._applyTabRuleAction(page, filters, criteria);
    return this._localizeResult(result);
  }

  async getDetail(url) {
    const card = this._text(url).match(/\/__anilife_(weekday|event)_card__\/(\w+)/);
    if (card) {
      const item = card[1] === "event" ? await this._tabCard() : await this._tabCard(card[2]);
      return {name: item.name, link: item.link, imageUrl: item.imageUrl, author: "애니라이프", artist: "", description: "목록을 구분하는 안내 카드입니다. 뒤로 돌아가 작품을 선택해 주세요.", genre: [card[1] === "event" ? "이벤트 안내" : "요일 안내"], status: 0, episodes: [], chapters: []};
    }
    const id = this.idFromUrl(url);
    const base = await this._resolveBaseUrl();
    const data = await this._cachedJson("detail", base + "/api/anime/" + id + "?v=playback-policy-v2", this.cacheMs);
    const item = data.item;
    if (!item || String(item.id) !== id) throw new Error("작품 상세 응답이 올바르지 않습니다.");
    const episodes = (Array.isArray(item.episodes) ? item.episodes : []).filter(function(episode) {
      return episode && episode.playable === true && episode.playbackUrl;
    }).map((episode, index) => {
      const number = this.formatEpisode(episode.number || (index + 1));
      const originalName = this._text(episode.title).trim() || (number + "화");
      return {
        name: number + "화 .  " + originalName,
        url: this.absolute(base, episode.playbackUrl),
        dateUpload: episode.date ? this._text(episode.date) : "",
        scanlator: "",
        isFiller: false
      };
    });
    const people = [item.studio, item.director].map((value) => this._text(value).trim()).filter(Boolean);
    const detailLanguage = await this._freshDetailTitleLanguage();
    return {
      name: await this._localizedTitle(item.title || ("작품 " + id), this._titleBridgeMetadataFromItem(item.title || ("작품 " + id), item), detailLanguage), link: this.contentUrl(base, id, 1), imageUrl: this.absolute(base, item.image),
      description: item.description || "", author: people.join(" · "), artist: "", genre: Array.isArray(item.genres) ? item.genres : [],
      status: item.status === "완결" ? 1 : 0, episodes, chapters: episodes
    };
  }

  async getVideoList(url) {
    const info = this.episodeFromPlaybackUrl(url);
    const base = await this._resolveBaseUrl();
    const pageUrl = this.contentUrl(base, info.animeId, info.episode);
    let data = null;
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        data = await this.proxyJson(base, base + "/api/playback/" + info.animeId + "/" + info.episode + "?request=" + Date.now() + "-" + attempt);
        if (data && (data.videoUrl || data.backupUrl)) break;
        lastError = new Error("사이트가 재생 주소를 제공하지 않았습니다.");
      } catch (error) { lastError = error; }
    }
    const candidates = data ? [data.videoUrl, data.backupUrl].filter(function(value, index, all) { return value && all.indexOf(value) === index; }) : [];
    if (!candidates.length) throw lastError || new Error("사이트가 재생 주소를 제공하지 않았습니다.");
    const subtitles = this._siteSubtitlesDisabled() ? [] : (data.subtitleUrl ? [{file: this.absolute(base, data.subtitleUrl), label: "사이트 자막"}] : []);
    const videos = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const value = candidates[index];
      const stream = this.absolute(base, value);
      const quality = index === 0 ? "자동 (HLS)" : "보조 영상";
      const expanded = await this._expandHls(stream, pageUrl, quality);
      for (const item of expanded) {
        videos.push({url: item.url, originalUrl: this._hlsOriginalUrl(item.url), quality: item.quality, headers: {Referer: pageUrl, Origin: base}, subtitles, audios: []});
      }
    }
    return videos;
  }

  formatEpisode(number) { const value = Number(number); return Number.isInteger(value) ? String(value) : this._text(number); }
  async getPageList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }
}
