//! GUI state and rendering: session sidebar, streaming transcript,
//! composer, model/preset pickers, approval and question modals.

use crate::backend::{Backend, BackendHandle, BackendStatus, Event};
use dsh_remote::chat::{StreamChunk, Transcript};
use egui::containers::panel::{CentralPanel, Panel};
use dsh_remote::domains::{ApprovalOutcome, ApprovalRequested, ModelProviderGroup, ModelSelection, QuestionRequested};
use dsh_remote::model::{SessionEvent, SessionSummary};
use serde::Deserialize;
use serde_json::Value;

/// `session/event` frame payload.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionEventFrame {
    session_id: String,
    event: SessionEvent,
}

/// One pending approval request awaiting an answer.
struct PendingApproval {
    rpc_id: String,
    request: ApprovalRequested,
}

/// Draft state for one question in a pending batch.
#[derive(Clone)]
struct QuestionDraft {
    id: String,
    selected: Vec<String>,
    custom: String,
}

/// One pending ask-user question batch.
struct PendingQuestion {
    rpc_id: String,
    session_id: String,
    questions: Value,
    drafts: Vec<QuestionDraft>,
}

/// (id, label) preset rows for the picker.
type PresetRow = (String, String);

/// One deferred modal action, applied after the borrow-heavy modal loop.
enum ModalAction {
    AnswerApproval { rpc_id: String, session_id: String, approval_id: String, outcome: ApprovalOutcome },
    AnswerQuestions { index: usize },
}

pub struct App {
    backend: Option<Backend>,
    base_url: String,
    sessions: Vec<SessionSummary>,
    selected: Option<String>,
    transcript: Transcript,
    last_seq: u64,
    history_done: bool,
    composer: String,
    status: String,
    connected: bool,
    approvals: Vec<PendingApproval>,
    questions: Vec<PendingQuestion>,
    models: Option<Vec<ModelProviderGroup>>,
    current_model: Option<ModelSelection>,
    picker_provider: Option<String>,
    picker_model: Option<String>,
    picker_effort: Option<String>,
    presets: Vec<PresetRow>,
    picker_preset: Option<String>,
    md_cache: egui_commonmark::CommonMarkCache,
    scroll_bottom: bool,
    backend_status: BackendStatus,
    show_settings: bool,
    settings_cache: Option<Vec<dsh_remote::domains::SettingsNamespaceView>>,
    goal: Option<Value>,
    goal_objective: String,
    show_goal_dialog: bool,
    auto_exit: Option<std::time::Instant>,
}

impl App {
    pub fn new(base: &str, _ctx: egui::Context) -> Self {
        let mut app = App {
            backend: None,
            base_url: base.to_string(),
            sessions: Vec::new(),
            selected: None,
            transcript: Transcript::default(),
            last_seq: 0,
            history_done: false,
            composer: String::new(),
            status: "未连接".to_string(),
            connected: false,
            approvals: Vec::new(),
            questions: Vec::new(),
            models: None,
            current_model: None,
            picker_provider: None,
            picker_model: None,
            picker_effort: None,
            presets: Vec::new(),
            picker_preset: None,
            md_cache: egui_commonmark::CommonMarkCache::default(),
            scroll_bottom: false,
            backend_status: BackendStatus { running: false, owned: false },
            show_settings: false,
            settings_cache: None,
            goal: None,
            goal_objective: String::new(),
            show_goal_dialog: false,
            auto_exit: std::env::var("DSH_AUTO_EXIT_MS")
                .ok()
                .and_then(|value| value.parse::<u64>().ok())
                .map(|millis| std::time::Instant::now() + std::time::Duration::from_millis(millis)),
        };
        app.connect();
        app
    }

    fn connect(&mut self) {
        self.status = "正在连接…".to_string();
        match Backend::connect(&self.base_url, sidecar_argv()) {
            Ok(backend) => {
                self.backend_status.running = backend.handle().client().health();
                self.backend = Some(backend);
                self.refresh_sessions();
                self.refresh_presets();
            }
            Err(error) => {
                self.backend = None;
                self.status = format!("连接失败：{error}");
            }
        }
    }

    fn backend(&self) -> Option<BackendHandle> {
        self.backend.as_ref().map(Backend::handle)
    }

    // -- backend helpers ----------------------------------------------------

    fn refresh_sessions(&mut self) {
        let Some(backend) = self.backend() else { return };
        match backend.call("session.list", serde_json::json!({})) {
            Ok(value) => match serde_json::from_value::<Vec<SessionSummary>>(
                value.get("items").cloned().unwrap_or(Value::Null),
            ) {
                Ok(items) => {
                    self.sessions = items;
                    self.status = "已连接".to_string();
                    self.connected = true;
                }
                Err(error) => self.status = format!("会话列表解析失败：{error}"),
            },
            Err(error) => self.status = format!("会话列表失败：{error}"),
        }
    }

    fn refresh_presets(&mut self) {
        let Some(backend) = self.backend() else { return };
        if let Ok(value) = backend.call("agentPreset.list", serde_json::json!({})) {
            let presets = value.get("presets").cloned().unwrap_or(Value::Null);
            if let Ok(rows) = serde_json::from_value::<Vec<dsh_remote::domains::AgentPresetEntry>>(presets) {
                self.presets = rows
                    .into_iter()
                    .map(|entry| {
                        let label = entry
                            .name
                            .clone()
                            .or(entry.description.clone())
                            .unwrap_or_else(|| entry.id.clone());
                        (entry.id, label)
                    })
                    .collect();
            }
        }
    }

    fn open_session(&mut self, session_id: &str) {
        if self.selected.as_deref() == Some(session_id) && self.history_done {
            return;
        }
        let Some(backend) = self.backend() else { return };
        self.selected = Some(session_id.to_string());
        self.transcript = Transcript::default();
        self.last_seq = 0;
        self.history_done = false;
        self.scroll_bottom = true;

        if let Ok(value) = backend.call("session.history", serde_json::json!({ "sessionId": session_id })) {
            let events = value.get("events").cloned().unwrap_or(Value::Null);
            if let Ok(entries) = serde_json::from_value::<Vec<Value>>(events) {
                for entry in entries {
                    if let Ok(event) =
                        serde_json::from_value::<SessionEvent>(entry.get("event").cloned().unwrap_or(Value::Null))
                    {
                        if event.seq > self.last_seq {
                            self.last_seq = event.seq;
                            self.transcript.apply(&event);
                        }
                    }
                }
            }
        }
        self.history_done = true;

        match backend.call("session.models", serde_json::json!({ "sessionId": session_id })) {
            Ok(value) => {
                self.current_model =
                    serde_json::from_value::<ModelSelection>(value.get("current").cloned().unwrap_or(Value::Null)).ok();
                self.models =
                    serde_json::from_value::<Vec<ModelProviderGroup>>(value.get("groups").cloned().unwrap_or(Value::Null)).ok();
                if let Some(current) = &self.current_model {
                    self.picker_provider = Some(current.provider.clone());
                    self.picker_model = Some(current.model.clone());
                    self.picker_effort = current.reasoning_effort.clone();
                }
            }
            Err(error) => self.status = format!("模型目录失败：{error}"),
        }
    }

    fn running(&self) -> bool {
        self.transcript.current_turn > 0
            && !self.transcript.finished_turns.contains(&self.transcript.current_turn)
    }

    fn send_composer(&mut self) {
        let Some(backend) = self.backend() else { return };
        let Some(session_id) = self.selected.clone() else { return };
        let text = self.composer.trim().to_string();
        if text.is_empty() {
            return;
        }
        let payload = serde_json::json!({
            "sessionId": session_id,
            "mode": "queue",
            "content": [{ "type": "text", "text": text }],
        });
        match backend.call("session.prompt", payload) {
            Ok(value) => {
                if value.get("accepted").and_then(Value::as_bool) == Some(true) {
                    self.composer.clear();
                    self.scroll_bottom = true;
                } else {
                    self.status = "发送被拒绝".to_string();
                }
            }
            Err(error) => self.status = format!("发送失败：{error}"),
        }
    }

    fn answer_approval(&mut self, rpc_id: &str, session_id: &str, approval_id: &str, outcome: ApprovalOutcome) {
        let Some(backend) = self.backend() else { return };
        match backend.client().respond_approval(rpc_id, session_id, approval_id, outcome) {
            Ok(receipt) => {
                if receipt.accepted {
                    self.approvals.retain(|pending| pending.rpc_id != rpc_id);
                } else {
                    self.status = format!("审批应答未受理：{}", receipt.reason.as_deref().unwrap_or("-"));
                    self.approvals.retain(|pending| pending.rpc_id != rpc_id);
                }
            }
            Err(error) => self.status = format!("审批应答失败：{error}"),
        }
    }

    fn answer_questions(&mut self, index: usize) {
        let Some(pending) = self.questions.get(index) else { return };
        let (rpc_id, session_id) = (pending.rpc_id.clone(), pending.session_id.clone());
        let answers: Vec<Value> = pending
            .drafts
            .iter()
            .map(|draft| {
                let mut entry = serde_json::json!({ "id": draft.id, "selected": draft.selected });
                if !draft.custom.is_empty() {
                    entry["custom"] = Value::String(draft.custom.clone());
                }
                entry
            })
            .collect();
        let value = serde_json::json!({ "sessionId": session_id, "answer": { "answers": answers } });
        let Some(backend) = self.backend() else { return };
        match backend.client().respond(&rpc_id, value) {
            Ok(receipt) => {
                if receipt.accepted {
                    self.questions.remove(index);
                } else {
                    self.status = format!("提问应答未受理：{}", receipt.reason.as_deref().unwrap_or("-"));
                    self.questions.remove(index);
                }
            }
            Err(error) => self.status = format!("提问应答失败：{error}"),
        }
    }

    fn apply_model(&mut self) {
        let Some(backend) = self.backend() else { return };
        let Some(session_id) = self.selected.clone() else { return };
        let (Some(provider), Some(model)) = (self.picker_provider.clone(), self.picker_model.clone()) else {
            self.status = "未选择模型".to_string();
            return;
        };
        let payload = serde_json::json!({
            "sessionId": session_id,
            "provider": provider,
            "model": model,
            "reasoningEffort": self.picker_effort,
        });
        match backend.call("session.selectModel", payload) {
            Ok(value) => {
                if let Ok(selected) =
                    serde_json::from_value::<ModelSelection>(value.get("selected").cloned().unwrap_or(Value::Null))
                {
                    self.current_model = Some(selected);
                    self.status = "模型已切换".to_string();
                }
            }
            Err(error) => self.status = format!("切换模型失败：{error}"),
        }
    }

    fn apply_preset(&mut self) {
        let Some(backend) = self.backend() else { return };
        let Some(session_id) = self.selected.clone() else { return };
        let Some(preset) = self.picker_preset.clone() else { return };
        let payload = serde_json::json!({ "sessionId": session_id, "agentPreset": preset });
        match backend.call("agentPreset.select", payload) {
            Ok(_) => self.status = "预设已切换".to_string(),
            Err(error) => self.status = format!("切换预设失败：{error}"),
        }
    }

    fn new_session(&mut self) {
        let Some(backend) = self.backend() else { return };
        match backend.call("session.create", serde_json::json!({})) {
            Ok(value) => {
                if let Some(session_id) = value.get("sessionId").and_then(Value::as_str) {
                    self.refresh_sessions();
                    self.open_session(session_id);
                }
            }
            Err(error) => self.status = format!("新建会话失败：{error}"),
        }
    }

    fn archive_selected(&mut self) {
        let Some(backend) = self.backend() else { return };
        let Some(session_id) = self.selected.clone() else { return };
        match backend.call("workspace.archiveSession", serde_json::json!({ "sessionId": session_id })) {
            Ok(_) => {
                self.selected = None;
                self.refresh_sessions();
            }
            Err(error) => self.status = format!("归档失败：{error}"),
        }
    }

    // -- event handling -----------------------------------------------------

    fn drain(&mut self, ctx: &egui::Context) {
        if let Some(backend) = &self.backend {
            for event in backend.drain_events() {
                match event {
                    Event::Frame(frame) => self.on_frame(&frame),
                    Event::DownlinkError(error) => {
                        self.status = format!("事件流断开：{error}");
                        self.connected = false;
                    }
                    Event::Reconnected => {
                        self.status = "已连接".to_string();
                        self.connected = true;
                        self.refresh_sessions();
                    }
                    Event::Status(status) => {
                        self.backend_status = status;
                    }
                }
            }
        }
        ctx.request_repaint_after(std::time::Duration::from_millis(if self.running() { 120 } else { 500 }));
    }

    fn on_frame(&mut self, frame: &dsh_remote::Frame) {
        match frame.method.as_str() {
            "session/event" => {
                let Ok(payload) = serde_json::from_value::<SessionEventFrame>(frame.payload.clone()) else { return };
                if self.selected.as_deref() != Some(payload.session_id.as_str()) {
                    return;
                }
                if payload.event.seq <= self.last_seq {
                    return;
                }
                self.last_seq = payload.event.seq;
                let is_delta = matches!(
                    dsh_remote::chat::parse_event_data(&payload.event),
                    dsh_remote::chat::SessionEventData::AssistantChunk {
                        chunk: StreamChunk::TextDelta { .. } | StreamChunk::ReasoningDelta { .. },
                        ..
                    }
                );
                self.transcript.apply(&payload.event);
                if is_delta {
                    self.scroll_bottom = true;
                }
            }
            "approval/requested" => {
                if let Ok(request) = serde_json::from_value::<ApprovalRequested>(frame.payload.clone()) {
                    if !self.approvals.iter().any(|pending| pending.request.approval_id == request.approval_id) {
                        self.approvals.push(PendingApproval { rpc_id: frame.rpc_id.clone(), request });
                    }
                }
            }
            "approval/resolved" => {
                let approval_id = frame.payload.get("approvalId").and_then(Value::as_str).unwrap_or_default();
                self.approvals.retain(|pending| pending.request.approval_id != approval_id);
            }
            "question/requested" => {
                if let Ok(request) = serde_json::from_value::<QuestionRequested>(frame.payload.clone()) {
                    if self.questions.iter().any(|pending| pending.rpc_id == frame.rpc_id) {
                        return;
                    }
                    let drafts = request
                        .questions
                        .as_array()
                        .map(|questions| {
                            questions
                                .iter()
                                .filter_map(|question| {
                                    let id = question.get("id")?.as_str()?.to_string();
                                    Some(QuestionDraft { id, selected: Vec::new(), custom: String::new() })
                                })
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    self.questions.push(PendingQuestion {
                        rpc_id: frame.rpc_id.clone(),
                        session_id: request.session_id,
                        questions: request.questions,
                        drafts,
                    });
                }
            }
            "question/resolved" => {
                self.questions.retain(|pending| pending.rpc_id != frame.rpc_id);
            }
            "session/projection" => {
                let session_id = frame.payload.get("sessionId").and_then(Value::as_str).unwrap_or_default();
                if self.selected.as_deref() != Some(session_id) {
                    return;
                }
                let key = frame.payload.get("key").and_then(Value::as_str).unwrap_or_default();
                if key == "goal" {
                    let value = frame.payload.get("value").cloned().unwrap_or(Value::Null);
                    self.goal = if value.is_null() { None } else { Some(value) };
                }
            }
            _ => {}
        }
    }

    // -- UI -----------------------------------------------------------------

    fn status_bar(&mut self, ui: &mut egui::Ui) {
        let mut start_backend = false;
        let mut stop_backend = false;
        Panel::top("status_bar").show(ui, |ui| {
            ui.horizontal(|ui| {
                let (color, label) = if self.backend_status.running {
                    (egui::Color32::from_rgb(61, 220, 132), "后台运行中")
                } else if self.backend_status.owned {
                    (egui::Color32::from_rgb(245, 185, 68), "后台启动中…")
                } else {
                    (egui::Color32::from_rgb(242, 84, 75), "后台已停止")
                };
                ui.colored_label(color, "●");
                ui.label(label);
                if self.backend_status.running {
                    ui.label(if self.backend_status.owned { "（本程序管理）" } else { "（外部进程）" });
                }
                if !self.backend_status.running
                    && !self.backend_status.owned
                    && ui.button("启动后台").clicked()
                {
                    start_backend = true;
                }
                if self.backend_status.running
                    && self.backend_status.owned
                    && ui.button("停止后台").clicked()
                {
                    stop_backend = true;
                }
                ui.separator();
                ui.label(&self.status);
                ui.separator();
                if self.backend.is_none() && ui.button("重试连接").clicked() {
                    self.connect();
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("新建会话").clicked() {
                        self.new_session();
                    }
                    if ui.button("设置").clicked() {
                        self.show_settings = true;
                    }
                    ui.label(&self.base_url);
                });
            });
        });
        if start_backend {
            if let Some(backend) = &self.backend {
                backend.handle().start_backend();
            }
            self.status = "正在启动后台…".to_string();
        }
        if stop_backend {
            if let Some(backend) = &self.backend {
                backend.handle().stop_backend();
            }
            self.status = "正在停止后台…".to_string();
        }
    }

    fn sidebar(&mut self, ui: &mut egui::Ui) {
        Panel::left("sessions").resizable(true).default_size(250.0).show(ui, |ui| {
            ui.add_space(4.0);
            ui.heading("会话");
            ui.separator();
            let mut open_id: Option<String> = None;
            egui::ScrollArea::vertical().show(ui, |ui| {
                for session in &self.sessions {
                    let title = session.display_name().to_string();
                    let is_selected = self.selected.as_deref() == Some(session.session_id.as_str());
                    let label = if session.running {
                        format!("● {}", title)
                    } else {
                        title
                    };
                    if ui.selectable_label(is_selected, label).clicked() {
                        open_id = Some(session.session_id.clone());
                    }
                }
            });
            if let Some(id) = open_id {
                self.open_session(&id);
            }
        });
    }

    fn inspector(&mut self, ui: &mut egui::Ui) {
        Panel::right("inspector").resizable(true).default_size(280.0).show(ui, |ui| {
            ui.add_space(4.0);
            ui.heading("会话设置");
            ui.separator();
            let Some(session_id) = self.selected.clone() else {
                ui.label("未选择会话");
                return;
            };

            ui.label(format!("会话：{}", short_id(&session_id)));
            ui.separator();

            ui.label("模型");
            let mut apply_model = false;
            if let Some(groups) = &self.models {
                let provider_label = self
                    .picker_provider
                    .as_deref()
                    .and_then(|id| groups.iter().find(|group| group.id == id))
                    .map(|group| group.name.as_str())
                    .unwrap_or("选择 Provider");
                egui::ComboBox::from_label("Provider")
                    .selected_text(provider_label)
                    .show_ui(ui, |ui| {
                        for group in groups {
                            ui.selectable_value(&mut self.picker_provider, Some(group.id.clone()), &group.name);
                        }
                    });
                let group = self
                    .picker_provider
                    .as_deref()
                    .and_then(|id| groups.iter().find(|group| group.id == id))
                    .cloned();
                if let Some(group) = &group {
                    let model_label = self
                        .picker_model
                        .as_deref()
                        .and_then(|id| group.models.iter().find(|model| model.id == id))
                        .map(|model| model.name.clone().unwrap_or_else(|| model.id.clone()))
                        .unwrap_or_else(|| "选择模型".to_string());
                    egui::ComboBox::from_label("模型")
                        .selected_text(model_label)
                        .show_ui(ui, |ui| {
                            for model in &group.models {
                                ui.selectable_value(
                                    &mut self.picker_model,
                                    Some(model.id.clone()),
                                    model.name.as_deref().unwrap_or(model.id.as_str()),
                                );
                            }
                        });
                    let model = self
                        .picker_model
                        .as_deref()
                        .and_then(|id| group.models.iter().find(|model| model.id == id))
                        .cloned();
                    if let Some(model) = &model {
                        if let Some(reasoning) = &model.reasoning {
                            let effort_label = self.picker_effort.clone().unwrap_or_else(|| "默认".to_string());
                            egui::ComboBox::from_label("强度")
                                .selected_text(effort_label)
                                .show_ui(ui, |ui| {
                                    ui.selectable_value(&mut self.picker_effort, None, "默认");
                                    for effort in &reasoning.efforts {
                                        ui.selectable_value(
                                            &mut self.picker_effort,
                                            Some(effort.id.clone()),
                                            &effort.name,
                                        );
                                    }
                                });
                        }
                    }
                }
                if ui.button("应用模型").clicked() {
                    apply_model = true;
                }
            } else {
                ui.label("模型目录不可用");
            }

            ui.separator();
            ui.label("Agent 预设");
            let mut apply_preset = false;
            let preset_label = self
                .picker_preset
                .as_deref()
                .and_then(|id| self.presets.iter().find(|(preset_id, _)| preset_id == id))
                .map(|(_, label)| label.as_str())
                .unwrap_or("选择预设");
            egui::ComboBox::from_label("预设")
                .selected_text(preset_label)
                .show_ui(ui, |ui| {
                    for (id, label) in &self.presets {
                        ui.selectable_value(&mut self.picker_preset, Some(id.clone()), label);
                    }
                });
            if ui.button("应用预设").clicked() {
                apply_preset = true;
            }

            ui.separator();
            ui.label("目标");
            match &self.goal {
                Some(goal) => {
                    let objective = goal.get("objective").and_then(Value::as_str).unwrap_or("(无)");
                    let phase = goal.get("phase").and_then(Value::as_str).unwrap_or("-");
                    let id = goal.get("id").and_then(Value::as_str).unwrap_or("");
                    let revision = goal.get("revision").and_then(Value::as_u64).unwrap_or(0);
                    ui.add(egui::Label::new(objective).wrap());
                    ui.label(format!("状态：{phase}"));
                    let mut goal_action: Option<&str> = None;
                    ui.horizontal_wrapped(|ui| {
                        for (label, action) in [("暂停", "goal.pause"), ("恢复", "goal.resume"), ("完成", "goal.complete"), ("清除", "goal.clear")] {
                            if ui.button(label).clicked() {
                                goal_action = Some(action);
                            }
                        }
                    });
                    if let Some(action) = goal_action {
                        let payload = serde_json::json!({
                            "sessionId": &session_id,
                            "ref": { "id": id, "revision": revision }
                        });
                        if let Some(Err(error)) = self.backend().map(|backend| backend.call(action, payload)) {
                            self.status = format!("目标操作失败：{error}");
                        }
                    }
                }
                None => {
                    ui.label("无目标");
                }
            }
            if ui.button("新建目标").clicked() {
                self.show_goal_dialog = true;
            }

            ui.separator();
            if ui.button("归档会话").clicked() {
                self.archive_selected();
            }

            if apply_model {
                self.apply_model();
            }
            if apply_preset {
                self.apply_preset();
            }
        });
    }

    fn transcript_ui(&mut self, ui: &mut egui::Ui) {
        CentralPanel::default().show(ui, |ui| {
            egui::ScrollArea::vertical()
                .auto_shrink([false, false])
                .stick_to_bottom(self.scroll_bottom)
                .show(ui, |ui| {
                    ui.add_space(6.0);
                    for message in &self.transcript.messages {
                        match message.role.as_str() {
                            "user" => {
                                ui.horizontal_wrapped(|ui| {
                                    ui.label(egui::RichText::new("你").strong());
                                    ui.add_space(6.0);
                                });
                                ui.label(egui::RichText::new(message.text()).size(15.0));
                            }
                            "assistant" => {
                                ui.horizontal_wrapped(|ui| {
                                    ui.label(egui::RichText::new("助手").strong().color(egui::Color32::from_rgb(98, 148, 255)));
                                    ui.add_space(6.0);
                                });
                                let text = message.text();
                                if !text.is_empty() {
                                    egui_commonmark::CommonMarkViewer::new()
                                        .show(ui, &mut self.md_cache, &text);
                                }
                                for (key, tool) in &message.tool_calls {
                                    egui::CollapsingHeader::new(format!("🔧 {}", tool.name))
                                        .id_salt(("tool", key))
                                        .show(ui, |ui| {
                                            if !tool.arguments.is_empty() {
                                                ui.label("参数");
                                                ui.add(
                                                    egui::Label::new(truncate(&tool.arguments, 2000))
                                                        .wrap(),
                                                );
                                            }
                                            if let Some(result) = &tool.result {
                                                ui.label("结果");
                                                ui.add(
                                                    egui::Label::new(truncate(&result.to_string(), 4000))
                                                        .wrap(),
                                                );
                                            }
                                        });
                                }
                            }
                            _ => {}
                        }
                        ui.separator();
                    }
                    if self.running() {
                        ui.horizontal(|ui| {
                            ui.spinner();
                            ui.label("思考中…");
                        });
                    }
                });
            self.scroll_bottom = false;
        });
    }

    fn composer_ui(&mut self, ui: &mut egui::Ui) {
        Panel::bottom("composer").resizable(true).show(ui, |ui| {
            ui.add_space(4.0);
            let response = ui.add(
                egui::TextEdit::multiline(&mut self.composer)
                    .desired_rows(3)
                    .hint_text("输入消息，Enter 发送，Shift+Enter 换行"),
            );
            let send_clicked = ui.button("发送").clicked();
            let send_key = ui.input(|input| input.key_pressed(egui::Key::Enter) && !input.modifiers.shift)
                && response.has_focus();
            if send_clicked || send_key {
                self.send_composer();
                response.request_focus();
            }
            ui.add_space(4.0);
        });
    }

    fn modals(&mut self, ctx: &egui::Context) {
        let mut actions: Vec<ModalAction> = Vec::new();

        let mut remove_approvals: Vec<usize> = Vec::new();
        for (index, pending) in self.approvals.iter().enumerate() {
            let mut open = true;
            egui::Window::new(format!("审批请求 · {}", pending.request.tool_name))
                .id(egui::Id::new(("approval", &pending.request.approval_id)))
                .collapsible(false)
                .resizable(false)
                .open(&mut open)
                .show(ctx, |ui| {
                    ui.label(format!("会话 {}", short_id(&pending.request.session_id)));
                    if let Some(reason) = &pending.request.reason {
                        ui.add(egui::Label::new(reason).wrap());
                    }
                    ui.horizontal(|ui| {
                        if ui.button("允许一次").clicked() {
                            actions.push(ModalAction::AnswerApproval {
                                rpc_id: pending.rpc_id.clone(),
                                session_id: pending.request.session_id.clone(),
                                approval_id: pending.request.approval_id.clone(),
                                outcome: ApprovalOutcome::AllowedOnce,
                            });
                        }
                        if ui.button("拒绝").clicked() {
                            actions.push(ModalAction::AnswerApproval {
                                rpc_id: pending.rpc_id.clone(),
                                session_id: pending.request.session_id.clone(),
                                approval_id: pending.request.approval_id.clone(),
                                outcome: ApprovalOutcome::Rejected,
                            });
                        }
                    });
                });
            if !open {
                remove_approvals.push(index);
            }
        }
        for index in remove_approvals.into_iter().rev() {
            self.approvals.remove(index);
        }

        let mut remove_questions: Vec<usize> = Vec::new();
        for (index, pending) in self.questions.iter_mut().enumerate() {
            let mut open = true;
            let mut submit = false;
            egui::Window::new("需要回答")
                .id(egui::Id::new(("question", &pending.rpc_id)))
                .collapsible(false)
                .resizable(false)
                .open(&mut open)
                .show(ctx, |ui| {
                    let questions = pending.questions.as_array().cloned().unwrap_or_default();
                    for (question_index, question) in questions.iter().enumerate() {
                        let draft = pending.drafts.get_mut(question_index);
                        let header = question.get("header").and_then(Value::as_str).unwrap_or("问题");
                        let text = question.get("question").and_then(Value::as_str).unwrap_or("");
                        let multi = question.get("multi_select").and_then(Value::as_bool).unwrap_or(false);
                        ui.label(egui::RichText::new(header).strong());
                        ui.add(egui::Label::new(text).wrap());
                        let options = question.get("options").and_then(Value::as_array).cloned().unwrap_or_default();
                        if let Some(draft) = draft {
                            for option in &options {
                                let label = option.get("label").and_then(Value::as_str).unwrap_or("?");
                                let mut checked = draft.selected.contains(&label.to_string());
                                if ui.checkbox(&mut checked, label).changed() {
                                    if checked {
                                        if !multi {
                                            draft.selected.clear();
                                        }
                                        draft.selected.push(label.to_string());
                                    } else {
                                        draft.selected.retain(|selected| selected != label);
                                    }
                                }
                            }
                            ui.horizontal(|ui| {
                                ui.label("其他说明");
                                ui.text_edit_singleline(&mut draft.custom);
                            });
                        } else {
                            ui.label("（选项渲染失败）");
                        }
                        ui.separator();
                    }
                    if ui.button("提交回答").clicked() {
                        submit = true;
                    }
                });
            if submit {
                actions.push(ModalAction::AnswerQuestions { index });
            }
            if !open {
                remove_questions.push(index);
            }
        }
        for index in remove_questions.into_iter().rev() {
            self.questions.remove(index);
        }

        for action in actions {
            match action {
                ModalAction::AnswerApproval { rpc_id, session_id, approval_id, outcome } => {
                    self.answer_approval(&rpc_id, &session_id, &approval_id, outcome);
                }
                ModalAction::AnswerQuestions { index } => self.answer_questions(index),
            }
        }
    }
}

impl App {
    fn settings_window(&mut self, ctx: &egui::Context) {
        if !self.show_settings {
            return;
        }
        let mut open = self.show_settings;
        egui::Window::new("设置（只读视图）")
            .id(egui::Id::new("settings_window"))
            .default_width(520.0)
            .open(&mut open)
            .show(ctx, |ui| {
                if self.settings_cache.is_none() {
                    if let Some(backend) = self.backend() {
                        if let Ok(describe) = backend.client().describe_settings() {
                            self.settings_cache = Some(describe.namespaces);
                        }
                    }
                }
                if ui.button("刷新").clicked() {
                    self.settings_cache = None;
                }
                ui.separator();
                egui::ScrollArea::vertical().show(ui, |ui| {
                    let namespaces = self.settings_cache.clone().unwrap_or_default();
                    for namespace in namespaces {
                        egui::CollapsingHeader::new(format!(
                            "{} · applies={} · revision={}",
                            namespace.ns, namespace.applies, namespace.revision
                        ))
                        .id_salt(("ns", &namespace.ns))
                        .show(ui, |ui| {
                            ui.add(
                                egui::Label::new(
                                    serde_json::to_string_pretty(&namespace.value).unwrap_or_default(),
                                )
                                .wrap(),
                            );
                        });
                    }
                });
            });
        self.show_settings = open;
    }

    fn goal_dialog(&mut self, ctx: &egui::Context) {
        if !self.show_goal_dialog {
            return;
        }
        let mut open = self.show_goal_dialog;
        let mut create = false;
        egui::Window::new("新建目标")
            .id(egui::Id::new("goal_dialog"))
            .collapsible(false)
            .resizable(false)
            .open(&mut open)
            .show(ctx, |ui| {
                ui.add(egui::TextEdit::multiline(&mut self.goal_objective).desired_rows(3).hint_text("目标描述"));
                if ui.button("创建").clicked() {
                    create = true;
                }
            });
        self.show_goal_dialog = open;
        if create {
            let objective = self.goal_objective.trim().to_string();
            if !objective.is_empty() {
                if let (Some(backend), Some(session_id)) = (self.backend(), self.selected.clone()) {
                    let payload = serde_json::json!({ "sessionId": session_id, "objective": objective });
                    match backend.call("goal.create", payload) {
                        Ok(_) => {
                            self.goal_objective.clear();
                            self.status = "目标已创建".to_string();
                        }
                        Err(error) => self.status = format!("创建目标失败：{error}"),
                    }
                }
            }
        }
    }
}

impl eframe::App for App {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        if let Some(deadline) = self.auto_exit {
            if std::time::Instant::now() >= deadline {
                self.auto_exit = None;
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            }
        }
        self.drain(&ctx);
        self.modals(&ctx);
        self.settings_window(&ctx);
        self.goal_dialog(&ctx);
        self.status_bar(ui);
        self.sidebar(ui);
        self.inspector(ui);
        self.transcript_ui(ui);
        self.composer_ui(ui);
    }
}

impl Drop for App {
    fn drop(&mut self) {
        if let Some(backend) = self.backend.take() {
            backend.shutdown();
        }
    }
}

/// Sidecar argv for `dsh web`: DSH_SIDECAR_CMD overrides (whitespace-split),
/// DSH_NO_SIDECAR=1 disables sidecar management.
fn sidecar_argv() -> Option<Vec<String>> {
    if std::env::var("DSH_NO_SIDECAR").is_ok() {
        return None;
    }
    if let Ok(command) = std::env::var("DSH_SIDECAR_CMD") {
        let argv: Vec<String> = command.split_whitespace().map(str::to_string).collect();
        return if argv.is_empty() { None } else { Some(argv) };
    }
    Some(vec!["dsh".to_string(), "web".to_string()])
}

fn short_id(id: &str) -> String {
    if id.len() <= 12 {
        id.to_string()
    } else {
        format!("{}…", &id[..12])
    }
}

fn truncate(text: &str, cap: usize) -> String {
    if text.len() <= cap {
        text.to_string()
    } else {
        format!("{}…（截断）", &text[..cap])
    }
}
