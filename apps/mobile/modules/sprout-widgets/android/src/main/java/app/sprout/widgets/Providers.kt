package app.sprout.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle

/** 36 §2 Android 위젯 3종 — 그리기는 WidgetRender, 저장 칸은 WidgetStore */
class MonthWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    for (id in ids) mgr.updateAppWidget(id, WidgetRender.month(ctx, mgr, id))
  }
  override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, newOptions: Bundle) {
    mgr.updateAppWidget(id, WidgetRender.month(ctx, mgr, id))
  }
  override fun onDeleted(ctx: Context, ids: IntArray) {
    for (id in ids) WidgetStore.setMonthOffset(ctx, id, 0)
  }
}

class TodayWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    for (id in ids) mgr.updateAppWidget(id, WidgetRender.today(ctx, mgr, id))
  }
  override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, newOptions: Bundle) {
    mgr.updateAppWidget(id, WidgetRender.today(ctx, mgr, id))
  }
}

class CharacterWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    for (id in ids) mgr.updateAppWidget(id, WidgetRender.character(ctx, mgr, id))
  }
}

/**
 * 위젯 버튼: 체크박스(TOGGLE, sprout-widget://toggle/<taskId>) · 달 넘김(SHIFT, sprout-widget://shift/<위젯 id>/<-1|0|1>).
 * 체크는 대기열에 넣고 바로 다시 그린 뒤, 앱 JS가 살아 있으면 onAction으로 알린다(36 W4 — 반영은 앱이 정상 완료 경로로).
 */
class WidgetActionReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    val seg = intent.data?.pathSegments ?: return
    when (intent.action) {
      WidgetRender.ACTION_TOGGLE -> {
        val taskId = intent.data?.lastPathSegment ?: return
        if (!Regex("^[A-Za-z0-9_-]{1,100}$").matches(taskId)) return
        WidgetStore.toggle(ctx, taskId)
        WidgetRender.updateToday(ctx)
        SproutWidgetsModule.notifyAction(taskId)
      }
      WidgetRender.ACTION_SHIFT -> {
        val id = seg.getOrNull(0)?.toIntOrNull() ?: return
        val delta = seg.getOrNull(1)?.toIntOrNull() ?: return
        val bounds = WidgetRender.monthBounds(ctx)
        val next = if (delta == 0) 0 else (WidgetStore.monthOffset(ctx, id) + delta).coerceIn(bounds.first, bounds.last)
        WidgetStore.setMonthOffset(ctx, id, next)
        val mgr = AppWidgetManager.getInstance(ctx)
        mgr.updateAppWidget(id, WidgetRender.month(ctx, mgr, id))
      }
    }
  }
}
