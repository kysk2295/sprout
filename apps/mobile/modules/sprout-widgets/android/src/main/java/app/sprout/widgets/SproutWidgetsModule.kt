package app.sprout.widgets

import android.content.Context
import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.lang.ref.WeakReference

/**
 * 36 §7.1 (Android): 앱 JS ↔ 위젯 저장 칸. iOS 모듈(ios/SproutWidgetsModule.swift)과 같은 함수 이름.
 * 저장 파일 = files/widget/snapshot.json, 그림 = files/widget/art/, 대기열·달 넘김 = SharedPreferences sprout.widget
 */
class SproutWidgetsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  companion object {
    private var live: WeakReference<SproutWidgetsModule>? = null
    /** 위젯 체크 신호 — JS가 살아 있으면 바로 반영하게 알린다 */
    fun notifyAction(taskId: String) {
      try { live?.get()?.sendEvent("onAction", mapOf("taskId" to taskId)) } catch (e: Exception) { /* JS 없음 — 다음에 앱이 열릴 때 반영 */ }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SproutWidgets")
    Events("onAction")
    OnCreate { live = WeakReference(this@SproutWidgetsModule) }
    OnDestroy { if (live?.get() === this@SproutWidgetsModule) live = null }

    Function("configure") { _: String -> }
    Function("isAvailable") { true }

    AsyncFunction("setSnapshot") { json: String, reload: Boolean ->
      WidgetStore.writeAtomic(File(WidgetStore.root(context), "snapshot.json"), json.toByteArray(Charsets.UTF_8))
      if (reload) WidgetRender.updateAll(context)
      true
    }
    AsyncFunction("reload") { WidgetRender.updateAll(context) }

    AsyncFunction("writeArt") { rel: String, base64: String ->
      val f = WidgetStore.safe(context, rel) ?: return@AsyncFunction false
      WidgetStore.writeAtomic(f, Base64.decode(base64, Base64.DEFAULT))
      true
    }
    Function("hasArt") { rel: String -> WidgetStore.safe(context, rel)?.exists() ?: false }

    AsyncFunction("readActions") {
      val a = WidgetStore.actions(context)
      (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { mapOf("name" to it.optString("id"), "raw" to it.toString()) } }
    }
    AsyncFunction("removeActions") { names: List<String> -> WidgetStore.removeActions(context, names.toSet()) }

    AsyncFunction("clearData") {
      WidgetStore.clear(context)
      WidgetRender.updateAll(context)
    }
  }
}
