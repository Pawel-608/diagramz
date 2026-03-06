use std::env;
use std::fs;

use diagramz_renderer::render::{encode_png, render_diagram_auto, RenderOptions};
use diagramz_renderer::svg::render_svg;
use diagramz_renderer::types::Diagram;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: diagramz-render <input.json> <output.png|svg>");
        std::process::exit(1);
    }

    let input = &args[1];
    let output = &args[2];

    let json = fs::read_to_string(input).expect("Failed to read input file");
    let diagram: Diagram = serde_json::from_str(&json).expect("Failed to parse diagram JSON");

    let options = RenderOptions::default();

    if output.ends_with(".svg") {
        let svg = render_svg(&diagram, &options);
        fs::write(output, svg).expect("Failed to write SVG");
        eprintln!("Wrote SVG: {}", output);
    } else {
        let (pixels, w, h) = render_diagram_auto(&diagram, &options);
        let png_data = encode_png(&pixels, w, h);
        fs::write(output, png_data).expect("Failed to write PNG");
        eprintln!("Wrote PNG: {} ({}x{})", output, w, h);
    }
}
