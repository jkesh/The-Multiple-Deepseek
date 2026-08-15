//! Live conversation model: typed session events, the streaming chunk
//! vocabulary, and an incremental transcript assembler.

use crate::model::SessionEvent;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

/// Provider-neutral content blocks (merge-extensible: unknown tags degrade to
/// `Other` instead of failing the parse).
#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ContentBlock {
    Text { text: String },
    Reasoning { text: String },
    Image { attachment: Value },
    #[serde(rename = "tool-call")]
    ToolCall { id: String, name: String, arguments: String },
    #[serde(rename = "tool-result")]
    ToolResult {
        tool_call_id: Option<String>,
        content: Option<Vec<ContentBlock>>,
        is_error: Option<bool>,
    },
    #[serde(other)]
    Other,
}

/// Raw streaming protocol emitted by adapters (dsh-llm `StreamChunk`).
#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum StreamChunk {
    BlockStart {
        index: u32,
        #[serde(rename = "blockType")]
        block_type: Option<String>,
    },
    TextDelta { index: u32, text: String },
    ReasoningDelta { index: u32, text: String },
    ToolCallDelta {
        index: u32,
        id: Option<String>,
        name: Option<String>,
        #[serde(rename = "argumentsDelta")]
        arguments_delta: String,
    },
    BlockEnd { index: u32, block: ContentBlock },
    Usage { usage: Value },
    Finish {
        reason: Value,
        #[serde(rename = "replayState")]
        replay_state: Option<Value>,
    },
}

/// One message value (`Message`): stable id, role, content blocks, source.
#[derive(Deserialize, Debug, Clone)]
pub struct Message {
    pub id: String,
    pub role: String,
    pub content: Vec<ContentBlock>,
    pub source: Value,
}

impl Message {
    /// Visible text: every `text` block joined in order.
    pub fn text(&self) -> String {
        self.content
            .iter()
            .filter_map(|block| match block {
                ContentBlock::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("")
    }

    /// Reasoning text: every `reasoning` block joined in order.
    pub fn reasoning(&self) -> String {
        self.content
            .iter()
            .filter_map(|block| match block {
                ContentBlock::Reasoning { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("")
    }
}

// Per-event payload structs (the event `type` dispatches; shapes pinned from
// dsh-session's SessionEventMap).

#[derive(Deserialize, Debug, Clone)]
struct TurnStartData { turn: u32 }

#[derive(Deserialize, Debug, Clone)]
struct TurnEndData { turn: u32, reason: Value }

#[derive(Deserialize, Debug, Clone)]
struct StepData { turn: u32, step: u32 }

#[derive(Deserialize, Debug, Clone)]
struct AssistantChunkData { turn: u32, step: u32, chunk: StreamChunk }

#[derive(Deserialize, Debug, Clone)]
struct AssistantMessageData { turn: u32, step: u32, message: Message, usage: Option<Value> }

#[derive(Deserialize, Debug, Clone)]
struct ToolCallData {
    turn: u32,
    step: u32,
    #[serde(rename = "callId")]
    call_id: String,
    name: String,
    arguments: String,
}

#[derive(Deserialize, Debug, Clone)]
struct ToolResultData { turn: u32, step: u32, message: Value, error: Option<Value>, meta: Option<Value> }

#[derive(Deserialize, Debug, Clone)]
struct TodoWriteData { todos: Value }

#[derive(Deserialize, Debug, Clone)]
struct RequestHeaderData { header: Value, reason: Value }

#[derive(Deserialize, Debug, Clone)]
struct RequestContextData(Value);

/// The session-log event vocabulary the client consumes. Unknown events
/// degrade to `Other`.
#[derive(Debug, Clone)]
pub enum SessionEventData {
    TurnStart { turn: u32 },
    TurnEnd { turn: u32, reason: Value },
    StepStart { turn: u32, step: u32 },
    StepEnd { turn: u32, step: u32 },
    UserMessage(Message),
    AssistantChunk { turn: u32, step: u32, chunk: StreamChunk },
    AssistantMessage { turn: u32, step: u32, message: Message, usage: Option<Value> },
    ToolCall { turn: u32, step: u32, call_id: String, name: String, arguments: String },
    ToolResult { turn: u32, step: u32, message: Value, error: Option<Value>, meta: Option<Value> },
    TodoWrite { todos: Value },
    RequestHeader { header: Value, reason: Value },
    RequestContext(Value),
    SessionEndSeed,
    Other,
}

/// Decode one session event's `data` into the typed vocabulary.
pub fn parse_event_data(event: &SessionEvent) -> SessionEventData {
    let data = &event.data;
    match event.typ.as_str() {
        "turn/start" => serde_json::from_value::<TurnStartData>(data.clone())
            .map(|d| SessionEventData::TurnStart { turn: d.turn })
            .unwrap_or(SessionEventData::Other),
        "turn/end" => serde_json::from_value::<TurnEndData>(data.clone())
            .map(|d| SessionEventData::TurnEnd { turn: d.turn, reason: d.reason })
            .unwrap_or(SessionEventData::Other),
        "step/start" => serde_json::from_value::<StepData>(data.clone())
            .map(|d| SessionEventData::StepStart { turn: d.turn, step: d.step })
            .unwrap_or(SessionEventData::Other),
        "step/end" => serde_json::from_value::<StepData>(data.clone())
            .map(|d| SessionEventData::StepEnd { turn: d.turn, step: d.step })
            .unwrap_or(SessionEventData::Other),
        "user/message" => serde_json::from_value::<Message>(data.clone())
            .map(SessionEventData::UserMessage)
            .unwrap_or(SessionEventData::Other),
        "assistant/chunk" => serde_json::from_value::<AssistantChunkData>(data.clone())
            .map(|d| SessionEventData::AssistantChunk { turn: d.turn, step: d.step, chunk: d.chunk })
            .unwrap_or(SessionEventData::Other),
        "assistant/message" => serde_json::from_value::<AssistantMessageData>(data.clone())
            .map(|d| SessionEventData::AssistantMessage { turn: d.turn, step: d.step, message: d.message, usage: d.usage })
            .unwrap_or(SessionEventData::Other),
        "tool/call" => serde_json::from_value::<ToolCallData>(data.clone())
            .map(|d| SessionEventData::ToolCall { turn: d.turn, step: d.step, call_id: d.call_id, name: d.name, arguments: d.arguments })
            .unwrap_or(SessionEventData::Other),
        "tool/result" => serde_json::from_value::<ToolResultData>(data.clone())
            .map(|d| SessionEventData::ToolResult { turn: d.turn, step: d.step, message: d.message, error: d.error, meta: d.meta })
            .unwrap_or(SessionEventData::Other),
        "todo/write" => serde_json::from_value::<TodoWriteData>(data.clone())
            .map(|d| SessionEventData::TodoWrite { todos: d.todos })
            .unwrap_or(SessionEventData::Other),
        "request/header" => serde_json::from_value::<RequestHeaderData>(data.clone())
            .map(|d| SessionEventData::RequestHeader { header: d.header, reason: d.reason })
            .unwrap_or(SessionEventData::Other),
        "request/context" => serde_json::from_value::<RequestContextData>(data.clone())
            .map(|d| SessionEventData::RequestContext(d.0))
            .unwrap_or(SessionEventData::Other),
        "session/end-seed" => SessionEventData::SessionEndSeed,
        _ => SessionEventData::Other,
    }
}

/// One tool invocation with its optional result.
#[derive(Debug, Clone)]
pub struct ToolCallView {
    pub id: String,
    pub name: String,
    pub arguments: String,
    pub result: Option<Value>,
    pub error: Option<Value>,
}

/// Assembled per-message state during streaming.
#[derive(Debug, Clone, Default)]
pub struct MessageBuffer {
    pub id: String,
    pub role: String,
    /// Visible text blocks by stream index (block-end is authoritative per slot).
    pub text_blocks: BTreeMap<u32, String>,
    pub reasoning_blocks: BTreeMap<u32, String>,
    pub tool_calls: BTreeMap<String, ToolCallView>,
    /// Set when the authoritative `assistant/message` arrived.
    pub finalized: bool,
}

impl MessageBuffer {
    /// Current visible text (stream order).
    pub fn text(&self) -> String {
        self.text_blocks.values().cloned().collect()
    }

    /// Current reasoning text.
    pub fn reasoning(&self) -> String {
        self.reasoning_blocks.values().cloned().collect()
    }
}

/// Incremental transcript: consumes `SessionEvent`s in seq order and folds
/// them into ordered messages plus turn lifecycle facts.
#[derive(Debug, Clone, Default)]
pub struct Transcript {
    pub messages: Vec<MessageBuffer>,
    pub current_turn: u32,
    pub finished_turns: Vec<u32>,
}

impl Transcript {
    /// Fold one event into the transcript.
    pub fn apply(&mut self, event: &SessionEvent) {
        match parse_event_data(event) {
            SessionEventData::TurnStart { turn } => {
                self.current_turn = turn;
            }
            SessionEventData::TurnEnd { turn, .. } => {
                if !self.finished_turns.contains(&turn) {
                    self.finished_turns.push(turn);
                }
            }
            SessionEventData::UserMessage(message) => {
                self.push_message(&message);
            }
            SessionEventData::AssistantChunk { chunk, .. } => {
                self.apply_chunk(chunk);
            }
            SessionEventData::AssistantMessage { message, .. } => {
                self.finalize_message(&message);
            }
            SessionEventData::ToolCall { call_id, name, arguments, .. } => {
                if self.messages.last().map(|m| m.role.as_str()) != Some("assistant") {
                    self.messages.push(MessageBuffer::default());
                }
                let last = self.messages.last_mut().expect("pushed above");
                let tool = last
                    .tool_calls
                    .entry(call_id.clone())
                    .or_insert_with(|| ToolCallView {
                        id: call_id.clone(),
                        name: name.clone(),
                        arguments: String::new(),
                        result: None,
                        error: None,
                    });
                tool.name = name;
                if !arguments.is_empty() {
                    tool.arguments = arguments;
                }
            }
            SessionEventData::ToolResult { message, error, .. } => {
                let tool_call_id = message
                    .get("content")
                    .and_then(|content| content.get(0))
                    .and_then(|block| block.get("toolCallId"))
                    .and_then(Value::as_str)
                    .map(str::to_string);
                if let Some(tool_call_id) = tool_call_id {
                    for candidate in self.messages.iter_mut().rev() {
                        if let Some(tool) = candidate.tool_calls.get_mut(&tool_call_id) {
                            tool.result = Some(message.clone());
                            tool.error = error.clone();
                            break;
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn push_message(&mut self, message: &Message) {
        let mut buffer = MessageBuffer {
            id: message.id.clone(),
            role: message.role.clone(),
            ..Default::default()
        };
        for (index, block) in message.content.iter().enumerate() {
            let index = index as u32;
            match block {
                ContentBlock::Text { text } => {
                    buffer.text_blocks.insert(index, text.clone());
                }
                ContentBlock::Reasoning { text } => {
                    buffer.reasoning_blocks.insert(index, text.clone());
                }
                ContentBlock::ToolCall { id, name, arguments } => {
                    buffer.tool_calls.insert(
                        id.clone(),
                        ToolCallView {
                            id: id.clone(),
                            name: name.clone(),
                            arguments: arguments.clone(),
                            result: None,
                            error: None,
                        },
                    );
                }
                _ => {}
            }
        }
        buffer.finalized = true;
        self.messages.push(buffer);
    }

    fn apply_chunk(&mut self, chunk: StreamChunk) {
        let message = match self.messages.last_mut() {
            Some(last) if last.role == "assistant" && !last.finalized => last,
            _ => {
                self.messages.push(MessageBuffer::default());
                self.messages.last_mut().expect("pushed above")
            }
        };
        match chunk {
            StreamChunk::TextDelta { index, text } => {
                message.text_blocks.entry(index).or_default().push_str(&text);
            }
            StreamChunk::ReasoningDelta { index, text } => {
                message.reasoning_blocks.entry(index).or_default().push_str(&text);
            }
            StreamChunk::ToolCallDelta { id, name, arguments_delta, .. } => {
                let key = match id.as_deref() {
                    Some(non_empty) if !non_empty.is_empty() => non_empty.to_string(),
                    _ => message
                        .tool_calls
                        .iter()
                        .find(|(_, tool)| Some(tool.name.as_str()) == name.as_deref())
                        .map(|(key, _)| key.clone())
                        .unwrap_or_else(|| format!("pending-{}", message.tool_calls.len())),
                };
                let tool = message.tool_calls.entry(key).or_insert_with(|| ToolCallView {
                    id: id.clone().unwrap_or_default(),
                    name: name.clone().unwrap_or_default(),
                    arguments: String::new(),
                    result: None,
                    error: None,
                });
                if let Some(name) = name {
                    tool.name = name;
                }
                tool.arguments.push_str(&arguments_delta);
            }
            StreamChunk::BlockEnd { index, block } => match block {
                ContentBlock::Text { text } => {
                    message.text_blocks.insert(index, text);
                }
                ContentBlock::Reasoning { text } => {
                    message.reasoning_blocks.insert(index, text);
                }
                ContentBlock::ToolCall { id, name, arguments } => {
                    message.tool_calls.insert(
                        id.clone(),
                        ToolCallView { id, name, arguments, result: None, error: None },
                    );
                }
                _ => {}
            },
            _ => {}
        }
    }

    fn finalize_message(&mut self, message: &Message) {
        match self.messages.last_mut() {
            Some(last) if last.role == "assistant" && !last.finalized => {
                last.id = message.id.clone();
                last.text_blocks.clear();
                last.reasoning_blocks.clear();
                for (index, block) in message.content.iter().enumerate() {
                    match block {
                        ContentBlock::Text { text } => {
                            last.text_blocks.insert(index as u32, text.clone());
                        }
                        ContentBlock::Reasoning { text } => {
                            last.reasoning_blocks.insert(index as u32, text.clone());
                        }
                        ContentBlock::ToolCall { id, name, arguments } => {
                            last.tool_calls
                                .entry(id.clone())
                                .or_insert_with(|| ToolCallView {
                                    id: id.clone(),
                                    name: name.clone(),
                                    arguments: arguments.clone(),
                                    result: None,
                                    error: None,
                                });
                        }
                        _ => {}
                    }
                }
                last.finalized = true;
            }
            _ => self.push_message(message),
        }
    }

    /// The last assistant message's current visible text (streaming view).
    pub fn live_text(&self) -> Option<String> {
        self.messages
            .iter()
            .rev()
            .find(|message| message.role == "assistant")
            .map(MessageBuffer::text)
    }
}
