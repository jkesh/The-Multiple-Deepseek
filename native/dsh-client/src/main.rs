//! dsh-client: native egui desktop client for DeepSeek Harness.
//! Talks to the local dsh web backend over the pinned protocol
//! (see docs/native-client.md); no webview, no served WebUI.

mod app;
mod backend;

use std::sync::Arc;

/// Load a CJK-capable font so Chinese product copy renders; falls back to the
/// egui built-ins when no system font is found.
fn setup_fonts(ctx: &egui::Context) {
    const CANDIDATES: [&str; 4] = [
        "C:\\Windows\\Fonts\\msyh.ttc",
        "C:\\Windows\\Fonts\\simhei.ttf",
        "C:\\Windows\\Fonts\\msyhl.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ];
    for path in CANDIDATES {
        let Ok(bytes) = std::fs::read(path) else { continue };
        let mut fonts = egui::FontDefinitions::default();
        fonts
            .font_data
            .insert("cjk".to_string(), Arc::new(egui::FontData::from_owned(bytes)));
        for family in [egui::FontFamily::Proportional, egui::FontFamily::Monospace] {
            fonts
                .families
                .entry(family)
                .or_default()
                .insert(0, "cjk".to_string());
        }
        ctx.set_fonts(fonts);
        return;
    }
}

fn main() -> eframe::Result {
    let base = std::env::var("DSH_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:3080".to_string());
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("DeepSeek Harness")
            .with_inner_size([1280.0, 820.0])
            .with_min_inner_size([900.0, 620.0]),
        ..Default::default()
    };
    eframe::run_native(
        "dsh-client",
        options,
        Box::new(move |creation_context| {
            setup_fonts(&creation_context.egui_ctx);
            Ok(Box::new(app::App::new(&base)))
        }),
    )
}
