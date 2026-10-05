package app.sprout.share

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 24 §5-5 Android 공유 받기: 다른 앱 공유 → 꿈틀(MainActivity, singleTask)로 온 SEND text/plain 인텐트에서
 * 글(EXTRA_TEXT)·제목(EXTRA_SUBJECT)을 꺼내 쌓아 두고, JS가 take()로 가져간다(가져가면 비움).
 *  - 앱이 꺼져 있을 때: 시작 인텐트(currentActivity.intent)에 있다 → JS가 로그인 뒤 take()
 *  - 앱이 떠 있을 때: OnNewIntent → 쌓고 "onShare" 이벤트
 * 한 번 읽은 인텐트는 action을 MAIN으로 바꾸고 extra를 지워 JS 다시 불러오기·화면 회전에도 두 번 들어가지 않게 한다.
 */
class SproutShareModule : Module() {
  private val pending = mutableListOf<Map<String, Any>>()

  private fun collect(intent: Intent?): Boolean {
    if (intent == null || intent.action != Intent.ACTION_SEND) return false
    val type = intent.type ?: ""
    if (!type.startsWith("text/")) return false
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
    intent.action = Intent.ACTION_MAIN
    intent.removeExtra(Intent.EXTRA_TEXT)
    intent.removeExtra(Intent.EXTRA_SUBJECT)
    if (text.isNullOrBlank() && subject.isNullOrBlank()) return false
    synchronized(pending) {
      pending.add(mapOf("text" to (text ?: ""), "subject" to (subject ?: ""), "at" to System.currentTimeMillis().toDouble()))
    }
    return true
  }

  override fun definition() = ModuleDefinition {
    Name("SproutShare")
    Events("onShare")

    /** 쌓인 공유를 가져가고 비운다. 시작 인텐트도 여기서 한 번 본다 */
    Function("take") {
      collect(appContext.currentActivity?.intent)
      synchronized(pending) {
        val out = pending.toList()
        pending.clear()
        out
      }
    }

    OnNewIntent { intent ->
      if (collect(intent)) sendEvent("onShare", mapOf<String, Any>())
    }
  }
}
