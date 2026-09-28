# 🎌 Mangayomi 커스텀 확장 저장소

한국 웹툰/만화/애니 소스를 위한 커스텀 Mangayomi 확장 저장소입니다.  
원본 토끼 저장소를 **완전 미러링 + XTOON SNI 차단 우회 패치** 적용.

---

## 📱 Mangayomi 앱에 등록하기

설정 → 확장 → 저장소 추가 → 아래 URL **각각** 입력:

### 📚 만화/웹툰 소스
```
https://lee-gangjin.github.io/mangayomi-repo/manga/index.min.json
```

### 📺 미디어/애니 소스
```
https://lee-gangjin.github.io/mangayomi-repo/media/index.min.json
```

> **원본 저장소 구조와 동일하게 만화/미디어를 별도 URL로 분리**

---

## 📋 포함 소스 목록

### 📚 만화/웹툰 (manga)
| 소스 | 버전 | 특징 |
|---|---|---|
| **XTOON** ✅ | 0.1.11 | 커스텀 패치 (SNI 차단 우회 + WARP 프록시) |
| 11toon 만화 | 0.1.12 | 매일 추천 100 |
| 굿툰 | 0.1.9 | 연재/완결 |
| 블랙툰 | 0.1.13 | 일간 BEST |
| 늑대 만화 | 0.1.7 | 전체 장르 |
| 늑대 웹툰 | 0.1.6 | 신작순 |
| TOTAL 토끼 만화 | 0.1.13 | 내부 WebView |
| 네이버 웹툰 | 0.1.1 | 요일 인기순 |

### 📺 미디어/애니 (media)
| 소스 | 버전 | 특징 |
|---|---|---|
| IPTV | 0.1.6 | 실시간 IPTV |
| 삼성 TV 플러스 | 0.1.10 | 삼성 무료 채널 |
| Linkkf 애니 | 0.1.14 | 한/일 자막 |
| 애니24 | 0.1.14 | 방영중 필터 |
| 애니라이프 | 0.1.13 | HLS 다운로드 |
| 티비룸 | 0.1.22 | 애니+드라마+영화 |
| 라이브 TV·라디오 | 0.1.7 | 실시간 방송 |
| 티비위키 | 0.1.8 | 드라마/영화 |

---

## 🛠️ XTOON 커스텀 패치 내역

- `noProxy: true` 강제 하드코딩 제거
- 서브 PC WARP 프록시 릴레이 연동 (SNI 차단 우회)
- NewXtoon 리뉴얼 DOM 셀렉터 대응
- 초고속 프록시 직결 뷰어 이미지 추출 (~0.3s)

---

## 🔄 업데이트 방법

`manga/index.json` 또는 `media/index.json` 수정 후 `main` 브랜치에 push하면  
GitHub Actions가 자동으로 `index.min.json` 빌드 및 배포합니다.

```bash
npm run build   # 로컬에서 양쪽 index.min.json 동시 생성
```