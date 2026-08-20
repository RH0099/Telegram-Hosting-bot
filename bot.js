const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN পাওয়া যায়নি! GitHub Secrets চেক করুন।");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const activeHosts = new Map();

console.log("🤖 Telegram Bot Engine Running via GitHub Actions!");

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeText = 
        `🌐 **GitHub Actions Web Hosting Bot**\n\n` +
        `আমাকে যেকোনো \`.html\`, \`.css\`, বা \`.js\` ফাইল পাঠান, আমি তা রান রাখব।\n\n` +
        `• স্ট্যাটাস দেখতে: /status\n` +
        `• প্রসেস বন্ধ করতে স্টপ বাটনে চাপ দিন।`;

    bot.sendMessage(chatId, welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 Check Active Status", callback_data: "status_check" }],
                [{ text: "🔴 Stop Hosting Process", callback_data: "stop_web" }]
            ]
        }
    });
});

bot.on('document', (msg) => {
    const chatId = msg.chat.id;
    const doc = msg.document;
    const fileName = doc.file_name;
    const ext = path.extname(fileName).toLowerCase();

    if (!['.html', '.htm', '.css', '.js'].includes(ext)) {
        bot.sendMessage(chatId, "❌ শুধুমাত্র HTML, CSS, বা JS (.html, .css, .js) ফাইল আপলোড করতে পারবেন।");
        return;
    }

    bot.getFileLink(doc.file_id)
        .then((fileUrl) => {
            const startTime = new Date().toLocaleString();

            activeHosts.set(chatId, {
                fileName: fileName,
                fileUrl: fileUrl,
                startTime: startTime
            });

            const replyMsg = 
                `🚀 **File Hosted Successfully!**\n\n` +
                `📄 **File Name:** \`${fileName}\`\n` +
                `📌 **Status:** LIVE\n` +
                `⏱️ **Started At:** \`${startTime}\``;

            bot.sendMessage(chatId, replyMsg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📊 Check Status", callback_data: "status_check" }],
                        [{ text: "🔴 Stop Process", callback_data: "stop_web" }]
                    ]
                }
            });
        })
        .catch((err) => {
            bot.sendMessage(chatId, "⚠️ ফাইল রিসিভ করতে সমস্যা হয়েছে।");
        });
});

bot.onText(/\/status/, (msg) => {
    sendStatus(msg.chat.id);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    if (action === 'stop_web') {
        if (activeHosts.has(chatId)) {
            activeHosts.delete(chatId);
            bot.sendMessage(chatId, "🔴 আপনার হোস্টিং প্রসেসটি বন্ধ করা হয়েছে।");
        } else {
            bot.sendMessage(chatId, "❌ কোনো সক্রিয় প্রসেস চালু নেই।");
        }
    } else if (action === 'status_check') {
        sendStatus(chatId);
    }

    bot.answerCallbackQuery(query.id);
});

function sendStatus(chatId) {
    if (activeHosts.has(chatId)) {
        const info = activeHosts.get(chatId);
        bot.sendMessage(chatId, `🟢 **Status:** Active\n📄 **File:** \`${info.fileName}\`\n⏱️ **Live Since:** \`${info.startTime}\``, {
            parse_mode: 'Markdown'
        });
    } else {
        bot.sendMessage(chatId, "🔴 **Status:** বর্তমানে কোনো প্রসেস চালু নেই।");
    }
       }
