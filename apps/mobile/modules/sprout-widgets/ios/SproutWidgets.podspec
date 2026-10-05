# 36 모바일 위젯 §7.1 — 앱 → 위젯 저장 칸(App Group) 쓰기 + WidgetCenter 새로 고침(로컬 Expo 모듈, modules/ 자동 링크)
Pod::Spec.new do |s|
  s.name           = 'SproutWidgets'
  s.version        = '0.1.0'
  s.summary        = 'sprout home screen widget bridge'
  s.description    = 'Writes the widget snapshot into the App Group and reloads WidgetKit timelines'
  s.license        = 'UNLICENSED'
  s.author         = 'sprout'
  s.homepage       = 'https://sprout.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'WidgetKit'
  s.source_files   = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
