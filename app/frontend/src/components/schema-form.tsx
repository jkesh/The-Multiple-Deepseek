// Schema-driven settings form: walks the schemastery refs graph and edits a
// deep clone of the resolved value. Saving diffs the edit against the
// original into path-addressed mutate ops (untouched fields and redacted
// secrets are never written).

import { useMemo, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'
import { rpc } from '../core'
import type { SettingsNamespace } from '../types'

type Refs = Record<string, SchemaNodeType>

interface SchemaNodeType {
  type?: string
  meta?: { min?: number; max?: number; step?: number }
  dict?: Record<string, number>
  list?: number[]
  value?: unknown
}

export default function NamespaceCard(props: {
  namespace: SettingsNamespace
  onSaved: () => void
  onError: (message: string) => void
}) {
  const { namespace, onSaved, onError } = props
  const [edited, setEdited] = useState<unknown>(() => structuredClone(namespace.value))
  const [busy, setBusy] = useState(false)

  const refs = useMemo(() => {
    const schema = namespace.schema as { uid?: number; refs?: Refs }
    return schema.refs ?? {}
  }, [namespace.schema])
  const rootUid = (namespace.schema as { uid?: number }).uid

  const save = async () => {
    const ops = diffOps(namespace.value, edited, [])
    if (ops.length === 0) {
      onError('没有改动')
      return
    }
    setBusy(true)
    try {
      await rpc('settings.mutate', { ns: namespace.ns, ops, expectedRevision: namespace.revision })
      onSaved()
    } catch (error) {
      onError('保存 ' + namespace.ns + ' 失败：' + String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ns-card">
      <div className="ns-head">
        <span className="ns-name">{namespace.ns}</span>
        <span className="ns-meta">{namespace.applies === "live" ? "即时生效" : "重启生效"} · rev {namespace.revision}</span>
        <button disabled={busy} onClick={save}><Save size={13} /> 保存</button>
      </div>
      <div className="ns-body">
        {rootUid !== undefined && refs[rootUid] ? (
          <SchemaNode refs={refs} node={refs[rootUid]} value={edited} onChange={setEdited} depth={0} />
        ) : (
          <pre className="json">{JSON.stringify(namespace.value, null, 2)}</pre>
        )}
      </div>
    </div>
  )
}

export function NamespaceList(props: {
  namespaces: SettingsNamespace[]
  onSaved: () => void
  onError: (message: string) => void
  onRefresh: () => void
}) {
  const { namespaces, onSaved, onError, onRefresh } = props
  return (
    <div>
      <div className="section-head">
        <span>插件设置</span>
        <button onClick={onRefresh} title="刷新"><RefreshCw size={13} /></button>
      </div>
      {namespaces.map((namespace) => (
        <NamespaceCard key={namespace.ns} namespace={namespace} onSaved={onSaved} onError={onError} />
      ))}
    </div>
  )
}

function SchemaNode(props: {
  refs: Refs
  node: SchemaNodeType
  value: unknown
  onChange: (next: unknown) => void
  depth: number
}) {
  const { refs, node, value, onChange, depth } = props
  const type = node.type ?? ""
  if (type === "object" && node.dict) {
    return (
      <div className={"schema-object depth" + depth}>
        {Object.entries(node.dict).map(([key, uid]) => {
          const child = refs[uid]
          if (!child) return null
          const current = (value as Record<string, unknown>)?.[key]
          return (
            <div key={key} className="schema-field">
              <label className="schema-label">{key}</label>
              <SchemaNode
                refs={refs}
                node={child}
                value={current}
                onChange={(next) => {
                  const object = { ...((value as Record<string, unknown>) ?? {}) }
                  object[key] = next
                  onChange(object)
                }}
                depth={depth + 1}
              />
            </div>
          )
        })}
      </div>
    )
  }
  if (type === "string") {
    return <input className="schema-input" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
  }
  if (type === "number") {
    const meta = node.meta
    return (
      <input
        className="schema-input"
        type="number"
        step={meta?.step ?? 1}
        min={meta?.min}
        max={meta?.max}
        value={typeof value === "number" ? value : ""}
        onChange={(event) => {
          const parsed = parseFloat(event.target.value)
          onChange(Number.isNaN(parsed) ? null : parsed)
        }}
      />
    )
  }
  if (type === "boolean") {
    return (
      <label className="schema-check">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        <span>{value === true ? "开启" : "关闭"}</span>
      </label>
    )
  }
  if (type === "union" && node.list && node.list.length > 0) {
    const options = node.list.map((uid) => refs[uid]).filter((item) => item?.type === "const")
    if (options.length === node.list.length) {
      const values = options.map((option) => String(option.value ?? ""))
      return (
        <select className="schema-input" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
          {values.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      )
    }
  }
  if (type === "array") {
    return (
      <input
        className="schema-input mono"
        defaultValue={JSON.stringify(value ?? [])}
        onBlur={(event) => {
          try {
            onChange(JSON.parse(event.target.value))
          } catch {
            /* keep the last valid value */
          }
        }}
      />
    )
  }
  if (type === "const") {
    return <span className="schema-const">{String(node.value ?? "")}</span>
  }
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>
}

type Op = { op: "set" | "unset"; path: string[]; value?: unknown }

function diffOps(original: unknown, edited: unknown, path: string[]): Op[] {
  const isObject = (item: unknown): item is Record<string, unknown> =>
    typeof item === "object" && item !== null && !Array.isArray(item)
  if (isObject(original) && isObject(edited)) {
    const ops: Op[] = []
    for (const [key, next] of Object.entries(edited)) {
      const previous = original[key]
      if (previous === undefined) {
        ops.push({ op: "set", path: [...path, key], value: next })
      } else if (JSON.stringify(previous) !== JSON.stringify(next)) {
        ops.push(...diffOps(previous, next, [...path, key]))
      }
    }
    for (const key of Object.keys(original)) {
      if (!(key in edited)) {
        ops.push({ op: "unset", path: [...path, key] })
      }
    }
    return ops
  }
  return [{ op: "set", path, value: edited }]
}
