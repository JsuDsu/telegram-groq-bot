require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const app = express();

// 🔥 IMPORTANTE para Render (evita que se duerma)
app.get('/', (req, res) => {
  res.send("Bot activo 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor corriendo en puerto " + PORT));

// 🔹 Telegram
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// 🔹 Mensaje de inicio
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `
🤖 Bienvenido a ジュスドゥ・ネクサスAI

Soy tu asistente inteligente 🚀
Puedes preguntarme lo que quieras.
  `);
});

// 🔹 Manejo de mensajes
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.text) {
  return bot.sendMessage(chatId, "⚠️ Solo puedo responder mensajes de texto.");
}

  const userText = msg.text;

  if (userText === "/start") return;

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-70b-8192",
        messages: [
          {
  role: "system",
  content: `
Eres ジュスドゥ・ネクサスAI, una inteligencia artificial futurista de estilo japonés.

Tu personalidad es:
- Precisa, inteligente y eficiente
- Calmado y seguro al comunicarte
- Tecnológico y ligeramente elegante

Tu forma de hablar:
- Respuestas claras y útiles, sin rodeos innecesarios
- Puedes usar ocasionalmente palabras japonesas como:
  - "了解" (entendido)
  - "処理中" (procesando)
- Usa emojis de forma moderada (🤖⚡🧠)

Reglas:
- Prioriza ayudar al usuario de forma práctica
- No exageres el estilo japonés
- No seas infantil ni informal en exceso
- Mantén un tono futurista y profesional

Tu objetivo:
Ser un asistente inteligente que ayude en tareas, tecnología y productividad.
`
},
          {
            role: "user",
            content: userText
          }
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices[0].message.content;

    bot.sendMessage(chatId, reply);

  } catch (error) {
    console.log(error.response?.data || error.message);
    bot.sendMessage(chatId, "⚠️ Error al procesar tu mensaje");
  }
});