require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const FormData = require('form-data');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const app = express();

// 🌐 Keep alive
app.get('/', (req, res) => res.send("🤖 ジュスドゥ・ネクサスAI activo"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor en puerto " + PORT));

// 🤖 Bot
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// 🧠 Memoria
const userMemory = {};
const cooldown = {};

const MAX_HISTORY = 6;
const COOLDOWN_TIME = 3000;

// 📁 TEMP DIR (CLAVE PARA RENDER)
const TEMP_DIR = "/tmp";

// 🧬 SYSTEM PROMPT
const SYSTEM_PROMPT = `... (tu prompt completo igual, sin cambios)`;

// 🔹 Start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🤖 了解 (entendido)\nSistema listo.");
});

// 🔁 GROQ
async function callGroq(messages, retries = 2) {
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`
        }
      }
    );

    return res.data.choices[0].message.content;

  } catch (err) {
    if (retries > 0) return callGroq(messages, retries - 1);
    console.log("❌ GROQ ERROR:", err.response?.data || err.message);
    throw err;
  }
}

// 🔊 TTS (FIX RENDER)
async function textToSpeech(text) {
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.VOICE_ID}`,
      {
        text,
        model_id: "eleven_multilingual_v2"
      },
      {
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg"
        },
        responseType: "arraybuffer"
      }
    );

    if (!response.data || response.data.length < 1000) {
      console.log("❌ Audio inválido");
      return null;
    }

    const filePath = `${TEMP_DIR}/voice_${Date.now()}.mp3`;
    fs.writeFileSync(filePath, Buffer.from(response.data));

    return filePath;

  } catch (error) {
    console.log("❌ TTS ERROR:", error.message);
    return null;
  }
}

// 🎤 AUDIO HANDLER (PRO)
async function processAudio(chatId, text) {
  const audioPath = await textToSpeech(text);

  if (!audioPath || !fs.existsSync(audioPath)) {
    return bot.sendMessage(chatId, text);
  }

  try {
    await bot.sendAudio(chatId, fs.createReadStream(audioPath));
  } catch (err) {
    console.log("❌ AUDIO SEND ERROR:", err.message);
    await bot.sendMessage(chatId, text);
  }

  setTimeout(() => {
    fs.unlink(audioPath, () => {});
  }, 5000);
}

// 🧠 PROCESS TEXT
async function processText(chatId, text) {
  if (!userMemory[chatId]) userMemory[chatId] = [];

  userMemory[chatId].push({ role: "user", content: text });
  userMemory[chatId] = userMemory[chatId].slice(-MAX_HISTORY);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...userMemory[chatId]
  ];

  bot.sendChatAction(chatId, "typing");

  const reply = await callGroq(messages);

  userMemory[chatId].push({ role: "assistant", content: reply });

  // 🎤 AUDIO MODE
  if (text.toLowerCase().includes("audio")) {
    return await processAudio(chatId, reply);
  }

  return bot.sendMessage(chatId, reply);
}

// 💬 TEXT MESSAGE
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.text) return;

  const text = msg.text.trim();
  if (text === "/start") return;

  const now = Date.now();
  if (cooldown[chatId] && now - cooldown[chatId] < COOLDOWN_TIME) {
    return bot.sendMessage(chatId, "⏳ Espera un momento");
  }
  cooldown[chatId] = now;

  try {
    await processText(chatId, text);
  } catch (err) {
    console.log(err);
    bot.sendMessage(chatId, "⚠️ Error procesando mensaje");
  }
});

// 🎤 VOICE → TEXT
bot.on('voice', async (msg) => {
  const chatId = msg.chat.id;

  try {
    bot.sendMessage(chatId, "🎤 処理中 (procesando audio)");

    const file = await bot.getFile(msg.voice.file_id);
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;

    const res = await axios({ url, method: 'GET', responseType: 'stream' });

    const path = `${TEMP_DIR}/audio_${Date.now()}.ogg`;
    const writer = fs.createWriteStream(path);

    res.data.pipe(writer);

    writer.on('finish', async () => {
      const form = new FormData();
      form.append('file', fs.createReadStream(path));
      form.append('model', 'whisper-large-v3');

      const trans = await axios.post(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`
          }
        }
      );

      await processText(chatId, trans.data.text);

      fs.unlink(path, () => {});
    });

  } catch (error) {
    console.log(error);
    bot.sendMessage(chatId, "⚠️ Error procesando audio");
  }
});

// 📄 DOCUMENTOS
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;

  try {
    bot.sendMessage(chatId, "📄 処理中 (procesando documento)");

    const file = await bot.getFile(msg.document.file_id);
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;

    const res = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer'
    });

    const mime = msg.document.mime_type;

    let text = "";

    if (mime === "application/pdf") {
      const data = await pdfParse(res.data);
      text = data.text;
    } else if (mime === "text/plain") {
      text = res.data.toString('utf-8');
    } else {
      return bot.sendMessage(chatId, "⚠️ Formato no soportado");
    }

    text = text.slice(0, 3000);

    await processText(chatId, `Documento:\n${text}`);

  } catch (error) {
    console.log("DOC ERROR:", error);
    bot.sendMessage(chatId, "⚠️ Error procesando documento");
  }
});

// 💀 GLOBAL ERROR HANDLERS (RENDER STABILITY)
process.on('uncaughtException', (err) => {
  console.log("🔥 Uncaught:", err);
});

process.on('unhandledRejection', (err) => {
  console.log("🔥 Unhandled:", err);
});