const express = require('express');
const axios = require('axios');
const csv = require('csv-parser');
const cron = require('node-cron');
const fs = require('fs');
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_FILE = './whatsapp-session.json';
const SHEET_ID = '1PyuQv25BIx4h8UxBol7npDdjw6FpT6bfUxQOTxppIds'; // Replace with your Google Sheet ID
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Folha1`;
const GROUP_NAME = 'Primos André'; // Replace with exact WhatsApp group name
const MONTH_MAP = {
  'Janeiro': 0, 'Fevereiro': 1, 'Março': 2, 'Abril': 3, 'Maio': 4, 'Junho': 5,
  'Julho': 6, 'Agosto': 7, 'Setembro': 8, 'Outubro': 9, 'Novembro': 10, 'Dezembro': 11
};
const ENGLISH_TO_PT_MONTH = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Set timezone (adjust to your region, e.g., 'America/Sao_Paulo' for Brazil)
process.env.TZ = 'Europe/Lisbon';

let client;

async function loadSession() {
  if (fs.existsSync(SESSION_FILE)) {
    return JSON.parse(fs.readFileSync(SESSION_FILE));
  }
  return null;
}

async function initWhatsApp() {
  const session = await loadSession();
  client = new Client({ session });

  client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('Scan this QR with your WhatsApp app to log in.');
  });

  client.on('ready', () => console.log('WhatsApp client ready'));
  client.on('authenticated', session => {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session));
    console.log('WhatsApp session saved');
  });
  client.on('auth_failure', () => console.error('Authentication failed, delete session file and rescan'));

  await client.initialize();
}

async function fetchSheet() {
  try {
    const response = await axios.get(CSV_URL, { responseType: 'stream' });
    const sheetData = [];
    return new Promise((resolve, reject) => {
      response.data
        .pipe(csv())
        .on('data', row => sheetData.push(Object.values(row)))
        .on('end', () => resolve(sheetData))
        .on('error', err => reject(err));
    });
  } catch (err) {
    console.error('Error fetching sheet:', err.message);
    throw err;
  }
}

async function getBirthdayMessage() {
  try {
    const sheetData = await fetchSheet();
    const today = new Date();
    const ptMonth = ENGLISH_TO_PT_MONTH[today.getMonth()];
    const colIndex = MONTH_MAP[ptMonth];
    const rowIndex = today.getDate(); // Day 1 = row 1 (header is row 0)
    const value = sheetData[rowIndex]?.[colIndex]?.trim();
    return value ? `Parabéns ${value}` : null;
  } catch (err) {
    console.error('Error processing birthday:', err.message);
    return null;
  }
}

async function sendMessage(message) {
  try {
    const chats = await client.getChats();
    const group = chats.find(chat => chat.name === GROUP_NAME && chat.isGroup);
    if (group) {
      await group.sendMessage(message);
      console.log(`Sent message: ${message}`);
    } else {
      console.error(`Group "${GROUP_NAME}" not found`);
    }
  } catch (err) {
    console.error('Error sending message:', err.message);
  }
}

// Schedule daily at 00:00
cron.schedule('0 0 * * *', async () => {
  console.log('Checking birthdays...');
  const message = await getBirthdayMessage();
  if (message) {
    await sendMessage(message);
  } else {
    console.log('No birthdays today');
  }
});

// Dummy Express server for Render
app.get('/', (req, res) => res.send('Birthday Bot Running'));

// Start server and WhatsApp
initWhatsApp().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => console.error('Failed to initialize WhatsApp:', err));