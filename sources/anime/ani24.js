const mangayomiSources = [{
  name: "애니24",
  lang: "ko",
  baseUrl: "https://www.ohli24.net",
  apiUrl: "",
  iconUrl: "https://dc-toki-mangayomi-media.pages.dev/icon/ko.media.png",
  typeSource: "single",
  itemType: 1,
  isNsfw: false,
  hasCloudflare: false,
  version: "0.1.14",
  dateFormat: "",
  dateFormatLocale: "",
  pkgPath: "anime/src/ko/ani24.js",
  notes: "목록·상세 제목 한국어/일본어 전환 · 제목 언어 설정 캐시 키 갱신 · Anissia 일본어 원제 우선 + AniList 보조 · 새로고침 즉시 반영 · 기본 설정 · 인기탭: 방영 중 + 오늘 요일 · 최신탭: 방영 중 + 전체 요일 + 업데이트순 · 필터 규칙 저장 · 커스텀 목록 카드 · 재생 서버 병렬 확인 · 영상 다운로드 호환"
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
    this.fallbackBaseUrl = "https://www.ohli24.net";
    this.assetBaseUrl = "https://dc-toki-mangayomi-media.pages.dev";
    this.userAgent = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
    this.popularRulePreference = "ani24_popular_rule_v1";
    this.latestRulePreference = "ani24_latest_rule_v1";
    this.titleLanguagePreference = "ani24_title_language_v2";
    this.titleCachePrefix = "ani24_title_meta_v3_";
    this.genres = [
      ["전체", ""], ["미스테리", "미스테리"], ["추리", "추리"], ["거대로봇", "거대로봇"],
      ["SF", "SF"], ["모험", "모험"], ["백합", "백합"], ["판타지", "판타지"],
      ["이세계", "이세계"], ["코미디", "코미디"], ["하렘", "하렘"], ["학원", "학원"],
      ["로맨스", "로맨스"], ["액션", "액션"], ["닌자", "닌자"], ["아이돌", "아이돌"],
      ["게임", "게임"], ["스포츠", "스포츠"], ["청춘", "청춘"], ["능력", "능력"],
      ["드라마", "드라마"], ["성장", "성장"], ["일상", "일상"], ["연애", "연애"],
      ["배틀", "배틀"], ["공포", "공포"], ["음악", "음악"], ["가족", "가족"]
    ];
    this.days = [["전체", ""], ["일요일", "1"], ["월요일", "2"], ["화요일", "3"], ["수요일", "4"], ["목요일", "5"], ["금요일", "6"], ["토요일", "7"], ["기타", "8"]];
    this.sorts = [["업데이트", "updatetime"], ["인기순", "air_date"], ["방영일", "hits"]];
    this.years = [["전체", ""]];
    for (let year = 2025; year >= 2013; year--) this.years.push([String(year), String(year)]);
    this.years.push(["오래전", "old"]);
    this.yearKinds = [["완결", "finished"], ["극장판", "movie"]];
    this.topKinds = [["방영중 인기애니", "ongoing"], ["완결 인기애니", "finished"], ["극장판 인기애니", "movie"]];
  }

  get supportsLatest() { return true; }
  _text(v) { return v === null || v === undefined ? "" : String(v); }
  _trimSlash(v) { return this._text(v).trim().replace(/\/+$/, ""); }
  _origin(v) { const m = this._text(v).match(/^(https?:\/\/[^/]+)/i); return m ? m[1] : ""; }
  _relativePath(v) { let s = this._text(v).trim(); if (/^https?:\/\//i.test(s)) s = s.replace(/^https?:\/\/[^/]+/i, ""); if (s && !s.startsWith("/")) s = "/" + s; return s; }
  _absoluteUrl(base, v) { let s = this._text(v).trim().replace(/\\\//g, "/").replace(/&amp;/g, "&"); if (!s) return ""; if (s.startsWith("//")) return "https:" + s; if (/^https?:\/\//i.test(s)) return s; if (s.startsWith("/")) return this._origin(base) + s; return base.replace(/[?#].*$/, "").replace(/[^/]*$/, "") + s; }
  _hlsOriginalUrl(v) { const url = this._text(v).trim().replace(/#.*$/, ""); if (!url) return ""; return /\.(?:m3u8|m3u)$/i.test(url) ? url : url + "#download.m3u8"; }

  _preference(key, fallback) {
    try { const v = new SharedPreferences().get(key); return v === null || v === undefined ? fallback : v; } catch (_) { return fallback; }
  }
  _preferenceString(key, fallback) {
    try { const v = new SharedPreferences().getString(key, fallback); return v === null || v === undefined ? fallback : this._text(v); } catch (_) { return fallback; }
  }
  _setPreferenceString(key, value) { try { new SharedPreferences().setString(key, this._text(value)); } catch (_) {} }
  _titleCacheToken(value) { const text = this._text(value); let hash = 2166136261; for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }
  _titleLanguage() { const value = this._text(this._preference(this.titleLanguagePreference, this._preferenceString(this.titleLanguagePreference, "ko"))).trim().toLowerCase(); return value === "ja" || value === "1" || value.indexOf("일본") >= 0 ? "ja" : "ko"; }
  async _freshDetailTitleLanguage() { if (typeof setTimeout === "function") await this._pause(250); return this._titleLanguage(); }
  _titleBridgeKey(value) { let text = this._text(value); try { text = text.normalize("NFKC"); } catch (_) {} return text.toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ヶ一-龯]+/g, ""); }
  _anissiaSearchNames(value) { const original = this._text(value).trim(), cleaned = original.replace(/\s*[\(\[]?\d{4}[\)\]]?\s*$/g, "").replace(/\s*[\(\[](더빙|자막|무삭제)[\)\]]\s*$/g, "").replace(/^\s*\((고화질|저화질)\)\s*/g, "").replace(/\s+BD\s*$/i, "").trim(), plain = cleaned.replace(/[~～!！「」『』…:：·・,]+/g, " ").replace(/\s+/g, " ").trim(), season = plain.replace(/시즌\s*(\d+)/g, "$1기"), numbered = season.replace(/\s+(\d+)$/g, " $1기"), korean = (season.match(/^[가-힣0-9][가-힣0-9\s:：\-·・~～!?！？'’.,]*/) || [""])[0].replace(/[\s:：\-·・~～!?！？'’.,]+$/g, "").trim(); return [original, cleaned, plain, season, numbered, korean].filter(function(item, index, list) { return item && list.indexOf(item) === index; }); }
  async _anissiaMetadata(original) { const names = this._anissiaSearchNames(original); for (const query of names) { try { const response = await new Client({ persistentConnection: false, timeout: 7, connectTimeout: 4 }).get("https://api.anissia.net/anime/list/0?q=" + encodeURIComponent(query), { Accept: "application/json", Referer: "https://anissia.net/anime" }); if (!response || response.statusCode < 200 || response.statusCode >= 300) continue; const payload = JSON.parse(this._text(response.body)), items = payload && payload.data && Array.isArray(payload.data.content) ? payload.data.content : [], wanted = this._titleBridgeKey(query), match = items.find((item) => this._titleBridgeKey(item && item.subject) === wanted); if (match && this._text(match.originalSubject).trim()) return { ko: original, ja: this._text(match.originalSubject).trim(), anissiaId: Number(match.animeNo) || 0, confidence: 500 }; } catch (_) {} } return null; }
  async _titleBridgeOrigin() { const cached = this._trimSlash(this._preferenceString("dc_title_bridge_anilife_origin", "")), cachedAt = Number(this._preferenceString("dc_title_bridge_anilife_origin_time", "0")); if (/^https:\/\/(?:www\.)?anilife\d+\.tv$/i.test(cached) && cachedAt > 0 && Date.now() - cachedAt < 10 * 60 * 1000) return cached; try { const response = await new Client({ persistentConnection: false, timeout: 8, connectTimeout: 5 }).get(this.signalUrl, { Accept: "application/json", "Cache-Control": "no-cache" }); const data = JSON.parse(this._text(response.body)), candidate = this._trimSlash(data && data.domains && data.domains.anilife && data.domains.anilife.baseUrl); if (/^https:\/\/(?:www\.)?anilife\d+\.tv$/i.test(candidate)) { this._setPreferenceString("dc_title_bridge_anilife_origin", candidate); this._setPreferenceString("dc_title_bridge_anilife_origin_time", String(Date.now())); return candidate; } } catch (_) {} return /^https:\/\/(?:www\.)?anilife\d+\.tv$/i.test(cached) ? cached : "https://anilife01.tv"; }
  _plainEnglishTitle(value) { const text = this._text(value).trim(); return /[a-z]/i.test(text) && !/[가-힣ぁ-んァ-ヶ一-龯]/.test(text) ? text : ""; }
  _decodeTitleText(value) { return this._text(value).replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(Number(code)); }).replace(/&#x([0-9a-f]+);/gi, function(_, code) { return String.fromCharCode(parseInt(code, 16)); }).replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, " ").trim(); }
  _anilistIdFromText(value) { const match = this._text(value).match(/(?:\/|%2f)anime(?:\/|%2f)(\d{4,})/i); return match ? Number(match[1]) : 0; }
  _titleBridgeMetadataFromItem(original, item) { if (!item) return null; const japanese = this._text(item.titleJp).trim(), english = this._plainEnglishTitle(item.titleOriginal); if (!japanese && !english) return null; return { ko: original, ja: japanese, en: english, romaji: english, sourceId: Number(item.id) || 0, confidence: 200 }; }
  _metadataFromAniListMedia(original, media) { if (!media || !media.id) return null; const title = media.title || {}; return { ko: original, ja: this._text(title.native).trim(), en: this._text(title.english || title.romaji).trim(), romaji: this._text(title.romaji).trim(), anilistId: Number(media.id), confidence: 300 }; }
  async _aniListMetadata(original, candidate, anilistId) { try { const byId = Number(anilistId) > 0, query = byId ? "query($id:Int!){Media(id:$id,type:ANIME){id synonyms title{romaji english native}}}" : "query($search:String!){Page(page:1,perPage:12){media(search:$search,type:ANIME){id synonyms title{romaji english native}}}}", variables = byId ? { id: Number(anilistId) } : { search: this._text(candidate).trim() }; if (!byId && !variables.search) return null; const response = await new Client({ persistentConnection: false, timeout: 12, connectTimeout: 6 }).post("https://graphql.anilist.co", { "Content-Type": "application/json", Accept: "application/json" }, JSON.stringify({ query, variables })); if (!response || response.statusCode < 200 || response.statusCode >= 300) return null; const payload = JSON.parse(this._text(response.body)); if (byId) return this._metadataFromAniListMedia(original, payload && payload.data && payload.data.Media); const media = payload && payload.data && payload.data.Page && Array.isArray(payload.data.Page.media) ? payload.data.Page.media : [], wanted = this._titleBridgeKey(variables.search), match = media.find((item) => [item && item.title && item.title.native, item && item.title && item.title.romaji, item && item.title && item.title.english].concat(Array.isArray(item && item.synonyms) ? item.synonyms : []).some((value) => this._titleBridgeKey(value) === wanted)); return this._metadataFromAniListMedia(original, match); } catch (_) { return null; } }
  _linkkfOriginCandidates(body) { const raw = this._text(body), match = raw.match(/원제[\s\S]{0,100}?<\/span>\s*([^<]+)/i); if (!match) return []; return this._decodeTitleText(match[1]).split(/\s*,\s*/).map((value) => value.trim()).filter(Boolean); }
  async _linkkfMetadata(original, url) { if (!/^https:\/\/(?:www\.)?linkkf\.(?:tv|com)\/ani\/\d+\/?/i.test(this._text(url).trim())) return null; try { const response = await new Client({ persistentConnection: false, timeout: 10, connectTimeout: 6 }).get(this._text(url).trim(), { Accept: "text/html,application/xhtml+xml", Referer: "https://linkkf.tv/" }); if (!response || response.statusCode < 200 || response.statusCode >= 300) return null; const body = this._text(response.body), id = this._anilistIdFromText(body); if (id) { const direct = await this._aniListMetadata(original, "", id); if (direct) return direct; } const candidates = this._linkkfOriginCandidates(body), ordered = candidates.filter((value) => /[ぁ-んァ-ヶ一-龯]/.test(value)).concat(candidates.filter((value) => this._plainEnglishTitle(value))); for (const candidate of ordered) { const data = await this._aniListMetadata(original, candidate, 0); if (data) return data; } } catch (_) {} return null; }
  async _titleBridgeMetadata(name) { const anissia = await this._anissiaMetadata(name); if (anissia) return anissia; try { const base = await this._titleBridgeOrigin(); for (const query of this._anissiaSearchNames(name)) { const response = await new Client({ persistentConnection: false, timeout: 10, connectTimeout: 6 }).get(base + "/api/anime?page=1&limit=10&q=" + encodeURIComponent(query), { Accept: "application/json, text/plain, */*", Referer: base + "/" }); if (!response || response.statusCode < 200 || response.statusCode >= 300) continue; const payload = JSON.parse(this._text(response.body)), items = Array.isArray(payload && payload.items) ? payload.items : [], wanted = this._titleBridgeKey(query), match = items.find((item) => this._titleBridgeKey(item && item.title) === wanted || this._titleBridgeKey(item && item.titleOriginal) === wanted); if (!match) continue; const direct = await this._fillBridgeMetadata(this._titleBridgeMetadataFromItem(name, match)); if (direct && direct.ja) return direct; const linked = await this._linkkfMetadata(name, match.sourceUrl); if (linked) return linked; if (direct) return direct; } return null; } catch (_) { return null; } }
  async _fillBridgeMetadata(data) { if (!data) return data; if (data.ja) return data; const filled = await this._aniListMetadata(data.ko || "", data.ja || data.romaji || data.en, data.anilistId); return filled || data; }
  async _titleMetadata(name) {
    const original = this._text(name).trim(); if (!original) return null; const key = this.titleCachePrefix + this._titleCacheToken(original), timeKey = key + "_time"; const cached = this._preferenceString(key, ""), cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0) { try { const parsed = JSON.parse(cached), ttl = parsed && parsed.miss ? 6 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000; if (Date.now() - cachedAt < ttl) return parsed && parsed.miss ? null : parsed; } catch (_) {} }
    try { const data = await this._fillBridgeMetadata(await this._titleBridgeMetadata(original)); if (!data || !data.ja) { this._setPreferenceString(key, JSON.stringify({ miss: true })); this._setPreferenceString(timeKey, String(Date.now())); return null; } this._setPreferenceString(key, JSON.stringify(data)); this._setPreferenceString(timeKey, String(Date.now())); return data; } catch (_) { return null; }
  }
  async _localizedTitle(name, languageOverride) { const original = this._text(name).trim(), language = languageOverride || this._titleLanguage(); if (!original || language === "ko") return original; const data = await this._titleMetadata(original), localized = data ? this._text(data[language]).trim() : ""; return localized || original; }
  async _localizeResult(result) { if (!result || !Array.isArray(result.list) || this._titleLanguage() === "ko") return result; const items = result.list, workers = []; let cursor = 0; const work = async () => { while (true) { const index = cursor++; if (index >= items.length) return; const item = items[index]; if (!item || /\/__ani24_weekday_card__\//.test(this._text(item.link))) continue; item.name = await this._localizedTitle(item.name); } }; for (let index = 0; index < Math.min(4, items.length); index++) workers.push(work()); await Promise.all(workers); return result; }
  _isAllowedBaseUrl(v) { return /^https:\/\/(?:www\.)?ohli24\.net\/?$/i.test(this._text(v).trim()); }
  async _resolveBaseUrl() {
    const manual = this._text(this._preference("ani24_domain_url", "")).trim();
    if (this._isAllowedBaseUrl(manual)) return this._trimSlash(manual).replace("https://ohli24.net", "https://www.ohli24.net");
    try {
      const r = await new Client({ persistentConnection: false, timeout: 8, connectTimeout: 5 }).get(this.signalUrl, { "User-Agent": this.userAgent, "Accept": "application/json", "Cache-Control": "no-cache" });
      if (r.statusCode >= 200 && r.statusCode < 300) {
        const data = JSON.parse(r.body);
        const candidate = data && data.domains && data.domains.ani24 ? data.domains.ani24.baseUrl : "";
        if (this._isAllowedBaseUrl(candidate)) return this._trimSlash(candidate).replace("https://ohli24.net", "https://www.ohli24.net");
      }
    } catch (_) {}
    return this.fallbackBaseUrl;
  }
  _headers(url, referer) { const origin = this._origin(url) || this.fallbackBaseUrl; return { "User-Agent": this.userAgent, "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "Referer": referer || origin + "/" }; }
  async _pause(ms) { if (typeof setTimeout === "function") await new Promise(function(resolve) { setTimeout(resolve, ms); }); }
  _failureCode(r, e) { if (r && r.statusCode) return "HTTP" + r.statusCode; const s = this._text(e && (e.message || e)); if (/timeout/i.test(s)) return "TIMEOUT"; if (/certificate|handshake|TLS|SSL/i.test(s)) return "TLS"; return "NETWORK"; }
  async _requestText(url, referer, stage, extraHeaders) {
    const transports = [{ name: "RHTTP", options: { persistentConnection: false, timeout: 25, connectTimeout: 10 } }, { name: "DART", options: { useDartHttpClient: true, persistentConnection: false } }];
    const diagnostics = [];
    for (const t of transports) {
      try { const headers = this._headers(url, referer); Object.assign(headers, extraHeaders || {}); const r = await new Client(t.options).get(url, headers); if (r.statusCode >= 200 && r.statusCode < 300) return this._text(r.body); diagnostics.push(t.name + "=" + this._failureCode(r)); }
      catch (e) { diagnostics.push(t.name + "=" + this._failureCode(null, e)); if (t.name === "RHTTP") await this._pause(120); }
    }
    throw new Error("애니24 " + (stage || "요청") + " 연결에 실패했습니다. 진단: " + diagnostics.join(","));
  }
  async _postForm(url, form, referer) {
    const headers = this._headers(url, referer); headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"; headers["X-Requested-With"] = "XMLHttpRequest"; headers.Origin = this._origin(url);
    const r = await new Client({ persistentConnection: false, timeout: 25, connectTimeout: 10 }).post(url, headers, form);
    if (r.statusCode < 200 || r.statusCode >= 300) throw new Error("재생 서버 HTTP" + r.statusCode);
    return this._text(r.body);
  }

  _koreaDayNumber() { return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay() + 1; }
  _koreaWeekday() { return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][this._koreaDayNumber() - 1]; }
  _weekdayName(slug) { return ({ monday: "월요일", tuesday: "화요일", wednesday: "수요일", thursday: "목요일", friday: "금요일", saturday: "토요일", sunday: "일요일" })[slug] || "오늘"; }
  _driveDirect(url, image) { const s = this._text(url).trim(); const m = s.match(/drive\.google\.com\/file\/d\/([^/]+)/i); return m ? "https://drive.google.com/uc?export=" + (image ? "view" : "download") + "&id=" + m[1] : s; }
  async _customCardUrl(slug) {
    const source = this._text(this._preference("ani24_custom_card_json_url", "")).trim();
    if (!source) return "";
    const preferences = new SharedPreferences(), cacheKey = "ani24_custom_card_cache", sourceKey = cacheKey + "_source", timeKey = cacheKey + "_time";
    let data = null, cached = "";
    if (this._preferenceString(sourceKey, "") === source) cached = this._preferenceString(cacheKey, "");
    const cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000) { try { data = JSON.parse(cached); } catch (_) {} }
    if (!data) { try { const direct = this._driveDirect(source, false), join = direct.indexOf("?") >= 0 ? "&" : "?"; data = JSON.parse(await this._requestText(direct + join + "card_json=" + Date.now(), source, "커스텀 목록 카드", { "Accept": "application/json", "Cache-Control": "no-cache" })); preferences.setString(cacheKey, JSON.stringify(data)); preferences.setString(sourceKey, source); preferences.setString(timeKey, String(Date.now())); } catch (_) { if (cached) { try { data = JSON.parse(cached); } catch (_) {} } } }
    if (!data || typeof data !== "object") return "";
    const cards = data.cards && typeof data.cards === "object" ? data.cards : {};
    let image = this._text(cards[slug] || data.default || data.card).trim();
    if (!image) return "";
    image = this._driveDirect(image, true);
    if (data.revision !== undefined && this._text(data.revision).trim()) image += (image.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(this._text(data.revision));
    return image;
  }
  async _tabCard(slug, tab) {
    const day = slug || this._koreaWeekday();
    const customSource = this._text(this._preference("ani24_custom_card_json_url", "")).trim();
    const customImage = await this._customCardUrl(day);
    const event = customSource ? null : await dcOfficialEventCard();
    const official = customImage || event ? null : await dcOfficialListCardSystem("ani24", tab, "오늘의 애니");
    return { name: customImage ? this._weekdayName(day) : event ? event.name : official.name, link: "/__ani24_weekday_card__/" + day, imageUrl: customImage || (event && event.imageUrl) || official.imageUrl };
  }

  _defaultPopularRule() { return { mode: "ongoing", day: String(this._koreaDayNumber()), genre: "", sort: "updatetime", year: "", yearKind: "finished", top: "" }; }
  _defaultLatestRule() { return { mode: "ongoing", day: "", genre: "", sort: "updatetime", year: "", yearKind: "finished", top: "" }; }
  _allowed(v, pairs, fallback) { const s = this._text(v); return pairs.some(function(p) { return p[1] === s; }) ? s : fallback; }
  _normalizeRule(rule, fallback) {
    const r = rule || fallback || this._defaultLatestRule(); const modes = ["ongoing", "finished", "movie", "year", "top"];
    const mode = modes.indexOf(r.mode) >= 0 ? r.mode : "ongoing";
    return { mode, day: mode === "ongoing" ? this._allowed(r.day, this.days, "") : "", genre: mode === "finished" || mode === "movie" ? this._allowed(r.genre, this.genres, "") : "", sort: mode === "ongoing" || mode === "finished" || mode === "movie" ? this._allowed(r.sort, this.sorts, "updatetime") : "", year: mode === "year" ? this._allowed(r.year, this.years, "") : "", yearKind: mode === "year" ? this._allowed(r.yearKind, this.yearKinds, "finished") : "finished", top: mode === "top" ? this._allowed(r.top, this.topKinds, "ongoing") : "" };
  }
  _encodeRule(r) { const n = this._normalizeRule(r, this._defaultLatestRule()); return ["1", n.mode, n.day, n.genre, n.sort, n.year, n.yearKind, n.top].join("|"); }
  _decodeRule(v, fallback) { const p = this._text(v).split("|"); return p.length === 8 && p[0] === "1" ? this._normalizeRule({ mode: p[1], day: p[2], genre: p[3], sort: p[4], year: p[5], yearKind: p[6], top: p[7] }, fallback) : this._normalizeRule(fallback, this._defaultLatestRule()); }
  _tabRule(key, fallback) { const v = this._preferenceString(key, ""); return v ? this._decodeRule(v, fallback) : this._normalizeRule(fallback, this._defaultLatestRule()); }
  _nameFor(pairs, value, fallback) { const found = pairs.find(function(p) { return p[1] === value; }); return found ? found[0] : fallback; }
  _ruleSummary(r) { const n = this._normalizeRule(r, this._defaultLatestRule()); if (n.mode === "ongoing") return "방영중 + " + this._nameFor(this.days, n.day, "전체") + " + " + this._nameFor(this.sorts, n.sort, "업데이트"); if (n.mode === "finished" || n.mode === "movie") return (n.mode === "finished" ? "완결" : "극장판") + " + " + this._nameFor(this.genres, n.genre, "전체") + " + " + this._nameFor(this.sorts, n.sort, "업데이트"); if (n.mode === "year") return "연도별 " + this._nameFor(this.years, n.year, "전체") + " + " + this._nameFor(this.yearKinds, n.yearKind, "완결"); return "TOP5 " + this._nameFor(this.topKinds, n.top, "방영중 인기애니"); }

  _jsonpHtml(body) { const s = this._text(body).trim().replace(/^callback\s*\(/, "").replace(/\)\s*$/, ""); try { const d = JSON.parse(s); return this._text(d.msg); } catch (_) { return body; } }
  _imageUrl(base, item) { if (!item) return ""; for (const key of ["data-original", "data-src", "src"]) { const v = this._text(item.attr(key)).trim(); if (v && !/^data:/i.test(v)) return this._absoluteUrl(base, v); } return ""; }
  _versionedDetailPath(path) { return this._text(path).replace(/#.*$/, "") + "#ani24_detail_v2"; }
  _parseCards(document, base, paginated) {
    const list = [], seen = {};
    for (const item of document.select(".show-item")) {
      const link = item.selectFirst("a.show-item-img-link[href]") || item.selectFirst(".show-item-tile-link[href]") || item.selectFirst("a[href]");
      const title = item.selectFirst(".show-item-title"); const path = link ? this._relativePath(link.attr("href")) : ""; const name = title ? this._text(title.text).trim() : (link ? this._text(link.text).trim() : "");
      if (!name || !/^\/\d+\//.test(path) || seen[path]) continue;
      list.push({ name, link: this._versionedDetailPath(path), imageUrl: this._imageUrl(base, item.selectFirst("img")) }); seen[path] = true;
    }
    return { list, hasNextPage: paginated !== false && list.length >= 20 };
  }
  _apiUrl(base, page, template, catid, sort, genre, day) { return base + "/index.php?s=api&c=api&m=template&format=jsonp&name=" + template + ".html&catid=" + catid + "&order=" + encodeURIComponent(sort || "updatetime") + "&page=" + Math.max(1, Number(page) || 1) + "&keyword=" + encodeURIComponent(genre || "") + "&weeks=" + encodeURIComponent(day || ""); }
  _yearPath(page, rule) { const catid = rule.yearKind === "movie" ? "2" : "1"; let range = ""; if (rule.year === "old") range = "1980-01-01,2012-12-31"; else if (rule.year) range = rule.year + "-01-01," + rule.year + "-12-31"; if (!range) return rule.yearKind === "movie" ? "/movie" : "/finished"; const encoded = encodeURIComponent(range); return Number(page) > 1 ? "/search/air_date-" + encoded + "-parent_id-0-catid-" + catid + "-page-" + Number(page) + ".html" : "/search/catid-" + catid + "-air_date-" + encoded + ".html"; }
  async _topList(base, kind, page) {
    if (Number(page) > 1) return { list: [], hasNextPage: false };
    const path = kind === "movie" ? "/movie" : kind === "finished" ? "/finished" : "/ing";
    const doc = new Document(await this._requestText(base + path, base + "/", "TOP5")); let scope = null;
    const wanted = kind === "movie" ? "극장판 인기애니" : kind === "finished" ? "완결 인기애니" : "방영중 인기애니";
    for (const section of doc.select(".top-movies-list")) if (this._text(section.text).replace(/\s+/g, "").indexOf(wanted.replace(/\s+/g, "")) >= 0) { scope = section; break; }
    scope = scope || doc; const list = [], seen = {};
    for (const link of scope.select("a[href]")) { const p = this._relativePath(link.attr("href")); const name = this._text(link.text).trim(); if (!/^\/\d+\//.test(p) || !name || seen[p]) continue; list.push({ name, link: this._versionedDetailPath(p), imageUrl: "" }); seen[p] = true; if (list.length === 5) break; }
    for (let i = 0; i < list.length; i++) { try { const d = new Document(await this._requestText(base + list[i].link, base + path, "TOP5 표지")); list[i].imageUrl = this._imageUrl(base, d.selectFirst(".article-box-img img") || d.selectFirst("meta[property='og:image']")); } catch (_) {} }
    return { list, hasNextPage: false };
  }
  async _list(page, rule) {
    const n = this._normalizeRule(rule, this._defaultLatestRule()), base = await this._resolveBaseUrl();
    if (n.mode === "top") return this._topList(base, n.top, page);
    if (n.mode === "year") { const url = base + this._yearPath(page, n); return this._parseCards(new Document(await this._requestText(url, base + "/", "연도별 목록")), base, true); }
    if (n.mode === "ongoing" && Number(page) === 1 && n.sort === "updatetime" && n.day) { const url = base + "/search/catid-1-video_status-1-weeks-" + n.day + ".html"; return this._parseCards(new Document(await this._requestText(url, base + "/", "요일 목록")), base, false); }
    const config = n.mode === "ongoing" ? ["ong", "3"] : n.mode === "movie" ? ["movie", "2"] : ["list", "1"];
    const url = this._apiUrl(base, page, config[0], config[1], n.sort, n.genre, n.day);
    return this._parseCards(new Document(this._jsonpHtml(await this._requestText(url, base + "/", "목록"))), base, true);
  }
  async _prependCard(result, page, tab) { if (Number(page) !== 1) return result; return { list: [await this._tabCard(undefined, tab)].concat(result.list || []), hasNextPage: result.hasNextPage === true }; }
  async getPopular(page) { return this._localizeResult(await this._prependCard(await this._list(page, this._tabRule(this.popularRulePreference, this._defaultPopularRule())), page, "popular")); }
  async getLatestUpdates(page) { return this._localizeResult(await this._prependCard(await this._list(page, this._tabRule(this.latestRulePreference, this._defaultLatestRule())), page, "latest")); }

  _normalizeSearch(v) { let s = this._text(v); try { s = s.normalize("NFKC"); } catch (_) {} return s.trim().replace(/\s+/g, " "); }
  _searchKey(v) { return this._normalizeSearch(v).toLowerCase().replace(/\s+/g, "").replace(/[.,/#!$%^&*;:{}=\-_`~()'"\[\]<>?·…]/g, ""); }
  _levenshtein(a, b) { const m = []; for (let i = 0; i <= b.length; i++) m[i] = [i]; for (let j = 0; j <= a.length; j++) m[0][j] = j; for (let i = 1; i <= b.length; i++) for (let j = 1; j <= a.length; j++) m[i][j] = b[i - 1] === a[j - 1] ? m[i - 1][j - 1] : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1); return m[b.length][a.length]; }
  _filterValue(filters, type, fallback) { if (!Array.isArray(filters)) return fallback; for (const f of filters) { if (!f || f.type !== type || !Array.isArray(f.values)) continue; const o = f.values[Number(f.state) || 0]; return o && o.value !== undefined ? this._text(o.value) : fallback; } return fallback; }
  _filterRule(filters) {
    const u = "__unset__", sections = [
      { mode: "ongoing", values: { day: this._filterValue(filters, "ongoingDay", u), sort: this._filterValue(filters, "ongoingSort", u) } },
      { mode: "finished", values: { genre: this._filterValue(filters, "finishedGenre", u), sort: this._filterValue(filters, "finishedSort", u) } },
      { mode: "movie", values: { genre: this._filterValue(filters, "movieGenre", u), sort: this._filterValue(filters, "movieSort", u) } },
      { mode: "year", values: { year: this._filterValue(filters, "yearValue", u), yearKind: this._filterValue(filters, "yearKind", u) } },
      { mode: "top", values: { top: this._filterValue(filters, "topKind", u) } }
    ];
    const touched = sections.filter(function(s) { return Object.keys(s.values).some(function(k) { return s.values[k] !== u; }); });
    if (touched.length > 1) throw new Error("방영중, 완결, 극장판, 연도별, TOP5 중 한 구역만 선택하세요.");
    if (!touched.length) return null; const found = touched[0], r = { mode: found.mode }; Object.keys(found.values).forEach(function(k) { r[k] = found.values[k] === u ? "" : found.values[k]; }); return this._normalizeRule(r, this._defaultLatestRule());
  }
  _applyTabRuleAction(page, filters, rule) { if (Number(page) !== 1) return; const action = Number(this._filterValue(filters, "tabRuleAction", "0")), p = new SharedPreferences(); if (action === 1) p.setString(this.popularRulePreference, this._encodeRule(rule)); else if (action === 2) p.setString(this.latestRulePreference, this._encodeRule(rule)); else if (action === 3) p.setString(this.popularRulePreference, ""); else if (action === 4) p.setString(this.latestRulePreference, ""); else if (action === 5) { p.setString(this.popularRulePreference, ""); p.setString(this.latestRulePreference, ""); } }
  async search(query, page, filters) {
    const q = this._normalizeSearch(query);
    if (q) {
      const base = await this._resolveBaseUrl(), compact = this._searchKey(q), words = [compact, q, compact.replace(/[0-9]+/g, ""), compact.slice(0, 3), compact.slice(0, 2)].filter(function(v, i, a) { return v && v.length >= 2 && a.indexOf(v) === i; }); let all = [], seen = {};
      for (const word of words) { const url = base + "/search/keyword-" + encodeURIComponent(word) + ".html"; const r = this._parseCards(new Document(await this._requestText(url, base + "/", "검색")), base, true); for (const item of r.list) if (!seen[item.link]) { all.push(item); seen[item.link] = true; } if (all.length) break; }
      all.sort((a, b) => { const ak = this._searchKey(a.name), bk = this._searchKey(b.name); const as = ak === compact ? 0 : ak.indexOf(compact) >= 0 || compact.indexOf(ak) >= 0 ? 1 : 2 + this._levenshtein(ak, compact); const bs = bk === compact ? 0 : bk.indexOf(compact) >= 0 || compact.indexOf(bk) >= 0 ? 1 : 2 + this._levenshtein(bk, compact); return as - bs; });
      return this._localizeResult({ list: all, hasNextPage: all.length >= 20 });
    }
    const action = Number(this._filterValue(filters, "tabRuleAction", "0")); let rule = this._filterRule(filters); if (!rule && action >= 3 && action <= 5) rule = action === 3 ? this._defaultPopularRule() : this._defaultLatestRule(); if (!rule) throw new Error("애니24 필터에서 한 구역을 선택하세요."); const result = await this._list(page, rule); this._applyTabRuleAction(page, filters, rule); return this._localizeResult(result);
  }

  _parseDate(text) { const s = this._text(text).trim(); const m = s.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/); if (!m) return ""; return String(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()); }
  _parseEpisodes(document) { const episodes = [], seen = {}; for (const item of document.select(".eps-box .eps-item")) { const a = item.selectFirst("a[href]"); if (!a) continue; const path = this._relativePath(a.attr("href")); if (!path || seen[path]) continue; const name = this._text(a.text).trim() || "재생"; const date = item.selectFirst(".eps-date"); episodes.push({ name, url: path, dateUpload: date ? this._parseDate(date.text) : "" }); seen[path] = true; } return episodes; }
  async getDetail(url) {
    const card = this._text(url).match(/\/__ani24_weekday_card__\/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (card) { const item = await this._tabCard(card[1]); return { name: item.name, link: item.link, imageUrl: item.imageUrl, author: "애니24", description: "오늘의 시간 흐름을 담은 움직이는 요일 카드입니다. 뒤로 돌아가 작품을 선택해 주세요.", genre: ["요일 안내"], status: 0, episodes: [], chapters: [] }; }
    const base = await this._resolveBaseUrl(), path = this._relativePath(url); if (!/^\/\d+\//.test(path)) throw new Error("잘못된 애니24 작품 주소입니다."); const doc = new Document(await this._requestText(base + path, base + "/", "상세"));
    const title = doc.selectFirst(".list-content > .top-movies-list-title h2") || doc.selectFirst("h1") || doc.selectFirst("meta[property='og:title']"); if (!title) throw new Error("작품 제목을 찾지 못했습니다.");
    const meta = doc.select(".article-box-meta li").map((n) => this._text(n.text).trim()).filter(Boolean); const genres = doc.select(".article-box-meta a[href*='keyword-']").map((n) => this._text(n.text).trim()).filter(Boolean); const cover = doc.selectFirst(".article-box-img img") || doc.selectFirst("meta[property='og:image']"); const desc = doc.selectFirst(".movie-coment"); const episodes = this._parseEpisodes(doc);
    const detailLanguage = await this._freshDetailTitleLanguage();
    return { name: await this._localizedTitle(this._text(title.attr && title.attr("content") ? title.attr("content") : title.text).trim(), detailLanguage), link: path, imageUrl: cover && cover.attr("content") ? this._absoluteUrl(base, cover.attr("content")) : this._imageUrl(base, cover), author: "", description: desc ? this._text(desc.text).trim() : meta.join("\n"), genre: genres, status: meta.join(" ").indexOf("완결") >= 0 ? 1 : 0, episodes, chapters: episodes };
  }
  _iframeUrls(doc, base) { const out = [], seen = {}; for (const n of doc.select("iframe#video[src], iframe[src*='michealcdn']")) { const u = this._absoluteUrl(base, n.attr("src")); if (u && !seen[u]) { out.push(u); seen[u] = true; } } return out; }
  _hlsVariants(master, masterUrl, server) { const lines = this._text(master).split(/\r?\n/), out = []; for (let i = 0; i < lines.length; i++) { if (lines[i].indexOf("#EXT-X-STREAM-INF:") !== 0) continue; let next = ""; for (let j = i + 1; j < lines.length; j++) if (lines[j].trim() && lines[j].indexOf("#") !== 0) { next = lines[j].trim(); break; } if (!next) continue; const info = lines[i]; const name = (info.match(/NAME="?([^",]+)/i) || [])[1]; const height = (info.match(/RESOLUTION=\d+x(\d+)/i) || [])[1]; const quality = (name || (height ? height + "p" : "자동")) + " · 서버 " + server, streamUrl = this._absoluteUrl(masterUrl, next); out.push({ url: streamUrl, originalUrl: this._hlsOriginalUrl(streamUrl), quality }); } return out; }
  async getVideoList(url) {
    const base = await this._resolveBaseUrl(), episodeUrl = base + this._relativePath(url), doc = new Document(await this._requestText(episodeUrl, base + "/", "회차")), iframes = this._iframeUrls(doc, episodeUrl);
    const results = await Promise.all(iframes.map(async (iframe, i) => { try { const origin = this._origin(iframe); let id = iframe.split(/[?#]/)[0].split("/").filter(Boolean).pop() || ""; if (!/^[a-f0-9]{16,}$/i.test(id)) { const embedded = await this._requestText(iframe, episodeUrl, "재생"); const m = embedded.match(/FirePlayer\s*\(\s*["']([^"']+)/i); if (m) id = m[1]; } if (!id) return { videos: [], error: "" }; const data = JSON.parse(await this._postForm(origin + "/player/index.php?data=" + encodeURIComponent(id) + "&do=getVideo", { hash: id, r: "" }, iframe)); const masterUrl = this._absoluteUrl(iframe, data.securedLink || data.link || ""); if (!masterUrl) return { videos: [], error: "" }; const master = await this._requestText(masterUrl, iframe, "재생목록"); let variants = this._hlsVariants(master, masterUrl, i + 1); if (!variants.length) variants = [{ url: masterUrl, originalUrl: this._hlsOriginalUrl(masterUrl), quality: "자동 · 서버 " + (i + 1) }]; for (const v of variants) { v.headers = { "User-Agent": this.userAgent, "Referer": origin + "/", "Origin": origin }; v.subtitles = []; } return { videos: variants, error: "" }; } catch (e) { return { videos: [], error: this._text(e && (e.message || e)) }; } }));
    const videos = [], errors = []; for (const result of results) { Array.prototype.push.apply(videos, result.videos); if (result.error) errors.push(result.error); }
    if (!videos.length) throw new Error("이 회차의 재생 주소를 찾지 못했습니다. WebView에서 원본 재생 여부를 확인해 주세요." + (errors.length ? " (" + errors[0] + ")" : "")); return videos;
  }
  async getPageList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }
  getHeaders(url) { return { "User-Agent": this.userAgent, "Referer": (this._origin(url) || this.fallbackBaseUrl) + "/", "Accept": "*/*" }; }
  _option(name, value) { return { type_name: "SelectOption", name, value }; }
  _select(type, name, values) { return { type, name, type_name: "SelectFilter", values }; }
  getFilterList() {
    const o = this._option.bind(this), options = function(pairs) { return [o("선택하세요", "__unset__")].concat(pairs.map(function(p) { return o(p[0], p[1]); })); }, sep = function(type) { return { type, name: "", type_name: "SeparatorFilter" }; }, head = function(type, name) { return { type, name, type_name: "HeaderFilter" }; };
    const pop = this._tabRule(this.popularRulePreference, this._defaultPopularRule()), latest = this._tabRule(this.latestRulePreference, this._defaultLatestRule());
    return [sep("s1"), head("h1", "방영중"), this._select("ongoingDay", "요일", options(this.days)), this._select("ongoingSort", "정렬", options(this.sorts)), sep("s2"), head("h2", "완결"), this._select("finishedGenre", "장르", options(this.genres)), this._select("finishedSort", "정렬", options(this.sorts)), sep("s3"), head("h3", "극장판"), this._select("movieGenre", "장르", options(this.genres)), this._select("movieSort", "정렬", options(this.sorts)), sep("s4"), head("h4", "연도별"), this._select("yearValue", "연도별", options(this.years)), this._select("yearKind", "구분", options(this.yearKinds)), sep("s5"), head("h5", "TOP5 (사이트의 현재 순위를 실시간 반영)"), this._select("topKind", "TOP5", options(this.topKinds)), sep("s6"), head("saveHelp", "조건을 고른 뒤 Filter 버튼을 누르면 결과를 보고 Popular/Latest 탭 규칙으로 저장할 수 있습니다."), head("cardHelp", "목록 카드는 Popular/Latest 1번에만 표시되며 필터 결과와 글자 검색에서는 숨깁니다."), head("popularSummary", "현재 Popular: " + this._ruleSummary(pop)), head("latestSummary", "현재 Latest: " + this._ruleSummary(latest)), this._select("tabRuleAction", "Popular/Latest 규칙", [o("저장하지 않음 (필터 결과만 보기)", "0"), o("현재 조건을 Popular 탭에 저장", "1"), o("현재 조건을 Latest 탭에 저장", "2"), o("Popular 탭을 기본값으로 복원", "3"), o("Latest 탭을 기본값으로 복원", "4"), o("두 탭 모두 기본값으로 복원", "5")])];
  }
  getSourcePreferences() { return [{ key: "ani24_title_language_v2", listPreference: { title: "작품 제목 언어", summary: "한국어와 일본어 중에서 선택합니다. 변경 후 현재 화면을 새로고침하세요. Anissia에서 매칭되지 않는 작품은 한국어를 유지합니다.", valueIndex: 0, entries: ["한국어", "일본어"], entryValues: ["ko", "ja"] } }, { key: "ani24_domain_url", editTextPreference: { title: "애니24 주소 직접 지정 (선택)", summary: "빈 값이면 토끼 중앙신호등의 검증된 최신 주소를 사용합니다.", value: "", dialogTitle: "https://www.ohli24.net", dialogMessage: "자동 주소를 사용하려면 빈 값으로 두세요." } }, { key: "ani24_custom_card_json_url", editTextPreference: { title: "커스텀 목록 카드 (선택)", summary: "공개 JSON 주소 1개로 요일별 카드 7장을 설정합니다. 360×540 GIF를 권장하며 용량·프레임 제한은 없습니다.", value: "", dialogTitle: "커스텀 목록 카드 JSON 주소", dialogMessage: "Google Drive 공개 공유 링크 또는 직접 JSON 주소를 넣으세요. 개인 카드를 설정하면 공용 이벤트 카드는 표시되지 않습니다. 빈 값이면 공용 이벤트 또는 기본 미디어 요일 카드를 사용합니다." } }]; }
}
