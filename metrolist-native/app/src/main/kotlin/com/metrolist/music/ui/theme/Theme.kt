/**
 * Metrolist Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.metrolist.music.ui.theme

import android.graphics.Bitmap
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.SaverScope
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.palette.graphics.Palette
import com.materialkolor.PaletteStyle
import com.materialkolor.dynamiccolor.ColorSpec
import com.materialkolor.rememberDynamicColorScheme
import com.materialkolor.score.Score

val DefaultThemeColor = Color(0xFFE50914)

// Maxen Cinema Design Tokens
val MaxenBackground = Color(0xFF0B0B0B)
val MaxenCard = Color(0xFF1A1A1A)
val MaxenSurfaceContainer = Color(0xFF141414)
val MaxenBorder = Color(0xFF2A2A2A)
val MaxenTextMuted = Color(0xFFA3A3A3)

@Composable
fun MetrolistTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    pureBlack: Boolean = false,
    themeColor: Color = DefaultThemeColor,
    content: @Composable () -> Unit,
) {
    // Generate dynamic color scheme with seed color
    val baseColorScheme = rememberDynamicColorScheme(
        seedColor = themeColor,
        isDark = darkTheme,
        specVersion = ColorSpec.SpecVersion.SPEC_2025,
        style = PaletteStyle.TonalSpot
    )

    // Apply Maxen cinema dark theme & pureBlack modification
    val colorScheme = remember(baseColorScheme, pureBlack, darkTheme, themeColor) {
        if (darkTheme) {
            val cinemaTheme = baseColorScheme.copy(
                primary = themeColor,
                background = if (pureBlack) Color.Black else MaxenBackground,
                surface = if (pureBlack) Color.Black else MaxenBackground,
                surfaceContainer = if (pureBlack) Color(0xFF101010) else MaxenSurfaceContainer,
                surfaceContainerLow = if (pureBlack) Color(0xFF0A0A0A) else Color(0xFF0F0F0F),
                surfaceContainerHigh = if (pureBlack) Color(0xFF161616) else MaxenCard,
                surfaceContainerHighest = if (pureBlack) Color(0xFF1E1E1E) else Color(0xFF222222),
                surfaceBright = if (pureBlack) Color(0xFF242424) else Color(0xFF2A2A2A),
                outline = MaxenBorder,
                outlineVariant = Color(0x1AFFFFFF),
                onBackground = Color.White,
                onSurface = Color.White,
                onSurfaceVariant = MaxenTextMuted,
            )
            if (pureBlack) cinemaTheme.pureBlack(true) else cinemaTheme
        } else {
            baseColorScheme
        }
    }

    // Use standard MaterialTheme instead of MaterialExpressiveTheme
    MaterialTheme(
        colorScheme = colorScheme,
        content = content,
    )
}

fun Bitmap.extractThemeColor(): Color = Color(
    Palette.from(this)
        .maximumColorCount(8)
        .generate()
        .rankedColors(1, DefaultThemeColor.toArgb())
        .first()
)

internal fun Palette.rankedColors(
    desiredColorCount: Int,
    fallbackColor: Int,
): List<Int> = Score.score(
    swatches.associate { it.rgb to it.population },
    desiredColorCount,
    fallbackColor,
    true,
)

fun ColorScheme.pureBlack(apply: Boolean) =
    if (apply) copy(
        surface = Color.Black,
        background = Color.Black
    ) else this

val ColorSaver = object : Saver<Color, Int> {
    override fun restore(value: Int): Color = Color(value)
    override fun SaverScope.save(value: Color): Int = value.toArgb()
}
