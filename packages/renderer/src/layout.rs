use std::collections::{HashMap, HashSet, VecDeque};

use crate::types::{Connection, DiagramElement, LayoutDirection, LayoutOptions};

fn compute_width(el: &DiagramElement) -> f64 {
    let font_size = el
        .style
        .as_ref()
        .and_then(|s| s.font_size)
        .unwrap_or(16.0) as f64;
    let char_w = font_size * 0.6;

    let label_len = el.label.as_ref().map(|l| l.len()).unwrap_or(0);
    let label_w = label_len as f64 * char_w + 40.0;

    let body_char_w = (font_size - 2.0) * 0.6;
    let body_w = el
        .body
        .as_ref()
        .map(|items| {
            items
                .iter()
                .map(|s| s.len() as f64 * body_char_w + 32.0)
                .fold(0.0_f64, f64::max)
        })
        .unwrap_or(0.0);

    (120.0_f64).max(label_w).max(body_w)
}

fn compute_height(el: &DiagramElement) -> f64 {
    use crate::types::ElementType;
    let font_size = el
        .style
        .as_ref()
        .and_then(|s| s.font_size)
        .unwrap_or(16.0) as f64;

    let base = match el.element_type {
        ElementType::Text => font_size * 2.5,
        _ => font_size * 3.5,
    };

    match el.body.as_ref() {
        Some(items) if !items.is_empty() => {
            let header_h = font_size * 2.5;
            let line_h = (font_size - 2.0) * 1.5;
            let body_h = items.len() as f64 * line_h + font_size;
            header_h + body_h
        }
        _ => base,
    }
}

/// Count edge crossings between two adjacent layers.
fn count_crossings_between(edges: &[(usize, usize)]) -> usize {
    let mut crossings = 0;
    for i in 0..edges.len() {
        for j in (i + 1)..edges.len() {
            let (u1, v1) = edges[i];
            let (u2, v2) = edges[j];
            if (u1 < u2 && v1 > v2) || (u1 > u2 && v1 < v2) {
                crossings += 1;
            }
        }
    }
    crossings
}

/// Count crossings involving a specific layer (with its neighbors above and below).
fn count_layer_crossings(
    rank_groups: &HashMap<usize, Vec<String>>,
    all_children: &HashMap<String, Vec<String>>,
    all_parents: &HashMap<String, Vec<String>>,
    sorted_ranks: &[usize],
    layer_index: usize,
) -> usize {
    let mut total = 0;
    let rank = sorted_ranks[layer_index];
    let group = &rank_groups[&rank];

    if layer_index > 0 {
        let prev_rank = sorted_ranks[layer_index - 1];
        let prev_group = &rank_groups[&prev_rank];

        let pos_in_prev: HashMap<&str, usize> = prev_group
            .iter()
            .enumerate()
            .map(|(i, id)| (id.as_str(), i))
            .collect();

        let mut edges: Vec<(usize, usize)> = Vec::new();
        for (ci, id) in group.iter().enumerate() {
            for parent in &all_parents[id] {
                if let Some(&pi) = pos_in_prev.get(parent.as_str()) {
                    edges.push((pi, ci));
                }
            }
        }
        total += count_crossings_between(&edges);
    }

    if layer_index + 1 < sorted_ranks.len() {
        let next_rank = sorted_ranks[layer_index + 1];
        let next_group = &rank_groups[&next_rank];

        let pos_in_next: HashMap<&str, usize> = next_group
            .iter()
            .enumerate()
            .map(|(i, id)| (id.as_str(), i))
            .collect();

        let mut edges: Vec<(usize, usize)> = Vec::new();
        for (ci, id) in group.iter().enumerate() {
            for child in &all_children[id] {
                if let Some(&ni) = pos_in_next.get(child.as_str()) {
                    edges.push((ci, ni));
                }
            }
        }
        total += count_crossings_between(&edges);
    }

    total
}

/// Sugiyama-style auto-layout with crossing minimization:
/// 1. Assign ranks via longest-path BFS from roots
/// 2. Insert virtual nodes for edges spanning >1 rank
/// 3. Barycenter ordering with alternating up/down sweeps
/// 4. Adjacent swap optimization to reduce crossings
/// 5. Coordinate assignment
pub fn auto_layout(
    elements: &[DiagramElement],
    connections: &[Connection],
    options: Option<&LayoutOptions>,
) -> Vec<DiagramElement> {
    if elements.is_empty() {
        return elements.to_vec();
    }

    let direction = options
        .and_then(|o| o.direction)
        .unwrap_or(LayoutDirection::LR);
    let node_spacing = options.and_then(|o| o.node_spacing).unwrap_or(60.0);
    let rank_spacing = options.and_then(|o| o.rank_spacing).unwrap_or(100.0);

    // Resolve sizes
    let mut sizes: HashMap<&str, (f64, f64)> = HashMap::new();
    for el in elements {
        let w = el
            .width
            .filter(|&w| w > 0.0)
            .unwrap_or_else(|| compute_width(el));
        let h = el
            .height
            .filter(|&h| h > 0.0)
            .unwrap_or_else(|| compute_height(el));
        sizes.insert(&el.id, (w, h));
    }

    // Build adjacency
    let node_ids: HashSet<&str> = elements.iter().map(|e| e.id.as_str()).collect();
    let mut children: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut parents: HashMap<&str, Vec<&str>> = HashMap::new();

    for el in elements {
        children.insert(&el.id, Vec::new());
        parents.insert(&el.id, Vec::new());
    }

    for conn in connections {
        if !node_ids.contains(conn.from_id.as_str()) || !node_ids.contains(conn.to_id.as_str()) {
            continue;
        }
        children
            .get_mut(conn.from_id.as_str())
            .unwrap()
            .push(&conn.to_id);
        parents
            .get_mut(conn.to_id.as_str())
            .unwrap()
            .push(&conn.from_id);
    }

    // Step 1: Assign ranks via longest path from roots
    let mut ranks: HashMap<&str, usize> = HashMap::new();
    let roots: Vec<&str> = elements
        .iter()
        .filter(|el| parents[el.id.as_str()].is_empty())
        .map(|el| el.id.as_str())
        .collect();

    let start_nodes: Vec<&str> = if roots.is_empty() {
        elements.iter().map(|el| el.id.as_str()).collect()
    } else {
        roots
    };

    let mut queue = VecDeque::new();
    for &id in &start_nodes {
        ranks.insert(id, 0);
        queue.push_back(id);
    }

    while let Some(id) = queue.pop_front() {
        let rank = ranks[id];
        for &child_id in &children[id] {
            let prev_rank = ranks.get(child_id).copied();
            if prev_rank.is_none() || rank + 1 > prev_rank.unwrap() {
                ranks.insert(child_id, rank + 1);
                queue.push_back(child_id);
            }
        }
    }

    for el in elements {
        ranks.entry(&el.id).or_insert(0);
    }

    // Step 2: Build extended graph with virtual nodes for long edges.
    // Virtual nodes represent edge segments at intermediate ranks so that
    // the barycenter heuristic can "see" long edges and avoid crossings.
    let mut all_ids: Vec<String> = elements.iter().map(|e| e.id.clone()).collect();
    let mut all_ranks: HashMap<String, usize> = HashMap::new();
    let mut all_children: HashMap<String, Vec<String>> = HashMap::new();
    let mut all_parents: HashMap<String, Vec<String>> = HashMap::new();
    let mut virtual_sizes: HashMap<String, (f64, f64)> = HashMap::new();

    for el in elements {
        all_ranks.insert(el.id.clone(), ranks[el.id.as_str()]);
        all_children.insert(el.id.clone(), Vec::new());
        all_parents.insert(el.id.clone(), Vec::new());
        virtual_sizes.insert(el.id.clone(), sizes[el.id.as_str()]);
    }

    let mut virtual_counter = 0usize;
    for conn in connections {
        if !node_ids.contains(conn.from_id.as_str()) || !node_ids.contains(conn.to_id.as_str()) {
            continue;
        }
        let from_rank = ranks[conn.from_id.as_str()];
        let to_rank = ranks[conn.to_id.as_str()];

        if to_rank > from_rank + 1 {
            // Long edge: insert virtual nodes at each intermediate rank
            let mut prev_id = conn.from_id.clone();
            for r in (from_rank + 1)..to_rank {
                let virt_id = format!("__v{}", virtual_counter);
                virtual_counter += 1;

                all_ids.push(virt_id.clone());
                all_ranks.insert(virt_id.clone(), r);
                virtual_sizes.insert(virt_id.clone(), (0.0, 0.0));
                all_children.insert(virt_id.clone(), Vec::new());
                all_parents.insert(virt_id.clone(), Vec::new());

                all_children
                    .get_mut(&prev_id)
                    .unwrap()
                    .push(virt_id.clone());
                all_parents
                    .get_mut(&virt_id)
                    .unwrap()
                    .push(prev_id.clone());

                prev_id = virt_id;
            }
            all_children
                .get_mut(&prev_id)
                .unwrap()
                .push(conn.to_id.clone());
            all_parents
                .get_mut(&conn.to_id)
                .unwrap()
                .push(prev_id);
        } else {
            all_children
                .get_mut(&conn.from_id)
                .unwrap()
                .push(conn.to_id.clone());
            all_parents
                .get_mut(&conn.to_id)
                .unwrap()
                .push(conn.from_id.clone());
        }
    }

    // Step 3: Group by rank (including virtual nodes)
    let mut rank_groups: HashMap<usize, Vec<String>> = HashMap::new();
    for id in &all_ids {
        let r = all_ranks[id];
        rank_groups.entry(r).or_default().push(id.clone());
    }

    let mut sorted_ranks: Vec<usize> = rank_groups.keys().copied().collect();
    sorted_ranks.sort();

    // Step 4: Barycenter ordering with alternating down/up sweeps
    let mut order: HashMap<String, f64> = HashMap::new();
    for group in rank_groups.values() {
        for (i, id) in group.iter().enumerate() {
            order.insert(id.clone(), i as f64);
        }
    }

    for iteration in 0..24 {
        if iteration % 2 == 0 {
            // Downward sweep: order by parent positions
            for &rank in &sorted_ranks {
                let group = rank_groups.get(&rank).unwrap();
                let mut barycenters: Vec<(String, f64)> = group
                    .iter()
                    .map(|id| {
                        let p = &all_parents[id];
                        if p.is_empty() {
                            (id.clone(), order.get(id).copied().unwrap_or(0.0))
                        } else {
                            let sum: f64 = p
                                .iter()
                                .map(|n| order.get(n).copied().unwrap_or(0.0))
                                .sum();
                            (id.clone(), sum / p.len() as f64)
                        }
                    })
                    .collect();
                barycenters.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
                for (i, (id, _)) in barycenters.iter().enumerate() {
                    order.insert(id.clone(), i as f64);
                }
                let group_mut = rank_groups.get_mut(&rank).unwrap();
                group_mut.clear();
                group_mut.extend(barycenters.into_iter().map(|(id, _)| id));
            }
        } else {
            // Upward sweep: order by children positions
            for &rank in sorted_ranks.iter().rev() {
                let group = rank_groups.get(&rank).unwrap();
                let mut barycenters: Vec<(String, f64)> = group
                    .iter()
                    .map(|id| {
                        let c = &all_children[id];
                        if c.is_empty() {
                            (id.clone(), order.get(id).copied().unwrap_or(0.0))
                        } else {
                            let sum: f64 = c
                                .iter()
                                .map(|n| order.get(n).copied().unwrap_or(0.0))
                                .sum();
                            (id.clone(), sum / c.len() as f64)
                        }
                    })
                    .collect();
                barycenters.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
                for (i, (id, _)) in barycenters.iter().enumerate() {
                    order.insert(id.clone(), i as f64);
                }
                let group_mut = rank_groups.get_mut(&rank).unwrap();
                group_mut.clear();
                group_mut.extend(barycenters.into_iter().map(|(id, _)| id));
            }
        }
    }

    // Step 5: Adjacent swap optimization — greedily swap neighbors to reduce crossings
    for _ in 0..8 {
        let mut improved = false;
        for ri in 0..sorted_ranks.len() {
            let rank = sorted_ranks[ri];
            let group_len = rank_groups[&rank].len();
            if group_len < 2 {
                continue;
            }

            for i in 0..(group_len - 1) {
                let crossings_before = count_layer_crossings(
                    &rank_groups,
                    &all_children,
                    &all_parents,
                    &sorted_ranks,
                    ri,
                );

                rank_groups.get_mut(&rank).unwrap().swap(i, i + 1);

                let crossings_after = count_layer_crossings(
                    &rank_groups,
                    &all_children,
                    &all_parents,
                    &sorted_ranks,
                    ri,
                );

                if crossings_after >= crossings_before {
                    rank_groups.get_mut(&rank).unwrap().swap(i, i + 1);
                } else {
                    improved = true;
                    let group = &rank_groups[&rank];
                    for (j, id) in group.iter().enumerate() {
                        order.insert(id.clone(), j as f64);
                    }
                }
            }
        }
        if !improved {
            break;
        }
    }

    // Step 6: Coordinate assignment — median-based with spacing constraints.
    // Instead of simple centering (which ignores connections), place each node
    // at the median position of its neighbors, then resolve overlaps.
    let is_horizontal = matches!(direction, LayoutDirection::LR | LayoutDirection::RL);
    let is_reversed = matches!(direction, LayoutDirection::RL | LayoutDirection::BT);

    // Helper: get secondary size of a node
    let sec_size = |id: &str| -> f64 {
        let (w, h) = virtual_sizes[id];
        if is_horizontal { h } else { w }
    };
    // Helper: get primary size of a node
    let pri_size = |id: &str| -> f64 {
        let (w, h) = virtual_sizes[id];
        if is_horizontal { w } else { h }
    };

    // Assign primary (rank-axis) coordinates
    let mut rank_primary: HashMap<usize, f64> = HashMap::new();
    let mut primary_offset = 0.0;
    for &rank in &sorted_ranks {
        rank_primary.insert(rank, primary_offset);
        let max_pri = rank_groups[&rank]
            .iter()
            .map(|id| pri_size(id))
            .fold(0.0_f64, f64::max);
        primary_offset += max_pri + rank_spacing;
    }

    // Initial secondary placement: center each rank (starting point for refinement)
    let mut sec: HashMap<String, f64> = HashMap::new();
    for &rank in &sorted_ranks {
        let group = &rank_groups[&rank];
        let total: f64 = group
            .iter()
            .enumerate()
            .map(|(i, id)| sec_size(id) + if i > 0 { node_spacing } else { 0.0 })
            .sum();
        let mut offset = -total / 2.0;
        for id in group {
            sec.insert(id.clone(), offset);
            offset += sec_size(id) + node_spacing;
        }
    }

    // Resolve overlaps within a rank: push nodes right to maintain minimum spacing.
    // Preserves the left-to-right ordering.
    let resolve_overlaps = |sec: &mut HashMap<String, f64>,
                            group: &[String],
                            node_spacing: f64,
                            virtual_sizes: &HashMap<String, (f64, f64)>,
                            is_horizontal: bool| {
        let sec_sz = |id: &str| -> f64 {
            let (w, h) = virtual_sizes[id];
            if is_horizontal { h } else { w }
        };
        // Left-to-right: ensure minimum spacing
        let mut prev_right = f64::NEG_INFINITY;
        for id in group {
            let s = sec_sz(id);
            let min_pos = if prev_right == f64::NEG_INFINITY {
                sec[id.as_str()]
            } else {
                prev_right + node_spacing
            };
            let pos = sec[id.as_str()].max(min_pos);
            sec.insert(id.clone(), pos);
            prev_right = pos + s;
        }
    };

    // Median refinement: iteratively pull nodes toward the median of their neighbors
    for _ in 0..20 {
        // Downward pass: align with parents
        for ri in 1..sorted_ranks.len() {
            let rank = sorted_ranks[ri];
            let group = rank_groups[&rank].clone();

            for id in &group {
                let parents = &all_parents[id];
                if parents.is_empty() {
                    continue;
                }
                let mut parent_centers: Vec<f64> = parents
                    .iter()
                    .map(|pid| sec[pid.as_str()] + sec_size(pid) / 2.0)
                    .collect();
                parent_centers.sort_by(|a, b| a.partial_cmp(b).unwrap());
                let median = parent_centers[parent_centers.len() / 2];
                let ideal = median - sec_size(id) / 2.0;
                sec.insert(id.clone(), ideal);
            }

            resolve_overlaps(
                &mut sec,
                &rank_groups[&rank],
                node_spacing,
                &virtual_sizes,
                is_horizontal,
            );
        }

        // Upward pass: align with children
        for ri in (0..sorted_ranks.len().saturating_sub(1)).rev() {
            let rank = sorted_ranks[ri];
            let group = rank_groups[&rank].clone();

            for id in &group {
                let children = &all_children[id];
                if children.is_empty() {
                    continue;
                }
                let mut child_centers: Vec<f64> = children
                    .iter()
                    .map(|cid| sec[cid.as_str()] + sec_size(cid) / 2.0)
                    .collect();
                child_centers.sort_by(|a, b| a.partial_cmp(b).unwrap());
                let median = child_centers[child_centers.len() / 2];
                let ideal = median - sec_size(id) / 2.0;
                sec.insert(id.clone(), ideal);
            }

            resolve_overlaps(
                &mut sec,
                &rank_groups[&rank],
                node_spacing,
                &virtual_sizes,
                is_horizontal,
            );
        }
    }

    // Build position map
    let mut positions: HashMap<String, (f64, f64)> = HashMap::new();
    for &rank in &sorted_ranks {
        let primary = rank_primary[&rank];
        for id in &rank_groups[&rank] {
            let secondary = sec[id.as_str()];
            if is_horizontal {
                positions.insert(id.clone(), (primary, secondary));
            } else {
                positions.insert(id.clone(), (secondary, primary));
            }
        }
    }

    // Reverse if needed
    if is_reversed {
        let max_primary = primary_offset - rank_spacing;
        for (id, pos) in positions.iter_mut() {
            let (w, h) = virtual_sizes[id.as_str()];
            if is_horizontal {
                pos.0 = max_primary - pos.0 - w;
            } else {
                pos.1 = max_primary - pos.1 - h;
            }
        }
    }

    // Shift so min x/y is 0 (real nodes only)
    let min_x = positions
        .iter()
        .filter(|(id, _)| !id.starts_with("__v"))
        .map(|(_, p)| p.0)
        .fold(f64::INFINITY, f64::min);
    let min_y = positions
        .iter()
        .filter(|(id, _)| !id.starts_with("__v"))
        .map(|(_, p)| p.1)
        .fold(f64::INFINITY, f64::min);
    for pos in positions.values_mut() {
        pos.0 -= min_x;
        pos.1 -= min_y;
    }

    elements
        .iter()
        .map(|el| {
            let (px, py) = positions.get(&el.id).copied().unwrap_or((
                el.x.unwrap_or(0.0),
                el.y.unwrap_or(0.0),
            ));
            let (w, h) = sizes[el.id.as_str()];
            DiagramElement {
                x: Some(px.round()),
                y: Some(py.round()),
                width: Some(w),
                height: Some(h),
                ..el.clone()
            }
        })
        .collect()
}
