// ==================== CONFIGURATION ====================
// আপনার টেলিগ্রাম বট টোকেনটি নিচে বসিয়ে দিন
const BOT_TOKEN = "7983300358:AAEcVH9f1En9I21QCzbhpZ_W41zXOoaR2lw";

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Initialize Telegram Bot with Long Polling
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Active Web Hosting Storage
const activeWebHosts = new Map();

console.log("🤖 JS Web Hosting Bot Engine Started...");

// ==================== START COMMAND ====================
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeText = 
        `🌐 **JS Web Hosting & File Manager Bot**\n\n` +
        `আমি আপনার পাঠানো HTML, CSS, এবং JS ফাইল ব্যাকগ্রাউন্ডে হোস্ট করার জন্য প্রস্তুত।\n\n` +
        `📌 **কিভাবে ব্যবহার করবেন:**\n` +
        `1. আপনার \`.html\`, \`.css\`, বা \`.js\` ফাইল আপলোড করুন।\n` +
        `2. এটি ম্যানুয়ালি বন্ধ করার নির্দেশ না দেওয়া পর্যন্ত ব্যাকগ্রাউন্ডে চলতে থাকবে।\n` +
        `3. রানিং প্রসেস দেখতে ও নিয়ন্ত্রণ করতে /status কমান্ড ব্যবহার করুন।`;

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 Check Active Status", callback_data: "status_check" }],
                [{ text: "🔴 Stop Hosting", callback_data: "stop_web" }]
            ]
        }
    };

    bot.sendMessage(chatId, welcomeText, options);
});

// ==================== FILE HANDLING LOGIC ====================
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const doc = msg.document;
    const fileName = doc.file_name;
    const ext = path.extname(fileName).toLowerCase();

    // Check if uploaded file is HTML, CSS, or JS
    if (!['.html', '.htm', '.css', '.js'].includes(ext)) {
        bot.sendMessage(chatId, "❌ শুধুমাত্র HTML, CSS, এবং JavaScript (.html, .css, .js) ফাইল আপলোড করতে পারবেন।");
        return;
    }

    try {
        // Fetch file URL from Telegram servers
        const fileUrl = await bot.getFileLink(doc.file_id);
        const startTime = new Date().toLocaleString();

        // Store active process in memory
        activeWebHosts.set(chatId, {
            fileName: fileName,
            fileUrl: fileUrl,
            status: "LIVE",
            startTime: startTime
        });

        const statusMsg = 
            `🚀 **File Hosted Successfully!**\n\n` +
            `📄 **File Name:** \`${fileName}\`\n` +
            `📌 **Status:** LIVE (Running Indefinitely)\n` +
            `⏱️ **Started At:** \`${startTime}\`\n\n` +
            `এটি কম্যান্ড দিয়ে বন্ধ না করা পর্যন্ত চালু থাকবে।`;

        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📊 Active Status", callback_data: "status_check" }],
                    [{ text: "🔴 Stop Hosting Process", callback_data: "stop_web" }]
                ]
            }
        };

        bot.sendMessage(chatId, statusMsg, options);

    } catch (error) {
        bot.sendMessage(chatId, "⚠️ ফাইল হোস্টিং প্রসেস করতে একটি সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    }
});

// ==================== STATUS COMMAND ====================
bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    sendStatusMessage(chatId);
});

// ==================== CALLBACK BUTTON ACTIONS ====================
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    if (action === 'stop_web') {
        if (activeWebHosts.has(chatId)) {
            activeWebHosts.delete(chatId);
            bot.editMessageText("🔴 আপনার হোস্টিং প্রসেসটি সফলভাবে বন্ধ করা হয়েছে।", {
                chat_id: chatId,
                message_id: query.message.message_id
            });
        } else {
            bot.sendMessage(chatId, "❌ আপনার কোনো সক্রিয় হোস্টিং প্রসেস চালু নেই।");
        }
    } else if (action === 'status_check') {
        sendStatusMessage(chatId);
    }

    bot.answerCallbackQuery(query.id);
});

// Helper Function for Status
function sendStatusMessage(chatId) {
    if (activeWebHosts.has(chatId)) {
        const info = activeWebHosts.get(chatId);
        const msg = 
            `📊 **Web Manager Control Panel**\n\n` +
            `🟢 **Status:** Active\n` +
            `📄 **File:** \`${info.fileName}\`\n` +
            `⏱️ **Live Since:** \`${info.startTime}\``;

        bot.sendMessage(chatId, msg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: "🔴 Stop Process", callback_data: "stop_web" }]]
            }
        });
    } else {
        bot.sendMessage(chatId, "📊 **Status:** কোনো প্রজেক্ট বা ফাইল এই মুহূর্তে রান হচ্ছে না।");
    }
}