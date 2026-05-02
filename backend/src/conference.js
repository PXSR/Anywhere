const crypto = require('crypto');

/**
 * 生成唯一会话 ID
 */
function generateSessionId() {
  return `conf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 创建会议会话
 * @param {Object} config - 会议配置
 * @param {string} config.topic - 讨论主题
 * @param {number} config.rounds - 讨论轮数
 * @param {Array} config.participants - 参与者列表
 * @param {string} config.moderatorId - 主持人参与者 ID
 * @param {boolean} config.enableCrossReference - 是否允许 AI 互相引用
 */
function createConferenceSession(config) {
  const sessionId = generateSessionId();
  const session = {
    id: sessionId,
    topic: config.topic || '',
    rounds: Math.max(1, config.rounds || 3),
    participants: (config.participants || []).map((p, index) => ({
      id: p.id || `p_${index}`,
      providerId: p.providerId,
      model: p.model,
      role: p.role || `参与者${index + 1}`,
      systemPrompt: p.systemPrompt || '',
      color: p.color || stringToColor(p.role || `${index}`),
      order: index,
      isModerator: p.id === config.moderatorId || false,
    })),
    moderatorId: config.moderatorId || null,
    enableCrossReference: config.enableCrossReference !== false,
    messages: [],
    status: 'created', // created | running | paused | completed | error
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 确保主持人排在最后（发言顺序）
  session.participants.sort((a, b) => {
    if (a.isModerator) return 1;
    if (b.isModerator) return -1;
    return a.order - b.order;
  });

  // 存储到 utools db
  saveSessionToDb(session);

  return { success: true, session };
}

/**
 * 读取会议会话
 */
function getConferenceSession(sessionId) {
  try {
    const doc = utools.db.get(`conference_session_${sessionId}`);
    if (doc && doc.data) {
      return { success: true, session: doc.data };
    }
    return { success: false, error: 'Session not found' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 更新会议会话
 */
function updateConferenceSession(sessionId, data) {
  try {
    const doc = utools.db.get(`conference_session_${sessionId}`);
    if (!doc) return { success: false, error: 'Session not found' };

    const session = doc.data;
    Object.assign(session, data, { updatedAt: Date.now() });

    utools.db.put({ _id: doc._id, data: session, _rev: doc._rev });
    return { success: true, session };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 添加会议消息
 */
function addConferenceMessage(sessionId, message) {
  try {
    const doc = utools.db.get(`conference_session_${sessionId}`);
    if (!doc) return { success: false, error: 'Session not found' };

    const session = doc.data;
    const msg = {
      id: message.id || `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      role: message.role, // 'user' | 'ai' | 'system'
      content: message.content || '',
      timestamp: Date.now(),
      round: message.round || 0,
      participantId: message.participantId || null,
      participantRole: message.participantRole || null,
      participantColor: message.participantColor || null,
      status: message.status || 'completed', // 'thinking' | 'streaming' | 'completed' | 'error'
    };

    if (message.participantId) {
      const p = session.participants.find(p => p.id === message.participantId);
      if (p) {
        msg.participantRole = p.role;
        msg.participantColor = p.color;
        msg.participantModel = p.model;
      }
    }

    session.messages.push(msg);
    session.updatedAt = Date.now();

    utools.db.put({ _id: doc._id, data: session, _rev: doc._rev });
    return { success: true, message: msg };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 更新会议消息内容（流式更新）
 */
function updateConferenceMessage(sessionId, messageId, updates) {
  try {
    const doc = utools.db.get(`conference_session_${sessionId}`);
    if (!doc) return { success: false, error: 'Session not found' };

    const session = doc.data;
    const msgIndex = session.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return { success: false, error: 'Message not found' };

    Object.assign(session.messages[msgIndex], updates);
    session.updatedAt = Date.now();

    utools.db.put({ _id: doc._id, data: session, _rev: doc._rev });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 获取所有会议会话列表
 */
function listConferenceSessions() {
  try {
    const docs = utools.db.allDocs('conference_session_');
    return {
      success: true,
      sessions: docs.map(doc => ({
        id: doc.data.id,
        topic: doc.data.topic,
        status: doc.data.status,
        messageCount: doc.data.messages?.length || 0,
        createdAt: doc.data.createdAt,
        updatedAt: doc.data.updatedAt,
      })).sort((a, b) => b.updatedAt - a.updatedAt),
    };
  } catch (e) {
    return { success: false, error: e.message, sessions: [] };
  }
}

/**
 * 删除会议会话
 */
function deleteConferenceSession(sessionId) {
  try {
    const doc = utools.db.get(`conference_session_${sessionId}`);
    if (!doc) return { success: false, error: 'Session not found' };
    utools.db.remove(doc);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 导出会议记录为 Markdown
 */
function exportConferenceToMarkdown(sessionId) {
  try {
    const doc = utools.db.get(`conference_session_${sessionId}`);
    if (!doc) return { success: false, error: 'Session not found' };

    const session = doc.data;
    const lines = [];

    // 标题
    lines.push(`# 会议讨论: ${session.topic || '未命名会议'}`);
    lines.push('');

    // 元信息
    lines.push('**参与者**:');
    session.participants.forEach(p => {
      const moderatorBadge = p.isModerator ? ' 🎙️(主持人)' : '';
      lines.push(`- ${p.role} (${p.providerId}/${p.model})${moderatorBadge}`);
    });
    lines.push('');
    lines.push(`**讨论轮数**: ${session.rounds}轮`);
    lines.push(`**创建时间**: ${new Date(session.createdAt).toLocaleString('zh-CN')}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // 按轮次分组消息
    const userMessages = session.messages.filter(m => m.role === 'user');
    const aiMessages = session.messages.filter(m => m.role === 'ai');

    // 找出最大轮数
    const maxRound = Math.max(0, ...session.messages.map(m => m.round || 0));

    for (let round = 0; round <= maxRound; round++) {
      const roundUserMsg = userMessages.find(m => m.round === round);
      const roundAiMsgs = aiMessages.filter(m => m.round === round);

      if (!roundUserMsg && roundAiMsgs.length === 0) continue;

      lines.push(`## 第${round + 1}轮`);
      lines.push('');

      if (roundUserMsg) {
        lines.push(`**用户**: ${roundUserMsg.content}`);
        lines.push('');
      }

      roundAiMsgs.forEach(msg => {
        const role = msg.participantRole || 'AI';
        lines.push(`**${role}**: ${msg.content}`);
        lines.push('');
      });

      lines.push('---');
      lines.push('');
    }

    return { success: true, markdown: lines.join('\n') };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// --- 内部辅助函数 ---

function saveSessionToDb(session) {
  try {
    utools.db.put({
      _id: `conference_session_${session.id}`,
      data: session,
    });
  } catch (e) {
    console.error('[Conference] Failed to save session:', e);
  }
}

function stringToColor(str) {
  if (!str) return '#6B7280';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const s = 55 + (Math.abs(hash) % 25);
  const l = 45 + (Math.abs(hash) % 15);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

module.exports = {
  createConferenceSession,
  getConferenceSession,
  updateConferenceSession,
  addConferenceMessage,
  updateConferenceMessage,
  listConferenceSessions,
  deleteConferenceSession,
  exportConferenceToMarkdown,
};
