const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');
const localtunnel = require('localtunnel');
const unzipper = require('unzipper');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN পাওয়া যায়নি! GitHub Secrets চেক করুন।");
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const HOST_DIR = path.join(__dirname, 'hosted_projects');
if (!fs.existsSync(HOST_DIR)) fs.mkdirSync(HOST_DIR, { recursive: true });

// প্রতিটি প্রজেক্টের ডেটা ট্র্যাক করার জন্য Map
const projects = new Map();
let nextProjectId = 1;
let startingPort = 3000;

console.log("🤖 Advanced Multi-Project Hosting Platform Running...");

// Start Command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeText = 
        `🌐 **Advanced Multi-Project Hosting Platform**\n\n` +
        `আমাকে যেকোনো ফাইল পাঠান, আমি প্রতিটি প্রজেক্টের জন্য আলাদা লাইভ URL তৈরি করব:\n\n` +
        `📦 **ZIP ফাইল (.zip):** HTML, CSS, JS সমৃদ্ধ ফুল ওয়েবসাইট প্রজেক্ট।\n` +
        `📄 **HTML ফাইল (.html):** একক পেজ ওয়েবসাইট (Internal CSS/JS সহ)।\n` +
        `📜 **JS ফাইল (.js):** ব্যাকগ্রাউন্ডে টেলিগ্রাম বট চালানোর জন্য।\n\n` +
        `📌 **ম্যানেজমেন্ট কমান্ডসমূহ:**\n` +
        `• /list - অ্যাক্টিভ সব প্রজেক্টের তালিকা ও লিংক\n` +
        `• /stop <ID> - নির্দিষ্ট প্রজেক্ট বন্ধ করা (যেমন: \`/stop 1\`)\n` +
        `• /stop_all - সকল প্রজেক্ট বন্ধ ও রিমুভ করা`;

    bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
});

// List Command
bot.onText(/\/list/, (msg) => {
    const chatId = msg.chat.id;
    if (projects.size === 0) {
        return bot.sendMessage(chatId, "🔴 বর্তমানে কোনো অ্যাক্টিভ প্রজেক্ট চালানো নেই।");
    }

    let response = `📊 **Active Hosted Projects (${projects.size}):**\n\n`;
    projects.forEach((proj, id) => {
        response += `🆔 **ID:** \`${id}\`\n`;
        response += `📁 **Name:** \`${proj.name}\`\n`;
        response += `📌 **Type:** ${proj.type}\n`;
        if (proj.url) {
            response += `🌐 **Link:** ${proj.url}\n`;
        }
        response += `❌ **Stop:** /stop_${id}\n`;
        response += `---------------------------\n`;
    });

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
});

// Stop Specific Project Command
bot.onText(/\/stop(?:_)?(\d+)?/, (msg, match) => {
    const chatId = msg.chat.id;
    const projId = parseInt(match[1]);

    if (!projId || !projects.has(projId)) {
        return bot.sendMessage(chatId, "⚠️ সঠিক প্রজেক্ট ID দিন। উদাহরণ: `/stop 1` বা প্রজেক্ট লিস্ট দেখতে `/list` লিখুন।", { parse_mode: 'Markdown' });
    }

    stopProject(projId);
    bot.sendMessage(chatId, `🗑️ **Project ID ${projId} সফলভাবে বন্ধ ও রিমুভ করা হয়েছে!**`, { parse_mode: 'Markdown' });
});

// Stop All Command
bot.onText(/\/stop_all/, (msg) => {
    const chatId = msg.chat.id;
    if (projects.size === 0) {
        return bot.sendMessage(chatId, "⚠️ বন্ধ করার মতো কোনো অ্যাক্টিভ প্রজেক্ট নেই।");
    }

    projects.forEach((_, id) => stopProject(id));
    bot.sendMessage(chatId, "🗑️ **সকল প্রজেক্ট বন্ধ এবং ফাইলসমূহ সার্ভার থেকে ক্লিন করা হয়েছে!**");
});

function stopProject(id) {
    if (projects.has(id)) {
        const proj = projects.get(id);
        if (proj.tunnel) proj.tunnel.close();
        if (proj.server) proj.server.close();
        if (proj.process) proj.process.kill();

        // প্রজেক্ট ফোল্ডার মুছে ফেলা
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

    bot.sendMessage(chatId, "📥 প্রজেক্ট প্রসেস করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...");

    try {
        const id = nextProjectId++;
        const port = startingPort++;
        const projectDir = path.join(HOST_DIR, `proj_${id}`);
        fs.mkdirSync(projectDir, { recursive: true });

        const fileLink = await bot.getFileLink(doc.file_id);
        const downloadedFilePath = path.join(projectDir, fileName);

        const response = await fetch(fileLink);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(downloadedFilePath, Buffer.from(buffer));

        // ১. ZIP ফাইল প্রসেস (HTML, CSS, JS প্রজেক্ট)
        if (ext === '.zip') {
            const extractPath = path.join(projectDir, 'public');
            fs.createReadStream(downloadedFilePath)
                .pipe(unzipper.Extract({ path: extractPath }))
                .on('close', async () => {
                    let rootDir = extractPath;
                    const files = fs.readdirSync(extractPath);
                    
                    // সাবফোল্ডার ডিরেক্টরি সাপোর্ট
                    if (files.length === 1 && fs.statSync(path.join(extractPath, files[0])).isDirectory()) {
                        rootDir = path.join(extractPath, files[0]);
                    }

                    const server = createStaticServer(rootDir, port);
                    server.listen(port, async () => {
                        try {
                            const tunnel = await localtunnel({ port: port });
                            projects.set(id, {
                                name: fileName,
                                type: 'ZIP Web Project',
                                url: tunnel.url,
                                server: server,
                                tunnel: tunnel,
                                dir: projectDir
                            });

                            sendSuccessMsg(chatId, id, fileName, tunnel.url);
                        } catch (e) {
                            bot.sendMessage(chatId, "❌ লাইভ লিংক তৈরি করতে সমস্যা হয়েছে।");
                        }
                    });
                });
        }

        // ২. একক HTML পেজ প্রসেস (Internal CSS/JS সাপোর্টসহ)
        else if (ext === '.html') {
            const server = createStaticServer(projectDir, port, fileName);
            server.listen(port, async () => {
                try {
                    const tunnel = await localtunnel({ port: port });
                    projects.set(id, {
                        name: fileName,
                        type: 'Single HTML Page',
                        url: tunnel.url,
                        server: server,
                        tunnel: tunnel,
                        dir: projectDir
                    });

                    sendSuccessMsg(chatId, id, fileName, tunnel.url);
                } catch (e) {
                    bot.sendMessage(chatId, "❌ লাইভ লিংক তৈরি করতে সমস্যা হয়েছে।");
                }
            });
        }

        // ৩. Node.js Bot প্রসেস
        else if (ext === '.js') {
            const proc = fork(downloadedFilePath);
            projects.set(id, {
                name: fileName,
                type: 'Node.js Bot',
                process: proc,
                dir: projectDir
            });

            const reply = 
                `🤖 **Bot Script Hosted Successfully!**\n\n` +
                `🆔 **Project ID:** \`${id}\`\n` +
                `📜 **File:** \`${fileName}\`\n` +
                `📌 **Status:** LIVE (Running in Background)\n\n` +
                `❌ **Stop:** /stop_${id}`;

            bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
        }

    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "⚠️ প্রজেক্ট হোস্টিং করতে কোনো ত্রুটি ঘটেছে।");
    }
});

// স্ট্যাটিক ফাইল রেন্ডারিং সার্ভার তৈরি করার ফাংশন
function createStaticServer(baseDir, port, defaultHtml = 'index.html') {
    return http.createServer((req, res) => {
        let reqUrl = req.url === '/' ? defaultHtml : req.url;
        let filePath = path.join(baseDir, decodeURIComponent(reqUrl));

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const extName = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html',
                '.js': 'text/javascript',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon'
            };

            const contentType = mimeTypes[extName] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(fs.readFileSync(filePath));
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end("404 Not Found");
        }
    });
}

function sendSuccessMsg(chatId, id, fileName, url) {
    const reply = 
        `🚀 **Website Hosted Successfully!**\n\n` +
        `🆔 **Project ID:** \`${id}\`\n` +
        `📦 **Project:** \`${fileName}\`\n` +
        `🌐 **Public Live Link:**\n${url}\n\n` +
        `📋 **All Projects:** /list\n` +
        `❌ **Stop this project:** /stop_${id}`;

    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
           }
