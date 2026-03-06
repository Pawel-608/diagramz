use crate::types::{ConnectionStyle, ElementStyle};

pub const DEFAULT_TTL_MS: u64 = 30 * 24 * 60 * 60 * 1000;
pub const MAX_ELEMENTS: usize = 500;
pub const MAX_CONNECTIONS: usize = 500;
pub const MAX_TITLE_LENGTH: usize = 200;

pub const DEFAULT_STROKE_COLOR: &str = "#1e1e1e";
pub const DEFAULT_FILL_COLOR: &str = "#ffffff";
pub const DEFAULT_STROKE_WIDTH: f32 = 2.0;
pub const DEFAULT_FONT_SIZE: f32 = 16.0;
pub const DEFAULT_OPACITY: f32 = 1.0;

pub const DEFAULT_CONNECTION_STROKE_COLOR: &str = "#1e1e1e";
pub const DEFAULT_CONNECTION_STROKE_WIDTH: f32 = 2.0;

pub fn resolve_element_style(style: Option<&ElementStyle>) -> ResolvedElementStyle<'_> {
    ResolvedElementStyle {
        stroke_color: style
            .and_then(|s| s.stroke_color.as_deref())
            .unwrap_or(DEFAULT_STROKE_COLOR),
        fill_color: style
            .and_then(|s| s.fill_color.as_deref())
            .unwrap_or(DEFAULT_FILL_COLOR),
        stroke_width: style
            .and_then(|s| s.stroke_width)
            .unwrap_or(DEFAULT_STROKE_WIDTH),
        font_size: style
            .and_then(|s| s.font_size)
            .unwrap_or(DEFAULT_FONT_SIZE),
        opacity: style
            .and_then(|s| s.opacity)
            .unwrap_or(DEFAULT_OPACITY),
    }
}

pub fn resolve_connection_style(style: Option<&ConnectionStyle>) -> ResolvedConnectionStyle<'_> {
    ResolvedConnectionStyle {
        stroke_color: style
            .and_then(|s| s.stroke_color.as_deref())
            .unwrap_or(DEFAULT_CONNECTION_STROKE_COLOR),
        stroke_width: style
            .and_then(|s| s.stroke_width)
            .unwrap_or(DEFAULT_CONNECTION_STROKE_WIDTH),
        stroke_dash: style.and_then(|s| s.stroke_dash.as_deref()),
    }
}

pub struct ResolvedElementStyle<'a> {
    pub stroke_color: &'a str,
    pub fill_color: &'a str,
    pub stroke_width: f32,
    pub font_size: f32,
    pub opacity: f32,
}

pub struct ResolvedConnectionStyle<'a> {
    pub stroke_color: &'a str,
    pub stroke_width: f32,
    pub stroke_dash: Option<&'a [f32]>,
}
