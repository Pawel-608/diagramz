use std::convert::Infallible;
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::Utc;
use futures_util::stream::Stream;
use serde_json::{json, Value};

use diagramz_renderer::defaults::{DEFAULT_TTL_MS, MAX_TITLE_LENGTH};
use diagramz_renderer::layout::auto_layout;
use diagramz_renderer::render::{encode_png, render_diagram_auto, RenderOptions};
use diagramz_renderer::svg::render_svg;
use diagramz_renderer::types::{
    CreateDiagramRequest, CreateDiagramResponse, Diagram, UpdateDiagramRequest,
};
use diagramz_renderer::validation::validate_create_diagram;

use crate::db::{Db, DiagramRow};

pub type AppState = Arc<AppStateInner>;

pub struct AppStateInner {
    pub db: Db,
    pub base_url: String,
    pub events_tx: tokio::sync::broadcast::Sender<String>,
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn expires_iso() -> String {
    let exp = Utc::now() + chrono::Duration::milliseconds(DEFAULT_TTL_MS as i64);
    exp.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn is_expired(expires_at: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(expires_at)
        .map(|dt| dt < Utc::now())
        .unwrap_or(true)
}

fn row_to_diagram(row: &DiagramRow) -> Diagram {
    let data: Value = serde_json::from_str(&row.data).unwrap_or(json!({}));
    Diagram {
        id: row.id.clone(),
        title: row.title.clone(),
        elements: serde_json::from_value(data["elements"].clone()).unwrap_or_default(),
        connections: serde_json::from_value(data["connections"].clone()).unwrap_or_default(),
        viewport: serde_json::from_value(data["viewport"].clone()).ok(),
        created_at: row.created_at.clone(),
        updated_at: row.updated_at.clone(),
        expires_at: row.expires_at.clone(),
    }
}

fn error_response(status: StatusCode, msg: &str) -> Response {
    (status, Json(json!({ "error": msg }))).into_response()
}

pub async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

pub async fn create_diagram(
    State(state): State<AppState>,
    Json(body): Json<CreateDiagramRequest>,
) -> Response {
    if let Some(err) = validate_create_diagram(&body) {
        return error_response(StatusCode::BAD_REQUEST, &err);
    }

    let now = now_iso();
    let id = uuid::Uuid::new_v4().to_string();

    let mut elements = body.elements.unwrap_or_default();
    let connections = body.connections.unwrap_or_default();

    let needs_layout =
        body.layout.is_some() || elements.iter().any(|el| el.x.is_none() || el.y.is_none());
    if needs_layout && !elements.is_empty() {
        elements = auto_layout(&elements, &connections, body.layout.as_ref());
    }

    let data = json!({
        "elements": elements,
        "connections": connections,
    });

    let row = DiagramRow {
        id: id.clone(),
        title: body.title.clone(),
        data: serde_json::to_string(&data).unwrap(),
        created_at: now.clone(),
        updated_at: now,
        expires_at: expires_iso(),
    };

    state.db.insert(&row);

    let diagram = row_to_diagram(&row);
    let response = CreateDiagramResponse {
        id: id.clone(),
        url: format!("{}/d/{}", state.base_url, id),
        diagram,
    };

    (StatusCode::CREATED, Json(json!(response))).into_response()
}

pub async fn get_diagram(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    let row = match state.db.get(&id) {
        Some(r) => r,
        None => return error_response(StatusCode::NOT_FOUND, "Diagram not found"),
    };

    if is_expired(&row.expires_at) {
        return error_response(StatusCode::NOT_FOUND, "Diagram not found");
    }

    // Touch TTL
    state
        .db
        .touch_ttl(&id, &now_iso(), &expires_iso());

    let diagram = row_to_diagram(&row);
    Json(json!(diagram)).into_response()
}

pub async fn get_diagram_svg(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    let row = match state.db.get(&id) {
        Some(r) => r,
        None => return error_response(StatusCode::NOT_FOUND, "Diagram not found"),
    };

    if is_expired(&row.expires_at) {
        return error_response(StatusCode::NOT_FOUND, "Diagram not found");
    }

    let diagram = row_to_diagram(&row);
    let options = RenderOptions::default();
    let svg = render_svg(&diagram, &options);

    (
        StatusCode::OK,
        [("content-type", "image/svg+xml")],
        svg,
    )
        .into_response()
}

pub async fn get_diagram_png(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    let row = match state.db.get(&id) {
        Some(r) => r,
        None => return error_response(StatusCode::NOT_FOUND, "Diagram not found"),
    };

    if is_expired(&row.expires_at) {
        return error_response(StatusCode::NOT_FOUND, "Diagram not found");
    }

    let diagram = row_to_diagram(&row);
    let options = RenderOptions::default();
    let (pixels, w, h) = render_diagram_auto(&diagram, &options);
    let png_data = encode_png(&pixels, w, h);

    (
        StatusCode::OK,
        [("content-type", "image/png")],
        png_data,
    )
        .into_response()
}

pub async fn update_diagram(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateDiagramRequest>,
) -> Response {
    let row = match state.db.get(&id) {
        Some(r) => r,
        None => return error_response(StatusCode::NOT_FOUND, "Diagram not found"),
    };

    if is_expired(&row.expires_at) {
        return error_response(StatusCode::NOT_FOUND, "Diagram not found");
    }

    if let Some(ref title) = body.title {
        if title.len() > MAX_TITLE_LENGTH {
            return error_response(StatusCode::BAD_REQUEST, "Title too long");
        }
    }

    let existing_data: Value = serde_json::from_str(&row.data).unwrap_or(json!({}));
    let new_data = json!({
        "elements": body.elements.as_ref().map(|e| json!(e)).unwrap_or(existing_data["elements"].clone()),
        "connections": body.connections.as_ref().map(|c| json!(c)).unwrap_or(existing_data["connections"].clone()),
        "viewport": existing_data["viewport"].clone(),
    });

    let title = body.title.as_deref().or(row.title.as_deref());

    state.db.update(
        &id,
        if body.title.is_some() { title } else { None },
        &serde_json::to_string(&new_data).unwrap(),
        &now_iso(),
        &expires_iso(),
    );

    let updated = state.db.get(&id).unwrap();
    let diagram = row_to_diagram(&updated);
    let _ = state.events_tx.send(id);
    Json(json!(diagram)).into_response()
}

pub async fn diagram_events(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.events_tx.subscribe();
    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(updated_id) if updated_id == id => {
                    yield Ok(Event::default().event("updated").data(&updated_id));
                }
                Ok(_) => {} // different diagram
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                Err(_) => break,
            }
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default())
}

pub async fn delete_diagram(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    if state.db.delete(&id) {
        Json(json!({ "ok": true })).into_response()
    } else {
        error_response(StatusCode::NOT_FOUND, "Diagram not found")
    }
}
