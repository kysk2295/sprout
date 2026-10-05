package app.sprout.alarms

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 32 §17.6 결정 ⓐ: expo-notifications는 canScheduleExactAlarms()가 참일 때만 setExactAndAllowWhileIdle로 예약한다.
 * JS가 그 값을 보고(설정 줄·로컬 예약 보고), 꺼져 있으면 시스템 "알람 및 리마인더" 화면을 연다.
 */
class SproutAlarmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SproutAlarms")

    /** Android 12(S) 이상만 사용자 허용이 필요하다 */
    Function("needsPermission") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    }

    /** 지금 정확한 알람을 예약할 수 있나(12 미만은 늘 참) */
    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        true
      } else {
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
      }
    }

    /** 이 앱의 "알람 및 리마인더" 허용 화면. 못 열면 false(호출 쪽이 앱 정보 화면으로) */
    AsyncFunction("openSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        false
      } else {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
          (appContext.currentActivity ?: context).startActivity(intent)
          true
        } catch (e: Exception) {
          false
        }
      }
    }
  }
}
