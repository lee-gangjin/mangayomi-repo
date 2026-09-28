const mangayomiSources = [
  {
    "name": "라이브 TV·라디오",
    "lang": "ko",
    "baseUrl": "https://webtv.dothome.co.kr",
    "apiUrl": "",
    "iconUrl": "https://dc-toki-mangayomi-media.pages.dev/icon/ko.media.png",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "version": "0.1.7",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/ko/dclive.js",
    "notes": "인기탭: 실시간 TV · 최신탭: 실시간 라디오 · 한글 정적 채널 카드 · 각 탭 첫 번째는 미디어 요일 카드 · 커스텀 목록 카드 · 무기한 목록 캐시 · 재생 실패 시 자동 갱신"
  }
];

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
    this.baseUrl = "https://webtv.dothome.co.kr";
    this.assetBaseUrl = "https://dc-toki-mangayomi-media.pages.dev";
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36";
    this.cacheGeneration = "v2";
    this.memoryCache = {};
    this.kinds = {
      tv: { key: "tv", label: "TV", pagePath: "/index.php", scriptToken: "webtv_tv_" },
      radio: { key: "radio", label: "라디오", pagePath: "/index3.php", scriptToken: "webtv_r_" }
    };
    this.kbsApi = "https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/";
    this.naverLiveApi = "https://api.tv.naver.com/api/open/live/v2/player/playback?liveId=";
    this.kbsNewsLiveId = "18333419";
    this.mbnAuthUrl = "https://www.mbn.co.kr/player/mbnStreamAuth_new_live.mbn?vod_url=https://hls-live.mbn.co.kr/mbn-on-air/600k/playlist.m3u8";
    this.sbsNewsApi = "https://api-gw.sbsdlab.co.kr/v1/news_front_api/live/live_list";
  }

  get supportsLatest() { return true; }
  text(value) { return value === null || value === undefined ? "" : String(value); }
  preference(key, fallback) { try { const value = new SharedPreferences().get(key); return value === null || value === undefined ? fallback : value; } catch (_) { return fallback; } }
  preferenceString(key, fallback) { try { const value = new SharedPreferences().getString(key, fallback); return value === null || value === undefined ? fallback : this.text(value); } catch (_) { return fallback; } }
  origin(url) { const match = this.text(url).match(/^(https?:\/\/[^/]+)/i); return match ? match[1] : this.baseUrl; }
  absoluteUrl(base, value) {
    const raw = this.text(value).trim().replace(/\\\//g, "/").replace(/&amp;/gi, "&");
    if (!raw) return "";
    if (raw.startsWith("//")) return "https:" + raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/")) return this.origin(base) + raw;
    return base.replace(/[?#].*$/, "").replace(/[^/]*$/, "") + raw;
  }

  koreaWeekday() { return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay()]; }
  weekdayName(slug) { return ({ monday: "월요일", tuesday: "화요일", wednesday: "수요일", thursday: "목요일", friday: "금요일", saturday: "토요일", sunday: "일요일" })[slug] || "오늘"; }
  driveDirect(url, image) { const value = this.text(url).trim(), match = value.match(/drive\.google\.com\/file\/d\/([^/]+)/i); return match ? "https://drive.google.com/uc?export=" + (image ? "view" : "download") + "&id=" + match[1] : value; }

  async customCardUrl(slug) {
    const source = this.text(this.preference("dc_live_custom_card_json_url", "")).trim();
    if (!source) return "";
    const preferences = new SharedPreferences(), cacheKey = "dc_live_custom_card_cache", sourceKey = cacheKey + "_source", timeKey = cacheKey + "_time";
    let data = null, cached = "";
    if (this.preferenceString(sourceKey, "") === source) cached = this.preferenceString(cacheKey, "");
    const cachedAt = Number(this.preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000) { try { data = JSON.parse(cached); } catch (_) {} }
    if (!data) {
      try {
        const direct = this.driveDirect(source, false), join = direct.indexOf("?") >= 0 ? "&" : "?";
        const body = await this.requestText(direct + join + "card_json=" + Date.now(), source, "커스텀 목록 카드", { "Accept": "application/json", "Cache-Control": "no-cache" });
        data = JSON.parse(body);
        preferences.setString(cacheKey, JSON.stringify(data));
        preferences.setString(sourceKey, source);
        preferences.setString(timeKey, String(Date.now()));
      } catch (_) { if (cached) { try { data = JSON.parse(cached); } catch (_) {} } }
    }
    if (!data || typeof data !== "object") return "";
    const cards = data.cards && typeof data.cards === "object" ? data.cards : {};
    let image = this.text(cards[slug] || data.default || data.card).trim();
    if (!image) return "";
    image = this.driveDirect(image, true);
    if (data.revision !== undefined && this.text(data.revision).trim()) image += (image.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(this.text(data.revision));
    return image;
  }

  async weekdayItem(slug, tab) {
    const weekday = slug || this.koreaWeekday();
    const customSource = this.text(this.preference("dc_live_custom_card_json_url", "")).trim();
    const customImage = await this.customCardUrl(weekday);
    const event = customSource ? null : await dcOfficialEventCard();
    const official = customImage || event ? null : await dcOfficialListCardSystem("dc_live", tab, "오늘의 미디어");
    return { name: customImage ? this.weekdayName(weekday) : event ? event.name : official.name, imageUrl: customImage || (event && event.imageUrl) || official.imageUrl, link: JSON.stringify({ weekdayCard: weekday }) };
  }

  headers(url, referer, accept) {
    return {
      "User-Agent": this.userAgent,
      "Accept": accept || "text/html,application/javascript,application/json;q=0.9,application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      "Referer": referer || this.origin(url) + "/"
    };
  }

  responseHeader(response, name) {
    const headers = response && response.headers ? response.headers : {}, wanted = this.text(name).toLowerCase();
    for (const key of Object.keys(headers)) if (this.text(key).toLowerCase() === wanted) return this.text(headers[key]);
    return "";
  }

  redirectLocation(response) {
    const header = this.responseHeader(response, "location");
    if (header) return header;
    const body = this.text(response && response.body);
    const anchor = body.match(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>\s*https?:\/\//i);
    if (anchor) return anchor[1].replace(/&amp;/gi, "&");
    const refresh = body.match(/http-equiv=["']refresh["'][^>]+content=["'][^>]*?url=['"]?(https?:\/\/[^'" >]+)/i);
    return refresh ? refresh[1].replace(/&amp;/gi, "&") : "";
  }

  async requestResponse(url, referer, stage, extraHeaders) {
    const transports = [
      { name: "RHTTP", options: { persistentConnection: false, noProxy: true, timeout: 25, connectTimeout: 8, followRedirects: false, maxRedirects: 0 } },
      { name: "DART", options: { useDartHttpClient: true, persistentConnection: false, followRedirects: false, maxRedirects: 0 } }
    ];
    const diagnostics = [];
    for (const transport of transports) {
      try {
        let currentUrl = url, currentReferer = referer;
        for (let redirect = 0; redirect <= 8; redirect++) {
          const requestHeaders = this.headers(currentUrl, currentReferer); Object.assign(requestHeaders, extraHeaders || {});
          const response = await new Client(transport.options).get(currentUrl, requestHeaders);
          if (response.statusCode >= 200 && response.statusCode < 300) return { response, url: currentUrl };
          const location = response.statusCode >= 300 && response.statusCode < 400 ? this.redirectLocation(response) : "";
          if (location && redirect < 8) { currentReferer = currentUrl; currentUrl = this.absoluteUrl(currentUrl, location); continue; }
          diagnostics.push(transport.name + "=HTTP" + response.statusCode); break;
        }
      } catch (error) { diagnostics.push(transport.name + "=" + this.text(error && (error.message || error))); }
    }
    throw new Error("라이브 TV·라디오 " + (stage || "요청") + " 연결 실패: " + diagnostics.join(","));
  }

  repairUtf8(value) {
    const raw = this.text(value).replace(/^\uFEFF/, "");
    if (!raw || /[\uac00-\ud7a3]/.test(raw) || !/[\u0080-\u00ff\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/.test(raw)) return raw;
    const windows1252 = { 8364: 128, 8218: 130, 402: 131, 8222: 132, 8230: 133, 8224: 134, 8225: 135, 710: 136, 8240: 137, 352: 138, 8249: 139, 338: 140, 381: 142, 8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150, 8212: 151, 732: 152, 8482: 153, 353: 154, 8250: 155, 339: 156, 382: 158, 376: 159 };
    let encoded = "";
    for (let index = 0; index < raw.length; index++) {
      const code = raw.charCodeAt(index), byte = code <= 255 ? code : windows1252[code];
      if (byte === undefined) return raw;
      encoded += "%" + byte.toString(16).padStart(2, "0");
    }
    try { return decodeURIComponent(encoded); } catch (_) { return raw; }
  }

  async requestText(url, referer, stage, extraHeaders) { return this.repairUtf8((await this.requestResponse(url, referer, stage, extraHeaders)).response.body); }
  cacheKey(kind) { return "dc_live_channels_" + this.cacheGeneration + "_" + kind.key; }
  cachedChannels(kind) {
    if (Array.isArray(this.memoryCache[kind.key]) && this.memoryCache[kind.key].length) return this.memoryCache[kind.key];
    const raw = this.preferenceString(this.cacheKey(kind), "");
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) { this.memoryCache[kind.key] = parsed; return parsed; }
    } catch (_) {}
    return [];
  }

  decodeHtml(value) {
    return this.text(value)
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(Number(code)); })
      .replace(/\s+/g, " ").trim();
  }

  extractScriptUrls(pageHtml, kind) {
    const fragments = [this.text(pageHtml)];
    const unescapePattern = /unescape\("([^"]+)"\)/g;
    let match;
    while ((match = unescapePattern.exec(this.text(pageHtml))) !== null) { try { fragments.push(decodeURIComponent(match[1])); } catch (_) { fragments.push(match[1]); } }
    const urls = [], seen = new Set(), scriptPattern = /src=["']?(https?:\/\/[^\s"'>]+\/webtv_(?:tv|r)_[^\s"'>]+\.js)/gi;
    for (const fragment of fragments) {
      scriptPattern.lastIndex = 0;
      while ((match = scriptPattern.exec(fragment)) !== null) {
        const url = match[1].replace(/&amp;/gi, "&");
        if (url.indexOf(kind.scriptToken) >= 0 && !seen.has(url)) { seen.add(url); urls.push(url); }
      }
    }
    return urls;
  }

  parseChannelScript(script, kind) {
    const channels = [], pattern = /<a href=["']#none["'] onclick=["']([^"']*(?:\\["'][^"']*)*)["']>(.*?)<\/a>/gis;
    let match;
    while ((match = pattern.exec(this.text(script))) !== null) {
      const action = match[1].replace(/\\'/g, "'").replace(/\\\//g, "/").trim();
      const title = this.decodeHtml(match[2]);
      if (title && action) channels.push({ kind: kind.key, title, action });
    }
    return channels;
  }

  async mapConcurrent(values, limit, worker) {
    const results = new Array(values.length); let cursor = 0;
    const run = async () => { while (cursor < values.length) { const index = cursor++; results[index] = await worker(values[index], index); } };
    const runners = []; for (let index = 0; index < Math.min(limit, values.length); index++) runners.push(run());
    await Promise.all(runners); return results;
  }

  async fetchChannels(kind) {
    const pageUrl = this.baseUrl + kind.pagePath;
    const pageHtml = await this.requestText(pageUrl, this.baseUrl + "/", kind.label + " 목록");
    const scriptUrls = this.extractScriptUrls(pageHtml, kind);
    if (!scriptUrls.length) throw new Error(kind.label + " 목록 스크립트를 찾지 못했습니다.");
    const groups = await this.mapConcurrent(scriptUrls, 4, async (scriptUrl) => this.parseChannelScript(await this.requestText(scriptUrl, pageUrl, kind.label + " 채널 목록"), kind));
    const seen = new Set(), channels = [];
    for (const channel of [].concat.apply([], groups)) {
      const key = channel.title + "\u0000" + channel.action;
      if (!seen.has(key)) { seen.add(key); channels.push(channel); }
    }
    if (!channels.length) throw new Error(kind.label + " 채널을 찾지 못했습니다.");
    return channels;
  }

  async refreshChannels(kind) {
    const channels = await this.fetchChannels(kind);
    try { new SharedPreferences().setString(this.cacheKey(kind), JSON.stringify(channels)); } catch (_) {}
    this.memoryCache[kind.key] = channels;
    return channels;
  }

  async loadChannels(kind) {
    const cached = this.cachedChannels(kind);
    if (cached.length) return cached;
    return this.refreshChannels(kind);
  }

  normalizedSearch(value) { let text = this.text(value).toLocaleLowerCase(); try { text = text.normalize("NFKC"); } catch (_) {} return text.replace(/[\s\p{P}·ㆍ・]+/gu, ""); }
  titleCardKey(title) {
    let hash = 2166136261;
    const value = this.text(title);
    for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) >>> 0; }
    return hash.toString(16).padStart(8, "0");
  }
  titleCardUrl(title) { return this.assetBaseUrl + "/card/dclive/" + (title ? this.titleCardKey(title) : "default") + ".png"; }
  channelItem(channel) { return { name: channel.title, imageUrl: this.titleCardUrl(channel.title), link: JSON.stringify(channel) }; }

  async listing(kind, page, tab) {
    if (Number(page) > 1) return { list: [], hasNextPage: false };
    const channels = await this.loadChannels(kind);
    return { list: [await this.weekdayItem(undefined, tab)].concat(channels.map((channel) => this.channelItem(channel))), hasNextPage: false };
  }

  async getPopular(page) { return this.listing(this.kinds.tv, page, "popular"); }
  async getLatestUpdates(page) { return this.listing(this.kinds.radio, page, "latest"); }

  async search(query, page) {
    if (Number(page) > 1) return { list: [], hasNextPage: false };
    const results = await Promise.all([this.loadChannels(this.kinds.tv), this.loadChannels(this.kinds.radio)]);
    const wanted = this.normalizedSearch(query), seen = new Set(), channels = [];
    for (const channel of results[0].concat(results[1])) {
      const key = channel.kind + "\u0000" + channel.title + "\u0000" + channel.action;
      if (!seen.has(key) && (!wanted || this.normalizedSearch(channel.title).includes(wanted))) { seen.add(key); channels.push(channel); }
    }
    return { list: channels.map((channel) => this.channelItem(channel)), hasNextPage: false };
  }

  async getDetail(url) {
    const item = JSON.parse(url);
    if (item.weekdayCard) {
      const card = await this.weekdayItem(item.weekdayCard);
      return { name: card.name, link: url, imageUrl: card.imageUrl, description: "오늘의 시간 흐름을 담은 움직이는 미디어 요일 카드입니다. 뒤로 돌아가 채널을 선택해 주세요.", author: "라이브 TV·라디오", status: 0, genre: ["요일 안내"], episodes: [], chapters: [] };
    }
    const kind = this.kinds[item.kind] || this.kinds.tv;
    return {
      name: item.title,
      link: url,
      imageUrl: this.titleCardUrl(item.title),
      description: item.title + " 실시간 " + kind.label + " 방송입니다.\n방송사 사정에 따라 일시적으로 재생되지 않을 수 있습니다.",
      author: "라이브 TV·라디오",
      status: 0,
      genre: ["실시간 " + kind.label],
      episodes: [{ name: item.title + " 라이브", url: JSON.stringify(item), scanlator: "라이브 TV·라디오" }]
    };
  }

  functionArgument(action) { const match = this.text(action).match(/\(\s*'([^']*)'/); return match ? match[1] : ""; }
  directUrl(action) { const match = this.text(action).match(/window\.open\(\s*'([^']+)'/i); return match ? match[1] : ""; }
  mediaUrl(url) { const clean = this.text(url).split("?")[0].toLowerCase(); return [".m3u8", ".m3u", ".mpd", ".mp3", ".aac", ".m4a", ".ogg", ".opus"].some((extension) => clean.endsWith(extension)); }

  async resolveKbs(channelCode, itemIndex) {
    if (!channelCode) return "";
    const data = JSON.parse(await this.requestText(this.kbsApi + encodeURIComponent(channelCode), this.baseUrl + "/", "KBS 재생 주소", { "Accept": "application/json" }));
    const items = Array.isArray(data.channel_item) ? data.channel_item : [];
    return this.text((items[itemIndex] && items[itemIndex].service_url) || (items[0] && items[0].service_url)).trim();
  }

  async resolveNaverLive(liveId) {
    const data = JSON.parse(await this.requestText(this.naverLiveApi + encodeURIComponent(liveId) + "&countryCode=KR&timeMachine=true", this.baseUrl + "/", "네이버 라이브 재생 주소", { "Accept": "application/json" }));
    if (this.text(data.hlsUrl).trim()) return this.text(data.hlsUrl).trim();
    return data.media && data.media[0] ? this.text(data.media[0].path).trim() : "";
  }

  async resolveMbn() { return (await this.requestText(this.mbnAuthUrl, this.baseUrl + "/", "MBN 재생 주소", { "Accept": "text/plain,*/*" })).trim(); }

  youtubeVideoId(url) {
    const embed = this.text(url).match(/\/embed\/([^?&/]+)/i); if (embed && embed[1] !== "live_stream") return embed[1];
    const watch = this.text(url).match(/[?&]v=([^&]+)/i); return watch ? watch[1] : "";
  }

  jsonUnescape(value) { try { return JSON.parse('"' + this.text(value).replace(/"/g, '\\"') + '"'); } catch (_) { return this.text(value).replace(/\\u0026/g, "&").replace(/\\\//g, "/"); } }

  async resolveYouTube(embedUrl) {
    let videoId = this.youtubeVideoId(embedUrl), watchUrl = "";
    if (/\/embed\/live_stream/i.test(embedUrl)) {
      const channel = this.text(embedUrl).match(/[?&]channel=([^&]+)/i); if (!channel) return "";
      watchUrl = "https://www.youtube.com/channel/" + channel[1] + "/live";
    } else {
      if (!videoId) return "";
      watchUrl = "https://www.youtube.com/watch?v=" + videoId;
    }
    const html = await this.requestText(watchUrl, "https://www.youtube.com/", "YouTube 라이브", { "Accept": "text/html,*/*" });
    const direct = html.match(/"hlsManifestUrl":"((?:\\.|[^"\\])*)"/);
    if (direct) return this.jsonUnescape(direct[1]);
    if (!videoId) { const pageId = html.match(/"videoId":"([^"\\]+)"/); videoId = pageId ? pageId[1] : ""; }
    const apiKey = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
    if (!videoId || !apiKey) return "";
    const payload = JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 35, hl: "ko", gl: "KR" } }, videoId, contentCheckOk: true, racyCheckOk: true });
    const response = await new Client({ persistentConnection: false, noProxy: true, timeout: 20, connectTimeout: 8 }).post("https://www.youtube.com/youtubei/v1/player?key=" + encodeURIComponent(apiKey), { "User-Agent": this.userAgent, "Referer": "https://www.youtube.com/", "Content-Type": "application/json; charset=utf-8", "Accept": "application/json" }, payload);
    if (response.statusCode < 200 || response.statusCode >= 300) return "";
    const data = JSON.parse(this.text(response.body));
    return data.streamingData ? this.text(data.streamingData.hlsManifestUrl).trim() : "";
  }

  async resolveSbsNews() {
    const data = JSON.parse(await this.requestText(this.sbsNewsApi, "https://news.sbs.co.kr/", "SBS 뉴스 재생 주소", { "Accept": "application/json" }));
    const videoId = data.items && data.items[0] && data.items[0].id ? this.text(data.items[0].id.videoId).trim() : "";
    return videoId ? this.resolveYouTube("https://www.youtube.com/embed/" + videoId) : "";
  }

  async resolveDirectUrl(rawUrl) {
    let url = this.text(rawUrl).trim().replace(/\\+$/, "");
    if (url.indexOf("xzx.kr/") >= 0) { const parts = url.split("/").filter(Boolean); url = "https://xzx.kr/" + parts[parts.length - 1]; }
    if (url.indexOf("youtube.com/") >= 0) return this.resolveYouTube(url);
    if (url.indexOf("https://news.sbs.co.kr/") === 0) return this.resolveSbsNews();
    const result = await this.requestResponse(url, this.baseUrl + "/", "직접 재생 주소", { "Accept": "application/vnd.apple.mpegurl,application/x-mpegURL,audio/*,video/*,text/html,*/*" });
    if (result.url.indexOf("youtube.com/") >= 0) return this.resolveYouTube(result.url);
    const contentType = this.responseHeader(result.response, "content-type").toLowerCase();
    const body = this.text(result.response.body);
    if (/^\s*#EXTM3U/i.test(body) && /#EXT-X-STREAM-INF:/i.test(body)) {
      const nested = body.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && line.indexOf("#") !== 0);
      if (nested.length === 1) return this.absoluteUrl(result.url, nested[0]);
    }
    if (this.mediaUrl(result.url) || /mpegurl|dash|audio\//i.test(contentType) || /^\s*#EXTM3U/i.test(body)) return result.url;
    const iframe = body.match(/<(?:iframe|source)[^>]+src=["']([^"']+)["']/i);
    if (iframe) return this.resolveDirectUrl(this.absoluteUrl(result.url, iframe[1]));
    return "";
  }

  async resolveAction(action) {
    if (action.indexOf("popKBSRadioBora") === 0) return this.resolveKbs(this.functionArgument(action), 1);
    if (action.indexOf("popKBSNews") === 0) return this.resolveNaverLive(this.kbsNewsLiveId);
    if (action.indexOf("popKBS") === 0) return this.resolveKbs(this.functionArgument(action), 0);
    if (action.indexOf("popMBN") === 0) return this.resolveMbn();
    if (action.indexOf("window.open") === 0) { const direct = this.directUrl(action); return direct ? this.resolveDirectUrl(direct) : ""; }
    return "";
  }

  streamHeaders(streamUrl) {
    const headers = this.headers(streamUrl, this.baseUrl + "/", "application/vnd.apple.mpegurl,application/x-mpegURL,audio/*,video/*,*/*");
    if (streamUrl.indexOf("googlevideo.com") >= 0 || streamUrl.indexOf("youtube.com") >= 0) headers.Referer = "https://www.youtube.com/";
    return headers;
  }

  async resolveChannel(channel) {
    const streamUrl = this.text(await this.resolveAction(channel.action)).trim();
    if (!/^https?:\/\//i.test(streamUrl)) throw new Error("유효한 재생 주소가 없습니다.");
    const kind = this.kinds[channel.kind] || this.kinds.tv;
    return [{ url: streamUrl, originalUrl: streamUrl, quality: "라이브 " + kind.label, headers: this.streamHeaders(streamUrl), subtitles: [], audios: [] }];
  }

  async getVideoList(url) {
    const channel = JSON.parse(url), kind = this.kinds[channel.kind] || this.kinds.tv;
    try { return await this.resolveChannel(channel); } catch (firstError) {
      let refreshed;
      try { refreshed = await this.refreshChannels(kind); } catch (refreshError) {
        throw new Error("라이브 " + kind.label + " 재생에 실패했고 목록 갱신도 실패했습니다. 기존 목록 캐시는 보존했습니다. " + this.text(refreshError && (refreshError.message || refreshError)));
      }
      const current = refreshed.find((item) => item.title === channel.title) || refreshed.find((item) => item.action === channel.action);
      if (!current) throw new Error(channel.title + " 채널이 갱신된 목록에서 사라졌습니다.");
      try { return await this.resolveChannel(current); } catch (secondError) { throw new Error(channel.title + " 재생 주소를 새로 확인했지만 재생할 수 없습니다. " + this.text(secondError && (secondError.message || secondError))); }
    }
  }

  async getPageList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }
  getFilterList() { return []; }

  getSourcePreferences() {
    return [{ key: "dc_live_custom_card_json_url", editTextPreference: { title: "커스텀 목록 카드 (선택)", summary: "공개 JSON 주소 1개로 요일별 카드 7장을 설정합니다. 360×540 GIF를 권장하며 용량·프레임 제한은 없습니다.", value: "", dialogTitle: "커스텀 목록 카드 JSON 주소", dialogMessage: "Google Drive 공개 공유 링크 또는 직접 JSON 주소를 넣으세요. 개인 카드를 설정하면 공용 이벤트 카드는 표시되지 않습니다. 빈 값이면 공용 이벤트 또는 기본 미디어 요일 카드를 사용합니다." } }];
  }
}
