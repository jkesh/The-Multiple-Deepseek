//! Typed methods for the product-parity domains: settings, model catalog,
//! agent presets, goals, and workspaces. Shapes pinned from the apiproxy zod
//! schemas (see docs/native-client.md). Optional request fields are absent on
//! the wire, never null — the server schemas reject null.

use crate::{DshClient, RemoteError};
use serde::{Deserialize, Serialize};
use serde_json::Value;

// ---------------------------------------------------------------------------
// Settings

/// One redacted secret slot (write-only value; only the configured flag rides).
#[derive(Deserialize, Debug, Clone)]
pub struct SettingsSecretView {
    pub path: Vec<String>,
    pub set: bool,
}

/// Wire view of one registered settings namespace.
#[derive(Deserialize, Debug, Clone)]
pub struct SettingsNamespaceView {
    pub ns: String,
    /// Serialized schemastery schema envelope (form rendering input).
    pub schema: Value,
    /// Redacted resolved value (schema defaults → base → user layer).
    pub value: Value,
    pub base: Option<Value>,
    pub user: Option<Value>,
    pub applies: String,
    pub secrets: Vec<SettingsSecretView>,
    /// Monotonic revision of the raw user section at read time.
    pub revision: u64,
}

/// `settings.describe` value.
#[derive(Deserialize, Debug, Clone)]
pub struct SettingsDescribe {
    pub writable: bool,
    #[serde(rename = "hasDocument")]
    pub has_document: bool,
    pub namespaces: Vec<SettingsNamespaceView>,
}

/// One path-addressed settings edit.
#[derive(Serialize, Debug, Clone)]
#[serde(tag = "op")]
pub enum PathOp {
    #[serde(rename = "set")]
    Set { path: Vec<String>, value: Value },
    #[serde(rename = "unset")]
    Unset { path: Vec<String> },
}

/// Shared settings write envelope; per-method optional fields must be absent
/// on the wire (the server schema rejects null).
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct SettingsWriteRequest<'a> {
    ns: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    patch: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    section: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ops: Option<Vec<PathOp>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    expected_revision: Option<u64>,
}

impl DshClient {
    /// Read every settings namespace (redacted, loopback-only).
    pub fn describe_settings(&self) -> Result<SettingsDescribe, RemoteError> {
        let value = self.call_empty("settings.describe")?;
        serde_json::from_value(value)
            .map_err(|error| RemoteError::Json(format!("settings.describe value: {error}")))
    }

    /// Patch one namespace (shallow field merge over the user layer).
    pub fn update_settings(
        &self,
        ns: &str,
        patch: Value,
        expected_revision: Option<u64>,
    ) -> Result<SettingsNamespaceView, RemoteError> {
        let payload = serde_json::to_value(SettingsWriteRequest {
            ns,
            patch: Some(patch),
            section: None,
            ops: None,
            expected_revision,
        })
        .map_err(|error| RemoteError::Json(format!("settings.update request: {error}")))?;
        let value = self.call("settings.update", payload)?;
        serde_json::from_value(value)
            .map_err(|error| RemoteError::Json(format!("settings.update value: {error}")))
    }

    /// Replace one namespace's whole user section.
    pub fn replace_settings(
        &self,
        ns: &str,
        section: Value,
        expected_revision: Option<u64>,
    ) -> Result<SettingsNamespaceView, RemoteError> {
        let payload = serde_json::to_value(SettingsWriteRequest {
            ns,
            patch: None,
            section: Some(section),
            ops: None,
            expected_revision,
        })
        .map_err(|error| RemoteError::Json(format!("settings.replace request: {error}")))?;
        let value = self.call("settings.replace", payload)?;
        serde_json::from_value(value)
            .map_err(|error| RemoteError::Json(format!("settings.replace value: {error}")))
    }

    /// Apply path-addressed edits to one namespace.
    pub fn mutate_settings(
        &self,
        ns: &str,
        ops: &[PathOp],
        expected_revision: Option<u64>,
    ) -> Result<SettingsNamespaceView, RemoteError> {
        let payload = serde_json::to_value(SettingsWriteRequest {
            ns,
            patch: None,
            section: None,
            ops: Some(ops.to_vec()),
            expected_revision,
        })
        .map_err(|error| RemoteError::Json(format!("settings.mutate request: {error}")))?;
        let value = self.call("settings.mutate", payload)?;
        serde_json::from_value(value)
            .map_err(|error| RemoteError::Json(format!("settings.mutate value: {error}")))
    }
}

// ---------------------------------------------------------------------------
// Model catalog

/// One configurable provider route.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurableProviderView {
    pub provider: String,
    pub display_name: String,
    pub settings_ns: String,
    pub settings_path: Vec<String>,
    pub declared: Option<bool>,
}

/// One selectable reasoning effort.
#[derive(Deserialize, Debug, Clone)]
pub struct ModelReasoningEffort {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

/// Reasoning options for one model.
#[derive(Deserialize, Debug, Clone)]
pub struct ModelReasoning {
    pub efforts: Vec<ModelReasoningEffort>,
    #[serde(rename = "defaultEffort")]
    pub default_effort: Option<String>,
}

/// One model row in a provider group.
#[derive(Deserialize, Debug, Clone)]
pub struct ModelCatalogModel {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub reasoning: Option<ModelReasoning>,
}

/// One provider group of the model catalog.
#[derive(Deserialize, Debug, Clone)]
pub struct ModelProviderGroup {
    pub id: String,
    pub name: String,
    pub models: Vec<ModelCatalogModel>,
}

/// One failed provider listing.
#[derive(Deserialize, Debug, Clone)]
pub struct ModelCatalogFailure {
    pub id: String,
    pub name: String,
    pub message: String,
}

/// `llm.models` value.
#[derive(Deserialize, Debug, Clone)]
pub struct LlmModelsValue {
    pub groups: Vec<ModelProviderGroup>,
    pub failures: Vec<ModelCatalogFailure>,
}

/// One selected provider/model route.
#[derive(Deserialize, Debug, Clone)]
pub struct ModelSelection {
    pub provider: String,
    pub model: String,
    #[serde(rename = "reasoningEffort")]
    pub reasoning_effort: Option<String>,
}

impl DshClient {
    /// Configurable provider routes.
    pub fn llm_providers(&self) -> Result<Vec<ConfigurableProviderView>, RemoteError> {
        let value = self.call_empty("llm.providers")?;
        serde_json::from_value(value)
            .map_err(|error| RemoteError::Json(format!("llm.providers value: {error}")))
    }

    /// The model catalog grouped by provider.
    pub fn llm_models(&self) -> Result<LlmModelsValue, RemoteError> {
        let value = self.call_empty("llm.models")?;
        serde_json::from_value(value)
            .map_err(|error| RemoteError::Json(format!("llm.models value: {error}")))
    }

    /// Switch one session's provider/model route.
    pub fn select_model(
        &self,
        session_id: &str,
        provider: &str,
        model: &str,
        reasoning_effort: Option<&str>,
    ) -> Result<ModelSelection, RemoteError> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct SelectModelRequest<'a> {
            session_id: &'a str,
            provider: &'a str,
            model: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            reasoning_effort: Option<&'a str>,
        }
        let payload = serde_json::to_value(SelectModelRequest {
            session_id,
            provider,
            model,
            reasoning_effort,
        })
        .map_err(|error| RemoteError::Json(format!("session.selectModel request: {error}")))?;
        let value = self.call("session.selectModel", payload)?;
        let selected = value.get("selected").cloned().unwrap_or(Value::Null);
        serde_json::from_value(selected)
            .map_err(|error| RemoteError::Json(format!("session.selectModel value: {error}")))
    }
}

// ---------------------------------------------------------------------------
// Agent presets

/// One agentPreset.list row.
#[derive(Deserialize, Debug, Clone)]
pub struct AgentPresetEntry {
    pub id: String,
    pub trust: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    pub name: Option<String>,
    pub description: Option<String>,
    pub broken: Option<String>,
}

/// `agentPreset.list` value.
#[derive(Deserialize, Debug, Clone)]
pub struct AgentPresetList {
    pub presets: Vec<AgentPresetEntry>,
    pub authorable: bool,
    #[serde(rename = "hasDocument")]
    pub has_document: bool,
}

impl DshClient {
    /// List agent presets.
    pub fn list_presets(&self) -> Result<AgentPresetList, RemoteError> {
        let value = self.call_empty("agentPreset.list")?;
        serde_json::from_value(value)
            .map_err(|error| RemoteError::Json(format!("agentPreset.list value: {error}")))
    }

    /// Switch one session's agent preset.
    pub fn select_preset(&self, session_id: &str, agent_preset: &str) -> Result<String, RemoteError> {
        let payload = serde_json::json!({ "sessionId": session_id, "agentPreset": agent_preset });
        let value = self.call("agentPreset.select", payload)?;
        value
            .get("agentPreset")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| RemoteError::Protocol("agentPreset.select returned no agentPreset".to_string()))
    }
}

// ---------------------------------------------------------------------------
// Goals

/// Goal identity + revision for optimistic edits.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GoalRef {
    pub id: String,
    pub revision: u64,
}

impl DshClient {
    /// Create a goal on one session.
    pub fn create_goal(
        &self,
        session_id: &str,
        objective: &str,
        max_goal_rounds: Option<u64>,
    ) -> Result<GoalRef, RemoteError> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct CreateGoalRequest<'a> {
            session_id: &'a str,
            objective: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            max_goal_rounds: Option<u64>,
        }
        let payload = serde_json::to_value(CreateGoalRequest {
            session_id,
            objective,
            max_goal_rounds,
        })
        .map_err(|error| RemoteError::Json(format!("goal.create request: {error}")))?;
        let value = self.call("goal.create", payload)?;
        goal_ref_from_value(&value, "goal.create")
    }

    /// Edit a goal's objective or round cap.
    pub fn edit_goal(
        &self,
        session_id: &str,
        goal_ref: &GoalRef,
        objective: Option<&str>,
        max_goal_rounds: Option<u64>,
    ) -> Result<GoalRef, RemoteError> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct EditGoalRequest<'a> {
            session_id: &'a str,
            #[serde(rename = "ref")]
            goal_ref: &'a GoalRef,
            #[serde(skip_serializing_if = "Option::is_none")]
            objective: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            max_goal_rounds: Option<u64>,
        }
        let payload = serde_json::to_value(EditGoalRequest {
            session_id,
            goal_ref,
            objective,
            max_goal_rounds,
        })
        .map_err(|error| RemoteError::Json(format!("goal.edit request: {error}")))?;
        let value = self.call("goal.edit", payload)?;
        goal_ref_from_value(&value, "goal.edit")
    }

    fn goal_action(&self, method: &str, session_id: &str, goal_ref: &GoalRef) -> Result<GoalRef, RemoteError> {
        let payload = serde_json::json!({ "sessionId": session_id, "ref": goal_ref });
        let value = self.call(method, payload)?;
        goal_ref_from_value(&value, method)
    }

    /// Pause a goal.
    pub fn pause_goal(&self, session_id: &str, goal_ref: &GoalRef) -> Result<GoalRef, RemoteError> {
        self.goal_action("goal.pause", session_id, goal_ref)
    }

    /// Resume a paused goal.
    pub fn resume_goal(&self, session_id: &str, goal_ref: &GoalRef) -> Result<GoalRef, RemoteError> {
        self.goal_action("goal.resume", session_id, goal_ref)
    }

    /// Complete a goal.
    pub fn complete_goal(&self, session_id: &str, goal_ref: &GoalRef) -> Result<GoalRef, RemoteError> {
        self.goal_action("goal.complete", session_id, goal_ref)
    }

    /// Clear a goal. The value slot is `{cleared: true}` on current builds
    /// and absent on others; acceptance itself is the contract.
    pub fn clear_goal(&self, session_id: &str, goal_ref: &GoalRef) -> Result<(), RemoteError> {
        let payload = serde_json::json!({ "sessionId": session_id, "ref": goal_ref });
        self.call("goal.clear", payload)?;
        Ok(())
    }
}

fn goal_ref_from_value(value: &Value, method: &str) -> Result<GoalRef, RemoteError> {
    let goal_ref = value.get("ref").cloned().unwrap_or(Value::Null);
    serde_json::from_value(goal_ref)
        .map_err(|error| RemoteError::Json(format!("{method} value: {error}")))
}

// ---------------------------------------------------------------------------
// Workspaces

/// One workspace row.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceView {
    pub workspace_id: String,
    pub path: String,
    pub title: String,
    pub session_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// `workspace.list` value.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceList {
    pub items: Vec<WorkspaceView>,
    pub archived_session_ids: Vec<String>,
}

impl DshClient {
    /// List workspaces and the archive set.
    pub fn list_workspaces(&self) -> Result<WorkspaceList, RemoteError> {
        let value = self.call_empty("workspace.list")?;
        serde_json::from_value(value)
            .map_err(|error| RemoteError::Json(format!("workspace.list value: {error}")))
    }

    /// Archive a session (removes it from the sidebar roster).
    pub fn archive_session(&self, session_id: &str) -> Result<Vec<String>, RemoteError> {
        let payload = serde_json::json!({ "sessionId": session_id });
        let value = self.call("workspace.archiveSession", payload)?;
        let ids = value
            .get("archivedSessionIds")
            .cloned()
            .unwrap_or(Value::Null);
        serde_json::from_value(ids)
            .map_err(|error| RemoteError::Json(format!("workspace.archiveSession value: {error}")))
    }
}

// ---------------------------------------------------------------------------
// Approvals and questions

/// One `approval/requested` frame payload.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequested {
    pub session_id: String,
    pub approval_id: String,
    pub tool_name: String,
    pub call_id: Option<String>,
    pub reason: Option<String>,
}

/// One `question/requested` frame payload.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuestionRequested {
    pub session_id: String,
    pub questions: Value,
}

/// The two legal approval answers.
#[derive(Serialize, Debug, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub enum ApprovalOutcome {
    AllowedOnce,
    Rejected,
}

impl DshClient {
    /// Answer a pending approval request (the frame's rpcId is the correlation key).
    pub fn respond_approval(
        &self,
        rpc_id: &str,
        session_id: &str,
        approval_id: &str,
        outcome: ApprovalOutcome,
    ) -> Result<crate::RespondReceipt, RemoteError> {
        let value = serde_json::json!({
            "sessionId": session_id,
            "approvalId": approval_id,
            "outcome": outcome,
        });
        self.respond(rpc_id, value)
    }

    /// Answer a pending ask-user question batch.
    pub fn respond_question(
        &self,
        rpc_id: &str,
        session_id: &str,
        answer: Value,
    ) -> Result<crate::RespondReceipt, RemoteError> {
        let value = serde_json::json!({ "sessionId": session_id, "answer": answer });
        self.respond(rpc_id, value)
    }
}
