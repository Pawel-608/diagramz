use tiny_skia::{FillRule, Paint, PathBuilder, Pixmap, Stroke, Transform};

// ---------------------------------------------------------------------------
// PRNG — Park-Miller LCG matching rough.js
// ---------------------------------------------------------------------------

pub struct Rng {
    seed: i32,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self {
            seed: (seed as i32).max(1),
        }
    }

    /// Random float in [0, 1)
    pub fn next(&mut self) -> f32 {
        // rough.js: Math.imul(48271, seed) & 0x7fffffff
        self.seed = ((48271i64 * self.seed as i64) & 0x7FFF_FFFF) as i32;
        (self.seed as f32) / (0x7FFF_FFFF as f32)
    }
}

// ---------------------------------------------------------------------------
// Offset helpers — matching rough.js _offset / _offsetOpt
// ---------------------------------------------------------------------------

/// rough.js: `_offset(min, max, o, roughnessGain)`
/// Returns `roughness * roughnessGain * (random * (max - min) + min)`
fn offset(min: f32, max: f32, roughness: f32, roughness_gain: f32, rng: &mut Rng) -> f32 {
    roughness * roughness_gain * (rng.next() * (max - min) + min)
}

/// rough.js: `_offsetOpt(x, o, roughnessGain)` — symmetric offset in [-x, x]
fn offset_opt(x: f32, roughness: f32, roughness_gain: f32, rng: &mut Rng) -> f32 {
    offset(-x, x, roughness, roughness_gain, rng)
}

/// Roughness gain based on line length (from rough.js).
fn roughness_gain(length: f32) -> f32 {
    if length < 200.0 {
        1.0
    } else if length > 500.0 {
        0.4
    } else {
        -0.0016668 * length + 1.233334
    }
}

// ---------------------------------------------------------------------------
// Core line algorithm — matching rough.js `_line`
// ---------------------------------------------------------------------------

/// Draw a single wobbly line as a cubic bezier.
/// `overlay` = false for primary stroke (full offset), true for second stroke (half offset).
fn line_single(
    pb: &mut PathBuilder,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    roughness: f32,
    bowing: f32,
    overlay: bool,
    rng: &mut Rng,
) {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let len_sq = dx * dx + dy * dy;
    let len = len_sq.sqrt();
    let gain = roughness_gain(len);

    // rough.js: maxRandomnessOffset = 2, clamped for short lines
    let max_random_offset = 2.0f32;
    let mut rand_offset = max_random_offset;
    if rand_offset * rand_offset * 100.0 > len_sq {
        rand_offset = len / 10.0;
    }
    let half_offset = rand_offset / 2.0;

    // Bowing: perpendicular midpoint displacement
    let mid_disp_x = offset_opt(
        bowing * max_random_offset * dy / 200.0,
        roughness,
        gain,
        rng,
    );
    let mid_disp_y = offset_opt(
        bowing * max_random_offset * (-dx) / 200.0,
        roughness,
        gain,
        rng,
    );

    // Diverge point
    let div = 0.2 + rng.next() * 0.2;

    if overlay {
        // Second stroke: tighter jitter (halfOffset)
        let start_x = x1 + offset_opt(half_offset, roughness, gain, rng);
        let start_y = y1 + offset_opt(half_offset, roughness, gain, rng);
        let cp1x = mid_disp_x + x1 + dx * div + offset_opt(half_offset, roughness, gain, rng);
        let cp1y = mid_disp_y + y1 + dy * div + offset_opt(half_offset, roughness, gain, rng);
        let cp2x =
            mid_disp_x + x1 + dx * 2.0 * div + offset_opt(half_offset, roughness, gain, rng);
        let cp2y =
            mid_disp_y + y1 + dy * 2.0 * div + offset_opt(half_offset, roughness, gain, rng);
        let end_x = x2 + offset_opt(half_offset, roughness, gain, rng);
        let end_y = y2 + offset_opt(half_offset, roughness, gain, rng);

        pb.move_to(start_x, start_y);
        pb.cubic_to(cp1x, cp1y, cp2x, cp2y, end_x, end_y);
    } else {
        // Primary stroke: full offset
        let start_x = x1 + offset_opt(rand_offset, roughness, gain, rng);
        let start_y = y1 + offset_opt(rand_offset, roughness, gain, rng);
        let cp1x = mid_disp_x + x1 + dx * div + offset_opt(rand_offset, roughness, gain, rng);
        let cp1y = mid_disp_y + y1 + dy * div + offset_opt(rand_offset, roughness, gain, rng);
        let cp2x =
            mid_disp_x + x1 + dx * 2.0 * div + offset_opt(rand_offset, roughness, gain, rng);
        let cp2y =
            mid_disp_y + y1 + dy * 2.0 * div + offset_opt(rand_offset, roughness, gain, rng);
        let end_x = x2 + offset_opt(rand_offset, roughness, gain, rng);
        let end_y = y2 + offset_opt(rand_offset, roughness, gain, rng);

        pb.move_to(start_x, start_y);
        pb.cubic_to(cp1x, cp1y, cp2x, cp2y, end_x, end_y);
    }
}

/// Draw a double-stroke wobbly line (matching rough.js `_doubleLine`).
pub fn rough_line(
    pixmap: &mut Pixmap,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    paint: &Paint,
    stroke: &Stroke,
    roughness: f32,
    bowing: f32,
    rng: &mut Rng,
) {
    // Primary stroke
    {
        let mut pb = PathBuilder::new();
        line_single(&mut pb, x1, y1, x2, y2, roughness, bowing, false, rng);
        if let Some(path) = pb.finish() {
            pixmap.stroke_path(&path, paint, stroke, Transform::identity(), None);
        }
    }
    // Overlay stroke (tighter jitter)
    {
        let mut pb = PathBuilder::new();
        line_single(&mut pb, x1, y1, x2, y2, roughness, bowing, true, rng);
        if let Some(path) = pb.finish() {
            pixmap.stroke_path(&path, paint, stroke, Transform::identity(), None);
        }
    }
}

// ---------------------------------------------------------------------------
// Rectangle
// ---------------------------------------------------------------------------

/// Draw a sketchy rectangle outline (each edge is a double-stroke wobbly line).
pub fn rough_rect(
    pixmap: &mut Pixmap,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    paint: &Paint,
    stroke: &Stroke,
    roughness: f32,
    bowing: f32,
    rng: &mut Rng,
) {
    let corners = [
        (x, y),
        (x + w, y),
        (x + w, y + h),
        (x, y + h),
    ];
    for i in 0..4 {
        let (x1, y1) = corners[i];
        let (x2, y2) = corners[(i + 1) % 4];
        rough_line(pixmap, x1, y1, x2, y2, paint, stroke, roughness, bowing, rng);
    }
}

// ---------------------------------------------------------------------------
// Ellipse — matching rough.js generateEllipseParams + _computeEllipsePoints
// ---------------------------------------------------------------------------

/// Draw a sketchy ellipse outline.
pub fn rough_ellipse(
    pixmap: &mut Pixmap,
    cx: f32,
    cy: f32,
    rx: f32,
    ry: f32,
    paint: &Paint,
    stroke: &Stroke,
    roughness: f32,
    rng: &mut Rng,
) {
    let curve_fitting = 0.95f32;
    let curve_step_count = 9.0f32;

    // rough.js: generateEllipseParams
    let psq = (std::f32::consts::TAU * ((rx * rx + ry * ry) / 2.0).sqrt()).sqrt();
    let step_count =
        (curve_step_count.max((curve_step_count / 200.0f32.sqrt()) * psq)).ceil() as usize;
    let step_count = step_count.max(4);
    let increment = std::f32::consts::TAU / step_count as f32;

    // Jitter radii slightly
    let curve_fit_rand = 1.0 - curve_fitting; // 0.05
    let rx1 = rx + offset_opt(rx * curve_fit_rand, roughness, 1.0, rng);
    let ry1 = ry + offset_opt(ry * curve_fit_rand, roughness, 1.0, rng);
    let rx2 = rx + offset_opt(rx * curve_fit_rand, roughness, 1.0, rng);
    let ry2 = ry + offset_opt(ry * curve_fit_rand, roughness, 1.0, rng);

    // Primary stroke (offset=1.0)
    draw_ellipse_stroke(pixmap, cx, cy, rx1, ry1, increment, 1.0, roughness, paint, stroke, rng);

    // Overlay stroke (offset=1.5)
    if roughness != 0.0 {
        draw_ellipse_stroke(
            pixmap, cx, cy, rx2, ry2, increment, 1.5, roughness, paint, stroke, rng,
        );
    }
}

fn draw_ellipse_stroke(
    pixmap: &mut Pixmap,
    cx: f32,
    cy: f32,
    rx: f32,
    ry: f32,
    increment: f32,
    o_offset: f32,
    roughness: f32,
    paint: &Paint,
    stroke: &Stroke,
    rng: &mut Rng,
) {
    // Random start angle
    let rad_offset = offset_opt(0.5, roughness, 1.0, rng) - std::f32::consts::FRAC_PI_2;

    let mut points: Vec<(f32, f32)> = Vec::new();

    // Leading point (slightly inside, before the start angle)
    points.push((
        offset_opt(o_offset, roughness, 1.0, rng) + cx + 0.9 * rx * (rad_offset - increment).cos(),
        offset_opt(o_offset, roughness, 1.0, rng) + cy + 0.9 * ry * (rad_offset - increment).sin(),
    ));

    // Walk around the ellipse
    let mut angle = rad_offset;
    while angle < std::f32::consts::TAU + rad_offset - 0.01 {
        points.push((
            offset_opt(o_offset, roughness, 1.0, rng) + cx + rx * angle.cos(),
            offset_opt(o_offset, roughness, 1.0, rng) + cy + ry * angle.sin(),
        ));
        angle += increment;
    }

    // Overlap points for smooth closure
    let overlap = if o_offset < 1.5 {
        increment * offset(0.1, offset(0.4, 1.0, roughness, 1.0, rng), roughness, 1.0, rng)
    } else {
        0.0
    };

    points.push((
        offset_opt(o_offset, roughness, 1.0, rng)
            + cx
            + rx * (rad_offset + std::f32::consts::TAU + overlap * 0.5).cos(),
        offset_opt(o_offset, roughness, 1.0, rng)
            + cy
            + ry * (rad_offset + std::f32::consts::TAU + overlap * 0.5).sin(),
    ));
    points.push((
        offset_opt(o_offset, roughness, 1.0, rng)
            + cx
            + 0.98 * rx * (rad_offset + overlap).cos(),
        offset_opt(o_offset, roughness, 1.0, rng)
            + cy
            + 0.98 * ry * (rad_offset + overlap).sin(),
    ));
    points.push((
        offset_opt(o_offset, roughness, 1.0, rng)
            + cx
            + 0.9 * rx * (rad_offset + overlap * 0.5).cos(),
        offset_opt(o_offset, roughness, 1.0, rng)
            + cy
            + 0.9 * ry * (rad_offset + overlap * 0.5).sin(),
    ));

    // Fit cardinal spline (Catmull-Rom, s=1) through points -> cubic beziers
    cardinal_spline_stroke(pixmap, &points, paint, stroke);
}

/// Convert points to a Catmull-Rom cardinal spline (s=1) and stroke it.
fn cardinal_spline_stroke(
    pixmap: &mut Pixmap,
    points: &[(f32, f32)],
    paint: &Paint,
    stroke: &Stroke,
) {
    if points.len() < 3 {
        return;
    }

    let mut pb = PathBuilder::new();
    pb.move_to(points[1].0, points[1].1);

    // Cardinal spline to cubic bezier conversion: s=1 (Catmull-Rom)
    for i in 1..points.len() - 2 {
        let p0 = points[i - 1];
        let p1 = points[i];
        let p2 = points[i + 1];
        let p3 = if i + 2 < points.len() {
            points[i + 2]
        } else {
            p2
        };

        let cp1x = p1.0 + (p2.0 - p0.0) / 6.0;
        let cp1y = p1.1 + (p2.1 - p0.1) / 6.0;
        let cp2x = p2.0 - (p3.0 - p1.0) / 6.0;
        let cp2y = p2.1 - (p3.1 - p1.1) / 6.0;

        pb.cubic_to(cp1x, cp1y, cp2x, cp2y, p2.0, p2.1);
    }

    if let Some(path) = pb.finish() {
        pixmap.stroke_path(&path, paint, stroke, Transform::identity(), None);
    }
}

// ---------------------------------------------------------------------------
// Polygon outline
// ---------------------------------------------------------------------------

/// Draw a sketchy polygon outline.
pub fn rough_polygon(
    pixmap: &mut Pixmap,
    points: &[(f32, f32)],
    paint: &Paint,
    stroke: &Stroke,
    roughness: f32,
    bowing: f32,
    rng: &mut Rng,
) {
    if points.len() < 2 {
        return;
    }
    for i in 0..points.len() {
        let (x1, y1) = points[i];
        let (x2, y2) = points[(i + 1) % points.len()];
        rough_line(pixmap, x1, y1, x2, y2, paint, stroke, roughness, bowing, rng);
    }
}

// ---------------------------------------------------------------------------
// Hachure fill
// ---------------------------------------------------------------------------

/// Hachure fill a rectangle.
pub fn hachure_fill_rect(
    pixmap: &mut Pixmap,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    paint: &Paint,
    stroke: &Stroke,
    gap: f32,
    angle_deg: f32,
    roughness: f32,
    rng: &mut Rng,
) {
    let points = vec![
        (x, y),
        (x + w, y),
        (x + w, y + h),
        (x, y + h),
    ];
    hachure_fill_polygon(pixmap, &points, paint, stroke, gap, angle_deg, roughness, rng);
}

/// Hachure fill an ellipse.
pub fn hachure_fill_ellipse(
    pixmap: &mut Pixmap,
    cx: f32,
    cy: f32,
    rx: f32,
    ry: f32,
    paint: &Paint,
    stroke: &Stroke,
    gap: f32,
    angle_deg: f32,
    roughness: f32,
    rng: &mut Rng,
) {
    let steps = 32;
    let mut points = Vec::with_capacity(steps);
    for i in 0..steps {
        let t = (i as f32 / steps as f32) * std::f32::consts::TAU;
        points.push((cx + rx * t.cos(), cy + ry * t.sin()));
    }
    hachure_fill_polygon(pixmap, &points, paint, stroke, gap, angle_deg, roughness, rng);
}

/// Hachure fill a polygon using rotated scan lines (matching rough.js hachure-fill).
pub fn hachure_fill_polygon(
    pixmap: &mut Pixmap,
    points: &[(f32, f32)],
    paint: &Paint,
    stroke: &Stroke,
    gap: f32,
    angle_deg: f32,
    roughness: f32,
    rng: &mut Rng,
) {
    if points.len() < 3 || gap <= 0.0 {
        return;
    }

    // rough.js uses hachureAngle + 90
    let angle = -(angle_deg + 90.0).to_radians();
    let cos_a = angle.cos();
    let sin_a = angle.sin();

    let rotated: Vec<(f32, f32)> = points
        .iter()
        .map(|&(px, py)| (px * cos_a - py * sin_a, px * sin_a + py * cos_a))
        .collect();

    let min_y = rotated.iter().map(|p| p.1).fold(f32::INFINITY, f32::min);
    let max_y = rotated
        .iter()
        .map(|p| p.1)
        .fold(f32::NEG_INFINITY, f32::max);

    let cos_neg = (-angle).cos();
    let sin_neg = (-angle).sin();

    let mut scan_y = min_y + gap;
    while scan_y < max_y {
        let mut intersections: Vec<f32> = Vec::new();
        let n = rotated.len();
        for i in 0..n {
            let (x1, y1) = rotated[i];
            let (x2, y2) = rotated[(i + 1) % n];
            if (y1 <= scan_y && y2 > scan_y) || (y2 <= scan_y && y1 > scan_y) {
                let t = (scan_y - y1) / (y2 - y1);
                intersections.push(x1 + t * (x2 - x1));
            }
        }

        intersections.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let mut i = 0;
        while i + 1 < intersections.len() {
            let rx1 = intersections[i];
            let rx2 = intersections[i + 1];

            // Rotate back
            let lx1 = rx1 * cos_neg - scan_y * sin_neg;
            let ly1 = rx1 * sin_neg + scan_y * cos_neg;
            let lx2 = rx2 * cos_neg - scan_y * sin_neg;
            let ly2 = rx2 * sin_neg + scan_y * cos_neg;

            // Each hachure line is a double-stroke wobbly line (matching rough.js)
            rough_line(
                pixmap,
                lx1,
                ly1,
                lx2,
                ly2,
                paint,
                stroke,
                roughness * 0.4,
                0.0,
                rng,
            );

            i += 2;
        }

        scan_y += gap;
    }
}

// ---------------------------------------------------------------------------
// Rough solid fills (jittered boundaries)
// ---------------------------------------------------------------------------

/// Fill a rectangle with a slightly jittered boundary.
pub fn rough_fill_rect(
    pixmap: &mut Pixmap,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    paint: &Paint,
    roughness: f32,
    rng: &mut Rng,
) {
    let max_off = roughness * 0.5;
    let mut pb = PathBuilder::new();
    pb.move_to(
        x + offset_opt(max_off, 1.0, 1.0, rng),
        y + offset_opt(max_off, 1.0, 1.0, rng),
    );
    pb.line_to(
        x + w + offset_opt(max_off, 1.0, 1.0, rng),
        y + offset_opt(max_off, 1.0, 1.0, rng),
    );
    pb.line_to(
        x + w + offset_opt(max_off, 1.0, 1.0, rng),
        y + h + offset_opt(max_off, 1.0, 1.0, rng),
    );
    pb.line_to(
        x + offset_opt(max_off, 1.0, 1.0, rng),
        y + h + offset_opt(max_off, 1.0, 1.0, rng),
    );
    pb.close();
    if let Some(path) = pb.finish() {
        pixmap.fill_path(&path, paint, FillRule::Winding, Transform::identity(), None);
    }
}

/// Fill an ellipse with a slightly jittered boundary.
pub fn rough_fill_ellipse(
    pixmap: &mut Pixmap,
    cx: f32,
    cy: f32,
    rx: f32,
    ry: f32,
    paint: &Paint,
    roughness: f32,
    rng: &mut Rng,
) {
    let max_off = roughness * 0.3;
    let steps = 48;
    let mut pb = PathBuilder::new();
    for i in 0..=steps {
        let t = (i as f32 / steps as f32) * std::f32::consts::TAU;
        let r_off = offset_opt(max_off, 1.0, 1.0, rng);
        let px = cx + (rx + r_off) * t.cos();
        let py = cy + (ry + r_off) * t.sin();
        if i == 0 {
            pb.move_to(px, py);
        } else {
            pb.line_to(px, py);
        }
    }
    pb.close();
    if let Some(path) = pb.finish() {
        pixmap.fill_path(&path, paint, FillRule::Winding, Transform::identity(), None);
    }
}
