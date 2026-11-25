package expo.modules.livesession

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** What the running session looks like, sent by JS at every step change or pause. */
class SessionState : Record {
  @Field var title: String = ""
  @Field var subtitle: String = ""
  /** Epoch ms the current timed step ends at, null when paused or counted in reps. */
  @Field var endsAt: Double? = null
  @Field var remainingMs: Double = 0.0
  @Field var paused: Boolean = false
  @Field var finished: Boolean = false
  /** The step is counted in reps: "next" reads "Série faite". */
  @Field var reps: Boolean = false
  /** Step index, sent back with "expired" so JS never advances twice. */
  @Field var index: Int = 0
  @Field var color: String = "#A84B24"
  /** Show the floating capsule over other apps (needs the overlay permission). */
  @Field var bubble: Boolean = false
  /** Deep link opened by the notification and the capsule. */
  @Field var url: String = ""
}

/**
 * Bridge between the JS session runner and LiveSessionService. The service
 * keeps the timer visible outside the app (ongoing notification with a
 * countdown, floating capsule) and sends the user's taps and the end of each
 * timed step back as "onAction" events, so JS stays the single source of truth.
 */
class LiveSessionModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("LiveSession")

    Events("onAction")

    OnCreate { instance = this@LiveSessionModule }

    OnDestroy { if (instance === this@LiveSessionModule) instance = null }

    Function("update") { state: SessionState ->
      LiveSessionService.state = state
      val running = LiveSessionService.instance
      if (running != null) {
        Handler(Looper.getMainLooper()).post { running.render() }
      } else {
        val intent = Intent(context, LiveSessionService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
      }
    }

    Function("stop") {
      LiveSessionService.state = null
      context.stopService(Intent(context, LiveSessionService::class.java))
    }

    Function("canDrawOverlays") {
      Settings.canDrawOverlays(context)
    }

    Function("openOverlaySettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("setAppVisible") { visible: Boolean ->
      LiveSessionService.appVisible = visible
      LiveSessionService.instance?.let { service -> Handler(Looper.getMainLooper()).post { service.render() } }
    }
  }

  companion object {
    @Volatile
    var instance: LiveSessionModule? = null

    /** False when the JS side is gone (app killed): the caller then cleans up on its own. */
    fun emit(action: String, index: Int): Boolean {
      val module = instance ?: return false
      module.sendEvent("onAction", mapOf("action" to action, "index" to index))
      return true
    }
  }
}
