package com.jplearn.pocnative

import android.graphics.Matrix
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.graphics.withSave
import androidx.ink.authoring.compose.InProgressStrokes
import androidx.ink.brush.Brush
import androidx.ink.brush.BrushBehavior
import androidx.ink.brush.BrushFamily
import androidx.ink.brush.BrushTip
import androidx.ink.brush.ExperimentalInkCustomBrushApi
import androidx.ink.brush.InputToolType
import androidx.ink.brush.compose.createWithComposeColor
import androidx.ink.rendering.android.canvas.CanvasStrokeRenderer
import androidx.ink.strokes.Stroke
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    InkPocScreen()
                }
            }
        }
    }
}

// StockBrushes.pressurePen() *does* map pressure to size, but only for
// InputToolType.STYLUS and only across a narrow 0.8-1.0 pressure band (up to
// 1.5x) — below that it's clamped flat, so ordinary writing pressure often
// never crosses the threshold and the brush reads as pressure-insensitive.
// This PoC is specifically testing "does pressure feel responsive," so every
// preset below defines its own explicit behavior instead of relying on that
// tuning, with every tool type enabled (so a tool-type misclassification
// can't silently disable it either).

private data class WidthPreset(val label: String, val minWidthDp: Float, val maxWidthDp: Float)

// Ratios mirror the web PoC's presets so the two stay comparable. Width at
// zero pressure is minWidthDp, width at full pressure is maxWidthDp.
// "Calligraphy" pushes toward the brush-pen feel (hairline to bold) rather
// than a subtle pressure nuance.
private val WidthPresets = listOf(
    WidthPreset("Subtle", minWidthDp = 2f, maxWidthDp = 5f),
    WidthPreset("Expressive", minWidthDp = 1.5f, maxWidthDp = 9f),
    WidthPreset("Calligraphy", minWidthDp = 0.75f, maxWidthDp = 18f),
)

// Fixed base size, matching the config already confirmed to respond well to
// pressure. Presets vary only the multiplier range on top of this base
// (rather than also shrinking `size` itself) — the tip's other geometry
// params (cornerRounding, particleGapDistanceScale, etc.) were only tuned
// against this base, and varying size and multiplier range together turned
// out to make the smaller-size presets barely respond at all.
private const val BASE_SIZE_DP = 4f

// The flat BrushBehavior(...)/BrushTip(...) constructors are present in the
// compiled library for binary compatibility, but BrushBehavior's flat form
// is not resolvable from Kotlin source (it routes to a private native
// constructor) — the Builder is the real public entry point for it.
@OptIn(ExperimentalInkCustomBrushApi::class)
private fun brushForPreset(preset: WidthPreset): Brush {
    val behavior = BrushBehavior.Builder()
        .setSource(BrushBehavior.Source.NORMALIZED_PRESSURE)
        .setTarget(BrushBehavior.Target.SIZE_MULTIPLIER)
        .setSourceValueRangeStart(0f)
        .setSourceValueRangeEnd(1f)
        // at pressure 0 -> width = BASE_SIZE_DP * start = minWidthDp
        .setTargetModifierRangeStart(preset.minWidthDp / BASE_SIZE_DP)
        // at pressure 1 -> width = BASE_SIZE_DP * end = maxWidthDp
        .setTargetModifierRangeEnd(preset.maxWidthDp / BASE_SIZE_DP)
        .setSourceOutOfRangeBehavior(BrushBehavior.OutOfRange.CLAMP)
        // Was 20L. That's a smoothing/easing lag on how fast size catches up
        // to a pressure change — the web PoC has no such damping (width comes
        // straight from the current frame's pressure), which was the likely
        // reason native's felt range was softer even with an identical
        // configured min/max. Near-zero removes that lag as a test.
        .setResponseTimeMillis(1L)
        .setEnabledToolTypes(
            setOf(
                InputToolType.STYLUS,
                InputToolType.TOUCH,
                InputToolType.MOUSE,
                InputToolType.UNKNOWN,
            )
        )
        .build()

    val tip = BrushTip(
        scaleX = 1f,
        scaleY = 1f,
        cornerRounding = 1f,
        slantDegrees = 0f,
        pinch = 0f,
        rotationDegrees = 0f,
        particleGapDistanceScale = 0f,
        particleGapDurationMillis = 0L,
        behaviors = listOf(behavior),
    )

    // epsilon 0.1 keeps stroke simplification light so kana shape detail
    // survives, matching the addendum's "capture real recall" goal.
    return Brush.createWithComposeColor(
        family = BrushFamily(tip = tip),
        color = Color(0xFF1A1A1A),
        size = BASE_SIZE_DP,
        epsilon = 0.1f,
    )
}

@Composable
private fun InkPocScreen() {
    var finishedStrokes by remember { mutableStateOf(emptyList<Stroke>()) }
    var selectedPreset by remember { mutableStateOf(WidthPresets[1]) }
    val canvasStrokeRenderer = remember { CanvasStrokeRenderer.create() }
    // Only the *next* stroke picks up a preset change — recomputing this per
    // recomposition keeps that simple without needing to touch InProgressStrokes'
    // internal state.
    val brush = remember(selectedPreset) { brushForPreset(selectedPreset) }

    val context = LocalContext.current
    val db = remember { StrokeDatabase.get(context) }
    val scope = rememberCoroutineScope()

    // Load whatever was saved from a previous session, once, on first composition.
    LaunchedEffect(Unit) {
        finishedStrokes = db.strokeDao().getAll().map { it.toStroke() }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        GenkouyoushiGrid(modifier = Modifier.fillMaxSize())

        // Dry layer: strokes that have already finished, redrawn on every recomposition.
        Canvas(modifier = Modifier.fillMaxSize()) {
            val canvas = drawContext.canvas.nativeCanvas
            canvas.withSave {
                finishedStrokes.forEach { stroke ->
                    canvasStrokeRenderer.draw(
                        stroke = stroke,
                        canvas = this,
                        strokeToScreenTransform = Matrix(),
                    )
                }
            }
        }

        // Wet layer: the in-progress stroke, rendered by Ink's own low-latency path.
        // InProgressStrokes doesn't hot-swap a changed brush/family on its own —
        // Cahier's own sample wraps it in key(...) for exactly this reason — so
        // force recreation when the preset (and therefore the brush family)
        // changes, rather than relying on nextBrush alone.
        key(selectedPreset) {
            InProgressStrokes(
                defaultBrush = brush,
                nextBrush = { brush },
                onStrokesFinished = { newlyFinished ->
                    finishedStrokes = finishedStrokes + newlyFinished
                    scope.launch {
                        newlyFinished.forEach { db.strokeDao().insert(it.toEntity()) }
                    }
                },
            )
        }

        Row(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(16.dp),
        ) {
            WidthPresets.forEach { preset ->
                Button(
                    onClick = { selectedPreset = preset },
                    colors = if (preset == selectedPreset) {
                        ButtonDefaults.buttonColors()
                    } else {
                        ButtonDefaults.outlinedButtonColors()
                    },
                    modifier = Modifier.padding(end = 8.dp),
                ) {
                    Text(preset.label)
                }
            }
        }

        Button(
            onClick = {
                finishedStrokes = emptyList()
                scope.launch { db.strokeDao().deleteAll() }
            },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(16.dp),
        ) {
            Text("Clear")
        }
    }
}

@Composable
private fun GenkouyoushiGrid(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.background(Color(0xFFF7F5F0))) {
        val cellSize = 90.dp.toPx()
        val cols = (size.width / cellSize).toInt() + 1
        val rows = (size.height / cellSize).toInt() + 1
        val offsetX = (size.width - cols * cellSize) / 2f
        val offsetY = (size.height - rows * cellSize) / 2f
        val lineColor = Color.Black.copy(alpha = 0.16f)
        val crossColor = Color.Black.copy(alpha = 0.07f)

        for (c in 0..cols) {
            val x = offsetX + c * cellSize
            drawLine(lineColor, Offset(x, 0f), Offset(x, size.height), strokeWidth = 1f)
        }
        for (r in 0..rows) {
            val y = offsetY + r * cellSize
            drawLine(lineColor, Offset(0f, y), Offset(size.width, y), strokeWidth = 1f)
        }

        // Faint center cross per cell, genkouyoushi-style — helps judge character proportion.
        val crossSize = cellSize * 0.12f
        for (c in 0 until cols) {
            for (r in 0 until rows) {
                val cx = offsetX + c * cellSize + cellSize / 2f
                val cy = offsetY + r * cellSize + cellSize / 2f
                drawLine(
                    crossColor, Offset(cx - crossSize, cy), Offset(cx + crossSize, cy),
                    strokeWidth = 1f, cap = StrokeCap.Round,
                )
                drawLine(
                    crossColor, Offset(cx, cy - crossSize), Offset(cx, cy + crossSize),
                    strokeWidth = 1f, cap = StrokeCap.Round,
                )
            }
        }
    }
}
