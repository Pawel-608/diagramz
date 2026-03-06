use tiny_skia::{
    Color, FillRule, Paint, PathBuilder, Pixmap, Stroke, Transform, LineCap,
    StrokeDash,
};
use wasm_bindgen::prelude::*;

use crate::text;

/// WASM Canvas API — wraps a tiny-skia Pixmap and provides primitive drawing operations.
///
/// Path format: Float64Array with commands:
///   [0, x, y]                         = MoveTo
///   [1, x, y]                         = LineTo
///   [2, x1, y1, x2, y2, x, y]        = CubicTo
///   [3]                               = Close
///
/// Color format: u32 = 0xRRGGBBAA
#[wasm_bindgen]
pub struct Canvas {
    pixmap: Pixmap,
}

fn color_from_u32(c: u32) -> Color {
    Color::from_rgba8(
        ((c >> 24) & 0xFF) as u8,
        ((c >> 16) & 0xFF) as u8,
        ((c >> 8) & 0xFF) as u8,
        (c & 0xFF) as u8,
    )
}

fn parse_path(segs: &[f64]) -> Option<tiny_skia::Path> {
    let mut pb = PathBuilder::new();
    let mut i = 0;
    while i < segs.len() {
        let cmd = segs[i] as u32;
        match cmd {
            0 => {
                if i + 2 >= segs.len() { break; }
                pb.move_to(segs[i + 1] as f32, segs[i + 2] as f32);
                i += 3;
            }
            1 => {
                if i + 2 >= segs.len() { break; }
                pb.line_to(segs[i + 1] as f32, segs[i + 2] as f32);
                i += 3;
            }
            2 => {
                if i + 6 >= segs.len() { break; }
                pb.cubic_to(
                    segs[i + 1] as f32, segs[i + 2] as f32,
                    segs[i + 3] as f32, segs[i + 4] as f32,
                    segs[i + 5] as f32, segs[i + 6] as f32,
                );
                i += 7;
            }
            3 => {
                pb.close();
                i += 1;
            }
            _ => { i += 1; }
        }
    }
    pb.finish()
}

#[wasm_bindgen]
impl Canvas {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> Result<Canvas, JsValue> {
        let pixmap = Pixmap::new(width, height)
            .ok_or_else(|| JsValue::from_str("Failed to create pixmap"))?;
        Ok(Canvas { pixmap })
    }

    pub fn clear(&mut self, color: u32) {
        self.pixmap.fill(color_from_u32(color));
    }

    #[wasm_bindgen(js_name = fillPath)]
    pub fn fill_path(&mut self, segs: &[f64], color: u32) {
        let path = match parse_path(segs) {
            Some(p) => p,
            None => return,
        };
        let mut paint = Paint::default();
        paint.set_color(color_from_u32(color));
        paint.anti_alias = true;
        self.pixmap.fill_path(&path, &paint, FillRule::Winding, Transform::identity(), None);
    }

    #[wasm_bindgen(js_name = strokePath)]
    pub fn stroke_path(&mut self, segs: &[f64], color: u32, width: f32) {
        let path = match parse_path(segs) {
            Some(p) => p,
            None => return,
        };
        let mut paint = Paint::default();
        paint.set_color(color_from_u32(color));
        paint.anti_alias = true;
        let mut stroke = Stroke::default();
        stroke.width = width;
        stroke.line_cap = LineCap::Round;
        self.pixmap.stroke_path(&path, &paint, &stroke, Transform::identity(), None);
    }

    #[wasm_bindgen(js_name = strokePathDashed)]
    pub fn stroke_path_dashed(&mut self, segs: &[f64], color: u32, width: f32, dash_len: f32) {
        let path = match parse_path(segs) {
            Some(p) => p,
            None => return,
        };
        let mut paint = Paint::default();
        paint.set_color(color_from_u32(color));
        paint.anti_alias = true;
        let mut stroke = Stroke::default();
        stroke.width = width;
        stroke.line_cap = LineCap::Round;
        stroke.dash = StrokeDash::new(vec![dash_len, dash_len], 0.0);
        self.pixmap.stroke_path(&path, &paint, &stroke, Transform::identity(), None);
    }

    #[wasm_bindgen(js_name = drawText)]
    pub fn draw_text(&mut self, txt: &str, x: f32, y: f32, size: f32, color: u32, font: u32) {
        text::render_text(&mut self.pixmap, txt, x, y, size, color, font);
    }

    #[wasm_bindgen(js_name = measureText)]
    pub fn measure_text(&self, txt: &str, size: f32, font: u32) -> Vec<f32> {
        let (w, h) = text::measure_text(txt, size, font);
        vec![w, h]
    }

    #[wasm_bindgen(js_name = toPng)]
    pub fn to_png(&self) -> Vec<u8> {
        self.pixmap.encode_png().unwrap_or_default()
    }

    #[wasm_bindgen(js_name = toImageData)]
    pub fn to_image_data(&self) -> Vec<u8> {
        self.pixmap.data().to_vec()
    }

    pub fn width(&self) -> u32 {
        self.pixmap.width()
    }

    pub fn height(&self) -> u32 {
        self.pixmap.height()
    }
}
