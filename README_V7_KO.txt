공부장 PWA v7
- v6 병합 안전 동기화 유지
- Google/Supabase 동일 계정 기기간 실행 중 타이머 동기화
- Supabase Realtime 사용 가능 시 즉시 반영 시도
- Realtime 미설정이어도 3초마다 현재 달 타이머 상태 확인
- 초 카운트는 각 기기에서 started_at 기준 로컬 계산
