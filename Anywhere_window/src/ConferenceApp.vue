<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch, defineAsyncComponent } from 'vue'
import { ElButton, ElIcon, ElMessage, ElMessageBox, ElInput } from 'element-plus'
import { Download, VideoPause, Promotion, CloseBold, Minus, FullScreen, Close } from '@element-plus/icons-vue'

import TitleBar from './components/TitleBar.vue'
import ConferenceConfigDialog from './components/ConferenceConfigDialog.vue'
import ParticipantStatusBar from './components/ParticipantStatusBar.vue'
const ConferenceMessage = defineAsyncComponent(() => import('./components/ConferenceMessage.vue'))

const handleMinimize = () => window.api.windowControl('minimize-window')
const handleMaximize = () => window.api.windowControl('maximize-window')
const handleClose = () => window.api.windowControl('close-window')

// --- URL 参数 ---
const urlParams = new URLSearchParams(window.location.search)
const isDarkMode = ref(urlParams.get('dark') === '1')
if (isDarkMode.value) {
  document.documentElement.classList.add('dark')
}

// --- 配置状态 ---
const configDialogVisible = ref(true)
const conferenceConfig = ref(null)
const sessionId = ref('')
const modelList = ref([])
const modelMap = ref({})

// --- 会议状态 ---
const messages = ref([])
const isRunning = ref(false)
const currentRound = ref(0)
const currentSpeakingIndex = ref(-1)
const statusMap = ref({}) // participantId -> 'idle'|'thinking'|'speaking'|'done'|'error'
const abortController = ref(null)
const inputText = ref('')
const isFinished = ref(false)

// --- DOM refs ---
const chatContainerRef = ref(null)
const messageItemRefs = ref([])

// --- OS 检测 ---
const currentOS = ref('win')

// --- 自动滚动 ---
const isAtBottom = ref(true)
const isSticky = ref(true)

const scrollToBottom = async (behavior = 'auto') => {
  await nextTick()
  const container = chatContainerRef.value
  if (!container) return
  container.scrollTo({
    top: container.scrollHeight,
    behavior
  })
}

const scrollToBottomImmediately = () => {
  const container = chatContainerRef.value
  if (!container) return
  container.scrollTop = container.scrollHeight
}

const checkAtBottom = () => {
  const container = chatContainerRef.value
  if (!container) return
  const threshold = 80
  const distance = container.scrollHeight - container.scrollTop - container.clientHeight
  isAtBottom.value = distance < threshold
}

// --- 加载模型列表 ---
onMounted(async () => {
  // 注册窗口消息回调，获取 senderId（关闭/最小化/最大化需要）
  if (window.preload && typeof window.preload.receiveMsg === 'function') {
    window.preload.receiveMsg((data) => {
      // senderId 已由 window_preload.js 内部自动捕获
    })
  }

  try {
    const result = await window.api.getConfig()
    const config = result.config
    const providers = config.providers || {}
    const order = config.providerOrder || []
    const folders = config.providerFolders || {}

    const sortedFolderIds = Object.keys(folders).sort((a, b) =>
      (folders[a].name || '').localeCompare(folders[b].name || '')
    )

    const orderedProviderIds = []
    sortedFolderIds.forEach(folderId => {
      order.forEach(id => {
        const p = providers[id]
        if (p && p.folderId === folderId) orderedProviderIds.push(id)
      })
    })
    order.forEach(id => {
      const p = providers[id]
      if (p && (!p.folderId || !folders[p.folderId])) orderedProviderIds.push(id)
    })

    const newModelList = []
    const newModelMap = {}
    orderedProviderIds.forEach(id => {
      const provider = providers[id]
      if (provider?.enable) {
        provider.modelList.forEach(m => {
          const key = `${id}|${m}`
          newModelList.push({ key, value: key, label: `${provider.name}|${m}` })
          newModelMap[key] = `${provider.name}|${m}`
        })
      }
    })
    modelList.value = newModelList
    modelMap.value = newModelMap
  } catch (e) {
    console.error('Failed to load config:', e)
  }

  try {
    const res = await navigator.userAgent.toLowerCase()
    if (res.includes('mac')) currentOS.value = 'macos'
    else if (res.includes('win')) currentOS.value = 'win'
    else currentOS.value = 'linux'
  } catch (e) {
    currentOS.value = 'win'
  }
})

// --- 配置完成，启动会议 ---
async function handleStart(config) {
  conferenceConfig.value = config
  configDialogVisible.value = false

  // 初始化状态
  const participantStatusMap = {}
  config.participants.forEach(p => {
    participantStatusMap[p.id] = 'idle'
  })
  statusMap.value = participantStatusMap
  currentRound.value = 0
  currentSpeakingIndex.value = -1
  messages.value = []
  isRunning.value = true
  isFinished.value = false
  inputText.value = ''

  // 创建会话
  try {
    const result = await window.api.createConferenceSession({
      topic: config.topic,
      rounds: config.rounds,
      participants: config.participants.map(p => ({
        id: p.id,
        role: p.role,
        providerName: p.providerName,
        model: p.model,
        color: p.color,
        isModerator: p.isModerator,
      })),
      moderatorId: config.moderatorId,
    })
    sessionId.value = result?.session?.id || `conf_${Date.now()}`
  } catch (e) {
    console.error('Failed to create session:', e)
    sessionId.value = `conf_${Date.now()}`
  }

  await nextTick()

  // 添加用户话题消息
  const userMessageId = `msg_${Date.now()}`
  const userMessage = {
    id: userMessageId,
    role: 'user',
    content: config.topic,
    round: 0,
    status: 'completed',
  }
  messages.value.push(userMessage)

  try {
    await window.api.addConferenceMessage(sessionId.value, {
      id: userMessageId,
      role: 'user',
      content: config.topic,
      round: 0,
    })
  } catch (e) { console.error('Failed to save user message:', e) }

  // 开始讨论循环
  await runConference(config)

  // 会议结束
  isRunning.value = false
  isFinished.value = true
  currentSpeakingIndex.value = -1
  // 重置所有状态
  const resetMap = {}
  config.participants.forEach(p => { resetMap[p.id] = 'done' })
  statusMap.value = resetMap

  // 保存最终会话
  try {
    await window.api.updateConferenceSession(sessionId.value, { status: 'completed' })
  } catch (e) { console.error('Failed to update session:', e) }

  ElMessage.success('讨论已全部完成')
}

// --- 核心讨论循环 ---
async function runConference(config) {
  const { topic, rounds, participants, moderatorId, enableCrossReference } = config
  abortController.value = new AbortController()

  for (let round = 0; round < rounds; round++) {
    if (abortController.value.signal.aborted) break
    currentRound.value = round

    for (let i = 0; i < participants.length; i++) {
      if (abortController.value.signal.aborted) break

      const participant = participants[i]
      const isModerator = participant.isModerator
      currentSpeakingIndex.value = i
      statusMap.value[participant.id] = 'thinking'

      // 构建上下文消息
      const contextMessages = buildContextMessages(participant, round, isModerator, topic, enableCrossReference, moderatorId)

      // 添加占位消息到 UI
      const placeholderId = `msg_${Date.now()}_${participant.id}`
      const placeholderMessage = {
        id: placeholderId,
        role: 'ai',
        content: '',
        round,
        status: 'thinking',
        participantId: participant.id,
        participantRole: participant.role,
        participantColor: participant.color,
        participantModel: participant.model,
      }
      messages.value.push(placeholderMessage)
      const messageIndex = messages.value.length - 1

      // 保存占位消息到会话
      try {
        await window.api.addConferenceMessage(sessionId.value, {
          id: placeholderId,
          role: 'ai',
          content: '',
          round,
          participantId: participant.id,
          participantRole: participant.role,
          status: 'thinking',
        })
      } catch (e) { console.error('Failed to add message:', e) }

      await nextTick()
      if (isAtBottom.value) scrollToBottom('smooth')

      // 获取 provider 配置
      const providerConfig = await getProviderConfig(participant.providerModelKey)
      if (!providerConfig) {
        messages.value[messageIndex].status = 'error'
        messages.value[messageIndex].content = `[错误] 无法找到服务商配置: ${participant.providerModelKey}`
        statusMap.value[participant.id] = 'error'
        try {
          await window.api.updateConferenceMessage(sessionId.value, placeholderId, {
            content: messages.value[messageIndex].content,
            status: 'error',
          })
        } catch (e) {}
        continue
      }

      // 流式调用 AI
      statusMap.value[participant.id] = 'speaking'
      let fullContent = ''
      let lastFlushTime = Date.now()

      try {
        const requestParams = {
          baseUrl: providerConfig.url,
          apiKey: providerConfig.api_key,
          model: participant.model,
          apiType: providerConfig.apiType || 'chat_completions',
          messages: contextMessages,
          stream: true,
          signal: abortController.value.signal,
        }

        const stream = await window.api.createChatCompletion(requestParams)

        for await (const part of stream) {
          if (abortController.value.signal.aborted) break

          const delta = part?.choices?.[0]?.delta
          if (!delta) continue

          const contentPiece = delta.content || ''
          if (contentPiece) {
            fullContent += contentPiece
            messages.value[messageIndex].content = fullContent
            messages.value[messageIndex].status = 'streaming'

            // 节流更新：每 200ms 更新一次后端
            const now = Date.now()
            if (now - lastFlushTime > 200) {
              lastFlushTime = now
              try {
                await window.api.updateConferenceMessage(sessionId.value, placeholderId, {
                  content: fullContent,
                  status: 'streaming',
                })
              } catch (e) {}
            }

            if (isAtBottom.value) scrollToBottom('smooth')
          }

          // 处理 thinking/reasoning 内容
          if (delta.reasoning_content || delta.reasoning) {
            messages.value[messageIndex].status = 'thinking'
          }
        }

        if (!abortController.value.signal.aborted) {
          messages.value[messageIndex].status = 'completed'
          messages.value[messageIndex].content = fullContent || '[无回复]'
          statusMap.value[participant.id] = 'done'
        }
      } catch (error) {
        if (abortController.value.signal.aborted) break
        console.error(`Participant ${participant.role} error:`, error)
        messages.value[messageIndex].status = 'error'
        messages.value[messageIndex].content = fullContent
          ? `${fullContent}\n\n[错误: ${error.message || '请求失败'}]`
          : `[错误: ${error.message || '请求失败'}]`
        statusMap.value[participant.id] = 'error'
      }

      // 保存最终消息
      try {
        await window.api.updateConferenceMessage(sessionId.value, placeholderId, {
          content: messages.value[messageIndex].content,
          status: messages.value[messageIndex].status,
        })
      } catch (e) {} // non-fatal
    }
  }

  abortController.value = null
}

// --- 构建上下文消息 ---
function buildContextMessages(participant, currentRound, isModerator, topic, enableCrossReference, moderatorId) {
  const context = []

  // 1. System Prompt
  let systemContent = `你正在参与一个圆桌讨论。\n讨论主题：${topic}\n你的角色：${participant.role}\n`
  if (participant.systemPrompt) {
    systemContent += `\n补充说明：${participant.systemPrompt}\n`
  }
  systemContent += `\n请从你的专业角色出发，用中文发表观点。回复要简洁有深度，不超过 500 字。`

  if (isModerator) {
    systemContent += `\n你是主持人。请总结前面各位参与者的观点，指出共识和分歧，然后提出新的问题引导下一轮讨论。`
  }

  if (enableCrossReference && isModerator && currentRound > 0) {
    systemContent += `\n请在总结和引导时，适当引用前面参与者的观点。`
  }

  context.push({ role: 'system', content: systemContent })

  // 2. 历史对话（主题 + 之前的发言）
  // 加入用户话题
  context.push({ role: 'user', content: `讨论主题：${topic}` })

  // 遍历之前所有消息，构建对话历史
  for (const msg of messages.value) {
    if (msg.role === 'user') {
      if (msg.content && msg.content !== topic) {
        context.push({ role: 'user', content: msg.content })
      }
    } else if (msg.role === 'ai' && msg.status !== 'thinking') {
      const roleName = msg.participantRole || '参与者'
      const content = msg.content

      if (enableCrossReference) {
        // 带角色标识的引用格式
        if (msg.status === 'error') {
          // 跳过出错的消息
          continue
        }
        context.push({
          role: 'user', // 模拟为 user 消息以兼容所有 API
          content: `[${roleName}]: ${content}`
        })
      } else {
        // 不包含引用，仅添加内容
        if (msg.status !== 'error') {
          context.push({
            role: 'assistant',
            content: content
          })
        }
      }
    }
  }

  return context
}

// --- 获取服务商配置 ---
async function getProviderConfig(providerModelKey) {
  try {
    const result = await window.api.getConfig()
    const providers = result.config.providers || {}
    const providerId = providerModelKey.split('|')[0]
    const provider = providers[providerId]
    if (provider) {
      return {
        url: provider.url,
        api_key: provider.api_key,
        apiType: provider.apiType || 'chat_completions',
      }
    }
  } catch (e) {
    console.error('Failed to get provider config:', e)
  }
  return null
}

// --- 停止会议 ---
function handleStop() {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
  isRunning.value = false
  ElMessage.warning('讨论已停止')
}

// --- 用户发送补充消息 ---
async function handleSendInput() {
  const text = inputText.value.trim()
  if (!text) return

  const msgId = `msg_${Date.now()}_user_extra`
  messages.value.push({
    id: msgId,
    role: 'user',
    content: text,
    round: currentRound.value,
    status: 'completed',
  })

  inputText.value = ''
  await nextTick()
  scrollToBottom('smooth')

  try {
    await window.api.addConferenceMessage(sessionId.value, {
      id: msgId,
      role: 'user',
      content: text,
      round: currentRound.value,
    })
  } catch (e) {}
}

// --- 导出 Markdown ---
async function handleExport() {
  if (!sessionId.value) {
    ElMessage.warning('没有可导出的内容')
    return
  }

  try {
    const result = await window.api.exportConferenceToMarkdown(sessionId.value)
    if (!result?.success) {
      ElMessage.error(`导出失败: ${result?.error || '未知错误'}`)
      return
    }
    const markdown = result.markdown || ''
    const timestamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-')
    const filename = `会议讨论-${timestamp}.md`

    await window.api.saveFile({
      title: '导出会议记录',
      defaultPath: filename,
      buttonLabel: '保存',
      fileContent: markdown,
    })

    ElMessage.success('导出成功')
  } catch (e) {
    console.error('Export failed:', e)
    ElMessage.error(`导出失败: ${e.message}`)
  }
}

// --- 重新配置 ---
function handleReconfigure() {
  if (isRunning.value) {
    handleStop()
  }
  configDialogVisible.value = true
  conferenceConfig.value = null
  messages.value = []
  statusMap.value = {}
  sessionId.value = ''
  currentRound.value = 0
  currentSpeakingIndex.value = -1
  isFinished.value = false
  inputText.value = ''
}

// --- 监听消息变化，自动滚动 ---
watch(messages, async () => {
  await nextTick()
  if (isAtBottom.value && isSticky.value) {
    const container = chatContainerRef.value
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }
}, { deep: true })

// --- ParticipantStatusBar 点击 ---
function handleParticipantClick(participant) {
  console.log('Participant clicked:', participant.role)
}
</script>

<template>
  <div class="conference-app" :class="{ 'dark-mode': isDarkMode }">
    <!-- 标题栏 -->
    <TitleBar
      :favicon="'favicon.png'"
      :promptName="'会议讨论'"
      :conversationName="conferenceConfig?.topic || '未配置'"
      :isAlwaysOnTop="true"
      :autoCloseOnBlur="false"
      :isDarkMode="isDarkMode"
      :os="currentOS"
      @minimize="handleMinimize"
      @maximize="handleMaximize"
      @close="handleClose"
    />

    <!-- 配置对话框 -->
    <ConferenceConfigDialog
      v-model="configDialogVisible"
      :providers="[]"
      :modelList="modelList"
      :modelMap="modelMap"
      @start="handleStart"
    />

    <!-- 主内容区 -->
    <div class="conference-main">
      <!-- 参与者状态栏 -->
      <ParticipantStatusBar
        v-if="conferenceConfig"
        :participants="conferenceConfig.participants"
        :currentSpeakingIndex="currentSpeakingIndex"
        :statusMap="statusMap"
        @participant-click="handleParticipantClick"
      />

      <!-- 消息列表 -->
      <div
        ref="chatContainerRef"
        class="message-list"
        @scroll="checkAtBottom"
      >
        <div class="message-list-inner">
          <!-- 会议信息头部 -->
          <div v-if="conferenceConfig && messages.length === 0" class="conference-intro">
            <div class="intro-card">
              <h2 class="intro-topic">{{ conferenceConfig.topic }}</h2>
              <div class="intro-meta">
                <span class="meta-item">轮数: {{ conferenceConfig.rounds }}</span>
                <span class="meta-item">参与者: {{ conferenceConfig.participants.length }}</span>
              </div>
              <div class="intro-participants">
                <span
                  v-for="p in conferenceConfig.participants"
                  :key="p.id"
                  class="intro-participant-tag"
                  :style="{ borderColor: p.color }"
                >
                  <span class="tag-dot" :style="{ backgroundColor: p.color }"></span>
                  {{ p.role }}
                  <span v-if="p.isModerator" class="mod-label">主持人</span>
                </span>
              </div>
            </div>
          </div>

          <!-- 消息 -->
          <ConferenceMessage
            v-for="(message, index) in messages"
            :key="message.id"
            :ref="el => { if (el) messageItemRefs[index] = el }"
            :message="message"
            :participant="message.role === 'ai'
              ? conferenceConfig?.participants.find(p => p.id === message.participantId) || null
              : null"
            :isLast="index === messages.length - 1"
            :isLoading="isRunning && index === messages.length - 1"
            @copy-text="(content) => window.api.copyText(content)"
            @delete-message="() => messages.splice(index, 1)"
          />

          <!-- 正在进行提示 -->
          <div v-if="isRunning" class="running-indicator">
            <span class="indicator-dot"></span>
            <span>第 {{ currentRound + 1 }} 轮讨论进行中...</span>
          </div>

          <!-- 完成提示 -->
          <div v-if="isFinished" class="finished-indicator">
            <span class="check-icon">✓</span>
            <span>讨论已全部完成</span>
          </div>

          <!-- 底部间距 -->
          <div class="scroll-anchor"></div>
        </div>
      </div>

      <!-- 底部输入/控制栏 -->
      <div class="conference-bottom">
        <!-- 输入框区域 -->
        <div class="input-area">
          <el-input
            v-model="inputText"
            type="textarea"
            :rows="2"
            placeholder="输入补充说明或追问（按 Enter 发送，Shift+Enter 换行）"
            :disabled="isRunning"
            @keydown.enter.exact.prevent="handleSendInput"
            class="conference-input"
          />
        </div>

        <!-- 按钮区域 -->
        <div class="button-area">
          <el-button
            v-if="!isRunning && !isFinished"
            type="primary"
            :icon="Promotion"
            @click="handleSendInput"
            :disabled="!inputText.trim()"
          >
            发送
          </el-button>

          <el-button
            v-if="isRunning"
            type="warning"
            :icon="VideoPause"
            @click="handleStop"
          >
            停止
          </el-button>

          <el-button
            v-if="isFinished || (!isRunning && messages.length > 0)"
            :icon="Download"
            @click="handleExport"
          >
            导出
          </el-button>

          <el-button
            v-if="!isRunning"
            @click="handleReconfigure"
          >
            重新配置
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* === 根容器 === */
.conference-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--el-bg-color-page);
  color: var(--el-text-color-primary);
}

/* === 主内容区域 === */
.conference-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* === 消息列表 === */
.message-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  scroll-behavior: smooth;
}

.message-list-inner {
  max-width: 860px;
  margin: 0 auto;
  padding: 16px 20px 8px;
}

.scroll-anchor {
  height: 1px;
}

/* === 会议介绍 === */
.conference-intro {
  display: flex;
  justify-content: center;
  padding: 24px 0 8px;
}

.intro-card {
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  padding: 20px 24px;
  text-align: center;
  max-width: 600px;
  width: 100%;
}

.intro-topic {
  font-size: 18px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin: 0 0 12px;
  line-height: 1.5;
}

.intro-meta {
  display: flex;
  justify-content: center;
  gap: 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.meta-item {
  background-color: var(--el-fill-color-light);
  padding: 2px 10px;
  border-radius: 10px;
}

.intro-participants {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.intro-participant-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 16px;
  border: 1px solid;
  background-color: var(--el-fill-color-lighter);
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.mod-label {
  font-size: 11px;
  color: var(--el-color-warning);
  font-weight: 600;
}

/* === 进行中/完成 提示 === */
.running-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-color-success);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

.finished-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  font-size: 14px;
  color: var(--el-color-success);
  font-weight: 600;
}

.check-icon {
  font-size: 16px;
}

/* === 底部区域 === */
.conference-bottom {
  flex-shrink: 0;
  background-color: var(--el-bg-color);
  border-top: 1px solid var(--el-border-color);
  padding: 8px 16px 12px;
}

.input-area {
  max-width: 860px;
  margin: 0 auto 8px;
}

.conference-input {
  width: 100%;
}

.conference-input :deep(.el-textarea__inner) {
  background-color: var(--el-fill-color-light);
  border-color: var(--el-border-color);
  color: var(--el-text-color-primary);
  border-radius: 12px;
  resize: none;
  font-size: 14px;
  line-height: 1.6;
  padding: 10px 14px;
  box-shadow: none;
  transition: border-color 0.2s;
}

.conference-input :deep(.el-textarea__inner:focus) {
  border-color: var(--el-color-primary);
  box-shadow: none;
}

.button-area {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  max-width: 860px;
  margin: 0 auto;
}

/* === 滚动条样式 === */
.message-list::-webkit-scrollbar {
  width: 6px;
}

.message-list::-webkit-scrollbar-track {
  background: transparent;
}

.message-list::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color);
  border-radius: 3px;
}

.message-list::-webkit-scrollbar-thumb:hover {
  background-color: var(--el-text-color-secondary);
}
</style>

<style>
/* === 全局覆盖：Element Plus Dialog 在会议主题下 === */
.conference-config-dialog {
  border-radius: 12px !important;
}

/* === Markdown 内容兼容 === */
.dark-mode .conference-input :deep(.el-textarea__inner) {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

/* === 响应式处理 === */
@media (max-width: 640px) {
  .message-list-inner {
    padding: 12px 12px 8px;
  }

  .intro-card {
    padding: 16px;
  }

  .intro-topic {
    font-size: 16px;
  }

  .button-area {
    flex-wrap: wrap;
  }
}
</style>
