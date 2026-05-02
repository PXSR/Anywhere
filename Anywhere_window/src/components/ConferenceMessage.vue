<script setup>
import { computed, ref, nextTick, watch } from 'vue'
import { ElButton, ElIcon, ElTooltip } from 'element-plus'
import { DocumentCopy, Delete } from '@element-plus/icons-vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

const props = defineProps({
  message: { type: Object, required: true },
  participant: { type: Object, default: null },
  isLast: Boolean,
  isLoading: Boolean,
})

const emit = defineEmits(['copy-text', 'delete-message'])

const renderedContent = computed(() => {
  if (!props.message.content) return ''
  const content = typeof props.message.content === 'string'
    ? props.message.content
    : ''
  return DOMPurify.sanitize(marked.parse(content))
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

        <!-- 消息内容 -->
        <div class="message-bubble ai-bubble" :style="{ borderLeftColor: participantColor }">
          <div v-if="renderedContent" class="message-content markdown-body" v-html="renderedContent"></div>
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

/* === Markdown 内容 === */
.message-content :deep(p) { margin: 0 0 8px 0; }
.message-content :deep(p:last-child) { margin-bottom: 0; }
.message-content :deep(pre) {
  background-color: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}
.message-content :deep(code) {
  background-color: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}
.message-content :deep(pre code) { background: none; padding: 0; }
.message-content :deep(ul), .message-content :deep(ol) { padding-left: 20px; margin: 8px 0; }
.message-content :deep(li) { margin-bottom: 4px; }
.message-content :deep(blockquote) {
  border-left: 3px solid var(--ai-color);
  padding-left: 12px;
  color: var(--el-text-color-secondary);
  margin: 8px 0;
}

/* === 流式状态 === */
.status-streaming .ai-bubble {
  border-left-width: 4px;
}

.status-error .ai-bubble {
  border-color: var(--el-color-danger);
}
</style>
