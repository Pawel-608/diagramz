use crate::types::{Anchor, DiagramElement, ElementType};

/// Get the anchor point on an element's bounding box.
pub fn anchor_point(el: &DiagramElement, anchor: Option<Anchor>) -> (f64, f64) {
    let x = el.x.unwrap_or(0.0);
    let y = el.y.unwrap_or(0.0);
    let w = el.width.unwrap_or(120.0);
    let h = el.height.unwrap_or(60.0);
    let cx = x + w / 2.0;
    let cy = y + h / 2.0;

    match anchor.unwrap_or(Anchor::Center) {
        Anchor::Top => (cx, y),
        Anchor::Bottom => (cx, y + h),
        Anchor::Left => (x, cy),
        Anchor::Right => (x + w, cy),
        Anchor::Center => (cx, cy),
    }
}

/// Clip a line from (cx, cy) to (tx, ty) against a rectangle (x, y, w, h).
/// Returns the intersection point on the rectangle boundary.
pub fn clip_to_rect(cx: f64, cy: f64, tx: f64, ty: f64, x: f64, y: f64, w: f64, h: f64) -> (f64, f64) {
    let dx = tx - cx;
    let dy = ty - cy;
    if dx.abs() < 1e-9 && dy.abs() < 1e-9 {
        return (cx, cy);
    }

    let half_w = w / 2.0;
    let half_h = h / 2.0;
    let rect_cx = x + half_w;
    let rect_cy = y + half_h;

    // Normalized direction from center of rect
    let ndx = tx - rect_cx;
    let ndy = ty - rect_cy;

    if ndx.abs() < 1e-9 && ndy.abs() < 1e-9 {
        return (rect_cx, rect_cy);
    }

    let scale_x = if ndx.abs() > 1e-9 {
        half_w / ndx.abs()
    } else {
        f64::INFINITY
    };
    let scale_y = if ndy.abs() > 1e-9 {
        half_h / ndy.abs()
    } else {
        f64::INFINITY
    };
    let scale = scale_x.min(scale_y);

    (rect_cx + ndx * scale, rect_cy + ndy * scale)
}

/// Clip a line from center of ellipse to (tx, ty).
pub fn clip_to_ellipse(cx: f64, cy: f64, tx: f64, ty: f64, rx: f64, ry: f64) -> (f64, f64) {
    let dx = tx - cx;
    let dy = ty - cy;
    if dx.abs() < 1e-9 && dy.abs() < 1e-9 {
        return (cx, cy);
    }
    let angle = dy.atan2(dx);
    (cx + rx * angle.cos(), cy + ry * angle.sin())
}

/// Clip a line from center of diamond to (tx, ty).
pub fn clip_to_diamond(
    cx: f64,
    cy: f64,
    tx: f64,
    ty: f64,
    half_w: f64,
    half_h: f64,
) -> (f64, f64) {
    let dx = tx - cx;
    let dy = ty - cy;
    if dx.abs() < 1e-9 && dy.abs() < 1e-9 {
        return (cx, cy);
    }
    // Diamond edges: |x/half_w| + |y/half_h| = 1
    let adx = dx.abs();
    let ady = dy.abs();
    let scale = 1.0 / (adx / half_w + ady / half_h);
    (cx + dx * scale, cy + dy * scale)
}

/// Get the clipped connection endpoint on an element.
pub fn element_connection_point(el: &DiagramElement, anchor: Option<Anchor>, target: (f64, f64)) -> (f64, f64) {
    let x = el.x.unwrap_or(0.0);
    let y = el.y.unwrap_or(0.0);
    let w = el.width.unwrap_or(120.0);
    let h = el.height.unwrap_or(60.0);
    let cx = x + w / 2.0;
    let cy = y + h / 2.0;

    // If explicit anchor, use the anchor point directly
    if let Some(a) = anchor {
        return anchor_point(el, Some(a));
    }

    // Otherwise clip to shape boundary
    match el.element_type {
        ElementType::Rectangle | ElementType::Text => {
            clip_to_rect(cx, cy, target.0, target.1, x, y, w, h)
        }
        ElementType::Ellipse => clip_to_ellipse(cx, cy, target.0, target.1, w / 2.0, h / 2.0),
        ElementType::Diamond => clip_to_diamond(cx, cy, target.0, target.1, w / 2.0, h / 2.0),
    }
}

/// Compute arrowhead points (triangle) at end of a line.
pub fn arrowhead_points(
    x: f64,
    y: f64,
    from_x: f64,
    from_y: f64,
    size: f64,
) -> [(f64, f64); 3] {
    let dx = x - from_x;
    let dy = y - from_y;
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-9 {
        return [(x, y); 3];
    }
    let ux = dx / len;
    let uy = dy / len;
    // Perpendicular
    let px = -uy;
    let py = ux;
    let base_x = x - ux * size;
    let base_y = y - uy * size;
    let half = size * 0.4;

    [
        (x, y),
        (base_x + px * half, base_y + py * half),
        (base_x - px * half, base_y - py * half),
    ]
}

/// Compute label position at midpoint of a connection.
pub fn connection_label_pos(from: (f64, f64), to: (f64, f64)) -> (f64, f64) {
    ((from.0 + to.0) / 2.0, (from.1 + to.1) / 2.0)
}
