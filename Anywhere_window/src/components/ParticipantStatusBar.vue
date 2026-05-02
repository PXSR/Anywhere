<script setup>
import { computed } from 'vue'

const props = defineProps({
  participants: { type: Array, default: () => [] },
  currentSpeakingIndex: { type: Number, default: -1 },
  statusMap: { type: Object, default: () => ({}) },  // participantId -> 'idle'|'thinking'|'speaking'|'done'|'error'
})

const emit = defineEmits(['participant-click'])

function getStatusIcon(status) {
  switch (status) {
    case 'thinking': return '⏳'
    case 'speaking': return '💬'
    case 'done': return '✅'
    case 'error': return '❌'
    default: return '⏸️'
  }
}

function getStatusClass(status) {
  return `status-${status || 'idle'}`
}
</script>

<template>
  <div class="participant-status-bar" v-if="participants.length > 0">
    <div
      v-for="(p, index) in participants"
      :key="p.id"
      class="status-item"
      :class="[
        getStatusClass(statusMap[p.id]),
        { 'is-speaking': currentSpeakingIndex === index }
      ]"
      :style="{ '--participant-color': p.color }"
      @click="emit('participant-click', p)"
    >
      <div class="status-avatar" :style="{ backgroundColor: p.color }">
        {{ p.role.charAt(0) }}
      </div>
      <div class="status-info">
        <span class="status-role">{{ p.role }}</span>
        <span class="status-model">{{ p.providerName }}/{{ p.model }}</span>
      </div>
      <div class="status-icon">{{ getStatusIcon(statusMap[p.id]) }}</div>
      <div v-if="p.isModerator" class="moderator-badge">🎙️</div>
    </div>
  </div>
</template>

<style scoped>
.participant-status-bar {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  background-color: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
  overflow-x: auto;
  flex-shrink: 0;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 20px;
  background-color: var(--el-fill-color-light);
  border: 2px solid transparent;
  transition: all 0.3s ease;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
}

.status-item:hover {
  background-color: var(--el-fill-color);
}

.status-item.is-speaking {
  border-color: var(--participant-color);
  background-color: color-mix(in srgb, var(--participant-color) 10%, var(--el-fill-color-light));
  animation: pulse-border 1.5s ease-in-out infinite;
}

@keyframes pulse-border {
  0%, 100% { border-color: var(--participant-color); }
  50% { border-color: transparent; }
}

.status-avatar {
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

.status-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.status-role {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-model {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.status-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.moderator-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  font-size: 12px;
}

.status-thinking .status-avatar {
  animation: thinking-pulse 1s ease-in-out infinite;
}

@keyframes thinking-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.status-speaking .status-avatar {
  animation: speaking-glow 0.8s ease-in-out infinite;
}

@keyframes speaking-glow {
  0%, 100% { box-shadow: 0 0 0 0 var(--participant-color); }
  50% { box-shadow: 0 0 8px 2px var(--participant-color); }
}
</style>
