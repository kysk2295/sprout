package app.sprout.widgets

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * 36 §7.1·§7.4 (Android) 저장 칸: 앱 files/widget/{snapshot.json, art/<이름>.png} + SharedPreferences `sprout.widget`
 * (대기열 `actions` = 위젯 체크 JSON 배열, `nav.<위젯 id>` = 월 위젯 달 넘김). 계약은 packages/schema/src/widget.ts와 같다.
 */
object WidgetStore {
  private const val PREFS = "sprout.widget"
  private const val ACTIONS = "actions"

  fun root(ctx: Context): File = File(ctx.filesDir, "widget")
  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** tmp에 쓰고 이름 바꾸기 — 위젯이 반쯤 쓴 파일을 읽지 않게 */
  fun writeAtomic(file: File, bytes: ByteArray) {
    file.parentFile?.mkdirs()
    val tmp = File(file.parentFile, "${file.name}.tmp")
    tmp.writeBytes(bytes)
    if (!tmp.renameTo(file)) {
      file.writeBytes(bytes)
      tmp.delete()
    }
  }

  fun safe(ctx: Context, rel: String): File? = if (rel.contains("..") || rel.startsWith("/")) null else File(root(ctx), rel)

  sealed class Data {
    object First : Data()
    object SignedOut : Data()
    object Failed : Data()
    class Ready(val snap: JSONObject) : Data()
  }

  fun load(ctx: Context): Data {
    val f = File(root(ctx), "snapshot.json")
    if (!f.exists()) return Data.First
    return try {
      val o = JSONObject(f.readText())
      if (o.optInt("schema") != 1) Data.Failed
      else if (!(o.optJSONObject("account")?.optBoolean("signedIn") ?: false)) Data.SignedOut
      else Data.Ready(o)
    } catch (e: Exception) {
      Data.Failed
    }
  }

  // ── 대기열(위젯 → 앱, 25 §8.5) ──
  @Synchronized
  fun actions(ctx: Context): JSONArray = try { JSONArray(prefs(ctx).getString(ACTIONS, "[]")) } catch (e: Exception) { JSONArray() }

  @Synchronized
  private fun saveActions(ctx: Context, a: JSONArray) { prefs(ctx).edit().putString(ACTIONS, a.toString()).commit() }

  /** 반영 대기(완료) taskId → 남긴 시각(ms) */
  fun pending(ctx: Context): Map<String, Long> {
    val a = actions(ctx)
    val out = HashMap<String, Long>()
    for (i in 0 until a.length()) {
      val o = a.optJSONObject(i) ?: continue
      if (o.optString("kind") == "complete") out[o.optString("taskId")] = parseIso(o.optString("at"))
    }
    return out
  }

  /** 체크박스: 대기 중이면 지우고(완료 취소), 아니면 완료 항목을 넣는다. 돌려주는 값 = 새로 넣은 항목(지웠으면 null) */
  @Synchronized
  fun toggle(ctx: Context, taskId: String): JSONObject? {
    val a = actions(ctx)
    val keep = JSONArray()
    var removed = false
    for (i in 0 until a.length()) {
      val o = a.optJSONObject(i) ?: continue
      if (o.optString("taskId") == taskId && o.optString("kind") == "complete") removed = true else keep.put(o)
    }
    if (removed) { saveActions(ctx, keep); return null }
    val now = Date()
    val o = JSONObject()
      .put("schema", 1)
      .put("id", "${now.time}-${UUID.randomUUID().toString().take(8)}")
      .put("kind", "complete")
      .put("taskId", taskId)
      .put("at", iso(now))
      .put("day", localDay(now))
    keep.put(o)
    saveActions(ctx, keep)
    return o
  }

  @Synchronized
  fun removeActions(ctx: Context, ids: Set<String>) {
    val a = actions(ctx)
    val keep = JSONArray()
    for (i in 0 until a.length()) {
      val o = a.optJSONObject(i) ?: continue
      if (!ids.contains(o.optString("id"))) keep.put(o)
    }
    saveActions(ctx, keep)
  }

  // ── 월 위젯 달 넘김(위젯마다) ──
  fun monthOffset(ctx: Context, widgetId: Int) = prefs(ctx).getInt("nav.$widgetId", 0)
  fun setMonthOffset(ctx: Context, widgetId: Int, n: Int) { prefs(ctx).edit().putInt("nav.$widgetId", n).apply() }

  fun clear(ctx: Context) {
    File(root(ctx), "art").deleteRecursively()
    prefs(ctx).edit().clear().commit()
  }

  fun localDay(d: Date): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(d)
  private fun iso(d: Date): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(d)
  private fun parseIso(s: String): Long = try {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.parse(s)?.time ?: 0L
  } catch (e: Exception) { 0L }
}
