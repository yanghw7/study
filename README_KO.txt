종합 기록장 Android Studio 프로젝트

1. Android Studio에서 이 폴더를 Open 합니다.
2. Gradle Sync 후 Build > Build APK(s).
3. 첫 실행 때 표시되는 알림 / 방해금지 접근 / 정확한 알람 / 모든 파일 접근 / 배터리 최적화 제외 권한 화면을 허용하세요.
4. index.html의 기존 알람 시작/해제/끄기 버튼은 NativeAlarm 브리지와 연결됩니다.
5. 네이티브 알람은 AlarmManager + Foreground Service + WakeLock + USAGE_ALARM + 최대 STREAM_ALARM 볼륨 + 최대 진동을 사용하며 10분 뒤 자동 종료됩니다.

중요: Android는 사용자가 특별 접근 권한을 거부했거나 OEM/관리자 정책이 막는 경우 앱이 이를 강제로 우회할 수 없습니다. 특히 방해금지 우회, 정확한 알람, 배터리 최적화 제외, 모든 파일 접근은 사용자가 설정 화면에서 승인해야 합니다.
