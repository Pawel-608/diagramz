use std::collections::HashMap;
use std::fmt::Write;

use crate::connections::{connection_label_pos, element_connection_point};
use crate::defaults::{resolve_connection_style, resolve_element_style};
use crate::render::RenderOptions;
use crate::types::{ConnectionType, Diagram, ElementType};

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Render a diagram to an SVG string.
pub fn render_svg(diagram: &Diagram, options: &RenderOptions) -> String {
    let padding = options.padding;

    // Compute bounding box
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

    if !min_x.is_finite() {
        min_x = 0.0;
        min_y = 0.0;
        max_x = 200.0;
        max_y = 200.0;
    }

    let vb_x = min_x - padding;
    let vb_y = min_y - padding;
    let vb_w = max_x - min_x + padding * 2.0;
    let vb_h = max_y - min_y + padding * 2.0;

    let mut svg = String::new();
    let _ = write!(
        svg,
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="{} {} {} {}" width="{}" height="{}" style="background:{}">
"#,
        vb_x,
        vb_y,
        vb_w,
        vb_h,
        vb_w,
        vb_h,
        if options.background == tiny_skia::Color::WHITE {
            "#ffffff"
        } else {
            "#ffffff"
        },
    );

    // Arrowhead marker
    svg.push_str(r##"<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#1e1e1e"/></marker></defs>
"##);

    // Build element lookup
    let el_map: HashMap<&str, _> = diagram
        .elements
        .iter()
        .map(|el| (el.id.as_str(), el))
        .collect();

    // Connections
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

        let marker = if conn.connection_type == ConnectionType::Arrow {
            r#" marker-end="url(#arrowhead)""#
        } else {
            ""
        };

        let dash_attr = if let Some(dash) = cs.stroke_dash {
            if dash.len() >= 2 {
                format!(
                    r#" stroke-dasharray="{},{}""#,
                    dash[0], dash[1]
                )
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        // Shorten line for arrowhead
        let (tx, ty) = if conn.connection_type == ConnectionType::Arrow {
            let dx = to_pt.0 - from_pt.0;
            let dy = to_pt.1 - from_pt.1;
            let len = (dx * dx + dy * dy).sqrt();
            if len > 10.0 {
                let shorten = 8.0;
                (
                    to_pt.0 - dx / len * shorten,
                    to_pt.1 - dy / len * shorten,
                )
            } else {
                to_pt
            }
        } else {
            to_pt
        };

        let _ = write!(
            svg,
            r#"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="{}" stroke-width="{}"{}{}/>"#,
            from_pt.0, from_pt.1, tx, ty, cs.stroke_color, cs.stroke_width, dash_attr, marker,
        );
        svg.push('\n');

        // Connection label
        if let Some(ref label) = conn.label {
            let mid = connection_label_pos(from_pt, to_pt);
            let _ = write!(
                svg,
                r##"<text x="{:.1}" y="{:.1}" text-anchor="middle" dominant-baseline="middle" font-family="Inter,sans-serif" font-size="14" fill="#1e1e1e">{}</text>"##,
                mid.0,
                mid.1,
                escape_xml(label),
            );
            svg.push('\n');
        }
    }

    // Elements
    for el in &diagram.elements {
        let es = resolve_element_style(el.style.as_ref());
        let x = el.x.unwrap_or(0.0);
        let y = el.y.unwrap_or(0.0);
        let w = el.width.unwrap_or(120.0);
        let h = el.height.unwrap_or(60.0);

        match el.element_type {
            ElementType::Rectangle => {
                let _ = write!(
                    svg,
                    r#"<rect x="{:.1}" y="{:.1}" width="{:.1}" height="{:.1}" fill="{}" stroke="{}" stroke-width="{}" opacity="{}"/>"#,
                    x, y, w, h, es.fill_color, es.stroke_color, es.stroke_width, es.opacity,
                );
                svg.push('\n');
            }
            ElementType::Ellipse => {
                let _ = write!(
                    svg,
                    r#"<ellipse cx="{:.1}" cy="{:.1}" rx="{:.1}" ry="{:.1}" fill="{}" stroke="{}" stroke-width="{}" opacity="{}"/>"#,
                    x + w / 2.0,
                    y + h / 2.0,
                    w / 2.0,
                    h / 2.0,
                    es.fill_color,
                    es.stroke_color,
                    es.stroke_width,
                    es.opacity,
                );
                svg.push('\n');
            }
            ElementType::Diamond => {
                let cx = x + w / 2.0;
                let cy = y + h / 2.0;
                let _ = write!(
                    svg,
                    r#"<polygon points="{:.1},{:.1} {:.1},{:.1} {:.1},{:.1} {:.1},{:.1}" fill="{}" stroke="{}" stroke-width="{}" opacity="{}"/>"#,
                    cx, y, x + w, cy, cx, y + h, x, cy,
                    es.fill_color, es.stroke_color, es.stroke_width, es.opacity,
                );
                svg.push('\n');
            }
            ElementType::Text => {
                // No shape for text-only
            }
        }

        // Label
        if let Some(ref label) = el.label {
            let _ = write!(
                svg,
                r#"<text x="{:.1}" y="{:.1}" text-anchor="middle" dominant-baseline="middle" font-family="Inter,sans-serif" font-size="{}" fill="{}" opacity="{}">{}</text>"#,
                x + w / 2.0,
                y + h / 2.0,
                es.font_size,
                es.stroke_color,
                es.opacity,
                escape_xml(label),
            );
            svg.push('\n');
        }
    }

    svg.push_str("</svg>\n");
    svg
}
