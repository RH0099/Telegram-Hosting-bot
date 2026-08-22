const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');
const localtunnel = require('localtunnel');
const unzipper = require('unzipper');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN পাওয়া যায়নি! GitHub Secrets বা Environment Variables চেক করুন।");
    process.exit(1);
}

// টার্মিনালে টোকেন প্রদর্শনের সিকিউর ট্র্যাকিং ফোল্ড-আউট
const maskedToken = BOT_TOKEN.substring(0, 8) + '...' + BOT_TOKEN.substring(BOT_TOKEN.length - 4);
console.log(`===================================================`);
console.log(`🔑 Active Bot Token in Session: [ ${maskedToken} ]`);
console.log(`⚙️ Running Instance Location: Terminal / GitHub Actions`);
console.log(`===================================================`);

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.error(`⚠️ [TOKEN: ${maskedToken}] Conflict Error: অন্য কোথাও এই টোকেন দিয়ে বট চালু আছে!`);
    } else {
        console.error(`[TOKEN: ${maskedToken}] Polling error:`, error.message);
    }
});

const HOST_DIR = path.join(__dirname, 'hosted_projects');
if (!fs.existsSync(HOST_DIR)) fs.mkdirSync(HOST_DIR, { recursive: true });

const projects = new Map();
let nextProjectId = 1;
let currentPort = 3000;

function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
}

// হেল্প ও ব্যবহারের পূর্ণাঙ্গ নির্দেশিকা ٹیکسٹ
function getHelpMessage() {
    return `📘 *Advanced Multi-Project Hosting Guide*\n\n` +
           `*কীভাবে ব্যবহার করবেন?*\n` +
           `১. আপনার ওয়েবসাইটের \`index.html\`, \`style.css\`, \`script.js\` সহ সব ফাইল সিলেক্ট করে একটি **.zip** ফাইল তৈরি করুন।\n` +
           `২. ZIP ফাইলটি এই বটে সেন্ড করুন। বট সাথে সাথেই লাইভ ইউআরএল (Link) তৈরি করে দেবে।\n` +
           `৩. একক HTML ফাইল (যা ভিতরে Inline CSS/JS কন্টেইন করে) পাঠালেও কাজ করবে।\n` +
           `৪. কোনো Telegram Bot-এর \`.js\` ফাইল পাঠালে সেটি ব্যাকগ্রাউন্ডে রান হয়ে যাবে।\n\n` +
           `📌 *সকল কমান্ডের তালিকা (Commands List):*\n` +
           `• /start - বট চালু ও স্বাগতম মেসেজ\n` +
           `• /help - ব্যবহারের গাইডলাইন ও সব কমান্ডের তালিকা\n` +
           `• /list - বর্তমানে চালু থাকা সব প্রজেক্টের লিস্ট ও লিংক\n` +
           `• /stop <ID> - নির্দিষ্ট প্রজেক্ট বন্ধ করা (যেমন: \`/stop 1\`)\n` +
           `• /stop_all - সকল প্রজেক্ট একসাথে বন্ধ ও ক্লিন করা`;
}

console.log("🤖 Multi-Project Hosting Platform Running...");

// /start Command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`📥 [TOKEN: ${maskedToken}] /start command used by User ID: ${chatId}`);

    const welcomeText = 
        `🌐 *Welcome to Multi-Project Hosting Bot!*\n\n` +
        `আপনার ওয়েব প্রজেক্ট (HTML, CSS, JS) বা বট কোড এখানে আপলোড করে সরাসরি লাইভ হোস্ট করতে পারেন।\n\n` +
        `কমান্ডের নির্দেশিকা ও কিভাবে ব্যবহার করবেন তা জানতে নিচের **"📜 সকল কমান্ডের তালিকা ও গাইড"** বাটনে ক্লিক করুন অথবা /help লিখুন।`;

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📜 সকল কমান্ডের তালিকা ও গাইড', callback_data: 'show_help' },
                    { text: '📊 প্রজেক্ট লিস্ট', callback_data: 'show_list' }
                ]
            ]
        }
    };

    bot.sendMessage(chatId, welcomeText, options).catch(console.error);
});

// /help Command
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`📥 [TOKEN: ${maskedToken}] /help command used by User ID: ${chatId}`);
    bot.sendMessage(chatId, getHelpMessage(), { parse_mode: 'Markdown' }).catch(console.error);
});

// Inline Keyboard Button Action
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'show_help') {
        bot.sendMessage(chatId, getHelpMessage(), { parse_mode: 'Markdown' }).catch(console.error);
    } else if (data === 'show_list') {
        sendProjectList(chatId);
    }
    bot.answerCallbackQuery(query.id);
});

// /list Command
bot.onText(/\/list/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`📥 [TOKEN: ${maskedToken}] /list command requested`);
    sendProjectList(chatId);
});

function sendProjectList(chatId) {
    if (projects.size === 0) {
        return bot.sendMessage(chatId, "🔴 বর্তমানে কোনো অ্যাক্টিভ প্রজেক্ট চালু নেই।");
    }

    let response = `📊 *Active Hosted Projects (${projects.size}):*\n\n`;
    projects.forEach((proj, id) => {
        response += `🆔 *ID:* \`${id}\`\n`;
        response += `📁 *Name:* \`${escapeMarkdown(proj.name)}\`\n`;
        response += `📌 *Type:* ${escapeMarkdown(proj.type)}\n`;
        if (proj.url) {
            response += `🌐 *Link:* ${proj.url}\n`;
        }
        response += `❌ *Stop:* /stop_${id}\n`;
        response += `---------------------------\n`;
    });

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' }).catch(console.error);
}

// /stop Command
bot.onText(/\/stop(?:_)?(\d+)?/, (msg, match) => {
    const chatId = msg.chat.id;
    const projId = parseInt(match[1]);

    if (!projId || !projects.has(projId)) {
        return bot.sendMessage(chatId, "⚠️ সঠিক প্রজেক্ট ID দিন। উদাহরণ: `/stop 1` বা তালিকা দেখতে `/list` লিখুন।", { parse_mode: 'Markdown' });
    }

    stopProject(projId);
    console.log(`🗑️ [TOKEN: ${maskedToken}] Project ID ${projId} stopped`);
    bot.sendMessage(chatId, `🗑️ *Project ID ${projId} সফলভাবে বন্ধ করা হয়েছে!*`, { parse_mode: 'Markdown' });
});

// /stop_all Command
bot.onText(/\/stop_all/, (msg) => {
    const chatId = msg.chat.id;
    if (projects.size === 0) {
        return bot.sendMessage(chatId, "⚠️ বন্ধ করার মতো কোনো প্রজেক্ট চালু নেই।");
    }

    projects.forEach((_, id) => stopProject(id));
    console.log(`🗑️ [TOKEN: ${maskedToken}] All projects stopped`);
    bot.sendMessage(chatId, "🗑️ *সকল প্রজেক্ট সফলভাবে বন্ধ করা হয়েছে!*");
});

function stopProject(id) {
    if (projects.has(id)) {
        const proj = projects.get(id);
        if (proj.tunnel) try { proj.tunnel.close(); } catch(e){}
        if (proj.server) try { proj.server.close(); } catch(e){}
        if (proj.process) try { proj.process.kill(); } catch(e){}

        if (fs.existsSync(proj.dir)) {
            fs.rmSync(proj.dir, { recursive: true, force: true });
        }
        projects.delete(id);
    }
}

// File Receiver
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const doc = msg.document;
    const fileName = doc.file_name;
    const ext = path.extname(fileName).toLowerCase();

    if (!['.html', '.js', '.zip'].includes(ext)) {
        return bot.sendMessage(chatId, "❌ শুধুমাত্র `.zip`, `.html`, অথবা `.js` ফাইল আপলোড করতে পারবেন।");
    }

    console.log(`📥 [TOKEN: ${maskedToken}] Receiving file: ${fileName}`);
    bot.sendMessage(chatId, "📥 প্রসেস করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...");

    try {
        const id = nextProjectId++;
        const port = currentPort++;
        const projectDir = path.join(HOST_DIR, `proj_${id}`);
        fs.mkdirSync(projectDir, { recursive: true });

        const fileLink = await bot.getFileLink(doc.file_id);
        const downloadedFilePath = path.join(projectDir, fileName);

        const response = await fetch(fileLink);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(downloadedFilePath, Buffer.from(buffer));

        if (ext === '.zip') {
            const extractPath = path.join(projectDir, 'public');
            fs.createReadStream(downloadedFilePath)
                .pipe(unzipper.Extract({ path: extractPath }))
                .on('close', async () => {
                    let serveDir = extractPath;
                    const items = fs.readdirSync(extractPath);
                    if (items.length === 1 && fs.statSync(path.join(extractPath, items[0])).isDirectory()) {
                        serveDir = path.join(extractPath, items[0]);
                    }
                    startWebHosting(chatId, id, port, serveDir, fileName, 'ZIP Web Project', projectDir);
                });
        } else if (ext === '.html') {
            startWebHosting(chatId, id, port, projectDir, fileName, 'Single HTML Page', projectDir, fileName);
        } else if (ext === '.js') {
            const proc = fork(downloadedFilePath);
            projects.set(id, {
                name: fileName,
                type: 'Node.js Bot Script',
                process: proc,
                dir: projectDir
            });

            const reply = 
                `🤖 *Bot Script Hosted & Running!*\n\n` +
                `🆔 *Project ID:* \`${id}\`\n` +
                `📜 *File Name:* \`${escapeMarkdown(fileName)}\`\n` +
                `📌 *Status:* LIVE\n\n` +
                `❌ *Stop:* /stop_${id}`;

            bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' }).catch(console.error);
        }

    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "⚠️ ফাইল হোস্টিং করার সময় ত্রুটি ঘটেছে।");
    }
});

function startWebHosting(chatId, id, port, targetDir, fileName, typeName, projectDir, defaultFile = 'index.html') {
    const server = http.createServer((req, res) => {
        let reqUrl = req.url === '/' ? defaultFile : req.url;
        let filePath = path.join(targetDir, decodeURIComponent(reqUrl));

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const extName = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon'
            };

            const contentType = mimeTypes[extName] || 'application/octet-stream';
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Bypass-Tunnel-Reminder': 'true'
            });
            res.end(fs.readFileSync(filePath));
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end("404 Page Not Found");
        }
    });

    server.listen(port, async () => {
        try {
            const tunnel = await localtunnel({ port: port });
            projects.set(id, {
                name: fileName,
                type: typeName,
                url: tunnel.url,
                server: server,
                tunnel: tunnel,
                dir: projectDir
            });

            const reply = 
                `🚀 *Website Hosted Successfully!*\n\n` +
                `🆔 *Project ID:* \`${id}\`\n` +
                `📦 *Project:* \`${escapeMarkdown(fileName)}\`\n` +
                `🌐 *Public Live Link:*\n${tunnel.url}\n\n` +
                `📋 *All Projects:* /list\n` +
                `❌ *Stop this project:* /stop_${id}`;

            bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' }).catch(console.error);
        } catch (e) {
            bot.sendMessage(chatId, "❌ লাইভ লিংক তৈরি করতে সমস্যা হয়েছে।");
        }
    });
                     }
