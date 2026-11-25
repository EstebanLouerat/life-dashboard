package expo.modules.livesession

import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.SystemClock
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.Chronometer
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs

/**
 * Floating capsule over other apps while a session runs (like Samsung's
 * timer): time left and Pause. Drag it anywhere; tap it to open the timer.
 * Needs "Afficher par-dessus les autres applis".
 */
class SessionBubble(private val service: LiveSessionService) {
  private val windowManager = service.getSystemService(WindowManager::class.java)
  private val density = service.resources.displayMetrics.density
  private var root: LinearLayout? = null
  private lateinit var chrono: Chronometer
  private lateinit var label: TextView
  private lateinit var button: ImageView
  private lateinit var buttonBackground: GradientDrawable

  private fun dp(value: Int): Int = (value * density).toInt()

  fun show(s: SessionState) {
    if (root == null) create()
    update(s)
  }

  fun hide() {
    root?.let { runCatching { windowManager.removeView(it) } }
    root = null
  }

  private fun update(s: SessionState) {
    val endsAt = s.endsAt
    val timed = endsAt != null || s.remainingMs > 0
    chrono.visibility = if (timed) View.VISIBLE else View.GONE
    label.visibility = if (timed) View.GONE else View.VISIBLE
    if (timed) {
      val left = if (endsAt != null && !s.paused) endsAt.toLong() - System.currentTimeMillis() else s.remainingMs.toLong()
      chrono.base = SystemClock.elapsedRealtime() + left
      if (s.paused || endsAt == null) chrono.stop() else chrono.start()
    } else {
      chrono.stop()
      label.text = s.subtitle.substringBefore(" ·")
    }
    button.setImageResource(if (s.paused) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause)
    button.contentDescription = if (s.paused) "Reprendre la séance" else "Mettre la séance en pause"
    buttonBackground.setColor(parseColor(s.color))
  }

  @SuppressLint("ClickableViewAccessibility")
  private fun create() {
    chrono = Chronometer(service).apply {
      isCountDown = true
      setTextColor(Color.WHITE)
      textSize = 24f
      typeface = Typeface.create("sans-serif", Typeface.NORMAL)
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    label = TextView(service).apply {
      setTextColor(Color.WHITE)
      textSize = 18f
      maxLines = 1
    }
    buttonBackground = GradientDrawable().apply { shape = GradientDrawable.OVAL }
    button = ImageView(service).apply {
      background = buttonBackground
      setColorFilter(Color.WHITE)
      setPadding(dp(11), dp(11), dp(11), dp(11))
      layoutParams = LinearLayout.LayoutParams(dp(44), dp(44)).apply { marginStart = dp(14) }
      setOnClickListener { service.emit("pause") }
    }
    val capsule = LinearLayout(service).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = GradientDrawable().apply {
        cornerRadius = dp(30).toFloat()
        setColor(Color.parseColor("#F2141816"))
      }
      elevation = dp(8).toFloat()
      setPadding(dp(22), dp(8), dp(8), dp(8))
      contentDescription = "Séance en cours. Touche pour ouvrir le minuteur"
      addView(chrono)
      addView(label)
      addView(button)
      // The overlay permission lets the app open itself from the background.
      setOnClickListener { runCatching { service.startActivity(service.openIntent()) } }
    }

    val metrics = service.resources.displayMetrics
    val layout = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = metrics.widthPixels - dp(220)
      y = (metrics.heightPixels * 0.72).toInt()
    }

    // Follows the finger from where it was grabbed; a touch that does not move is a tap.
    val slop = ViewConfiguration.get(service).scaledTouchSlop
    var startX = 0
    var startY = 0
    var touchX = 0f
    var touchY = 0f
    var dragging = false
    capsule.setOnTouchListener { view, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          startX = layout.x
          startY = layout.y
          touchX = event.rawX
          touchY = event.rawY
          dragging = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - touchX).toInt()
          val dy = (event.rawY - touchY).toInt()
          if (!dragging && (abs(dx) > slop || abs(dy) > slop)) dragging = true
          if (dragging) {
            layout.x = startX + dx
            layout.y = startY + dy
            windowManager.updateViewLayout(view, layout)
          }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!dragging) view.performClick()
          true
        }
        else -> false
      }
    }

    windowManager.addView(capsule, layout)
    root = capsule
  }

  @Suppress("DEPRECATION")
  private fun overlayType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
}
