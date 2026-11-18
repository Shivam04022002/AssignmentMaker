package com.handwrite.samples

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.os.ext.SdkExtensions
import android.provider.MediaStore
import android.util.Base64
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Image input for handwriting samples. Everything stays on the device:
 *
 *  pickImage()                      system photo picker → a private copy of
 *                                   the chosen image in cacheDir/handwrite-samples
 *                                   → { uri, mime, width, height, bytes, orientation }
 *                                   (null when the user closes the picker)
 *  decodeForAnalysis(uri, maxEdge)  that copy → EXIF-oriented, downsampled
 *                                   8-bit grayscale raster, base64 encoded
 *  releaseImage(uri)                deletes one copy (only inside our folder)
 *  clearTemporaryImages()           deletes every copy (stale ones included)
 *
 * The user's original photo is only ever read through the picker's grant;
 * nothing here can modify or delete it. No pixels or paths are logged.
 */
@ReactModule(name = HandWriteSamplesModule.NAME)
class HandWriteSamplesModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), ActivityEventListener {

  companion object {
    const val NAME = "HandWriteSamples"
    private const val REQUEST_PICK = 0x4857
    private const val DIR = "handwrite-samples"
    private const val MIN_EDGE = 256
    private const val MAX_EDGE = 4096
  }

  private var pending: Promise? = null
  private val io = Executors.newSingleThreadExecutor()

  init {
    context.addActivityEventListener(this)
  }

  override fun getName() = NAME

  private fun folder(): File = File(context.cacheDir, DIR).apply { mkdirs() }

  /** The sample copy a uri names — only files inside our own folder. */
  private fun ownFile(uriString: String): File? {
    val path = Uri.parse(uriString).path ?: return null
    val file = File(path)
    val root = folder().canonicalPath + File.separator
    return if (file.canonicalPath.startsWith(root)) file else null
  }

  private fun photoPickerAvailable(): Boolean =
    Build.VERSION.SDK_INT >= 33 ||
      (Build.VERSION.SDK_INT >= 30 && SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R) >= 2)

  @ReactMethod
  fun pickImage(promise: Promise) {
    if (pending != null) {
      promise.reject("picker-busy", "A photo is already being chosen")
      return
    }
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject("unknown", "The photo picker cannot be opened right now")
      return
    }
    val intent =
      if (photoPickerAvailable()) {
        Intent(MediaStore.ACTION_PICK_IMAGES).apply { type = "image/*" }
      } else {
        Intent(Intent.ACTION_GET_CONTENT).apply {
          type = "image/*"
          addCategory(Intent.CATEGORY_OPENABLE)
        }
      }
    pending = promise
    try {
      activity.startActivityForResult(intent, REQUEST_PICK)
    } catch (e: Exception) {
      pending = null
      promise.reject("unknown", "The photo picker could not be opened", e)
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_PICK) return
    val promise = pending ?: return
    pending = null
    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      promise.resolve(null) // closed without choosing
      return
    }
    io.execute { copyAndDescribe(uri, promise) }
  }

  override fun onNewIntent(intent: Intent) {}

  private fun copyAndDescribe(source: Uri, promise: Promise) {
    val resolver = context.contentResolver
    val type = resolver.getType(source)?.lowercase()
    val ext = when (type) {
      "image/png" -> "png"
      "image/webp" -> "webp"
      "image/heic", "image/heif" -> "heic"
      else -> "jpg"
    }
    val file = File(folder(), "${UUID.randomUUID()}.$ext")
    try {
      val input = resolver.openInputStream(source) ?: throw IOException("no stream")
      input.use { stream -> FileOutputStream(file).use { stream.copyTo(it) } }
    } catch (e: SecurityException) {
      file.delete()
      promise.reject("permission-denied", "HandWrite was not allowed to read that photo", e)
      return
    } catch (e: IOException) {
      file.delete()
      promise.reject("temp-file", "The photo could not be copied for analysis", e)
      return
    } catch (e: Exception) {
      // Anything else a content provider may throw: never let it escape this
      // background thread (an uncaught exception there ends the app).
      file.delete()
      promise.reject("unknown", "The photo could not be read", e)
      return
    }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      file.delete()
      promise.reject("unreadable", "That image could not be opened")
      return
    }
    val orientation = try {
      ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    } catch (e: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }
    val result = Arguments.createMap().apply {
      putString("uri", Uri.fromFile(file).toString())
      putString("mime", (bounds.outMimeType ?: type ?: "image/jpeg").lowercase())
      putInt("width", bounds.outWidth)
      putInt("height", bounds.outHeight)
      putDouble("bytes", file.length().toDouble())
      putInt("orientation", if (orientation in 1..8) orientation else 1)
    }
    promise.resolve(result)
  }

  /** EXIF orientation (1–8) as a transform that turns the image upright. */
  private fun orientationMatrix(orientation: Int): Matrix? {
    val m = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.setScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> m.setRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.setScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> { m.setRotate(90f); m.postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_ROTATE_90 -> m.setRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> { m.setRotate(-90f); m.postScale(-1f, 1f) }
      ExifInterface.ORIENTATION_ROTATE_270 -> m.setRotate(-90f)
      else -> return null
    }
    return m
  }

  /**
   * Decodes a sample copy for analysis: orientation applied, long edge at
   * most maxLongEdge, one byte of luminance per pixel (row-major, no
   * padding: stride = width), base64 encoded.
   */
  @ReactMethod
  fun decodeForAnalysis(uriString: String, maxLongEdge: Double, promise: Promise) {
    io.execute {
      val started = System.nanoTime()
      val file = ownFile(uriString)
      if (file == null || !file.exists()) {
        promise.reject("unreadable", "The sample image is no longer available")
        return@execute
      }
      var bitmap: Bitmap? = null
      try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        val w0 = bounds.outWidth
        val h0 = bounds.outHeight
        if (w0 <= 0 || h0 <= 0) {
          promise.reject("unreadable", "That image could not be opened")
          return@execute
        }
        val target = maxLongEdge.roundToInt().coerceIn(MIN_EDGE, MAX_EDGE)
        // Power-of-two subsampling while decoding keeps memory down: the
        // decoded bitmap is at most twice the target on its long edge.
        var sample = 1
        while (max(w0, h0) / (sample * 2) >= target) sample *= 2
        val options = BitmapFactory.Options().apply {
          inSampleSize = sample
          inPreferredConfig = Bitmap.Config.RGB_565 // half of ARGB; enough for luminance
        }
        bitmap = BitmapFactory.decodeFile(file.path, options)
        if (bitmap == null) {
          promise.reject("unsupported-format", "This image format cannot be decoded on this device")
          return@execute
        }
        val scale = target.toFloat() / max(bitmap.width, bitmap.height)
        if (scale < 1f) {
          val scaled = Bitmap.createScaledBitmap(
            bitmap,
            max(1, (bitmap.width * scale).roundToInt()),
            max(1, (bitmap.height * scale).roundToInt()),
            true,
          )
          if (scaled !== bitmap) bitmap.recycle()
          bitmap = scaled
        }
        val orientation = try {
          ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } catch (e: Exception) {
          ExifInterface.ORIENTATION_NORMAL
        }
        val matrix = orientationMatrix(orientation)
        if (matrix != null) {
          val upright = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
          if (upright !== bitmap) bitmap.recycle()
          bitmap = upright
        }
        val width = bitmap.width
        val height = bitmap.height
        val gray = ByteArray(width * height)
        val row = IntArray(width)
        for (y in 0 until height) {
          bitmap.getPixels(row, 0, width, 0, y, width, 1)
          val offset = y * width
          for (x in 0 until width) {
            val c = row[x]
            // Rec. 601 luma, integer weights (sum 256).
            gray[offset + x] = ((77 * ((c shr 16) and 0xff) + 150 * ((c shr 8) and 0xff) + 29 * (c and 0xff)) shr 8).toByte()
          }
        }
        bitmap.recycle()
        bitmap = null
        val data = Base64.encodeToString(gray, Base64.NO_WRAP)
        val result = Arguments.createMap().apply {
          putInt("width", width)
          putInt("height", height)
          putString("encoding", "gray8-base64")
          putString("data", data)
          putInt("sourceWidth", w0)
          putInt("sourceHeight", h0)
          putInt("orientation", if (orientation in 1..8) orientation else 1)
          putBoolean("orientationApplied", true)
          putDouble("decodeMillis", (System.nanoTime() - started) / 1e6)
        }
        promise.resolve(result)
      } catch (e: OutOfMemoryError) {
        bitmap?.recycle()
        promise.reject("out-of-memory", "The image is too large to analyse on this device")
      } catch (e: Exception) {
        bitmap?.recycle()
        promise.reject("unreadable", "That image could not be decoded", e)
      }
    }
  }

  /** Deletes one sample copy. Safe to call more than once. */
  @ReactMethod
  fun releaseImage(uriString: String, promise: Promise) {
    io.execute {
      val file = ownFile(uriString)
      promise.resolve(file != null && file.exists() && file.delete())
    }
  }

  /** Deletes every sample copy (e.g. ones left by an interrupted session). */
  @ReactMethod
  fun clearTemporaryImages(promise: Promise) {
    io.execute {
      var count = 0
      folder().listFiles()?.forEach { if (it.isFile && it.delete()) count++ }
      promise.resolve(count)
    }
  }

  override fun invalidate() {
    pending?.resolve(null)
    pending = null
    context.removeActivityEventListener(this)
    io.shutdown()
    super.invalidate()
  }
}
