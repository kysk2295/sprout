package app.sprout.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StyleSpan
import android.view.Gravity
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.util.Date

/**
 * 36 §3·§5 (Android) 위젯 그리기 — RemoteViews. 모양은 iOS 위젯(plugins/widgets/ios)과 같은 규칙.
 * 색: 면·글자는 values / values-night 리소스, 강조색·막대 색은 저장 파일 값(API 31+는 밝게·어둡게 두 값을 같이 넘겨 시스템이 고른다).
 */
object WidgetRender {
  // 00 토큰 Default / Dark
  private val PRIMARY = 0xFF191919.toInt() to 0xFFF2F2F2.toInt()
  private val SECONDARY = 0xFF7D7D7D.toInt() to 0xFFCDCDCD.toInt()
  private val TERTIARY = 0xFFA3A4A7.toInt() to 0xFF606060.toInt()
  private val QUATERNARY = 0xFFB5B6B8.toInt() to 0xFF4A4A4A.toInt()
  private val HOLIDAY = 0xFFE5484D.toInt() to 0xFFF2555A.toInt()
  private val SATURDAY = 0xFF3D74E0.toInt() to 0xFF6B9CFF.toInt()
  private val DANGER = 0xFFD44343.toInt() to 0xFFD44343.toInt()
  private const val WHITE = 0xFFFFFFFF.toInt()

  const val ACTION_TOGGLE = "app.sprout.widgets.TOGGLE"
  const val ACTION_SHIFT = "app.sprout.widgets.SHIFT"

  private fun night(ctx: Context) = (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
  private fun parse(hex: String?, fallback: Int): Int = try {
    if (hex.isNullOrBlank()) fallback else Color.parseColor(if (hex.length > 7) hex.substring(0, 7) else hex)
  } catch (e: Exception) { fallback }
  private fun withAlpha(c: Int, a: Float) = Color.argb((a * 255).toInt().coerceIn(0, 255), Color.red(c), Color.green(c), Color.blue(c))
  private fun pair(c: Pair<Int, Int>, a: Float) = withAlpha(c.first, a) to withAlpha(c.second, a)

  private fun accent(snap: JSONObject?): Pair<Int, Int> {
    val t = snap?.optJSONObject("theme")
    return parse(t?.optString("accentLight"), 0xFF4E75F2.toInt()) to parse(t?.optString("accentDark"), 0xFF545DFA.toInt())
  }

  /** 밝게·어둡게 색 넘기기 — API 31+는 시스템이 테마 바뀔 때 다시 고른다 */
  private fun color(ctx: Context, rv: RemoteViews, id: Int, method: String, c: Pair<Int, Int>) {
    if (Build.VERSION.SDK_INT >= 31) rv.setColorInt(id, method, c.first, c.second)
    else rv.setInt(id, method, if (night(ctx)) c.second else c.first)
  }
  private fun text(ctx: Context, rv: RemoteViews, id: Int, c: Pair<Int, Int>) = color(ctx, rv, id, "setTextColor", c)

  private fun open(ctx: Context, uri: String): PendingIntent {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  private fun broadcast(ctx: Context, action: String, data: String): PendingIntent {
    val i = Intent(ctx, WidgetActionReceiver::class.java).setAction(action).setData(Uri.parse(data))
    return PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  private fun bold(s: String) = SpannableString(s).apply { setSpan(StyleSpan(Typeface.BOLD), 0, s.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }

  private fun heightDp(mgr: AppWidgetManager, id: Int, fallback: Int): Int {
    val o = mgr.getAppWidgetOptions(id)
    val h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT).takeIf { it > 0 } ?: o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)
    return if (h > 0) h else fallback
  }
  private fun widthDp(mgr: AppWidgetManager, id: Int, fallback: Int): Int {
    val w = mgr.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)
    return if (w > 0) w else fallback
  }

  private fun stateText(d: WidgetStore.Data): String? = when (d) {
    is WidgetStore.Data.First -> "꿈틀을 한 번 열어 주세요"
    is WidgetStore.Data.SignedOut -> "로그인이 필요해요\n꿈틀 열기"
    is WidgetStore.Data.Failed -> "위젯을 불러오지 못했어요\n꿈틀 열기"
    is WidgetStore.Data.Ready -> null
  }
  private fun todayKey() = WidgetStore.localDay(Date())

  // ── ① 월 캘린더 ──
  fun month(ctx: Context, mgr: AppWidgetManager, id: Int): RemoteViews {
    val rv = RemoteViews(ctx.packageName, R.layout.sprout_widget_month)
    val data = WidgetStore.load(ctx)
    val snap = (data as? WidgetStore.Data.Ready)?.snap
    val acc = accent(snap)
    color(ctx, rv, R.id.sw_add_bg, "setColorFilter", acc)
    color(ctx, rv, R.id.sw_prev, "setColorFilter", acc)
    color(ctx, rv, R.id.sw_next, "setColorFilter", acc)
    text(ctx, rv, R.id.sw_title, acc)
    val todayKey = todayKey()
    rv.setOnClickPendingIntent(R.id.sw_add, open(ctx, "sprout://quick-add?view=date:$todayKey"))
    val cal = snap?.optJSONObject("calendar")
    val months = cal?.optJSONArray("months")
    val msg = stateText(data) ?: if (months == null || months.length() == 0) "꿈틀을 열면 달력이 채워져요" else null
    if (msg != null) {
      rv.setViewVisibility(R.id.sw_grid, View.GONE)
      rv.setViewVisibility(R.id.sw_weekhead, View.GONE)
      rv.setViewVisibility(R.id.sw_nav, View.INVISIBLE)
      rv.setViewVisibility(R.id.sw_message, View.VISIBLE)
      rv.setTextViewText(R.id.sw_message, msg)
      rv.setOnClickPendingIntent(R.id.sw_message, open(ctx, "sprout://today"))
      return rv
    }
    // 위젯의 진짜 오늘 기준 이번 달 + 넘긴 만큼(36 §4 오래된 데이터)
    val thisMonth = todayKey.substring(0, 7)
    var base = cal!!.optInt("current", 0)
    for (i in 0 until months!!.length()) if (months.getJSONObject(i).optString("month") == thisMonth) base = i
    val offset = WidgetStore.monthOffset(ctx, id)
    val index = (base + offset).coerceIn(0, months.length() - 1)
    val month = months.getJSONObject(index)
    rv.setTextViewText(R.id.sw_title, month.optString("title"))
    rv.setOnClickPendingIntent(R.id.sw_prev, broadcast(ctx, ACTION_SHIFT, "sprout-widget://shift/$id/-1"))
    rv.setOnClickPendingIntent(R.id.sw_next, broadcast(ctx, ACTION_SHIFT, "sprout-widget://shift/$id/1"))
    rv.setOnClickPendingIntent(R.id.sw_title, broadcast(ctx, ACTION_SHIFT, "sprout-widget://shift/$id/0"))
    rv.setFloat(R.id.sw_prev, "setAlpha", if (index > 0) 1f else 0.3f)
    rv.setFloat(R.id.sw_next, "setAlpha", if (index < months.length() - 1) 1f else 0.3f)

    // 요일 줄: 토 파랑, 일 빨강
    rv.removeAllViews(R.id.sw_weekhead)
    val head = cal.optJSONArray("weekHead")
    for (i in 0 until 7) {
      val wd = RemoteViews(ctx.packageName, R.layout.sprout_widget_weekday)
      wd.setTextViewText(R.id.sw_wd, head?.optString(i) ?: "")
      text(ctx, wd, R.id.sw_wd, if (i == 6) HOLIDAY else if (i == 5) SATURDAY else TERTIARY)
      rv.addView(R.id.sw_weekhead, wd)
    }

    val weeks = month.optJSONArray("weeks")
    val nWeeks = weeks?.length() ?: 5
    val rowH = (heightDp(mgr, id, 300) - 12 - 28 - 18) / nWeeks.coerceAtLeast(1)
    val bars = ((rowH - 19) / 13).coerceIn(1, 4)
    rv.removeAllViews(R.id.sw_grid)
    for (w in 0 until nWeeks) {
      val week = weeks!!.getJSONArray(w)
      val row = RemoteViews(ctx.packageName, R.layout.sprout_widget_month_row)
      for (d in 0 until week.length()) row.addView(R.id.sw_row, cell(ctx, week.getJSONObject(d), todayKey, bars, acc))
      rv.addView(R.id.sw_grid, row)
    }
    return rv
  }

  private fun cell(ctx: Context, day: JSONObject, todayKey: String, bars: Int, acc: Pair<Int, Int>): RemoteViews {
    val c = RemoteViews(ctx.packageName, R.layout.sprout_widget_month_cell)
    val date = day.optString("date")
    val inMonth = day.optBoolean("inMonth", true)
    val isToday = date == todayKey
    val tone = if (day.isNull("tone")) null else day.optString("tone")
    val n = day.optInt("n").toString()
    if (isToday) {
      c.setViewVisibility(R.id.sw_today, View.VISIBLE)
      color(ctx, c, R.id.sw_today, "setColorFilter", acc)
      c.setTextViewText(R.id.sw_num, bold(n))
      c.setTextColor(R.id.sw_num, WHITE)
    } else {
      c.setTextViewText(R.id.sw_num, n)
      val base = when (tone) { "holiday", "sun" -> HOLIDAY; "sat" -> SATURDAY; else -> PRIMARY }
      text(ctx, c, R.id.sw_num, if (inMonth) base else if (tone == null) QUATERNARY else pair(base, 0.45f))
    }
    if (!day.isNull("holiday")) {
      c.setViewVisibility(R.id.sw_holiday, View.VISIBLE)
      c.setTextViewText(R.id.sw_holiday, day.optString("holiday"))
      text(ctx, c, R.id.sw_holiday, if (inMonth) HOLIDAY else pair(HOLIDAY, 0.45f))
    }
    val items = day.optJSONArray("items")
    val total = day.optInt("total")
    val overflow = total > bars
    val shown = minOf(items?.length() ?: 0, if (overflow) bars - 1 else bars)
    for (i in 0 until shown) {
      val it = items!!.getJSONObject(i)
      val b = RemoteViews(ctx.packageName, R.layout.sprout_widget_bar)
      val col = parse(if (it.isNull("color")) null else it.optString("color"), -1).let { if (it == -1) acc else it to it }
      val faded = it.optBoolean("faded")
      color(ctx, b, R.id.sw_bar, "setBackgroundColor", pair(col, if (faded) 0.08f else 0.18f))
      color(ctx, b, R.id.sw_bar_line, "setBackgroundColor", pair(col, if (faded) 0.4f else 1f))
      b.setTextViewText(R.id.sw_bar_text, it.optString("title"))
      text(ctx, b, R.id.sw_bar_text, if (faded) TERTIARY else PRIMARY)
      val link = if (it.optString("kind") == "event") "sprout://event/${it.optString("id")}" else "sprout://task/${it.optString("id")}"
      b.setOnClickPendingIntent(R.id.sw_bar, open(ctx, link))
      c.addView(R.id.sw_bars, b)
    }
    val more = total - shown
    if (overflow && more > 0) {
      c.setViewVisibility(R.id.sw_more, View.VISIBLE)
      c.setTextViewText(R.id.sw_more, "+$more")
    }
    if (!inMonth) c.setFloat(R.id.sw_bars, "setAlpha", 0.6f)
    c.setOnClickPendingIntent(R.id.sw_cell, open(ctx, "sprout://calendar?date=$date"))
    return c
  }

  // ── ② 오늘 할 일 ──
  fun today(ctx: Context, mgr: AppWidgetManager, id: Int): RemoteViews {
    val rv = RemoteViews(ctx.packageName, R.layout.sprout_widget_today)
    val data = WidgetStore.load(ctx)
    val snap = (data as? WidgetStore.Data.Ready)?.snap
    val acc = accent(snap)
    text(ctx, rv, R.id.sw_head_title, acc)
    text(ctx, rv, R.id.sw_head_count, pair(acc, 0.55f))
    color(ctx, rv, R.id.sw_head_plus, "setColorFilter", acc)
    val small = widthDp(mgr, id, 250) < 180
    rv.setViewVisibility(R.id.sw_head_plus, if (small) View.GONE else View.VISIBLE)
    rv.setOnClickPendingIntent(R.id.sw_head_plus, open(ctx, "sprout://quick-add?view=smart:today"))
    rv.setOnClickPendingIntent(R.id.sw_head, open(ctx, "sprout://today"))
    rv.setOnClickPendingIntent(android.R.id.background, open(ctx, "sprout://today"))
    val msg = stateText(data)
    fun message(s: String) {
      rv.setViewVisibility(R.id.sw_rows, View.GONE)
      rv.setViewVisibility(R.id.sw_message, View.VISIBLE)
      rv.setTextViewText(R.id.sw_message, s)
    }
    if (msg != null) {
      rv.setViewVisibility(R.id.sw_head, View.GONE)
      message(msg)
      return rv
    }
    val todayObj = snap!!.optJSONObject("today")
    val tasks = todayObj?.optJSONArray("tasks")
    val count = todayObj?.optInt("count") ?: 0
    rv.setTextViewText(R.id.sw_head_count, count.toString())
    if (snap.optString("day") != todayKey()) { message("꿈틀을 열면 오늘 목록으로 바뀌어요"); return rv }
    if (tasks == null || tasks.length() == 0) { message("오늘 할 일이 없어요"); return rv }
    val pending = WidgetStore.pending(ctx)
    val tooLong = pending.values.any { it > 0 && System.currentTimeMillis() - it > 60_000 }
    val rows = ((heightDp(mgr, id, 150) - 18 - 28 - (if (tooLong) 16 else 0)) / 28).coerceAtLeast(1)
    val overflow = count > rows
    val shown = minOf(tasks.length(), if (overflow) rows - 1 else rows)
    rv.removeAllViews(R.id.sw_rows)
    for (i in 0 until shown) {
      val t = tasks.getJSONObject(i)
      val r = RemoteViews(ctx.packageName, R.layout.sprout_widget_task_row)
      val tid = t.optString("id")
      val done = pending.containsKey(tid)
      r.setTextViewText(R.id.sw_task_title, t.optString("title"))
      text(ctx, r, R.id.sw_task_title, if (done) TERTIARY else PRIMARY)
      if (t.optInt("depth") > 0) r.setViewPadding(R.id.sw_task, dp(ctx, if (small) 10 else 18), 0, 0, 0)
      if (small) {
        r.setViewVisibility(R.id.sw_task_box, View.GONE)
        r.setViewVisibility(R.id.sw_task_label, View.GONE)
        r.setViewPadding(R.id.sw_task_title, 0, 0, 0, 0)
      } else {
        r.setImageViewResource(R.id.sw_task_box, if (done) R.drawable.sprout_widget_box_done else R.drawable.sprout_widget_box)
        color(ctx, r, R.id.sw_task_box, "setColorFilter", priority(t.optInt("priority")))
        r.setOnClickPendingIntent(R.id.sw_task_box, broadcast(ctx, ACTION_TOGGLE, "sprout-widget://toggle/$tid"))
        val label = if (t.isNull("label")) null else t.optString("label")
        if (label != null) {
          r.setTextViewText(R.id.sw_task_label, (if (t.optBoolean("repeat")) "⟲ " else "") + label)
          text(ctx, r, R.id.sw_task_label, if (t.optString("labelTone") == "danger") DANGER else acc)
        } else r.setViewVisibility(R.id.sw_task_label, View.GONE)
        r.setOnClickPendingIntent(R.id.sw_task, open(ctx, "sprout://task/$tid"))
      }
      rv.addView(R.id.sw_rows, r)
    }
    if (overflow) {
      val r = RemoteViews(ctx.packageName, R.layout.sprout_widget_task_row)
      r.setViewVisibility(R.id.sw_task_box, View.GONE)
      r.setViewVisibility(R.id.sw_task_label, View.GONE)
      r.setTextViewText(R.id.sw_task_title, "+${count - shown}개 더")
      r.setInt(R.id.sw_task_title, "setGravity", if (small) Gravity.START else Gravity.END)
      r.setFloat(R.id.sw_task_title, "setTextSize", 12f)
      text(ctx, r, R.id.sw_task_title, acc)
      r.setOnClickPendingIntent(R.id.sw_task, open(ctx, "sprout://today"))
      rv.addView(R.id.sw_rows, r)
    }
    if (tooLong) {
      rv.setViewVisibility(R.id.sw_footer, View.VISIBLE)
      rv.setTextViewText(R.id.sw_footer, "꿈틀을 열면 반영돼요")
    }
    return rv
  }

  private fun priority(p: Int): Pair<Int, Int> = when (p) {
    3 -> 0xFFC53C31.toInt() to 0xFFC53C31.toInt()
    2 -> 0xFFEFAB3E.toInt() to 0xFFEFAB3E.toInt()
    1 -> 0xFF4E75F2.toInt() to 0xFF4E75F2.toInt()
    else -> 0xFF8B8B8B.toInt() to 0xFF5A5A5A.toInt()
  }
  private fun dp(ctx: Context, v: Int) = (v * ctx.resources.displayMetrics.density).toInt()

  // ── ③ 캐릭터 ──
  fun character(ctx: Context, mgr: AppWidgetManager, id: Int): RemoteViews {
    val rv = RemoteViews(ctx.packageName, R.layout.sprout_widget_character)
    val data = WidgetStore.load(ctx)
    val snap = (data as? WidgetStore.Data.Ready)?.snap
    val growth = snap?.optJSONObject("growth")
    val msg = stateText(data) ?: if (growth == null) "위젯을 불러오지 못했어요" else null
    rv.setOnClickPendingIntent(android.R.id.background, open(ctx, if (msg == null) "sprout://growth" else "sprout://today"))
    if (msg != null) {
      for (v in listOf(R.id.sw_art, R.id.sw_name, R.id.sw_level, R.id.sw_xp, R.id.sw_next)) rv.setViewVisibility(v, View.GONE)
      rv.setViewVisibility(R.id.sw_message, View.VISIBLE)
      rv.setTextViewText(R.id.sw_message, msg)
      return rv
    }
    val g = growth!!
    val art = WidgetStore.safe(ctx, g.optString("art"))
    val bmp = if (art != null && art.exists()) BitmapFactory.decodeFile(art.path) else null
    if (bmp != null) rv.setImageViewBitmap(R.id.sw_art, bmp) else rv.setImageViewResource(R.id.sw_art, ctx.applicationInfo.icon)
    rv.setTextViewText(R.id.sw_name, if (g.isNull("name")) "알" else g.optString("name"))
    rv.setTextViewText(R.id.sw_level, "Lv ${g.optInt("level")} · ${g.optString("stageName")}")
    val into = g.optInt("xpInto")
    val toNext = g.optInt("xpToNext").coerceAtLeast(1)
    rv.setProgressBar(R.id.sw_xp, toNext, into.coerceIn(0, toNext), false)
    val acc = accent(snap)
    if (Build.VERSION.SDK_INT >= 31) {
      rv.setColorStateList(R.id.sw_xp, "setProgressTintList", ColorStateList.valueOf(acc.first), ColorStateList.valueOf(acc.second))
      rv.setColorStateList(R.id.sw_xp, "setProgressBackgroundTintList", ColorStateList.valueOf(TERTIARY.first), ColorStateList.valueOf(TERTIARY.second))
    }
    rv.setTextViewText(R.id.sw_next, "다음 레벨까지 ${(toNext - into).coerceAtLeast(0)} XP")
    return rv
  }

  // ── 갱신 ──
  fun updateAll(ctx: Context) {
    val mgr = AppWidgetManager.getInstance(ctx)
    for (id in mgr.getAppWidgetIds(ComponentName(ctx, MonthWidgetProvider::class.java))) mgr.updateAppWidget(id, month(ctx, mgr, id))
    updateToday(ctx)
    for (id in mgr.getAppWidgetIds(ComponentName(ctx, CharacterWidgetProvider::class.java))) mgr.updateAppWidget(id, character(ctx, mgr, id))
  }
  fun updateToday(ctx: Context) {
    val mgr = AppWidgetManager.getInstance(ctx)
    for (id in mgr.getAppWidgetIds(ComponentName(ctx, TodayWidgetProvider::class.java))) mgr.updateAppWidget(id, today(ctx, mgr, id))
  }
  /** 지금 월 위젯의 달 범위(달 넘김 제한) */
  fun monthBounds(ctx: Context): IntRange {
    val snap = (WidgetStore.load(ctx) as? WidgetStore.Data.Ready)?.snap ?: return 0..0
    val cal = snap.optJSONObject("calendar") ?: return 0..0
    val months = cal.optJSONArray("months") ?: return 0..0
    val thisMonth = todayKey().substring(0, 7)
    var base = cal.optInt("current", 0)
    for (i in 0 until months.length()) if (months.getJSONObject(i).optString("month") == thisMonth) base = i
    return -base..(months.length() - 1 - base)
  }
}
