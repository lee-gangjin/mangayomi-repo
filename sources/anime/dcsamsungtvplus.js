const mangayomiSources = [
  {
    "name": "삼성 TV 플러스",
    "lang": "ko",
    "baseUrl": "https://dc-toki-aniyomi-media.pages.dev",
    "apiUrl": "https://dc-toki-aniyomi-media.pages.dev/playlist/samsung-tv-plus.m3u",
    "iconUrl": "https://dc-toki-mangayomi-media.pages.dev/icon/ko.media.png",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "version": "0.1.10",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/ko/dcsamsungtvplus.js",
    "notes": "인기/최신탭 1번 미디어 요일카드 · 커스텀 목록 카드 · 실시간 원본 직결 · 목록 캐시 최적화"
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
    this.assetBaseUrl = "https://dc-toki-mangayomi-media.pages.dev";
  }

  getHeaders(url) {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      "Accept": "*/*"
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
    const source = this.text(this.preference("samsung_tv_plus_custom_card_json_url", "")).trim();
    if (!source) return "";
    const preferences = new SharedPreferences(), cacheKey = "samsung_tv_plus_custom_card_cache", sourceKey = cacheKey + "_source", timeKey = cacheKey + "_time";
    let data = null, cached = "";
    if (this.preferenceString(sourceKey, "") === source) cached = this.preferenceString(cacheKey, "");
    const cachedAt = Number(this.preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000) { try { data = JSON.parse(cached); } catch (_) {} }
    if (!data) { try {
      const direct = this.driveDirect(source, false), response = await new Client({ persistentConnection: false, timeout: 12, connectTimeout: 6 }).get(direct + (direct.indexOf("?") >= 0 ? "&" : "?") + "card_json=" + Date.now(), { ...this.getHeaders(direct), "Cache-Control": "no-cache", "Accept": "application/json" });
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error("HTTP" + response.statusCode);
      data = JSON.parse(response.body); preferences.setString(cacheKey, JSON.stringify(data)); preferences.setString(sourceKey, source); preferences.setString(timeKey, String(Date.now()));
    } catch (_) { if (cached) { try { data = JSON.parse(cached); } catch (_) {} } } }
    if (!data || typeof data !== "object") return "";
    const cards = data.cards && typeof data.cards === "object" ? data.cards : {};
    let image = this.text(cards[slug] || data.default || data.card).trim();
    if (!image) return "";
    image = this.driveDirect(image, true);
    if (data.revision !== undefined && this.text(data.revision).trim()) image += (image.indexOf("?") >= 0 ? "&" : "?") + "revision=" + encodeURIComponent(this.text(data.revision));
    return image;
  }

  async loadChannels() {
    const cacheKey = "samsung_tv_plus_playlist_cache", timeKey = cacheKey + "_time", cached = this.preferenceString(cacheKey, ""), cachedAt = Number(this.preferenceString(timeKey, "0"));
    let playlist = cached && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000 ? cached : "";
    if (!playlist) { try {
      const response = await new Client().get(this.source.apiUrl, this.getHeaders(this.source.apiUrl));
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`Samsung TV Plus \ubaa9\ub85d HTTP ${response.statusCode}`);
      playlist = this.repairUtf8(response.body); const preferences = new SharedPreferences(); preferences.setString(cacheKey, playlist); preferences.setString(timeKey, String(Date.now()));
    } catch (error) { if (cached) playlist = cached; else throw error; } }
    const lines = playlist.split(/\r?\n/);
    const channels = [];
    let metadata = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.toUpperCase().startsWith("#EXTINF")) {
        metadata = line;
      } else if (metadata && line && !line.startsWith("#")) {
        const channel = this.parseChannel(metadata, line);
        if (channel) channels.push(channel);
        metadata = null;
      }
    }

    const seen = new Set();
    return channels
      .filter((channel) => {
        if (seen.has(channel.streamUrl)) return false;
        seen.add(channel.streamUrl);
        return true;
      })
      .sort((a, b) => {
        const aNumber = parseInt(a.channelNumber) || 999999;
        const bNumber = parseInt(b.channelNumber) || 999999;
        return aNumber - bNumber || a.title.localeCompare(b.title, "ko");
      });
  }

  repairUtf8(text) {
    if (!text || /[\uac00-\ud7a3]/.test(text)) return text;

    let encoded = "";
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code > 255) return text;
      encoded += `%${code.toString(16).padStart(2, "0")}`;
    }

    try {
      return decodeURIComponent(encoded);
    } catch (error) {
      return text;
    }
  }

  parseChannel(metadata, streamUrl) {
    if (!/^https?:\/\//i.test(streamUrl)) return null;
    const separator = this.metadataSeparatorIndex(metadata);
    const title = (separator >= 0 ? metadata.substring(separator + 1) : this.attribute(metadata, "tvg-name")).trim();
    if (!title) return null;

    return {
      title,
      streamUrl,
      logoUrl: this.attribute(metadata, "tvg-logo"),
      group: this.attribute(metadata, "group-title"),
      channelNumber: this.attribute(metadata, "tvg-chno")
    };
  }

  metadataSeparatorIndex(metadata) {
    let quoted = false;
    for (let index = 0; index < metadata.length; index++) {
      const char = metadata[index];
      if (char === '"') quoted = !quoted;
      if (char === "," && !quoted) return index;
    }
    return -1;
  }

  attribute(metadata, name) {
    const expression = new RegExp(`${name}="([^"]*)"`, "i");
    const match = expression.exec(metadata);
    return match ? match[1].trim() : "";
  }

  async weekdayItem(slug, tab) {
    const weekday = slug || this.koreaWeekday();
    const customSource = this.text(this.preference("samsung_tv_plus_custom_card_json_url", "")).trim();
    const customImage = await this.customCardUrl(weekday);
    const event = customSource ? null : await dcOfficialEventCard();
    const official = customImage || event ? null : await dcOfficialListCardSystem("samsung_tv_plus", tab, "오늘의 미디어");
    return {
      name: customImage ? this.weekdayName(weekday) : event ? event.name : official.name,
      imageUrl: customImage || (event && event.imageUrl) || official.imageUrl,
      link: JSON.stringify({ weekdayCard: weekday })
    };
  }

  channelItem(channel) {
    return {
      name: channel.title,
      imageUrl: channel.logoUrl || this.source.iconUrl,
      link: JSON.stringify(channel)
    };
  }

  async getPopular(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const channels = await this.loadChannels();
    return {
      list: [await this.weekdayItem(undefined, "popular"), ...channels.map((channel) => this.channelItem(channel))],
      hasNextPage: false
    };
  }

  async getLatestUpdates(page) {
    if (page > 1) return { list: [], hasNextPage: false };
    const channels = await this.loadChannels();
    return {
      list: [await this.weekdayItem(undefined, "latest"), ...channels.map((channel) => this.channelItem(channel))],
      hasNextPage: false
    };
  }

  async search(query, page, filters) {
    if (page > 1) return { list: [], hasNextPage: false };
    const normalized = (query || "").trim().toLocaleLowerCase();
    const channels = await this.loadChannels();
    const filtered = channels.filter((channel) => {
      if (!normalized) return true;
      return channel.title.toLocaleLowerCase().includes(normalized) ||
        channel.group.toLocaleLowerCase().includes(normalized) ||
        channel.channelNumber.includes(normalized);
    });
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
        author: "DC Media",
        status: 0,
        genre: ["요일 안내"],
        episodes: []
      };
    }

    const channelNumber = item.channelNumber ? `\n\ucc44\ub110 \ubc88\ud638: ${item.channelNumber}` : "";
    return {
      name: item.title,
      link: url,
      imageUrl: item.logoUrl || this.source.iconUrl,
      description: `${item.title} \uc2e4\uc2dc\uac04 \ubc29\uc1a1\uc785\ub2c8\ub2e4.${channelNumber}\n\ubc29\uc1a1\uc0ac \ub610\ub294 \uc6d0\ubcf8 \ubaa9\ub85d \uc0ac\uc815\uc5d0 \ub530\ub77c \uc77c\uc2dc\uc801\uc73c\ub85c \uc7ac\uc0dd\ub418\uc9c0 \uc54a\uc744 \uc218 \uc788\uc2b5\ub2c8\ub2e4.`,
      author: "Samsung TV Plus",
      status: 0,
      genre: ["\uc2e4\uc2dc\uac04 TV", item.group].filter((value) => value),
      episodes: [
        {
          name: `\ub77c\uc774\ube0c \u00b7 ${item.title}`,
          url: JSON.stringify(item),
          scanlator: "Samsung TV Plus"
        }
      ]
    };
  }

  async getVideoList(url) {
    const channel = JSON.parse(url);
    const headers = this.getHeaders(channel.streamUrl);
    const autoVideo = {
      url: channel.streamUrl,
      originalUrl: channel.streamUrl,
      quality: "\uc790\ub3d9 \u00b7 Samsung TV Plus",
      headers
    };

    try {
      const response = await new Client().get(channel.streamUrl, headers);
      if (response.statusCode < 200 || response.statusCode >= 300) return [autoVideo];
      const manifestUrl = response.request && response.request.url
        ? response.request.url
        : channel.streamUrl;
      const variants = this.parseMasterPlaylist(response.body, manifestUrl, headers);
      return variants.length > 0 ? [autoVideo, ...variants] : [autoVideo];
    } catch (error) {
      return [autoVideo];
    }
  }

  parseMasterPlaylist(manifest, manifestUrl, headers) {
    const lines = manifest.split(/\r?\n/).map((line) => line.trim());
    const variants = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.toUpperCase().startsWith("#EXT-X-STREAM-INF:")) continue;

      let streamPath = "";
      for (let next = index + 1; next < lines.length; next++) {
        if (!lines[next]) continue;
        if (!lines[next].startsWith("#")) streamPath = lines[next];
        break;
      }
      if (!streamPath) continue;

      const resolution = /RESOLUTION=\d+x(\d+)/i.exec(line);
      const bandwidth = /(?:AVERAGE-)?BANDWIDTH=(\d+)/i.exec(line);
      const height = resolution ? parseInt(resolution[1]) : 0;
      const bitsPerSecond = bandwidth ? parseInt(bandwidth[1]) : 0;
      let quality = height > 0 ? `${height}p` : "\uac1c\ubcc4 \ud654\uc9c8";
      if (bitsPerSecond > 0) quality += ` \u00b7 ${(bitsPerSecond / 1000000).toFixed(1)} Mbps`;

      const videoUrl = this.resolveUrl(manifestUrl, streamPath);
      variants.push({
        url: videoUrl,
        originalUrl: videoUrl,
        quality,
        headers,
        _height: height,
        _bandwidth: bitsPerSecond
      });
    }

    const seen = new Set();
    return variants
      .filter((variant) => {
        if (seen.has(variant.url)) return false;
        seen.add(variant.url);
        return true;
      })
      .sort((a, b) => b._height - a._height || b._bandwidth - a._bandwidth)
      .map((variant) => ({
        url: variant.url,
        originalUrl: variant.originalUrl,
        quality: variant.quality,
        headers: variant.headers
      }));
  }

  resolveUrl(baseUrl, value) {
    if (/^https?:\/\//i.test(value)) return value;
    const origin = /^https?:\/\/[^/]+/i.exec(baseUrl);
    if (value.startsWith("/") && origin) return origin[0] + value;
    return baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1) + value;
  }

  async getPageList(url) {
    return [];
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      key: "samsung_tv_plus_custom_card_json_url",
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
