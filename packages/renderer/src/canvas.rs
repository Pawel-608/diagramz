#![cfg(feature = "wasm")]

use wasm_bindgen::prelude::*;
use wasm_bindgen::Clamped;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, ImageData};

use crate::render::{Camera, RenderOptions};
use crate::types::Diagram;

fn log(msg: &str) {
    web_sys::console::log_1(&JsValue::from_str(msg));
}

#[wasm_bindgen]
pub struct Whiteboard {
    canvas: HtmlCanvasElement,
    ctx: CanvasRenderingContext2d,
    diagram: Diagram,
    camera: Camera,
    options: RenderOptions,
    // Interaction state
    dragging: bool,
    drag_start_x: f64,
    drag_start_y: f64,
    cam_start_x: f64,
    cam_start_y: f64,
    selected_id: Option<String>,
    element_drag: bool,
    elem_start_x: f64,
    elem_start_y: f64,
}

#[wasm_bindgen]
impl Whiteboard {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement, diagram_json: &str) -> Result<Whiteboard, JsValue> {
        console_error_panic_hook::set_once();

        let ctx = canvas
            .get_context("2d")?
            .ok_or("No 2d context")?
            .dyn_into::<CanvasRenderingContext2d>()?;

        let diagram: Diagram =
            serde_json::from_str(diagram_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

        let mut wb = Whiteboard {
            canvas,
            ctx,
            diagram,
            camera: Camera::default(),
            options: RenderOptions::default(),
            dragging: false,
            drag_start_x: 0.0,
            drag_start_y: 0.0,
            cam_start_x: 0.0,
            cam_start_y: 0.0,
            selected_id: None,
            element_drag: false,
            elem_start_x: 0.0,
            elem_start_y: 0.0,
        };
        wb.fit_to_content();
        wb.render();
        Ok(wb)
    }

    pub fn set_diagram(&mut self, diagram_json: &str) -> Result<(), JsValue> {
        self.diagram =
            serde_json::from_str(diagram_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.render();
        Ok(())
    }

    pub fn get_diagram(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.diagram).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn set_sketchy(&mut self, sketchy: bool) {
        self.options.sketchy = sketchy;
        self.render();
    }

    pub fn set_roughness(&mut self, roughness: f32) {
        self.options.roughness = roughness;
        self.render();
    }

    pub fn selected_element_id(&self) -> Option<String> {
        self.selected_id.clone()
    }

    fn fit_to_content(&mut self) {
        if self.diagram.elements.is_empty() {
            return;
        }
        let mut min_x = f64::INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        for el in &self.diagram.elements {
            let x = el.x.unwrap_or(0.0);
            let y = el.y.unwrap_or(0.0);
            let w = el.width.unwrap_or(120.0);
            let h = el.height.unwrap_or(60.0);
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x + w);
            max_y = max_y.max(y + h);
        }
        let cw = self.canvas.width() as f64;
        let ch = self.canvas.height() as f64;
        if cw == 0.0 || ch == 0.0 {
            return;
        }
        let content_w = max_x - min_x;
        let content_h = max_y - min_y;
        let padding = 60.0;
        let zoom_x = cw / (content_w + padding * 2.0);
        let zoom_y = ch / (content_h + padding * 2.0);
        self.camera.zoom = zoom_x.min(zoom_y).min(2.0).max(0.1);
        self.camera.x = min_x - padding;
        self.camera.y = min_y - padding;
    }

    pub fn render(&self) {
        let w = self.canvas.width();
        let h = self.canvas.height();
        if w == 0 || h == 0 {
            return;
        }

        let pixels = crate::render::render_diagram(
            &self.diagram,
            &self.camera,
            w,
            h,
            &self.options,
        );

        let expected_len = (w * h * 4) as usize;
        if pixels.len() != expected_len {
            log(&format!(
                "render: pixel buffer size mismatch: got {} expected {}",
                pixels.len(),
                expected_len
            ));
            return;
        }

        match ImageData::new_with_u8_clamped_array_and_sh(Clamped(&pixels), w, h) {
            Ok(data) => {
                let _ = self.ctx.put_image_data(&data, 0.0, 0.0);
            }
            Err(e) => {
                log(&format!("render: ImageData error: {:?}", e));
            }
        }
    }

    fn screen_to_world(&self, sx: f64, sy: f64) -> (f64, f64) {
        (
            sx / self.camera.zoom + self.camera.x,
            sy / self.camera.zoom + self.camera.y,
        )
    }

    fn hit_test(&self, wx: f64, wy: f64) -> Option<usize> {
        for (i, el) in self.diagram.elements.iter().enumerate().rev() {
            let x = el.x.unwrap_or(0.0);
            let y = el.y.unwrap_or(0.0);
            let w = el.width.unwrap_or(120.0);
            let h = el.height.unwrap_or(60.0);
            if wx >= x && wx <= x + w && wy >= y && wy <= y + h {
                return Some(i);
            }
        }
        None
    }

    pub fn has_element_at(&self, sx: f64, sy: f64) -> bool {
        let (wx, wy) = self.screen_to_world(sx, sy);
        self.hit_test(wx, wy).is_some()
    }

    pub fn on_mouse_down(&mut self, sx: f64, sy: f64) {
        let (wx, wy) = self.screen_to_world(sx, sy);

        if let Some(idx) = self.hit_test(wx, wy) {
            let el = &self.diagram.elements[idx];
            self.selected_id = Some(el.id.clone());
            self.element_drag = true;
            self.drag_start_x = wx;
            self.drag_start_y = wy;
            self.elem_start_x = el.x.unwrap_or(0.0);
            self.elem_start_y = el.y.unwrap_or(0.0);
        } else {
            self.selected_id = None;
            self.dragging = true;
            self.drag_start_x = sx;
            self.drag_start_y = sy;
            self.cam_start_x = self.camera.x;
            self.cam_start_y = self.camera.y;
        }
        self.render();
    }

    pub fn on_mouse_move(&mut self, sx: f64, sy: f64) {
        if self.element_drag {
            let (wx, wy) = self.screen_to_world(sx, sy);
            let dx = wx - self.drag_start_x;
            let dy = wy - self.drag_start_y;
            if let Some(ref sel_id) = self.selected_id.clone() {
                if let Some(el) = self.diagram.elements.iter_mut().find(|e| &e.id == sel_id) {
                    el.x = Some(self.elem_start_x + dx);
                    el.y = Some(self.elem_start_y + dy);
                }
            }
            self.render();
        } else if self.dragging {
            let dx = (sx - self.drag_start_x) / self.camera.zoom;
            let dy = (sy - self.drag_start_y) / self.camera.zoom;
            self.camera.x = self.cam_start_x - dx;
            self.camera.y = self.cam_start_y - dy;
            self.render();
        }
    }

    pub fn on_mouse_up(&mut self) {
        self.dragging = false;
        self.element_drag = false;
    }

    /// Scroll to pan.
    pub fn on_wheel_pan(&mut self, delta_x: f64, delta_y: f64) {
        self.camera.x += delta_x / self.camera.zoom;
        self.camera.y += delta_y / self.camera.zoom;
        self.render();
    }

    /// Ctrl+scroll to zoom (pinch-to-zoom).
    pub fn on_wheel_zoom(&mut self, sx: f64, sy: f64, delta: f64) {
        let (wx, wy) = self.screen_to_world(sx, sy);
        let factor = if delta > 0.0 { 0.9 } else { 1.1 };
        self.camera.zoom = (self.camera.zoom * factor).clamp(0.05, 10.0);
        self.camera.x = wx - sx / self.camera.zoom;
        self.camera.y = wy - sy / self.camera.zoom;
        self.render();
    }

    pub fn delete_selected(&mut self) -> bool {
        if let Some(ref sel_id) = self.selected_id.clone() {
            self.diagram.elements.retain(|e| &e.id != sel_id);
            self.diagram
                .connections
                .retain(|c| &c.from_id != sel_id && &c.to_id != sel_id);
            self.selected_id = None;
            self.render();
            true
        } else {
            false
        }
    }

    pub fn bring_to_front(&mut self) {
        if let Some(ref sel_id) = self.selected_id.clone() {
            if let Some(idx) = self.diagram.elements.iter().position(|e| &e.id == sel_id) {
                let el = self.diagram.elements.remove(idx);
                self.diagram.elements.push(el);
                self.render();
            }
        }
    }

    pub fn send_to_back(&mut self) {
        if let Some(ref sel_id) = self.selected_id.clone() {
            if let Some(idx) = self.diagram.elements.iter().position(|e| &e.id == sel_id) {
                let el = self.diagram.elements.remove(idx);
                self.diagram.elements.insert(0, el);
                self.render();
            }
        }
    }

    pub fn zoom_in(&mut self) {
        let cx = self.canvas.width() as f64 / 2.0;
        let cy = self.canvas.height() as f64 / 2.0;
        self.on_wheel_zoom(cx, cy, -1.0);
    }

    pub fn zoom_out(&mut self) {
        let cx = self.canvas.width() as f64 / 2.0;
        let cy = self.canvas.height() as f64 / 2.0;
        self.on_wheel_zoom(cx, cy, 1.0);
    }

    pub fn zoom_to_fit(&mut self) {
        self.fit_to_content();
        self.render();
    }
}
