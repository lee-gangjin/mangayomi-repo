const mangayomiSources = [
  {
    "name": "IPTV",
    "lang": "ko",
    "baseUrl": "https://iptv-org.github.io",
    "apiUrl": "",
    "iconUrl": "https://dc-toki-mangayomi-media.pages.dev/icon/ko.media.png",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "version": "0.1.6",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/ko/dciptv.js",
    "notes": "기본 설정 · 인기탭: APSAT-TV · 최신탭: IPTV-ORG · 커스텀 목록 카드 · 실시간 원본 직결 · 목록 캐시 최적화"
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
    this.assetBaseUrl = "https://dc-toki-mangayomi-media.pages.dev";
    this.providers = {
      apsattv: {
        key: "apsattv",
        name: "APSAT-TV",
        playlistUrl: "https://www.apsattv.com/krlg.m3u"
      },
      iptvorg: {
        key: "iptvorg",
        name: "IPTV-ORG",
        playlistUrl: "https://iptv-org.github.io/iptv/languages/kor.m3u"
      }
    };
  }

  get supportsLatest() {
    return true;
  }

  text(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  preference(key, fallback) {
    try {
      const value = new SharedPreferences().get(key);
      return value === null || value === undefined ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  preferenceString(key, fallback) {
    try {
      const value = new SharedPreferences().getString(key, fallback);
      return value === null || value === undefined ? fallback : this.text(value);
    } catch (_) {
      return fallback;
    }
  }

  koreaWeekday() {
    return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay()];
  }

  weekdayName(slug) {
    return ({ monday: "월요일", tuesday: "화요일", wednesday: "수요일", thursday: "목요일", friday: "금요일", saturday: "토요일", sunday: "일요일" })[slug] || "오늘";
  }

  driveDirect(url, image) {
    const value = this.text(url).trim();
    const match = value.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    return match ? "https://drive.google.com/uc?export=" + (image ? "view" : "download") + "&id=" + match[1] : value;
  }

  async customCardUrl(slug) {
    const source = this.text(this.preference("dc_iptv_custom_card_json_url", "")).trim();
    if (!source) return "";
    const preferences = new SharedPreferences(), cacheKey = "dc_iptv_custom_card_cache", sourceKey = cacheKey + "_source", timeKey = cacheKey + "_time";
    let data = null, cached = "";
    if (this.preferenceString(sourceKey, "") === source) cached = this.preferenceString(cacheKey, "");
    const cachedAt = Number(this.preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000) { try { data = JSON.parse(cached); } catch (_) {} }
    if (!data) { try {
      const direct = this.driveDirect(source, false), response = await new Client({ persistentConnection: false, noProxy: true, timeout: 12, connectTimeout: 6 }).get(direct + (direct.indexOf("?") >= 0 ? "&" : "?") + "card_json=" + Date.now(), { ...this.getHeaders(direct), "Cache-Control": "no-cache", "Accept": "application/json" });
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error("HTTP " + response.statusCode);
      data = JSON.parse(response.body); preferences.setString(cacheKey, JSON.stringify(data)); preferences.setString(sourceKey, source); preferences.setString(timeKey, String(Date.now()));
    } catch (_) { if (cached) { try { data = JSON.parse(cached); } catch (_) {} } } }
    if (!data || typeof data !== "object") return "";
    const cards = data.cards && typeof data.cards === "object" ? data.cards : {};
    let image = this.text(cards[slug] || data.default || data.card).trim();
    if (!image) return "";
    image = this.driveDirect(image, true);
    if (data.revision !== undefined && this.text(data.revision).trim()) {
      image += (image.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(this.text(data.revision));
    }
    return image;
  }

  async weekdayItem(slug, tab) {
    const weekday = slug || this.koreaWeekday();
    const customSource = this.text(this.preference("dc_iptv_custom_card_json_url", "")).trim();
    const customImage = await this.customCardUrl(weekday);
    const event = customSource ? null : await dcOfficialEventCard();
    const official = customImage || event ? null : await dcOfficialListCardSystem("dc_iptv", tab, "오늘의 미디어");
    return {
      name: customImage ? this.weekdayName(weekday) : event ? event.name : official.name,
      imageUrl: customImage || (event && event.imageUrl) || official.imageUrl,
      link: JSON.stringify({ weekdayCard: weekday })
    };
  }

  getHeaders(url) {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      "Accept": "application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*"
    };
  }

  repairUtf8(value) {
    const text = this.text(value);
    if (!text || /[\uac00-\ud7a3]/.test(text)) return text;
    let encoded = "";
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code > 255) return text;
      encoded += "%" + code.toString(16).padStart(2, "0");
    }
    try { return decodeURIComponent(encoded); } catch (_) { return text; }
  }

  async loadPlaylist(provider) {
    const cacheKey = "dc_iptv_playlist_cache_" + provider.key, timeKey = cacheKey + "_time", cached = this.preferenceString(cacheKey, ""), cachedAt = Number(this.preferenceString(timeKey, "0"));
    if (cached && /^\s*#EXTM3U/i.test(cached) && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000) return cached;
    try {
      const response = await new Client({ persistentConnection: false, noProxy: true, timeout: 20, connectTimeout: 8 })
        .get(provider.playlistUrl, this.getHeaders(provider.playlistUrl));
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(provider.name + " HTTP " + response.statusCode);
      const body = this.repairUtf8(response.body);
      if (!/^\s*#EXTM3U/i.test(body)) throw new Error(provider.name + " 목록 형식 오류");
      try { const preferences = new SharedPreferences(); preferences.setString(cacheKey, body); preferences.setString(timeKey, String(Date.now())); } catch (_) {}
      return body;
    } catch (error) {
      if (cached && /^\s*#EXTM3U/i.test(cached)) return cached;
      throw error;
    }
  }

  metadataSeparatorIndex(metadata) {
    let quoted = false;
    for (let index = 0; index < metadata.length; index++) {
      const char = metadata[index];
      if (char === '"' && (index === 0 || metadata[index - 1] !== "\\")) quoted = !quoted;
      if (char === "," && !quoted) return index;
    }
    return -1;
  }

  attribute(metadata, name) {
    const expression = new RegExp("([\\w-]+)=\"([^\"]*)\"", "g");
    let match;
    while ((match = expression.exec(metadata)) !== null) {
      if (match[1].toLowerCase() === name.toLowerCase()) return match[2].trim();
    }
    return "";
  }

  splitStreamUrl(value) {
    const parts = this.text(value).trim().split("|");
    const streamUrl = parts.shift() || "";
    const options = {};
    const query = parts.join("&");
    for (const part of query.split("&")) {
      const separator = part.indexOf("=");
      if (separator <= 0) continue;
      const key = part.substring(0, separator).trim().toLowerCase();
      const raw = part.substring(separator + 1).trim();
      try { options[key] = decodeURIComponent(raw); } catch (_) { options[key] = raw; }
    }
    return { streamUrl, options };
  }

  cleanupTitle(rawTitle) {
    const prefix = /^\s*\d+\s+(.+)$/.exec(rawTitle);
    const withoutPrefix = prefix ? prefix[1] : rawTitle;
    return withoutPrefix
      .replace(/\s*(?:\(\d+p\)|\[[^\]]+\])/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  streamType(url) {
    const clean = this.text(url).split("?")[0].toLowerCase();
    if (clean.endsWith(".mpd")) return "DASH";
    if (clean.endsWith(".m3u8") || clean.endsWith(".m3u")) return "HLS";
    return "LIVE";
  }

  parseChannel(provider, metadata, rawStreamUrl, referrer, userAgent) {
    const split = this.splitStreamUrl(rawStreamUrl);
    if (!/^https?:\/\//i.test(split.streamUrl)) return null;
    const separator = this.metadataSeparatorIndex(metadata);
    const rawTitle = (separator >= 0 ? metadata.substring(separator + 1) : this.attribute(metadata, "tvg-name")).trim();
    const title = this.cleanupTitle(rawTitle);
    if (!title) return null;
    return {
      providerKey: provider.key,
      providerName: provider.name,
      title,
      rawTitle,
      streamUrl: split.streamUrl,
      logoUrl: this.attribute(metadata, "tvg-logo"),
      group: this.attribute(metadata, "group-title") || "기타",
      notes: rawTitle.replace(title, "").trim(),
      referrer: referrer || split.options["referer"] || split.options["referrer"] || "",
      userAgent: userAgent || split.options["user-agent"] || split.options["useragent"] || "",
      streamType: this.streamType(split.streamUrl)
    };
  }

  async loadChannels(provider) {
    const playlist = await this.loadPlaylist(provider);
    const channels = [];
    let metadata = "";
    let referrer = "";
    let userAgent = "";
    for (const rawLine of playlist.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (/^#EXTINF/i.test(line)) {
        metadata = line;
        referrer = this.attribute(line, "http-referrer");
        userAgent = this.attribute(line, "http-user-agent");
      } else if (/^#EXTVLCOPT:http-referrer=/i.test(line)) {
        referrer = line.substring(line.indexOf("=") + 1).trim();
      } else if (/^#EXTVLCOPT:http-user-agent=/i.test(line)) {
        userAgent = line.substring(line.indexOf("=") + 1).trim();
      } else if (line && !line.startsWith("#") && metadata) {
        const channel = this.parseChannel(provider, metadata, line, referrer, userAgent);
        if (channel) channels.push(channel);
        metadata = "";
        referrer = "";
        userAgent = "";
      }
    }
    const seen = new Set();
    return channels.filter((channel) => {
      if (seen.has(channel.streamUrl)) return false;
      seen.add(channel.streamUrl);
      return true;
    });
  }

  normalizedSearch(value) {
    let text = this.text(value).toLocaleLowerCase();
    try { text = text.normalize("NFKC"); } catch (_) {}
    return text.replace(/[\s\p{P}·ㆍ・]+/gu, "");
  }

  logoCardUrl(channel) {
    if (!channel.logoUrl) return this.titleCardUrl(channel.title);
    return "https://images.weserv.nl/?url=" + encodeURIComponent(channel.logoUrl) + "&w=360&h=540&fit=contain&bg=ffffff&output=webp";
  }

  titleCardUrl(title) {
    return "https://placehold.co/360x540/FFFFFF/111111.png?text=" + encodeURIComponent(title);
  }

  channelItem(channel) {
    return {
      name: channel.title,
      imageUrl: this.logoCardUrl(channel),
      link: JSON.stringify(channel)
    };
  }

  async listing(provider, page, tab) {
    if (Number(page) > 1) return { list: [], hasNextPage: false };
    const channels = await this.loadChannels(provider);
    return {
      list: [await this.weekdayItem(undefined, tab)].concat(channels.map((channel) => this.channelItem(channel))),
      hasNextPage: false
    };
  }

  async getPopular(page) {
    return this.listing(this.providers.apsattv, page, "popular");
  }

  async getLatestUpdates(page) {
    return this.listing(this.providers.iptvorg, page, "latest");
  }

  async search(query, page) {
    if (Number(page) > 1) return { list: [], hasNextPage: false };
    const wanted = this.normalizedSearch(query);
    const providers = [this.providers.apsattv, this.providers.iptvorg];
    const channels = [];
    const errors = [];
    for (const provider of providers) {
      try {
        channels.push(...await this.loadChannels(provider));
      } catch (error) {
        errors.push(provider.name + ": " + this.text(error && (error.message || error)));
      }
    }
    if (!channels.length && errors.length) throw new Error("IPTV 방송 목록을 가져오지 못했습니다. " + errors.join(" / "));
    const filtered = wanted ? channels.filter((channel) => {
      return this.normalizedSearch(channel.title).includes(wanted) ||
        this.normalizedSearch(channel.rawTitle).includes(wanted) ||
        this.normalizedSearch(channel.group).includes(wanted);
    }) : channels;
    return { list: filtered.map((channel) => this.channelItem(channel)), hasNextPage: false };
  }

  async getDetail(url) {
    const item = JSON.parse(url);
    if (item.weekdayCard) {
      const card = await this.weekdayItem(item.weekdayCard);
      return {
        name: card.name,
        link: url,
        imageUrl: card.imageUrl,
        description: "오늘의 시간 흐름을 담은 움직이는 미디어 요일 카드입니다. 뒤로 돌아가 채널을 선택해 주세요.",
        author: "IPTV",
        status: 0,
        genre: ["요일 안내"],
        episodes: [],
        chapters: []
      };
    }
    return {
      name: item.title,
      link: url,
      imageUrl: this.logoCardUrl(item),
      description: item.title + " 실시간 방송입니다.\n방송사 또는 원본 목록 사정에 따라 일시적으로 재생되지 않을 수 있습니다.",
      author: item.providerName,
      status: 0,
      genre: ["실시간 TV", item.group].filter((value) => value),
      episodes: [{
        name: "라이브 · " + item.title,
        url: JSON.stringify(item),
        scanlator: item.providerName
      }]
    };
  }

  async getVideoList(url) {
    const channel = JSON.parse(url);
    const headers = this.getHeaders(channel.streamUrl);
    if (channel.referrer) headers.Referer = channel.referrer;
    if (channel.userAgent) headers["User-Agent"] = channel.userAgent;
    return [{
      url: channel.streamUrl,
      originalUrl: channel.streamUrl,
      quality: channel.providerName + " · " + channel.streamType,
      headers
    }];
  }

  async getPageList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }
  getFilterList() { return []; }

  getSourcePreferences() {
    return [{
      key: "dc_iptv_custom_card_json_url",
      editTextPreference: {
        title: "커스텀 목록 카드 (선택)",
        summary: "공개 JSON 주소 1개로 요일별 카드 7장을 설정합니다. 360×540 GIF를 권장하며 용량·프레임 제한은 없습니다.",
        value: "",
        dialogTitle: "커스텀 목록 카드 JSON 주소",
        dialogMessage: "Google Drive 공개 공유 링크 또는 직접 JSON 주소를 넣으세요. 개인 카드를 설정하면 공용 이벤트 카드는 표시되지 않습니다. 빈 값이면 공용 이벤트 또는 기본 미디어 요일 카드를 사용합니다."
      }
    }];
  }
}
