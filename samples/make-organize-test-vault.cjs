// 노트 자동 분류 시험용 합성 노트 100개(11개 주제 + 잡동사니 16개)와 정답표를 만든다.
// 실행: node samples/make-organize-test-vault.cjs → samples/organize-test-vault/ (폴더 없이 맨 위에 100개)
const fs = require('fs'); const path = require('path');
const VAULT = path.join(__dirname, 'organize-test-vault');
const ANSWER = path.join(__dirname, 'organize-test-answer.csv');
const data = {
  '코딩/Spring': ['spring boot 실무 이해 1편','spring boot 실무 이해 2편','spring boot 실무 이해 3편','spring boot 실무 이해 4편','spring 시큐리티 기초','spring 시큐리티 JWT 인증','spring JPA 연관관계 매핑','spring JPA N+1 문제','spring 트랜잭션 정리','spring MVC 요청 흐름','spring 배치 입문','spring 테스트 코드 작성법','spring 빈 생명주기','spring AOP 정리','spring 예외 처리 전략'],
  '코딩/Rust': ['rust 소유권 정리','rust 빌림 규칙','rust 라이프타임 이해','rust 에러 처리 Result','rust 트레잇 입문','rust 제네릭 정리','rust 비동기 tokio 기초','rust 스마트 포인터','rust 매크로 기초','rust 패턴 매칭'],
  '코딩/파이썬': ['파이썬 리스트 컴프리헨션','파이썬 딕셔너리 정리','파이썬 데코레이터 이해','파이썬 제너레이터','파이썬 판다스 기초','파이썬 넘파이 배열','파이썬 가상환경 설정','파이썬 비동기 asyncio','파이썬 클래스 상속','파이썬 예외 처리'],
  '코딩/자료구조': ['자료구조 스택과 큐','자료구조 연결 리스트','자료구조 해시 테이블','자료구조 이진 탐색 트리','자료구조 힙과 우선순위 큐','자료구조 그래프 표현','자료구조 트라이','자료구조 유니온 파인드'],
  '요리/찌개': ['김치찌개 황금비율','김치찌개 레시피','된장찌개 레시피','된장찌개 끓이는 법','부대찌개 레시피','순두부찌개 레시피','동태찌개 레시피','청국장찌개 레시피'],
  '요리/파스타': ['까르보나라 만들기','알리오올리오 만들기','토마토 파스타 만들기','크림 파스타 만들기','봉골레 파스타 만들기','로제 파스타 만들기'],
  '요리/베이킹': ['베이킹 마들렌 굽기','베이킹 쿠키 굽기','베이킹 식빵 굽기','베이킹 스콘 굽기','베이킹 브라우니 굽기'],
  '운동/헬스': ['헬스 스쿼트 자세 교정','헬스 데드리프트 자세','헬스 벤치프레스 루틴','헬스 하체 루틴','헬스 상체 루틴','헬스 단백질 섭취','헬스 3분할 루틴'],
  '운동/러닝': ['러닝 5km 기록','러닝 10km 기록','러닝 하프마라톤 준비','러닝 인터벌 훈련','러닝화 고르는 법'],
  '여행/제주': ['제주 3박4일 일정','제주 맛집 정리','제주 오름 추천','제주 렌터카 예약','제주 카페 투어'],
  '여행/일본': ['오사카 맛집 정리','오사카 2박3일 일정','도쿄 여행 일정','교토 사찰 투어','일본 교통패스 정리'],
  '기타': ['할 일 목록','메모 0930','아이디어','장보기 목록','읽을 책 목록','영화 감상 메모','회의 준비','생일 선물 아이디어','이사 체크리스트','가계부 9월','전화번호 정리','주말 계획','공부 계획','잡생각','블로그 글감','택배 확인'],
};
const all = Object.entries(data).flatMap(([topic, titles]) => titles.map((t) => [t, topic]));
const titles = all.map(([t]) => t);
if (all.length !== 100) throw new Error(`count ${all.length}`);
if (new Set(titles.map((t) => t.toLowerCase())).size !== 100) throw new Error('duplicate title');
if (titles.some((t) => /[\/:*?"<>|]/.test(t))) throw new Error('bad char');
if (fs.existsSync(VAULT) && fs.readdirSync(VAULT).length > 0) throw new Error('organize-test-vault 폴더가 비어 있지 않습니다. 지우고 다시 실행하세요');
fs.mkdirSync(VAULT, { recursive: true });
for (const [title, topic] of all) fs.writeFileSync(path.join(VAULT, `${title}.md`), `# ${title}\n\n${topic.split('/').pop()} 관련 메모.\n`);
const csv = '\uFEFF제목,큰 주제,작은 주제\n' + all.map(([t, topic]) => { const [big, small = ''] = topic.split('/'); return `"${t}",${big},${small}`; }).join('\n') + '\n';
fs.writeFileSync(ANSWER, csv);
console.log('files', fs.readdirSync(VAULT).length, 'answer rows', csv.trim().split('\n').length - 1);
for (const [k, v] of Object.entries(data)) console.log(k, v.length);
