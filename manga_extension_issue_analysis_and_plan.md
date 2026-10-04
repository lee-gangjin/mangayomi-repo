# 🎌 Mangayomi 만화 확장 프로그램 미표시 문제 원인 분석 및 해결 계획서

---

## 1. 개요 및 현상
- **현상**: 최종 패치(v1.0.2 및 메타데이터 복원) 이후에도 Mangayomi 앱의 만화(Manga) 확장 프로그램 목록에 소스가 전혀 나타나지 않음.
- **기존 조치**: `isActive: true` 등의 Isar DB 메타데이터를 `manga/index.json`에 추가하였으나 여전히 미표시.
- **분석 기준**: Mangayomi 공식 Flutter 소스코드(`ExtensionStoreService`, `SourceRepository`, `fetchSourcesList`, `ExtensionScreen`)의 동작 로직을 직접 역추적하여 원인을 규명함.

---

## 2. 근본 원인 정밀 분석 (5가지)

### 🚨 원인 1. 저장소 URL 체계 파편화 및 루트 `index.min.json` 삭제 (HTTP 404)
- **발견 내용**:
  - v1.0.2 커밋에서 `index.min.json` (루트)을 삭제하고 `manga/index.min.json`, `media/index.min.json`으로 분리함.
  - 실제로 원격 배포 확인 결과:
    `https://lee-gangjin.github.io/mangayomi-repo/index.min.json` ➡️ **HTTP 404 Not Found**
  - **앱의 동작 방식 (`browse_state_provider.dart`)**:
    사용자가 저장소 주소로 `https://lee-gangjin.github.io/mangayomi-repo` 또는 기존 URL을 등록했을 경우, 앱은 자동으로 `$url/index.min.json`, `$url/index.json`을 요청함.
    현재 루트에 해당 파일들이 전혀 없어 **저장소 로드 자체가 실패**하거나 빈 목록으로 끝남.
  - 또한 Mangayomi 공식 표준은 `manga` 탭의 기본 저장소로 루트 `index.json`을 사용함.

---

### 🚨 원인 2. `appMinVerReq: "0.9.2"` 버전 필터링에 의한 강제 드롭
- **앱의 소스코드 (`fetch_sources_list.dart`)**:
  ```dart
  sourceList = storeResult.sources.where((source) =>
      source.itemType == itemType &&
      (source.appMinVerReq == null ||
       source.appMinVerReq!.isEmpty ||
       compareVersions(info.version, source.appMinVerReq!) > -1)
  ).toList();
  ```
- **문제점**:
  - `manga/index.json`의 모든 소스에 `"appMinVerReq": "0.9.2"`가 걸려 있음.
  - 사용자의 Mangayomi 앱 버전이 `0.9.2` 미만(예: 0.9.1, 0.8.x 등)일 경우, **비교 결과가 음수가 되어 모든 만화 소스가 목록에서 완전히 필터링되어 삭제**됨.
  - 공식 Mangayomi 확장 저장소(`mangayomi-extensions`)는 이 값을 `"0.5.0"` 또는 `""`(빈 값)으로 설정하여 버전 호환성을 보장함.

---

### 🚨 원인 3. Isar DB의 ID 캐시 고착 및 `isActive` 인덱스 누락
- **앱의 소스코드 (`SourceRepository.dart` & `fetch_sources_list.dart`)**:
  ```dart
  // 1) 화면 표시 쿼리: isActive == true 필수
  watchActiveVisibleByItemType(itemType) => isar.sources
      .where().isActiveEqualTo(true)
      .filter().itemTypeEqualTo(itemType)...

  // 2) 신규 소스 등록 로직
  final existingSource = await sourceRepository.findByIdAsync(source.id!);
  if (existingSource == null) {
    await _addNewSource(source, repo, itemType); // 여기서 신규 추가됨
    continue;
  }
  // existingSource가 이미 있으면 버전이 올라간 설치 소스만 업데이트함!
  ```
- **문제점**:
  - 이전에 패치할 때 `isActive`가 없었거나 잘못된 형태로 Isar DB에 이미 저장된 경우, `findByIdAsync(source.id!)`가 기존 객체를 찾아냄.
  - 미설치 소스는 버전 비교 분기를 타지 않으므로, **DB에 이미 `isActive: null/false`로 캐시된 잘못된 레코드가 영구히 덮어씌워지지 않고 방치**됨.
  - 결과적으로 `isActiveEqualTo(true)` 인덱스 스캔에서 항상 누락되어 화면에 뜨지 않음.
  - **해결책**: 버전(`version`)을 올리거나, `id` 값을 변경하여 앱이 완전히 새로운 소스로 인식하게 만들어야 함.

---

### 🚨 원인 4. 성인물(NSFW) 6종 기본 숨김 필터링 (`showNSFW`)
- **앱의 소스코드 (`extension_screen.dart`)**:
  ```dart
  final showNSFW = ref.watch(showNSFWStateProvider);
  if (!showNSFW && (element.isNsfw ?? false)) {
    continue; // NSFW 비활성화 시 화면에서 즉시 제외
  }
  ```
- **문제점**:
  - 현재 `manga/index.json` 8개 소스 중 **6개(11toon, 굿툰, 블랙툰, 늑대만화, 늑대웹툰, 토끼만화)** 가 `"isNsfw": true`로 설정됨.
  - 사용자의 앱 설정에서 "NSFW 내용 표시"가 꺼져 있다면, 이 6개는 애초에 화면에 나타나지 않음.

---

### 🚨 원인 5. `index.json` 규격 불일치 및 불필요한 내부 컬럼 포함
- 공식 `mangayomi-extensions/index.json` 규격에는 `isActive`, `isAdded`, `isPinned`, `lastUsed`, `sourceCode`, `headers`, `isLocal`, `isObsolete`, `versionLast` 같은 Isar DB 내부 컬럼이 포함되지 않음.
- 앱 내부 `Source.fromJson`이 이러한 필드를 파싱하면서 타입 충돌이나 상태 오염을 유발할 수 있음 (`_addNewSource`에서 자체 관리해야 하는 필드들임).
- 또한 루트 레벨의 통합 `index.min.json`이 존재하지 않아, 사용자가 어떤 URL을 입력해도 인식할 수 있는 하위 호환성이 완전히 깨져 있었음.

---

## 3. 해결 실행 계획서 (Action Plan)

### [1단계] 루트 및 하위 디렉토리 하위 호환 구조 복원 (Dual Compatibility)
1. **루트 `index.json` 및 `index.min.json` 복구**:
   - 만화 소스 8종 + 미디어 소스 8종을 통합한 루트 `index.json` / `index.min.json` 생성.
   - 사용자가 `https://lee-gangjin.github.io/mangayomi-repo`만 입력하거나 기존 URL을 입력해도 만화/미디어가 모두 정상 표시되도록 보장.
2. **`manga/` 및 `media/` 개별 경로도 유지**:
   - `manga/index.min.json`, `media/index.min.json`도 그대로 빌드하여 분리 URL을 선호하는 사용자도 지원.

### [2단계] 메타데이터 규격 정규화 및 버전 호환성 확보
1. **`appMinVerReq` 하향 조정**:
   - `"0.9.2"` ➡️ `"0.5.0"` (또는 `""`)으로 변경하여 모든 구버전/신버전 앱에서 필터링되지 않도록 조치.
2. **Isar DB 캐시 강제 무효화 및 갱신 (ID/버전 리프레시)**:
   - 만화 소스 버전들을 `+0.0.1` 올리거나 ID 충돌을 방지하여, 사용자의 앱 DB에 남아있는 불량 캐시(`isActive: null` 등)를 완전히 강제 재등록 유도.
3. **불필요한 DB 전용 필드 정돈**:
   - 공식 저장소와 동일하게 표준 20개 필드 규격에 맞추고, `isActive: true` 등 필수 필드만 정합성 있게 유지.

### [3단계] `build.js` 빌드 스크립트 확장
- `manga/index.json`, `media/index.json`, 그리고 루트 `index.json`을 단일 명령어로 자동 동기화 및 minify 빌드하도록 수정.

### [4단계] README 등록 안내문 보강
- Mangayomi 앱의 "NSFW 표시" 설정 활성화 안내 추가 (만화 6종이 NSFW이므로 필수 안내).
- 원클릭 통합 URL(`.../index.min.json`)과 분리 URL(`.../manga/...`, `.../media/...`) 모두 안내.

---

## 4. 기대 효과
- 사용자가 어떤 방식(루트 주소, 통합 json, 만화 분리 json)으로 저장소를 등록하더라도 즉시 만화 8종과 미디어 8종이 100% 온전하게 노출됨.
- 앱 버전 제한 해제로 기기/앱 버전에 상관없이 정상 로드 보장.
