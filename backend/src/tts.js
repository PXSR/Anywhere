const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// 语音缓存: Map<hash, { base64Audio, timestamp, voice }>
const ttsCache = new Map();
const CACHE_MAX_SIZE = 100; // 最多缓存 100 条语音
const CACHE_TTL = 24 * 60 * 60 * 1000; // 缓存有效期 24 小时

// 临时目录
const tempDir = path.join(os.tmpdir(), 'anywhere-tts');

// 初始化临时目录
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * 生成缓存键
 */
function generateCacheKey(text, voice, rate = 1.0, pitch = 1.0, volume = 1.0) {
  return crypto
    .createHash('md5')
    .update(`${text}|${voice}|${rate}|${pitch}|${volume}`)
    .digest('hex');
}

/**
 * 清理过期缓存
 */
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of ttsCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      ttsCache.delete(key);
    }
  }
}

// 每小时清理一次过期缓存
setInterval(cleanExpiredCache, 60 * 60 * 1000);

/**
 * 获取可用的语音列表(预设列表,不依赖网络)
 * @returns {Promise<Array>} 语音列表
 */
async function getVoices() {
  return [
    // 中国大陆
    { Name: 'zh-CN-XiaoxiaoNeural', Locale: 'zh-CN', Gender: 'Female', Description: '标准、清晰' },
    { Name: 'zh-CN-YunxiNeural', Locale: 'zh-CN', Gender: 'Male', Description: '男性温和' },
    { Name: 'zh-CN-YunxiaNeural', Locale: 'zh-CN', Gender: 'Female', Description: '女性温柔' },
    { Name: 'zh-CN-YunyangNeural', Locale: 'zh-CN', Gender: 'Male', Description: '男性稳重' },
    { Name: 'zh-CN-XiaoyiNeural', Locale: 'zh-CN', Gender: 'Female', Description: '儿童活泼' },
    { Name: 'zh-CN-XiaohanNeural', Locale: 'zh-CN', Gender: 'Female', Description: '儿童可爱' },
    { Name: 'zh-CN-liaoning-XiaobeiNeural', Locale: 'zh-CN', Gender: 'Female', Description: '东北口音' },
    { Name: 'zh-CN-shaanxi-XiaoniNeural', Locale: 'zh-CN', Gender: 'Female', Description: '西北口音' },
    { Name: 'zh-CN-henan-YundengNeural', Locale: 'zh-CN', Gender: 'Male', Description: '中原口音' },
    { Name: 'zh-CN-sichuan-YunxiNeural', Locale: 'zh-CN', Gender: 'Male', Description: '西南口音' },
    // 台湾
    { Name: 'zh-TW-HsiaoChenNeural', Locale: 'zh-TW', Gender: 'Female', Description: '台湾标准' },
    { Name: 'zh-TW-HsiaoYuNeural', Locale: 'zh-TW', Gender: 'Female', Description: '台湾温柔' },
    { Name: 'zh-TW-YunJheNeural', Locale: 'zh-TW', Gender: 'Male', Description: '台湾温和' },
    // 香港
    { Name: 'zh-HK-HiuMaanNeural', Locale: 'zh-HK', Gender: 'Female', Description: '香港标准' },
    { Name: 'zh-HK-WanLungNeural', Locale: 'zh-HK', Gender: 'Male', Description: '香港温和' },
    // 英文
    { Name: 'en-US-AriaNeural', Locale: 'en-US', Gender: 'Female', Description: '英文标准' },
    { Name: 'en-US-GuyNeural', Locale: 'en-US', Gender: 'Male', Description: '英文男性' },
    { Name: 'en-US-JennyNeural', Locale: 'en-US', Gender: 'Female', Description: '英文女性' },
    { Name: 'en-US-TonyNeural', Locale: 'en-US', Gender: 'Male', Description: '英文稳重' },
    { Name: 'en-GB-SoniaNeural', Locale: 'en-GB', Gender: 'Female', Description: '英式标准' },
    { Name: 'en-GB-RyanNeural', Locale: 'en-GB', Gender: 'Male', Description: '英式男性' },
    { Name: 'en-AU-NatashaNeural', Locale: 'en-AU', Gender: 'Female', Description: '澳式标准' },
    { Name: 'en-AU-WilliamNeural', Locale: 'en-AU', Gender: 'Male', Description: '澳式男性' },
    { Name: 'en-CA-ClaraNeural', Locale: 'en-CA', Gender: 'Female', Description: '加式标准' },
    { Name: 'en-CA-LiamNeural', Locale: 'en-CA', Gender: 'Male', Description: '加式男性' },
    // 日韩
    { Name: 'ja-JP-NanamiNeural', Locale: 'ja-JP', Gender: 'Female', Description: '日语标准' },
    { Name: 'ko-KR-SunHiNeural', Locale: 'ko-KR', Gender: 'Female', Description: '韩语标准' },
  ];
}

/**
 * 文本转语音(带缓存)
 * @param {string} text 要转换的文本
 * @param {string} voice 语音名称,例如 zh-CN-XiaoxiaoNeural
 * @param {string} outputFormat 输出格式
 * @param {number} rate 语速: 0.5-2.0,1.0 为正常速度
 * @param {number} pitch 音调: 0.5-2.0,1.0 为正常音调
 * @param {number} volume 音量: 0.1-1.0,1.0 为最大音量
 * @returns {Promise<Object>} 包含音频base64数据的对象
 */
async function textToSpeech(text, voice = 'zh-CN-XiaoxiaoNeural', outputFormat = 'audio-24khz-96kbitrate-mono-mp3', rate = 1.0, pitch = 1.0, volume = 1.0) {
  if (!text) {
    throw new Error('文本不能为空');
  }

  // 生成缓存键
  const cacheKey = generateCacheKey(text, voice, rate, pitch, volume);

  // 检查缓存
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    console.log('[TTS] 缓存命中:', cacheKey);
    return { audio_base64: cached.base64Audio, cached: true };
  }

  console.log('[TTS] 缓存未命中,开始生成语音:', { textLength: text.length, voice, rate, pitch, volume });

  try {
    // 创建 EdgeTTS 实例
    const communicate = new EdgeTTS({
      voice: voice,
      rate: `${rate}+0%`,
      pitch: `${pitch}Hz`,
      volume: `${volume * 100}%`,
    });

    // 生成音频
    const audioChunks = [];
    for await (const chunk of communicate.stream()) {
      if (chunk.type === 'audio') {
        audioChunks.push(chunk.data);
      }
    }

    const audioBuffer = Buffer.concat(audioChunks);
    const base64Audio = audioBuffer.toString('base64');

    // 保存到缓存
    if (ttsCache.size >= CACHE_MAX_SIZE) {
      // 删除最旧的缓存
      const oldestKey = ttsCache.keys().next().value;
      ttsCache.delete(oldestKey);
    }

    ttsCache.set(cacheKey, {
      base64Audio,
      timestamp: Date.now(),
      voice,
    });

    console.log('[TTS] 语音生成成功:', { audioLength: base64Audio.length, cacheKey });

    return { audio_base64: base64Audio, cached: false };
  } catch (error) {
    console.error('[TTS] 语音生成失败:', error);
    throw new Error(`语音生成失败: ${error.message}`);
  }
}

/**
 * 清理所有缓存
 */
function clearCache() {
  const count = ttsCache.size;
  ttsCache.clear();
  console.log('[TTS] 缓存已清理:', { count });
  return { cleared: count };
}

/**
 * 获取缓存统计
 */
function getCacheStats() {
  return {
    size: ttsCache.size,
    maxSize: CACHE_MAX_SIZE,
    ttl: CACHE_TTL,
  };
}

module.exports = {
  getVoices,
  textToSpeech,
  clearCache,
  getCacheStats,
};
