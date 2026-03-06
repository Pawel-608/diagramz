use fontdue::{Font, FontSettings};
use tiny_skia::Pixmap;

static SKETCHY_FONT_BYTES: &[u8] = include_bytes!("../assets/ArchitectsDaughter.ttf");
static CLEAN_FONT_BYTES: &[u8] = include_bytes!("../assets/Nunito-Bold.ttf");

fn with_font<R>(font_id: u32, f: impl FnOnce(&Font) -> R) -> R {
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
    if font_id == 0 {
        SKETCHY.with(f)
    } else {
        CLEAN.with(f)
    }
}

pub fn measure_text(text: &str, font_size: f32, font_id: u32) -> (f32, f32) {
    with_font(font_id, |font| {
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

pub fn render_text(
    pixmap: &mut Pixmap,
    text: &str,
    center_x: f32,
    center_y: f32,
    font_size: f32,
    color: u32,
    font_id: u32,
) {
    let (tw, _th) = measure_text(text, font_size, font_id);
    let x = center_x - tw / 2.0;
    let y = center_y - font_size / 2.0;

    let r = ((color >> 24) & 0xFF) as f32 / 255.0;
    let g = ((color >> 16) & 0xFF) as f32 / 255.0;
    let b = ((color >> 8) & 0xFF) as f32 / 255.0;
    let a = (color & 0xFF) as f32 / 255.0;

    with_font(font_id, |font| {
        let mut cursor_x = x;
        let ascent = font_size * 0.8;

        for ch in text.chars() {
            let (metrics, bitmap) = font.rasterize(ch, font_size);
            let gx = cursor_x + metrics.xmin as f32;
            let gy = y + ascent - metrics.height as f32 - metrics.ymin as f32;

            for row in 0..metrics.height {
                for col in 0..metrics.width {
                    let alpha = bitmap[row * metrics.width + col];
                    if alpha == 0 {
                        continue;
                    }
                    let px = (gx + col as f32) as i32;
                    let py = (gy + row as f32) as i32;
                    if px < 0 || py < 0 || px >= pixmap.width() as i32 || py >= pixmap.height() as i32 {
                        continue;
                    }
                    let idx = (py as usize * pixmap.width() as usize + px as usize) * 4;
                    let data = pixmap.data_mut();
                    let ga = alpha as f32 / 255.0 * a;
                    let inv_a = 1.0 - ga;
                    data[idx] = (r * ga * 255.0 + data[idx] as f32 * inv_a) as u8;
                    data[idx + 1] = (g * ga * 255.0 + data[idx + 1] as f32 * inv_a) as u8;
                    data[idx + 2] = (b * ga * 255.0 + data[idx + 2] as f32 * inv_a) as u8;
                    data[idx + 3] = ((ga + data[idx + 3] as f32 / 255.0 * inv_a) * 255.0) as u8;
                }
            }
            cursor_x += metrics.advance_width;
        }
    });
}
