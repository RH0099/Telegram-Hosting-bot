const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

// GitHub Secrets থেকে টোকেন গ্রহণ
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN পাওয়া যায়নি! GitHub Secrets চেক করুন।");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const activeHosts = new Map();

console.log("🤖 Telegram Bot Engine Running via GitHub Actions!");

// Start Command
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

// Document/File Listener (.html, .css, .js)
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

// Status Command
bot.onText(/\/status/, (msg) => {
    sendStatus(msg.chat.id);
});

// Callback Button Actions
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

// Helper Function
function sendStatus(chatId) {
    if (activeHosts.has(chatId)) {
        const info = activeHosts.get(chatId);
        bot.sendMessage(chatId, `🟢 **Status:** Active\n📄 **File:** \`${info.fileName}\`\n⏱️ **Live Since:** \`${info.startTime}\``, {
            parse_mode: 'Markdown'
        });
    } else {
        bot.sendMessage(chatId, "🔴 **Status:** বর্তমানে কোনো প্রসেস চালু নেই।");
    }
}// Document/File Listener (.html, .css, .js)
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const doc = msg.document;
    const fileName = doc.file_name;
    const ext = path.extname(fileName).toLowerCase();

    if (!['.html', '.htm', '.css', '.js'].includes(ext)) {
        return bot.sendMessage(chatId, "❌ শুধুমাত্র HTML, CSS, বা JS (.html, .css, .js) ফাইল আপলোড করতে পারবেন।");
    }

    try {
        const fileUrl = await bot.getFileLink(doc.file_id);
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

    } catch (err) {
        bot.sendMessage(chatId, "⚠️ ফাইল রিসিভ করতে সমস্যা হয়েছে।");
    }
});

// Status Command Handler
bot.onText(/\/status/, (msg) => {
    sendStatus(msg.chat.id);
});

// Callback Button Actions
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

// Helper Function
function sendStatus(chatId) {
    if (activeHosts.has(chatId)) {
        const info = activeHosts.get(chatId);
        bot.sendMessage(chatId, `🟢 **Status:** Active\n📄 **File:** \`${info.fileName}\`\n⏱️ **Live Since:** \`${info.startTime}\``, {
            parse_mode: 'Markdown'
        });
    } else {
        bot.sendMessage(chatId, "🔴 **Status:** বর্তমানে কোনো প্রসেস চালু নেই।");
    }
}// Document/File Listener (.html, .css, .js)
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const doc = msg.document;
    const fileName = doc.file_name;
    const ext = path.extname(fileName).toLowerCase();

    if (!['.html', '.htm', '.css', '.js'].includes(ext)) {
        return bot.sendMessage(chatId, "❌ শুধুমাত্র HTML, CSS, বা JS (.html, .css, .js) ফাইল আপলোড করতে পারবেন।");
    }

    try {
        const fileUrl = await bot.getFileLink(doc.file_id);
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

    } catch (err) {
        bot.sendMessage(chatId, "⚠️ ফাইল রিসিভ করতে সমস্যা হয়েছে।");
    }
});

// Status Command
bot.onText(/\/status/, (msg) => {
    sendStatus(msg.chat.id);
});

// Callback Button Actions
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

// Helper Function
function sendStatus(chatId) {
    if (activeHosts.has(chatId)) {
        const info = activeHosts.get(chatId);
        bot.sendMessage(chatId, `🟢 **Status:** Active\n📄 **File:** \`${info.fileName}\`\n⏱️ **Live Since:** \`${info.startTime}\``, {
            parse_mode: 'Markdown'
        });
    } else {
        bot.sendMessage(chatId, "🔴 **Status:** বর্তমানে কোনো প্রসেস চালু নেই।");
    }
}    const chatId = msg.chat.id;
    const doc = msg.document;
    const fileName = doc.file_name;
    const ext = path.extname(fileName).toLowerCase();

    if (!['.html', '.htm', '.css', '.js'].includes(ext)) {
        return bot.sendMessage(chatId, "❌ শুধুমাত্র HTML, CSS, বা JS (.html, .css, .js) ফাইল আপলোড করতে পারবেন।");
    }

    try {
        const fileUrl = await bot.getFileLink(doc.file_id);
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

    } catch (err) {
        bot.sendMessage(chatId, "⚠️ ফাইল রিসিভ করতে সমস্যা হয়েছে।");
    }
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
}    bot.sendMessage(chatId, welcomeText, options);
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
