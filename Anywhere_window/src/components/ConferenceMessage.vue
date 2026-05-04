<script setup>
import { computed, ref, nextTick, watch } from 'vue'
import { ElButton, ElIcon, ElTooltip } from 'element-plus'
import { DocumentCopy, Delete } from '@element-plus/icons-vue'
import { XMarkdown } from 'vue-element-plus-x'
import DOMPurify from 'dompurify'

const props = defineProps({
  message: { type: Object, required: true },
  participant: { type: Object, default: null },
  isLast: Boolean,
  isLoading: Boolean,
})

const emit = defineEmits(['copy-text', 'delete-message'])

// --- Markdown 渲染（参考 ChatMessage.vue 的 XMarkdown 方案）---
const preprocessKatex = (text) => {
  if (!text) return ''
  let processedText = text
  // 替换非标准连字符
  processedText = processedText.replace(/\u2013/g, '-').replace(/\u2014/g, '-')
  // \[ ... \] → $$ ... $$
  processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
  // \( ... \) → $ ... $
  processedText = processedText.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, '$$$1$')
  // align/equation → aligned
  processedText = processedText.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
  processedText = processedText.replace(/\\end\{align\*?\}/g, '\\end{aligned}')
  processedText = processedText.replace(/\\begin\{equation\*?\}/g, '\\begin{aligned}')
  processedText = processedText.replace(/\\end\{equation\*?\}/g, '\\end{aligned}')
  // \tag{} → \qquad \text{(...)}
  processedText = processedText.replace(/(?<!\\)\\tag\s*\{([^{}]+)\}/g, '\\qquad \\text{($1)}')
  return processedText
}

const renderedMarkdownContent = computed(() => {
  if (!props.message.content) return ''
  const content = typeof props.message.content === 'string' ? props.message.content : ''
  // 预处理 LaTeX
  let processed = preprocessKatex(content)

  // 保护代码块和数学公式不被 DOMPurify 破坏
  const protectedMap = new Map()
  let placeholderIndex = 0
  const addPlaceholder = (text) => {
    const placeholder = `__PROTECTED_${placeholderIndex++}__`
    protectedMap.set(placeholder, text)
    return placeholder
  }

  // 保护行内代码 `...`
  processed = processed.replace(/(^|[^\\])(`+)([\s\S]*?)\2/g, (match, prefix, delimiter, inner) => {
    return prefix + addPlaceholder(delimiter + inner + delimiter)
  })
  // 保护 $$...$$
  processed = processed.replace(/(\$\$)([\s\S]*?)(\$\$)/g, (match) => addPlaceholder(match))
  // 保护 $...$
  processed = processed.replace(/(\$)(?!\s)([^$\n]+?)(?<!\s)(\$)/g, (match) => addPlaceholder(match))

  // DOMPurify 清洗
  let sanitized = DOMPurify.sanitize(processed, {
    ADD_TAGS: ['video', 'audio', 'source'],
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_ATTR: ['style']
  })

  // 恢复 &gt; 为 >
  sanitized = sanitized.replace(/&gt;/g, '>')

  // 恢复受保护内容
  let finalContent = sanitized.replace(/__PROTECTED_\d+__/g, (placeholder) => {
    return protectedMap.get(placeholder) || placeholder
  })

  // 表格包裹滚动容器
  finalContent = finalContent.replace(/<table/g, '<div class="table-scroll-wrapper"><table')
    .replace(/<\/table>/g, '</table></div>')

  return finalContent || ''
})

const participantColor = computed(() => props.participant?.color || '#6B7280')
const participantRole = computed(() => props.participant?.role || 'AI')
const participantModel = computed(() => props.participant?.model || '')

const statusText = computed(() => {
  switch (props.message.status) {
    case 'thinking': return '思考中...'
    case 'streaming': return '发言中...'
    case 'error': return '出错'
    default: return ''
  }
})

// 判断是否为 dark 模式
const isDarkMode = computed(() => document.documentElement.classList.contains('dark'))

function handleCopy() {
  emit('copy-text', props.message.content)
}
</script>

<template>
  <div class="conference-message" :class="[`role-${message.role}`, `status-${message.status || 'completed'}`]">
    <!-- 用户消息 -->
    <template v-if="message.role === 'user'">
      <div class="message-bubble user-bubble">
        <div class="message-content">{{ message.content }}</div>
      </div>
    </template>

    <!-- AI 消息 -->
    <template v-else-if="message.role === 'ai'">
      <div class="ai-message-wrapper" :style="{ '--ai-color': participantColor }">
        <!-- 参与者标识 -->
        <div class="ai-identity">
          <div class="ai-avatar" :style="{ backgroundColor: participantColor }">
            {{ participantRole.charAt(0) }}
          </div>
          <div class="ai-info">
            <span class="ai-role">{{ participantRole }}</span>
            <span class="ai-model" v-if="participantModel">{{ participantModel }}</span>
          </div>
          <span class="ai-status" v-if="statusText">{{ statusText }}</span>
        </div>

        <!-- 消息内容（XMarkdown 渲染） -->
        <div class="message-bubble ai-bubble" :style="{ borderLeftColor: participantColor }">
          <div v-if="renderedMarkdownContent" class="message-content markdown-body">
            <XMarkdown
              :markdown="renderedMarkdownContent"
              :is-dark="isDarkMode"
              :enable-latex="true"
              :default-theme-mode="isDarkMode ? 'dark' : 'light'"
              :themes="{ light: 'github-light', dark: 'github-dark-default' }"
              :allow-html="true"
            />
          </div>
          <div v-else-if="message.status === 'thinking'" class="message-thinking">
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
          </div>
          <div v-else class="message-empty">等待回复...</div>
        </div>

        <!-- 操作按钮 -->
        <div class="message-actions" v-if="message.status === 'completed'">
          <el-tooltip content="复制" placement="top">
            <el-button :icon="DocumentCopy" circle size="small" @click="handleCopy" />
          </el-tooltip>
          <el-tooltip content="删除" placement="top">
            <el-button type="danger" :icon="Delete" circle size="small" @click="emit('delete-message')" />
          </el-tooltip>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.conference-message {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
  animation: message-in 0.3s ease;
}

@keyframes message-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* === 用户消息 === */
.role-user {
  align-items: flex-end;
}

.user-bubble {
  background-color: var(--el-color-primary);
  color: #fff;
  border-radius: 16px 16px 4px 16px;
  padding: 12px 16px;
  max-width: 80%;
  word-break: break-word;
}

/* === AI 消息 === */
.role-ai {
  align-items: flex-start;
}

.ai-message-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 85%;
}

.ai-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 4px;
}

.ai-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.ai-info {
  display: flex;
  flex-direction: column;
}

.ai-role {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.ai-model {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.ai-status {
  font-size: 11px;
  color: var(--el-color-warning);
  margin-left: 4px;
}

.ai-bubble {
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-left: 3px solid var(--ai-color);
  border-radius: 4px 12px 12px 12px;
  padding: 12px 16px;
  word-break: break-word;
}

.message-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--el-text-color-primary);
}

.message-thinking {
  display: flex;
  gap: 4px;
  padding: 8px 0;
}

.thinking-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-text-color-secondary);
  animation: thinking-bounce 1.4s ease-in-out infinite;
}

.thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.thinking-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes thinking-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.message-empty {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.message-actions {
  display: flex;
  gap: 4px;
  padding-left: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.ai-message-wrapper:hover .message-actions {
  opacity: 1;
}

/* === XMarkdown 容器基础样式（参考 ChatMessage.vue）=== */
.message-content :deep(.elx-xmarkdown-container) {
  background: transparent !important;
  padding: 0;
  color: var(--el-text-color-primary);
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
}

/* === Markdown 内容样式（配合 XMarkdown / Shiki）=== */
.message-content :deep(p) { margin: 0 0 8px 0; }
.message-content :deep(p:last-child) { margin-bottom: 0; }

/* 代码块 - 深浅色主题适配 */
.message-content :deep(pre) {
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}
.message-content :deep(pre.shiki) {
  background-color: var(--el-fill-color-light) !important;
}
html:not(.dark) .message-content :deep(pre.shiki) {
  background-color: #f6f8fa !important;
}
html.dark .message-content :deep(pre.shiki) {
  background-color: #161b22 !important;
}

/* 行内代码 */
.message-content :deep(code:not(pre code)) {
  background-color: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

/* 列表 */
.message-content :deep(ul), .message-content :deep(ol) {
  padding-left: 20px;
  margin: 8px 0;
}
.message-content :deep(li) { margin-bottom: 4px; }

/* 引用块 */
.message-content :deep(blockquote) {
  border-left: 3px solid var(--ai-color);
  padding-left: 12px;
  color: var(--el-text-color-secondary);
  margin: 8px 0;
}

/* 表格 */
.message-content :deep(.table-scroll-wrapper) {
  overflow-x: auto;
  margin: 8px 0;
}
.message-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
}
.message-content :deep(th), .message-content :deep(td) {
  border: 1px solid var(--el-border-color);
  padding: 6px 10px;
  text-align: left;
}
.message-content :deep(th) {
  background-color: var(--el-fill-color-light);
  font-weight: 600;
}

/* 标题 */
.message-content :deep(h1), .message-content :deep(h2), .message-content :deep(h3),
.message-content :deep(h4), .message-content :deep(h5), .message-content :deep(h6) {
  font-weight: 600;
  margin: 12px 0 8px;
  line-height: 1.4;
}

/* 链接 */
.message-content :deep(a) {
  color: var(--el-color-primary);
  text-decoration: none;
}
.message-content :deep(a:hover) {
  text-decoration: underline;
}

/* 分割线 */
.message-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--el-border-color);
  margin: 12px 0;
}

/* === 深色主题覆盖 === */
html.dark .message-content :deep(th) {
  background-color: var(--el-fill-color) !important;
  border-color: #373A40 !important;
}
html.dark .message-content :deep(td) {
  border-color: #373A40 !important;
}
html.dark .message-content :deep(blockquote) {
  border-left-color: var(--ai-color) !important;
  color: var(--el-text-color-regular) !important;
}
html.dark .message-content :deep(a) {
  color: var(--el-color-primary-light-3) !important;
}
html.dark .message-content :deep(hr) {
  border-top-color: var(--el-border-color-darker) !important;
}

/* === 流式状态 === */
.status-streaming .ai-bubble {
  border-left-width: 4px;
}

.status-error .ai-bubble {
  border-color: var(--el-color-danger);
}
</style>
