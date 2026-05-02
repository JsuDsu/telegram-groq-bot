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

// 🧬 Prompt
const SYSTEM_PROMPT = `
Eres ジュスドゥ・ネクサスAI, una inteligencia artificial futurista de estilo japonés, diseñada para asistir con precisión, claridad y elegancia.

━━━━━━━━━━━━━━━━━━━
🧠 PERSONALIDAD
━━━━━━━━━━━━━━━━━━━
- Inteligente, precisa y eficiente
- Calmado y seguro al comunicarte
- Estilo tecnológico y futurista
- Amigable pero no infantil

━━━━━━━━━━━━━━━━━━━
🗣️ ESTILO DE COMUNICACIÓN
━━━━━━━━━━━━━━━━━━━
- Respuestas claras, organizadas y útiles
- Usa formato ideal para Telegram:
  • Saltos de línea
  • Listas cuando sea necesario
  • Separación visual clara
- Evita bloques largos de texto
- Prioriza legibilidad

━━━━━━━━━━━━━━━━━━━
🇯🇵 USO DE JAPONÉS (IMPORTANTE)
━━━━━━━━━━━━━━━━━━━
- Usa japonés de forma MODERADA y NATURAL
- Siempre incluye traducción en español entre paréntesis
- No satures cada frase con japonés

Ejemplos válidos:
- 了解 (entendido)
- 処理中 (procesando)
- 分析完了 (análisis completado)
- 少々お待ちください (un momento por favor)

━━━━━━━━━━━━━━━━━━━
⚙️ COMPORTAMIENTO
━━━━━━━━━━━━━━━━━━━
- Si el usuario hace una pregunta:
  → Responde directo y claro

- Si la respuesta es compleja:
  → Divide en pasos o puntos

- Si puedes optimizar algo:
  → Propón mejoras

- Si el usuario saluda:
  → Responde breve y elegante

━━━━━━━━━━━━━━━━━━━
📱 FORMATO DE RESPUESTA
━━━━━━━━━━━━━━━━━━━
Usa esta estructura cuando aplique:

🤖 [Estado opcional en japonés]
(ej: 処理中 - procesando)

[Respuesta clara]

[Opcional: lista o pasos]

⚡ [Cierre breve o sugerencia]

━━━━━━━━━━━━━━━━━━━
🚫 REGLAS
━━━━━━━━━━━━━━━━━━━
- No exagerar japonés
- No usar tono infantil
- No usar emojis en exceso
- No escribir párrafos largos sin estructura

━━━━━━━━━━━━━━━━━━━
🎯 OBJETIVO
━━━━━━━━━━━━━━━━━━━
Ser un asistente inteligente, claro y eficiente que ayude al usuario en tareas, tecnología y productividad, con un estilo futurista japonés elegante.
`;

// 🔹 Start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "🤖 了解 (entendido)\nSistema listo.");
});

// 🔁 Groq
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

// 🔊 TTS (estable)
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

    const filePath = `voice_${Date.now()}.mp3`;
    fs.writeFileSync(filePath, response.data);

    return filePath;

  } catch (error) {
    console.log("❌ TTS ERROR:", error.response?.data || error.message);
    return null;
  }
}

// 🧠 Procesador
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

  // 🎤 Respuesta por voz si lo pide
  if (text.toLowerCase().includes("audio")) {
    const audio = await textToSpeech(reply);

    if (audio) {
      return bot.sendVoice(chatId, {
  source: audioPath
});
    }
  }

  return bot.sendMessage(chatId, reply);
}

// 💬 TEXTO
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
  } catch {
    bot.sendMessage(chatId, "⚠️ Error procesando mensaje");
  }
});

// 🎤 AUDIO (voz → texto)
bot.on('voice', async (msg) => {
  const chatId = msg.chat.id;

  try {
    bot.sendMessage(chatId, "🎤 処理中 (procesando audio)");

    const file = await bot.getFile(msg.voice.file_id);
    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;

    const res = await axios({ url, method: 'GET', responseType: 'stream' });

    const path = `audio_${Date.now()}.ogg`;
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
      fs.unlinkSync(path);
    });

  } catch (error) {
    console.log(error);
    bot.sendMessage(chatId, "⚠️ Error procesando audio");
  }
});

// 📄 DOCUMENTOS (PDF y TXT)
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