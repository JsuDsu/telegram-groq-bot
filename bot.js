require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const app = express();

// 🌐 Endpoint para mantener vivo en Render
app.get('/', (req, res) => {
  res.send("🤖 ジュスドゥ・ネクサスAI activo");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Servidor activo en puerto " + PORT));

// 🤖 Inicializar bot
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// 🧠 Memoria por usuario
const userMemory = {};

// ⏱️ Control anti-spam
const lastMessageTime = {};

// 🎭 Personalidad (PROMPT)
const SYSTEM_PROMPT = `
Eres ジュスドゥ・ネクサスAI, una inteligencia artificial futurista de estilo japonés.

Tu personalidad es:
- Precisa, inteligente y eficiente
- Calmado y seguro
- Tecnológico y elegante

Tu forma de hablar:
- Respuestas claras y útiles
- Sin rodeos innecesarios
- Puedes usar ocasionalmente:
  - "了解" (entendido)
  - "処理中" (procesando)
- Usa emojis moderados 🤖⚡🧠

Reglas:
- No seas infantil
- No exageres el estilo japonés
- Prioriza ayudar de forma práctica

Objetivo:
Asistir en productividad, tecnología y tareas.
`;

// 🚀 Comando /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `
了解 🤖

Soy ジュスドゥ・ネクサスAI  
Tu asistente inteligente.

Usa /help para ver comandos disponibles.
  `);
});

// 🧠 Comando /reset
bot.onText(/\/reset/, (msg) => {
  userMemory[msg.chat.id] = [];
  bot.sendMessage(msg.chat.id, "🧠 Memoria reiniciada.");
});

// 📘 Comando /help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, `
🤖 Comandos disponibles:

/start → Iniciar bot  
/reset → Borrar memoria  
/help → Ver ayuda  

Puedes escribirme cualquier cosa y te responderé.
  `);
});

// 💬 Manejo principal
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // 🚫 Ignorar comandos
  if (!msg.text || msg.text.startsWith('/')) return;

  // 🚫 Anti-spam (2 segundos)
  const now = Date.now();
  if (lastMessageTime[chatId] && now - lastMessageTime[chatId] < 2000) {
    return;
  }
  lastMessageTime[chatId] = now;

  // ✂️ Limitar longitud
  const userText = msg.text.slice(0, 1000);

  // 🧠 Inicializar memoria
  if (!userMemory[chatId]) {
    userMemory[chatId] = [];
  }

  userMemory[chatId].push({ role: "user", content: userText });

  // ✍️ Indicador escribiendo
  bot.sendChatAction(chatId, "typing");

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-70b-8192",
        temperature: 0.7,
        max_tokens: 800,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...userMemory[chatId].slice(-6)
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices[0].message.content;

    // 🧠 Guardar respuesta
    userMemory[chatId].push({ role: "assistant", content: reply });

    bot.sendMessage(chatId, reply);

  } catch (error) {
    console.log("ERROR:", error.response?.data || error.message);

    if (error.response?.status === 429) {
      return bot.sendMessage(chatId, "⚠️ Demasiadas solicitudes. Intenta en unos segundos.");
    }

    if (error.response?.status === 401) {
      return bot.sendMessage(chatId, "🔑 Error de autenticación.");
    }

    bot.sendMessage(chatId, "⚠️ Error inesperado.");
  }
});