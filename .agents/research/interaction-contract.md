# Interaction contract

Source: `deepseek-harness-master` — packages/client/ui-conversation, ui-user-questions, ui-sidebar, ui-workspace, ui-agent-preset, client/runtime. Product copy is Simplified Chinese; English shown for reference.

## 1. Composer (per-session input machine)

- **Enter vs Shift+Enter** (`skeleton/InputBar.tsx` `onKeyDown`): Shift+Enter is the native newline **unconditionally**, decided before the IME guard. Plain Enter: while the slash menu is open it is arbitrated (menu picks on Enter); else `preventDefault`, held-key repeats are dropped (`e.repeat`), and locked/busy phases no-op. Empty draft + Enter = no-op, **except** Cmd/Ctrl+Enter ("accelerated") with a running agent and queued messages: it **steers the whole queue** into the running turn (`keyboard.steerQueue()`, `input/hub.ts` `steerQueue`). Otherwise `keyboard.submit(resolveSubmitMode(running, gesture, steeringAvailable))`.
- **Busy-Enter policy** (`input/submission-policy.ts`, `submission-settings.ts`): while the agent runs, plain Enter delivers `queue` (default) or `steer` per the persisted `busyEnter` setting; the accelerated chord always uses the other mode. **Running does not lock the composer**: typing and Enter-to-queue stay live; only `adjudicating`/`submitting` phases are read-only (draft stays visible).
- **Send button** (tool row, right): primary button toggles — `running && subagent === null` renders a **Stop** square (aria `停止生成`/Stop generating, calls `stop()` → `Session.cancel()` → `api.sessions.cancel`); otherwise an up-arrow **Send**, disabled while empty, disabled, or busy. A continuable subagent keeps Send primary and adds a separate Stop button.
- **Queue state**: while running, queued messages appear in a dock strip **above** the composer card (`conversation.input.dock`, `queue/QueueDock.tsx`): one row shows directly; multiple collapse behind a "N 条排队消息" header; per-row Edit/Remove/Steer (steer disabled unless running). Empty-draft Cmd/Ctrl+Enter steers all.
- **Draft persistence**: one `InputMachine` per session (`input/facade.ts` shell); the draft is mirrored (`bindDraftMirror`) into the per-session chat store (`stores.ts`, persist key `dsh.conversation.chat`). On session switch the new session's persisted draft is seeded into the machine; switching back restores it. Successful send clears the draft with **no undo unit** (sent content is not resurrectable). Failed send restores the draft only if untouched.
- **Length**: **no maxLength** anywhere — the draft is bounded only visually: the scrollport caps at 14 lines (CSS `--dsh-composer-text-max-height`) and scrolls internally; wheel chains to the transcript at the cap.
- **Attachments**: images render as a thumbnail rail (`AttachmentRail`) above the textarea; paste/drop intake pre-checks format/count/size limits and toasts rejections. Undo/redo are machine-owned.
- **Placeholder priority** (running→disabled→steer→plan→default): parent-offline, unavailable, steer hint ("Cmd/Ctrl+Enter 插话发送全部排队消息"), plan mode ("描述你的任务以生成计划"), default "给智能体发消息" (Message the agent). Hero variant: "描述你想要构建的内容" (Describe what you want to build).

## 2. Approval & ask-user takeovers

The composer is a **selector-routed chain** (`conversation.composer`, rendered by `skeleton/ConversationRoot.tsx` via `renderSlotChain(..., { fallback: composerBar, overlay: true })`). Selectors run ascending priority (ties = registration); first non-null elects. A pending **question** (priority 0) wins over a pending **approval** (priority 1); both **fully replace the InputBar** (a flow card would double-render the wait — asserted in tests).

- **Approval** (`skeleton/ApprovalPanel.tsx`): amber strip "等待审批" (Waiting for approval) with dot, the model's `reason` as headline (fallback "工具 {toolName} 请求越权执行"), the paired bash `command` in muted code (scrolls internally; buttons stay outside), and a right-aligned action row: **拒绝** (Reject) and **允许一次** (Allow once). One-shot: buttons disable after click; the panel leaves when the broadcast `approval/resolved` frame lands; a rejected receipt re-arms. Answer payload: `{sessionId, approvalId, outcome: 'allowed-once'|'rejected'}`.
- **Ask-user** (`ui-user-questions/src/client/QuestionComposer.tsx`): generic flow = card with header + close (cancel), numbered radio/checkbox option buttons, optional custom text input, prev/next pager "1 / N", Skip, and Continue/Submit; Enter continues (Shift+Enter newline). `plan-review` intent renders `PlanReviewPanel.tsx`: tinted strip + markdown plan + **Discuss** (cancel), **Decline**, **Approve**. Both send the full structured answer batch `{sessionId, answers:[{id, selected:[], custom?}]}`.

## 3. Scroll contract (`chat/ChatView.tsx`)

- Follow **only while pinned**: `atBottom` = distance-to-floor ≤ **24px** (`FOLLOW_THRESHOLD`); a reader scroll up disarms follow. New own message (user node) or a steered item **force-scrolls to bottom**; streaming growth follows only while pinned (ResizeObserver on the flow column + composer seat).
- **Back-to-bottom button**: floating chevron (aria "回到底部") rendered only when `!atBottom`; clicking jumps to floor and clears the saved position. It clears the composer's live height (`--dsh-composer-height`).
- **Open**: fresh open jumps to bottom once; a saved per-session position (in-memory only, survives view-tab switches and reflow, never persisted) is restored instead. Prepend paging anchors the reader's row and restores it after older content lands.

## 4. Session switching & new session

- Clicking a sidebar session calls `sessions.open(id)` = `manager.select(id)`: instant switch, no blocking UI; a not-yet-opened session lazily builds and `Session.open()` pulls the tail history page (`openState: 'loading'`, chat shows "载入历史…"), then replays buffered approval/question/queue frames; `'error'` shows "历史加载失败：{message}（{code}）". Selecting consumes the sidebar completion dot.
- **New session**: sidebar button/wordmark → `workspaces.startSession()` → resolve target (explicit → current session's workspace → recent-workspace projection) → `connectWorkspace` returns/creates a **blank session** → `sessions.open`. With no workspace: selection cleared into the hero. The hero (no session or blank) shows the fish headline "探索未至之境" + "预览版" badge, the **workspace chip** ("选择工作区" / Choose workspace → root-scoped picker `conversation.hero.workspace`), and the **agent-preset chip** (`ui-agent-preset/AgentPresetSeat.tsx`): stages a preset for the next session (host refuses swapping after the first turn). The same textarea DOM survives the hero→composer flip.

## 5. Running-state indicators

- Turn-level status row at flow end (`ChatView.tsx` `TurnStatus`): "Deep diving..." with a left-to-right shimmer (1.8s loop, disabled under reduced motion); an elapsed clock (e.g. "1分20秒") appears after **15s**; `role=status` `aria-live=polite`. Reasoning blocks render as Think-disclosure rows (`ReasoningRow.tsx`).
- **Stop/cancel lives in the composer** (primary button toggle, see §1); sessions removed, blocks, and parent-offline continuable children disable input (placeholder explains; the model seat stays live under a block).

## 6. Empty-session hero

Blank sessions render the centered hero (headline + glow + workspace row + preset chip) with the composer card centered in it; draft typed there mirrors into the chat store and survives workspace switching. The header/body chrome is hidden while blank.
