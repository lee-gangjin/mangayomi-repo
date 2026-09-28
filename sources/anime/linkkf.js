const mangayomiSources = [{
  name: "Linkkf 애니",
  lang: "ko",
  baseUrl: "https://linkkf.tv",
  apiUrl: "",
  iconUrl: "https://dc-toki-mangayomi-media.pages.dev/icon/ko.linkkf-anime.png",
  typeSource: "single",
  itemType: 1,
  isNsfw: true,
  hasCloudflare: false,
  version: "0.1.14",
  dateFormat: "",
  dateFormatLocale: "",
  pkgPath: "anime/src/ko/linkkf.js",
  notes: "목록·상세 제목 한국어/일본어 전환 · 제목 언어 설정 캐시 키 갱신 · Anissia 일본어 원제 우선 + AniList 보조 · 새로고침 즉시 반영 · 기본 설정 · Popular: TOP 오늘 · Latest: Anime 전체 조건 · 필터 규칙 저장 · 커스텀 목록 카드 · 사이트 자막 끄기 옵션 · 재생 서버 병렬 확인 · 중앙신호등 주소 자동 적용"
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
    const response = await new Client({ persistentConnection: false, timeout: 8, connectTimeout: 5 }).get(
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
    const response = await new Client({ persistentConnection: false, timeout: 8, connectTimeout: 5 }).get(
      manifestUrl + "?event_manifest=" + Date.now(),
      { Accept: "application/json, text/plain, */*", Referer: "https://dc-toki-mangayomi-media.pages.dev/" }
    );
    if (!response || response.statusCode < 200 || response.statusCode >= 300) return null;
    const data = JSON.parse(String(response.body || ""));
    if (!data || data.enabled !== true) return null;
    const parseTime = function(value) {
      if (!value) return null;
      const time = Date.parse(String(value));
      return Number.isFinite(time) ? time : null;
    };
    const now = Date.now(), startsAt = parseTime(data.startsAt), endsAt = parseTime(data.endsAt);
    if (startsAt !== null && now < startsAt) return null;
    if (endsAt !== null && now >= endsAt) return null;
    const imageUrl = String(data.imageUrl || data.image || "").trim();
    if (!/^https:\/\//i.test(imageUrl)) return null;
    const revision = String(data.revision || "").trim();
    return {
      name: String(data.name || data.title || "특별 이벤트").trim(),
      imageUrl: imageUrl + (revision ? (imageUrl.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(revision) : "")
    };
  } catch (_) {
    return null;
  }
}

function dcApplySiteOrderEpisodeNumbers(detail) {
  if (!detail || typeof detail !== "object") return detail;
  const items = Array.isArray(detail.episodes) ? detail.episodes : (Array.isArray(detail.chapters) ? detail.chapters : []);
  if (!items.length) return detail;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item || typeof item !== "object") continue;
    const originalName = String(item.name == null ? "" : item.name).trim() || "재생";
    item.name = String(items.length - index) + "화 .  " + originalName;
  }
  detail.episodes = items;
  detail.chapters = items;
  return detail;
}

class DefaultExtension extends MProvider {
  constructor() {
    super();
    const originalGetDetail = DefaultExtension.prototype.getDetail.bind(this);
    this.getDetail = async (url) => dcApplySiteOrderEpisodeNumbers(await originalGetDetail(url));
    this.signalUrl = "https://wankyo83.github.io/tokki-traffic-light/domains.json";
    this.fallbackBaseUrl = "https://linkkf.tv";
    this.assetBaseUrl = "https://dc-toki-mangayomi-media.pages.dev";
    this.userAgent = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
    this.popularRulePreference = "linkkf_anime_popular_rule_v1";
    this.latestRulePreference = "linkkf_anime_latest_rule_v1";
    this.titleLanguagePreference = "linkkf_anime_title_language_v2";
    this.titleCachePrefix = "linkkf_anime_title_meta_v3_";
    this.genres = [
      ["전체", ""], ["Action", "Action"], ["Webtoon", "Webtoon"], ["Mystery", "Mystery"],
      ["Romance", "Romance"], ["Sci-Fi", "Sci-Fi"], ["Slice of Life", "Slice of Life"],
      ["Sports", "Sports"], ["Adventure", "Adventure"], ["Avant Garde", "Avant Garde"],
      ["Boys Love", "Boys Love"], ["Comedy", "Comedy"], ["Drama", "Drama"],
      ["Fantasy", "Fantasy"], ["Girls Love", "Girls Love"], ["Gourmet", "Gourmet"],
      ["Horror", "Horror"], ["Supernatural", "Supernatural"], ["Suspense", "Suspense"],
      ["Seinen", "Seinen"], ["Shoujo", "Shoujo"], ["Shounen", "Shounen"],
      ["Military", "Military"], ["Music", "Music"], ["School", "School"],
      ["CN Animation", "CN Animation"]
    ];
    this.years = [["전체", ""]];
    for (let year = 2026; year >= 1990; year--) this.years.push([String(year), String(year)]);
    this.types = [["전체", ""], ["TV", "TV"], ["Movie", "Movie"], ["OVA", "OVA"]];
    this.topLists = [["오늘", "today"], ["이번 주", "week"], ["이번 달", "month"], ["전체", "all"]];
  }

  get supportsLatest() { return true; }

  _text(value) { return value === null || value === undefined ? "" : String(value); }
  _trimSlash(value) { return this._text(value).trim().replace(/\/+$/, ""); }

  _preference(key, fallback) {
    try {
      const value = new SharedPreferences().get(key);
      return value === null || value === undefined ? fallback : value;
    } catch (_) { return fallback; }
  }

  _preferenceString(key, fallback) {
    try {
      const value = new SharedPreferences().getString(key, fallback);
      return value === null || value === undefined ? fallback : this._text(value);
    } catch (_) { return fallback; }
  }

  _setPreferenceString(key, value) {
    try { new SharedPreferences().setString(key, this._text(value)); } catch (_) {}
  }

  _titleCacheToken(value) {
    const text = this._text(value); let hash = 2166136261;
    for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }

  _titleLanguage() {
    const value = this._text(this._preference(this.titleLanguagePreference, this._preferenceString(this.titleLanguagePreference, "ko"))).trim().toLowerCase();
    return value === "ja" || value === "1" || value.indexOf("일본") >= 0 ? "ja" : "ko";
  }

  async _freshDetailTitleLanguage() {
    // Mangayomi persists source preference changes asynchronously. A detail refresh can
    // otherwise beat that write on fast sites and keep the previous language until the
    // screen is reopened. Re-read after a short local-only settling window.
    if (typeof setTimeout === "function") await this._pause(250);
    return this._titleLanguage();
  }

  _titleBridgeKey(value) { let text = this._text(value); try { text = text.normalize("NFKC"); } catch (_) {} return text.toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ヶ一-龯]+/g, ""); }
  _anissiaSearchNames(value) { const original = this._text(value).trim(), cleaned = original.replace(/\s*[\(\[]?\d{4}[\)\]]?\s*$/g, "").replace(/\s*[\(\[](더빙|자막|무삭제)[\)\]]\s*$/g, "").replace(/^\s*\((고화질|저화질)\)\s*/g, "").replace(/\s+BD\s*$/i, "").trim(), plain = cleaned.replace(/[~～!！「」『』…:：·・,]+/g, " ").replace(/\s+/g, " ").trim(), season = plain.replace(/시즌\s*(\d+)/g, "$1기"), numbered = season.replace(/\s+(\d+)$/g, " $1기"), korean = (season.match(/^[가-힣0-9][가-힣0-9\s:：\-·・~～!?！？'’.,]*/) || [""])[0].replace(/[\s:：\-·・~～!?！？'’.,]+$/g, "").trim(); return [original, cleaned, plain, season, numbered, korean].filter(function(item, index, list) { return item && list.indexOf(item) === index; }); }
  async _anissiaMetadata(original) { const names = this._anissiaSearchNames(original); for (const query of names) { try { const response = await new Client({ persistentConnection: false, timeout: 7, connectTimeout: 4 }).get("https://api.anissia.net/anime/list/0?q=" + encodeURIComponent(query), { Accept: "application/json", Referer: "https://anissia.net/anime" }); if (!response || response.statusCode < 200 || response.statusCode >= 300) continue; const payload = JSON.parse(this._text(response.body)), items = payload && payload.data && Array.isArray(payload.data.content) ? payload.data.content : [], wanted = this._titleBridgeKey(query), match = items.find((item) => this._titleBridgeKey(item && item.subject) === wanted); if (match && this._text(match.originalSubject).trim()) return { ko: original, ja: this._text(match.originalSubject).trim(), anissiaId: Number(match.animeNo) || 0, confidence: 500 }; } catch (_) {} } return null; }

  async _titleBridgeOrigin() {
    const cached = this._trimSlash(this._preferenceString("dc_title_bridge_anilife_origin", "")), cachedAt = Number(this._preferenceString("dc_title_bridge_anilife_origin_time", "0"));
    if (/^https:\/\/(?:www\.)?anilife\d+\.tv$/i.test(cached) && cachedAt > 0 && Date.now() - cachedAt < 10 * 60 * 1000) return cached;
    try { const response = await new Client({ persistentConnection: false, timeout: 8, connectTimeout: 5 }).get(this.signalUrl, { Accept: "application/json", "Cache-Control": "no-cache" }); const data = JSON.parse(this._text(response.body)), candidate = this._trimSlash(data && data.domains && data.domains.anilife && data.domains.anilife.baseUrl); if (/^https:\/\/(?:www\.)?anilife\d+\.tv$/i.test(candidate)) { this._setPreferenceString("dc_title_bridge_anilife_origin", candidate); this._setPreferenceString("dc_title_bridge_anilife_origin_time", String(Date.now())); return candidate; } } catch (_) {}
    return /^https:\/\/(?:www\.)?anilife\d+\.tv$/i.test(cached) ? cached : "https://anilife01.tv";
  }

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
    const japanese = this._text(item.titleJp).trim(), english = this._plainEnglishTitle(item.titleOriginal);
    if (!japanese && !english) return null;
    return { ko: original, ja: japanese, en: english, romaji: english, sourceId: Number(item.id) || 0, confidence: 200 };
  }

  _metadataFromAniListMedia(original, media) {
    if (!media || !media.id) return null;
    const title = media.title || {};
    return { ko: original, ja: this._text(title.native).trim(), en: this._text(title.english || title.romaji).trim(), romaji: this._text(title.romaji).trim(), anilistId: Number(media.id), confidence: 300 };
  }

  async _aniListMetadata(original, candidate, anilistId) {
    try {
      const byId = Number(anilistId) > 0;
      const query = byId ? "query($id:Int!){Media(id:$id,type:ANIME){id synonyms title{romaji english native}}}" : "query($search:String!){Page(page:1,perPage:12){media(search:$search,type:ANIME){id synonyms title{romaji english native}}}}";
      const variables = byId ? { id: Number(anilistId) } : { search: this._text(candidate).trim() };
      if (!byId && !variables.search) return null;
      const response = await new Client({ persistentConnection: false, timeout: 12, connectTimeout: 6 }).post("https://graphql.anilist.co", { "Content-Type": "application/json", Accept: "application/json" }, JSON.stringify({ query, variables }));
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
      const response = await new Client({ persistentConnection: false, timeout: 10, connectTimeout: 6 }).get(this._text(url).trim(), { Accept: "text/html,application/xhtml+xml", Referer: "https://linkkf.tv/" });
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
      const base = await this._titleBridgeOrigin();
      for (const query of this._anissiaSearchNames(name)) {
        const response = await new Client({ persistentConnection: false, timeout: 10, connectTimeout: 6 }).get(base + "/api/anime?page=1&limit=10&q=" + encodeURIComponent(query), { Accept: "application/json, text/plain, */*", Referer: base + "/" });
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
    const original = this._text(name).trim(); if (!original) return null;
    const key = this.titleCachePrefix + this._titleCacheToken(original), timeKey = key + "_time";
    const cached = this._preferenceString(key, ""), cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0) { try { const parsed = JSON.parse(cached), ttl = parsed && parsed.miss ? 6 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000; if (Date.now() - cachedAt < ttl) return parsed && parsed.miss ? null : parsed; } catch (_) {} }
    try {
      const data = await this._fillBridgeMetadata(await this._titleBridgeMetadata(original)); if (!data || !data.ja) { this._setPreferenceString(key, JSON.stringify({ miss: true })); this._setPreferenceString(timeKey, String(Date.now())); return null; }
      this._setPreferenceString(key, JSON.stringify(data)); this._setPreferenceString(timeKey, String(Date.now())); return data;
    } catch (_) { return null; }
  }

  async _localizedTitle(name, languageOverride) {
    const original = this._text(name).trim(), language = languageOverride || this._titleLanguage();
    if (!original || language === "ko") return original;
    const data = await this._titleMetadata(original), localized = data ? this._text(data[language]).trim() : "";
    return localized || original;
  }

  async _localizeResult(result) {
    if (!result || !Array.isArray(result.list) || this._titleLanguage() === "ko") return result;
    const items = result.list, workers = []; let cursor = 0;
    const work = async () => { while (true) { const index = cursor++; if (index >= items.length) return; const item = items[index]; if (!item || /\/__linkkf_weekday_card__\//.test(this._text(item.link))) continue; item.name = await this._localizedTitle(item.name); } };
    for (let index = 0; index < Math.min(4, items.length); index++) workers.push(work());
    await Promise.all(workers); return result;
  }

  _siteSubtitlesDisabled() {
    const value = this._preference("linkkf_anime_disable_site_subtitles", false);
    return value === true || this._text(value).toLowerCase() === "true" || this._text(value) === "1";
  }

  _isAllowedBaseUrl(value) {
    return /^https:\/\/(?:www\.)?linkkf\.(?:tv|com)\/?$/i.test(this._text(value).trim());
  }

  async _resolveBaseUrl() {
    const manual = this._text(this._preference("linkkf_anime_domain_url", "")).trim();
    if (this._isAllowedBaseUrl(manual)) return this._trimSlash(manual);
    try {
      const response = await new Client({ persistentConnection: false, timeout: 8, connectTimeout: 5 }).get(this.signalUrl, {
        "User-Agent": this.userAgent, "Accept": "application/json", "Cache-Control": "no-cache"
      });
      if (response.statusCode >= 200 && response.statusCode < 300) {
        const data = JSON.parse(response.body);
        const candidate = data && data.domains && data.domains.linkkf ? data.domains.linkkf.baseUrl : "";
        if (this._isAllowedBaseUrl(candidate)) return this._trimSlash(candidate);
      }
    } catch (_) {}
    const configured = this.source && this.source.baseUrl ? this.source.baseUrl : "";
    return this._isAllowedBaseUrl(configured) ? this._trimSlash(configured) : this.fallbackBaseUrl;
  }

  _origin(value) {
    const match = this._text(value).match(/^(https?:\/\/[^/]+)/i);
    return match ? match[1] : "";
  }

  _relativePath(value) {
    let raw = this._text(value).trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) raw = raw.replace(/^https?:\/\/[^/]+/i, "");
    if (!raw.startsWith("/")) raw = "/" + raw;
    return raw;
  }

  _absoluteUrl(base, value) {
    let raw = this._text(value).trim().replace(/\\\//g, "/").replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
    if (!raw) return "";
    if (raw.startsWith("//")) return "https:" + raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/")) return this._origin(base) + raw;
    return base.replace(/[?#].*$/, "").replace(/[^/]*$/, "") + raw;
  }

  _requestHeaders(url, referer) {
    const targetOrigin = this._origin(url) || this.fallbackBaseUrl;
    return {
      "User-Agent": this.userAgent,
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Referer": referer || targetOrigin + "/"
    };
  }

  async _pause(milliseconds) {
    if (typeof setTimeout === "function") await new Promise(function(resolve) { setTimeout(resolve, milliseconds); });
  }

  _failureCode(response, cause) {
    const status = response && response.statusCode ? Number(response.statusCode) : 0;
    if (status) return "HTTP" + status;
    const text = this._text(cause && (cause.message || cause));
    if (/timed?\s*out|timeout/i.test(text)) return "TIMEOUT";
    if (/certificate|handshake|TLS|SSL/i.test(text)) return "TLS";
    return "NETWORK";
  }

  _unwrapHtml(value) {
    const body = this._text(value);
    const trimmed = body.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        const decoded = JSON.parse(trimmed);
        if (typeof decoded === "string") return decoded;
      } catch (_) {}
    }
    return body;
  }

  async _requestText(url, referer, stage, extraHeaders) {
    const transports = [
      { name: "RHTTP", options: { persistentConnection: false, timeout: 25, connectTimeout: 10 } },
      { name: "DART", options: { useDartHttpClient: true, persistentConnection: false } }
    ];
    const diagnostics = [];
    for (const transport of transports) {
      try {
        const headers = this._requestHeaders(url, referer); Object.assign(headers, extraHeaders || {});
        const response = await new Client(transport.options).get(url, headers);
        if (response.statusCode >= 200 && response.statusCode < 300) return this._unwrapHtml(response.body);
        diagnostics.push(transport.name + "=" + this._failureCode(response, null));
      } catch (error) {
        diagnostics.push(transport.name + "=" + this._failureCode(null, error));
        if (transport.name === "RHTTP") await this._pause(160);
      }
    }
    throw new Error("Linkkf 애니 " + (stage || "요청") + " 연결에 실패했습니다. 진단: " + diagnostics.join(","));
  }

  _koreaWeekday() {
    const day = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
    return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day];
  }

  _weekdayName(slug) {
    return { monday: "월요일", tuesday: "화요일", wednesday: "수요일", thursday: "목요일", friday: "금요일", saturday: "토요일", sunday: "일요일" }[slug] || "오늘";
  }

  _driveDirect(url, image) {
    const value = this._text(url).trim();
    const match = value.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    return match ? "https://drive.google.com/uc?export=" + (image ? "view" : "download") + "&id=" + match[1] : value;
  }

  async _customCardUrl(slug) {
    const source = this._text(this._preference("linkkf_anime_custom_card_json_url", "")).trim();
    if (!source) return "";
    const preferences = new SharedPreferences(), cacheKey = "linkkf_anime_custom_card_cache", sourceKey = cacheKey + "_source", timeKey = cacheKey + "_time";
    let data = null, cached = "";
    if (this._preferenceString(sourceKey, "") === source) cached = this._preferenceString(cacheKey, "");
    const cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000) { try { data = JSON.parse(cached); } catch (_) {} }
    if (!data) {
      try {
        const direct = this._driveDirect(source, false), join = direct.indexOf("?") >= 0 ? "&" : "?";
        data = JSON.parse(await this._requestText(direct + join + "card_json=" + Date.now(), source, "커스텀 목록 카드", { "Accept": "application/json", "Cache-Control": "no-cache" }));
        preferences.setString(cacheKey, JSON.stringify(data)); preferences.setString(sourceKey, source); preferences.setString(timeKey, String(Date.now()));
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

  async _tabCard(slug, tab) {
    const weekday = slug || this._koreaWeekday();
    const customSource = this._text(this._preference("linkkf_anime_custom_card_json_url", "")).trim();
    const customImage = await this._customCardUrl(weekday);
    const event = customSource ? null : await dcOfficialEventCard();
    const official = customImage || event ? null : await dcOfficialListCardSystem("linkkf_anime", tab, "오늘의 애니");
    return {
      name: customImage ? this._weekdayName(weekday) : event ? event.name : official.name,
      link: "/__linkkf_weekday_card__/" + weekday,
      imageUrl: customImage || (event && event.imageUrl) || official.imageUrl
    };
  }

  _defaultPopularRule() { return { mode: "today", genre: "", year: "", type: "" }; }
  _defaultLatestRule() { return { mode: "anime", genre: "", year: "", type: "" }; }

  _allowed(value, pairs, fallback) {
    const text = this._text(value);
    return pairs.some(function(pair) { return pair[1] === text; }) ? text : fallback;
  }

  _normalizeRule(rule, fallback) {
    const source = rule || fallback || this._defaultLatestRule();
    const modes = ["anime", "ani16", "today", "week", "month", "all"];
    const mode = modes.indexOf(source.mode) >= 0 ? source.mode : "anime";
    const detailed = mode === "anime" || mode === "ani16";
    return {
      mode: mode,
      genre: detailed ? this._allowed(source.genre, this.genres, "") : "",
      year: detailed ? this._allowed(source.year, this.years, "") : "",
      type: detailed ? this._allowed(source.type, this.types, "") : ""
    };
  }

  _encodeRule(rule) {
    const normalized = this._normalizeRule(rule, this._defaultLatestRule());
    return ["1", normalized.mode, normalized.genre, normalized.year, normalized.type].join("|");
  }

  _decodeRule(value, fallback) {
    const parts = this._text(value).split("|");
    if (parts.length !== 5 || parts[0] !== "1") return this._normalizeRule(fallback, this._defaultLatestRule());
    return this._normalizeRule({ mode: parts[1], genre: parts[2], year: parts[3], type: parts[4] }, fallback);
  }

  _tabRule(key, fallback) {
    const encoded = this._preferenceString(key, "");
    return encoded ? this._decodeRule(encoded, fallback) : this._normalizeRule(fallback, this._defaultLatestRule());
  }

  _nameFor(pairs, value, fallback) {
    const found = pairs.find(function(pair) { return pair[1] === value; });
    return found ? found[0] : fallback;
  }

  _ruleSummary(rule) {
    const normalized = this._normalizeRule(rule, this._defaultLatestRule());
    if (normalized.mode === "today") return "TOP 오늘";
    if (normalized.mode === "week") return "TOP 이번 주";
    if (normalized.mode === "month") return "TOP 이번 달";
    if (normalized.mode === "all") return "TOP 전체";
    return [normalized.mode === "ani16" ? "Ani16+" : "Anime", this._nameFor(this.genres, normalized.genre, "전체"), this._nameFor(this.years, normalized.year, "전체"), this._nameFor(this.types, normalized.type, "전체")].join(" + ");
  }

  _listPath(page, rule) {
    const normalized = this._normalizeRule(rule, this._defaultLatestRule());
    const top = { today: "/label/topday/", week: "/label/week/", month: "/label/month/", all: "/label/view/" };
    if (top[normalized.mode]) return top[normalized.mode];
    let path = normalized.mode === "ani16" ? "/list/9/" : "/list/2/";
    if (normalized.genre) path += "class/" + encodeURIComponent(normalized.genre) + "/";
    if (normalized.type) path += "lang/" + encodeURIComponent(normalized.type) + "/";
    if (Number(page) > 1) path += "page/" + Math.max(1, Number(page) || 1) + "/";
    if (normalized.year) path += "year/" + encodeURIComponent(normalized.year) + "/";
    return path;
  }

  _imageUrl(base, item) {
    if (!item) return "";
    for (const key of ["data-original", "data-src", "src"]) {
      const value = this._text(item.attr(key)).trim();
      if (value && !/^data:/i.test(value)) return this._absoluteUrl(base, value);
    }
    return "";
  }

  _parseCards(document, base, paginated) {
    const list = [];
    const seen = {};
    for (const item of document.select(".vod-item")) {
      const link = item.selectFirst(".vod-item-title a[href]");
      if (!link) continue;
      const name = this._text(link.text).trim();
      const path = this._relativePath(link.attr("href"));
      if (!name || !/\/ani\//i.test(path) || seen[path]) continue;
      const image = item.selectFirst("[data-original]") || item.selectFirst("img");
      list.push({ name: name, link: path, imageUrl: this._imageUrl(base, image) });
      seen[path] = true;
    }
    let hasNextPage = false;
    if (paginated !== false) {
      for (const link of document.select("li:not(.disabled) > a[href]")) {
        if (link.selectFirst(".fa-angle-right")) hasNextPage = true;
      }
    }
    return { list: list, hasNextPage: list.length > 0 && hasNextPage };
  }

  async _list(page, rule) {
    const normalized = this._normalizeRule(rule, this._defaultLatestRule());
    const paginated = normalized.mode === "anime" || normalized.mode === "ani16";
    if (Number(page) > 1 && !paginated) return { list: [], hasNextPage: false };
    const base = await this._resolveBaseUrl();
    const url = base + this._listPath(page, normalized);
    return this._parseCards(new Document(await this._requestText(url, base + "/", "목록")), base, paginated);
  }

  async _prependTabCard(result, page, tab) {
    if (Number(page) !== 1) return result;
    return { list: [await this._tabCard(undefined, tab)].concat(result.list || []), hasNextPage: result.hasNextPage === true };
  }

  async getPopular(page) {
    return this._localizeResult(await this._prependTabCard(await this._list(page, this._tabRule(this.popularRulePreference, this._defaultPopularRule())), page, "popular"));
  }

  async getLatestUpdates(page) {
    return this._localizeResult(await this._prependTabCard(await this._list(page, this._tabRule(this.latestRulePreference, this._defaultLatestRule())), page, "latest"));
  }

  _normalizeSearch(value) {
    let text = this._text(value);
    try { text = text.normalize("NFKC"); } catch (_) {}
    return text.trim().replace(/\s+/g, " ");
  }

  _searchKey(value) { return this._normalizeSearch(value).toLowerCase().replace(/\s+/g, ""); }

  _filterValue(filters, type, fallback) {
    if (!Array.isArray(filters)) return fallback;
    for (const filter of filters) {
      if (!filter || filter.type !== type || !Array.isArray(filter.values)) continue;
      const option = filter.values[Number(filter.state) || 0];
      return option && option.value !== undefined ? this._text(option.value) : fallback;
    }
    return fallback;
  }

  _filterRule(filters) {
    const unset = "__unset__";
    const anime = {
      genre: this._filterValue(filters, "animeGenre", unset),
      year: this._filterValue(filters, "animeYear", unset),
      type: this._filterValue(filters, "animeType", unset)
    };
    const ani16 = {
      genre: this._filterValue(filters, "ani16Genre", unset),
      year: this._filterValue(filters, "ani16Year", unset),
      type: this._filterValue(filters, "ani16Type", unset)
    };
    const top = this._filterValue(filters, "topList", unset);
    const animeTouched = Object.keys(anime).some(function(key) { return anime[key] !== unset; });
    const ani16Touched = Object.keys(ani16).some(function(key) { return ani16[key] !== unset; });
    const topTouched = top !== unset;
    const count = (animeTouched ? 1 : 0) + (ani16Touched ? 1 : 0) + (topTouched ? 1 : 0);
    if (count > 1) throw new Error("Anime, Ani16+, TOP 중 한 구역만 선택하세요.");
    if (animeTouched) return this._normalizeRule({ mode: "anime", genre: anime.genre === unset ? "" : anime.genre, year: anime.year === unset ? "" : anime.year, type: anime.type === unset ? "" : anime.type }, this._defaultLatestRule());
    if (ani16Touched) return this._normalizeRule({ mode: "ani16", genre: ani16.genre === unset ? "" : ani16.genre, year: ani16.year === unset ? "" : ani16.year, type: ani16.type === unset ? "" : ani16.type }, this._defaultLatestRule());
    if (topTouched) return this._normalizeRule({ mode: top }, this._defaultPopularRule());
    return null;
  }

  _applyTabRuleAction(page, filters, rule) {
    if (Number(page) !== 1) return;
    const action = Number(this._filterValue(filters, "tabRuleAction", "0"));
    const preferences = new SharedPreferences();
    if (action === 1) preferences.setString(this.popularRulePreference, this._encodeRule(rule));
    else if (action === 2) preferences.setString(this.latestRulePreference, this._encodeRule(rule));
    else if (action === 3) preferences.setString(this.popularRulePreference, "");
    else if (action === 4) preferences.setString(this.latestRulePreference, "");
    else if (action === 5) {
      preferences.setString(this.popularRulePreference, "");
      preferences.setString(this.latestRulePreference, "");
    }
  }

  async search(query, page, filters) {
    const normalized = this._normalizeSearch(query);
    if (normalized) {
      const base = await this._resolveBaseUrl();
      const url = base + "/view/?wd=" + encodeURIComponent(normalized) + "&page=" + Math.max(1, Number(page) || 1);
      const result = this._parseCards(new Document(await this._requestText(url, base + "/", "검색")), base, true);
      const wanted = this._searchKey(normalized);
      const matches = result.list.filter((item) => this._searchKey(item.name).indexOf(wanted) >= 0);
      return this._localizeResult({ list: matches.length ? matches : result.list, hasNextPage: result.hasNextPage });
    }

    const action = Number(this._filterValue(filters, "tabRuleAction", "0"));
    let rule = this._filterRule(filters);
    if (!rule && action >= 3 && action <= 5) rule = action === 3 ? this._defaultPopularRule() : this._defaultLatestRule();
    if (!rule) throw new Error("Linkkf 애니 필터에서 Anime, Ani16+, TOP 중 한 구역을 선택하세요.");
    const result = await this._list(page, rule);
    this._applyTabRuleAction(page, filters, rule);
    return this._localizeResult(result);
  }

  _parseEpisodes(document) {
    const episodes = [];
    const seen = {};
    for (const link of document.select(".episodelist a[href]")) {
      const path = this._relativePath(link.attr("href"));
      if (!/\/watch\//i.test(path) || seen[path]) continue;
      const label = this._text(link.text).trim();
      episodes.push({ name: label ? label + "화" : "재생", url: path });
      seen[path] = true;
    }
    return episodes;
  }

  async getDetail(url) {
    const card = this._text(url).match(/\/__linkkf_weekday_card__\/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (card) {
      const item = await this._tabCard(card[1]);
      return {
        name: item.name, link: item.link, imageUrl: item.imageUrl, author: "Linkkf 애니",
        description: "오늘의 시간 흐름을 담은 움직이는 요일 카드입니다. 뒤로 돌아가 작품을 선택해 주세요.",
        genre: ["요일 안내"], status: 0, episodes: [], chapters: []
      };
    }

    const base = await this._resolveBaseUrl();
    const path = this._relativePath(url);
    if (!/\/ani\//i.test(path)) throw new Error("잘못된 Linkkf 작품 주소입니다.");
    const detailUrl = base + path;
    const document = new Document(await this._requestText(detailUrl, base + "/", "상세"));
    const title = document.selectFirst("h1.detail-info-title");
    if (!title) throw new Error("Linkkf 작품 제목을 찾지 못했습니다.");
    const cover = document.selectFirst(".detail-img [data-original]") || document.selectFirst(".detail-img img");
    const genres = document.select(".detail-info-desc a[href]").filter((node) => /\/class\//i.test(this._text(node.attr("href")))).map((node) => this._text(node.text).trim()).filter(Boolean);
    const authors = document.select(".detail-info-desc a[href]").filter((node) => /\/director\//i.test(this._text(node.attr("href")))).map((node) => this._text(node.text).trim()).filter(Boolean);
    const description = document.select(".detail-info-desc li").map((node) => this._text(node.text).trim()).filter(Boolean).join("\n");
    const episodes = this._parseEpisodes(document);
    const detailLanguage = await this._freshDetailTitleLanguage();
    return {
      name: await this._localizedTitle(this._text(title.text).trim(), detailLanguage), link: path, imageUrl: this._imageUrl(base, cover),
      author: authors.join(", "), description: description, genre: genres, status: 0,
      episodes: episodes, chapters: episodes
    };
  }

  _playerEndpoint(value) {
    const clean = this._text(value).split(/[?#]/)[0];
    return /\/play(?:hd[0-9]*)?\.php$/i.test(clean);
  }

  _extractPlayerUrls(document, base) {
    const urls = [];
    const seen = {};
    for (const script of document.select("script")) {
      const data = this._text(script.data || script.text);
      if (data.indexOf("var player_aaaa=") < 0) continue;
      const actual = data.match(/var\s+player_aaaa\s*=\s*[\s\S]*?["']actual_url["']\s*:\s*["']([^"']+)["']/);
      if (actual) urls.push(this._absoluteUrl(base, actual[1]));
    }
    for (const node of document.select("[data-url], .player a[href]")) {
      const candidate = this._text(node.attr("data-url") || node.attr("href")).trim();
      if (candidate) urls.push(this._absoluteUrl(base, candidate));
    }
    return urls.filter((url) => {
      if (!url || !this._playerEndpoint(url) || seen[url]) return false;
      seen[url] = true;
      return true;
    });
  }

  _artConfiguration(scripts) {
    const marker = /new\s+Artplayer\s*\(\s*\{/g.exec(scripts);
    if (!marker) return "";
    let start = marker.index + marker[0].lastIndexOf("{");
    let depth = 0, quote = "", escaped = false;
    for (let index = start; index < scripts.length; index++) {
      const char = scripts[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
      } else if (char === "'" || char === '"' || char === "`") quote = char;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) return scripts.slice(start, index + 1);
    }
    return "";
  }

  _playerFields(scripts) {
    const legacy = scripts.match(/\bvideoUrl\s*:\s*["']([^"']+)["']/i);
    const art = this._artConfiguration(scripts);
    const hls = art.match(/\burl\s*:\s*["']([^"']+\.m3u8(?:\?[^"']*)?)["']/i);
    const subtitleBlock = art.match(/\bsubtitle\s*:\s*\{([\s\S]*?)\}/i);
    const subtitle = subtitleBlock ? subtitleBlock[1].match(/\burl\s*:\s*["']([^"']+)["']/i) : null;
    return { video: legacy ? legacy[1] : (hls ? hls[1] : ""), subtitle: subtitle ? subtitle[1] : "" };
  }

  _subtitleTracks(scripts, playerUrl, artSubtitle) {
    const result = [];
    const seen = {};
    const tracks = scripts.match(/tracks\s*:\s*(\[[\s\S]*?\])/i);
    if (tracks) {
      try {
        const rows = JSON.parse(tracks[1]);
        for (const row of rows) {
          const file = row && row.file ? this._absoluteUrl(playerUrl, row.file) : "";
          if (!file || seen[file]) continue;
          result.push({ file: file, label: this._text(row.label).toLowerCase() === "kr" ? "한국어" : (this._text(row.label) || "자막") });
          seen[file] = true;
        }
      } catch (_) {}
    }
    if (artSubtitle) {
      const file = this._absoluteUrl(playerUrl, artSubtitle);
      if (file && !seen[file]) result.push({ file: file, label: "사이트 자막" });
    }
    return result;
  }

  async getVideoList(url) {
    const base = await this._resolveBaseUrl();
    const episodeUrl = base + this._relativePath(url);
    const episodeDocument = new Document(await this._requestText(episodeUrl, base + "/", "회차"));
    const playerUrls = this._extractPlayerUrls(episodeDocument, episodeUrl);
    const disableSubtitles = this._siteSubtitlesDisabled();
    const results = await Promise.all(playerUrls.map(async (playerUrl, index) => {
      try {
        const embedded = new Document(await this._requestText(playerUrl, episodeUrl, "재생"));
        const scripts = embedded.select("script").map((node) => this._text(node.data || node.text)).join("\n");
        const fields = this._playerFields(scripts);
        if (!fields.video) return { video: null, error: "" };
        const stream = this._absoluteUrl(playerUrl, fields.video);
        if (!/^https?:\/\//i.test(stream)) return { video: null, error: "" };
        const qualityMatch = playerUrl.match(/(?:2160|1080|720|480|360)p/i);
        const headers = this._requestHeaders(stream, playerUrl);
        headers.Origin = this._origin(playerUrl);
        return { video: {
          url: stream, originalUrl: stream,
          quality: (qualityMatch ? qualityMatch[0] : "자동") + " · 서버 " + (index + 1),
          headers: headers,
          subtitles: disableSubtitles ? [] : this._subtitleTracks(scripts, playerUrl, fields.subtitle)
        }, error: "" };
      } catch (error) { return { video: null, error: this._text(error && (error.message || error)) }; }
    }));
    const videos = results.filter((result) => result.video).map((result) => result.video), errors = results.map((result) => result.error).filter(Boolean);
    if (!videos.length) throw new Error("이 회차의 재생 주소를 찾지 못했습니다. WebView에서 원본 재생 여부를 확인해 주세요." + (errors.length ? " (" + errors[0] + ")" : ""));
    return videos;
  }

  async getPageList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }

  getHeaders(url) {
    return { "User-Agent": this.userAgent, "Referer": (this._origin(url) || this.fallbackBaseUrl) + "/", "Accept": "*/*" };
  }

  _option(name, value) { return { type_name: "SelectOption", name: name, value: value }; }
  _select(type, name, values) { return { type: type, name: name, type_name: "SelectFilter", values: values }; }

  getFilterList() {
    const o = this._option.bind(this);
    const options = function(pairs) { return [o("선택하세요", "__unset__")].concat(pairs.map(function(pair) { return o(pair[0], pair[1]); })); };
    const separator = function(type) { return { type: type, name: "", type_name: "SeparatorFilter" }; };
    const header = function(type, name) { return { type: type, name: name, type_name: "HeaderFilter" }; };
    const popular = this._tabRule(this.popularRulePreference, this._defaultPopularRule());
    const latest = this._tabRule(this.latestRulePreference, this._defaultLatestRule());
    return [
      separator("sepAnime"),
      header("animeHeader", "Anime"),
      this._select("animeGenre", "장르", options(this.genres)),
      this._select("animeYear", "년도", options(this.years)),
      this._select("animeType", "Type", options(this.types)),
      separator("sepAni16"),
      header("ani16Header", "Ani16+"),
      this._select("ani16Genre", "장르", options(this.genres)),
      this._select("ani16Year", "년도", options(this.years)),
      this._select("ani16Type", "Type", options(this.types)),
      separator("sepTop"),
      header("topHeader", "TOP"),
      this._select("topList", "TOP 리스트", options(this.topLists)),
      separator("sepSave"),
      header("saveHelp", "조건을 고른 뒤 Filter 버튼을 누르면 결과를 보고 Popular/Latest 탭 규칙으로 저장할 수 있습니다."),
      header("cardHelp", "요일 카드는 Popular/Latest 1번에만 표시되며 필터 결과와 글자 검색에서는 숨깁니다."),
      header("popularSummary", "현재 Popular: " + this._ruleSummary(popular)),
      header("latestSummary", "현재 Latest: " + this._ruleSummary(latest)),
      this._select("tabRuleAction", "Popular/Latest 규칙", [
        o("저장하지 않음 (필터 결과만 보기)", "0"),
        o("현재 조건을 Popular 탭에 저장", "1"),
        o("현재 조건을 Latest 탭에 저장", "2"),
        o("Popular 탭을 기본값(TOP 오늘)으로 복원", "3"),
        o("Latest 탭을 기본값(Anime 전체)으로 복원", "4"),
        o("두 탭 모두 기본값으로 복원", "5")
      ])
    ];
  }

  getSourcePreferences() {
    return [{
      key: "linkkf_anime_title_language_v2",
      listPreference: {
        title: "작품 제목 언어",
        summary: "한국어와 일본어 중에서 선택합니다. 변경 후 현재 화면을 새로고침하세요. Anissia에서 매칭되지 않는 작품은 한국어를 유지합니다.",
        valueIndex: 0, entries: ["한국어", "일본어"], entryValues: ["ko", "ja"]
      }
    }, {
      key: "linkkf_anime_domain_url",
      editTextPreference: {
        title: "Linkkf 주소 직접 지정 (선택)",
        summary: "빈 값이면 토끼 중앙신호등의 검증된 최신 주소를 사용합니다.",
        value: "", dialogTitle: "https://linkkf.tv", dialogMessage: "자동 주소를 사용하려면 빈 값으로 두세요."
      }
    }, {
      key: "linkkf_anime_custom_card_json_url",
      editTextPreference: {
        title: "커스텀 목록 카드 (선택)",
        summary: "공개 JSON 주소 1개로 요일별 카드 7장을 설정합니다. 360×540 GIF를 권장하며 용량·프레임 제한은 없습니다.",
        value: "", dialogTitle: "커스텀 목록 카드 JSON 주소", dialogMessage: "Google Drive 공개 공유 링크 또는 직접 JSON 주소를 넣으세요. 개인 카드를 설정하면 공용 이벤트 카드는 표시되지 않습니다. 빈 값이면 공용 이벤트 또는 기본 미디어 요일 카드를 사용합니다."
      }
    }, {
      key: "linkkf_anime_disable_site_subtitles",
      switchPreferenceCompat: {
        title: "사이트 자막 끄기",
        summary: "기본은 꺼짐. 켜면 사이트가 제공하는 외부 자막을 플레이어에 전달하지 않습니다. 영상에 포함된 자막은 제거되지 않습니다.",
        value: false
      }
    }];
  }
}
