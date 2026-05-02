<script setup>
import { ref, computed, watch } from 'vue'
import { ElDialog, ElButton, ElInput, ElSelect, ElOption, ElCheckbox, ElTabs, ElTabPane, ElTag, ElTooltip, ElIcon, ElSlider, ElColorPicker } from 'element-plus'
import { Plus, Delete, Rank, Microphone } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: Boolean,
  providers: { type: Array, default: () => [] },
  modelList: { type: Array, default: () => [] },
  modelMap: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue', 'start'])

// --- 会议配置状态 ---
const topic = ref('')
const rounds = ref(3)
const enableCrossReference = ref(true)
const participants = ref([])

// --- 添加参与者 ---
const selectedProviderModel = ref('')
const newRole = ref('')

const canAddParticipant = computed(() => {
  return selectedProviderModel.value && newRole.value.trim() && participants.value.length < 6
})

function addParticipant() {
  if (!canAddParticipant.value) return
  const label = props.modelMap[selectedProviderModel.value] || selectedProviderModel.value
  const parts = label.split('|')
  participants.value.push({
    id: `p_${Date.now()}`,
    providerModelKey: selectedProviderModel.value,
    providerName: parts[0] || '',
    model: parts[1] || '',
    role: newRole.value.trim(),
    systemPrompt: '',
    color: stringToColor(newRole.value.trim()),
    isModerator: false,
  })
  selectedProviderModel.value = ''
  newRole.value = ''
}

function removeParticipant(index) {
  participants.value.splice(index, 1)
}

function moveParticipant(index, direction) {
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= participants.value.length) return
  const temp = participants.value[index]
  participants.value[index] = participants.value[newIndex]
  participants.value[newIndex] = temp
}

function toggleModerator(index) {
  participants.value.forEach((p, i) => {
    p.isModerator = i === index ? !p.isModerator : false
  })
}

// 主持人自动排到最后
const sortedParticipants = computed(() => {
  const regular = participants.value.filter(p => !p.isModerator)
  const moderator = participants.value.filter(p => p.isModerator)
  return [...regular, ...moderator]
})

// --- 启动会议 ---
function handleStart() {
  if (!topic.value.trim()) {
    alert('请输入讨论主题')
    return
  }
  if (participants.value.length < 2) {
    alert('至少需要 2 个参与者')
    return
  }
  const moderatorId = participants.value.find(p => p.isModerator)?.id || null
  emit('start', {
    topic: topic.value.trim(),
    rounds: rounds.value,
    enableCrossReference: enableCrossReference.value,
    participants: sortedParticipants.value,
    moderatorId,
  })
}

function handleClose() {
  emit('update:modelValue', false)
}

// --- 工具函数 ---
function stringToColor(str) {
  if (!str) return '#6B7280'
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash) % 360
  const s = 55 + (Math.abs(hash) % 25)
  const l = 45 + (Math.abs(hash) % 15)
  return `hsl(${h}, ${s}%, ${l}%)`
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="handleClose"
    title="会议讨论配置"
    width="700px"
    custom-class="conference-config-dialog"
    :close-on-click-modal="false"
  >
    <div class="config-content">
      <!-- 讨论主题 -->
      <div class="config-section">
        <label class="config-label">讨论主题</label>
        <el-input v-model="topic" placeholder="请输入讨论主题，例如：如何优化产品用户体验？" />
      </div>

      <!-- 讨论设置 -->
      <div class="config-section settings-row">
        <div class="setting-item">
          <label class="config-label">讨论轮数</label>
          <el-slider v-model="rounds" :min="1" :max="10" show-input />
        </div>
        <div class="setting-item checkbox-item">
          <el-checkbox v-model="enableCrossReference" label="允许 AI 互相引用观点" />
        </div>
      </div>

      <!-- 参与者配置 -->
      <div class="config-section">
        <label class="config-label">
          参与者 ({{ participants.length }}/6)
          <span class="config-hint">至少 2 个，最多 6 个</span>
        </label>

        <!-- 已添加的参与者列表 -->
        <div class="participants-list" v-if="participants.length > 0">
          <div
            v-for="(p, index) in participants"
            :key="p.id"
            class="participant-item"
            :style="{ borderLeftColor: p.color }"
          >
            <div class="participant-drag">
              <el-icon><Rank /></el-icon>
            </div>
            <div class="participant-color" :style="{ backgroundColor: p.color }"></div>
            <div class="participant-info">
              <div class="participant-role">{{ p.role }}</div>
              <div class="participant-model">{{ p.providerName }} / {{ p.model }}</div>
              <el-input
                v-if="p.systemPrompt !== undefined"
                v-model="p.systemPrompt"
                type="textarea"
                :rows="2"
                placeholder="自定义系统提示词（可选）"
                class="participant-prompt"
              />
            </div>
            <div class="participant-actions">
              <el-tooltip content="设为主持人" placement="top">
                <el-button
                  :type="p.isModerator ? 'warning' : 'default'"
                  :icon="Microphone"
                  circle
                  size="small"
                  @click="toggleModerator(index)"
                />
              </el-tooltip>
              <el-button :icon="Plus" circle size="small" @click="moveParticipant(index, -1)" :disabled="index === 0" />
              <el-button :icon="Plus" circle size="small" @click="moveParticipant(index, 1)" :disabled="index === participants.length - 1" />
              <el-button type="danger" :icon="Delete" circle size="small" @click="removeParticipant(index)" />
            </div>
          </div>
        </div>

        <!-- 添加新参与者 -->
        <div class="add-participant" v-if="participants.length < 6">
          <el-select v-model="selectedProviderModel" placeholder="选择服务商和模型" class="add-select">
            <el-option
              v-for="item in modelList"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-input v-model="newRole" placeholder="角色名称，如：技术专家" class="add-role" />
          <el-button type="primary" :icon="Plus" @click="addParticipant" :disabled="!canAddParticipant">添加</el-button>
        </div>
      </div>

      <!-- 发言顺序预览 -->
      <div class="config-section" v-if="sortedParticipants.length >= 2">
        <label class="config-label">发言顺序预览</label>
        <div class="order-preview">
          <div
            v-for="(p, index) in sortedParticipants"
            :key="p.id"
            class="order-item"
          >
            <span class="order-num">{{ index + 1 }}</span>
            <span class="order-color" :style="{ backgroundColor: p.color }"></span>
            <span class="order-role">{{ p.role }}</span>
            <span class="order-model">({{ p.providerName }}/{{ p.model }})</span>
            <el-tag v-if="p.isModerator" type="warning" size="small">主持人</el-tag>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleStart" :disabled="participants.length < 2 || !topic.trim()">
        开始讨论
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.config-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.settings-row {
  flex-direction: row;
  gap: 24px;
  align-items: flex-start;
}

.setting-item {
  flex: 1;
}

.checkbox-item {
  display: flex;
  align-items: center;
  padding-top: 24px;
}

.participants-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.participant-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
  border-left: 4px solid;
}

.participant-drag {
  color: var(--el-text-color-secondary);
  cursor: move;
  padding-top: 4px;
}

.participant-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}

.participant-info {
  flex: 1;
  min-width: 0;
}

.participant-role {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.participant-model {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.participant-prompt {
  margin-top: 4px;
}

.participant-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.add-participant {
  display: flex;
  gap: 8px;
  align-items: center;
}

.add-select {
  flex: 2;
}

.add-role {
  flex: 1;
}

.order-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.order-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 6px;
  font-size: 13px;
}

.order-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.order-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.order-role {
  font-weight: 600;
}

.order-model {
  color: var(--el-text-color-secondary);
}
</style>
