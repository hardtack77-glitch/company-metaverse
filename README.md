# 회사 메타버스 (모바일 웹)

## 🌐 인터넷 배포 (Render)

1. 이 폴더(또는 `_github_upload` 폴더 내용)를 GitHub 저장소에 올리기
2. https://render.com → GitHub 로 가입/로그인
3. **New → Blueprint** → 저장소 선택 → `render.yaml` 설정 그대로 **Apply**
4. 몇 분 뒤 `https://company-metaverse-xxxx.onrender.com` 주소로 누구나 접속

- 빌드: `npm run build` (서버·클라이언트 설치 + 화면 빌드) / 실행: `npm start`
- 서버 하나가 화면과 실시간 통신을 같이 처리 → 주소 하나로 접속
- 무료 요금제는 15분쯤 접속이 없으면 잠들고, 다음 접속 때 30초~1분 깨어나는 시간이 걸림
- 보물 기록 유지(선택): Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키(JSON)
  → Render 대시보드 → Environment → `FIREBASE_SERVICE_ACCOUNT` 에 JSON 전체 붙여넣기
  (없으면 서버 메모리에 저장되어 서버가 재시작될 때 초기화)
- 선착순 모드: Environment 의 `TREASURE_MODE` 를 `first` 로
- 맵 파일은 meshopt 압축본 (원본 합계 7.5MB → 1.8MB). 블렌더에서 다시 내보낸 glb 도 그대로 동작하며,
  압축하려면 `npx @gltf-transform/cli meshopt 원본.glb 압축.glb`


Node.js + Socket.IO 실시간 서버 / React + Three.js(@react-three/fiber) 클라이언트

## 실행 방법 (윈도우 PC)

터미널 2개를 열어 각각 실행합니다.

```bash
# 1) 서버
cd server
npm install
npm start          # → http://localhost:3001

# 2) 클라이언트
cd client
npm install
npm run dev        # → http://localhost:5173
```

## 휴대폰으로 접속하기

1. PC와 휴대폰을 **같은 와이파이**에 연결
2. PC에서 `ipconfig` → IPv4 주소 확인 (예: 192.168.0.12)
3. 휴대폰 브라우저에서 `http://192.168.0.12:5173` 접속
4. 처음 실행 시 윈도우 방화벽 창이 뜨면 **허용** (Node.js)

서버 주소를 따로 지정하려면 `client/.env` 파일에 `VITE_SERVER_URL=http://서버주소:3001` 을 적으세요.

## 층별 3D 맵 넣기 (1F / 6F / 7F)

블렌더에서 층마다 `.glb` 로 내보내 `client/public/` 에 넣으면 끝입니다. 코드는 고칠 필요 없어요.

```
client/public/floor_1f.glb
client/public/floor_6f.glb
client/public/floor_7f.glb
```

- 없는 층은 임시 맵(1F 로비 / 6F 사무실 / 7F·8F·9F 상담실)이 자동으로 나옵니다. 한 층씩 차례로 교체해도 됩니다.
- 있는 파일은 접속할 때 미리 불러와서(Preload) 엘리베이터를 타도 끊기지 않습니다.

### 블렌더에서 내보낼 때
1. 단위: 1 = 1m 로 모델링 (사람 키 약 1.7)
2. 층마다 **바닥 높이를 Z=0** 에 맞추기 (6층도 Z=0. 층 높이만큼 올리지 않기)
3. **엘리베이터 위치를 세 층 모두 같은 X·Y 좌표**에 두기
4. File → Export → glTF 2.0 → 형식 `glTF Binary (.glb)`, **+Y Up 체크(기본값)**
5. 좌표 변환: 블렌더 (X, Y, Z) → 웹 (X, Z, **-Y**)
   예) 블렌더에서 엘리베이터가 X=11, Y=11 이면 웹 좌표는 [11, 0, -11]

### 스크립트로 다시 만들기 (blender 폴더)
- `blender/build_1f.py` → 1층, `blender/build_6f.py` → 6층 (CS1그룹 사무실), `blender/build_7f.py` → 7·8·9층 상담실 (파일 맨 위 `FLOOR_NO` 를 7/8/9 로 바꿔 각각 실행) (기존 구역 위치 유지 + 영상·사진 디테일)
- 블렌더 5.x → Scripting 탭 → 파일 열기 → Run Script 하면 `client/public/floor_?f.glb` 로 바로 내보냄
- 내보낸 뒤 용량을 줄이려면: `npx @gltf-transform/cli meshopt 입력.glb 출력.glb`

### 좌표 맞추기
- 첫 입장 위치(1층 정문 로비): `server/index.js` 의 `START_POSITION`
- 엘리베이터 앞 파란 원형 마커 위치: `server/index.js` 의 `ELEVATORS` (엘리베이터 문은 마커 1.6m 뒤에 그려짐)
- 보물 10종(층마다 2개) 위치·층·이름: `server/index.js` 의 `treasures`
- NPC 6명 위치·층·대사·가디건 색: `client/src/App.jsx` 맨 위 `NPCS`
- 맵이 너무 크거나 작으면 `client/src/App.jsx` 의 `MAP_SCALE`, 이동 범위는 `BOUNDS`

## 캐릭터

- 입장 화면에서 **남성 / 여성(긴 머리) / 여성(단발)** 과 **가디건 색 12가지** 선택 (다른 사람에게도 그대로 보임, 다음 접속 때 기억)
- 캐릭터 모델: `client/public/characters.glb`
  - 여성 캐릭터는 `blender/build_characters.py` 로 생성 (원본 `glb_original/characters.glb` 를 읽어 추가)
  - 색 목록 `OUTFIT_COLORS`, 종류 목록 `CHARACTER_TYPES` 는 `client/src/App.jsx` 맨 위

## 보물 찾기

- 보물 위치·이름: `server/index.js` 의 `treasures` 에서 수정 (맵 좌표에 맞추세요)
- 획득 규칙: 기본은 1인 1회(`each`). 선착순 1명만 받게 하려면 서버를 이렇게 실행
  - PowerShell: `$env:TREASURE_MODE="first"; npm start`
- 서버가 거리(2m 이내)와 중복을 검사한 뒤 콜백(Acknowledgement)으로 결과를 돌려줍니다.
- 획득 기록은 지금 서버 메모리에만 있어 **서버를 끄면 초기화**됩니다. 운영 시 `saveClaim()` 의 TODO 주석대로 Firestore를 연결하세요.

## NPC

- `client/src/App.jsx` 맨 위의 `NPCS` 에서 이름·위치·대사 수정 (대사는 여러 줄 = 여러 페이지)

## 조작

- 모바일: 왼쪽 아래 조이스틱으로 이동, NPC/보물/엘리베이터 근처에서 오른쪽 버튼(💬 대화하기 / 🎁 보물 열기 / 🛗 층간 이동), 왼쪽 위 🎁 숫자를 누르면 찾은 보물 목록, 하단 입력창으로 말풍선 채팅
- PC: WASD / 방향키 이동, 스페이스·엔터로 대화·줍기

## 🎯 1층 다트 게임
- 1층 북카페 BULLSEYE 다트 머신 앞에 가면 **🎯 다트 게임** 버튼이 나옵니다.
- 화면을 누른 채 움직여 조준 → 손을 떼면 던짐 (조준점이 손떨림처럼 흔들림). 3라운드 × 3발, 실제 다트판 점수.
- 끝나면 서버 랭킹(최고 기록 기준 상위 10명)을 보여 주고, 같은 층 사람들에게 기록 알림이 뜹니다.
- 랭킹은 서버 메모리에 있어 서버가 다시 켜지면 초기화됩니다. 코드: `client/src/DartGame.jsx`, 서버 `dartScore`

## 👥 층별 직원 NPC
- 명단·대사·자리: `client/src/staff.js` (이름, 대사 문장을 바꾸면 바로 반영)
  - 1층 강사 4명: 일반강의장1·2, 강사실, 전산강의장1
  - 7·8·9층 실장(돌아다님)·팀장(팀장석에 앉거나 통로를 순찰)·코치(상담석에 앉음, 층마다 3명)
  - 겉모습(머리 모양·가디건 색)은 이름으로 정해지는 랜덤이라 매번 같게 나옵니다.
- 돌아다니는 NPC 는 내가 가까이 가면 멈춰서 바라보고, 대화하기 버튼이 뜹니다.
- 상담석의 약 절반에는 일하는 상담사(배경용, `client/src/SeatedCrowd.jsx`)가 앉아 있습니다. 많아도 가볍게 그리도록 단순한 모양입니다.

## 💌 NPC 에게 메시지 남기기
- NPC 와 대화하면 마지막에 **💌 메시지 남기기** 버튼 (채용담당자는 메뉴 4번)
- 공개 메시지는 그 NPC 에게 말을 건 다른 사람도 볼 수 있고, 비공개는 관리자만 볼 수 있음
- 관리자 메시지함: `https://company-metaverse.onrender.com/admin/messages?key=관리자키`
  - Render → 서비스 → Environment → `ADMIN_KEY` 에 원하는 비밀 키를 넣어야 열림 (엑셀 CSV 다운로드 가능)
- Firebase(FIREBASE_SERVICE_ACCOUNT)가 없으면 메시지는 서버 메모리에만 있어 서버가 다시 켜지면 사라짐

## 🔐 로그인 · 회원가입 · 게스트
- 첫 화면에서 **로그인 / 회원가입(내부 임직원) / 게스트 입장(방문자)** 중 선택
- 회원가입: 이름 + 사번(숫자 6자리) + 비밀번호 → 비밀번호는 암호화(scrypt)해서 Firestore `users` 컬렉션에 저장
- 회원은 보물 기록·캐릭터가 **사번 기준**으로 저장되어 다른 기기에서 로그인해도 이어짐 (자동 로그인 30일)
- 방문자는 이름만 입력하고 입장, 이름표에 "(방문자)" 표시, 기록은 그 기기에만 남음
- 회원 목록·삭제(비밀번호 분실 시 삭제 후 재가입): `/admin/users?key=관리자키`
- (선택) Render 환경변수 `AUTH_SECRET` 에 아무 긴 문자열을 넣으면 로그인 토큰 서명키로 사용

## 💬 채팅창 · 📬 내 메시지함
- 화면 오른쪽 아래 반투명 채팅창: 지금 층의 대화 10줄 표시, ▲▼ 단추로 최근 30줄까지 보기, "접기" 가능
- 층에 새로 들어오거나 엘리베이터로 이동하면 그 층의 최근 대화 30줄을 바로 보여 줌 (서버 재시작 시 초기화)
- 📬 메시지함: 내가 NPC 에게 남긴 메시지와 받은 답장을 모아 보기 (회원은 어느 기기에서든, 방문자는 그 기기에서만)
- 답장 쓰기: `/admin/messages?key=관리자키` 의 각 메시지 옆 "답장" 칸 → 보내면 상대가 접속 중일 때 바로 알림, 아니면 다음 입장 시 빨간 숫자 표시

## 📷 실사 사진 구역
- 정해진 구역에 들어가면 왼쪽 위에 실제 사진이 작게 뜨고, 터치하면 크게 보기 + 안내 문구
- 현재: 6층 수면실, 7·8·9층 수면실·휴게실·엘리베이터 홀·상담실(6장), 1층 엘리베이터 홀·북카페·탕비실·일반강의장1·사물함 (사진 `client/public/photos/`)
- 구역 추가: 사진을 `client/public/photos/` 에 넣고 `client/src/photoZones.js` 의 `PHOTO_ZONES` 에 한 줄 추가 (층, 좌표 범위, 제목, 사진 파일, 문구)
- 여러 장: `photos: ["a.jpg", "b.jpg"]` 로 적으면 스와이프·‹ › 단추로 넘겨 보기
