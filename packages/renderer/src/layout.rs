use std::collections::{HashMap, HashSet, VecDeque};

use crate::text;
use crate::types::{Connection, DiagramElement, LayoutDirection, LayoutOptions};

fn compute_width(el: &DiagramElement) -> f64 {
    let font_size = el
        .style
        .as_ref()
        .and_then(|s| s.font_size)
        .unwrap_or(16.0);
    let padding = 40.0_f64;

    let label_w = el
        .label
        .as_ref()
        .map(|l| {
            // Measure with both fonts and take the max for safety
            let (sw, _) = text::measure_text(l, font_size, true);
            let (cw, _) = text::measure_text(l, font_size, false);
            sw.max(cw) as f64 + padding
        })
        .unwrap_or(0.0);

    let body_font_size = font_size - 2.0;
    let body_padding = 32.0_f64;
    let body_w = el
        .body
        .as_ref()
        .map(|items| {
            items
                .iter()
                .map(|s| {
                    let (sw, _) = text::measure_text(s, body_font_size, true);
                    let (cw, _) = text::measure_text(s, body_font_size, false);
                    sw.max(cw) as f64 + body_padding
                })
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

/// Ensure all elements have minimum width/height to fit their text content.
pub fn ensure_min_sizes(elements: &mut [DiagramElement]) {
    for el in elements.iter_mut() {
        let min_w = compute_width(el);
        let min_h = compute_height(el);
        match el.width {
            Some(w) if w >= min_w => {}
            _ => el.width = Some(min_w),
        }
        match el.height {
            Some(h) if h >= min_h => {}
            _ => el.height = Some(min_h),
        }
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

/// Find connected components using element indices.
fn find_components(
    elements: &[DiagramElement],
    connections: &[Connection],
) -> Vec<Vec<usize>> {
    let id_to_idx: HashMap<&str, usize> = elements
        .iter()
        .enumerate()
        .map(|(i, e)| (e.id.as_str(), i))
        .collect();

    let n = elements.len();
    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
    for conn in connections {
        if let (Some(&a), Some(&b)) = (
            id_to_idx.get(conn.from_id.as_str()),
            id_to_idx.get(conn.to_id.as_str()),
        ) {
            adj[a].push(b);
            adj[b].push(a);
        }
    }

    let mut visited = vec![false; n];
    let mut components = Vec::new();
    for start in 0..n {
        if visited[start] {
            continue;
        }
        let mut comp = Vec::new();
        let mut queue = VecDeque::new();
        queue.push_back(start);
        visited[start] = true;
        while let Some(node) = queue.pop_front() {
            comp.push(node);
            for &nb in &adj[node] {
                if !visited[nb] {
                    visited[nb] = true;
                    queue.push_back(nb);
                }
            }
        }
        components.push(comp);
    }
    // Sort: largest component first
    components.sort_by(|a, b| b.len().cmp(&a.len()));
    components
}

/// Sugiyama-style auto-layout with crossing minimization:
/// 1. Separate connected components
/// 2. Assign ranks via longest-path BFS from roots
/// 3. Insert virtual nodes for edges spanning >1 rank
/// 4. Barycenter ordering with alternating up/down sweeps
/// 5. Adjacent swap optimization to reduce crossings
/// 6. Coordinate assignment
/// 7. Arrange components side by side
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

    // Find connected components and lay out each independently
    let components = find_components(elements, connections);
    if components.len() > 1 {
        let is_horizontal = matches!(direction, LayoutDirection::LR | LayoutDirection::RL);
        let mut result = elements.to_vec();
        // Layout secondary offset for stacking components
        let mut stack_offset = 0.0_f64;
        let component_gap = 80.0;

        for comp_indices in &components {
            let comp_elements: Vec<DiagramElement> =
                comp_indices.iter().map(|&i| elements[i].clone()).collect();
            let comp_ids: HashSet<&str> =
                comp_elements.iter().map(|e| e.id.as_str()).collect();
            let comp_connections: Vec<Connection> = connections
                .iter()
                .filter(|c| {
                    comp_ids.contains(c.from_id.as_str())
                        && comp_ids.contains(c.to_id.as_str())
                })
                .cloned()
                .collect();

            let laid_out = layout_component(&comp_elements, &comp_connections, direction, node_spacing, rank_spacing);

            // Find bounding box of this component
            let mut min_sec = f64::INFINITY;
            let mut max_sec = f64::NEG_INFINITY;
            for el in &laid_out {
                let s = if is_horizontal { el.y.unwrap_or(0.0) } else { el.x.unwrap_or(0.0) };
                let sz = if is_horizontal { el.height.unwrap_or(60.0) } else { el.width.unwrap_or(120.0) };
                min_sec = min_sec.min(s);
                max_sec = max_sec.max(s + sz);
            }

            // Shift component to stack_offset
            let shift = stack_offset - min_sec;
            for (li, el) in laid_out.into_iter().enumerate() {
                let orig_idx = comp_indices[li];
                result[orig_idx] = el;
                if is_horizontal {
                    result[orig_idx].y = Some(result[orig_idx].y.unwrap_or(0.0) + shift);
                } else {
                    result[orig_idx].x = Some(result[orig_idx].x.unwrap_or(0.0) + shift);
                }
            }
            stack_offset = stack_offset.max(max_sec + shift) + component_gap;
        }

        // Normalize: shift so min x/y = 0
        let min_x = result.iter().map(|e| e.x.unwrap_or(0.0)).fold(f64::INFINITY, f64::min);
        let min_y = result.iter().map(|e| e.y.unwrap_or(0.0)).fold(f64::INFINITY, f64::min);
        for el in &mut result {
            el.x = Some(el.x.unwrap_or(0.0) - min_x);
            el.y = Some(el.y.unwrap_or(0.0) - min_y);
        }
        return result;
    }

    layout_component(elements, connections, direction, node_spacing, rank_spacing)
}

fn layout_component(
    elements: &[DiagramElement],
    connections: &[Connection],
    direction: LayoutDirection,
    node_spacing: f64,
    rank_spacing: f64,
) -> Vec<DiagramElement> {
    if elements.is_empty() {
        return Vec::new();
    }

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

    let max_rank = elements.len();
    while let Some(id) = queue.pop_front() {
        let rank = ranks[id];
        if rank >= max_rank {
            continue; // cycle detected, stop propagating
        }
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

    // Rank promotion: when a node has parents at very different ranks,
    // promote it to min_parent_rank + 1 to shorten long edges.
    // This may create backward edges (child rank < parent rank) which
    // we handle by reversing their layout direction.
    let mut rank_changed = true;
    let mut promotion_iters = 0;
    while rank_changed && promotion_iters < max_rank {
        promotion_iters += 1;
        rank_changed = false;
        for el in elements {
            let id = el.id.as_str();
            let parent_ranks: Vec<usize> =
                parents[id].iter().filter_map(|p| ranks.get(p).copied()).collect();
            if parent_ranks.len() < 2 {
                continue;
            }
            let max_r = *parent_ranks.iter().max().unwrap();
            let min_r = *parent_ranks.iter().min().unwrap();
            if max_r - min_r > 1 {
                let new_rank = min_r + 1;
                if ranks[id] != new_rank {
                    ranks.insert(id, new_rank);
                    rank_changed = true;
                }
            }
        }
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

        if from_rank < to_rank {
            // Forward edge
            if to_rank > from_rank + 1 {
                // Long forward edge: insert virtual nodes at intermediate ranks
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
                // Span-1 forward edge
                all_children
                    .get_mut(&conn.from_id)
                    .unwrap()
                    .push(conn.to_id.clone());
                all_parents
                    .get_mut(&conn.to_id)
                    .unwrap()
                    .push(conn.from_id.clone());
            }
        } else if from_rank > to_rank {
            // Backward edge (created by rank promotion): reverse direction
            // for layout purposes so the higher-rank node treats the
            // lower-rank node as a layout-parent.
            if from_rank > to_rank + 1 {
                // Long backward edge: insert virtual nodes going upward
                let mut prev_id = conn.to_id.clone();
                for r in (to_rank + 1)..from_rank {
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
                    .push(conn.from_id.clone());
                all_parents
                    .get_mut(&conn.from_id)
                    .unwrap()
                    .push(prev_id);
            } else {
                // Span-1 backward edge: to_id is layout-parent of from_id
                all_children
                    .get_mut(&conn.to_id)
                    .unwrap()
                    .push(conn.from_id.clone());
                all_parents
                    .get_mut(&conn.from_id)
                    .unwrap()
                    .push(conn.to_id.clone());
            }
        } else {
            // Same-rank edge: add as bidirectional neighbors for positioning
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
