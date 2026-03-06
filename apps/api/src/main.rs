mod db;
mod routes;

use std::sync::Arc;

use axum::routing::{delete, get, patch, post};
use axum::Router;
use tower_http::cors::CorsLayer;

use routes::{AppState, AppStateInner};

#[tokio::main]
async fn main() {
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse::<u16>()
        .unwrap_or(3001);
    let db_path = std::env::var("DB_PATH").unwrap_or_else(|_| "diagramz.db".to_string());
    let base_url =
        std::env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());

    let (tx, _) = tokio::sync::broadcast::channel::<String>(256);

    let state: AppState = Arc::new(AppStateInner {
        db: db::Db::open(&db_path),
        base_url,
        events_tx: tx,
    });

    let app = Router::new()
        .route("/health", get(routes::health))
        .route("/api/v1/diagrams", post(routes::create_diagram))
        .route("/api/v1/diagrams/{id}", get(routes::get_diagram))
        .route("/api/v1/diagrams/{id}", patch(routes::update_diagram))
        .route("/api/v1/diagrams/{id}", delete(routes::delete_diagram))
        .route("/api/v1/diagrams/{id}/svg", get(routes::get_diagram_svg))
        .route("/api/v1/diagrams/{id}/png", get(routes::get_diagram_png))
        .route("/api/v1/diagrams/{id}/events", get(routes::diagram_events))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .unwrap();
    println!("Diagramz API running on http://localhost:{}", port);
    axum::serve(listener, app).await.unwrap();
}
