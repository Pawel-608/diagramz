use std::collections::HashMap;

use tiny_skia::{Color, FillRule, LineCap, LineJoin, Paint, PathBuilder, Pixmap, Stroke, Transform};

use crate::connections::{
    arrowhead_points, connection_label_pos, element_connection_point,
};
use crate::defaults::{resolve_connection_style, resolve_element_style};
use crate::rough::{self, Rng};
use crate::text;
use crate::types::{ConnectionType, Diagram, ElementType};

/// Rendering options.
#[derive(Debug, Clone)]
pub struct RenderOptions {
    pub sketchy: bool,
    pub roughness: f32,
    pub bowing: f32,
    pub hachure_angle: f32,
    pub hachure_gap: f32,
    pub background: Color,
    pub padding: f64,
}

impl Default for RenderOptions {
    fn default() -> Self {
        Self {
            sketchy: true,
            roughness: 1.5,
            bowing: 1.0,
            hachure_angle: -41.0,
            hachure_gap: 8.0,
            background: Color::WHITE,
            padding: 60.0,
        }
    }
}

/// Camera for viewport transform.
#[derive(Debug, Clone, Copy)]
pub struct Camera {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
        }
    }
}

fn parse_hex_color(hex: &str) -> Color {
    let hex = hex.trim_start_matches('#');
    if hex.len() < 6 {
        return Color::BLACK;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
    Color::from_rgba8(r, g, b, 255)
}

fn make_paint(color: Color, opacity: f32) -> Paint<'static> {
    let mut paint = Paint::default();
    paint.set_color(
        Color::from_rgba(color.red(), color.green(), color.blue(), opacity).unwrap_or(color),
    );
    paint.anti_alias = true;
    paint
}

/// Render a diagram to RGBA pixels.
pub fn render_diagram(
    diagram: &Diagram,
    camera: &Camera,
    vp_w: u32,
    vp_h: u32,
    options: &RenderOptions,
) -> Vec<u8> {
    let mut pixmap = match Pixmap::new(vp_w, vp_h) {
        Some(p) => p,
        None => return vec![255; (vp_w * vp_h * 4) as usize],
    };
    pixmap.fill(options.background);

    let zoom = camera.zoom as f32;
    let cam_x = camera.x as f32;
    let cam_y = camera.y as f32;
    let roughness = options.roughness;
    let bowing = options.bowing;

    let mut rng = Rng::new(42);

    // Build element lookup
    let el_map: HashMap<&str, _> = diagram
        .elements
        .iter()
        .map(|el| (el.id.as_str(), el))
        .collect();

    // Draw connections (behind shapes)
    for conn in &diagram.connections {
        let from_el = match el_map.get(conn.from_id.as_str()) {
            Some(el) => el,
            None => continue,
        };
        let to_el = match el_map.get(conn.to_id.as_str()) {
            Some(el) => el,
            None => continue,
        };

        let from_center = (
            from_el.x.unwrap_or(0.0) + from_el.width.unwrap_or(120.0) / 2.0,
            from_el.y.unwrap_or(0.0) + from_el.height.unwrap_or(60.0) / 2.0,
        );
        let to_center = (
            to_el.x.unwrap_or(0.0) + to_el.width.unwrap_or(120.0) / 2.0,
            to_el.y.unwrap_or(0.0) + to_el.height.unwrap_or(60.0) / 2.0,
        );

        let from_pt = element_connection_point(from_el, conn.from_anchor, to_center);
        let to_pt = element_connection_point(to_el, conn.to_anchor, from_center);

        let cs = resolve_connection_style(conn.style.as_ref());
        let color = parse_hex_color(cs.stroke_color);
        let paint = make_paint(color, 1.0);
        let mut stroke = Stroke {
            width: cs.stroke_width * zoom,
            line_cap: LineCap::Round,
            line_join: LineJoin::Round,
            ..Stroke::default()
        };
        if let Some(dash) = cs.stroke_dash {
            if dash.len() >= 2 {
                let scaled: Vec<f32> = dash.iter().map(|d| d * zoom).collect();
                stroke.dash = tiny_skia::StrokeDash::new(scaled, 0.0);
            }
        }

        let sx = (from_pt.0 as f32 - cam_x) * zoom;
        let sy = (from_pt.1 as f32 - cam_y) * zoom;
        let ex = (to_pt.0 as f32 - cam_x) * zoom;
        let ey = (to_pt.1 as f32 - cam_y) * zoom;

        if options.sketchy {
            rough::rough_line(
                &mut pixmap,
                sx, sy, ex, ey,
                &paint, &stroke,
                roughness, bowing,
                &mut rng,
            );
        } else {
            let mut pb = PathBuilder::new();
            pb.move_to(sx, sy);
            pb.line_to(ex, ey);
            if let Some(path) = pb.finish() {
                pixmap.stroke_path(&path, &paint, &stroke, Transform::identity(), None);
            }
        }

        // Arrowhead — two sketchy lines forming an open chevron
        if conn.connection_type == ConnectionType::Arrow {
            let arr_size = 12.0;
            let pts = arrowhead_points(to_pt.0, to_pt.1, from_pt.0, from_pt.1, arr_size);
            // pts[0] = tip, pts[1] = left wing, pts[2] = right wing
            let tip = ((pts[0].0 as f32 - cam_x) * zoom, (pts[0].1 as f32 - cam_y) * zoom);
            let left = ((pts[1].0 as f32 - cam_x) * zoom, (pts[1].1 as f32 - cam_y) * zoom);
            let right = ((pts[2].0 as f32 - cam_x) * zoom, (pts[2].1 as f32 - cam_y) * zoom);

            let arr_stroke = Stroke { width: cs.stroke_width * zoom, line_cap: LineCap::Round, line_join: LineJoin::Round, ..Stroke::default() };
            if options.sketchy {
                rough::rough_line(&mut pixmap, left.0, left.1, tip.0, tip.1, &paint, &arr_stroke, roughness, bowing, &mut rng);
                rough::rough_line(&mut pixmap, right.0, right.1, tip.0, tip.1, &paint, &arr_stroke, roughness, bowing, &mut rng);
            } else {
                let mut pb = PathBuilder::new();
                pb.move_to(left.0, left.1);
                pb.line_to(tip.0, tip.1);
                pb.line_to(right.0, right.1);
                if let Some(path) = pb.finish() {
                    pixmap.stroke_path(&path, &paint, &arr_stroke, Transform::identity(), None);
                }
            }
        }

        // Connection label
        if let Some(ref label) = conn.label {
            let mid = connection_label_pos(from_pt, to_pt);
            let mx = (mid.0 as f32 - cam_x) * zoom;
            let my = (mid.1 as f32 - cam_y) * zoom;
            let fs = 14.0 * zoom;
            let (tw, _th) = text::measure_text(label, fs, options.sketchy);
            let bg_paint = make_paint(Color::WHITE, 0.85);
            let bg_pad = 4.0 * zoom;
            if let Some(rect) = tiny_skia::Rect::from_xywh(
                mx - tw / 2.0 - bg_pad,
                my - fs / 2.0 - bg_pad,
                tw + bg_pad * 2.0,
                fs + bg_pad * 2.0,
            ) {
                let mut bg_pb = PathBuilder::new();
                bg_pb.push_rect(rect);
                if let Some(path) = bg_pb.finish() {
                    pixmap.fill_path(
                        &path,
                        &bg_paint,
                        FillRule::Winding,
                        Transform::identity(),
                        None,
                    );
                }
            }
            text::render_text(
                &mut pixmap,
                label,
                mx - tw / 2.0,
                my - fs / 2.0,
                fs,
                Color::from_rgba8(30, 30, 30, 255),
                options.sketchy,
            );
        }
    }

    // Draw elements
    for el in &diagram.elements {
        let es = resolve_element_style(el.style.as_ref());
        let stroke_color = parse_hex_color(es.stroke_color);
        let fill_color = parse_hex_color(es.fill_color);
        let stroke_paint = make_paint(stroke_color, es.opacity);
        let fill_paint = make_paint(fill_color, es.opacity);
        let stroke = Stroke {
            width: es.stroke_width * zoom,
            line_cap: LineCap::Round,
            line_join: LineJoin::Round,
            ..Stroke::default()
        };
        let hachure_stroke = Stroke {
            width: (es.stroke_width * 0.5 * zoom).max(0.5),
            line_cap: LineCap::Round,
            ..Stroke::default()
        };

        let ex = (el.x.unwrap_or(0.0) as f32 - cam_x) * zoom;
        let ey = (el.y.unwrap_or(0.0) as f32 - cam_y) * zoom;
        let ew = el.width.unwrap_or(120.0) as f32 * zoom;
        let eh = el.height.unwrap_or(60.0) as f32 * zoom;

        match el.element_type {
            ElementType::Rectangle => {
                if options.sketchy {
                    // Rough fill (slightly jittered solid background)
                    rough::rough_fill_rect(
                        &mut pixmap, ex, ey, ew, eh,
                        &fill_paint, roughness, &mut rng,
                    );
                    // Hachure fill for non-white fills
                    if es.fill_color != "#ffffff" && es.fill_color != "#fff" {
                        let hachure_paint = make_paint(stroke_color, es.opacity * 0.4);
                        rough::hachure_fill_rect(
                            &mut pixmap, ex, ey, ew, eh,
                            &hachure_paint, &hachure_stroke,
                            options.hachure_gap * zoom,
                            options.hachure_angle,
                            roughness, &mut rng,
                        );
                    }
                    // Rough outline
                    rough::rough_rect(
                        &mut pixmap, ex, ey, ew, eh,
                        &stroke_paint, &stroke,
                        roughness, bowing, &mut rng,
                    );
                } else {
                    if let Some(rect) = tiny_skia::Rect::from_xywh(ex, ey, ew, eh) {
                        let mut pb = PathBuilder::new();
                        pb.push_rect(rect);
                        if let Some(path) = pb.finish() {
                            pixmap.fill_path(&path, &fill_paint, FillRule::Winding, Transform::identity(), None);
                            pixmap.stroke_path(&path, &stroke_paint, &stroke, Transform::identity(), None);
                        }
                    }
                }
            }
            ElementType::Ellipse => {
                let cx = ex + ew / 2.0;
                let cy = ey + eh / 2.0;
                let rx = ew / 2.0;
                let ry = eh / 2.0;

                if options.sketchy {
                    // Rough fill
                    rough::rough_fill_ellipse(
                        &mut pixmap, cx, cy, rx, ry,
                        &fill_paint, roughness, &mut rng,
                    );
                    // Hachure fill for non-white fills
                    if es.fill_color != "#ffffff" && es.fill_color != "#fff" {
                        let hachure_paint = make_paint(stroke_color, es.opacity * 0.4);
                        rough::hachure_fill_ellipse(
                            &mut pixmap, cx, cy, rx, ry,
                            &hachure_paint, &hachure_stroke,
                            options.hachure_gap * zoom,
                            options.hachure_angle,
                            roughness, &mut rng,
                        );
                    }
                    // Rough outline
                    rough::rough_ellipse(
                        &mut pixmap, cx, cy, rx, ry,
                        &stroke_paint, &stroke,
                        roughness, &mut rng,
                    );
                } else {
                    let mut pb = PathBuilder::new();
                    let steps = 64;
                    for i in 0..=steps {
                        let t = (i as f32 / steps as f32) * std::f32::consts::TAU;
                        let px = cx + rx * t.cos();
                        let py = cy + ry * t.sin();
                        if i == 0 { pb.move_to(px, py); } else { pb.line_to(px, py); }
                    }
                    pb.close();
                    if let Some(path) = pb.finish() {
                        pixmap.fill_path(&path, &fill_paint, FillRule::Winding, Transform::identity(), None);
                        pixmap.stroke_path(&path, &stroke_paint, &stroke, Transform::identity(), None);
                    }
                }
            }
            ElementType::Diamond => {
                let cx = ex + ew / 2.0;
                let cy = ey + eh / 2.0;
                let points = [(cx, ey), (ex + ew, cy), (cx, ey + eh), (ex, cy)];

                if options.sketchy {
                    // Rough fill
                    {
                        let mut pb = PathBuilder::new();
                        for (i, &(px, py)) in points.iter().enumerate() {
                            if i == 0 { pb.move_to(px, py); } else { pb.line_to(px, py); }
                        }
                        pb.close();
                        if let Some(path) = pb.finish() {
                            pixmap.fill_path(&path, &fill_paint, FillRule::Winding, Transform::identity(), None);
                        }
                    }
                    // Hachure fill for non-white fills
                    if es.fill_color != "#ffffff" && es.fill_color != "#fff" {
                        let hachure_paint = make_paint(stroke_color, es.opacity * 0.4);
                        rough::hachure_fill_polygon(
                            &mut pixmap, &points,
                            &hachure_paint, &hachure_stroke,
                            options.hachure_gap * zoom,
                            options.hachure_angle,
                            roughness, &mut rng,
                        );
                    }
                    // Rough outline
                    let f32_points: Vec<(f32, f32)> = points.to_vec();
                    rough::rough_polygon(
                        &mut pixmap, &f32_points,
                        &stroke_paint, &stroke,
                        roughness, bowing, &mut rng,
                    );
                } else {
                    let mut pb = PathBuilder::new();
                    for (i, &(px, py)) in points.iter().enumerate() {
                        if i == 0 { pb.move_to(px, py); } else { pb.line_to(px, py); }
                    }
                    pb.close();
                    if let Some(path) = pb.finish() {
                        pixmap.fill_path(&path, &fill_paint, FillRule::Winding, Transform::identity(), None);
                        pixmap.stroke_path(&path, &stroke_paint, &stroke, Transform::identity(), None);
                    }
                }
            }
            ElementType::Text => {
                // Text-only element: no shape, just text
            }
        }

        // Label and body
        let has_body = el.body.as_ref().map_or(false, |b| !b.is_empty());
        if has_body {
            let font_size = es.font_size * zoom;
            let body_font_size = (es.font_size - 2.0) * zoom;
            let padding = font_size * 0.5;
            let header_h = font_size * 2.5;

            // Header label (centered)
            if let Some(ref label) = el.label {
                let (tw, _th) = text::measure_text(label, font_size, options.sketchy);
                let tx = ex + (ew - tw) / 2.0;
                let ty = ey + (header_h - font_size) / 2.0;
                text::render_text(&mut pixmap, label, tx, ty, font_size, stroke_color, options.sketchy);
            }

            // Divider line
            let div_y = ey + header_h;
            if options.sketchy {
                let div_stroke = Stroke { width: es.stroke_width * zoom, line_cap: LineCap::Round, ..Stroke::default() };
                rough::rough_line(
                    &mut pixmap, ex, div_y, ex + ew, div_y,
                    &stroke_paint, &div_stroke,
                    roughness * 0.5, bowing * 0.5, &mut rng,
                );
            } else {
                let mut pb = PathBuilder::new();
                pb.move_to(ex, div_y);
                pb.line_to(ex + ew, div_y);
                if let Some(path) = pb.finish() {
                    let div_stroke = Stroke { width: es.stroke_width * zoom, ..Stroke::default() };
                    pixmap.stroke_path(&path, &stroke_paint, &div_stroke, Transform::identity(), None);
                }
            }

            // Body items (left-aligned)
            if let Some(ref body) = el.body {
                let line_height = body_font_size * 1.5;
                let mut cy = div_y + padding * 0.8;
                for item in body {
                    let tx = ex + padding;
                    text::render_text(&mut pixmap, item, tx, cy, body_font_size, stroke_color, options.sketchy);
                    cy += line_height;
                }
            }
        } else if let Some(ref label) = el.label {
            let font_size = es.font_size * zoom;
            let (tw, _th) = text::measure_text(label, font_size, options.sketchy);
            let tx = ex + (ew - tw) / 2.0;
            let ty = ey + (eh - font_size) / 2.0;
            text::render_text(&mut pixmap, label, tx, ty, font_size, stroke_color, options.sketchy);
        }
    }

    pixmap.data().to_vec()
}

/// Render diagram and auto-compute bounds, returning RGBA pixels, width, height.
pub fn render_diagram_auto(diagram: &Diagram, options: &RenderOptions) -> (Vec<u8>, u32, u32) {
    let padding = options.padding;

    if diagram.elements.is_empty() {
        let w = 200;
        let h = 200;
        let mut pixmap = Pixmap::new(w, h).unwrap();
        pixmap.fill(options.background);
        return (pixmap.data().to_vec(), w, h);
    }

    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for el in &diagram.elements {
        let x = el.x.unwrap_or(0.0);
        let y = el.y.unwrap_or(0.0);
        let w = el.width.unwrap_or(120.0);
        let h = el.height.unwrap_or(60.0);
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x + w);
        max_y = max_y.max(y + h);
    }

    let vp_w = ((max_x - min_x + padding * 2.0).ceil() as u32).max(1);
    let vp_h = ((max_y - min_y + padding * 2.0).ceil() as u32).max(1);

    let camera = Camera {
        x: min_x - padding,
        y: min_y - padding,
        zoom: 1.0,
    };

    let pixels = render_diagram(diagram, &camera, vp_w, vp_h, options);
    (pixels, vp_w, vp_h)
}

/// Encode RGBA pixels to PNG bytes.
#[cfg(not(target_arch = "wasm32"))]
pub fn encode_png(pixels: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut buf = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut buf, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .expect("Failed to write PNG header");
        writer
            .write_image_data(pixels)
            .expect("Failed to write PNG data");
    }
    buf
}
