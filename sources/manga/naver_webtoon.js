const mangayomiSources = [{
  name: "네이버 웹툰",
  lang: "ko",
  baseUrl: "https://comic.naver.com",
  apiUrl: "",
  iconUrl: "https://dc-toki-mangayomi-manga.pages.dev/icon/ko.naver-webtoon.png",
  typeSource: "single",
  itemType: 0,
  isNsfw: false,
  hasCloudflare: false,
  version: "0.1.1",
  dateFormat: "yy.MM.dd",
  dateFormatLocale: "ko_KR",
  pkgPath: "manga/src/ko/naver_webtoon.js"
}];

function dcResolveListCardManifest(data, scope, tab) {
  const source = data && typeof data === "object" ? data : {};
  const currentScope = String(scope || "default").trim().toLowerCase();
  const currentTab = String(tab || "all").trim().toLowerCase();
  const groupByScope = {
    xtoon: "manga", toon11: "manga", goodtoon: "manga", blacktoon: "manga",
    wolf_manga: "manga", wolf_webtoon: "manga", naver_webtoon: "manga",
    ani24: "media", anilife: "media", dc_iptv: "media", dc_live: "media",
    samsung_tv_plus: "media", linkkf_anime: "media", tvroom: "media",
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
    const score = (Number(rule.priority) || 0) * 10000 + targetScore + tabScore;
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
    if (!/^https:\/\//i.test(imageUrl)) return null;
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
  const key = "dc_list_card_system_last_" + String(scope || "default").replace(/[^a-z0-9_-]/gi, "_") + "_" + String(tab || "all").replace(/[^a-z0-9_-]/gi, "_");
  const timeKey = key + "_time", revisionKey = key + "_revision";
  let previous = 0, previousAt = 0, previousRevision = "";
  try {
    previous = Number(preferences.getString(key, "0"));
    previousAt = Number(preferences.getString(timeKey, "0"));
    previousRevision = String(preferences.getString(revisionKey, "") || "");
  } catch (_) {}
  let index = previous;
  const keepPrevious = holdMinutes > 0 && previous >= 1 && previous <= cards.length && previousAt > 0 && Date.now() - previousAt < holdMinutes * 60000 && previousRevision === revision;
  if (!keepPrevious) {
    index = Math.floor(Math.random() * cards.length) + 1;
    if (rotation.avoidImmediateRepeat !== false && cards.length > 1 && index === previous) index = index % cards.length + 1;
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
    this.baseUrl = "https://comic.naver.com";
    this.assetBaseUrl = "https://dc-toki-mangayomi-manga.pages.dev";
    this.userAgent = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
    this.popularRulePreference = "naver_webtoon_popular_rule_v1";
    this.latestRulePreference = "naver_webtoon_latest_rule_v1";
    this.sourceTypes = [["웹툰", "webtoon"], ["베스트도전", "bestChallenge"], ["도전만화", "challenge"]];
    this.sections = [["요일전체", "all"], ["월", "mon"], ["화", "tue"], ["수", "wed"], ["목", "thu"], ["금", "fri"], ["토", "sat"], ["일", "sun"], ["매일+", "dailyPlus"], ["신작", "new"], ["완결", "finish"]];
    this.genres = [["전체", ""], ["에피소드", "EPISODE"], ["옴니버스", "OMNIBUS"], ["스토리", "STORY"], ["일상", "DAILY"], ["개그", "COMIC"], ["판타지", "FANTASY"], ["액션", "ACTION"], ["드라마", "DRAMA"], ["로맨스", "PURE"], ["감성", "SENSIBILITY"], ["스릴러", "THRILL"], ["무협/사극", "HISTORICAL"], ["스포츠", "SPORTS"]];
    this.orders = [["인기순", "user"], ["업데이트순", "update"], ["조회순", "view"], ["별점순", "star"]];
  }

  _text(value) { return value === null || value === undefined ? "" : String(value); }
  _preference(key, fallback) {
    try {
      const preferences = new SharedPreferences();
      const value = preferences.get(key);
      return value === null || value === undefined ? preferences.getString(key, fallback) : value;
    } catch (_) { return fallback; }
  }
  _preferenceString(key, fallback) {
    try { return this._text(new SharedPreferences().getString(key, fallback)); } catch (_) { return fallback; }
  }
  _driveDirect(url, image) {
    const source = this._text(url).trim();
    const match = source.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    return match ? "https://drive.google.com/uc?export=" + (image ? "view" : "download") + "&id=" + match[1] : source;
  }
  async _customCardUrl(slug) {
    const source = this._text(this._preference("naver_webtoon_custom_card_json_url", "")).trim();
    if (!source) return "";
    const preferences = new SharedPreferences();
    const cacheKey = "naver_webtoon_custom_card_cache", sourceKey = cacheKey + "_source", timeKey = cacheKey + "_time";
    let data = null, cached = "";
    if (this._preferenceString(sourceKey, "") === source) cached = this._preferenceString(cacheKey, "");
    const cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < 300000) { try { data = JSON.parse(cached); } catch (_) {} }
    if (!data) {
      try {
        const direct = this._driveDirect(source, false);
        const response = await new Client({ persistentConnection: false, timeout: 15, connectTimeout: 8 }).get(
          direct + (direct.indexOf("?") >= 0 ? "&" : "?") + "card_json=" + Date.now(),
          { Accept: "application/json", "Cache-Control": "no-cache" }
        );
        if (!response || response.statusCode < 200 || response.statusCode >= 300) throw new Error("custom card");
        data = JSON.parse(this._text(response.body));
        preferences.setString(cacheKey, JSON.stringify(data));
        preferences.setString(sourceKey, source);
        preferences.setString(timeKey, String(Date.now()));
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

  async _response(url, accept) {
    let last = null;
    const headers = { "User-Agent": this.userAgent, Accept: accept || "application/json, text/plain, */*", Referer: this.baseUrl + "/" };
    for (const options of [{ persistentConnection: false, timeout: 20, connectTimeout: 10 }, { useDartHttpClient: true, persistentConnection: false }]) {
      try {
        const response = await new Client(options).get(url, headers);
        if (response && response.statusCode >= 200 && response.statusCode < 300) return response;
        last = new Error("HTTP " + (response ? response.statusCode : "?"));
      } catch (error) { last = error; }
    }
    throw last || new Error("네이버 웹툰 요청 실패");
  }
  async _json(url) { return JSON.parse(this._text((await this._response(url, "application/json, text/plain, */*")).body)); }
  async _html(url) { return this._text((await this._response(url, "text/html,application/xhtml+xml")).body); }
  _absolute(url) {
    const value = this._text(url).trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return this.baseUrl + (value.startsWith("/") ? value : "/" + value);
  }
  _relative(url) {
    const value = this._text(url).trim();
    if (!value) return "";
    if (!/^https?:\/\//i.test(value)) return value.startsWith("/") ? value : "/" + value;
    try { const parsed = new URL(value); return parsed.pathname + parsed.search; } catch (_) { return value; }
  }
  _query(url, key) {
    const match = this._text(url).match(new RegExp("[?&]" + key + "=([^&#]+)", "i"));
    return match ? decodeURIComponent(match[1]) : "";
  }
  _type(url) {
    const match = this._relative(url).match(/^\/(webtoon|bestChallenge|challenge)\//i);
    return match ? match[1] : "webtoon";
  }
  _today() {
    const days = [
      { short: "sun", key: "SUNDAY", slug: "sunday", label: "일요일", recommend: "추천 일요웹툰" },
      { short: "mon", key: "MONDAY", slug: "monday", label: "월요일", recommend: "추천 월요웹툰" },
      { short: "tue", key: "TUESDAY", slug: "tuesday", label: "화요일", recommend: "추천 화요웹툰" },
      { short: "wed", key: "WEDNESDAY", slug: "wednesday", label: "수요일", recommend: "추천 수요웹툰" },
      { short: "thu", key: "THURSDAY", slug: "thursday", label: "목요일", recommend: "추천 목요웹툰" },
      { short: "fri", key: "FRIDAY", slug: "friday", label: "금요일", recommend: "추천 금요웹툰" },
      { short: "sat", key: "SATURDAY", slug: "saturday", label: "토요일", recommend: "추천 토요웹툰" }
    ];
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return days[kst.getUTCDay()];
  }
  _card(name, imageUrl, kind, slug) {
    return { name: name, imageUrl: imageUrl, link: "/__naver_webtoon_card__/" + kind + "/" + slug };
  }
  _item(value, type) {
    const titleId = value && (value.titleId !== undefined ? value.titleId : value.id);
    const name = this._text(value && (value.titleName || value.title || value.name)).trim();
    const imageUrl = this._text(value && (value.thumbnailUrl || value.thumbnail || value.imageUrl || value.frontImage || value.bgImage || value.backImage)).trim();
    if (!titleId || !name) return null;
    return { name: name, link: "/" + (type || "webtoon") + "/list?titleId=" + encodeURIComponent(titleId), imageUrl: imageUrl };
  }
  _unique(items) {
    const seen = {};
    return (items || []).filter(function(item) {
      if (!item || !item.link || seen[item.link]) return false;
      seen[item.link] = true;
      return true;
    });
  }

  _defaultPopularRule() { return { mode: "homePopular" }; }
  _defaultLatestRule() { return { mode: "homeLatest" }; }
  _normalizeRule(rule, fallback) {
    const value = rule && typeof rule === "object" ? rule : fallback;
    if (value && (value.mode === "homePopular" || value.mode === "homeLatest")) return { mode: value.mode };
    const source = this.sourceTypes.some(function(pair) { return pair[1] === value.source; }) ? value.source : "webtoon";
    const section = this.sections.some(function(pair) { return pair[1] === value.section; }) ? value.section : "all";
    const genre = this.genres.some(function(pair) { return pair[1] === value.genre; }) ? value.genre : "";
    const order = this.orders.some(function(pair) { return pair[1] === value.order; }) ? value.order : "user";
    return { mode: "filter", source: source, section: section, genre: genre, order: order };
  }
  _encodeRule(rule) {
    const value = this._normalizeRule(rule, { mode: "filter", source: "webtoon", section: "all", genre: "", order: "user" });
    if (value.mode !== "filter") return value.mode;
    return ["filter", value.source, value.section, value.genre, value.order].join("|");
  }
  _decodeRule(value, fallback) {
    const text = this._text(value);
    if (text === "homePopular" || text === "homeLatest") return { mode: text };
    const p = text.split("|");
    if (p.length !== 5 || p[0] !== "filter") return fallback;
    return this._normalizeRule({ mode: "filter", source: p[1], section: p[2], genre: p[3], order: p[4] }, fallback);
  }
  _tabRule(key, fallback) {
    const encoded = this._preferenceString(key, "");
    return encoded ? this._decodeRule(encoded, fallback) : fallback;
  }
  _pairName(pairs, value, fallback) {
    const item = pairs.find(function(pair) { return pair[1] === value; });
    return item ? item[0] : fallback;
  }
  _ruleSummary(rule) {
    if (rule.mode === "homePopular") return "기본 구성 (오늘 추천 3개 + 요일 인기순)";
    if (rule.mode === "homeLatest") return "기본 구성 (오늘의 웹툰 업데이트순)";
    return [this._pairName(this.sourceTypes, rule.source, "웹툰"), this._pairName(this.sections, rule.section, "요일전체"), this._pairName(this.genres, rule.genre, "전체"), this._pairName(this.orders, rule.order, "인기순")].join(" + ");
  }
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
    return this._normalizeRule({
      mode: "filter",
      source: this._filterValue(filters, "sourceType", "webtoon"),
      section: this._filterValue(filters, "section", "all"),
      genre: this._filterValue(filters, "genre", ""),
      order: this._filterValue(filters, "order", "user")
    }, { mode: "filter", source: "webtoon", section: "all", genre: "", order: "user" });
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

  async _remoteCard(tab, today) {
    const custom = await this._customCardUrl(today.slug);
    if (custom) return this._card("오늘의 웹툰", custom, "remote", today.slug);
    const official = await dcOfficialListCardSystem("naver_webtoon", tab, "오늘의 웹툰");
    return this._card(official.name || "오늘의 웹툰", official.imageUrl, "remote", today.slug);
  }
  async _weekday(order, week) {
    const query = week ? "?week=" + encodeURIComponent(week) + "&order=" + encodeURIComponent(order) : "?order=" + encodeURIComponent(order);
    const data = await this._json(this.baseUrl + "/api/webtoon/titlelist/weekday" + query);
    if (week) return (data.titleList || []).map((value) => this._item(value, "webtoon")).filter(Boolean);
    return data.titleListMap || {};
  }
  async _homePopular(page) {
    if (Number(page) > 1) return { list: [], hasNextPage: false };
    const today = this._today();
    const map = await this._weekday("user", "");
    const dayItems = (map[today.key] || []).map((value) => this._item(value, "webtoon")).filter(Boolean);
    const byId = {};
    for (const value of map[today.key] || []) byId[this._text(value.titleId)] = value;
    let recommended = [];
    try {
      const triple = await this._json(this.baseUrl + "/api/tripleRecommend?week=" + today.short);
      recommended = (triple.itemList || []).slice(0, 3).map((value) => {
        const ordinary = byId[this._text(value.titleId)];
        return this._item(ordinary || value, "webtoon");
      }).filter(Boolean);
    } catch (_) {}
    const list = [
      await this._remoteCard("popular", today),
      this._card(today.recommend, this.assetBaseUrl + "/assets/naver-webtoon/recommend-" + today.slug + ".webp", "recommend", today.slug)
    ].concat(recommended).concat([
      this._card(today.label + " 인기순", this.assetBaseUrl + "/assets/naver-webtoon/popular-" + today.slug + ".webp", "popular", today.slug)
    ]).concat(dayItems);
    return { list: list, hasNextPage: false };
  }
  async _homeLatest(page) {
    if (Number(page) > 1) return { list: [], hasNextPage: false };
    const today = this._today();
    const map = await this._weekday("update", "");
    const items = (map[today.key] || []).map((value) => this._item(value, "webtoon")).filter(Boolean);
    return { list: [await this._remoteCard("latest", today)].concat(items), hasNextPage: false };
  }
  async _browseWebtoon(page, rule) {
    const order = rule.order;
    if (rule.genre) {
      const data = await this._json(this.baseUrl + "/api/webtoon/titlelist/genre?genre=" + encodeURIComponent(rule.genre) + "&order=" + encodeURIComponent(order) + "&page=" + Math.max(1, Number(page) || 1));
      return { list: (data.titleList || []).map((value) => this._item(value, "webtoon")).filter(Boolean), hasNextPage: !!(data.pageInfo && Number(data.pageInfo.nextPage)) };
    }
    if (rule.section === "all") {
      if (Number(page) > 1) return { list: [], hasNextPage: false };
      const map = await this._weekday(order, "");
      const keys = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
      const result = [];
      for (const key of keys) for (const value of map[key] || []) result.push(this._item(value, "webtoon"));
      return { list: this._unique(result.filter(Boolean)), hasNextPage: false };
    }
    if (["mon", "tue", "wed", "thu", "fri", "sat", "sun", "dailyPlus"].indexOf(rule.section) >= 0) {
      if (Number(page) > 1) return { list: [], hasNextPage: false };
      return { list: await this._weekday(order, rule.section), hasNextPage: false };
    }
    if (rule.section === "new") {
      if (Number(page) > 1) return { list: [], hasNextPage: false };
      const data = await this._json(this.baseUrl + "/api/webtoon/titlelist/new?order=" + encodeURIComponent(order));
      return { list: (data.titleList || []).map((value) => this._item(value, "webtoon")).filter(Boolean), hasNextPage: false };
    }
    const data = await this._json(this.baseUrl + "/api/webtoon/titlelist/finished?page=" + Math.max(1, Number(page) || 1) + "&order=" + encodeURIComponent(order.toUpperCase()));
    return { list: (data.titleList || []).map((value) => this._item(value, "webtoon")).filter(Boolean), hasNextPage: !!(data.pageInfo && Number(data.pageInfo.nextPage)) };
  }
  async _browseUgc(page, rule) {
    const type = rule.source;
    let url = this.baseUrl + "/api/" + type + "/list?page=" + Math.max(1, Number(page) || 1) + "&pageSize=30";
    if (rule.genre) url += "&genre=" + encodeURIComponent(rule.genre);
    if (type === "bestChallenge") {
      const order = rule.order === "update" ? "UPDATE" : rule.order === "star" ? "STARSCORE" : "VIEW";
      url += "&order=" + order;
    } else {
      url += "&order=UPDATE&tab=" + (rule.order === "user" ? "RECOMMEND" : "TOTAL");
    }
    const data = await this._json(url);
    return { list: (data.list || []).map((value) => this._item(value, type)).filter(Boolean), hasNextPage: !!(data.pageInfo && Number(data.pageInfo.nextPage)) };
  }
  async _browse(page, rule) {
    if (rule.mode === "homePopular") return await this._homePopular(page);
    if (rule.mode === "homeLatest") return await this._homeLatest(page);
    return rule.source === "webtoon" ? await this._browseWebtoon(page, rule) : await this._browseUgc(page, rule);
  }
  async _withRemoteCard(result, page, tab) {
    if (Number(page) !== 1) return result;
    return { list: [await this._remoteCard(tab, this._today())].concat(result.list || []), hasNextPage: result.hasNextPage === true };
  }
  async getPopular(page) {
    const rule = this._tabRule(this.popularRulePreference, this._defaultPopularRule());
    const result = await this._browse(page, rule);
    return rule.mode === "homePopular" ? result : await this._withRemoteCard(result, page, "popular");
  }
  async getLatestUpdates(page) {
    const rule = this._tabRule(this.latestRulePreference, this._defaultLatestRule());
    const result = await this._browse(page, rule);
    return rule.mode === "homeLatest" ? result : await this._withRemoteCard(result, page, "latest");
  }
  async search(query, page, filters) {
    const q = this._text(query).trim();
    const rule = this._filterRule(filters);
    if (!q) {
      this._applyTabRuleAction(page, filters, rule);
      return await this._browse(page, rule);
    }
    const type = rule.source;
    const data = await this._json(this.baseUrl + "/api/search/" + type + "?keyword=" + encodeURIComponent(q) + "&page=" + Math.max(1, Number(page) || 1));
    return { list: (data.searchList || []).map((value) => this._item(value, type)).filter(Boolean), hasNextPage: !!(data.pageInfo && Number(data.pageInfo.nextPage)) };
  }

  _chapterDate(value) {
    const match = this._text(value).match(/^(\d{2,4})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
    if (!match) return "0";
    const year = Number(match[1]) < 100 ? 2000 + Number(match[1]) : Number(match[1]);
    const time = Date.UTC(year, Number(match[2]) - 1, Number(match[3])) - 9 * 60 * 60 * 1000;
    return Number.isFinite(time) ? String(time) : "0";
  }
  _chapterName(value, fallbackNo) {
    const name = this._text(value).trim() || (fallbackNo + "화");
    if (/^\s*\d+(?:\.\d+)?\s*화/.test(name)) return name;
    // Mangayomi derives chapter identity from the first ASCII number in the
    // displayed title.  Labels such as "시즌1 후기" and "외유5화" would
    // otherwise replace the real chapter 1 and chapter 5.  Full-width digits
    // look the same to readers but keep these named specials unnumbered, so
    // every distinct Naver article URL remains available.
    return name.replace(/[0-9]/g, function(digit) {
      return String.fromCharCode(0xFF10 + Number(digit));
    });
  }
  async _chapters(titleId, type) {
    let page = 1, next = 1, totalCount = 0, dailyPass = false;
    const chapters = [];
    while (next && page <= 100) {
      const data = await this._json(this.baseUrl + "/api/article/list?titleId=" + encodeURIComponent(titleId) + "&page=" + page + "&sourceType=" + encodeURIComponent(type));
      totalCount = Math.max(totalCount, Number(data.totalCount) || 0);
      dailyPass = dailyPass || data.dailyPass === true;
      for (const chapter of data.articleList || []) {
        chapters.push({
          name: this._chapterName(chapter.subtitle, chapter.no),
          url: "/" + type + "/detail?titleId=" + encodeURIComponent(titleId) + "&no=" + encodeURIComponent(chapter.no),
          dateUpload: this._chapterDate(chapter.serviceDateDescription)
        });
      }
      next = data.pageInfo ? Number(data.pageInfo.nextPage) || 0 : 0;
      page = next;
    }
    if (dailyPass && chapters.length) {
      const locked = Math.max(0, totalCount - chapters.length);
      const notice = "⏱ 웹툰 앱에서 24시간마다 무료" + (locked ? " · 유료 회차 " + locked + "개" : "");
      chapters[0].scanlator = notice;
      chapters[0].description = notice;
    }
    return chapters;
  }
  async getDetail(url) {
    const path = this._relative(url);
    const card = path.match(/^\/__naver_webtoon_card__\/([^/]+)\/([^/?#]+)/);
    if (card) {
      const today = this._today();
      const names = { remote: "오늘의 웹툰", recommend: today.recommend, popular: today.label + " 인기순" };
      const images = { recommend: this.assetBaseUrl + "/assets/naver-webtoon/recommend-" + card[2] + ".webp", popular: this.assetBaseUrl + "/assets/naver-webtoon/popular-" + card[2] + ".webp" };
      return { name: names[card[1]] || "오늘의 웹툰", link: path, imageUrl: images[card[1]] || "", author: "", description: "목록 구분 카드", genre: ["목록 카드"], status: 0, episodes: [], chapters: [] };
    }
    const titleId = this._query(path, "titleId"), type = this._type(path);
    if (!titleId) throw new Error("작품 번호를 찾지 못했습니다.");
    const info = await this._json(this.baseUrl + "/api/article/list/info?titleId=" + encodeURIComponent(titleId) + "&sourceType=" + encodeURIComponent(type));
    const adult = info.adult === true || (info.age && info.age.type === "RATE_18") || (Array.isArray(info.thumbnailBadgeList) && info.thumbnailBadgeList.indexOf("ADULT") >= 0);
    let chapters;
    if (adult) {
      chapters = [{ name: "🔐 네이버 로그인 필요 · 앱에서는 열람 불가", url: "/__naver_webtoon_notice__/login/" + titleId, dateUpload: "0" }];
    } else {
      chapters = await this._chapters(titleId, type);
    }
    const authors = Array.isArray(info.communityArtists) ? info.communityArtists.map(function(item) { return String(item && item.name || "").trim(); }).filter(Boolean) : [];
    const tags = Array.isArray(info.curationTagList) ? info.curationTagList.map(function(item) { return String(item && (item.tagName || item.name || item.title) || "").replace(/^#/, "").trim(); }).filter(Boolean) : [];
    const completed = info.finished === true || info.finish === true;
    return {
      name: this._text(info.titleName || info.title).trim(),
      link: "/" + type + "/list?titleId=" + encodeURIComponent(titleId),
      imageUrl: this._text(info.thumbnailUrl).trim(),
      author: authors.join(", ") || this._text(info.author),
      description: this._text(info.synopsis).trim(),
      genre: tags,
      status: completed ? 1 : info.rest === true ? 4 : 0,
      episodes: chapters,
      chapters: chapters
    };
  }
  async getPageList(url) {
    const path = this._relative(url);
    if (path.indexOf("/__naver_webtoon_notice__/") === 0) return [];
    const document = new Document(await this._html(this._absolute(path)));
    let images = document.select(".wt_viewer img");
    if (!images || !images.length) images = document.select(".toon_view_lst img");
    const result = [];
    for (const image of images || []) {
      const src = this._text(image.attr("data-src") || image.attr("src")).trim();
      if (src && result.indexOf(this._absolute(src)) < 0) result.push(this._absolute(src));
    }
    return result;
  }
  getHeaders(url) {
    return { "User-Agent": this.userAgent, Referer: this.baseUrl + "/", Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" };
  }
  async getVideoList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }

  _option(name, value) { return { type_name: "SelectOption", name: name, value: value }; }
  _select(type, name, pairs) {
    const o = this._option.bind(this);
    return { type: type, name: name, type_name: "SelectFilter", values: pairs.map(function(pair) { return o(pair[0], pair[1]); }) };
  }
  getFilterList() {
    const popular = this._tabRule(this.popularRulePreference, this._defaultPopularRule());
    const latest = this._tabRule(this.latestRulePreference, this._defaultLatestRule());
    const header = function(type, name) { return { type: type, name: name, type_name: "HeaderFilter" }; };
    const separator = function(type) { return { type: type, name: "", type_name: "SeparatorFilter" }; };
    return [
      this._select("sourceType", "구분", this.sourceTypes),
      this._select("section", "웹툰 분류", this.sections),
      this._select("genre", "장르", this.genres),
      this._select("order", "정렬", this.orders),
      separator("saveSeparator"),
      header("saveHelp", "조건을 고른 뒤 Filter 버튼을 누르면 결과를 보고 Popular/Latest 탭 규칙으로 저장할 수 있습니다."),
      header("popularSummary", "현재 Popular: " + this._ruleSummary(popular)),
      header("latestSummary", "현재 Latest: " + this._ruleSummary(latest)),
      this._select("tabRuleAction", "Popular/Latest 규칙", [
        ["저장하지 않음 (필터 결과만 보기)", "0"],
        ["현재 조건을 Popular 탭에 저장", "1"],
        ["현재 조건을 Latest 탭에 저장", "2"],
        ["Popular 탭을 기본값으로 복원", "3"],
        ["Latest 탭을 기본값으로 복원", "4"],
        ["두 탭 모두 기본값으로 복원", "5"]
      ])
    ];
  }
  getSourcePreferences() {
    return [{
      key: "naver_webtoon_custom_card_json_url",
      editTextPreference: {
        title: "커스텀 목록 카드",
        summary: "공개 JSON 주소 하나로 요일별 목록 카드를 설정합니다. 360×540 이미지를 권장하며 용량·프레임 제한은 없습니다.",
        value: "",
        dialogTitle: "커스텀 목록 카드 JSON 주소",
        dialogMessage: "Google Drive 공개 공유 링크 또는 직접 JSON 주소를 넣으세요. 빈 값이면 기본 원격 랜덤 카드를 사용합니다."
      }
    }];
  }
}
