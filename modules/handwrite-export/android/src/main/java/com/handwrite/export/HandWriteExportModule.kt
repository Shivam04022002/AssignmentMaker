package com.handwrite.export

import android.content.ClipData
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.view.View
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.UIManagerHelper
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.roundToInt

/**
 * Exports rendered HandWrite pages.
 *
 * The JS side mounts one page at a time (the same PaperPage component the
 * editor shows) and passes its React tag here. The page view is drawn
 * directly into:
 *  - a PdfDocument page (vector text with the real fonts, sharp at any zoom)
 *  - or a bitmap of a fixed pixel width (PNG/JPG), recycled immediately.
 * Only one page is in memory at a time; PDFs are written when finished.
 */
@ReactModule(name = HandWriteExportModule.NAME)
class HandWriteExportModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  companion object {
    const val NAME = "HandWriteExport"
    private const val MAX_PIXEL_WIDTH = 2480 // A4 at 300 dpi
  }

  private class PdfJob(val document: PdfDocument, val path: String, val width: Int, val height: Int) {
    var pages = 0
  }

  private val pdfs = HashMap<String, PdfJob>()
  private val io = Executors.newSingleThreadExecutor()

  override fun getName() = NAME

  private fun resolveView(tag: Int): View? =
    UIManagerHelper.getUIManagerForReactTag(context, tag)?.resolveView(tag)

  private fun prepareFile(path: String): File {
    val file = File(path)
    file.parentFile?.mkdirs()
    return file
  }

  @ReactMethod
  fun getExportDirectory(promise: Promise) {
    val dir = File(context.cacheDir, "exports")
    dir.mkdirs()
    // Exports are shared immediately; clear ones older than a day.
    val cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000
    dir.listFiles()?.forEach { if (it.lastModified() < cutoff) it.deleteRecursively() }
    promise.resolve(dir.absolutePath)
  }

  @ReactMethod
  fun beginPdf(path: String, widthPt: Double, heightPt: Double, promise: Promise) {
    val id = UUID.randomUUID().toString()
    pdfs[id] = PdfJob(PdfDocument(), path, widthPt.roundToInt(), heightPt.roundToInt())
    promise.resolve(id)
  }

  @ReactMethod
  fun addPdfPage(id: String, viewTag: Double, promise: Promise) {
    val job = pdfs[id] ?: return promise.reject("E_NO_PDF", "Unknown PDF export")
    UiThreadUtil.runOnUiThread {
      try {
        val view = resolveView(viewTag.toInt())
          ?: throw IllegalStateException("Page view not found")
        if (view.width == 0 || view.height == 0) throw IllegalStateException("Page view not laid out")
        job.pages += 1
        val page = job.document.startPage(
          PdfDocument.PageInfo.Builder(job.width, job.height, job.pages).create(),
        )
        val canvas = page.canvas
        canvas.scale(job.width / view.width.toFloat(), job.height / view.height.toFloat())
        view.draw(canvas)
        job.document.finishPage(page)
        promise.resolve(job.pages)
      } catch (e: Exception) {
        promise.reject("E_PDF_PAGE", e.message, e)
      } catch (e: OutOfMemoryError) {
        promise.reject("E_PDF_PAGE", "Not enough memory to draw this page", e)
      }
    }
  }

  @ReactMethod
  fun finishPdf(id: String, promise: Promise) {
    val job = pdfs.remove(id) ?: return promise.reject("E_NO_PDF", "Unknown PDF export")
    io.execute {
      try {
        FileOutputStream(prepareFile(job.path)).use { job.document.writeTo(it) }
        promise.resolve(job.path)
      } catch (e: Exception) {
        promise.reject("E_PDF_WRITE", e.message, e)
      } catch (e: OutOfMemoryError) {
        promise.reject("E_PDF_WRITE", "Not enough memory to write the PDF", e)
      } finally {
        job.document.close()
      }
    }
  }

  @ReactMethod
  fun cancelPdf(id: String) {
    pdfs.remove(id)?.document?.close()
  }

  @ReactMethod
  fun captureView(viewTag: Double, path: String, format: String, pixelWidth: Double, quality: Double, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      var bitmap: Bitmap? = null
      try {
        val view = resolveView(viewTag.toInt())
          ?: throw IllegalStateException("Page view not found")
        if (view.width == 0 || view.height == 0) throw IllegalStateException("Page view not laid out")
        val width = pixelWidth.roundToInt().coerceIn(1, MAX_PIXEL_WIDTH)
        val height = (width * view.height / view.width.toFloat()).roundToInt()
        bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        canvas.scale(width / view.width.toFloat(), height / view.height.toFloat())
        view.draw(canvas)
        val image = bitmap
        bitmap = null
        io.execute {
          try {
            val jpeg = format.equals("jpg", true) || format.equals("jpeg", true)
            FileOutputStream(prepareFile(path)).use {
              image.compress(
                if (jpeg) Bitmap.CompressFormat.JPEG else Bitmap.CompressFormat.PNG,
                (quality * 100).roundToInt().coerceIn(1, 100),
                it,
              )
            }
            promise.resolve(path)
          } catch (e: Exception) {
            promise.reject("E_IMAGE_WRITE", e.message, e)
          } catch (e: OutOfMemoryError) {
            promise.reject("E_IMAGE_WRITE", "Not enough memory to write this image", e)
          } finally {
            image.recycle()
          }
        }
      } catch (e: Exception) {
        bitmap?.recycle()
        promise.reject("E_CAPTURE", e.message, e)
      } catch (e: OutOfMemoryError) {
        // A full-width page bitmap (up to 2480 px wide, ≈ 35 MB) on a low-memory
        // phone: report it, never take the app down from the UI thread.
        bitmap?.recycle()
        promise.reject("E_CAPTURE", "Not enough memory to export this page", e)
      }
    }
  }

  @ReactMethod
  fun share(paths: ReadableArray, mimeType: String, title: String, promise: Promise) {
    try {
      val authority = "${context.packageName}.handwrite.fileprovider"
      val uris = ArrayList<Uri>()
      for (i in 0 until paths.size()) {
        val path = paths.getString(i) ?: continue
        uris.add(FileProvider.getUriForFile(context, authority, File(path)))
      }
      if (uris.isEmpty()) return promise.reject("E_SHARE", "Nothing to share")
      val intent = if (uris.size == 1) {
        Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris[0])
      } else {
        Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
      }
      intent.type = mimeType
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      val clip = ClipData.newUri(context.contentResolver, title, uris[0])
      uris.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
      intent.clipData = clip
      val chooser = Intent.createChooser(intent, title)
      val activity = context.currentActivity
      if (activity != null) {
        activity.startActivity(chooser)
      } else {
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(chooser)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_SHARE", e.message, e)
    }
  }

  override fun invalidate() {
    pdfs.values.forEach { it.document.close() }
    pdfs.clear()
    io.shutdown()
    super.invalidate()
  }
}
