//! Typed wire models and RPC methods for the session domain.
//! Shapes pinned from the apiproxy zod schemas (see docs/native-client.md).

use crate::{DshClient, RemoteError};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One `session.list` item.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: String,
    pub updated_at: u64,
    pub running: bool,
    pub blank: bool,
    pub parent_session_id: Option<String>,
    pub origin: Option<String>,
    pub cwd: Option<String>,
    pub agent_preset: Option<String>,
    pub projections: Option<Value>,
}

impl SessionSummary {
    /// Sidebar-facing display title (dsh does not ship a dedicated title field).
    pub fn display_name(&self) -> &str {
        // The title projection lives under projections.values.sessionListMetadata/title
        // in some deployments; fall back to a stable id prefix otherwise.
        self.projection_string("title")
            .unwrap_or(self.session_id.as_str())
    }

    fn projection_string(&self, key: &str) -> Option<&str> {
        self.projections
            .as_ref()?
            .get("values")?
            .get("sessionListMetadata")?
            .get(key)?
            .as_str()
    }
}

/// Strict session-event envelope: `{type, seq, time, data}` plus optional
/// derivation bookkeeping. `data` stays wide here; typed decoding lives in
/// `crate::chat::SessionEventData`.
#[derive(Deserialize, Debug, Clone)]
pub struct SessionEvent {
    #[serde(rename = "type")]
    pub typ: String,
    pub seq: u64,
    pub time: u64,
    pub data: Value,
    #[serde(default)]
    pub source_event_seqs: Option<Vec<u64>>,
    #[serde(default)]
    pub ignorable: Option<bool>,
}

/// One `session.history` row: the event plus an optional host-computed view.
#[derive(Deserialize, Debug, Clone)]
pub struct HistoryEntry {
    pub event: SessionEvent,
    pub view: Option<Value>,
}

/// `session.history` value.
#[derive(Deserialize, Debug, Clone)]
pub struct HistoryPage {
    pub events: Vec<HistoryEntry>,
    #[serde(rename = "hasMore")]
    pub has_more: bool,
    pub projections: Option<Value>,
}

/// One prompt content part. Text now; image parts arrive with attachment work.
#[derive(Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum PromptPart {
    Text { text: String },
}

impl PromptPart {
    /// Convenience constructor for the common text case.
    pub fn text(text: impl Into<String>) -> Self {
        PromptPart::Text { text: text.into() }
    }
}

/// `session.create` request.
#[derive(Serialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_preset: Option<String>,
}

/// `session.create` value.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionValue {
    pub session_id: String,
    pub agent_preset: Option<String>,
}

/// `session.prompt` value. The success command row rides along only
/// when the prompt text was interpreted as a slash command.
#[derive(Deserialize, Debug, Clone)]
pub struct PromptAck {
    pub accepted: bool,
    #[serde(default)]
    pub command: Option<Value>,
}

/// One `session.search` item.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchItem {
    pub session_id: String,
    pub snippet: String,
}

/// Typed session-domain methods.
impl DshClient {
    /// List sessions (sidebar roster).
    pub fn list_sessions(&self) -> Result<Vec<SessionSummary>, RemoteError> {
        let value = self.call_empty("session.list")?;
        let items = value
            .get("items")
            .cloned()
            .unwrap_or_else(|| Value::Array(vec![]));
        serde_json::from_value(items).map_err(|error| RemoteError::Json(format!("session.list items: {error}")))
    }

    /// Create a session (fresh or with an explicit id/preset).
    pub fn create_session(&self, request: &CreateSessionRequest) -> Result<CreateSessionValue, RemoteError> {
        let payload = serde_json::to_value(request)
            .map_err(|error| RemoteError::Json(format!("session.create request: {error}")))?;
        let value = self.call("session.create", payload)?;
        serde_json::from_value(value).map_err(|error| RemoteError::Json(format!("session.create value: {error}")))
    }

    /// Read the durable event log tail of one session. Optional fields must
    /// be absent on the wire, never null (the server schema rejects null).
    pub fn session_history(
        &self,
        session_id: &str,
        before_seq: Option<u64>,
        max_messages: Option<u64>,
    ) -> Result<HistoryPage, RemoteError> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct HistoryRequest<'a> {
            session_id: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            before_seq: Option<u64>,
            #[serde(skip_serializing_if = "Option::is_none")]
            max_messages: Option<u64>,
        }
        let payload = serde_json::to_value(HistoryRequest {
            session_id,
            before_seq,
            max_messages,
        })
        .map_err(|error| RemoteError::Json(format!("session.history request: {error}")))?;
        let value = self.call("session.history", payload)?;
        serde_json::from_value(value).map_err(|error| RemoteError::Json(format!("session.history value: {error}")))
    }

    /// Queue one prompt turn. Streaming results arrive as `session/event`
    /// frames on the mux downlink.
    pub fn prompt(
        &self,
        session_id: &str,
        content: &[PromptPart],
        mode: &str,
    ) -> Result<PromptAck, RemoteError> {
        let payload = serde_json::json!({
            "sessionId": session_id,
            "mode": mode,
            "content": content,
        });
        let value = self.call("session.prompt", payload)?;
        serde_json::from_value(value).map_err(|error| RemoteError::Json(format!("session.prompt value: {error}")))
    }

    /// Rename a session (user-visible title).
    pub fn rename_session(&self, session_id: &str, title: &str) -> Result<(), RemoteError> {
        let payload = serde_json::json!({ "sessionId": session_id, "title": title });
        self.call("session.rename", payload)?;
        Ok(())
    }

    /// Cancel a running turn.
    pub fn cancel_session(&self, session_id: &str) -> Result<(), RemoteError> {
        let payload = serde_json::json!({ "sessionId": session_id });
        self.call("session.cancel", payload)?;
        Ok(())
    }

    /// Full-text session search.
    pub fn search_sessions(&self, query: &str) -> Result<Vec<SearchItem>, RemoteError> {
        let payload = serde_json::json!({ "query": query });
        let value = self.call("session.search", payload)?;
        let items = value.get("items").cloned().unwrap_or_else(|| Value::Array(vec![]));
        serde_json::from_value(items).map_err(|error| RemoteError::Json(format!("session.search items: {error}")))
    }
}
