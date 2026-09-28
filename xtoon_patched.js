const mangayomiSources = [{
  name: "XTOON",
  lang: "ko",
  baseUrl: "https://newxtoon1.com",
  apiUrl: "",
  iconUrl: "http://127.0.0.1:18774/icon/ko.xtoon.png",
  typeSource: "single",
  itemType: 0,
  isNsfw: false,
  hasCloudflare: true,
  version: "0.1.11",
  dateFormat: "yyyy.MM.dd",
  dateFormatLocale: "ko_KR",
  pkgPath: "manga/src/ko/xtoon.js"
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
    this.fallbackBaseUrl = "https://newxtoon1.com";
    this.userAgent = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
    this.imageAccept = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
    this.weekdayCardBaseUrl = "https://dc-toki-mangayomi-manga.pages.dev/card/weekday-";
    this.popularRulePreference = "xtoon_popular_rule_v1";
    this.latestRulePreference = "xtoon_latest_rule_v1";
    this.categories = ["", "일반만화", "BL·GL", "성인"];
    this.weekdays = ["", "월", "화", "수", "목", "금", "토", "일"];
    this.genres = ["", "1", "4", "2", "2739", "2753", "3", "2902", "2774", "2777", "2904", "2772", "2903", "2905", "3266", "2771", "6", "2874", "2754", "2743", "2757"];
    this.statuses = ["", "연재중", "완결"];
    this.platforms = ["", "kakao-page", "naver", "lezhin", "ridi", "toptoon", "bomtoon", "mrblue", "toomics", "peanutoon", "comico"];
    this.sorts = ["", "popular"];
    this.requestSequence = 0;
    this.preferredTransport = "";
    this.preferredTransportUntil = 0;
    this.directRequestBudgetMs = 35000;
  }

  _text(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  _trimSlash(value) {
    return this._text(value).trim().replace(/\/+$/, "");
  }

  _preference(key, fallback) {
    try {
      const value = new SharedPreferences().get(key);
      return value === null || value === undefined ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  _preferenceString(key, fallback) {
    try {
      const value = new SharedPreferences().getString(key, fallback);
      return value === null || value === undefined ? fallback : this._text(value);
    } catch (_) {
      return fallback;
    }
  }

  _driveDirect(url, image) {
    const source = this._text(url).trim();
    const match = source.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    return match ? "https://drive.google.com/uc?export=" + (image ? "view" : "download") + "&id=" + match[1] : source;
  }

  async _customCardUrl(slug) {
    const source = this._text(this._preference("xtoon_custom_card_json_url", "")).trim();
    if (!source) return "";
    const preferences = new SharedPreferences();
    const cacheKey = "xtoon_custom_card_cache", sourceKey = cacheKey + "_source", timeKey = cacheKey + "_time";
    let data = null, cached = "";
    if (this._preferenceString(sourceKey, "") === source) cached = this._preferenceString(cacheKey, "");
    const cachedAt = Number(this._preferenceString(timeKey, "0"));
    if (cached && cachedAt > 0 && Date.now() - cachedAt < 5 * 60 * 1000) { try { data = JSON.parse(cached); } catch (_) {} }
    if (!data) {
      try {
        const direct = this._driveDirect(source, false), join = direct.indexOf("?") >= 0 ? "&" : "?", requestUrl = direct + join + "card_json=" + Date.now();
        let body = "";
        for (const options of [{ persistentConnection: false, noProxy: true, timeout: 15, connectTimeout: 8 }, { useDartHttpClient: true, persistentConnection: false }]) {
          try { const response = await new Client(options).get(requestUrl, { "Accept": "application/json", "Cache-Control": "no-cache" }); if (response.statusCode >= 200 && response.statusCode < 300) { body = response.body; break; } } catch (_) {}
        }
        if (!body) throw new Error("커스텀 목록 카드 JSON을 불러오지 못했습니다.");
        data = JSON.parse(body);
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

  _defaultPopularRule() {
    return { category: "일반만화", weekday: this._koreaWeekday(), genre: "", status: "", platform: "", sort: "popular" };
  }

  _defaultLatestRule() {
    return { category: "일반만화", weekday: this._koreaWeekday(), genre: "", status: "", platform: "", sort: "" };
  }

  _allowedRuleValue(value, allowed) {
    const text = this._text(value);
    return allowed.indexOf(text) >= 0 ? text : "";
  }

  _normalizeRule(rule, fallback) {
    const source = rule || fallback || this._defaultLatestRule();
    return {
      category: this._allowedRuleValue(source.category, this.categories),
      weekday: this._allowedRuleValue(source.weekday, this.weekdays),
      genre: this._allowedRuleValue(source.genre, this.genres),
      status: this._allowedRuleValue(source.status, this.statuses),
      platform: this._allowedRuleValue(source.platform, this.platforms),
      sort: this._allowedRuleValue(source.sort, this.sorts)
    };
  }

  _encodeRule(rule) {
    const normalized = this._normalizeRule(rule, this._defaultLatestRule());
    return [normalized.category, normalized.weekday, normalized.genre, normalized.status, normalized.platform, normalized.sort].join("|");
  }

  _decodeRule(value, fallback) {
    const parts = this._text(value).split("|");
    if (parts.length !== 6) return this._normalizeRule(fallback, this._defaultLatestRule());
    return this._normalizeRule({
      category: parts[0], weekday: parts[1], genre: parts[2], status: parts[3], platform: parts[4], sort: parts[5]
    }, fallback);
  }

  _tabRule(key, fallback) {
    const encoded = this._preferenceString(key, "");
    return {
      rule: encoded ? this._decodeRule(encoded, fallback) : this._normalizeRule(fallback, this._defaultLatestRule()),
      isDefault: !encoded
    };
  }

  _ruleSummary(rule) {
    const normalized = this._normalizeRule(rule, this._defaultLatestRule());
    const names = {
      category: { "": "전체", "일반만화": "일반만화", "BL·GL": "BL·GL", "성인": "성인만화" },
      weekday: { "": "전체 요일", "월": "월요일", "화": "화요일", "수": "수요일", "목": "목요일", "금": "금요일", "토": "토요일", "일": "일요일" },
      sort: { "": "최신순", "popular": "인기순" }
    };
    return [names.category[normalized.category], names.weekday[normalized.weekday], names.sort[normalized.sort]].join(" + ");
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

  _isAllowedBaseUrl(value) {
    return /^https:\/\/(?:www\.)?newxtoon\d+\.com\/?$/i.test(this._text(value).trim());
  }

  async _resolveBaseUrl() {
    const manual = this._text(this._preference("xtoon_domain_url", "")).trim();
    if (this._isAllowedBaseUrl(manual)) return this._trimSlash(manual);
    try {
      const response = await new Client({ persistentConnection: false, noProxy: true, timeout: 8, connectTimeout: 5 }).get(this.signalUrl, {
        "User-Agent": this.userAgent,
        "Accept": "application/json",
        "Cache-Control": "no-cache"
      });
      if (response.statusCode >= 200 && response.statusCode < 300) {
        const data = JSON.parse(response.body);
        const candidate = data && data.domains && data.domains.newxtoon
          ? data.domains.newxtoon.baseUrl
          : "";
        if (this._isAllowedBaseUrl(candidate)) return this._trimSlash(candidate);
      }
    } catch (error) {
      this._logDiagnostic("signal", "RHTTP", this.signalUrl, this._failureCode(null, error), error);
    }
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
    if (/^https?:\/\//i.test(raw)) {
      raw = raw.replace(/^https?:\/\/[^/]+/i, "");
    }
    if (!raw.startsWith("/")) raw = "/" + raw;
    return raw;
  }

  _absoluteUrl(base, value) {
    const raw = this._text(value).trim();
    if (!raw) return "";
    if (raw.startsWith("//")) return "https:" + raw;
    if (/^https?:\/\//i.test(raw)) {
      if (/^https?:\/\/(?:www\.)?newxtoon\d+\.com/i.test(raw)) {
        return base + this._relativePath(raw);
      }
      return raw;
    }
    return base + this._relativePath(raw);
  }

  _imageUrl(base, element, coverMode) {
    if (!element) return "";
    const names = ["data-src", "data-original", "src"];
    let result = "";
    for (const name of names) {
      const candidate = this._text(element.attr(name)).trim();
      if (candidate) {
        result = this._absoluteUrl(base, candidate);
        break;
      }
    }
    if (coverMode && /^https?:\/\/[^/]*aws-cdn9\.site\//i.test(result)) {
      return "https://wsrv.nl/?url=" + encodeURIComponent(result) + "&output=webp";
    }
    return result;
  }

  _withQuery(base, path, pairs) {
    const query = [];
    for (const pair of pairs) {
      if (!pair || pair.length < 2 || this._text(pair[1]) === "") continue;
      query.push(encodeURIComponent(pair[0]) + "=" + encodeURIComponent(this._text(pair[1])));
    }
    return base + path + (query.length ? "?" + query.join("&") : "");
  }

  _failureCode(response, cause) {
    const status = response && response.statusCode ? Number(response.statusCode) : 0;
    if (status) return "HTTP" + status;
    const text = this._text(cause && (cause.message || cause));
    if (/10054|ECONNRESET|ConnectionReset|connection reset|\uac15\uc81c\ub85c \ub04a/i.test(text)) return "RESET";
    if (/timed?\s*out|timeout/i.test(text)) return "TIMEOUT";
    if (/certificate|handshake|TLS|SSL/i.test(text)) return "TLS";
    if (/cloudflare|challenge|bypass/i.test(text)) return "CLOUDFLARE";
    return "NETWORK";
  }

  _logDiagnostic(stage, transport, url, code, cause, attempt) {
    const raw = this._text(cause && (cause.message || cause)).replace(/\s+/g, " ").slice(0, 240);
    try {
      console.warn("[XTOON-DIAG] stage=" + stage + " transport=" + transport + (attempt ? " attempt=" + attempt : "") + " code=" + code + " url=" + url + (raw ? " cause=" + raw : ""));
    } catch (_) {}
  }

  _logSuccess(stage, transport, url, attempt) {
    try {
      console.warn("[XTOON-DIAG] stage=" + stage + " transport=" + transport + " attempt=" + attempt + " code=OK url=" + url);
    } catch (_) {}
  }

  _isTransientCode(code) {
    return code === "TLS" || code === "RESET" || code === "TIMEOUT";
  }

  _transportPlan() {
    const transports = [
      { name: "RHTTP", maxAttempts: 2, budgetMs: 16000, options: { persistentConnection: false, timeout: 15, connectTimeout: 10 } },
      { name: "DART", maxAttempts: 1, budgetMs: 12000, options: { useDartHttpClient: true, persistentConnection: false } }
    ];
    if (this.preferredTransportUntil > Date.now() && this.preferredTransport === "RHTTP") {
      transports.sort((left, right) => {
        if (left.name === this.preferredTransport) return -1;
        if (right.name === this.preferredTransport) return 1;
        return 0;
      });
    }
    return transports;
  }

  _rememberTransport(name) {
    if (name !== "RHTTP") return;
    this.preferredTransport = name;
    this.preferredTransportUntil = Date.now() + 5 * 60 * 1000;
  }

  _retryDelay(attempt) {
    return Math.min(800, 180 * Math.pow(2, Math.max(0, attempt - 1))) + Math.floor(Math.random() * 121);
  }

  async _boundedGet(transport, url, headers, budgetMs) {
    const request = new Client(transport.options).get(url, headers);
    if (typeof setTimeout !== "function" || budgetMs <= 0) return await request;
    return await new Promise(function(resolve, reject) {
      let settled = false;
      const timer = setTimeout(function() {
        if (settled) return;
        settled = true;
        reject(new Error("XTOON request timeout"));
      }, budgetMs);
      Promise.resolve(request).then(function(response) {
        if (settled) return;
        settled = true;
        if (typeof clearTimeout === "function") clearTimeout(timer);
        resolve(response);
      }, function(error) {
        if (settled) return;
        settled = true;
        if (typeof clearTimeout === "function") clearTimeout(timer);
        reject(error);
      });
    });
  }

  _directError(url, diagnostics, stage) {
    const codes = diagnostics.map(function(item) {
      return item.transport + (item.attempt ? "#" + item.attempt : "") + "=" + item.code;
    }).join(",");
    const location = " \ub2e8\uacc4: " + (stage || "request") + " | URL: " + url;
    const authentication = diagnostics.some(function(item) {
      return item.code === "HTTP401" || item.code === "HTTP403" || item.code === "HTTP429" || item.code === "CLOUDFLARE";
    });
    if (authentication) {
      return new Error("XTOON \uc9c1\uc811 \uc778\uc99d\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4. \uc544\ub798 WebView\uc5d0\uc11c XTOON\uc744 \ud55c \ubc88 \uc5f4\uace0 \ub2eb\uc740 \ub4a4 \uc0c8\ub85c\uace0\uce68\ud558\uc138\uc694. \uc9c4\ub2e8: " + codes + location);
    }
    const hint = " WebView \uc778\uc99d \ud6c4\uc5d0\ub3c4 \uac19\uc73c\uba74 1.1.1.1/Cloudflare WARP\uc758 Traffic and DNS \ubaa8\ub4dc\ub97c \uba3c\uc800 \uc2dc\ub3c4\ud558\uc138\uc694. Tailscale\uc744 \uac19\uc774 \uc4f0\uba74 tailnet \uc804\uccb4\uc5d0 \uc601\ud5a5\uc744 \uc904 \uc218 \uc788\ub294 Override DNS servers\ub97c \ud655\uc778\ud558\uc138\uc694.";
    return new Error("XTOON \uc9c1\uc811 \uc5f0\uacb0\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4. DNS\ub294 \uc815\uc0c1\uc774\uc5b4\ub3c4 HTTP/TLS \uc804\uc1a1\uc774 \ucc28\ub2e8\ub420 \uc218 \uc788\uc2b5\ub2c8\ub2e4." + hint + " \uc9c4\ub2e8: " + codes + location);
  }

  async _getText(url, extraHeaders, stage) {
    if (this._rabbitEnabled()) {
      try {
        const endpoint = this._rabbitEndpoint();
        const proxyUrl = endpoint + "/api/proxy?url=" + encodeURIComponent(url);
        const reqHeaders = {
          "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "Referer": (this._origin(url) || this.fallbackBaseUrl) + "/"
        };
        if (extraHeaders) Object.assign(reqHeaders, extraHeaders);
        const proxyRes = await new Client({ persistentConnection: false, timeout: 20 }).get(proxyUrl, reqHeaders);
        if (proxyRes && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300 && proxyRes.body) {
          return proxyRes.body;
        }
      } catch (_) {}
    }
    const headers = {
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Referer": (this._origin(url) || this.fallbackBaseUrl) + "/"
    };
    if (extraHeaders) Object.assign(headers, extraHeaders);
    const diagnostics = [];
    let stopDirect = false;
    const startedAt = Date.now();
    for (const transport of this._transportPlan()) {
      for (let attempt = 1; attempt <= transport.maxAttempts; attempt++) {
        const remainingMs = this.directRequestBudgetMs - (Date.now() - startedAt);
        if (remainingMs <= 0) {
          diagnostics.push({ transport: transport.name, attempt: attempt, code: "TIMEOUT" });
          this._logDiagnostic(stage || "request", transport.name, url, "TIMEOUT", "total direct request budget exceeded", attempt);
          stopDirect = true;
          break;
        }
        try {
          const response = await this._boundedGet(transport, url, headers, Math.min(transport.budgetMs, remainingMs));
          if (response.statusCode >= 200 && response.statusCode < 300) {
            this._rememberTransport(transport.name);
            this._logSuccess(stage || "request", transport.name, url, attempt);
            return response.body;
          }
          const code = this._failureCode(response, null);
          diagnostics.push({ transport: transport.name, attempt: attempt, code: code });
          this._logDiagnostic(stage || "request", transport.name, url, code, null, attempt);
          stopDirect = true;
          break;
        } catch (error) {
          const code = this._failureCode(null, error);
          diagnostics.push({ transport: transport.name, attempt: attempt, code: code });
          this._logDiagnostic(stage || "request", transport.name, url, code, error, attempt);
          if (!this._isTransientCode(code)) {
            stopDirect = true;
            break;
          }
          if (attempt < transport.maxAttempts) {
            const delay = this._retryDelay(attempt);
            if (Date.now() - startedAt + delay >= this.directRequestBudgetMs) {
              stopDirect = true;
              break;
            }
            await this._pause(delay);
          }
        }
      }
      if (stopDirect) break;
    }
    throw this._directError(url, diagnostics.length ? diagnostics : [{ transport: "NONE", code: "NETWORK" }], stage || "request");
  }

  _normalizeSearch(value) {
    let text = this._text(value);
    try { text = text.normalize("NFKC"); } catch (_) {}
    return text.trim().replace(/\s+/g, " ");
  }

  _searchKey(value) {
    return this._normalizeSearch(value).toLowerCase().replace(/\s+/g, "");
  }

  _searchChunks(value) {
    const key = this._searchKey(value).replace(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3]/gi, "");
    const result = [];
    for (const width of [3, 2]) {
      if (key.length < width) continue;
      for (let index = 0; index <= key.length - width; index++) {
        const chunk = key.slice(index, index + width);
        if (result.indexOf(chunk) < 0) result.push(chunk);
        if (result.length >= 5) return result;
      }
    }
    if (key && result.indexOf(key) < 0) result.push(key);
    return result;
  }

  _chapterDate(value) {
    const match = this._text(value).trim().match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
    if (!match) return "0";
    const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - 9 * 60 * 60 * 1000;
    return Number.isFinite(time) ? String(time) : "0";
  }

  _parseCards(document, base) {
    const list = [];
    const seen = {};
    for (const card of document.select("a.comic-link[href]")) {
      const path = this._relativePath(card.attr("href")).split("#")[0];
      if (!/^\/comics\/\d+\/?(?:\?.*)?$/.test(path) || seen[path]) continue;
      const titled = card.selectFirst("h3[title]");
      const plain = card.selectFirst("h3");
      const name = this._text(titled ? titled.attr("title") : (plain ? plain.text : "")).trim();
      if (!name) continue;
      const image = card.selectFirst(".cover-shell img.cover-image, img.cover-image");
      list.push({
        name: name,
        link: path.split("?")[0],
        imageUrl: this._imageUrl(base, image, true)
      });
      seen[path] = true;
    }
    return {
      list: list,
      hasNextPage: document.select("a[aria-label='\ub2e4\uc74c \ud398\uc774\uc9c0']").length > 0
    };
  }

  async _list(page, options) {
    const base = await this._resolveBaseUrl();
    const settings = options || {};
    const pairs = [
      ["category", settings.category || ""],
      ["weekday", settings.weekday || ""],
      ["genre", settings.genre || ""],
      ["status", settings.status || ""],
      ["platform", settings.platform || ""],
      ["sort", settings.sort || ""]
    ];
    if (page > 1) pairs.push(["page", page]);
    const url = this._withQuery(base, "/comics", pairs);
    const document = new Document(await this._getText(url, null, "list"));
    return this._parseCards(document, base);
  }

  _koreaWeekday() {
    const day = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDay();
    return ["\uc77c", "\uc6d4", "\ud654", "\uc218", "\ubaa9", "\uae08", "\ud1a0"][day];
  }

  _weekdayCardInfo(weekday) {
    const values = {
      "\uc6d4": ["\uc6d4\uc694\uc77c", "monday"], "\ud654": ["\ud654\uc694\uc77c", "tuesday"], "\uc218": ["\uc218\uc694\uc77c", "wednesday"],
      "\ubaa9": ["\ubaa9\uc694\uc77c", "thursday"], "\uae08": ["\uae08\uc694\uc77c", "friday"], "\ud1a0": ["\ud1a0\uc694\uc77c", "saturday"], "\uc77c": ["\uc77c\uc694\uc77c", "sunday"]
    };
    const info = values[weekday] || values[this._koreaWeekday()];
    return { name: info[0], slug: info[1] };
  }

  async _tabCard(weekday, tab) {
    const info = this._weekdayCardInfo(weekday);
    const customSource = this._text(this._preference("xtoon_custom_card_json_url", "")).trim();
    const customImage = await this._customCardUrl(info.slug);
    const event = customSource ? null : await dcOfficialEventCard();
    const official = customImage || event ? null : await dcOfficialListCardSystem("xtoon", tab, "오늘의 웹툰");
    return {
      name: customImage ? info.name : event ? event.name : official.name,
      link: "/__xtoon_weekday_card__/" + info.slug,
      imageUrl: customImage || (event && event.imageUrl) || official.imageUrl
    };
  }

  async _prependTabCard(result, page, tabRule, tab) {
    if (Number(page) !== 1) return result;
    return { list: [await this._tabCard(tabRule.rule.weekday, tab)].concat(result.list || []), hasNextPage: result.hasNextPage === true };
  }

  getHeaders(url) {
    return {
      "User-Agent": this.userAgent,
      "Referer": (this._origin(url) || this.fallbackBaseUrl) + "/",
      "Accept": this.imageAccept
    };
  }

  async getPopular(page) {
    const tabRule = this._tabRule(this.popularRulePreference, this._defaultPopularRule());
    return this._prependTabCard(await this._list(page, tabRule.rule), page, tabRule, "popular");
  }

  async getLatestUpdates(page) {
    const tabRule = this._tabRule(this.latestRulePreference, this._defaultLatestRule());
    return this._prependTabCard(await this._list(page, tabRule.rule), page, tabRule, "latest");
  }

  _filterValue(filters, type, fallback) {
    if (!Array.isArray(filters)) return fallback;
    for (const filter of filters) {
      if (!filter || filter.type !== type || !Array.isArray(filter.values)) continue;
      const index = Number(filter.state) || 0;
      const option = filter.values[index];
      return option && option.value !== undefined ? this._text(option.value) : fallback;
    }
    return fallback;
  }

  _filterRule(filters) {
    const unset = "__unset__";
    const raw = {
      category: this._filterValue(filters, "category", unset),
      weekday: this._filterValue(filters, "weekday", unset),
      genre: this._filterValue(filters, "genre", unset),
      status: this._filterValue(filters, "status", unset),
      platform: this._filterValue(filters, "platform", ""),
      sort: this._filterValue(filters, "sort", "")
    };
    const selected = raw.category !== unset || raw.weekday !== unset || raw.genre !== unset || raw.status !== unset || raw.platform !== "" || raw.sort !== "";
    if (!selected) return null;
    return this._normalizeRule({
      category: raw.category === unset ? "" : raw.category,
      weekday: raw.weekday === unset ? "" : raw.weekday,
      genre: raw.genre === unset ? "" : raw.genre,
      status: raw.status === unset ? "" : raw.status,
      platform: raw.platform,
      sort: raw.sort
    }, this._defaultLatestRule());
  }

  async _searchOnce(base, query, page) {
    const pairs = [["q", query]];
    if (page > 1) pairs.push(["page", page]);
    const url = this._withQuery(base, "/search", pairs);
    return this._parseCards(new Document(await this._getText(url, null, "search")), base);
  }

  async search(query, page, filters) {
    const normalized = this._normalizeSearch(query);
    if (normalized) {
      const base = await this._resolveBaseUrl();
      const primaryQuery = this._searchKey(normalized);
      if (!primaryQuery) return { list: [], hasNextPage: false };
      const primary = await this._searchOnce(base, primaryQuery, page);
      if (primary.list.length || page > 1) return primary;

      const wanted = this._searchKey(normalized);
      const found = [];
      const seen = {};
      for (const chunk of this._searchChunks(normalized)) {
        const candidate = await this._searchOnce(base, chunk, 1);
        for (const manga of candidate.list) {
          if (!seen[manga.link] && this._searchKey(manga.name).indexOf(wanted) >= 0) {
            found.push(manga);
            seen[manga.link] = true;
          }
        }
      }
      return { list: found, hasNextPage: false };
    }

    const action = Number(this._filterValue(filters, "tabRuleAction", "0"));
    let rule = this._filterRule(filters);
    if (!rule && action >= 3 && action <= 5) {
      rule = action === 3 ? this._defaultPopularRule() : this._defaultLatestRule();
    }
    if (!rule) throw new Error("XTOON 필터에서 분류·요일·장르·연재 상태·플랫폼·정렬 중 사용할 조건을 선택하세요.");
    this._applyTabRuleAction(page, filters, rule);
    return await this._list(page, rule);
  }

  async getDetail(url) {
    const cardMatch = this._text(url).match(/\/__xtoon_weekday_card__\/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
    if (cardMatch) {
      const weekdayBySlug = { monday: "\uc6d4", tuesday: "\ud654", wednesday: "\uc218", thursday: "\ubaa9", friday: "\uae08", saturday: "\ud1a0", sunday: "\uc77c" };
      const card = await this._tabCard(weekdayBySlug[cardMatch[1]]);
      return {
        name: card.name,
        link: card.link,
        imageUrl: card.imageUrl,
        author: "XTOON",
        description: "오늘 요일 작품을 안내하는 움직이는 카드입니다. 뒤로 돌아가 작품을 선택해 주세요.",
        genre: ["요일 안내"],
        status: 0,
        episodes: [],
        chapters: []
      };
    }
    const base = await this._resolveBaseUrl();
    const path = this._relativePath(url).split("?")[0];
    const match = path.match(/^\/comics\/(\d+)\/?$/);
    if (!match) throw new Error("\uc798\ubabb\ub41c XTOON \uc791\ud488 \uc8fc\uc18c\uc785\ub2c8\ub2e4.");
    const comicId = match[1];
    const detailUrl = base + "/comics/" + comicId;
    const document = new Document(await this._getText(detailUrl, null, "detail"));
    const titleNode = document.selectFirst(".title-clamp") || document.selectFirst("#comic-title") || document.selectFirst("h1");
    let title = this._text(titleNode ? titleNode.text : "").trim();
    if (!title) {
      const ogTitle = document.selectFirst('meta[property="og:title"]');
      if (ogTitle) {
        title = this._text(ogTitle.attr("content")).split("—")[0].split("|")[0].trim();
      }
    }
    const cover = document.selectFirst("img.mobile-comic-cover") || document.selectFirst("img.cover-image") || document.selectFirst("img[data-comic-cover]");
    const description = document.selectFirst("[data-comic-description]");
    const genres = [];
    for (const element of document.select("[aria-label='\uc791\ud488 \uc7a5\ub974'] a")) {
      const value = this._text(element.text).trim();
      if (value && genres.indexOf(value) < 0) genres.push(value);
    }
    let author = "";
    try {
      const authorLinks = document.select('a[href*="/search?q="]');
      const authorNames = [];
      for (const a of authorLinks) {
        const txt = this._text(a.text).trim();
        if (txt && authorNames.indexOf(txt) < 0) authorNames.push(txt);
      }
      if (authorNames.length > 0) author = authorNames.join(", ");
    } catch (_) {}
    if (!author && titleNode && titleNode.nextElementSibling) {
      try { author = this._text(titleNode.nextElementSibling.text).trim(); } catch (_) {}
    }
    let statusText = "";
    try { statusText = titleNode && titleNode.parent ? this._text(titleNode.parent.text) : ""; } catch (_) {}

    const episodes = [];
    const seen = {};
    let chapterPage = 1;
    let hasMore = true;
    while (hasMore && chapterPage <= 500) {
      const chapterUrl = this._withQuery(base, "/comics/" + comicId + "/chapters", [
        ["page", chapterPage], ["sort", "latest"]
      ]);
      const body = await this._getText(chapterUrl, {
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": detailUrl
      }, "chapters");
      let data;
      try {
        data = JSON.parse(body);
      } catch (_) {
        try {
          const jsonMatch = body.match(/\{[\s\S]*\}/);
          data = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (__) {}
        if (!data) {
          throw new Error("XTOON 회차 응답을 읽지 못했습니다. 사이트 인증 상태를 확인하세요.");
        }
      }
      const rows = Array.isArray(data.chapters) ? data.chapters : [];
      for (const row of rows) {
        const id = this._text(row && row.id).trim();
        if (!id || seen[id]) continue;
        const epTitle = this._text(row.title).trim();
        episodes.push({
          name: epTitle || ("\ud68c\ucc28 " + id),
          url: "/comics/" + comicId + "/chapters/" + id,
          dateUpload: this._chapterDate(row.date)
        });
        seen[id] = true;
      }
      hasMore = data.has_more === true;
      const next = Number(data.next_page || (chapterPage + 1));
      if (hasMore && (!Number.isFinite(next) || next <= chapterPage || !rows.length)) hasMore = false;
      chapterPage = next;
    }
    return {
      name: title,
      link: "/comics/" + comicId,
      imageUrl: this._imageUrl(base, cover, true),
      author: author,
      description: this._text(description ? description.text : "").trim(),
      genre: genres,
      status: statusText.indexOf("\uc644\uacb0") >= 0 ? 1 : 0,
      episodes: episodes,
      chapters: episodes
    };
  }

  _rabbitEnabled() {
    const value = this._preference("xtoon_rabbit_enabled", false);
    return value === true || this._text(value).toLowerCase() === "true" || this._text(value) === "1";
  }

  _rabbitEndpoint() {
    const raw = this._trimSlash(this._preference("xtoon_rabbit_endpoint", ""));
    if (!raw) throw new Error("Rabbit \uc11c\ubc84 \uc8fc\uc18c\uac00 \ube44\uc5b4 \uc788\uc2b5\ub2c8\ub2e4. Windows\ub294 localhost, iOS\ub294 LAN/Tailscale \uc8fc\uc18c\ub97c \uc785\ub825\ud558\uc138\uc694.");
    if (!/^https?:\/\/(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(raw)) {
      throw new Error("Rabbit \uc11c\ubc84 \uc8fc\uc18c \ud615\uc2dd\uc774 \uc798\ubabb\ub410\uc2b5\ub2c8\ub2e4. \uc608: http://192.168.0.10:9870");
    }
    return raw;
  }

  _rabbitHeaders(jsonBody) {
    const headers = { "Accept": "application/json", "X-Lab-Request": "1" };
    if (jsonBody) headers["Content-Type"] = "application/json";
    const key = this._text(this._preference("xtoon_rabbit_access_key", "")).trim();
    if (key) headers.Authorization = "Bearer " + key;
    return headers;
  }

  async _rabbitJson(endpoint, path, body, ignoreFailure) {
    try {
      const response = body === undefined
        ? await new Client().get(endpoint + path, this._rabbitHeaders(false))
        : await new Client().post(endpoint + path, this._rabbitHeaders(true), body);
      if (response.statusCode === 401 || response.statusCode === 403) {
        throw new Error("Rabbit \uc811\uc18d \ud0a4\uac00 \ud2c0\ub838\uac70\ub098 \uc11c\ubc84 \uc778\uc99d \uc124\uc815\uacfc \ub2e4\ub985\ub2c8\ub2e4.");
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        if (ignoreFailure) return {};
        let code = "";
        try { code = this._text(JSON.parse(response.body).error); } catch (_) {}
        if (response.statusCode === 400 && /chapter_(?:url_not_allowed|host_not_public)/.test(code)) {
          throw new Error("\ud604\uc7ac Rabbit \uc11c\ubc84\uac00 XTOON \uc8fc\uc18c\ub97c \uc9c0\uc6d0\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4. XTOON \uc9c0\uc6d0 \uc11c\ubc84\ub85c \uc5c5\ub370\uc774\ud2b8\ud558\uc138\uc694.");
        }
        throw new Error("Rabbit \uc11c\ubc84 \uc694\uccad \uc2e4\ud328 (HTTP " + response.statusCode + (code ? ", " + code : "") + ").");
      }
      return JSON.parse(response.body);
    } catch (error) {
      if (ignoreFailure) return {};
      if (error && error.message && error.message.indexOf("Rabbit") >= 0) throw error;
      throw new Error("Rabbit \uc11c\ubc84\uc5d0 \uc5f0\uacb0\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4. \uc8fc\uc18c, \ud3ec\ud2b8, \ubc29\ud654\ubcbd, LAN/Tailscale\uc744 \ud655\uc778\ud558\uc138\uc694.");
    }
  }

  _newRequestId() {
    this.requestSequence++;
    const randomA = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
    const randomB = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
    let seed = Date.now().toString(16).padStart(12, "0") + randomA + randomB + this.requestSequence.toString(16).padStart(4, "0");
    seed = (seed + "00000000000000000000000000000000").slice(0, 32);
    return seed.slice(0, 8) + "-" + seed.slice(8, 12) + "-4" + seed.slice(13, 16) + "-a" + seed.slice(17, 20) + "-" + seed.slice(20, 32);
  }

  async _pause(milliseconds) {
    if (typeof setTimeout === "function") {
      await new Promise(function(resolve) { setTimeout(resolve, milliseconds); });
      return;
    }
    const deadline = Date.now() + Math.min(milliseconds, 250);
    while (Date.now() < deadline) {}
  }

  _manifestPages(manifest, id, chapterUrl) {
    if (!manifest || this._text(manifest.id) !== id || this._text(manifest.chapterUrl) !== chapterUrl) {
      throw new Error("Rabbit \uc778\uc99d \uacb0\uacfc\uc758 \ud68c\ucc28/\uc791\uc5c5 \uc815\ubcf4\uac00 \uc77c\uce58\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.");
    }
    const rows = manifest.pages;
    const expected = Number(manifest.expected);
    if (!Array.isArray(rows) || !rows.length || rows.length > 2000 || expected !== rows.length) {
      throw new Error("Rabbit \uc11c\ubc84\uac00 \ubd88\uc644\uc804\ud55c \uc774\ubbf8\uc9c0 \ubaa9\ub85d\uc744 \ubc18\ud658\ud588\uc2b5\ub2c8\ub2e4.");
    }
    const referer = this._text(manifest.referer).trim();
    const userAgent = this._text(manifest.userAgent).trim();
    if (!referer || !userAgent) throw new Error("Rabbit \uc774\ubbf8\uc9c0 \uc694\uccad \uc815\ubcf4\uac00 \ubd88\uc644\uc804\ud569\ub2c8\ub2e4.");
    const result = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (!row || Number(row.page) !== index + 1 || !Array.isArray(row.urls)) {
        throw new Error("Rabbit \uc774\ubbf8\uc9c0 \uc21c\uc11c\uac00 \uc62c\ubc14\ub974\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.");
      }
      let imageUrl = "";
      for (const candidate of row.urls) {
        if (/^https:\/\/[^\s]+$/i.test(this._text(candidate))) { imageUrl = this._text(candidate); break; }
      }
      if (!imageUrl) throw new Error("Rabbit \uc774\ubbf8\uc9c0 \uc8fc\uc18c\uac00 \uc720\ud6a8\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.");
      result.push({ url: imageUrl, headers: { "Referer": referer, "User-Agent": userAgent, "Accept": this.imageAccept } });
    }
    return result;
  }

  async _rabbitPages(chapterUrl) {
    const endpoint = this._rabbitEndpoint();
    const health = await this._rabbitJson(endpoint, "/health");
    if (!health || health.service !== "rabbit-auth-server" || Number(health.protocol) !== 1) {
      throw new Error("\ud638\ud658\ub418\ub294 Rabbit \uc778\uc99d \uc11c\ubc84(protocol v1)\uac00 \uc544\ub2d9\ub2c8\ub2e4.");
    }
    if (health.ready !== true) throw new Error("Rabbit \uc11c\ubc84\uac00 \uc544\uc9c1 \uc900\ube44\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4. \uc11c\ubc84 \ube0c\ub77c\uc6b0\uc800 \uc0c1\ud0dc\ub97c \ud655\uc778\ud558\uc138\uc694.");
    const requestId = this._newRequestId();
    const opened = await this._rabbitJson(endpoint, "/v1/jobs", {
      url: chapterUrl, requestId: requestId, kind: "images"
    });
    const id = this._text(opened.id);
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Rabbit \uc11c\ubc84\uac00 \uc798\ubabb\ub41c \uc791\uc5c5 \ubc88\ud638\ub97c \ubc18\ud658\ud588\uc2b5\ub2c8\ub2e4.");
    try {
      const deadline = Date.now() + 115000;
      while (Date.now() < deadline) {
        const state = await this._rabbitJson(endpoint, "/v1/jobs/" + id);
        if (state.state === "failed") throw new Error("Rabbit XTOON \uc778\uc99d \uc791\uc5c5\uc774 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4. \uc11c\ubc84 \ud654\uba74\uc5d0\uc11c \uc0ac\uc774\ud2b8 \uc0c1\ud0dc\ub97c \ud655\uc778\ud558\uc138\uc694.");
        if (state.state === "ready") {
          const manifest = await this._rabbitJson(endpoint, "/v1/jobs/" + id + "/manifest", {});
          return this._manifestPages(manifest, id, chapterUrl);
        }
        await this._pause(750);
      }
      throw new Error("Rabbit \uc778\uc99d \uc2dc\uac04\uc774 \ucd08\uacfc\ub410\uc2b5\ub2c8\ub2e4. \uc11c\ubc84 \ud654\uba74\uc744 \ud655\uc778\ud55c \ub4a4 \ub2e4\uc2dc \uc2dc\ub3c4\ud558\uc138\uc694.");
    } finally {
      await this._rabbitJson(endpoint, "/v1/jobs/" + id + "/close", {}, true);
    }
  }

  async _directPages(chapterUrl, base) {
    const document = new Document(await this._getText(chapterUrl, { "Referer": chapterUrl }, "viewer"));
    const result = [];
    const seen = {};
    for (const image of document.select("#comic-reader [data-reader-page] img[data-reader-image][src]")) {
      const imageUrl = this._imageUrl(base, image, false);
      if (!imageUrl || seen[imageUrl]) continue;
      result.push({
        url: imageUrl,
        headers: { "User-Agent": this.userAgent, "Referer": chapterUrl, "Accept": this.imageAccept }
      });
      seen[imageUrl] = true;
    }
    if (!result.length) {
      throw new Error("XTOON \uc9c1\uc811 \ubdf0\uc5b4 \uc778\uc99d\uc5d0 \uc2e4\ud328\ud588\uac70\ub098 \uc774\ubbf8\uc9c0\uac00 \uc5c6\uc2b5\ub2c8\ub2e4. \uba3c\uc800 Intra/1.1.1.1/\uc720\ub2c8\ucf58 HTTPS\ub97c \uc2dc\ub3c4\ud558\uace0, \ud544\uc694\ud560 \ub54c\ub9cc Rabbit\uc744 \ucf1c\uc138\uc694.");
    }
    return result;
  }

  async getPageList(url) {
    const base = await this._resolveBaseUrl();
    const path = this._relativePath(url).split("?")[0];
    if (!/^\/comics\/\d+\/chapters\/\d+\/?$/.test(path)) throw new Error("\uc798\ubabb\ub41c XTOON \ud68c\ucc28 \uc8fc\uc18c\uc785\ub2c8\ub2e4.");
    const chapterUrl = base + path;
    try {
      return await this._directPages(chapterUrl, base);
    } catch (directErr) {
      if (this._rabbitEnabled()) {
        try {
          return await this._rabbitPages(chapterUrl);
        } catch (_) {}
      }
      throw directErr;
    }
  }

  async getVideoList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }

  _option(name, value) {
    return { type_name: "SelectOption", name: name, value: value };
  }

  _select(type, name, values) {
    return { type: type, name: name, type_name: "SelectFilter", values: values };
  }

  getFilterList() {
    const o = this._option.bind(this);
    const popular = this._tabRule(this.popularRulePreference, this._defaultPopularRule()).rule;
    const latest = this._tabRule(this.latestRulePreference, this._defaultLatestRule()).rule;
    const separator = function(type) { return { type: type, name: "", type_name: "SeparatorFilter" }; };
    const header = function(type, name) { return { type: type, name: name, type_name: "HeaderFilter" }; };
    return [
      this._select("category", "\ubd84\ub958", [o("선택하세요", "__unset__"), o("전체", ""), o("\uc77c\ubc18\ub9cc\ud654", "\uc77c\ubc18\ub9cc\ud654"), o("BL\u00b7GL", "BL\u00b7GL"), o("\uc131\uc778\ub9cc\ud654", "\uc131\uc778")]),
      this._select("weekday", "\uc694\uc77c", [o("선택하세요", "__unset__"), o("\uc804\uccb4", ""), o("\uc6d4", "\uc6d4"), o("\ud654", "\ud654"), o("\uc218", "\uc218"), o("\ubaa9", "\ubaa9"), o("\uae08", "\uae08"), o("\ud1a0", "\ud1a0"), o("\uc77c", "\uc77c")]),
      this._select("genre", "\uc7a5\ub974", [
        o("선택하세요", "__unset__"), o("\uc804\uccb4", ""), o("\ub85c\ub9e8\uc2a4", "1"), o("\ub4dc\ub77c\ub9c8", "4"), o("\ud310\ud0c0\uc9c0", "2"), o("\ub85c\ub9e8\uc2a4\ud310\ud0c0\uc9c0", "2739"),
        o("\uc131\uc7a5\ubb3c", "2753"), o("\uc561\uc158", "3"), o("\ub2a5\ub825\ub140", "2902"), o("\uc18c\uc124\uc6d0\uc791", "2774"), o("\uc655\uc871/\uadc0\uc871", "2777"),
        o("\ub2e4\uc815\ub0a8", "2904"), o("\uba3c\uce58\ud0a8", "2772"), o("\ub85c\ub9e8\ud2f1\ucf54\ubbf8\ub514", "2903"), o("\ub2a5\ub825\ub0a8", "2905"), o("\uc644\uacb0\ub85c\ub9e8\uc2a4", "3266"),
        o("\ub2ec\ub2ec\ubb3c", "2771"), o("\uac1c\uadf8/\ucf54\ubbf8\ub514", "6"), o("\uc131\uc7a5", "2874"), o("\ubcf5\uc218", "2754"), o("\ubb34\ud611/\uc0ac\uadf9", "2743"), o("\ube59\uc758", "2757")
      ]),
      this._select("status", "\uc5f0\uc7ac \uc0c1\ud0dc", [o("선택하세요", "__unset__"), o("\uc804\uccb4", ""), o("\uc5f0\uc7ac\uc911", "\uc5f0\uc7ac\uc911"), o("\uc644\uacb0", "\uc644\uacb0")]),
      this._select("platform", "\ud50c\ub7ab\ud3fc", [
        o("\uc804\uccb4", ""), o("\uce74\uce74\uc624\ud398\uc774\uc9c0", "kakao-page"), o("\ub124\uc774\ubc84", "naver"), o("\ub808\uc9c4\ucf54\ubbf9\uc2a4", "lezhin"), o("\ub9ac\ub514", "ridi"),
        o("\ud0d1\ud230", "toptoon"), o("\ubd04\ud230", "bomtoon"), o("\ubbf8\uc2a4\ud130\ube14\ub8e8", "mrblue"), o("\ud22c\ubbf9\uc2a4", "toomics"), o("\ud53c\ub108\ud230", "peanutoon"), o("\ucf54\ubbf8\ucf54", "comico")
      ]),
      this._select("sort", "\uc815\ub82c", [o("\ucd5c\uc2e0\uc21c", ""), o("\uc778\uae30\uc21c", "popular")]),
      separator("sepSave"),
      header("saveHelp", "조건을 고른 뒤 Filter 버튼을 누르면 결과를 보고 Popular/Latest 탭 규칙으로 저장할 수 있습니다."),
      header("popularSummary", "현재 Popular: " + this._ruleSummary(popular)),
      header("latestSummary", "현재 Latest: " + this._ruleSummary(latest)),
      this._select("tabRuleAction", "Popular/Latest 규칙", [
        o("저장하지 않음 (필터 결과만 보기)", "0"),
        o("현재 조건을 Popular 탭에 저장", "1"),
        o("현재 조건을 Latest 탭에 저장", "2"),
        o("Popular 탭을 기본값으로 복원", "3"),
        o("Latest 탭을 기본값으로 복원", "4"),
        o("두 탭 모두 기본값으로 복원", "5")
      ])
    ];
  }

  getSourcePreferences() {
    return [
      {
        key: "xtoon_domain_url",
        editTextPreference: {
          title: "확장앱 주소 직접 지정",
          summary: "\ube48 \uac12\uc774\uba74 \ud1a0\ub07c \uc911\uc559\uc2e0\ud638\ub4f1\uc744 \uc0ac\uc6a9\ud569\ub2c8\ub2e4.", value: "",
          dialogTitle: "https://newxtoon#.com", dialogMessage: "\uc790\ub3d9 \uc8fc\uc18c\ub97c \uc4f0\ub824\uba74 \ube48 \uac12\uc73c\ub85c \ub450\uc138\uc694."
        }
      },
      {
        key: "xtoon_rabbit_enabled",
        switchPreferenceCompat: {
          title: "Rabbit \uc678\ubd80 \uc778\uc99d \uc11c\ubc84 \uc0ac\uc6a9", summary: "\uae30\ubcf8\uc740 \uaebc\uc9d0. \ucf1c\uba74 \ubdf0\uc5b4\ub9cc Rabbit\uc744 \uc0ac\uc6a9\ud569\ub2c8\ub2e4.", value: false
        }
      },
      {
        key: "xtoon_rabbit_endpoint",
        editTextPreference: {
          title: "Rabbit \uc11c\ubc84 \uc8fc\uc18c", summary: "Windows: localhost \uac00\ub2a5 / iOS: LAN \ub610\ub294 Tailscale \uc8fc\uc18c", value: "",
          dialogTitle: "\uc608: http://192.168.0.10:9870", dialogMessage: "\uc790\ub3d9 localhost\ub97c \uac15\uc81c\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4."
        }
      },
      {
        key: "xtoon_rabbit_access_key",
        editTextPreference: {
          title: "Rabbit 접속 키", summary: "서버에 키를 설정한 경우만 입력", value: "", dialogTitle: "접속 키", dialogMessage: ""
        }
      },
      {
        key: "xtoon_custom_card_json_url",
        editTextPreference: {
          title: "커스텀 목록 카드", summary: "공개 JSON 주소 하나로 요일별 목록 카드를 설정합니다. 360×540 이미지를 권장하며 용량·프레임 제한은 없습니다.", value: "",
          dialogTitle: "커스텀 목록 카드 JSON 주소", dialogMessage: "Google Drive 공개 공유 링크 또는 직접 JSON 주소를 넣으세요. 개인 카드를 설정하면 공용 이벤트 카드는 표시되지 않습니다. 빈 값이면 공용 이벤트 또는 기본 망가 요일 카드를 사용합니다."
        }
      }
    ];
  }
}


