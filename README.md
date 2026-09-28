# 🎌 Mangayomi 커스텀 확장 저장소

한국 웹툰/애니 소스를 위한 커스텀 Mangayomi 확장 저장소입니다.

## 📱 Mangayomi 앱에 등록하기

설정 → 확장 → 저장소 추가 → 아래 URL 입력:

```
https://lee-gangjin.github.io/mangayomi-repo/index.min.json
```

## 📋 포함된 소스 목록

| 소스 | 타입 | 버전 | 특징 |
|---|---|---|---|
| XTOON | 웹툰 | 0.1.11 | ✅ 커스텀 패치 (SNI 차단 우회) |
| IPTV | 미디어 | 0.1.6 | 실시간 IPTV |
| 삼성 TV 플러스 | 미디어 | 0.1.10 | 삼성 무료 채널 |
| Linkkf 애니 | 애니 | 0.1.14 | 한/일 자막 |
| 애니24 | 애니 | 0.1.14 | 방영중 필터 |
| 애니라이프 | 애니 | 0.1.13 | HLS 다운로드 |
| 티비룸 | 미디어 | 0.1.22 | 애니+드라마+영화 |
| 라이브 TV·라디오 | 미디어 | 0.1.7 | 실시간 방송 |
| 티비위키 | 미디어 | 0.1.8 | 드라마/영화 |

## 🛠️ XTOON 커스텀 패치 내역

- `noProxy: true` 강제 하드코딩 제거
- 서브 PC WARP 프록시 릴레이 연동 (SNI 차단 우회)
- NewXtoon 리뉴얼 DOM 셀렉터 대응
- 초고속 프록시 직결 뷰어 이미지 추출 (~0.3s)

## 🔄 업데이트 방법

`index.json` 수정 후 `main` 브랜치에 push하면 GitHub Actions가 자동으로 `index.min.json` 빌드 및 배포합니다.

```bash
npm run build   # 로컬에서 index.min.json 생성
```
