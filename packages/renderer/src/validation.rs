use std::collections::HashSet;

use crate::defaults::{MAX_CONNECTIONS, MAX_ELEMENTS, MAX_TITLE_LENGTH};
use crate::types::{Connection, CreateDiagramRequest, DiagramElement};

pub fn validate_element(el: &DiagramElement) -> Option<String> {
    if el.id.is_empty() {
        return Some("Element missing id".into());
    }
    if let Some(w) = el.width {
        if w <= 0.0 {
            return Some("Element width must be a positive number".into());
        }
    }
    if let Some(h) = el.height {
        if h <= 0.0 {
            return Some("Element height must be a positive number".into());
        }
    }
    None
}

pub fn validate_connection(conn: &Connection, element_ids: &HashSet<&str>) -> Option<String> {
    if conn.id.is_empty() {
        return Some("Connection missing id".into());
    }
    if conn.from_id.is_empty() || conn.to_id.is_empty() {
        return Some("Connection missing fromId/toId".into());
    }
    if !element_ids.contains(conn.from_id.as_str()) {
        return Some(format!(
            "Connection fromId \"{}\" references unknown element",
            conn.from_id
        ));
    }
    if !element_ids.contains(conn.to_id.as_str()) {
        return Some(format!(
            "Connection toId \"{}\" references unknown element",
            conn.to_id
        ));
    }
    None
}

pub fn validate_create_diagram(req: &CreateDiagramRequest) -> Option<String> {
    if let Some(ref title) = req.title {
        if title.len() > MAX_TITLE_LENGTH {
            return Some("Title too long".into());
        }
    }
    if let Some(ref elements) = req.elements {
        if elements.len() > MAX_ELEMENTS {
            return Some(format!("Too many elements (max {})", MAX_ELEMENTS));
        }
        for el in elements {
            if let Some(err) = validate_element(el) {
                return Some(err);
            }
        }
    }
    if let Some(ref connections) = req.connections {
        if connections.len() > MAX_CONNECTIONS {
            return Some(format!("Too many connections (max {})", MAX_CONNECTIONS));
        }
        if let Some(ref elements) = req.elements {
            let element_ids: HashSet<&str> = elements.iter().map(|e| e.id.as_str()).collect();
            for conn in connections {
                if let Some(err) = validate_connection(conn, &element_ids) {
                    return Some(err);
                }
            }
        }
    }
    None
}
