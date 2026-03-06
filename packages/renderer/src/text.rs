use fontdue::{Font, FontSettings};
use tiny_skia::{Color, Pixmap};

static SKETCHY_FONT_BYTES: &[u8] = include_bytes!("../assets/ArchitectsDaughter.ttf");
static CLEAN_FONT_BYTES: &[u8] = include_bytes!("../assets/Nunito.ttf");

fn with_font<R>(sketchy: bool, f: impl FnOnce(&Font) -> R) -> R {
    thread_local! {
        static SKETCHY: Font = Font::from_bytes(
            SKETCHY_FONT_BYTES,
            FontSettings::default(),
        ).expect("Failed to load sketchy font");
        static CLEAN: Font = Font::from_bytes(
            CLEAN_FONT_BYTES,
            FontSettings::default(),
        ).expect("Failed to load clean font");
    }
    if sketchy {
        SKETCHY.with(f)
    } else {
        CLEAN.with(f)
    }
}

/// Measure text width and height at a given font size.
pub fn measure_text(text: &str, font_size: f32, sketchy: bool) -> (f32, f32) {
    with_font(sketchy, |font| {
        let mut width = 0.0f32;
        let mut max_height = 0.0f32;
        for ch in text.chars() {
            let metrics = font.metrics(ch, font_size);
            width += metrics.advance_width;
            max_height = max_height.max(metrics.height as f32);
        }
        (width, max_height.max(font_size))
    })
}

/// Render text glyphs onto a pixmap at the given position.
pub fn render_text(
    pixmap: &mut Pixmap,
    text: &str,
    x: f32,
    y: f32,
    font_size: f32,
    color: Color,
    sketchy: bool,
) {
    with_font(sketchy, |font| {
        let mut cursor_x = x;
        let ascent = font_size * 0.8; // approximate ascent

        for ch in text.chars() {
            let (metrics, bitmap) = font.rasterize(ch, font_size);

            let gx = cursor_x + metrics.xmin as f32;
            let gy = y + ascent - metrics.height as f32 - metrics.ymin as f32;

            // Blit glyph bitmap onto pixmap
            for row in 0..metrics.height {
                for col in 0..metrics.width {
                    let alpha = bitmap[row * metrics.width + col];
                    if alpha == 0 {
                        continue;
                    }
                    let px = (gx + col as f32) as i32;
                    let py = (gy + row as f32) as i32;
                    if px < 0
                        || py < 0
                        || px >= pixmap.width() as i32
                        || py >= pixmap.height() as i32
                    {
                        continue;
                    }
                    let idx =
                        (py as usize * pixmap.width() as usize + px as usize) * 4;
                    let data = pixmap.data_mut();
                    let a = alpha as f32 / 255.0 * color.alpha();
                    let inv_a = 1.0 - a;
                    // Premultiplied alpha blending
                    data[idx] = (color.red() * a * 255.0 + data[idx] as f32 * inv_a) as u8;
                    data[idx + 1] =
                        (color.green() * a * 255.0 + data[idx + 1] as f32 * inv_a) as u8;
                    data[idx + 2] =
                        (color.blue() * a * 255.0 + data[idx + 2] as f32 * inv_a) as u8;
                    data[idx + 3] =
                        ((a + data[idx + 3] as f32 / 255.0 * inv_a) * 255.0) as u8;
                }
            }
            cursor_x += metrics.advance_width;
        }
    });
}
