Study Android 프로젝트

- 최신 업로드 HTML/아이콘 기준
- PWA 로그인은 기존 웹 redirect 유지
- APK Google 로그인은 diary://login 딥링크 + 동일 WebView PKCE 세션 교환
- Android 런타임 systemBars/displayCutout inset으로 기기별 안전영역 적용 (고정 px/dp 없음)
- Study 상시 foreground 알림 + 5초 watchdog + 부팅 복구
- 알람은 별도 foreground service, 최대 볼륨/진동/화면 깨우기/최대 10분/상태 복구
- Android 13+ 알림 권한, exact alarm, DND access, battery optimization 관련 처리 포함
- Java/Kotlin JVM 17, compile/target SDK 35

GitHub 빌드: .github/workflows/build-apk.yml
Actions -> Build Study APK -> Run workflow -> Artifacts: Study-debug-apk
