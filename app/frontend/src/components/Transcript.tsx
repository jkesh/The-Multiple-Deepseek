import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '../types'

interface Props {
  messages: Message[]
  loading: boolean
  running: boolean
  blank: boolean
}

export default function Transcript({ messages, loading, running, blank }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)

  useEffect(() => {
    if (pinnedRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, running])

  return (
    <div
      className="transcript"
      onScroll={(event) => {
        const element = event.currentTarget
        pinnedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
      }}
    >
      {blank && !running && messages.length === 0 && !loading && (
        <div className="hero">
          <h1>给智能体发消息</h1>
          <p>描述你想要构建的内容，Enter 发送，Shift+Enter 换行</p>
        </div>
      )}
      {loading && <div className="row">载入历史…</div>}
      <AnimatePresence initial={false}>
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={'row ' + message.kind}
          >
            {message.kind === 'user' && (
              <>
                <div className="who">你</div>
                <div className="text">{message.text}</div>
              </>
            )}
            {message.kind === 'context' && (
              <details className="context">
                <summary>📥 注入上下文 · {message.producer ?? '未知'}</summary>
                <pre>{message.text}</pre>
              </details>
            )}
            {message.kind === 'assistant' && (
              <>
                <div className="who">助手</div>
                {message.reasoning && (
                  <details className="reasoning">
                    <summary>💭 思考过程</summary>
                    <pre>{message.reasoning}</pre>
                  </details>
                )}
                <div className="markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                </div>
                {message.tools.map((tool) => (
                  <details key={tool.id} className="tool">
                    <summary>🔧 {tool.error ? '✗' : tool.result ? '✓' : '⏳'} {tool.name}</summary>
                    {tool.arguments && <pre>{tool.arguments}</pre>}
                    {tool.result && <pre>{tool.result}</pre>}
                  </details>
                ))}
              </>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      {running && (
        <div className="row running">
          <span className="spinner" />
          <span>Deep diving…</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
