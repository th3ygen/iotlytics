import TelegramBot from "node-telegram-bot-api";
import { updateDevice, type Device, type DeviceRecord } from "./device";
import type { HeartbeatReport } from "./heartbeat";

const timeZone = "Asia/Kuala_Lumpur";
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;

if (!telegramBotToken) {
	console.error(
		new Date(Date.now()).toLocaleString(),
		"Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID in your environment variables."
	);
	process.exit(1);
}

const telegramBot = new TelegramBot(telegramBotToken, { polling: false });

telegramBot.on("polling_error", (error) => {
	console.error(
		new Date(Date.now()).toLocaleString(),
		"Telegram bot polling error:",
		error
	);
});

async function sendAlert(device: Device, image: string) {
	device = device || {
		name: "Unknown Device",
		area: "Unknown Area",
		lon: 1337,
		lat: 1337,
	};

	const datetime = new Date(Date.now()).toLocaleString("en-MY", {
		timeZone,
	});
	const caption = `🐘 ⚠ GajahSafe Alert! ⚠\n\nDevice ID: ${device.id}\n${device.name}\nArea: ${device.area}\nDate time: ${datetime}`;

	console.log(
		new Date(Date.now()).toLocaleString(),
		"Received MQTT message:",
		image?.length || 0
	);

	if (image) {
		const imageBuffer = Buffer.from(image, "base64"); // Decode base64 to buffer
		await telegramBot.sendPhoto(
			device.channelId!,
			imageBuffer,
			{
				caption,
			},
			{
				// <deviceId>@<dateTime>.jpg
				filename: `${device.id}@${new Date().toISOString()}.jpg`,
				contentType: "image/jpeg",
			}
		);
		console.log(
			new Date(Date.now()).toLocaleString(),
			`Image from device ${device.id} sent to Telegram`
		);
	} else {
		console.error(
			new Date(Date.now()).toLocaleString(),
			"Payload missing image data"
		);
	}
}

async function sendDevStatus(devices: DeviceRecord) {
	try {
		// group by channelId
		const devicesByChannel: Record<string, Device[]> = {};

		for (const id in devices) {
			const device = devices[id];

			if (
				!devicesByChannel[device.channelId] ||
				devicesByChannel[device.channelId].length === 0
			) {
				devicesByChannel[device.channelId] = [];
			}

			devicesByChannel[device.channelId].push(device);
		}

		const sendByChannel = async (channelId: string) => {
			const datetime = new Date(Date.now()).toLocaleString("en-MY", {
				timeZone,
			});

			let list = "";
			for (let device of devicesByChannel[channelId]) {
				const status =
					device.status === "online" ? "🟢 Online" : "🔴 pending";

				list += `${device.name} is ${status}\n`;
			}

			// should send list of devices status
			const text = `🐘 GajahSafe Device Status 🧑‍💻\n\n${datetime}\n\n${list}`;

			return telegramBot.sendMessage(channelId, text);
		};

		return Promise.all(
			Object.keys(devicesByChannel).map((channelId) =>
				sendByChannel(channelId)
			)
		);
	} catch (error) {
		console.error(
			new Date(Date.now()).toLocaleString(),
			"Error processing message:",
			error
		);
		throw new Error("Error sending dev status");
	}
}

async function sendAwakeStatus(device: Device) {
	try {
		const datetime = new Date(Date.now()).toLocaleString("en-MY", {
			timeZone,
		});
		// should send list of devices status
		const text = `🐘 GajahSafe Device Status 🧑‍💻\n\n${datetime}\n\n${device.name} just woke up!`;

		await telegramBot.sendMessage(device.channelId, text);
	} catch (error) {
		console.error(
			new Date(Date.now()).toLocaleString(),
			"Error processing message:",
			error
		);
		throw new Error("Failed to send message");
	}
}

const HEARTBEAT_CHANNEL_ID = "-5248562860";

async function sendHeartbeatReport(
	reports: HeartbeatReport[],
	deviceRecord: DeviceRecord
) {
	const datetime = new Date().toLocaleString("en-MY", { timeZone });

	let body = "";
	for (const report of reports) {
		const device = deviceRecord[report.deviceKey];
		const deviceName = device ? device.id : report.deviceKey;

		body += `Device: ${deviceName}\n`;
		body += `24h Handshake Status: ${report.received}/${report.total}\n`;
		if (report.failedHours.length > 0) {
			body += `failed ${report.failedHours.join(", ")}\n`;
		}
		body += "\n";
	}

	const text = `🐘 GajahSafe 24h Heartbeat Report\n\n${datetime}\n\n${body.trimEnd()}`;

	await telegramBot.sendMessage(HEARTBEAT_CHANNEL_ID, text);
}

export { sendAlert, sendDevStatus, sendAwakeStatus, sendHeartbeatReport };
