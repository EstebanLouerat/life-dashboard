package expo.modules.livesession

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings

/**
 * Foreground service shown while a workout session runs. It draws the ongoing
 * notification (countdown that ticks by itself, Pause / Suivant / Arrêter) and
 * the floating capsule, and fires "expired" at the end of each timed step: JS
 * timers pause in the background, native ones do not.
 */
class LiveSessionService : Service() {
  companion object {
    const val CHANNEL = "session"
    const val NOTIFICATION_ID = 4210
    const val ACTION_PAUSE = "expo.modules.livesession.PAUSE"
    const val ACTION_NEXT = "expo.modules.livesession.NEXT"
    const val ACTION_STOP = "expo.modules.livesession.STOP"

    @Volatile
    var state: SessionState? = null

    @Volatile
    var appVisible = true

    @Volatile
    var instance: LiveSessionService? = null
  }

  private val handler = Handler(Looper.getMainLooper())
  private var expiry: Runnable? = null
  private var bubble: SessionBubble? = null
  private var started = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_PAUSE -> emit("pause")
      ACTION_NEXT -> emit("next")
      ACTION_STOP -> if (!emit("stop")) shutDown()
      else -> render()
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    expiry?.let { handler.removeCallbacks(it) }
    bubble?.hide()
    bubble = null
    instance = null
    started = false
    super.onDestroy()
  }

  /** Sends a tap or a step end to JS; false when JS is gone. */
  fun emit(action: String): Boolean = LiveSessionModule.emit(action, state?.index ?: -1)

  /** Opens the app on the session's deep link (the timer, or the feedback once finished). */
  fun openIntent(): Intent {
    val url = state?.url.orEmpty()
    val intent = if (url.isNotEmpty()) {
      Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(packageName)
    } else {
      packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    }
    return intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }

  private fun openUrl(): PendingIntent =
    PendingIntent.getActivity(this, 1, openIntent(), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

  /** Redraws the notification and the capsule from `state`, and re-arms the end-of-step timer. */
  fun render() {
    val s = state
    val notification = buildNotification(s)
    if (!started) {
      // startForegroundService() must be answered with startForeground(), even if JS stopped meanwhile.
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      started = true
    } else {
      getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification)
    }
    if (s == null) {
      shutDown()
      return
    }

    expiry?.let { handler.removeCallbacks(it) }
    val endsAt = s.endsAt
    if (endsAt != null && !s.paused && !s.finished) {
      val index = s.index
      val task = Runnable { LiveSessionModule.emit("expired", index) }
      expiry = task
      handler.postDelayed(task, maxOf(0L, endsAt.toLong() - System.currentTimeMillis()))
    }

    val showBubble = s.bubble && !s.finished && !appVisible && Settings.canDrawOverlays(this)
    if (showBubble) {
      val b = bubble ?: SessionBubble(this).also { bubble = it }
      b.show(s)
    } else {
      bubble?.hide()
    }
  }

  private fun shutDown() {
    bubble?.hide()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun buildNotification(s: SessionState?): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
      val channel = NotificationChannel(CHANNEL, "Séance en cours", NotificationManager.IMPORTANCE_LOW)
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }
    val builder = newBuilder()
    builder
      .setSmallIcon(smallIcon())
      .setContentTitle(s?.title ?: "Séance")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(openUrl())
    if (s == null) return builder.build()

    builder.setColor(parseColor(s.color))
    val endsAt = s.endsAt
    val running = endsAt != null && !s.paused && !s.finished
    builder.setContentText(if (s.paused && !s.finished) "En pause · ${clock(s.remainingMs)} · ${s.subtitle}" else s.subtitle)
    if (running && endsAt != null) {
      builder.setWhen(endsAt.toLong()).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
    } else {
      builder.setShowWhen(false).setUsesChronometer(false)
    }
    // Colour fills the card on Android 8–15; Android 16 instead promotes it to a Live Update (status bar chip).
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Build.VERSION.SDK_INT < 36) builder.setColorized(true)
    if (Build.VERSION.SDK_INT >= 36) builder.addExtras(Bundle().apply { putBoolean("android.requestPromotedOngoing", true) })

    if (!s.finished) {
      builder.addAction(action(if (s.paused) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause, if (s.paused) "Reprendre" else "Pause", ACTION_PAUSE, 2))
      builder.addAction(action(android.R.drawable.ic_media_next, if (s.reps) "Série faite" else "Suivant", ACTION_NEXT, 3))
      builder.addAction(action(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", ACTION_STOP, 4))
    }
    return builder.build()
  }

  @Suppress("DEPRECATION")
  private fun newBuilder(): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL) else Notification.Builder(this)

  private fun action(icon: Int, title: String, name: String, requestCode: Int): Notification.Action {
    val intent = Intent(this, LiveSessionService::class.java).setAction(name)
    val pending = PendingIntent.getService(this, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    return Notification.Action.Builder(Icon.createWithResource(this, icon), title, pending).build()
  }

  /** The app's monochrome notification icon (expo-notifications "icon"), or the launcher icon. */
  private fun smallIcon(): Int {
    val id = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (id != 0) id else applicationInfo.icon
  }
}

internal fun parseColor(hex: String): Int = try {
  Color.parseColor(hex)
} catch (e: IllegalArgumentException) {
  Color.parseColor("#A84B24")
}

/** "0:18" */
internal fun clock(ms: Double): String {
  val total = Math.ceil(ms / 1000.0).toInt().coerceAtLeast(0)
  return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
}
